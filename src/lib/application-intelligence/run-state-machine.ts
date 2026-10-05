import type { IntelligenceRunStatus } from "@/generated/prisma";

/**
 * Authoritative ApplicationIntelligenceRun status transitions (Gate 4).
 * COMPLETED in product language maps to SUCCEEDED in the schema enum.
 */

export const RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "RETRY_PENDING",
  "SUCCEEDED",
  "FAILED",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  QUEUED: ["RUNNING"],
  RUNNING: ["SUCCEEDED", "FAILED", "RETRY_PENDING"],
  RETRY_PENDING: ["QUEUED", "FAILED"],
  SUCCEEDED: [],
  FAILED: ["QUEUED"], // explicit recompute/re-request only
};

export function assertValidRunTransition(
  from: string,
  to: string
): asserts to is RunStatus {
  if (!(RUN_STATUSES as readonly string[]).includes(from)) {
    throw new Error(`Invalid run status: ${from}`);
  }
  if (!(RUN_STATUSES as readonly string[]).includes(to)) {
    throw new Error(`Invalid run status: ${to}`);
  }
  const allowed = ALLOWED_TRANSITIONS[from as RunStatus];
  if (!allowed.includes(to as RunStatus)) {
    throw new Error(`Invalid run transition ${from} → ${to}`);
  }
}

export function canTransitionRunStatus(from: string, to: string): boolean {
  try {
    assertValidRunTransition(from, to);
    return true;
  } catch {
    return false;
  }
}

/** Design-lock alias: COMPLETED === SUCCEEDED */
export function isTerminalSuccess(status: IntelligenceRunStatus | string): boolean {
  return status === "SUCCEEDED";
}

export function isTerminalFailure(status: IntelligenceRunStatus | string): boolean {
  return status === "FAILED";
}

export function isClaimableStatus(status: IntelligenceRunStatus | string): boolean {
  return status === "QUEUED";
}
