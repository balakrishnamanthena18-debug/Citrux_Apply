"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { ValidationError } from "@/lib/errors";
import { InterviewService } from "./interview-service";
import {
  CreateInterviewSchema,
  CreateInterviewRoundSchema,
  ScheduleInterviewRoundSchema,
  RescheduleInterviewRoundSchema,
  CancelInterviewRoundSchema,
  CompleteInterviewRoundSchema,
  RecordInterviewDebriefSchema,
  ConcludeInterviewRoundSchema,
  VoidInterviewRoundSchema,
} from "@/lib/validation/interview.schemas";

function revalidateInterviewViews(applicationId?: string) {
  try {
    revalidatePath("/employee/interviews");
    revalidatePath("/candidate/interviews");
    revalidatePath("/employee/applications");
    revalidatePath("/candidate/applications");
    revalidatePath("/employee");
    revalidatePath("/candidate");
    if (applicationId) {
      revalidatePath(`/employee/applications/${applicationId}`);
      revalidatePath(`/candidate/applications/${applicationId}`);
    }
  } catch {
    // Gracefully handle execution outside Next request lifecycle (e.g. test environment)
  }
}

export async function createInterviewAction(raw: unknown) {
  const parsed = CreateInterviewSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid interview input");
  }
  const ctx = await getAuthenticatedContext();
  const interview = await InterviewService.createInterview(ctx, parsed.data);
  revalidateInterviewViews(parsed.data.applicationId);
  return { success: true, interview };
}

export async function createRoundAction(raw: unknown, applicationId?: string) {
  const parsed = CreateInterviewRoundSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid interview round input");
  }
  const ctx = await getAuthenticatedContext();
  const round = await InterviewService.createRound(ctx, parsed.data as any);
  revalidateInterviewViews(applicationId);
  return { success: true, round };
}

export async function scheduleRoundAction(raw: unknown, applicationId?: string) {
  const parsed = ScheduleInterviewRoundSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid schedule input");
  }
  const ctx = await getAuthenticatedContext();
  const round = await InterviewService.scheduleRound(ctx, parsed.data.roundId, {
    scheduledStartTime: parsed.data.scheduledStartTime,
    scheduledEndTime: parsed.data.scheduledEndTime,
    timezone: parsed.data.timezone,
    format: parsed.data.format,
    meetingUrl: parsed.data.meetingUrl,
    location: parsed.data.location,
    interviewers: parsed.data.interviewers,
  });
  revalidateInterviewViews(applicationId);
  return { success: true, round };
}

export async function rescheduleRoundAction(raw: unknown, applicationId?: string) {
  const parsed = RescheduleInterviewRoundSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid reschedule input");
  }
  const ctx = await getAuthenticatedContext();
  const round = await InterviewService.rescheduleRound(ctx, parsed.data.roundId, {
    newScheduledStartTime: parsed.data.newScheduledStartTime,
    newScheduledEndTime: parsed.data.newScheduledEndTime,
    newTimezone: parsed.data.newTimezone,
    rescheduledBy: parsed.data.rescheduledBy,
    rescheduleReason: parsed.data.rescheduleReason,
    meetingUrl: parsed.data.meetingUrl,
    location: parsed.data.location,
  });
  revalidateInterviewViews(applicationId);
  return { success: true, round };
}

export async function cancelRoundAction(raw: unknown, applicationId?: string) {
  const parsed = CancelInterviewRoundSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid cancellation input");
  }
  const ctx = await getAuthenticatedContext();
  const round = await InterviewService.cancelRound(ctx, parsed.data.roundId, {
    cancelledBy: parsed.data.cancelledBy,
    cancelReason: parsed.data.cancelReason,
  });
  revalidateInterviewViews(applicationId);
  return { success: true, round };
}

export async function completeRoundAction(raw: unknown, applicationId?: string) {
  const parsed = CompleteInterviewRoundSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid completion input");
  }
  const ctx = await getAuthenticatedContext();
  const round = await InterviewService.completeRound(ctx, parsed.data.roundId, {
    occurredAt: parsed.data.occurredAt || undefined,
  });
  revalidateInterviewViews(applicationId);
  return { success: true, round };
}

export async function recordDebriefAction(raw: unknown, applicationId?: string) {
  const parsed = RecordInterviewDebriefSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid debrief input");
  }
  const ctx = await getAuthenticatedContext();
  const debrief = await InterviewService.recordDebrief(ctx, parsed.data.roundId, {
    candidateSentiment: parsed.data.candidateSentiment,
    questionsAsked: parsed.data.questionsAsked,
    candidateFeedbackNotes: parsed.data.candidateFeedbackNotes,
    staffAssessmentNotes: parsed.data.staffAssessmentNotes,
    followUpItems: parsed.data.followUpItems,
  });
  revalidateInterviewViews(applicationId);
  return { success: true, debrief };
}

export async function concludeRoundAction(raw: unknown, applicationId?: string) {
  const parsed = ConcludeInterviewRoundSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid conclusion input");
  }
  const ctx = await getAuthenticatedContext();
  const round = await InterviewService.concludeRound(ctx, parsed.data.roundId, {
    outcome: parsed.data.outcome,
    outcomeNotes: parsed.data.outcomeNotes,
  });
  revalidateInterviewViews(applicationId);
  return { success: true, round };
}

export async function voidRoundAction(raw: unknown, applicationId?: string) {
  const parsed = VoidInterviewRoundSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || "Invalid void input");
  }
  const ctx = await getAuthenticatedContext();
  const round = await InterviewService.voidRound(ctx, parsed.data.roundId, {
    voidReason: parsed.data.voidReason,
  });
  revalidateInterviewViews(applicationId);
  return { success: true, round };
}
