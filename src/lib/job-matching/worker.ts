/**
 * Phase 5A.6 — CandidateJobMatch async worker.
 *
 * Reuses the existing intelligence-worker cron. CandidateJobMatch is the
 * durable work record (QUEUED → RUNNING → SUCCEEDED|FAILED).
 * No second queue/cron/worker architecture.
 */

import { AuditAction, type Prisma } from "@/generated/prisma";
import { logSystemAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  MATCHING_CONTRACT_VERSION,
  MATCH_DRAIN_BATCH_SIZE,
  MATCH_RECLAIM_BATCH_SIZE,
  MATCH_WORKER_LEASE_MS,
  type MatchCategory,
} from "./constants";
import { evaluateCandidateJobMatch, toCandidateSafeMatchPayload } from "./evaluate";
import { buildMatchSourceDataVersion } from "./freshness";
import { loadAuthoritativeMatchInputs } from "./load-inputs";
import {
  buildJobMatchIdempotencyKey,
} from "./persist";

export type ClaimedJobMatch = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobId: string;
  attemptCount: number;
};

export type JobMatchDrainResult = {
  reclaimedLeases: number;
  requeuedStale: number;
  claimed: number;
  succeeded: number;
  failed: number;
  retried: number;
  idempotent: number;
  durationMs: number;
};

function sanitizeWorkerErrorMessage(message: string | null | undefined): string {
  if (!message) return "We couldn't complete this job match.";
  const trimmed = message.trim().slice(0, 240);
  if (
    /resume|extractedText|requirement|password|token|secret|api[_-]?key|jd\b|snapshot/i.test(
      trimmed
    )
  ) {
    return "We couldn't complete this job match.";
  }
  return trimmed;
}

function classifyMatchFailure(err: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (err instanceof AuthorizationError) {
    return {
      code: "MATCH_UNAUTHORIZED",
      message: sanitizeWorkerErrorMessage(err.message),
      retryable: false,
    };
  }
  if (err instanceof NotFoundError) {
    return {
      code: "MATCH_NOT_FOUND",
      message: sanitizeWorkerErrorMessage(err.message),
      retryable: false,
    };
  }
  if (err instanceof ValidationError) {
    return {
      code: "MATCH_INVALID",
      message: sanitizeWorkerErrorMessage(err.message),
      retryable: false,
    };
  }
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw === "PRIVATE_JOB_MATCH_DENIED" ||
    raw === "CROSS_TENANT_MATCH_DENIED"
  ) {
    return {
      code: raw,
      message: "This job cannot be matched for this candidate.",
      retryable: false,
    };
  }
  return {
    code: "MATCH_TRANSIENT",
    message: sanitizeWorkerErrorMessage(raw),
    retryable: true,
  };
}

async function auditMatchSafe(input: {
  organizationId: string;
  action: AuditAction;
  matchId: string;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    await logSystemAuditEvent({
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      action: input.action,
      entityType: "CandidateJobMatch",
      entityId: input.matchId,
      details: input.details,
    });
  } catch {
    // Audit must not break worker completion.
  }
}

/**
 * Expire stuck RUNNING leases → QUEUED (retry) or FAILED (max attempts).
 * Mirrors application-intelligence reclaimExpiredLeases.
 */
export async function reclaimExpiredJobMatchLeases(
  now = new Date()
): Promise<number> {
  const limit = MATCH_RECLAIM_BATCH_SIZE;
  const rows = await prisma.$executeRaw`
    UPDATE "candidate_job_matches" AS m
    SET
      status = CASE
        WHEN m."attemptCount" < m."maxAttempts"
          THEN 'QUEUED'::"CandidateJobMatchStatus"
        ELSE 'FAILED'::"CandidateJobMatchStatus"
      END,
      "errorCode" = CASE
        WHEN m."attemptCount" < m."maxAttempts"
          THEN 'LEASE_EXPIRED_RETRY'
        ELSE 'LEASE_EXPIRED'
      END,
      "errorMessage" = CASE
        WHEN m."attemptCount" < m."maxAttempts"
          THEN 'Worker lease expired; scheduled retry'
        ELSE 'Worker lease expired; max attempts reached'
      END,
      "leaseExpiresAt" = NULL
    WHERE m.id IN (
      SELECT id
      FROM "candidate_job_matches"
      WHERE status = 'RUNNING'::"CandidateJobMatchStatus"
        AND "leaseExpiresAt" IS NOT NULL
        AND "leaseExpiresAt" < ${now}::timestamptz
      ORDER BY "leaseExpiresAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
  `;
  return Number(rows);
}

/**
 * Requeue STALE matches onto QUEUED without creating a new identity row.
 */
export async function requeueStaleJobMatches(
  limit = MATCH_DRAIN_BATCH_SIZE
): Promise<number> {
  // freshness → CURRENT so feed empty-state can surface PREPARING while
  // status remains QUEUED (not SUCCEEDED — Save/Request stay blocked).
  const rows = await prisma.$executeRaw`
    UPDATE "candidate_job_matches"
    SET
      status = 'QUEUED'::"CandidateJobMatchStatus",
      freshness = 'CURRENT'::"IntelligenceResultFreshness",
      "errorCode" = NULL,
      "errorMessage" = NULL,
      "leaseExpiresAt" = NULL
    WHERE id IN (
      SELECT id FROM "candidate_job_matches"
      WHERE status = 'STALE'::"CandidateJobMatchStatus"
      ORDER BY "updatedAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
  `;
  return Number(rows);
}

/**
 * Atomically claim one QUEUED match with:
 * - FOR UPDATE SKIP LOCKED (no duplicate claim of same row)
 * - pg_try_advisory_xact_lock on candidateId (max 1 RUNNING per candidate)
 * - NOT EXISTS active RUNNING lease for same candidate
 */
export async function claimNextJobMatch(
  now = new Date()
): Promise<ClaimedJobMatch | null> {
  const leaseMs = MATCH_WORKER_LEASE_MS;
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      organizationId: string;
      candidateId: string;
      jobId: string;
      attemptCount: number;
    }>
  >`
    UPDATE "candidate_job_matches" AS m
    SET
      status = 'RUNNING'::"CandidateJobMatchStatus",
      "attemptCount" = m."attemptCount" + 1,
      "leaseExpiresAt" = NOW() + (${leaseMs}::text || ' milliseconds')::interval,
      "errorCode" = NULL,
      "errorMessage" = NULL
    WHERE m.id = (
      SELECT cjm.id
      FROM "candidate_job_matches" AS cjm
      WHERE cjm.status = 'QUEUED'::"CandidateJobMatchStatus"
        AND NOT EXISTS (
          SELECT 1
          FROM "candidate_job_matches" AS running
          WHERE running."candidateId" = cjm."candidateId"
            AND running.status = 'RUNNING'::"CandidateJobMatchStatus"
            AND running."leaseExpiresAt" IS NOT NULL
            AND running."leaseExpiresAt" >= ${now}::timestamptz
        )
        AND pg_try_advisory_xact_lock(
          hashtextextended(cjm."candidateId"::text, 0)
        )
      ORDER BY cjm."createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING m.id, m."organizationId", m."candidateId", m."jobId", m."attemptCount"
  `;

  return rows[0] ?? null;
}

/**
 * Enqueue (or requeue) the CURRENT CandidateJobMatch identity for async evaluation.
 * Never creates a second current row for the same (org, candidate, job).
 */
export async function enqueueCandidateJobMatchWork(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    candidateId: string;
    jobId: string;
    requestedById?: string | null;
    emitAudit?: boolean;
  }
): Promise<{ matchId: string; created: boolean; reusedQueued: boolean }> {
  const loaded = await loadAuthoritativeMatchInputs(tx, {
    organizationId: input.organizationId,
    candidateId: input.candidateId,
    jobId: input.jobId,
  });

  const sourceDataVersion = buildMatchSourceDataVersion({
    candidate: loaded.candidate,
    job: loaded.job,
    requirementSet: loaded.requirementSet,
  });
  const idempotencyKey = buildJobMatchIdempotencyKey({
    organizationId: input.organizationId,
    candidateId: input.candidateId,
    jobId: input.jobId,
    matchingContractVersion: MATCHING_CONTRACT_VERSION,
    sourceDataVersion,
  });

  const existing = await tx.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        jobId: input.jobId,
      },
    },
    select: {
      id: true,
      status: true,
      sourceDataVersion: true,
      matchingContractVersion: true,
      idempotencyKey: true,
    },
  });

  if (
    existing &&
    existing.status === "SUCCEEDED" &&
    existing.idempotencyKey === idempotencyKey
  ) {
    return { matchId: existing.id, created: false, reusedQueued: true };
  }

  if (existing && existing.status === "QUEUED") {
    await tx.candidateJobMatch.update({
      where: { id: existing.id },
      data: {
        sourceDataVersion,
        matchingContractVersion: MATCHING_CONTRACT_VERSION,
        idempotencyKey,
        snapshotId: loaded.snapshotId,
        requirementSetId: loaded.requirementSetId,
        freshness: "CURRENT",
        requestedById: input.requestedById ?? undefined,
        leaseExpiresAt: null,
      },
    });
    return { matchId: existing.id, created: false, reusedQueued: true };
  }

  if (existing) {
    await tx.candidateJobMatch.update({
      where: { id: existing.id },
      data: {
        status: "QUEUED",
        freshness: "CURRENT",
        sourceDataVersion,
        matchingContractVersion: MATCHING_CONTRACT_VERSION,
        idempotencyKey,
        snapshotId: loaded.snapshotId,
        requirementSetId: loaded.requirementSetId,
        errorCode: null,
        errorMessage: null,
        leaseExpiresAt: null,
        requestedById: input.requestedById ?? undefined,
      },
    });

    if (input.emitAudit !== false) {
      await auditMatchSafe({
        organizationId: input.organizationId,
        action: AuditAction.JOB_MATCH_REQUESTED,
        matchId: existing.id,
        details: {
          organizationId: input.organizationId,
          candidateId: input.candidateId,
          jobId: input.jobId,
          matchId: existing.id,
          matchingContractVersion: MATCHING_CONTRACT_VERSION,
          sourceDataVersion,
          status: "QUEUED",
        },
      });
    }

    return { matchId: existing.id, created: false, reusedQueued: false };
  }

  const created = await tx.candidateJobMatch.create({
    data: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      snapshotId: loaded.snapshotId,
      requirementSetId: loaded.requirementSetId,
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      sourceDataVersion,
      status: "QUEUED",
      freshness: "CURRENT",
      category: null,
      idempotencyKey,
      requestedById: input.requestedById ?? null,
    },
    select: { id: true },
  });

  if (input.emitAudit !== false) {
    await auditMatchSafe({
      organizationId: input.organizationId,
      action: AuditAction.JOB_MATCH_REQUESTED,
      matchId: created.id,
      details: {
        organizationId: input.organizationId,
        candidateId: input.candidateId,
        jobId: input.jobId,
        matchId: created.id,
        matchingContractVersion: MATCHING_CONTRACT_VERSION,
        sourceDataVersion,
        status: "QUEUED",
      },
    });
  }

  return { matchId: created.id, created: true, reusedQueued: false };
}

/**
 * Mark CURRENT match STALE and requeue for recomputation on the same row.
 */
export async function markJobMatchStaleAndRequeue(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    matchId: string;
    reason?: string;
  }
): Promise<{ matchId: string }> {
  const match = await tx.candidateJobMatch.findFirst({
    where: {
      id: input.matchId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      candidateId: true,
      jobId: true,
      matchingContractVersion: true,
      sourceDataVersion: true,
      status: true,
    },
  });
  if (!match) throw new NotFoundError("Match not found");

  await tx.candidateJobMatch.update({
    where: { id: match.id },
    data: {
      status: "STALE",
      freshness: "STALE",
      leaseExpiresAt: null,
    },
  });

  await auditMatchSafe({
    organizationId: input.organizationId,
    action: AuditAction.JOB_MATCH_MARKED_STALE,
    matchId: match.id,
    details: {
      organizationId: input.organizationId,
      candidateId: match.candidateId,
      jobId: match.jobId,
      matchId: match.id,
      matchingContractVersion: match.matchingContractVersion,
      sourceDataVersion: match.sourceDataVersion,
      status: "STALE",
      reason: input.reason ?? "SOURCE_CHANGED",
    },
  });

  return { matchId: match.id };
}

function buildSafeSummaries(evaluation: ReturnType<typeof evaluateCandidateJobMatch>) {
  const safe = toCandidateSafeMatchPayload(evaluation);
  return {
    qualificationSummary: safe.qualificationOutcomes as Prisma.InputJsonValue,
    preferenceSummary: safe.preferenceOutcomes as Prisma.InputJsonValue,
    presentation: safe.presentation as Prisma.InputJsonValue,
    evidenceRefs: evaluation.items
      .filter((i) => i.evidence)
      .map((i) => i.evidence) as Prisma.InputJsonValue,
  };
}

/**
 * Process a claimed RUNNING match: revalidate, evaluate, persist same row.
 */
export async function processJobMatch(matchId: string): Promise<{
  status: "SUCCEEDED" | "FAILED" | "QUEUED" | "IDEMPOTENT";
  errorCode?: string;
}> {
  const started = Date.now();
  const match = await prisma.candidateJobMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      organizationId: true,
      candidateId: true,
      jobId: true,
      status: true,
      attemptCount: true,
      maxAttempts: true,
      sourceDataVersion: true,
      matchingContractVersion: true,
      idempotencyKey: true,
      category: true,
      evaluatedAt: true,
      leaseExpiresAt: true,
    },
  });

  if (!match || match.status !== "RUNNING") {
    return { status: "FAILED", errorCode: "NOT_RUNNING" };
  }

  try {
    const loaded = await loadAuthoritativeMatchInputs(prisma, {
      organizationId: match.organizationId,
      candidateId: match.candidateId,
      jobId: match.jobId,
    });

    const currentSource = buildMatchSourceDataVersion({
      candidate: loaded.candidate,
      job: loaded.job,
      requirementSet: loaded.requirementSet,
    });

    // Idempotent replay: already SUCCEEDED evaluation for this exact version.
    if (
      match.sourceDataVersion === currentSource &&
      match.matchingContractVersion === MATCHING_CONTRACT_VERSION &&
      match.category != null &&
      match.evaluatedAt != null &&
      match.idempotencyKey ===
        buildJobMatchIdempotencyKey({
          organizationId: match.organizationId,
          candidateId: match.candidateId,
          jobId: match.jobId,
          matchingContractVersion: MATCHING_CONTRACT_VERSION,
          sourceDataVersion: currentSource,
        })
    ) {
      await prisma.candidateJobMatch.updateMany({
        where: { id: match.id, status: "RUNNING" },
        data: {
          status: "SUCCEEDED",
          freshness: "CURRENT",
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
      logger.info("Job match worker idempotent replay", {
        event: "JOB_MATCH_WORKER",
        matchId: match.id,
        organizationId: match.organizationId,
        candidateId: match.candidateId,
        jobId: match.jobId,
        attempt: match.attemptCount,
        status: "IDEMPOTENT",
        durationMs: Date.now() - started,
      });
      return { status: "IDEMPOTENT" };
    }

    const evaluation = evaluateCandidateJobMatch({
      candidate: loaded.candidate,
      job: loaded.job,
      requirementSet: loaded.requirementSet,
    });

    const summaries = buildSafeSummaries(evaluation);
    const idempotencyKey = buildJobMatchIdempotencyKey({
      organizationId: match.organizationId,
      candidateId: match.candidateId,
      jobId: match.jobId,
      matchingContractVersion: evaluation.matchingContractVersion,
      sourceDataVersion: evaluation.sourceDataVersion,
    });

    // Race safety (5C.6): a newer source mutation marks STALE while RUNNING.
    // Conditional update requires status still RUNNING — never overwrite STALE
    // with an evaluation computed from older inputs.
    const updated = await prisma.candidateJobMatch.updateMany({
      where: {
        id: match.id,
        status: "RUNNING",
        freshness: { not: "STALE" },
      },
      data: {
        snapshotId: loaded.snapshotId,
        requirementSetId: loaded.requirementSetId,
        matchingContractVersion: evaluation.matchingContractVersion,
        sourceDataVersion: evaluation.sourceDataVersion,
        status: "SUCCEEDED",
        freshness: "CURRENT",
        category: evaluation.category as MatchCategory,
        qualificationSummary: summaries.qualificationSummary,
        preferenceSummary: summaries.preferenceSummary,
        presentation: summaries.presentation,
        evidenceRefs: summaries.evidenceRefs,
        idempotencyKey,
        errorCode: null,
        errorMessage: null,
        evaluatedAt: new Date(evaluation.evaluatedAt),
        leaseExpiresAt: null,
        // Decision fields intentionally omitted — preserved across recompute.
      },
    });

    if (updated.count !== 1) {
      return { status: "FAILED", errorCode: "LEASE_LOST" };
    }

    await auditMatchSafe({
      organizationId: match.organizationId,
      action: AuditAction.JOB_MATCH_COMPLETED,
      matchId: match.id,
      details: {
        organizationId: match.organizationId,
        candidateId: match.candidateId,
        jobId: match.jobId,
        matchId: match.id,
        status: "SUCCEEDED",
        category: evaluation.category,
        matchingContractVersion: evaluation.matchingContractVersion,
        sourceDataVersion: evaluation.sourceDataVersion,
      },
    });

    logger.info("Job match worker completed", {
      event: "JOB_MATCH_WORKER",
      matchId: match.id,
      organizationId: match.organizationId,
      candidateId: match.candidateId,
      jobId: match.jobId,
      attempt: match.attemptCount,
      status: "SUCCEEDED",
      durationMs: Date.now() - started,
    });

    return { status: "SUCCEEDED" };
  } catch (err) {
    const failure = classifyMatchFailure(err);
    const retry =
      failure.retryable && match.attemptCount < match.maxAttempts;

    const nextStatus = retry ? "QUEUED" : "FAILED";
    await prisma.candidateJobMatch.updateMany({
      where: { id: match.id, status: "RUNNING" },
      data: {
        status: nextStatus,
        errorCode: failure.code.slice(0, 64),
        errorMessage: failure.message,
        leaseExpiresAt: null,
        ...(nextStatus === "FAILED"
          ? { freshness: "CURRENT" as const }
          : {}),
      },
    });

    if (nextStatus === "FAILED") {
      await auditMatchSafe({
        organizationId: match.organizationId,
        action: AuditAction.JOB_MATCH_FAILED,
        matchId: match.id,
        details: {
          organizationId: match.organizationId,
          candidateId: match.candidateId,
          jobId: match.jobId,
          matchId: match.id,
          status: "FAILED",
          errorCode: failure.code,
          matchingContractVersion: match.matchingContractVersion,
          sourceDataVersion: match.sourceDataVersion,
        },
      });
    }

    logger.info("Job match worker failed", {
      event: "JOB_MATCH_WORKER",
      matchId: match.id,
      organizationId: match.organizationId,
      candidateId: match.candidateId,
      jobId: match.jobId,
      attempt: match.attemptCount,
      status: nextStatus,
      failureCode: failure.code,
      retryState: retry ? "RETRY" : "TERMINAL",
      durationMs: Date.now() - started,
    });

    return {
      status: nextStatus,
      errorCode: failure.code,
    };
  }
}

/**
 * Drain CandidateJobMatch work via the existing intelligence-worker cron.
 * Bounded: MATCH_DRAIN_BATCH_SIZE (25). Per-candidate concurrency enforced in claim.
 */
export async function drainJobMatchWorker(
  limit = MATCH_DRAIN_BATCH_SIZE
): Promise<JobMatchDrainResult> {
  const started = Date.now();
  const batchLimit = Math.min(Math.max(1, limit), MATCH_DRAIN_BATCH_SIZE);

  const reclaimedLeases = await reclaimExpiredJobMatchLeases();
  const requeuedStale = await requeueStaleJobMatches(batchLimit);

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let retried = 0;
  let idempotent = 0;

  for (let i = 0; i < batchLimit; i++) {
    const item = await claimNextJobMatch();
    if (!item) break;
    claimed += 1;
    const result = await processJobMatch(item.id);
    if (result.status === "SUCCEEDED") succeeded += 1;
    else if (result.status === "IDEMPOTENT") idempotent += 1;
    else if (result.status === "QUEUED") retried += 1;
    else failed += 1;
  }

  const durationMs = Date.now() - started;
  logger.info("Job match worker drain completed", {
    event: "JOB_MATCH_WORKER_DRAIN",
    reclaimedLeases,
    requeuedStale,
    claimed,
    succeeded,
    failed,
    retried,
    idempotent,
    durationMs,
  });

  return {
    reclaimedLeases,
    requeuedStale,
    claimed,
    succeeded,
    failed,
    retried,
    idempotent,
    durationMs,
  };
}
