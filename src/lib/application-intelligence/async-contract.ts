/**
 * Async execution contract (Gate 4).
 *
 * REQUEST → CREATE RUN (QUEUED) → WORKER CLAIM → RUNNING → RESULT → SUCCEEDED/FAILED/RETRY_PENDING
 *
 * LLM execution during SSR is forbidden.
 */

export const ASYNC_EXECUTION_CONTRACT = {
  allowedStatuses: [
    "QUEUED",
    "RUNNING",
    "RETRY_PENDING",
    "SUCCEEDED",
    "FAILED",
  ] as const,
  completedAlias: "SUCCEEDED",
  idempotency:
    "Unique ApplicationIntelligenceRun.idempotencyKey per analysis identity",
  retrySafety:
    "Transient failures → RETRY_PENDING → QUEUED; RUNNING leases expire safely; SKIP LOCKED prevents double claim",
  ssrPolicy: "No LLM / provider calls during RSC/SSR render of application pages",
  blockingPolicy:
    "Application detail must render without waiting on intelligence execution",
  workerPrimitive:
    "Vercel Cron /api/cron/intelligence-worker with Bearer CRON_SECRET",
  batchSize: 3,
  leaseMs: 5 * 60 * 1000,
} as const;

export function assertNotSsrAiExecution(
  isRenderingServerComponent: boolean
): void {
  if (isRenderingServerComponent) {
    throw new Error("AI execution during SSR/RSC render is forbidden");
  }
}

export function canStartRun(status: string): boolean {
  return status === "QUEUED";
}

export function canCompleteRun(status: string): boolean {
  return status === "RUNNING";
}
