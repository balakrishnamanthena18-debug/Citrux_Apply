import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma";

export const INTELLIGENCE_WORKER_LEASE_MS = 5 * 60 * 1000;
export const INTELLIGENCE_WORKER_BATCH_SIZE = 3;
export const INTELLIGENCE_RECLAIM_BATCH_SIZE = 20;

export type ClaimedRun = {
  id: string;
  organizationId: string;
  status: "RUNNING";
  attemptCount: number;
};

/**
 * Re-queue RETRY_PENDING runs that still have attempts remaining.
 * Atomic via FOR UPDATE SKIP LOCKED — safe under concurrent workers.
 */
export async function requeueRetryPendingRuns(
  limit = INTELLIGENCE_WORKER_BATCH_SIZE
): Promise<number> {
  const rows = await prisma.$executeRaw`
    UPDATE "application_intelligence_runs"
    SET status = 'QUEUED'::"IntelligenceRunStatus",
        "errorCode" = NULL,
        "errorMessage" = NULL
    WHERE id IN (
      SELECT id FROM "application_intelligence_runs"
      WHERE status = 'RETRY_PENDING'::"IntelligenceRunStatus"
        AND "attemptCount" < "maxAttempts"
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
  `;
  return Number(rows);
}

/**
 * Expire stuck RUNNING leases → RETRY_PENDING or FAILED.
 * Uses a single conditional UPDATE with SKIP LOCKED so two workers
 * cannot reclaim the same row, and terminal runs are never touched.
 */
export async function reclaimExpiredLeases(now = new Date()): Promise<number> {
  const limit = INTELLIGENCE_RECLAIM_BATCH_SIZE;
  const rows = await prisma.$executeRaw`
    UPDATE "application_intelligence_runs" AS r
    SET
      status = CASE
        WHEN r."attemptCount" < r."maxAttempts"
          THEN 'RETRY_PENDING'::"IntelligenceRunStatus"
        ELSE 'FAILED'::"IntelligenceRunStatus"
      END,
      "errorCode" = CASE
        WHEN r."attemptCount" < r."maxAttempts"
          THEN 'LEASE_EXPIRED_RETRY'
        ELSE 'LEASE_EXPIRED'
      END,
      "errorMessage" = CASE
        WHEN r."attemptCount" < r."maxAttempts"
          THEN 'Worker lease expired; scheduled retry'
        ELSE 'Worker lease expired; max attempts reached'
      END,
      "leaseExpiresAt" = NULL,
      "completedAt" = CASE
        WHEN r."attemptCount" < r."maxAttempts" THEN NULL
        ELSE NOW()
      END,
      "validationStatus" = CASE
        WHEN r."attemptCount" < r."maxAttempts" THEN r."validationStatus"
        ELSE 'FAILED'::"IntelligenceValidationStatus"
      END
    WHERE r.id IN (
      SELECT id
      FROM "application_intelligence_runs"
      WHERE status = 'RUNNING'::"IntelligenceRunStatus"
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
 * Atomically claim up to `limit` QUEUED runs using FOR UPDATE SKIP LOCKED.
 */
export async function claimQueuedIntelligenceRuns(
  limit = INTELLIGENCE_WORKER_BATCH_SIZE
): Promise<ClaimedRun[]> {
  const leaseMs = INTELLIGENCE_WORKER_LEASE_MS;
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      organizationId: string;
      status: string;
      attemptCount: number;
    }>
  >`
    WITH cte AS (
      SELECT id
      FROM "application_intelligence_runs"
      WHERE status = 'QUEUED'::"IntelligenceRunStatus"
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "application_intelligence_runs" AS r
    SET
      status = 'RUNNING'::"IntelligenceRunStatus",
      "startedAt" = COALESCE(r."startedAt", NOW()),
      "leaseExpiresAt" = NOW() + (${leaseMs}::text || ' milliseconds')::interval,
      "attemptCount" = r."attemptCount" + 1,
      "errorCode" = NULL,
      "errorMessage" = NULL
    FROM cte
    WHERE r.id = cte.id
    RETURNING r.id, r."organizationId", r.status, r."attemptCount"
  `;

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    status: "RUNNING" as const,
    attemptCount: r.attemptCount,
  }));
}

export type RunningLeaseLockResult =
  | { ok: true; attemptCount: number; maxAttempts: number }
  | { ok: false; reason: "MISSING" | "SUCCEEDED" | "NOT_RUNNING" | "LEASE_EXPIRED"; status?: string };

/**
 * Row-lock a RUNNING run with a still-valid lease inside a transaction.
 * Prevents persist/complete after reclaim or concurrent terminal transition.
 */
export async function lockRunningRunForPersist(
  tx: Prisma.TransactionClient,
  runId: string,
  now = new Date()
): Promise<RunningLeaseLockResult> {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      status: string;
      leaseExpiresAt: Date | null;
      attemptCount: number;
      maxAttempts: number;
    }>
  >`
    SELECT id, status, "leaseExpiresAt", "attemptCount", "maxAttempts"
    FROM "application_intelligence_runs"
    WHERE id = ${runId}::uuid
    FOR UPDATE
  `;

  const row = rows[0];
  if (!row) return { ok: false, reason: "MISSING" };
  if (row.status === "SUCCEEDED") {
    return { ok: false, reason: "SUCCEEDED", status: row.status };
  }
  if (row.status !== "RUNNING") {
    return { ok: false, reason: "NOT_RUNNING", status: row.status };
  }
  if (row.leaseExpiresAt !== null && row.leaseExpiresAt < now) {
    return { ok: false, reason: "LEASE_EXPIRED", status: row.status };
  }
  return {
    ok: true,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
  };
}

/**
 * Conditionally transition RUNNING → RETRY_PENDING | FAILED.
 * Returns false if the row was no longer RUNNING (lost lease / already terminal).
 */
export async function transitionRunningRunFailure(
  runId: string,
  next: "RETRY_PENDING" | "FAILED",
  failure: { code: string; message: string }
): Promise<boolean> {
  const result = await prisma.applicationIntelligenceRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: {
      status: next,
      validationStatus: "FAILED",
      errorCode: failure.code.slice(0, 64),
      errorMessage: failure.message.slice(0, 500),
      leaseExpiresAt: null,
      completedAt: next === "FAILED" ? new Date() : null,
    },
  });
  return result.count === 1;
}
