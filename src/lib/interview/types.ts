/**
 * Phase 8C.1 — Interview Operating System Types & Enums
 * Contract: docs/engineering/PHASE_8B_INTERVIEW_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 */

import {
  InterviewStatus,
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewFormat,
  InterviewRoundOutcome,
  InterviewSentiment,
  type Interview,
  type InterviewRound,
  type InterviewDebrief,
  type Prisma,
} from "@/generated/prisma";

export {
  InterviewStatus,
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewFormat,
  InterviewRoundOutcome,
  InterviewSentiment,
  type Interview,
  type InterviewRound,
  type InterviewDebrief,
};

export type InterviewerInfo = {
  fullName: string;
  roleOrTitle?: string;
  linkedinUrl?: string;
  notes?: string;
};

export type InterviewQuestionItem = {
  questionText: string;
  category?: "TECHNICAL" | "BEHAVIORAL" | "SYSTEM_DESIGN" | "SITUATIONAL" | "LOGISTICS" | "OTHER";
  candidateAnswerNotes?: string;
  perceivedDifficulty?: "EASY" | "MEDIUM" | "HARD";
};

export type PreparationBriefPayload = {
  targetRole?: string;
  companyName?: string;
  roundType?: InterviewRoundType;
  keyCompetenciesToEmphasize?: string[];
  highlightedProjects?: string[];
  talkingPoints?: string[];
  formatGuidelines?: string[];
  staffCoachingNotes?: string;
  lastGeneratedAt?: string;
};

export type CreateInterviewInput = {
  organizationId: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  status?: InterviewStatus;
};

export type CreateInterviewRoundInput = {
  interviewId: string;
  organizationId: string;
  roundNumber?: number;
  roundType?: InterviewRoundType;
  roundTitle: string;
  status?: InterviewRoundStatus;
  scheduledStartTime?: Date | null;
  scheduledEndTime?: Date | null;
  timezone?: string | null;
  format?: InterviewFormat;
  meetingUrl?: string | null;
  location?: string | null;
  interviewers?: InterviewerInfo[];
  preparationBrief?: PreparationBriefPayload;
  internalStaffNotes?: string | null;
  candidatePreparationNotes?: string | null;
};

export type UpdateInterviewRoundInput = {
  roundTitle?: string;
  status?: InterviewRoundStatus;
  scheduledStartTime?: Date | null;
  scheduledEndTime?: Date | null;
  timezone?: string | null;
  format?: InterviewFormat;
  meetingUrl?: string | null;
  location?: string | null;
  interviewers?: InterviewerInfo[];
  preparationBrief?: PreparationBriefPayload;
  internalStaffNotes?: string | null;
  candidatePreparationNotes?: string | null;
  occurredAt?: Date | null;
  outcome?: InterviewRoundOutcome | null;
  outcomeNotes?: string | null;
  rescheduledBy?: string | null;
  rescheduleReason?: string | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
  voidedAt?: Date | null;
  voidedById?: string | null;
  voidReason?: string | null;
  supersededById?: string | null;
};

export type CreateInterviewDebriefInput = {
  roundId: string;
  organizationId: string;
  candidateSentiment?: InterviewSentiment;
  questionsAsked?: InterviewQuestionItem[];
  candidateFeedbackNotes?: string | null;
  staffAssessmentNotes?: string | null;
  followUpItems?: string | null;
  submittedById: string;
  submittedAt?: Date;
};

/**
 * Validates whether a given string is a valid canonical IANA timezone.
 */
export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== "string" || timezone.trim() === "") {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
