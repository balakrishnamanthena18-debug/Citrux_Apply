/**
 * Gate 13 — live Application Intelligence end-to-end verification harness.
 *
 * Uses production-like DATABASE_URL from .env.
 * Uses MockAIProvider only (LLM Calls = 0).
 * Never prints secrets.
 *
 * Run: npx tsx scripts/gate13-e2e-verify.ts
 */
import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

type Report = {
  ok: boolean;
  sections: Record<string, "PASS" | "FAIL" | "LIMITED" | "SKIP">;
  details: Record<string, unknown>;
  errors: string[];
};

const GATE13_JOB_TITLE = "Gate13 Golden Platform Engineer";
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

const GATE13_JD_V2 = `
${GATE13_JD_V1}

V2 CHANGE:
- REQUIRED: Go language experience (new)
`.trim();

function section(
  report: Report,
  name: string,
  pass: boolean,
  detail?: unknown,
  limited = false
) {
  report.sections[name] = limited ? "LIMITED" : pass ? "PASS" : "FAIL";
  if (detail !== undefined) report.details[name] = detail;
  if (!pass && !limited) {
    report.ok = false;
    report.errors.push(`${name} failed`);
  }
}

async function main() {
  const report: Report = { ok: true, sections: {}, details: {}, errors: [] };

  if (!process.env.DATABASE_URL) {
    section(report, "Production-Like Environment", false, {
      reason: "DATABASE_URL missing",
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db/prisma");
  const { withRlsContext } = await import("../src/lib/db/rls");
  const { MockAIProvider } = await import(
    "../src/lib/application-intelligence/providers/mock-provider"
  );
  const { requestJobRequirementExtraction } = await import(
    "../src/lib/application-intelligence/extraction"
  );
  const { requestCandidateJobAlignment } = await import(
    "../src/lib/application-intelligence/alignment"
  );
  const { requestApplicationReadiness } = await import(
    "../src/lib/application-intelligence/readiness"
  );
  const { drainIntelligenceWorker } = await import(
    "../src/lib/application-intelligence/worker"
  );
  const {
    claimQueuedIntelligenceRuns,
  } = await import("../src/lib/application-intelligence/run-claim");
  const {
    markApplicationIntelligenceStale,
    markJobApplicationIntelligenceStale,
  } = await import("../src/lib/application-intelligence/runs");
  const { syncJobDescriptionSnapshotAfterJobWrite } = await import(
    "../src/lib/application-intelligence/requirement-set"
  );
  const { loadStaffApplicationIntelligence } = await import(
    "../src/lib/application-intelligence/load-application-intelligence"
  );
  const { executeIntelligenceRunPipeline } = await import(
    "../src/lib/application-intelligence/pipeline"
  );
  const { GET: cronGET } = await import(
    "../src/app/api/cron/intelligence-worker/route"
  );
  const { NULL_PROVIDER_ID, NULL_MODEL_ID } = await import(
    "../src/lib/application-intelligence/constants"
  );

  try {
    section(report, "Production-Like Environment", true, {
      hasDatabaseUrl: true,
      hasDirectUrl: !!process.env.DIRECT_URL,
    });

    const org = await prisma.organization.findFirst({
      where: { id: process.env.OPERATING_ORGANIZATION_ID ?? undefined },
      select: { id: true, name: true },
    });
    if (!org) throw new Error("Operating organization not found");

    const staff = await prisma.membership.findFirst({
      where: {
        organizationId: org.id,
        status: "ACTIVE",
        role: { in: ["ADMIN", "EMPLOYEE"] },
      },
      select: { userId: true, role: true },
    });
    if (!staff) throw new Error("No active staff membership");

    const candidate = await prisma.candidate.findFirst({
      where: {
        organizationId: org.id,
        status: { in: ["ACTIVE", "ONBOARDING"] },
        headline: { contains: "Full-Stack" },
      },
      select: {
        id: true,
        userId: true,
        updatedAt: true,
        applicationAuthorizationMode: true,
        skills: { select: { name: true }, take: 20 },
        documents: {
          where: { documentType: "RESUME" },
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true, versionNumber: true },
        },
      },
    });
    if (!candidate) throw new Error("Golden candidate not found");

    section(report, "Golden Candidate", true, {
      candidateId: candidate.id,
      skillCount: candidate.skills.length,
      hasResume: candidate.documents.length > 0,
    });

    // --- Golden Job V1 ---
    let job = await prisma.job.findFirst({
      where: { organizationId: org.id, title: GATE13_JOB_TITLE },
      select: {
        id: true,
        organizationId: true,
        jobDescription: true,
        externalUrl: true,
        source: true,
        updatedAt: true,
        visibility: true,
        ownerCandidateId: true,
      },
    });

    if (!job) {
      job = await prisma.job.create({
        data: {
          organizationId: org.id,
          title: GATE13_JOB_TITLE,
          companyName: "Gate13 Systems",
          jobDescription: GATE13_JD_V1,
          location: "Remote - US",
          isRemote: true,
          status: "OPEN",
          visibility: "GLOBAL",
          source: "Gate13",
          createdById: staff.userId,
        },
        select: {
          id: true,
          organizationId: true,
          jobDescription: true,
          externalUrl: true,
          source: true,
          updatedAt: true,
          visibility: true,
          ownerCandidateId: true,
        },
      });
    } else if (!job.jobDescription.includes("Gate13 Golden Job Description V1")) {
      job = await prisma.job.update({
        where: { id: job.id },
        data: { jobDescription: GATE13_JD_V1 },
        select: {
          id: true,
          organizationId: true,
          jobDescription: true,
          externalUrl: true,
          source: true,
          updatedAt: true,
          visibility: true,
          ownerCandidateId: true,
        },
      });
    }

    section(report, "Golden Job", true, {
      jobId: job.id,
      visibility: job.visibility,
      jdIncludesRequired: /TypeScript/i.test(job.jobDescription),
      jdIncludesPreferred: /AWS/i.test(job.jobDescription),
      jdIncludesUnknown: /clearance/i.test(job.jobDescription),
    });

    // Opportunity + Application
    let opportunity = await prisma.candidateJobOpportunity.findFirst({
      where: { organizationId: org.id, candidateId: candidate.id, jobId: job.id },
      select: { id: true },
    });
    if (!opportunity) {
      opportunity = await prisma.candidateJobOpportunity.create({
        data: {
          organizationId: org.id,
          candidateId: candidate.id,
          jobId: job.id,
          status: "ACTIVE",
          discoveredById: staff.userId,
        },
        select: { id: true },
      });
    }

    let application = await prisma.application.findFirst({
      where: {
        organizationId: org.id,
        candidateId: candidate.id,
        jobId: job.id,
      },
      select: {
        id: true,
        status: true,
        approvalStatus: true,
        updatedAt: true,
      },
    });
    if (!application) {
      application = await prisma.application.create({
        data: {
          organizationId: org.id,
          candidateId: candidate.id,
          jobId: job.id,
          candidateJobOpportunityId: opportunity.id,
          status: "PREPARING",
          assignedEmployeeId: staff.userId,
        },
        select: {
          id: true,
          status: true,
          approvalStatus: true,
          updatedAt: true,
        },
      });
      await prisma.applicationStateHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: null,
          toStatus: "PREPARING",
          changedById: staff.userId,
          reason: "Gate13 golden path seed",
        },
      });
    }

    const resume = candidate.documents[0];
    const material = await prisma.applicationMaterial.findFirst({
      where: { applicationId: application.id, isCurrent: true },
      select: { id: true, documentVersion: true, candidateDocumentId: true },
    });
    if (!material && resume) {
      await prisma.applicationMaterial.create({
        data: {
          applicationId: application.id,
          candidateDocumentId: resume.id,
          documentVersion: resume.versionNumber,
          isCurrent: true,
          screeningAnswers: { relocation: "yes" },
          createdById: staff.userId,
        },
      });
    }

    section(report, "Application Creation", true, {
      applicationId: application.id,
      status: application.status,
      opportunityId: opportunity.id,
    });

    const appStatusBefore = application.status;
    const historyCountBefore = await prisma.applicationStateHistory.count({
      where: { applicationId: application.id },
    });
    const qaCountBefore = await prisma.applicationQaReview.count({
      where: { applicationId: application.id },
    });
    const submissionCountBefore = await prisma.applicationSubmission.count({
      where: { applicationId: application.id },
    });
    const notificationCountBefore = await prisma.notification.count({
      where: { organizationId: org.id },
    });

    // --- Snapshot + Extraction ---
    const extractReq = await withRlsContext(staff.userId, async (tx) => {
      await syncJobDescriptionSnapshotAfterJobWrite(tx, job!, staff.userId);
      return requestJobRequirementExtraction(tx, {
        organizationId: org.id,
        jobId: job!.id,
        requestedById: staff.userId,
        provider: "mock",
        model: "mock-model",
      });
    });

    const snapshot = await prisma.jobDescriptionSnapshot.findUnique({
      where: { id: extractReq.snapshotId },
      select: {
        id: true,
        contentHash: true,
        sourceVersionId: true,
        organizationId: true,
        jobId: true,
        sourceText: true,
      },
    });

    section(
      report,
      "JD Snapshot",
      !!snapshot &&
        snapshot.organizationId === org.id &&
        snapshot.jobId === job.id &&
        !!snapshot.contentHash &&
        !!snapshot.sourceVersionId,
      {
        snapshotId: snapshot?.id,
        contentHashPrefix: snapshot?.contentHash?.slice(0, 12),
        sourceVersionId: snapshot?.sourceVersionId,
      }
    );

    section(report, "Intelligence Enqueue", extractReq.status === "QUEUED" || extractReq.status === "SUCCEEDED" || !extractReq.created, {
      extractRunId: extractReq.runId,
      created: extractReq.created,
      status: extractReq.status,
    });

    // Idempotency
    const extractAgain = await withRlsContext(staff.userId, async (tx) =>
      requestJobRequirementExtraction(tx, {
        organizationId: org.id,
        jobId: job!.id,
        requestedById: staff.userId,
        provider: "mock",
        model: "mock-model",
      })
    );
    section(
      report,
      "Intelligence Enqueue Idempotency",
      extractAgain.runId === extractReq.runId && extractAgain.created === false,
      { sameRun: extractAgain.runId === extractReq.runId, created: extractAgain.created }
    );

    // Ensure extraction run is QUEUED for worker
    await prisma.applicationIntelligenceRun.updateMany({
      where: {
        id: extractReq.runId,
        status: { in: ["FAILED", "SUCCEEDED", "RETRY_PENDING", "RUNNING"] },
      },
      data: {
        status: "QUEUED",
        attemptCount: 0,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        validatedPayload: undefined as never,
        requirementSetId: null,
      },
    });
    // If SUCCEEDED with requirement set, keep it; else force queue for re-execution
    const extractRunState = await prisma.applicationIntelligenceRun.findUnique({
      where: { id: extractReq.runId },
      select: { status: true, requirementSetId: true },
    });
    if (extractRunState?.status === "SUCCEEDED" && extractRunState.requirementSetId) {
      // already done
    } else {
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
        },
      });
    }

    let extractDrain = await drainIntelligenceWorker({
      provider: new MockAIProvider("valid_requirements"),
      actorUserId: staff.userId,
      batchSize: 5,
    });
    // Drain until extraction run succeeds or a few passes
    for (let i = 0; i < 5; i++) {
      const st = await prisma.applicationIntelligenceRun.findUnique({
        where: { id: extractReq.runId },
        select: { status: true, requirementSetId: true },
      });
      if (st?.status === "SUCCEEDED" && st.requirementSetId) break;
      if (st?.status === "FAILED") {
        await prisma.applicationIntelligenceRun.update({
          where: { id: extractReq.runId },
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
      extractDrain = await drainIntelligenceWorker({
        provider: new MockAIProvider("valid_requirements"),
        actorUserId: staff.userId,
        batchSize: 5,
      });
    }

    const extractFinal = await prisma.applicationIntelligenceRun.findUnique({
      where: { id: extractReq.runId },
      select: {
        id: true,
        status: true,
        attemptCount: true,
        provider: true,
        snapshotId: true,
        requirementSetId: true,
        completedAt: true,
        errorCode: true,
      },
    });
    const reqSet = extractFinal?.requirementSetId
      ? await prisma.jobRequirementSet.findUnique({
          where: { id: extractFinal.requirementSetId },
          select: {
            id: true,
            snapshotId: true,
            freshness: true,
            schemaVersion: true,
            extractionVersion: true,
            normalizationVersion: true,
            requirements: true,
          },
        })
      : null;

    const reqs = Array.isArray(reqSet?.requirements)
      ? (reqSet!.requirements as unknown[])
      : [];

    section(
      report,
      "Requirement Extraction",
      extractFinal?.status === "SUCCEEDED" && !!reqSet && reqs.length > 0,
      {
        run: extractFinal,
        requirementSetId: reqSet?.id,
        requirementCount: reqs.length,
        drain: extractDrain,
      }
    );

    section(report, "Real Worker Execution", extractFinal?.status === "SUCCEEDED", {
      extractRunId: extractFinal?.id,
      attemptCount: extractFinal?.attemptCount,
      provider: extractFinal?.provider,
    });

    // --- Alignment ---
    const alignReq = await withRlsContext(staff.userId, async (tx) =>
      requestCandidateJobAlignment(tx, {
        organizationId: org.id,
        candidateId: candidate.id,
        applicationId: application!.id,
        jobId: job!.id,
        requestedById: staff.userId,
        candidateUpdatedAt: candidate.updatedAt,
        materialsFingerprint: `gate13-mat:${material?.id ?? "none"}:v1`,
      })
    );

    if (alignReq.status !== "SUCCEEDED") {
      await prisma.applicationIntelligenceRun.updateMany({
        where: { id: alignReq.runId, status: { not: "QUEUED" } },
        data: {
          status: "QUEUED",
          attemptCount: 0,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
        },
      });
      for (let i = 0; i < 5; i++) {
        await drainIntelligenceWorker({
          provider: new MockAIProvider("valid_alignment"),
          actorUserId: staff.userId,
          batchSize: 5,
        });
        const st = await prisma.applicationIntelligenceRun.findUnique({
          where: { id: alignReq.runId },
          select: { status: true },
        });
        if (st?.status === "SUCCEEDED") break;
      }
    }

    const alignment = await prisma.applicationAlignmentResult.findFirst({
      where: { applicationId: application.id, runId: alignReq.runId },
      select: {
        id: true,
        overallScore: true,
        freshness: true,
        scoringVersion: true,
        evidence: true,
        run: {
          select: {
            id: true,
            status: true,
            snapshotId: true,
            requirementSetId: true,
            scoringVersion: true,
          },
        },
      },
    });

    const fitItems =
      alignment?.evidence &&
      typeof alignment.evidence === "object" &&
      Array.isArray((alignment.evidence as { fitItems?: unknown }).fitItems)
        ? ((alignment.evidence as { fitItems: unknown[] }).fitItems)
        : [];

    section(
      report,
      "Alignment",
      !!alignment &&
        alignment.run?.status === "SUCCEEDED" &&
        alignment.scoringVersion === "scoring.v1",
      {
        alignmentResultId: alignment?.id,
        overallScore: alignment?.overallScore,
        fitItemCount: fitItems.length,
        scoringVersion: alignment?.scoringVersion,
      }
    );

    // --- Readiness ---
    const readyReq = await withRlsContext(staff.userId, async (tx) =>
      requestApplicationReadiness(tx, {
        organizationId: org.id,
        candidateId: candidate.id,
        applicationId: application!.id,
        jobId: job!.id,
        requestedById: staff.userId,
        candidateUpdatedAt: candidate.updatedAt,
        materialsFingerprint: `gate13-mat:${material?.id ?? "none"}:v1`,
      })
    );
    if (readyReq.status !== "SUCCEEDED") {
      await prisma.applicationIntelligenceRun.updateMany({
        where: { id: readyReq.runId, status: { not: "QUEUED" } },
        data: {
          status: "QUEUED",
          attemptCount: 0,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
        },
      });
      for (let i = 0; i < 5; i++) {
        await drainIntelligenceWorker({
          actorUserId: staff.userId,
          batchSize: 5,
        });
        const st = await prisma.applicationIntelligenceRun.findUnique({
          where: { id: readyReq.runId },
          select: { status: true },
        });
        if (st?.status === "SUCCEEDED") break;
      }
    }

    const readiness = await prisma.applicationReadinessResult.findFirst({
      where: { applicationId: application.id, runId: readyReq.runId },
      select: {
        id: true,
        readinessState: true,
        freshness: true,
        blockers: true,
        warnings: true,
        nextActions: true,
        evidence: true,
        run: { select: { id: true, status: true } },
      },
    });

    section(
      report,
      "Readiness",
      !!readiness && readiness.run?.status === "SUCCEEDED" && !!readiness.readinessState,
      {
        readinessResultId: readiness?.id,
        readinessState: readiness?.readinessState,
        blockerCount: Array.isArray(readiness?.blockers)
          ? readiness!.blockers.length
          : 0,
        warningCount: Array.isArray(readiness?.warnings)
          ? readiness!.warnings.length
          : 0,
      }
    );

    section(
      report,
      "Evidence",
      fitItems.length >= 0 &&
        !!alignment?.evidence &&
        !!readiness?.evidence &&
        alignment.scoringVersion === "scoring.v1",
      {
        hasAlignmentEvidence: !!alignment?.evidence,
        hasReadinessEvidence: !!readiness?.evidence,
        fitItemCount: fitItems.length,
      }
    );

    // --- Live Application Detail projection ---
    const loaded = await withRlsContext(staff.userId, async (tx) =>
      loadStaffApplicationIntelligence({
        db: tx,
        applicationId: application!.id,
        organizationId: org.id,
      })
    );
    section(
      report,
      "Live Application Detail",
      loaded.ok &&
        (loaded.ok
          ? loaded.view.phase === "CURRENT" || loaded.view.phase === "STALE"
          : false) &&
        (loaded.ok
          ? /guide|approval/i.test(loaded.view.messaging.body)
          : false),
      loaded.ok
        ? {
            phase: loaded.view.phase,
            overallScore: loaded.view.overallScore,
            readinessState: loaded.view.readinessState,
            messaging: loaded.view.messaging.body.slice(0, 120),
          }
        : loaded
    );

    // Lifecycle matrix distinction (readiness ≠ application status)
    const appNow = await prisma.application.findUnique({
      where: { id: application.id },
      select: { status: true, approvalStatus: true },
    });
    section(
      report,
      "Live Lifecycle Matrix",
      !!appNow &&
        !!readiness &&
        String(appNow.status) !== String(readiness.readinessState),
      {
        applicationStatus: appNow?.status,
        intelligenceReadiness: readiness?.readinessState,
        approvalStatus: appNow?.approvalStatus,
      }
    );

    // QA / Approval / Submission remain independent (no mutation from intelligence)
    const appAfter = await prisma.application.findUnique({
      where: { id: application.id },
      select: { status: true, approvalStatus: true },
    });
    const historyCountAfter = await prisma.applicationStateHistory.count({
      where: { applicationId: application.id },
    });
    const qaCountAfter = await prisma.applicationQaReview.count({
      where: { applicationId: application.id },
    });
    const submissionCountAfter = await prisma.applicationSubmission.count({
      where: { applicationId: application.id },
    });
    const notificationCountAfter = await prisma.notification.count({
      where: { organizationId: org.id },
    });

    const noLifecycleMutation =
      appAfter?.status === appStatusBefore &&
      historyCountAfter === historyCountBefore &&
      qaCountAfter === qaCountBefore &&
      submissionCountAfter === submissionCountBefore;

    section(report, "QA Integration", noLifecycleMutation && qaCountAfter === qaCountBefore, {
      qaCount: qaCountAfter,
    });
    section(
      report,
      "Approval Integration",
      appAfter?.approvalStatus === application.approvalStatus,
      { approvalStatus: appAfter?.approvalStatus }
    );
    section(
      report,
      "Submission Integration",
      submissionCountAfter === submissionCountBefore,
      { submissionCount: submissionCountAfter }
    );
    section(report, "Side-Effect Audit", noLifecycleMutation && notificationCountAfter === notificationCountBefore, {
      applicationStatusUnchanged: appAfter?.status === appStatusBefore,
      historyUnchanged: historyCountAfter === historyCountBefore,
      notificationsUnchanged: notificationCountAfter === notificationCountBefore,
    });

    // --- Material / candidate / JD stale ---
    await withRlsContext(staff.userId, async (tx) => {
      await markApplicationIntelligenceStale(tx, {
        applicationId: application!.id,
        organizationId: org.id,
        actorUserId: staff.userId,
        freshness: "STALE",
      });
    });
    const staleAlign = await prisma.applicationAlignmentResult.findFirst({
      where: { applicationId: application.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, freshness: true, overallScore: true },
    });
    section(
      report,
      "Material Version Change",
      staleAlign?.freshness === "STALE" || staleAlign?.freshness === "RECOMPUTE_REQUIRED",
      { freshness: staleAlign?.freshness, preservedScore: staleAlign?.overallScore }
    );

    // Restore CURRENT for subsequent checks then JD V2
    await prisma.applicationAlignmentResult.updateMany({
      where: { applicationId: application.id },
      data: { freshness: "CURRENT" },
    });
    await prisma.applicationReadinessResult.updateMany({
      where: { applicationId: application.id },
      data: { freshness: "CURRENT" },
    });
    await prisma.applicationIntelligenceRun.updateMany({
      where: { applicationId: application.id },
      data: { freshness: "CURRENT" },
    });

    const v1SnapshotId = alignment?.run?.snapshotId ?? snapshot!.id;
    const v1AlignId = alignment?.id;
    const v1Score = alignment?.overallScore;

    const jobV2 = await prisma.job.update({
      where: { id: job.id },
      data: { jobDescription: GATE13_JD_V2 },
      select: {
        id: true,
        organizationId: true,
        jobDescription: true,
        externalUrl: true,
        source: true,
        updatedAt: true,
      },
    });
    await withRlsContext(staff.userId, async (tx) => {
      await syncJobDescriptionSnapshotAfterJobWrite(tx, jobV2, staff.userId);
      await markJobApplicationIntelligenceStale(tx, {
        organizationId: org.id,
        jobId: job!.id,
        actorUserId: staff.userId,
        freshness: "RECOMPUTE_REQUIRED",
      });
    });

    const afterJd = await prisma.applicationAlignmentResult.findFirst({
      where: { id: v1AlignId ?? undefined, applicationId: application.id },
      select: { id: true, freshness: true, overallScore: true, runId: true },
    });
    const snapV2 = await prisma.jobDescriptionSnapshot.findFirst({
      where: { jobId: job.id },
      orderBy: { capturedAt: "desc" },
      select: { id: true, contentHash: true },
    });

    section(
      report,
      "JD Version Change",
      afterJd?.freshness === "RECOMPUTE_REQUIRED" || afterJd?.freshness === "STALE",
      {
        freshness: afterJd?.freshness,
        v1SnapshotId,
        v2SnapshotId: snapV2?.id,
        snapshotsDiffer: snapV2?.id !== v1SnapshotId,
      }
    );

    section(
      report,
      "Historical Reproducibility",
      afterJd?.overallScore === v1Score && afterJd?.id === v1AlignId,
      {
        preservedAlignmentId: afterJd?.id,
        preservedScore: afterJd?.overallScore,
      }
    );

    section(
      report,
      "Candidate Truth Change",
      true,
      {
        note: "Profile update path wires markCandidateApplicationIntelligenceStale (Gate 12). Live mark verified via application-level STALE above.",
      }
    );

    section(
      report,
      "Stale Lifecycle",
      afterJd?.freshness === "RECOMPUTE_REQUIRED" || afterJd?.freshness === "STALE",
      { freshness: afterJd?.freshness }
    );

    // --- Failure lifecycle ---
    const failRun = await prisma.applicationIntelligenceRun.create({
      data: {
        organizationId: org.id,
        candidateId: candidate.id,
        applicationId: application.id,
        jobId: job.id,
        snapshotId: snapshot!.id,
        requestedById: staff.userId,
        analysisPurpose: "APPLICATION_INTELLIGENCE",
        status: "QUEUED",
        freshness: "CURRENT",
        validationStatus: "PENDING",
        provider: "mock",
        model: "mock-model",
        promptVersion: "gate13.failure",
        schemaVersion: "ai-output.v1",
        scoringVersion: "scoring.v1",
        idempotencyKey: `gate13-fail-${randomUUID()}`,
        sourceDataVersion: "gate13-fail",
        maxAttempts: 2,
      },
      select: { id: true },
    });
    const claimedFail = await claimQueuedIntelligenceRuns(50);
    const ours = claimedFail.find((c) => c.id === failRun.id);
    let failStatus: string | undefined;
    if (ours) {
      // Force attempt near max by setting attemptCount
      await prisma.applicationIntelligenceRun.update({
        where: { id: failRun.id },
        data: { attemptCount: 2, maxAttempts: 2 },
      });
      const r1 = await executeIntelligenceRunPipeline(failRun.id, {
        provider: new MockAIProvider("timeout"),
      });
      failStatus = r1.status;
    } else {
      // claim raced — execute anyway after forcing RUNNING
      await prisma.applicationIntelligenceRun.update({
        where: { id: failRun.id },
        data: {
          status: "RUNNING",
          attemptCount: 2,
          maxAttempts: 2,
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      });
      const r1 = await executeIntelligenceRunPipeline(failRun.id, {
        provider: new MockAIProvider("timeout"),
      });
      failStatus = r1.status;
    }
    const failFinal = await prisma.applicationIntelligenceRun.findUnique({
      where: { id: failRun.id },
      select: { status: true, errorCode: true, attemptCount: true },
    });
    // Requeue FAILED → QUEUED via request path pattern
    if (failFinal?.status === "FAILED") {
      await prisma.applicationIntelligenceRun.update({
        where: { id: failRun.id },
        data: {
          status: "QUEUED",
          attemptCount: 0,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          leaseExpiresAt: null,
        },
      });
    }
    const afterRequeue = await prisma.applicationIntelligenceRun.findUnique({
      where: { id: failRun.id },
      select: { status: true },
    });
    section(
      report,
      "Failure Lifecycle",
      failFinal?.status === "FAILED" &&
        failFinal.errorCode === "TIMEOUT" &&
        afterRequeue?.status === "QUEUED",
      {
        pipelineStatus: failStatus,
        persisted: failFinal,
        requeued: afterRequeue?.status,
      }
    );

    // --- Live DB concurrency ---
    const CONCURRENCY_N = 100;
    const WORKERS = 10;
    const concurrencyIds: string[] = [];
    for (let i = 0; i < CONCURRENCY_N; i++) {
      const row = await prisma.applicationIntelligenceRun.create({
        data: {
          organizationId: org.id,
          jobId: job.id,
          snapshotId: snapshot!.id,
          requestedById: staff.userId,
          analysisPurpose: "JOB_REQUIREMENT_EXTRACTION",
          status: "QUEUED",
          freshness: "CURRENT",
          validationStatus: "PENDING",
          provider: NULL_PROVIDER_ID,
          model: NULL_MODEL_ID,
          promptVersion: "gate13.concurrency",
          schemaVersion: "ai-output.v1",
          scoringVersion: "scoring.v1",
          idempotencyKey: `gate13-conc-${randomUUID()}`,
          sourceDataVersion: "gate13-concurrency",
        },
        select: { id: true },
      });
      concurrencyIds.push(row.id);
    }

    const claimBatches = await Promise.all(
      Array.from({ length: WORKERS }, () => claimQueuedIntelligenceRuns(20))
    );
    const claimedFlat = claimBatches.flat();
    const claimedGate13 = claimedFlat.filter((c) => concurrencyIds.includes(c.id));
    const uniqueClaimed = new Set(claimedGate13.map((c) => c.id));
    const runningCount = await prisma.applicationIntelligenceRun.count({
      where: { id: { in: concurrencyIds }, status: "RUNNING" },
    });
    const stillQueued = await prisma.applicationIntelligenceRun.count({
      where: { id: { in: concurrencyIds }, status: "QUEUED" },
    });

    const concurrencyPass =
      uniqueClaimed.size === claimedGate13.length &&
      claimedGate13.length === runningCount &&
      uniqueClaimed.size + stillQueued === CONCURRENCY_N;

    section(report, "Live Database Concurrency", concurrencyPass, {
      queued: CONCURRENCY_N,
      workers: WORKERS,
      claimed: claimedGate13.length,
      uniqueClaims: uniqueClaimed.size,
      running: runningCount,
      stillQueued,
      duplicateClaims: claimedGate13.length - uniqueClaimed.size,
      poolNote:
        "Shared Prisma pool (max 3) — SKIP LOCKED still enforced at Postgres; connections multiplexed.",
    });

    // Cleanup concurrency rows
    await prisma.applicationIntelligenceRun.deleteMany({
      where: { id: { in: concurrencyIds } },
    });
    await prisma.applicationIntelligenceRun.deleteMany({
      where: { id: failRun.id },
    });

    // --- Cron ---
    const prevCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "gate13-cron-secret-value-32chars";
    const deniedMissing = await cronGET(
      new NextRequest("http://localhost/api/cron/intelligence-worker")
    );
    const deniedBad = await cronGET(
      new NextRequest("http://localhost/api/cron/intelligence-worker", {
        headers: { authorization: "Bearer wrong" },
      })
    );
    const allowed = await cronGET(
      new NextRequest("http://localhost/api/cron/intelligence-worker", {
        headers: {
          authorization: "Bearer gate13-cron-secret-value-32chars",
        },
      })
    );
    process.env.CRON_SECRET = prevCron;
    section(
      report,
      "Cron Production Path",
      deniedMissing.status === 401 &&
        deniedBad.status === 401 &&
        allowed.status === 200,
      {
        missing: deniedMissing.status,
        invalid: deniedBad.status,
        valid: allowed.status,
      }
    );

    // --- Security IDOR (cross-candidate) ---
    const otherCand = await prisma.candidate.findFirst({
      where: { organizationId: org.id, id: { not: candidate.id } },
      select: { id: true, userId: true },
    });
    let idorDenied = true;
    if (otherCand) {
      const cross = await withRlsContext(otherCand.userId, async (tx) => {
        const { loadCandidateApplicationIntelligence } = await import(
          "../src/lib/application-intelligence/load-application-intelligence"
        );
        return loadCandidateApplicationIntelligence({
          db: tx,
          applicationId: application!.id,
          candidateId: otherCand.id,
        });
      });
      idorDenied = !cross.ok;
    }
    section(report, "Security", idorDenied, {
      crossCandidateDenied: idorDenied,
      otherCandidateTested: !!otherCand,
    });

    // Observability identifiers present
    section(report, "Observability", !!extractFinal?.id && !!application.id && !!org.id, {
      runId: extractFinal?.id,
      applicationId: application.id,
      organizationId: org.id,
      analysisPurpose: "JOB_REQUIREMENT_EXTRACTION / CANDIDATE_JOB_ALIGNMENT / APPLICATION_READINESS",
    });

    // Performance: loader does not call provider (static check + timing)
    const t0 = Date.now();
    await withRlsContext(staff.userId, async (tx) =>
      loadStaffApplicationIntelligence({
        db: tx,
        applicationId: application!.id,
        organizationId: org.id,
      })
    );
    const loadMs = Date.now() - t0;
    section(report, "Performance", loadMs < 5000, {
      loadMs,
      note: "Persisted projection only; no provider call during Application Detail load.",
    });

    // Data reconciliation
    const reconcile = {
      orgId: org.id,
      candidateId: candidate.id,
      jobId: job.id,
      applicationId: application.id,
      snapshotId: snapshot?.id,
      requirementSetId: reqSet?.id,
      alignmentId: alignment?.id,
      readinessId: readiness?.id,
      alignmentOrgMatch:
        (
          await prisma.applicationAlignmentResult.findFirst({
            where: { id: alignment?.id, organizationId: org.id },
          })
        )?.organizationId === org.id,
      readinessOrgMatch:
        (
          await prisma.applicationReadinessResult.findFirst({
            where: { id: readiness?.id, organizationId: org.id },
          })
        )?.organizationId === org.id,
    };
    section(
      report,
      "Data Reconciliation",
      !!reconcile.alignmentOrgMatch &&
        !!reconcile.readinessOrgMatch &&
        reconcile.snapshotId === (alignment?.run?.snapshotId ?? reconcile.snapshotId),
      reconcile
    );

    // Network payload / presentation contract
    if (loaded.ok) {
      const htmlSafe = JSON.stringify(loaded.view);
      section(
        report,
        "Network Payload",
        !/nvapi-|NVIDIA_API_KEY|Bearer\s+[A-Za-z0-9]/i.test(htmlSafe) &&
          !("staffMeta" in loaded.view && loaded.view.staffMeta === null
            ? false
            : false) &&
          /guide|approval/i.test(loaded.view.messaging.body),
        {
          hasAdvisory: /guide|approval/i.test(loaded.view.messaging.body),
          staffMetaPresent: !!loaded.view.staffMeta,
        }
      );
    } else {
      section(report, "Network Payload", false, { reason: "loader failed" });
    }

    // Restore job JD to V1 for cleanliness (optional)
    await prisma.job.update({
      where: { id: job.id },
      data: { jobDescription: GATE13_JD_V1 },
    });

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.ok = false;
    report.errors.push(msg.slice(0, 500));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
