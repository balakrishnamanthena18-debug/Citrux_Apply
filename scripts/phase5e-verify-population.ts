/**
 * Phase 5E — live DB verification of initial match population.
 * Uses producer helpers (same as production actions). Does not call matching.v1.
 *
 * Safe: creates a temporary GLOBAL job, populates for Alex if ACTIVE, then closes job.
 */
import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";

const ALEX = "0a9adcc6-d29d-4133-aae7-189563341b54";
const ORG = "00000000-0000-0000-0000-000000000001";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db/prisma");
  const { populateJobMatchWorkForJob } = await import(
    "../src/lib/job-matching/population"
  );
  const { drainJobMatchWorker } = await import("../src/lib/job-matching/worker");

  const alex = await prisma.candidate.findUnique({
    where: { id: ALEX },
    select: { id: true, status: true, organizationId: true },
  });
  if (!alex || alex.organizationId !== ORG) {
    console.error("Alex candidate missing");
    process.exit(1);
  }

  // Ensure ACTIVE for GLOBAL eligibility (restore later if changed)
  const priorStatus = alex.status;
  if (alex.status !== "ACTIVE") {
    await prisma.candidate.update({
      where: { id: ALEX },
      data: { status: "ACTIVE" },
    });
  }

  const creator = await prisma.user.findFirst({
    where: { memberships: { some: { organizationId: ORG } } },
    select: { id: true },
  });
  if (!creator) {
    console.error("No org user for job.createdById");
    process.exit(1);
  }

  const jobId = randomUUID();
  const t0 = Date.now();
  await prisma.job.create({
    data: {
      id: jobId,
      organizationId: ORG,
      title: "Phase5E Population Probe",
      companyName: "OOS Audit",
      jobDescription: "Temporary job for Phase 5E population verification.",
      location: "Remote",
      isRemote: true,
      employmentType: "FULL_TIME",
      status: "OPEN",
      visibility: "GLOBAL",
      ownerCandidateId: null,
      createdById: creator.id,
    },
  });

  const pop = await prisma.$transaction(async (tx) =>
    populateJobMatchWorkForJob(tx, {
      organizationId: ORG,
      jobId,
      reason: "GLOBAL_JOB_CREATED",
    })
  );
  const populateMs = Date.now() - t0;

  const match = await prisma.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: ORG,
        candidateId: ALEX,
        jobId,
      },
    },
    select: {
      id: true,
      status: true,
      freshness: true,
      savedAt: true,
      dismissedAt: true,
      category: true,
    },
  });

  // Idempotent second population (no new rows; filter returns zero unmatched)
  const countBefore = await prisma.candidateJobMatch.count({ where: { jobId } });
  const pop2 = await prisma.$transaction(async (tx) =>
    populateJobMatchWorkForJob(tx, {
      organizationId: ORG,
      jobId,
      reason: "GLOBAL_JOB_CREATED",
    })
  );
  const countAfter = await prisma.candidateJobMatch.count({ where: { jobId } });

  // Private job isolation
  const otherCand = await prisma.candidate.findFirst({
    where: {
      organizationId: ORG,
      id: { not: ALEX },
      status: { not: "ARCHIVED" },
    },
    select: { id: true },
  });
  const privateJobId = randomUUID();
  await prisma.job.create({
    data: {
      id: privateJobId,
      organizationId: ORG,
      title: "Phase5E Private Probe",
      companyName: "OOS Audit",
      jobDescription: "Private lead probe.",
      isRemote: true,
      employmentType: "FULL_TIME",
      status: "OPEN",
      visibility: "CANDIDATE_PRIVATE",
      ownerCandidateId: ALEX,
      createdById: creator.id,
    },
  });
  await prisma.$transaction(async (tx) =>
    populateJobMatchWorkForJob(tx, {
      organizationId: ORG,
      jobId: privateJobId,
      reason: "PRIVATE_JOB_CREATED",
    })
  );
  const privateOwner = await prisma.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: ORG,
        candidateId: ALEX,
        jobId: privateJobId,
      },
    },
    select: { id: true },
  });
  let privateOther: { id: string } | null = null;
  if (otherCand) {
    privateOther = await prisma.candidateJobMatch.findUnique({
      where: {
        organizationId_candidateId_jobId: {
          organizationId: ORG,
          candidateId: otherCand.id,
          jobId: privateJobId,
        },
      },
      select: { id: true },
    });
  }

  // Cross-tenant: fake org populate should not create for Alex against org job
  // (job is org-scoped; populate with wrong org returns 0)
  const cross = await prisma.$transaction(async (tx) =>
    populateJobMatchWorkForJob(tx, {
      organizationId: "00000000-0000-4000-8000-0000000000aa",
      jobId,
      reason: "GLOBAL_JOB_CREATED",
    })
  );

  const drain = await drainJobMatchWorker(10);
  const afterDrain = await prisma.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: ORG,
        candidateId: ALEX,
        jobId,
      },
    },
    select: { id: true, status: true, freshness: true, category: true },
  });

  // Cleanup: remove probe matches; archive probe jobs (avoid FK fights with snapshots).
  await prisma.candidateJobMatch.deleteMany({
    where: { jobId: { in: [jobId, privateJobId] } },
  });
  await prisma.job.updateMany({
    where: { id: { in: [jobId, privateJobId] } },
    data: { status: "ARCHIVED" },
  });
  if (priorStatus !== "ACTIVE") {
    await prisma.candidate.update({
      where: { id: ALEX },
      data: { status: priorStatus },
    });
  }

  const report = {
    scenarioA_alexMatchQueuedOrSucceeded:
      match != null &&
      (match.status === "QUEUED" || match.status === "SUCCEEDED"),
    scenarioA_noCategoryBeforeEval: match?.category == null || afterDrain != null,
    scenarioIdempotent:
      pop2.enqueued === 0 && countBefore === countAfter && countBefore >= 1,
    scenarioPrivateOwner: privateOwner != null,
    scenarioPrivateOtherDenied: otherCand == null || privateOther == null,
    scenarioCrossTenantNoop: cross.enqueued === 0,
    sameMatchIdAfterDrain:
      afterDrain == null || afterDrain.id === match?.id,
    populateMs,
    pop,
    drain,
    afterDrainStatus: afterDrain?.status ?? null,
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.scenarioA_alexMatchQueuedOrSucceeded &&
    report.scenarioIdempotent &&
    report.scenarioPrivateOwner &&
    report.scenarioPrivateOtherDenied &&
    report.scenarioCrossTenantNoop;

  if (!ok) {
    console.error("PHASE 5E live verification FAILED");
    process.exit(1);
  }
  console.log("PHASE 5E live verification PASSED");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
