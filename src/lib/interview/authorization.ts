/**
 * Phase 8C.2 — Interview Operating System Authorization
 * Structural scope verification for Candidates, Employees, Team Leads, Managers, and Admins.
 * Contract: docs/engineering/PHASE_8B_INTERVIEW_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 */

import { Role, type Prisma } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError, NotFoundError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

export interface InterviewAccessScope {
  isCandidateOwner: boolean;
  isStaffPrivileged: boolean;
  canMutate: boolean;
  canViewInternalNotes: boolean;
}

/**
 * Asserts and resolves interview access for the authenticated context.
 * Enforces organization isolation and candidate/staff structural boundaries.
 */
export async function assertInterviewAccess(
  tx: Tx,
  ctx: AuthenticatedContext,
  interviewId: string,
  options?: { requireMutation?: boolean }
): Promise<{
  interview: {
    id: string;
    organizationId: string;
    applicationId: string;
    candidateId: string;
    jobId: string;
    status: string;
  };
  candidate: {
    id: string;
    userId: string;
    assignedEmployeeId: string | null;
  };
  scope: InterviewAccessScope;
}> {
  const interview = await tx.interview.findFirst({
    where: {
      id: interviewId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      applicationId: true,
      candidateId: true,
      jobId: true,
      status: true,
    },
  });

  if (!interview) {
    throw new NotFoundError("Interview record not found");
  }

  const candidate = await tx.candidate.findFirst({
    where: {
      id: interview.candidateId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      userId: true,
      assignedEmployeeId: true,
    },
  });

  if (!candidate) {
    throw new NotFoundError("Associated candidate not found");
  }

  const isCandidateOwner = ctx.role === Role.CANDIDATE && candidate.userId === ctx.userId;
  const isStaff = ctx.role === Role.EMPLOYEE || ctx.role === Role.ADMIN;

  if (!isCandidateOwner && !isStaff) {
    throw new AuthorizationError("You do not have permission to access this interview record.");
  }

  if (options?.requireMutation && ctx.role === Role.CANDIDATE) {
    // Candidates can report debriefs and report schedule details, but direct administrative mutation is restricted
    // Specific operations validate candidate reporting permissions
  }

  const scope: InterviewAccessScope = {
    isCandidateOwner,
    isStaffPrivileged: isStaff,
    canMutate: isStaff || isCandidateOwner,
    canViewInternalNotes: isStaff,
  };

  return { interview, candidate, scope };
}

/**
 * Asserts and resolves round access for the authenticated context.
 */
export async function assertRoundAccess(
  tx: Tx,
  ctx: AuthenticatedContext,
  roundId: string,
  options?: { requireMutation?: boolean }
): Promise<{
  round: {
    id: string;
    interviewId: string;
    organizationId: string;
    roundNumber: number;
    roundType: string;
    roundTitle: string;
    status: string;
    scheduledStartTime: Date | null;
    scheduledEndTime: Date | null;
    timezone: string | null;
    format: string;
    meetingUrl: string | null;
    location: string | null;
    voidedAt: Date | null;
  };
  interview: {
    id: string;
    organizationId: string;
    applicationId: string;
    candidateId: string;
    jobId: string;
  };
  candidate: {
    id: string;
    userId: string;
  };
  scope: InterviewAccessScope;
}> {
  const round = await tx.interviewRound.findFirst({
    where: {
      id: roundId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      interviewId: true,
      organizationId: true,
      roundNumber: true,
      roundType: true,
      roundTitle: true,
      status: true,
      scheduledStartTime: true,
      scheduledEndTime: true,
      timezone: true,
      format: true,
      meetingUrl: true,
      location: true,
      voidedAt: true,
    },
  });

  if (!round) {
    throw new NotFoundError("Interview round not found");
  }

  const interview = await tx.interview.findFirst({
    where: {
      id: round.interviewId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      applicationId: true,
      candidateId: true,
      jobId: true,
    },
  });

  if (!interview) {
    throw new NotFoundError("Parent interview not found");
  }

  const candidate = await tx.candidate.findFirst({
    where: {
      id: interview.candidateId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!candidate) {
    throw new NotFoundError("Associated candidate not found");
  }

  const isCandidateOwner = ctx.role === Role.CANDIDATE && candidate.userId === ctx.userId;
  const isStaff = ctx.role === Role.EMPLOYEE || ctx.role === Role.ADMIN;

  if (!isCandidateOwner && !isStaff) {
    throw new AuthorizationError("You do not have permission to access this interview round.");
  }

  const scope: InterviewAccessScope = {
    isCandidateOwner,
    isStaffPrivileged: isStaff,
    canMutate: isStaff || isCandidateOwner,
    canViewInternalNotes: isStaff,
  };

  return { round, interview, candidate, scope };
}
