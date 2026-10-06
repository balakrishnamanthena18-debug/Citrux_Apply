import { z } from "zod";
import {
  InterviewRoundType,
  InterviewFormat,
  InterviewRoundOutcome,
  InterviewSentiment,
} from "@/generated/prisma";
import { isValidIanaTimezone } from "@/lib/interview/types";

const dateSchema = z
  .union([z.string().datetime({ offset: true }), z.string().datetime(), z.date()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null || v === "") return null;
    return v instanceof Date ? v : new Date(v);
  });

const timezoneSchema = z
  .string()
  .trim()
  .refine((tz) => !tz || isValidIanaTimezone(tz), {
    message: "Invalid IANA timezone identifier",
  })
  .optional()
  .nullable();

export const InterviewerInfoSchema = z.object({
  fullName: z.string().trim().min(1, "Interviewer name is required").max(200),
  roleOrTitle: z.string().trim().max(200).optional(),
  linkedinUrl: z.string().trim().url().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional(),
});

export const InterviewQuestionItemSchema = z.object({
  questionText: z.string().trim().min(1, "Question text is required").max(2000),
  category: z.enum([
    "TECHNICAL",
    "BEHAVIORAL",
    "SYSTEM_DESIGN",
    "SITUATIONAL",
    "LOGISTICS",
    "OTHER",
  ]).optional(),
  candidateAnswerNotes: z.string().trim().max(4000).optional(),
  perceivedDifficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
});

export const PreparationBriefPayloadSchema = z.object({
  targetRole: z.string().trim().max(200).optional(),
  companyName: z.string().trim().max(200).optional(),
  roundType: z.nativeEnum(InterviewRoundType).optional(),
  keyCompetenciesToEmphasize: z.array(z.string().trim()).optional(),
  highlightedProjects: z.array(z.string().trim()).optional(),
  talkingPoints: z.array(z.string().trim()).optional(),
  formatGuidelines: z.array(z.string().trim()).optional(),
  staffCoachingNotes: z.string().trim().max(4000).optional(),
  lastGeneratedAt: z.string().optional(),
});

export const CreateInterviewSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
});

export const CreateInterviewRoundSchema = z.object({
  interviewId: z.string().uuid("Invalid interview ID"),
  roundType: z.nativeEnum(InterviewRoundType).optional(),
  roundTitle: z.string().trim().min(1, "Round title is required").max(200),
  format: z.nativeEnum(InterviewFormat).optional(),
  scheduledStartTime: dateSchema,
  scheduledEndTime: dateSchema,
  timezone: timezoneSchema,
  meetingUrl: z.string().trim().url().optional().nullable().or(z.literal("")),
  location: z.string().trim().max(500).optional().nullable(),
  interviewers: z.array(InterviewerInfoSchema).optional(),
  preparationBrief: PreparationBriefPayloadSchema.optional(),
  internalStaffNotes: z.string().trim().max(5000).optional().nullable(),
  candidatePreparationNotes: z.string().trim().max(5000).optional().nullable(),
});

export const ScheduleInterviewRoundSchema = z
  .object({
    roundId: z.string().uuid("Invalid round ID"),
    scheduledStartTime: z.union([z.string().datetime({ offset: true }), z.string().datetime(), z.date()]).transform((v) => (v instanceof Date ? v : new Date(v))),
    scheduledEndTime: dateSchema,
    timezone: z.string().trim().refine(isValidIanaTimezone, {
      message: "Valid IANA timezone identifier is required for scheduling",
    }),
    format: z.nativeEnum(InterviewFormat).optional(),
    meetingUrl: z.string().trim().url().optional().nullable().or(z.literal("")),
    location: z.string().trim().max(500).optional().nullable(),
    interviewers: z.array(InterviewerInfoSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scheduledEndTime && data.scheduledEndTime <= data.scheduledStartTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled end time must be strictly after start time.",
        path: ["scheduledEndTime"],
      });
    }
  });

export const RescheduleInterviewRoundSchema = z
  .object({
    roundId: z.string().uuid("Invalid round ID"),
    newScheduledStartTime: z.union([z.string().datetime({ offset: true }), z.string().datetime(), z.date()]).transform((v) => (v instanceof Date ? v : new Date(v))),
    newScheduledEndTime: dateSchema,
    newTimezone: z.string().trim().refine(isValidIanaTimezone, {
      message: "Valid IANA timezone identifier is required for rescheduling",
    }),
    rescheduledBy: z.enum(["CANDIDATE", "EMPLOYER", "MUTUAL"]),
    rescheduleReason: z.string().trim().max(2000).optional().nullable(),
    meetingUrl: z.string().trim().url().optional().nullable().or(z.literal("")),
    location: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.newScheduledEndTime && data.newScheduledEndTime <= data.newScheduledStartTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New scheduled end time must be strictly after start time.",
        path: ["newScheduledEndTime"],
      });
    }
  });

export const CancelInterviewRoundSchema = z.object({
  roundId: z.string().uuid("Invalid round ID"),
  cancelledBy: z.enum(["CANDIDATE", "EMPLOYER"]),
  cancelReason: z.string().trim().min(3, "Cancellation reason must be at least 3 characters").max(2000),
});

export const CompleteInterviewRoundSchema = z.object({
  roundId: z.string().uuid("Invalid round ID"),
  occurredAt: dateSchema,
});

export const RecordInterviewDebriefSchema = z.object({
  roundId: z.string().uuid("Invalid round ID"),
  candidateSentiment: z.nativeEnum(InterviewSentiment).optional(),
  questionsAsked: z.array(InterviewQuestionItemSchema).optional(),
  candidateFeedbackNotes: z.string().trim().max(5000).optional().nullable(),
  staffAssessmentNotes: z.string().trim().max(5000).optional().nullable(),
  followUpItems: z.string().trim().max(2000).optional().nullable(),
});

export const ConcludeInterviewRoundSchema = z.object({
  roundId: z.string().uuid("Invalid round ID"),
  outcome: z.nativeEnum(InterviewRoundOutcome),
  outcomeNotes: z.string().trim().max(5000).optional().nullable(),
});

export const VoidInterviewRoundSchema = z.object({
  roundId: z.string().uuid("Invalid round ID"),
  voidReason: z.string().trim().min(3, "Void reason must be at least 3 characters").max(2000),
});

export type CreateInterviewInput = z.infer<typeof CreateInterviewSchema>;
export type CreateInterviewRoundInput = z.infer<typeof CreateInterviewRoundSchema>;
export type ScheduleInterviewRoundInput = z.infer<typeof ScheduleInterviewRoundSchema>;
export type RescheduleInterviewRoundInput = z.infer<typeof RescheduleInterviewRoundSchema>;
export type CancelInterviewRoundInput = z.infer<typeof CancelInterviewRoundSchema>;
export type CompleteInterviewRoundInput = z.infer<typeof CompleteInterviewRoundSchema>;
export type RecordInterviewDebriefInput = z.infer<typeof RecordInterviewDebriefSchema>;
export type ConcludeInterviewRoundInput = z.infer<typeof ConcludeInterviewRoundSchema>;
export type VoidInterviewRoundInput = z.infer<typeof VoidInterviewRoundSchema>;
