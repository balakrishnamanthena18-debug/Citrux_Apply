/**
 * Phase 9D — Offer & Placement Operating System (OPOS) Authorization
 * Structural scope validation for Candidates, Employees, Team Leads, Managers, and Admins.
 * Contract: docs/engineering/PHASE_9A_OFFER_PLACEMENT_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 * Decision Lock: docs/engineering/PHASE_9B_OPOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md
 */

import { Role, type Prisma } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError, NotFoundError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

export interface OfferAccessScope {
  isCandidateOwner: boolean;
  isStaffPrivileged: boolean;
  canMutate: boolean;
  canViewInternalNotes: boolean;
  canDecide: boolean;
  canVerifyPlacement: boolean;
}

export interface ResolvedOfferContext {
  offer: {
    id: string;
    organizationId: string;
    applicationId: string;
    candidateId: string;
    jobId: string;
    status: string;
    currentVersionNumber: number;
    verificationState: string;
  };
  candidate: {
    id: string;
    userId: string;
    assignedEmployeeId: string | null;
  };
  application: {
    id: string;
    status: string;
    assignedEmployeeId: string | null;
    assignedTeamKey: string | null;
    assignedManagerId: string | null;
  };
  scope: OfferAccessScope;
}

/**
 * Asserts and resolves Offer access for the authenticated context.
 * Enforces organization boundary, candidate ownership, and staff structural access.
 */
export async function assertOfferAccess(
  tx: Tx,
  ctx: AuthenticatedContext,
  offerId: string,
  options?: {
    requireCandidateDecision?: boolean;
    requireStaffPrivilege?: boolean;
    requireMutation?: boolean;
  }
): Promise<ResolvedOfferContext> {
  const offer = await tx.offer.findFirst({
    where: {
      id: offerId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      applicationId: true,
      candidateId: true,
      jobId: true,
      status: true,
      currentVersionNumber: true,
      verificationState: true,
    },
  });

  if (!offer) {
    throw new NotFoundError(`Offer with ID ${offerId} not found.`);
  }

  const candidate = await tx.candidate.findFirst({
    where: {
      id: offer.candidateId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      userId: true,
      assignedEmployeeId: true,
    },
  });

  if (!candidate) {
    throw new NotFoundError("Associated candidate record not found.");
  }

  const application = await tx.application.findFirst({
    where: {
      id: offer.applicationId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      status: true,
      assignedEmployeeId: true,
      assignedTeamKey: true,
      assignedManagerId: true,
    },
  });

  if (!application) {
    throw new NotFoundError("Associated application record not found.");
  }

  const isCandidateOwner = ctx.role === Role.CANDIDATE && candidate.userId === ctx.userId;
  const isStaff = ctx.role === Role.EMPLOYEE || ctx.role === Role.ADMIN;

  if (!isCandidateOwner && !isStaff) {
    throw new AuthorizationError("You do not have permission to access this offer.");
  }

  if (options?.requireCandidateDecision && !isCandidateOwner && ctx.role === Role.CANDIDATE) {
    throw new AuthorizationError("Only the candidate owner can decide on this offer.");
  }

  if (options?.requireStaffPrivilege && !isStaff) {
    throw new AuthorizationError("Staff authority required for this operation.");
  }

  const scope: OfferAccessScope = {
    isCandidateOwner,
    isStaffPrivileged: isStaff,
    canMutate: isStaff || isCandidateOwner,
    canViewInternalNotes: isStaff,
    canDecide: isCandidateOwner,
    canVerifyPlacement: isStaff,
  };

  return { offer, candidate, application, scope };
}

/**
 * Asserts candidate sovereignty for decision execution (ACCEPT / DECLINE / REQUEST_NEGOTIATION).
 * The frozen OPOS authority rule is: ONLY THE CANDIDATE MAY AUTHORIZE ACCEPT OR DECLINE.
 * No employee, team lead, manager, admin, AI, system worker, or on-behalf mechanism is permitted.
 */
export function assertCandidateDecisionAuthority(
  ctx: AuthenticatedContext,
  candidateUserId: string
): void {
  if (ctx.role !== Role.CANDIDATE || ctx.userId !== candidateUserId) {
    throw new AuthorizationError(
      "Only the candidate owner can authorize an offer decision. Staff on-behalf execution is strictly prohibited."
    );
  }
}

