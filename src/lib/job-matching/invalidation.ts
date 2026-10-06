/**
 * Phase 5C.6 — bounded CandidateJobMatch invalidation (mutation-time).
 *
 * Marks affected matches STALE via set-based SQL. Does NOT evaluate matching,
 * does NOT create matches, does NOT mutate Applications / Opportunities /
 * decision fields (savedAt / dismissedAt / applicationRequestedAt / opportunityId).
 *
 * Recomputation is asynchronous via existing drainJobMatchWorker →
 * requeueStaleJobMatches → processJobMatch.
 */

import type { Prisma } from "@/generated/prisma";
import { AuditAction } from "@/generated/prisma";
import { logSystemAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";

/** Max rows touched per SQL batch — fan-out stays bounded without loading all IDs into JS. */
export const JOB_MATCH_INVALIDATION_BATCH_SIZE = 100;

/** Hard cap on batches per mutation request (10_000 matches). */
export const JOB_MATCH_INVALIDATION_MAX_BATCHES = 100;

export type JobMatchInvalidationReason =
  | "CANDIDATE_TRUTH_CHANGED"
  | "CANDIDATE_PREFERENCES_CHANGED"
  | "JOB_SOURCE_CHANGED"
  | "JD_SNAPSHOT_CHANGED"
  | "REQUIREMENT_SET_CHANGED"
  | "SOURCE_CHANGED";

export type JobMatchInvalidationResult = {
  markedStale: number;
  batches: number;
  truncated: boolean;
};

type InvalidationScope =
  | { kind: "candidate"; organizationId: string; candidateId: string }
  | { kind: "job"; organizationId: string; jobId: string };

async function auditScopeStale(input: {
  organizationId: string;
  reason: JobMatchInvalidationReason;
  scope: InvalidationScope;
  markedStale: number;
  sampleMatchIds: string[];
}): Promise<void> {
  if (input.markedStale <= 0) return;
  try {
    await logSystemAuditEvent({
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      action: AuditAction.JOB_MATCH_MARKED_STALE,
      entityType: "CandidateJobMatch",
      entityId:
        input.sampleMatchIds[0] ??
        (input.scope.kind === "candidate"
          ? input.scope.candidateId
          : input.scope.jobId),
      details: {
        organizationId: input.organizationId,
        reason: input.reason,
        scope: input.scope.kind,
        candidateId:
          input.scope.kind === "candidate" ? input.scope.candidateId : undefined,
        jobId: input.scope.kind === "job" ? input.scope.jobId : undefined,
        markedStale: input.markedStale,
        sampleMatchIds: input.sampleMatchIds.slice(0, 10),
        status: "STALE",
      },
    });
  } catch {
    // Audit must not break candidate/job mutations.
  }
}

/**
 * Set-based STALE mark for one batch. Preserves decision columns by omission.
 * Includes RUNNING/QUEUED/SUCCEEDED/FAILED so in-flight work cannot finish as
 * falsely CURRENT after a known source mutation.
 */
async function markStaleBatch(
  tx: Prisma.TransactionClient,
  scope: InvalidationScope
): Promise<Array<{ id: string }>> {
  if (scope.kind === "candidate") {
    return tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "candidate_job_matches" AS m
      SET
        status = 'STALE'::"CandidateJobMatchStatus",
        freshness = 'STALE'::"IntelligenceResultFreshness",
        "leaseExpiresAt" = NULL
      WHERE m.id IN (
        SELECT cjm.id
        FROM "candidate_job_matches" AS cjm
        WHERE cjm."organizationId" = ${scope.organizationId}::uuid
          AND cjm."candidateId" = ${scope.candidateId}::uuid
          AND (
            cjm.freshness = 'CURRENT'::"IntelligenceResultFreshness"
            OR cjm.status IN (
              'SUCCEEDED'::"CandidateJobMatchStatus",
              'QUEUED'::"CandidateJobMatchStatus",
              'RUNNING'::"CandidateJobMatchStatus",
              'FAILED'::"CandidateJobMatchStatus"
            )
          )
          AND NOT (
            cjm.status = 'STALE'::"CandidateJobMatchStatus"
            AND cjm.freshness = 'STALE'::"IntelligenceResultFreshness"
          )
        ORDER BY cjm."updatedAt" ASC
        LIMIT ${JOB_MATCH_INVALIDATION_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING m.id
    `;
  }

  return tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "candidate_job_matches" AS m
    SET
      status = 'STALE'::"CandidateJobMatchStatus",
      freshness = 'STALE'::"IntelligenceResultFreshness",
      "leaseExpiresAt" = NULL
    WHERE m.id IN (
      SELECT cjm.id
      FROM "candidate_job_matches" AS cjm
      WHERE cjm."organizationId" = ${scope.organizationId}::uuid
        AND cjm."jobId" = ${scope.jobId}::uuid
        AND (
          cjm.freshness = 'CURRENT'::"IntelligenceResultFreshness"
          OR cjm.status IN (
            'SUCCEEDED'::"CandidateJobMatchStatus",
            'QUEUED'::"CandidateJobMatchStatus",
            'RUNNING'::"CandidateJobMatchStatus",
            'FAILED'::"CandidateJobMatchStatus"
          )
        )
        AND NOT (
          cjm.status = 'STALE'::"CandidateJobMatchStatus"
          AND cjm.freshness = 'STALE'::"IntelligenceResultFreshness"
        )
      ORDER BY cjm."updatedAt" ASC
      LIMIT ${JOB_MATCH_INVALIDATION_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING m.id
  `;
}

/**
 * After STALE mark, promote to QUEUED (same identity) so the existing worker
 * can claim work without waiting for cron, and feed PREPARING can surface.
 * Does not evaluate. Does not touch decision fields.
 */
async function requeueStaleForScope(
  tx: Prisma.TransactionClient,
  scope: InvalidationScope
): Promise<void> {
  if (scope.kind === "candidate") {
    await tx.$executeRaw`
      UPDATE "candidate_job_matches"
      SET
        status = 'QUEUED'::"CandidateJobMatchStatus",
        freshness = 'CURRENT'::"IntelligenceResultFreshness",
        "errorCode" = NULL,
        "errorMessage" = NULL,
        "leaseExpiresAt" = NULL
      WHERE "organizationId" = ${scope.organizationId}::uuid
        AND "candidateId" = ${scope.candidateId}::uuid
        AND status = 'STALE'::"CandidateJobMatchStatus"
    `;
    return;
  }
  await tx.$executeRaw`
    UPDATE "candidate_job_matches"
    SET
      status = 'QUEUED'::"CandidateJobMatchStatus",
      freshness = 'CURRENT'::"IntelligenceResultFreshness",
      "errorCode" = NULL,
      "errorMessage" = NULL,
      "leaseExpiresAt" = NULL
    WHERE "organizationId" = ${scope.organizationId}::uuid
      AND "jobId" = ${scope.jobId}::uuid
      AND status = 'STALE'::"CandidateJobMatchStatus"
  `;
}

async function invalidateScope(
  tx: Prisma.TransactionClient,
  scope: InvalidationScope,
  reason: JobMatchInvalidationReason
): Promise<JobMatchInvalidationResult> {
  let markedStale = 0;
  let batches = 0;
  const sampleMatchIds: string[] = [];
  let truncated = false;

  for (let i = 0; i < JOB_MATCH_INVALIDATION_MAX_BATCHES; i++) {
    const rows = await markStaleBatch(tx, scope);
    batches += 1;
    if (rows.length === 0) break;
    markedStale += rows.length;
    for (const row of rows) {
      if (sampleMatchIds.length < 10) sampleMatchIds.push(row.id);
    }
    if (rows.length < JOB_MATCH_INVALIDATION_BATCH_SIZE) break;
    if (i === JOB_MATCH_INVALIDATION_MAX_BATCHES - 1) {
      truncated = true;
    }
  }

  if (markedStale > 0) {
    await requeueStaleForScope(tx, scope);
  }

  await auditScopeStale({
    organizationId: scope.organizationId,
    reason,
    scope,
    markedStale,
    sampleMatchIds,
  });

  if (truncated) {
    logger.warn("Job match invalidation truncated at batch cap", {
      event: "JOB_MATCH_INVALIDATION",
      organizationId: scope.organizationId,
      scope: scope.kind,
      markedStale,
      batches,
      reason,
    });
  }

  return { markedStale, batches, truncated };
}

/**
 * Invalidate all CURRENT/active matches for a candidate (truth/preference change).
 */
export async function invalidateCandidateJobMatchesForCandidate(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    candidateId: string;
    reason: JobMatchInvalidationReason;
  }
): Promise<JobMatchInvalidationResult> {
  if (!input.organizationId || !input.candidateId) {
    return { markedStale: 0, batches: 0, truncated: false };
  }
  return invalidateScope(
    tx,
    {
      kind: "candidate",
      organizationId: input.organizationId,
      candidateId: input.candidateId,
    },
    input.reason
  );
}

/**
 * Invalidate all CURRENT/active matches for a job (job/JD/requirement change).
 */
export async function invalidateCandidateJobMatchesForJob(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    jobId: string;
    reason: JobMatchInvalidationReason;
  }
): Promise<JobMatchInvalidationResult> {
  if (!input.organizationId || !input.jobId) {
    return { markedStale: 0, batches: 0, truncated: false };
  }
  return invalidateScope(
    tx,
    {
      kind: "job",
      organizationId: input.organizationId,
      jobId: input.jobId,
    },
    input.reason
  );
}
