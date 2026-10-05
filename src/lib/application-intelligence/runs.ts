import crypto from "crypto";
import type { Prisma } from "@/generated/prisma";
import { AuditAction, Prisma as PrismaNamespace } from "@/generated/prisma";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ANALYSIS_PURPOSE,
  INTELLIGENCE_PROMPT_VERSION,
  INTELLIGENCE_SCHEMA_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  NULL_MODEL_ID,
  NULL_PROVIDER_ID,
} from "./constants";
import { captureJobDescriptionSnapshot } from "./jd-snapshot";
import { buildSourceDataVersion } from "./stale";
import { INTELLIGENCE_AUDIT_ACTIONS, sanitizeIntelligenceAuditDetails } from "./audit-contract";
import { assertIntelligenceScopeComplete } from "./security";
import { assertValidRunTransition } from "./run-state-machine";

export type RequestIntelligenceRunInput = {
  organizationId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  requestedById: string;
  candidateUpdatedAt: Date | string;
  materialsFingerprint: string;
  /**
   * Provider/model placeholders until Phase 2 feature auth.
   * Defaults to null provider (no execution).
   */
  provider?: string;
  model?: string;
};

function buildIdempotencyKey(parts: {
  applicationId: string;
  snapshotContentHash: string;
  sourceDataVersion: string;
  scoringVersion: string;
  schemaVersion: string;
}): string {
  const material = [
    parts.applicationId,
    parts.snapshotContentHash,
    parts.sourceDataVersion,
    parts.scoringVersion,
    parts.schemaVersion,
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 64);
}

/**
 * Create (or reuse) a QUEUED intelligence run pinned to an immutable JD snapshot.
 * Does NOT execute AI. Does NOT populate alignment/readiness results.
 */
export async function requestApplicationIntelligenceRun(
  tx: Prisma.TransactionClient,
  input: RequestIntelligenceRunInput
): Promise<{
  runId: string;
  snapshotId: string;
  created: boolean;
  status: "QUEUED" | "RUNNING" | "RETRY_PENDING" | "SUCCEEDED" | "FAILED";
}> {
  assertIntelligenceScopeComplete({
    organizationId: input.organizationId,
    candidateId: input.candidateId,
    applicationId: input.applicationId,
    jobId: input.jobId,
  });

  const job = await tx.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: {
      id: true,
      organizationId: true,
      jobDescription: true,
      externalUrl: true,
      source: true,
      updatedAt: true,
    },
  });

  if (!job) {
    throw new Error("Job not found for intelligence run request");
  }

  const application = await tx.application.findFirst({
    where: {
      id: input.applicationId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
    },
    select: { id: true },
  });

  if (!application) {
    throw new Error("Application scope mismatch for intelligence run request");
  }

  const snapshot = await captureJobDescriptionSnapshot(tx, job, input.requestedById);

  if (snapshot.created) {
    await logUserAuditEvent({
      userId: input.requestedById,
      organizationId: input.organizationId,
      action: AuditAction.JOB_DESCRIPTION_SNAPSHOT_CAPTURED,
      entityType: "JobDescriptionSnapshot",
      entityId: snapshot.id,
      details: sanitizeIntelligenceAuditDetails({
        jobId: input.jobId,
        snapshotId: snapshot.id,
        contentHash: snapshot.contentHash,
      }),
      tx,
    });
  }

  const sourceDataVersion = buildSourceDataVersion({
    snapshotContentHash: snapshot.contentHash,
    candidateUpdatedAt: input.candidateUpdatedAt,
    materialsFingerprint: input.materialsFingerprint,
  });

  const idempotencyKey = buildIdempotencyKey({
    applicationId: input.applicationId,
    snapshotContentHash: snapshot.contentHash,
    sourceDataVersion,
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
  });

  const existing = await tx.applicationIntelligenceRun.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true, snapshotId: true },
  });

  if (existing) {
    // Explicit re-request of a terminal FAILED run: requeue under the same
    // idempotency key (FAILED → QUEUED is the only allowed recovery transition).
    if (existing.status === "FAILED") {
      assertValidRunTransition("FAILED", "QUEUED");
      await tx.applicationIntelligenceRun.update({
        where: { id: existing.id },
        data: {
          status: "QUEUED",
          attemptCount: 0,
          validationStatus: "PENDING",
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          leaseExpiresAt: null,
          startedAt: null,
          validatedPayload: PrismaNamespace.DbNull,
        },
      });
      await logUserAuditEvent({
        userId: input.requestedById,
        organizationId: input.organizationId,
        action: INTELLIGENCE_AUDIT_ACTIONS.requested,
        entityType: "ApplicationIntelligenceRun",
        entityId: existing.id,
        details: sanitizeIntelligenceAuditDetails({
          applicationId: input.applicationId,
          candidateId: input.candidateId,
          jobId: input.jobId,
          snapshotId: existing.snapshotId,
          runId: existing.id,
          requeuedFrom: "FAILED",
        }),
        tx,
      });
      return {
        runId: existing.id,
        snapshotId: existing.snapshotId,
        created: false,
        status: "QUEUED",
      };
    }
    return {
      runId: existing.id,
      snapshotId: existing.snapshotId,
      created: false,
      status: existing.status,
    };
  }

  const run = await tx.applicationIntelligenceRun.create({
    data: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      requestedById: input.requestedById,
      analysisPurpose: ANALYSIS_PURPOSE.APPLICATION_INTELLIGENCE,
      status: "QUEUED",
      freshness: "CURRENT",
      validationStatus: "PENDING",
      provider: input.provider ?? NULL_PROVIDER_ID,
      model: input.model ?? NULL_MODEL_ID,
      promptVersion: INTELLIGENCE_PROMPT_VERSION,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      idempotencyKey,
      sourceDataVersion,
    },
    select: { id: true, snapshotId: true },
  });

  await logUserAuditEvent({
    userId: input.requestedById,
    organizationId: input.organizationId,
    action: INTELLIGENCE_AUDIT_ACTIONS.requested,
    entityType: "ApplicationIntelligenceRun",
    entityId: run.id,
    details: sanitizeIntelligenceAuditDetails({
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      runId: run.id,
      provider: input.provider ?? NULL_PROVIDER_ID,
      model: input.model ?? NULL_MODEL_ID,
    }),
    tx,
  });

  return {
    runId: run.id,
    snapshotId: run.snapshotId,
    created: true,
    status: "QUEUED",
  };
}

/**
 * Mark existing CURRENT results/runs as STALE or RECOMPUTE_REQUIRED.
 * Does not execute AI recompute. Does not delete historical results.
 */
export async function markApplicationIntelligenceStale(
  tx: Prisma.TransactionClient,
  input: {
    applicationId: string;
    organizationId: string;
    actorUserId: string;
    freshness: "STALE" | "RECOMPUTE_REQUIRED";
  }
): Promise<number> {
  const result = await tx.applicationIntelligenceRun.updateMany({
    where: {
      applicationId: input.applicationId,
      organizationId: input.organizationId,
      freshness: "CURRENT",
    },
    data: { freshness: input.freshness },
  });

  await tx.applicationAlignmentResult.updateMany({
    where: {
      applicationId: input.applicationId,
      organizationId: input.organizationId,
      freshness: "CURRENT",
    },
    data: { freshness: input.freshness },
  });

  await tx.applicationReadinessResult.updateMany({
    where: {
      applicationId: input.applicationId,
      organizationId: input.organizationId,
      freshness: "CURRENT",
    },
    data: { freshness: input.freshness },
  });

  await logUserAuditEvent({
    userId: input.actorUserId,
    organizationId: input.organizationId,
    action: INTELLIGENCE_AUDIT_ACTIONS.markedStale,
    entityType: "Application",
    entityId: input.applicationId,
    details: sanitizeIntelligenceAuditDetails({
      applicationId: input.applicationId,
      freshness: input.freshness,
      runsUpdated: result.count,
    }),
    tx,
  });

  return result.count;
}

/**
 * When candidate truth / profile inputs change, mark CURRENT intelligence for
 * that candidate's applications as STALE. Historical rows remain.
 */
export async function markCandidateApplicationIntelligenceStale(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    candidateId: string;
    actorUserId: string;
    freshness?: "STALE" | "RECOMPUTE_REQUIRED";
    reason?: string;
  }
): Promise<number> {
  const freshness = input.freshness ?? "STALE";

  const applications = await tx.application.findMany({
    where: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
    },
    select: { id: true },
  });
  const applicationIds = applications.map((a) => a.id);
  if (applicationIds.length === 0) return 0;

  const runs = await tx.applicationIntelligenceRun.updateMany({
    where: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      freshness: "CURRENT",
    },
    data: { freshness },
  });

  await tx.applicationAlignmentResult.updateMany({
    where: {
      organizationId: input.organizationId,
      applicationId: { in: applicationIds },
      freshness: "CURRENT",
    },
    data: { freshness },
  });

  await tx.applicationReadinessResult.updateMany({
    where: {
      organizationId: input.organizationId,
      applicationId: { in: applicationIds },
      freshness: "CURRENT",
    },
    data: { freshness },
  });

  if (runs.count > 0) {
    await logUserAuditEvent({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      action: INTELLIGENCE_AUDIT_ACTIONS.markedStale,
      entityType: "Candidate",
      entityId: input.candidateId,
      details: sanitizeIntelligenceAuditDetails({
        candidateId: input.candidateId,
        freshness,
        runsUpdated: runs.count,
        reason: input.reason ?? "CANDIDATE_PROFILE_CHANGED",
      }),
      tx,
    });
  }

  return runs.count;
}

/**
 * When a job's JD snapshot identity changes, mark CURRENT intelligence for
 * all applications on that job as RECOMPUTE_REQUIRED. Historical rows remain.
 */
export async function markJobApplicationIntelligenceStale(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    jobId: string;
    actorUserId: string;
    freshness?: "STALE" | "RECOMPUTE_REQUIRED";
  }
): Promise<number> {
  const freshness = input.freshness ?? "RECOMPUTE_REQUIRED";

  const applications = await tx.application.findMany({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
    },
    select: { id: true },
  });
  const applicationIds = applications.map((a) => a.id);

  const runs = await tx.applicationIntelligenceRun.updateMany({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      freshness: "CURRENT",
    },
    data: { freshness },
  });

  if (applicationIds.length > 0) {
    await tx.applicationAlignmentResult.updateMany({
      where: {
        organizationId: input.organizationId,
        applicationId: { in: applicationIds },
        freshness: "CURRENT",
      },
      data: { freshness },
    });

    await tx.applicationReadinessResult.updateMany({
      where: {
        organizationId: input.organizationId,
        applicationId: { in: applicationIds },
        freshness: "CURRENT",
      },
      data: { freshness },
    });
  }

  if (runs.count > 0) {
    await logUserAuditEvent({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      action: INTELLIGENCE_AUDIT_ACTIONS.markedStale,
      entityType: "Job",
      entityId: input.jobId,
      details: sanitizeIntelligenceAuditDetails({
        jobId: input.jobId,
        freshness,
        runsUpdated: runs.count,
        reason: "JD_SNAPSHOT_CHANGED",
      }),
      tx,
    });
  }

  return runs.count;
}
