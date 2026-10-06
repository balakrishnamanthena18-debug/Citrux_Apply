/**
 * Phase 8C.2 — Interview Operating System Single Authoritative Mutation Gateway
 * All Interview & InterviewRound lifecycle mutations must pass through this service.
 * Contract: docs/engineering/PHASE_8B_INTERVIEW_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 */

import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { logUserAuditEvent } from "@/lib/audit";
import {
  AuditAction,
  InterviewStatus,
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewFormat,
  InterviewRoundOutcome,
  InterviewSentiment,
  Role,
  type Prisma,
} from "@/generated/prisma";
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import {
  isValidIanaTimezone,
  type InterviewerInfo,
  type InterviewQuestionItem,
  type PreparationBriefPayload,
} from "./types";
import { assertValidRoundTransition } from "./lifecycle";
import { assertInterviewAccess, assertRoundAccess } from "./authorization";

type Tx = Prisma.TransactionClient;

export interface CreateInterviewServiceInput {
  applicationId: string;
}

export interface CreateRoundServiceInput {
  interviewId: string;
  roundType?: InterviewRoundType;
  roundTitle: string;
  format?: InterviewFormat;
  scheduledStartTime?: Date | null;
  scheduledEndTime?: Date | null;
  timezone?: string | null;
  meetingUrl?: string | null;
  location?: string | null;
  interviewers?: InterviewerInfo[];
  preparationBrief?: PreparationBriefPayload;
  internalStaffNotes?: string | null;
  candidatePreparationNotes?: string | null;
}

export interface ScheduleRoundServiceInput {
  scheduledStartTime: Date;
  scheduledEndTime?: Date | null;
  timezone: string;
  format?: InterviewFormat;
  meetingUrl?: string | null;
  location?: string | null;
  interviewers?: InterviewerInfo[];
}

export interface RescheduleRoundServiceInput {
  newScheduledStartTime: Date;
  newScheduledEndTime?: Date | null;
  newTimezone: string;
  rescheduledBy: "CANDIDATE" | "EMPLOYER" | "MUTUAL";
  rescheduleReason?: string | null;
  meetingUrl?: string | null;
  location?: string | null;
}

export interface CancelRoundServiceInput {
  cancelledBy: "CANDIDATE" | "EMPLOYER";
  cancelReason: string;
}

export interface CompleteRoundServiceInput {
  occurredAt?: Date;
}

export interface RecordDebriefServiceInput {
  candidateSentiment?: InterviewSentiment;
  questionsAsked?: InterviewQuestionItem[];
  candidateFeedbackNotes?: string | null;
  staffAssessmentNotes?: string | null;
  followUpItems?: string | null;
}

export interface ConcludeRoundServiceInput {
  outcome: InterviewRoundOutcome;
  outcomeNotes?: string | null;
}

export interface VoidRoundServiceInput {
  voidReason: string;
}

export class InterviewService {
  /**
   * Creates an Interview container for an application.
   * Enforces 1:1 Application-to-Interview cardinality and tenant isolation.
   */
  static async createInterview(
    ctx: AuthenticatedContext,
    input: CreateInterviewServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const application = await tx.application.findFirst({
        where: {
          id: input.applicationId,
          organizationId: ctx.organizationId,
        },
        select: {
          id: true,
          candidateId: true,
          jobId: true,
          organizationId: true,
          candidate: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!application) {
        throw new NotFoundError("Application not found");
      }

      // Authorization check
      if (ctx.role === Role.CANDIDATE && application.candidate.userId !== ctx.userId) {
        throw new AuthorizationError("You cannot create an interview record for another candidate.");
      }

      // Check for existing interview
      const existing = await tx.interview.findUnique({
        where: {
          applicationId: input.applicationId,
        },
      });

      if (existing) {
        if (existing.organizationId !== ctx.organizationId) {
          throw new AuthorizationError("Cross-tenant interview access forbidden.");
        }
        return existing;
      }

      const interview = await tx.interview.create({
        data: {
          organizationId: ctx.organizationId,
          applicationId: input.applicationId,
          candidateId: application.candidateId,
          jobId: application.jobId,
          status: InterviewStatus.ACTIVE,
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_CREATED,
        entityType: "Interview",
        entityId: interview.id,
        details: {
          applicationId: application.id,
          candidateId: application.candidateId,
          jobId: application.jobId,
        },
        tx,
      });

      return interview;
    });
  }

  /**
   * Creates a new sequential InterviewRound.
   */
  static async createRound(
    ctx: AuthenticatedContext,
    input: CreateRoundServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const { interview, scope } = await assertInterviewAccess(tx, ctx, input.interviewId, {
        requireMutation: true,
      });

      if (input.timezone && !isValidIanaTimezone(input.timezone)) {
        throw new ValidationError(`Invalid IANA timezone identifier: ${input.timezone}`);
      }

      if (input.scheduledStartTime && input.scheduledEndTime) {
        if (input.scheduledEndTime <= input.scheduledStartTime) {
          throw new ValidationError("Scheduled end time must be after scheduled start time.");
        }
      }

      // Candidate-safe redaction on creation
      const internalStaffNotes = scope.isStaffPrivileged ? input.internalStaffNotes || null : null;

      // Determine next sequential round number
      const lastRound = await tx.interviewRound.findFirst({
        where: {
          interviewId: interview.id,
        },
        orderBy: {
          roundNumber: "desc",
        },
        select: {
          roundNumber: true,
        },
      });
      const nextRoundNumber = (lastRound?.roundNumber || 0) + 1;

      const initialStatus = input.scheduledStartTime && input.timezone
        ? InterviewRoundStatus.ROUND_SCHEDULED
        : InterviewRoundStatus.ROUND_REQUESTED;

      const round = await tx.interviewRound.create({
        data: {
          interviewId: interview.id,
          organizationId: ctx.organizationId,
          roundNumber: nextRoundNumber,
          roundType: input.roundType || InterviewRoundType.RECRUITER_SCREEN,
          roundTitle: input.roundTitle,
          status: initialStatus,
          scheduledStartTime: input.scheduledStartTime || null,
          scheduledEndTime: input.scheduledEndTime || null,
          timezone: input.timezone || null,
          format: input.format || InterviewFormat.VIRTUAL,
          meetingUrl: input.meetingUrl || null,
          location: input.location || null,
          interviewers: (input.interviewers as Prisma.InputJsonValue) || [],
          preparationBrief: (input.preparationBrief as Prisma.InputJsonValue) || {},
          internalStaffNotes,
          candidatePreparationNotes: input.candidatePreparationNotes || null,
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_ROUND_CREATED,
        entityType: "InterviewRound",
        entityId: round.id,
        details: {
          interviewId: interview.id,
          roundNumber: nextRoundNumber,
          roundType: round.roundType,
          status: initialStatus,
        },
        tx,
      });

      return round;
    });
  }

  /**
   * Schedules an InterviewRound with validated times and timezone.
   */
  static async scheduleRound(
    ctx: AuthenticatedContext,
    roundId: string,
    input: ScheduleRoundServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const { round } = await assertRoundAccess(tx, ctx, roundId, { requireMutation: true });

      if (round.voidedAt) {
        throw new ValidationError("Cannot schedule a voided interview round.");
      }

      assertValidRoundTransition(
        round.status as InterviewRoundStatus,
        InterviewRoundStatus.ROUND_SCHEDULED,
        round.id
      );

      if (!isValidIanaTimezone(input.timezone)) {
        throw new ValidationError(`Invalid IANA timezone identifier: ${input.timezone}`);
      }

      if (input.scheduledEndTime && input.scheduledEndTime <= input.scheduledStartTime) {
        throw new ValidationError("Scheduled end time must be after scheduled start time.");
      }

      const updated = await tx.interviewRound.update({
        where: { id: round.id },
        data: {
          status: InterviewRoundStatus.ROUND_SCHEDULED,
          scheduledStartTime: input.scheduledStartTime,
          scheduledEndTime: input.scheduledEndTime || null,
          timezone: input.timezone,
          format: input.format !== undefined ? input.format : undefined,
          meetingUrl: input.meetingUrl !== undefined ? input.meetingUrl : undefined,
          location: input.location !== undefined ? input.location : undefined,
          interviewers: input.interviewers !== undefined ? (input.interviewers as Prisma.InputJsonValue) : undefined,
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_ROUND_SCHEDULED,
        entityType: "InterviewRound",
        entityId: round.id,
        details: {
          scheduledStartTime: input.scheduledStartTime.toISOString(),
          timezone: input.timezone,
          format: updated.format,
        },
        tx,
      });

      return updated;
    });
  }

  /**
   * Reschedules an InterviewRound and records attribution.
   */
  static async rescheduleRound(
    ctx: AuthenticatedContext,
    roundId: string,
    input: RescheduleRoundServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const { round } = await assertRoundAccess(tx, ctx, roundId, { requireMutation: true });

      if (round.voidedAt) {
        throw new ValidationError("Cannot reschedule a voided interview round.");
      }

      if (
        round.status !== InterviewRoundStatus.ROUND_SCHEDULED &&
        round.status !== InterviewRoundStatus.ROUND_REQUESTED
      ) {
        throw new InvalidStateTransitionError(
          `Cannot reschedule a round in '${round.status}' status.`
        );
      }

      if (!isValidIanaTimezone(input.newTimezone)) {
        throw new ValidationError(`Invalid IANA timezone identifier: ${input.newTimezone}`);
      }

      if (input.newScheduledEndTime && input.newScheduledEndTime <= input.newScheduledStartTime) {
        throw new ValidationError("Scheduled end time must be after scheduled start time.");
      }

      const previousSchedule = {
        startTime: round.scheduledStartTime?.toISOString() || null,
        endTime: round.scheduledEndTime?.toISOString() || null,
        timezone: round.timezone,
      };

      const updated = await tx.interviewRound.update({
        where: { id: round.id },
        data: {
          status: InterviewRoundStatus.ROUND_SCHEDULED,
          scheduledStartTime: input.newScheduledStartTime,
          scheduledEndTime: input.newScheduledEndTime || null,
          timezone: input.newTimezone,
          rescheduledBy: input.rescheduledBy,
          rescheduleReason: input.rescheduleReason || null,
          meetingUrl: input.meetingUrl !== undefined ? input.meetingUrl : undefined,
          location: input.location !== undefined ? input.location : undefined,
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_ROUND_RESCHEDULED,
        entityType: "InterviewRound",
        entityId: round.id,
        details: {
          previousSchedule,
          newStartTime: input.newScheduledStartTime.toISOString(),
          newTimezone: input.newTimezone,
          rescheduledBy: input.rescheduledBy,
          rescheduleReason: input.rescheduleReason,
        },
        tx,
      });

      return updated;
    });
  }

  /**
   * Cancels an InterviewRound with mandatory reason and attribution.
   */
  static async cancelRound(
    ctx: AuthenticatedContext,
    roundId: string,
    input: CancelRoundServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const { round } = await assertRoundAccess(tx, ctx, roundId, { requireMutation: true });

      if (round.voidedAt) {
        throw new ValidationError("Cannot cancel a voided interview round.");
      }

      assertValidRoundTransition(
        round.status as InterviewRoundStatus,
        InterviewRoundStatus.ROUND_CANCELLED,
        round.id
      );

      if (!input.cancelReason || input.cancelReason.trim() === "") {
        throw new ValidationError("A cancellation reason is required.");
      }

      const updated = await tx.interviewRound.update({
        where: { id: round.id },
        data: {
          status: InterviewRoundStatus.ROUND_CANCELLED,
          cancelledBy: input.cancelledBy,
          cancelReason: input.cancelReason.trim(),
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_ROUND_CANCELLED,
        entityType: "InterviewRound",
        entityId: round.id,
        details: {
          cancelledBy: input.cancelledBy,
          cancelReason: input.cancelReason.trim(),
          previousStatus: round.status,
        },
        tx,
      });

      return updated;
    });
  }

  /**
   * Completes an InterviewRound when the scheduled session has occurred.
   */
  static async completeRound(
    ctx: AuthenticatedContext,
    roundId: string,
    input?: CompleteRoundServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const { round } = await assertRoundAccess(tx, ctx, roundId, { requireMutation: true });

      if (round.voidedAt) {
        throw new ValidationError("Cannot complete a voided interview round.");
      }

      assertValidRoundTransition(
        round.status as InterviewRoundStatus,
        InterviewRoundStatus.ROUND_COMPLETED,
        round.id
      );

      const occurredAt = input?.occurredAt || new Date();

      const updated = await tx.interviewRound.update({
        where: { id: round.id },
        data: {
          status: InterviewRoundStatus.ROUND_COMPLETED,
          occurredAt,
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_ROUND_COMPLETED,
        entityType: "InterviewRound",
        entityId: round.id,
        details: {
          occurredAt: occurredAt.toISOString(),
          roundNumber: round.roundNumber,
        },
        tx,
      });

      return updated;
    });
  }

  /**
   * Records debrief feedback, questions asked, and candidate sentiment.
   */
  static async recordDebrief(
    ctx: AuthenticatedContext,
    roundId: string,
    input: RecordDebriefServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const { round, scope } = await assertRoundAccess(tx, ctx, roundId, { requireMutation: true });

      if (round.voidedAt) {
        throw new ValidationError("Cannot record debrief for a voided interview round.");
      }

      if (
        round.status !== InterviewRoundStatus.ROUND_COMPLETED &&
        round.status !== InterviewRoundStatus.DEBRIEF_PENDING &&
        round.status !== InterviewRoundStatus.DEBRIEF_COMPLETED
      ) {
        throw new InvalidStateTransitionError(
          `Debrief can only be recorded for completed rounds, but current status is '${round.status}'.`
        );
      }

      // Staff assessment notes are redacted from candidate
      const staffAssessmentNotes = scope.isStaffPrivileged ? input.staffAssessmentNotes || null : null;

      // Upsert Debrief
      const debrief = await tx.interviewDebrief.upsert({
        where: { roundId: round.id },
        create: {
          roundId: round.id,
          organizationId: ctx.organizationId,
          candidateSentiment: input.candidateSentiment || InterviewSentiment.NEUTRAL,
          questionsAsked: (input.questionsAsked as Prisma.InputJsonValue) || [],
          candidateFeedbackNotes: input.candidateFeedbackNotes || null,
          staffAssessmentNotes,
          followUpItems: input.followUpItems || null,
          submittedById: ctx.userId,
          submittedAt: new Date(),
        },
        update: {
          candidateSentiment: input.candidateSentiment !== undefined ? input.candidateSentiment : undefined,
          questionsAsked: input.questionsAsked !== undefined ? (input.questionsAsked as Prisma.InputJsonValue) : undefined,
          candidateFeedbackNotes: input.candidateFeedbackNotes !== undefined ? input.candidateFeedbackNotes : undefined,
          staffAssessmentNotes: scope.isStaffPrivileged && input.staffAssessmentNotes !== undefined ? input.staffAssessmentNotes : undefined,
          followUpItems: input.followUpItems !== undefined ? input.followUpItems : undefined,
        },
      });

      // Update round status to DEBRIEF_COMPLETED
      await tx.interviewRound.update({
        where: { id: round.id },
        data: {
          status: InterviewRoundStatus.DEBRIEF_COMPLETED,
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_DEBRIEF_RECORDED,
        entityType: "InterviewDebrief",
        entityId: debrief.id,
        details: {
          roundId: round.id,
          sentiment: debrief.candidateSentiment,
          questionsCount: (input.questionsAsked || []).length,
        },
        tx,
      });

      return debrief;
    });
  }

  /**
   * Concludes an InterviewRound with an explicit operational outcome.
   * Staff only.
   */
  static async concludeRound(
    ctx: AuthenticatedContext,
    roundId: string,
    input: ConcludeRoundServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const { round, scope } = await assertRoundAccess(tx, ctx, roundId, { requireMutation: true });

      if (!scope.isStaffPrivileged) {
        throw new AuthorizationError("Only authorized staff can conclude an interview round.");
      }

      if (round.voidedAt) {
        throw new ValidationError("Cannot conclude a voided interview round.");
      }

      assertValidRoundTransition(
        round.status as InterviewRoundStatus,
        InterviewRoundStatus.ROUND_CONCLUDED,
        round.id
      );

      const updated = await tx.interviewRound.update({
        where: { id: round.id },
        data: {
          status: InterviewRoundStatus.ROUND_CONCLUDED,
          outcome: input.outcome,
          outcomeNotes: input.outcomeNotes || null,
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_OUTCOME_RECORDED,
        entityType: "InterviewRound",
        entityId: round.id,
        details: {
          outcome: input.outcome,
          outcomeNotes: input.outcomeNotes,
        },
        tx,
      });

      return updated;
    });
  }

  /**
   * Voids an InterviewRound (O2 Void-Only).
   * Staff only.
   */
  static async voidRound(
    ctx: AuthenticatedContext,
    roundId: string,
    input: VoidRoundServiceInput
  ) {
    return withRlsContext(ctx.userId, async (tx: Tx) => {
      const { round, scope } = await assertRoundAccess(tx, ctx, roundId, { requireMutation: true });

      if (!scope.isStaffPrivileged) {
        throw new AuthorizationError("Only authorized staff can void an interview round.");
      }

      if (round.voidedAt) {
        throw new ValidationError("Interview round is already voided.");
      }

      if (!input.voidReason || input.voidReason.trim() === "") {
        throw new ValidationError("A reason is required to void an interview round.");
      }

      const voidedAt = new Date();
      const updated = await tx.interviewRound.update({
        where: { id: round.id },
        data: {
          voidedAt,
          voidedById: ctx.userId,
          voidReason: input.voidReason.trim(),
        },
      });

      await logUserAuditEvent({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.INTERVIEW_ROUND_VOIDED,
        entityType: "InterviewRound",
        entityId: round.id,
        details: {
          voidReason: input.voidReason.trim(),
          voidedAt: voidedAt.toISOString(),
        },
        tx,
      });

      return updated;
    });
  }
}
