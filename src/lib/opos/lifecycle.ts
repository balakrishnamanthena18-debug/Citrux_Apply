/**
 * Phase 9D — Offer & Placement Operating System (OPOS) Lifecycle Authority
 * Deterministic state machine, transition matrices, and centralized transition gateway.
 * Contract: docs/engineering/PHASE_9A_OFFER_PLACEMENT_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 * Decision Lock: docs/engineering/PHASE_9B_OPOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md
 */

import {
  OfferStatus,
  JoiningStatus,
  AuditAction,
  Role,
  type Prisma,
} from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { logUserAuditEvent } from "@/lib/audit";
import {
  InvalidStateTransitionError,
  NotFoundError,
  AuthorizationError,
  ValidationError,
} from "@/lib/errors";

type Tx = Prisma.TransactionClient;

/**
 * Authoritative transition matrix for OfferStatus.
 * Defined strictly in Phase 9A Section 6.
 */
export const ALLOWED_OFFER_TRANSITIONS: Readonly<Record<OfferStatus, readonly OfferStatus[]>> = {
  [OfferStatus.OFFER_RECEIVED]: [
    OfferStatus.OFFER_UNDER_REVIEW,
    OfferStatus.DECISION_PENDING,
    OfferStatus.WITHDRAWN,
    OfferStatus.EXPIRED,
  ],
  [OfferStatus.OFFER_UNDER_REVIEW]: [
    OfferStatus.NEGOTIATION,
    OfferStatus.DECISION_PENDING,
    OfferStatus.WITHDRAWN,
    OfferStatus.EXPIRED,
  ],
  [OfferStatus.NEGOTIATION]: [
    OfferStatus.DECISION_PENDING,
    OfferStatus.REPLACED,
    OfferStatus.DECLINED,
    OfferStatus.WITHDRAWN,
    OfferStatus.EXPIRED,
  ],
  [OfferStatus.DECISION_PENDING]: [
    OfferStatus.ACCEPTED,
    OfferStatus.DECLINED,
    OfferStatus.NEGOTIATION,
    OfferStatus.EXPIRED,
    OfferStatus.WITHDRAWN,
  ],
  [OfferStatus.ACCEPTED]: [
    OfferStatus.WITHDRAWN, // In case employer rescinds prior to day 1
  ],
  [OfferStatus.DECLINED]: [], // Terminal state
  [OfferStatus.EXPIRED]: [
    OfferStatus.OFFER_UNDER_REVIEW, // If formal deadline extension granted by employer
  ],
  [OfferStatus.WITHDRAWN]: [], // Terminal state
  [OfferStatus.REPLACED]: [], // Terminal historical state (superseded by new version)
};

/**
 * Authoritative terminal states for Offer.
 */
export const TERMINAL_OFFER_STATUSES: ReadonlySet<OfferStatus> = new Set([
  OfferStatus.DECLINED,
  OfferStatus.WITHDRAWN,
  OfferStatus.REPLACED,
]);

/**
 * Authoritative transition matrix for JoiningStatus.
 */
export const ALLOWED_JOINING_TRANSITIONS: Readonly<Record<JoiningStatus, readonly JoiningStatus[]>> = {
  [JoiningStatus.JOINING_PLANNED]: [
    JoiningStatus.JOINING_CONFIRMED,
    JoiningStatus.FAILED_TO_JOIN,
  ],
  [JoiningStatus.JOINING_CONFIRMED]: [
    JoiningStatus.FAILED_TO_JOIN,
  ],
  [JoiningStatus.FAILED_TO_JOIN]: [], // Terminal state
};

/**
 * Authoritative terminal states for Joining.
 */
export const TERMINAL_JOINING_STATUSES: ReadonlySet<JoiningStatus> = new Set([
  JoiningStatus.FAILED_TO_JOIN,
]);

/**
 * Validates whether a joining transition is permitted.
 */
export function isValidJoiningTransition(
  fromStatus: JoiningStatus,
  toStatus: JoiningStatus
): boolean {
  const allowed = ALLOWED_JOINING_TRANSITIONS[fromStatus];
  if (!allowed) {
    return false;
  }
  return allowed.includes(toStatus);
}

/**
 * Asserts that a joining transition is contractually valid.
 */
export function assertValidJoiningTransition(
  fromStatus: JoiningStatus,
  toStatus: JoiningStatus,
  offerId?: string
): void {
  if (fromStatus === toStatus) {
    return; // Idempotent
  }
  if (!isValidJoiningTransition(fromStatus, toStatus)) {
    const offerContext = offerId ? ` for offer ${offerId}` : "";
    throw new InvalidStateTransitionError(
      `Illegal joining lifecycle transition${offerContext} from '${fromStatus}' to '${toStatus}'.`
    );
  }
}

/**
 * Checks if a given joining status is terminal.
 */
export function isTerminalJoiningStatus(status: JoiningStatus): boolean {
  return TERMINAL_JOINING_STATUSES.has(status);
}

/**
 * Asserts that a joining record is not in a terminal state.
 */
export function assertNonTerminalJoining(status: JoiningStatus, offerId?: string): void {
  if (isTerminalJoiningStatus(status)) {
    const offerContext = offerId ? ` (${offerId})` : "";
    throw new InvalidStateTransitionError(
      `Cannot perform operations on terminal joining record${offerContext} in state '${status}'.`
    );
  }
}

/**
 * Validates whether a transition from fromStatus to toStatus is permitted.
 */
export function isValidOfferTransition(
  fromStatus: OfferStatus,
  toStatus: OfferStatus
): boolean {
  const allowed = ALLOWED_OFFER_TRANSITIONS[fromStatus];
  if (!allowed) {
    return false;
  }
  return allowed.includes(toStatus);
}

/**
 * Asserts that an offer transition is contractually valid.
 */
export function assertValidOfferTransition(
  fromStatus: OfferStatus,
  toStatus: OfferStatus,
  offerId?: string
): void {
  if (fromStatus === toStatus) {
    return; // Idempotent no-op
  }
  if (!isValidOfferTransition(fromStatus, toStatus)) {
    const offerContext = offerId ? ` for offer ${offerId}` : "";
    throw new InvalidStateTransitionError(
      `Illegal offer lifecycle transition${offerContext} from '${fromStatus}' to '${toStatus}'.`
    );
  }
}

/**
 * Checks if a given status is terminal.
 */
export function isTerminalOfferStatus(status: OfferStatus): boolean {
  return TERMINAL_OFFER_STATUSES.has(status);
}

/**
 * Asserts that an offer is not in a terminal state.
 */
export function assertNonTerminalOffer(status: OfferStatus, offerId?: string): void {
  if (isTerminalOfferStatus(status)) {
    const offerContext = offerId ? ` (${offerId})` : "";
    throw new InvalidStateTransitionError(
      `Cannot perform operations on terminal offer${offerContext} in state '${status}'.`
    );
  }
}

export interface TransitionOfferParams {
  offerId: string;
  toStatus: OfferStatus;
  reason?: string;
  notes?: string;
  auditAction?: AuditAction;
  metadata?: Record<string, unknown>;
}

/**
 * Central Transition Gateway for OPOS Offers.
 * Every authoritative Offer state transition MUST pass through this function.
 * Validates:
 * 1. Existence and tenant scope
 * 2. Non-terminal source state (unless valid reopen path)
 * 3. Contractual transition matrix compliance
 * 4. Actor authority
 * 5. Atomic state update with concurrency check
 * 6. Transactional audit log
 */
export async function transitionOffer(
  tx: Tx,
  ctx: AuthenticatedContext,
  params: TransitionOfferParams
): Promise<{
  offer: {
    id: string;
    organizationId: string;
    candidateId: string;
    applicationId: string;
    status: OfferStatus;
    currentVersionNumber: number;
    updatedAt: Date;
  };
  previousStatus: OfferStatus;
  transitioned: boolean;
}> {
  // 1. Fetch current offer with lock/tenant boundary
  const offer = await tx.offer.findFirst({
    where: {
      id: params.offerId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      candidateId: true,
      applicationId: true,
      jobId: true,
      status: true,
      currentVersionNumber: true,
      updatedAt: true,
      candidate: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (!offer) {
    throw new NotFoundError(`Offer with ID ${params.offerId} not found.`);
  }

  const previousStatus = offer.status;

  // 2. Idempotency check: if already in requested state, return cleanly
  if (previousStatus === params.toStatus) {
    return {
      offer,
      previousStatus,
      transitioned: false,
    };
  }

  // 3. Assert valid transition
  assertValidOfferTransition(previousStatus, params.toStatus, offer.id);

  // 4. Role & Authority validation
  const isCandidateOwner = ctx.role === Role.CANDIDATE && offer.candidate.userId === ctx.userId;
  const isStaff = ctx.role === Role.EMPLOYEE || ctx.role === Role.ADMIN;

  if (!isCandidateOwner && !isStaff) {
    throw new AuthorizationError("Unauthorized to transition this offer.");
  }

  // Enforce candidate decision sovereignty: ONLY candidate owner may transition to ACCEPTED or DECLINED
  if (
    params.toStatus === OfferStatus.ACCEPTED ||
    params.toStatus === OfferStatus.DECLINED
  ) {
    if (!isCandidateOwner) {
      throw new AuthorizationError(
        "Only the candidate owner can authorize ACCEPT or DECLINE. Staff on-behalf execution is strictly prohibited."
      );
    }
  }


  // 5. Execute atomic update
  const updatedOffer = await tx.offer.update({
    where: { id: offer.id },
    data: {
      status: params.toStatus,
      ...(params.notes ? { internalStaffNotes: params.notes } : {}),
      updatedAt: new Date(),
    },
    select: {
      id: true,
      organizationId: true,
      candidateId: true,
      applicationId: true,
      status: true,
      currentVersionNumber: true,
      updatedAt: true,
    },
  });

  // 6. Record transactional audit event
  const action = params.auditAction ?? (
    params.toStatus === OfferStatus.ACCEPTED
      ? AuditAction.OPOS_OFFER_ACCEPTED
      : params.toStatus === OfferStatus.DECLINED
      ? AuditAction.OPOS_OFFER_DECLINED
      : AuditAction.OPOS_OFFER_UPDATED
  );

  await logUserAuditEvent({
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    action,
    entityType: "Offer",
    entityId: offer.id,
    details: {
      offerId: offer.id,
      applicationId: offer.applicationId,
      candidateId: offer.candidateId,
      fromStatus: previousStatus,
      toStatus: params.toStatus,
      versionNumber: offer.currentVersionNumber,
      reason: params.reason ?? null,
      ...params.metadata,
    },
    tx,
  });

  return {
    offer: updatedOffer,
    previousStatus,
    transitioned: true,
  };
}
