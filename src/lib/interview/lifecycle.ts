/**
 * Phase 8C.2 — Interview Operating System Lifecycle Authority
 * Deterministic state machine and transition validation for InterviewRounds.
 * Contract: docs/engineering/PHASE_8B_INTERVIEW_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 */

import { InterviewRoundStatus } from "@/generated/prisma";
import { InvalidStateTransitionError } from "@/lib/errors";

/**
 * Authoritative transition matrix for InterviewRoundStatus.
 */
export const ALLOWED_ROUND_TRANSITIONS: Readonly<Record<InterviewRoundStatus, readonly InterviewRoundStatus[]>> = {
  [InterviewRoundStatus.ROUND_REQUESTED]: [
    InterviewRoundStatus.ROUND_SCHEDULED,
    InterviewRoundStatus.ROUND_CANCELLED,
  ],
  [InterviewRoundStatus.ROUND_SCHEDULED]: [
    InterviewRoundStatus.ROUND_COMPLETED,
    InterviewRoundStatus.ROUND_SCHEDULED, // In-place reschedule / time update
    InterviewRoundStatus.ROUND_CANCELLED,
  ],
  [InterviewRoundStatus.ROUND_COMPLETED]: [
    InterviewRoundStatus.DEBRIEF_PENDING,
    InterviewRoundStatus.DEBRIEF_COMPLETED,
    InterviewRoundStatus.ROUND_CONCLUDED,
  ],
  [InterviewRoundStatus.DEBRIEF_PENDING]: [
    InterviewRoundStatus.DEBRIEF_COMPLETED,
    InterviewRoundStatus.ROUND_CONCLUDED,
  ],
  [InterviewRoundStatus.DEBRIEF_COMPLETED]: [
    InterviewRoundStatus.ROUND_CONCLUDED,
  ],
  [InterviewRoundStatus.ROUND_CONCLUDED]: [], // Terminal state
  [InterviewRoundStatus.ROUND_CANCELLED]: [], // Terminal state
};

/**
 * Validates whether a transition from fromStatus to toStatus is permitted.
 */
export function isValidRoundTransition(
  fromStatus: InterviewRoundStatus,
  toStatus: InterviewRoundStatus
): boolean {
  const allowed = ALLOWED_ROUND_TRANSITIONS[fromStatus];
  if (!allowed) {
    return false;
  }
  return allowed.includes(toStatus);
}

/**
 * Asserts that a transition from fromStatus to toStatus is valid.
 * Throws InvalidStateTransitionError if illegal.
 */
export function assertValidRoundTransition(
  fromStatus: InterviewRoundStatus,
  toStatus: InterviewRoundStatus,
  roundId?: string
): void {
  if (!isValidRoundTransition(fromStatus, toStatus)) {
    const roundContext = roundId ? ` for round ${roundId}` : "";
    throw new InvalidStateTransitionError(
      `Illegal interview round transition${roundContext} from '${fromStatus}' to '${toStatus}'.`
    );
  }
}
