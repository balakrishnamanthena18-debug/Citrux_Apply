/**
 * Gate 13 helper: extract → align → readiness so Application Detail has CURRENT intel.
 */
import { config } from "dotenv";
config({ path: ".env" });

const GATE13_JD_V1 = `
Gate13 Golden Job Description V1

REQUIRED:
- TypeScript (REQUIRED skill)
- 5+ years professional software engineering experience
- Bachelor's degree in Computer Science or equivalent experience
- Must be authorized to work in the United States (work authorization)
- Remote-friendly within US timezones

PREFERRED:
- AWS cloud experience preferred
- Kubernetes certification preferred
- Prior experience with operations platforms preferred

UNKNOWN / NEEDS REVIEW:
- Security clearance preferred if available (do not invent)

This JD text is deterministic for Gate 13 verification.
`.trim();

async function drainUntil(
  runId: string,
  providerMode: "valid_requirements" | "valid_alignment" | "default",
  staffUserId: string
) {
  const { prisma } = await import("../src/lib/db/prisma");
  const { MockAIProvider } = await import(
    "../src/lib/application-intelligence/providers/mock-provider"
  );
  const { drainIntelligenceWorker } = await import(
    "../src/lib/application-intelligence/worker"
  );

  for (let i = 0; i < 8; i++) {
    const st = await prisma.applicationIntelligenceRun.findUnique({
      where: { id: runId },
      select: { status: true, requirementSetId: true },
    });
    if (st?.status === "SUCCEEDED") return st;
    if (st?.status === "FAILED") {
      await prisma.applicationIntelligenceRun.update({
        where: { id: runId },
        data: {
          status: "QUEUED",
          attemptCount: 0,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
        },
      });
    }
    await drainIntelligenceWorker({
      provider:
        providerMode === "default"
          ? undefined
          : new MockAIProvider(providerMode),
      actorUserId: staffUserId,
      batchSize: 5,
    });
  }
  return prisma.applicationIntelligenceRun.findUnique({
    where: { id: runId },
    select: { status: true, requirementSetId: true },
  });
}

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const { withRlsContext } = await import("../src/lib/db/rls");
  const { requestJobRequirementExtraction } = await import(
    "../src/lib/application-intelligence/extraction"
  );
  const { requestCandidateJobAlignment } = await import(
    "../src/lib/application-intelligence/alignment"
  );
  const { requestApplicationReadiness } = await import(
    "../src/lib/application-intelligence/readiness"
  );
  const { syncJobDescriptionSnapshotAfterJobWrite } = await import(
    "../src/lib/application-intelligence/requirement-set"
  );

  const appId = process.argv[2] ?? "eb211138-bbdf-4930-88d3-89284c2d3e73";
  const fingerprint = `gate13-browser:${Date.now()}`;

  try {
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: appId },
      select: {
        id: true,
        organizationId: true,
        candidateId: true,
        jobId: true,
        status: true,
      },
    });

    const staff = await prisma.membership.findFirstOrThrow({
      where: {
        organizationId: app.organizationId,
        status: "ACTIVE",
        role: { in: ["ADMIN", "EMPLOYEE"] },
      },
      select: { userId: true },
    });

    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { id: app.candidateId },
      select: {
        id: true,
        updatedAt: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    console.log(
      JSON.stringify({
        applicationId: app.id,
        status: app.status,
        candidateEmail: candidate.user.email,
        candidateName: `${candidate.user.firstName} ${candidate.user.lastName}`,
      })
    );

    const job = await prisma.job.update({
      where: { id: app.jobId },
      data: { jobDescription: GATE13_JD_V1 },
      select: {
        id: true,
        organizationId: true,
        jobDescription: true,
        externalUrl: true,
        source: true,
        updatedAt: true,
      },
    });

    const extractReq = await withRlsContext(staff.userId, async (tx) => {
      await syncJobDescriptionSnapshotAfterJobWrite(tx, job, staff.userId);
      return requestJobRequirementExtraction(tx, {
        organizationId: app.organizationId,
        jobId: job.id,
        requestedById: staff.userId,
        provider: "mock",
        model: "mock-model",
      });
    });
    console.log("extractReq", extractReq);

    let currentSet = await prisma.jobRequirementSet.findFirst({
      where: {
        jobId: job.id,
        snapshotId: extractReq.snapshotId,
        freshness: "CURRENT",
      },
      select: { id: true },
    });

    if (!currentSet) {
      await prisma.applicationIntelligenceRun.update({
        where: { id: extractReq.runId },
        data: {
          status: "QUEUED",
          attemptCount: 0,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          startedAt: null,
          validationStatus: "PENDING",
          requirementSetId: null,
        },
      });
      await drainUntil(extractReq.runId, "valid_requirements", staff.userId);
      currentSet = await prisma.jobRequirementSet.findFirst({
        where: {
          jobId: job.id,
          snapshotId: extractReq.snapshotId,
          freshness: "CURRENT",
        },
        select: { id: true },
      });
    }

    if (!currentSet) {
      throw new Error(
        `No CURRENT JobRequirementSet for snapshot ${extractReq.snapshotId}`
      );
    }
    console.log("requirementSet", currentSet);

    const alignReq = await withRlsContext(staff.userId, async (tx) =>
      requestCandidateJobAlignment(tx, {
        organizationId: app.organizationId,
        candidateId: candidate.id,
        applicationId: app.id,
        jobId: app.jobId,
        requestedById: staff.userId,
        candidateUpdatedAt: candidate.updatedAt,
        materialsFingerprint: fingerprint,
      })
    );
    console.log("alignReq", alignReq);
    if (alignReq.status !== "SUCCEEDED") {
      await drainUntil(alignReq.runId, "valid_alignment", staff.userId);
    }

    const readyReq = await withRlsContext(staff.userId, async (tx) =>
      requestApplicationReadiness(tx, {
        organizationId: app.organizationId,
        candidateId: candidate.id,
        applicationId: app.id,
        jobId: app.jobId,
        requestedById: staff.userId,
        candidateUpdatedAt: candidate.updatedAt,
        materialsFingerprint: fingerprint,
      })
    );
    console.log("readyReq", readyReq);
    if (readyReq.status !== "SUCCEEDED") {
      await drainUntil(readyReq.runId, "default", staff.userId);
    }

    const align = await prisma.applicationAlignmentResult.findFirst({
      where: { applicationId: app.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, freshness: true, overallScore: true },
    });
    const ready = await prisma.applicationReadinessResult.findFirst({
      where: { applicationId: app.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, freshness: true, readinessState: true },
    });

    console.log(JSON.stringify({ align, ready }, null, 2));
    if (align?.freshness !== "CURRENT" || ready?.freshness !== "CURRENT") {
      process.exit(2);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
