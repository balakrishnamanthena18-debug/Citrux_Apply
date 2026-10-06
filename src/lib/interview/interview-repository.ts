/**
 * Phase 8C.1 — Interview Operating System Persistence Foundation
 * Repository layer for Interview, InterviewRound, and InterviewDebrief.
 * Contract: docs/engineering/PHASE_8B_INTERVIEW_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 */

import { prisma } from "@/lib/db/prisma";
import {
  InterviewStatus,
  InterviewRoundStatus,
  type Interview,
  type InterviewRound,
  type InterviewDebrief,
  type CreateInterviewInput,
  type CreateInterviewRoundInput,
  type UpdateInterviewRoundInput,
  type CreateInterviewDebriefInput,
  isValidIanaTimezone,
} from "./types";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { Prisma } from "@/generated/prisma";

type Tx = Prisma.TransactionClient;

function getDb(tx?: Tx) {
  return tx || prisma;
}

/**
 * Finds an Interview record by its parent Application ID within the organization.
 */
export async function findInterviewByApplicationId(
  applicationId: string,
  organizationId: string,
  tx?: Tx
): Promise<(Interview & { rounds: InterviewRound[] }) | null> {
  const db = getDb(tx);
  return db.interview.findFirst({
    where: {
      applicationId,
      organizationId,
    },
    include: {
      rounds: {
        where: {
          voidedAt: null,
        },
        orderBy: {
          roundNumber: "asc",
        },
      },
    },
  });
}

/**
 * Finds an Interview by its primary ID within the organization.
 */
export async function findInterviewById(
  id: string,
  organizationId: string,
  tx?: Tx
): Promise<(Interview & { rounds: InterviewRound[] }) | null> {
  const db = getDb(tx);
  return db.interview.findFirst({
    where: {
      id,
      organizationId,
    },
    include: {
      rounds: {
        where: {
          voidedAt: null,
        },
        orderBy: {
          roundNumber: "asc",
        },
      },
    },
  });
}

/**
 * Creates a new Interview record linked strictly to an Application.
 */
export async function createInterview(
  input: CreateInterviewInput,
  tx?: Tx
): Promise<Interview> {
  const db = getDb(tx);
  return db.interview.create({
    data: {
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      status: input.status || InterviewStatus.ACTIVE,
    },
  });
}

/**
 * Retrieves all active (non-voided) rounds for an interview.
 */
export async function findRoundsByInterviewId(
  interviewId: string,
  organizationId: string,
  tx?: Tx
): Promise<(InterviewRound & { debrief: InterviewDebrief | null })[]> {
  const db = getDb(tx);
  return db.interviewRound.findMany({
    where: {
      interviewId,
      organizationId,
      voidedAt: null,
    },
    include: {
      debrief: true,
    },
    orderBy: {
      roundNumber: "asc",
    },
  });
}

/**
 * Finds a specific InterviewRound by ID within the organization.
 */
export async function findRoundById(
  id: string,
  organizationId: string,
  tx?: Tx
): Promise<(InterviewRound & { debrief: InterviewDebrief | null; interview: Interview }) | null> {
  const db = getDb(tx);
  return db.interviewRound.findFirst({
    where: {
      id,
      organizationId,
    },
    include: {
      debrief: true,
      interview: true,
    },
  });
}

/**
 * Creates a new sequential InterviewRound for an Interview.
 */
export async function createInterviewRound(
  input: CreateInterviewRoundInput,
  tx?: Tx
): Promise<InterviewRound> {
  const db = getDb(tx);

  if (input.timezone && !isValidIanaTimezone(input.timezone)) {
    throw new ValidationError(`Invalid IANA timezone identifier: ${input.timezone}`);
  }

  // Determine roundNumber if not provided
  let roundNum = input.roundNumber;
  if (!roundNum) {
    const lastRound = await db.interviewRound.findFirst({
      where: {
        interviewId: input.interviewId,
      },
      orderBy: {
        roundNumber: "desc",
      },
      select: {
        roundNumber: true,
      },
    });
    roundNum = (lastRound?.roundNumber || 0) + 1;
  }

  return db.interviewRound.create({
    data: {
      interviewId: input.interviewId,
      organizationId: input.organizationId,
      roundNumber: roundNum,
      roundType: input.roundType || "RECRUITER_SCREEN",
      roundTitle: input.roundTitle,
      status: input.status || InterviewRoundStatus.ROUND_REQUESTED,
      scheduledStartTime: input.scheduledStartTime || null,
      scheduledEndTime: input.scheduledEndTime || null,
      timezone: input.timezone || null,
      format: input.format || "VIRTUAL",
      meetingUrl: input.meetingUrl || null,
      location: input.location || null,
      interviewers: (input.interviewers as Prisma.InputJsonValue) || [],
      preparationBrief: (input.preparationBrief as Prisma.InputJsonValue) || {},
      internalStaffNotes: input.internalStaffNotes || null,
      candidatePreparationNotes: input.candidatePreparationNotes || null,
    },
  });
}

/**
 * Updates an InterviewRound.
 */
export async function updateInterviewRound(
  id: string,
  organizationId: string,
  input: UpdateInterviewRoundInput,
  tx?: Tx
): Promise<InterviewRound> {
  const db = getDb(tx);

  if (input.timezone && !isValidIanaTimezone(input.timezone)) {
    throw new ValidationError(`Invalid IANA timezone identifier: ${input.timezone}`);
  }

  const existing = await db.interviewRound.findFirst({
    where: {
      id,
      organizationId,
    },
  });

  if (!existing) {
    throw new NotFoundError("Interview round not found");
  }

  return db.interviewRound.update({
    where: {
      id,
    },
    data: {
      roundTitle: input.roundTitle !== undefined ? input.roundTitle : undefined,
      status: input.status !== undefined ? input.status : undefined,
      scheduledStartTime: input.scheduledStartTime !== undefined ? input.scheduledStartTime : undefined,
      scheduledEndTime: input.scheduledEndTime !== undefined ? input.scheduledEndTime : undefined,
      timezone: input.timezone !== undefined ? input.timezone : undefined,
      format: input.format !== undefined ? input.format : undefined,
      meetingUrl: input.meetingUrl !== undefined ? input.meetingUrl : undefined,
      location: input.location !== undefined ? input.location : undefined,
      interviewers: input.interviewers !== undefined ? (input.interviewers as Prisma.InputJsonValue) : undefined,
      preparationBrief: input.preparationBrief !== undefined ? (input.preparationBrief as Prisma.InputJsonValue) : undefined,
      internalStaffNotes: input.internalStaffNotes !== undefined ? input.internalStaffNotes : undefined,
      candidatePreparationNotes: input.candidatePreparationNotes !== undefined ? input.candidatePreparationNotes : undefined,
      occurredAt: input.occurredAt !== undefined ? input.occurredAt : undefined,
      outcome: input.outcome !== undefined ? input.outcome : undefined,
      outcomeNotes: input.outcomeNotes !== undefined ? input.outcomeNotes : undefined,
      rescheduledBy: input.rescheduledBy !== undefined ? input.rescheduledBy : undefined,
      rescheduleReason: input.rescheduleReason !== undefined ? input.rescheduleReason : undefined,
      cancelledBy: input.cancelledBy !== undefined ? input.cancelledBy : undefined,
      cancelReason: input.cancelReason !== undefined ? input.cancelReason : undefined,
      voidedAt: input.voidedAt !== undefined ? input.voidedAt : undefined,
      voidedById: input.voidedById !== undefined ? input.voidedById : undefined,
      voidReason: input.voidReason !== undefined ? input.voidReason : undefined,
      supersededById: input.supersededById !== undefined ? input.supersededById : undefined,
    },
  });
}

/**
 * Voids an InterviewRound (O2 Void-Only).
 */
export async function voidInterviewRound(
  id: string,
  organizationId: string,
  voidedById: string,
  voidReason: string,
  tx?: Tx
): Promise<InterviewRound> {
  const db = getDb(tx);

  const existing = await db.interviewRound.findFirst({
    where: {
      id,
      organizationId,
    },
  });

  if (!existing) {
    throw new NotFoundError("Interview round not found");
  }

  return db.interviewRound.update({
    where: {
      id,
    },
    data: {
      voidedAt: new Date(),
      voidedById,
      voidReason,
    },
  });
}

/**
 * Creates or updates an InterviewDebrief for a completed round.
 */
export async function createInterviewDebrief(
  input: CreateInterviewDebriefInput,
  tx?: Tx
): Promise<InterviewDebrief> {
  const db = getDb(tx);

  const round = await db.interviewRound.findFirst({
    where: {
      id: input.roundId,
      organizationId: input.organizationId,
    },
  });

  if (!round) {
    throw new NotFoundError("Interview round not found");
  }

  return db.interviewDebrief.create({
    data: {
      roundId: input.roundId,
      organizationId: input.organizationId,
      candidateSentiment: input.candidateSentiment || "NEUTRAL",
      questionsAsked: (input.questionsAsked as Prisma.InputJsonValue) || [],
      candidateFeedbackNotes: input.candidateFeedbackNotes || null,
      staffAssessmentNotes: input.staffAssessmentNotes || null,
      followUpItems: input.followUpItems || null,
      submittedById: input.submittedById,
      submittedAt: input.submittedAt || new Date(),
    },
  });
}

/**
 * Finds all active Interviews for a Candidate within the organization.
 */
export async function findActiveInterviewsForCandidate(
  candidateId: string,
  organizationId: string,
  tx?: Tx
): Promise<(Interview & { rounds: InterviewRound[] })[]> {
  const db = getDb(tx);
  return db.interview.findMany({
    where: {
      candidateId,
      organizationId,
      status: InterviewStatus.ACTIVE,
    },
    include: {
      rounds: {
        where: {
          voidedAt: null,
        },
        orderBy: {
          roundNumber: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
