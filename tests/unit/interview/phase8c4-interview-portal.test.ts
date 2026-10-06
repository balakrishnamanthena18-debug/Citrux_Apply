import { describe, it, expect, vi, beforeEach } from "vitest";
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
import {
  buildDeterministicPreparationBrief,
  formatInterviewDateTime,
  ROUND_STATUS_PRESENTATION,
  ROUND_TYPE_LABELS,
  FORMAT_LABELS,
  OUTCOME_PRESENTATION,
  SENTIMENT_PRESENTATION,
} from "@/lib/interview/presenter";
import {
  createInterviewAction,
  createRoundAction,
  scheduleRoundAction,
  rescheduleRoundAction,
  cancelRoundAction,
  completeRoundAction,
  recordDebriefAction,
  concludeRoundAction,
  voidRoundAction,
} from "@/lib/interview/actions";
import { InterviewService } from "@/lib/interview/interview-service";
import * as authContextModule from "@/lib/auth/context";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Phase 8C.4 — Interview Portal & Actions Unit Tests", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockUserId = "00000000-0000-0000-0000-000000000002";
  const mockAppId = "00000000-0000-0000-0000-000000000010";
  const mockInterviewId = "00000000-0000-0000-0000-000000000020";
  const mockRoundId = "00000000-0000-0000-0000-000000000030";

  const staffContext = {
    userId: mockUserId,
    email: "specialist@citrux.com",
    role: "EMPLOYEE" as const,
    organizationId: mockOrgId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authContextModule, "getAuthenticatedContext").mockResolvedValue(staffContext as any);
  });

  describe("Validation Schemas", () => {
    it("validates CreateInterviewSchema", () => {
      const valid = CreateInterviewSchema.safeParse({ applicationId: mockAppId });
      expect(valid.success).toBe(true);

      const invalid = CreateInterviewSchema.safeParse({ applicationId: "invalid-uuid" });
      expect(invalid.success).toBe(false);
    });

    it("enforces IANA timezone identifier in ScheduleInterviewRoundSchema", () => {
      const valid = ScheduleInterviewRoundSchema.safeParse({
        roundId: mockRoundId,
        scheduledStartTime: new Date().toISOString(),
        scheduledEndTime: new Date(Date.now() + 3600000).toISOString(),
        timezone: "America/New_York",
      });
      expect(valid.success).toBe(true);

      const invalidTz = ScheduleInterviewRoundSchema.safeParse({
        roundId: mockRoundId,
        scheduledStartTime: new Date().toISOString(),
        timezone: "Mars/Olympus_Mons",
      });
      expect(invalidTz.success).toBe(false);
    });

    it("rejects end time earlier than start time in ScheduleInterviewRoundSchema", () => {
      const invalidTime = ScheduleInterviewRoundSchema.safeParse({
        roundId: mockRoundId,
        scheduledStartTime: new Date(Date.now() + 3600000).toISOString(),
        scheduledEndTime: new Date().toISOString(),
        timezone: "UTC",
      });
      expect(invalidTime.success).toBe(false);
    });

    it("enforces mandatory cancellation reason with minimum length", () => {
      const valid = CancelInterviewRoundSchema.safeParse({
        roundId: mockRoundId,
        cancelledBy: "EMPLOYER",
        cancelReason: "Position put on temporary freeze.",
      });
      expect(valid.success).toBe(true);

      const invalid = CancelInterviewRoundSchema.safeParse({
        roundId: mockRoundId,
        cancelledBy: "EMPLOYER",
        cancelReason: "no",
      });
      expect(invalid.success).toBe(false);
    });

    it("enforces mandatory void reason with minimum length", () => {
      const valid = VoidInterviewRoundSchema.safeParse({
        roundId: mockRoundId,
        voidReason: "Duplicate round scheduled by mistake.",
      });
      expect(valid.success).toBe(true);

      const invalid = VoidInterviewRoundSchema.safeParse({
        roundId: mockRoundId,
        voidReason: "",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("Presenter & Deterministic Preparation Brief", () => {
    it("generates deterministic preparation brief from factual candidate skills and experiences", () => {
      const brief = buildDeterministicPreparationBrief({
        targetRole: "Staff Distributed Systems Engineer",
        companyName: "Acme Cloud Corp",
        roundType: "SYSTEM_DESIGN",
        skills: ["Go", "Kubernetes", "Kafka", "PostgreSQL", "Raft", "gRPC"],
        keyExperiences: [
          {
            company: "Tech Giant",
            title: "Senior Infrastructure Engineer",
            highlights: ["Led multi-region distributed cache migration", "Achieved 99.999% availability"],
          },
        ],
      });

      expect(brief.targetRole).toBe("Staff Distributed Systems Engineer");
      expect(brief.roundType).toBe("SYSTEM_DESIGN");
      expect(brief.keyCompetenciesToEmphasize).toEqual(["Go", "Kubernetes", "Kafka", "PostgreSQL", "Raft", "gRPC"]);
      expect(brief.highlightedProjects).toContain("Senior Infrastructure Engineer at Tech Giant");
      expect(brief.talkingPoints).toContain("Led multi-region distributed cache migration");
      expect(brief.formatGuidelines?.length).toBeGreaterThan(0);
    });

    it("formats interview date and time accurately across timezones", () => {
      const startTime = new Date("2026-10-15T14:00:00Z");
      const endTime = new Date("2026-10-15T15:00:00Z");

      const resUtc = formatInterviewDateTime(startTime, endTime, "UTC");
      expect(resUtc.dateStr).toContain("2026");
      expect(resUtc.timeStr).toContain("2:00 PM – 3:00 PM");
      expect(resUtc.timezoneStr).toBe("UTC");

      const resNy = formatInterviewDateTime(startTime, endTime, "America/New_York");
      expect(resNy.timezoneStr).toBe("America/New_York");
      expect(resNy.timeStr).toContain("10:00 AM – 11:00 AM");
    });

    it("exposes calm, human-readable status presentations", () => {
      expect(ROUND_STATUS_PRESENTATION.ROUND_REQUESTED.label).toBe("Round requested");
      expect(ROUND_STATUS_PRESENTATION.ROUND_SCHEDULED.label).toBe("Scheduled");
      expect(ROUND_STATUS_PRESENTATION.ROUND_COMPLETED.label).toBe("Completed");
      expect(ROUND_STATUS_PRESENTATION.DEBRIEF_PENDING.label).toBe("Debrief pending");
      expect(ROUND_STATUS_PRESENTATION.ROUND_CONCLUDED.label).toBe("Concluded");
    });
  });

  describe("Server Actions Gateway Invariants", () => {
    it("calls InterviewService.createInterview from createInterviewAction", async () => {
      const mockResult = { id: mockInterviewId, applicationId: mockAppId } as any;
      vi.spyOn(InterviewService, "createInterview").mockResolvedValue(mockResult);

      const res = await createInterviewAction({ applicationId: mockAppId });
      expect(res.success).toBe(true);
      expect(res.interview.id).toBe(mockInterviewId);
      expect(InterviewService.createInterview).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: mockOrgId }),
        { applicationId: mockAppId }
      );
    });

    it("calls InterviewService.createRound from createRoundAction", async () => {
      const mockResult = { id: mockRoundId, roundTitle: "Recruiter Screen" } as any;
      vi.spyOn(InterviewService, "createRound").mockResolvedValue(mockResult);

      const res = await createRoundAction(
        {
          interviewId: mockInterviewId,
          roundTitle: "Recruiter Screen",
          roundType: "RECRUITER_SCREEN",
        },
        mockAppId
      );
      expect(res.success).toBe(true);
      expect(InterviewService.createRound).toHaveBeenCalled();
    });

    it("calls InterviewService.scheduleRound from scheduleRoundAction", async () => {
      const mockResult = { id: mockRoundId, status: "ROUND_SCHEDULED" } as any;
      vi.spyOn(InterviewService, "scheduleRound").mockResolvedValue(mockResult);

      const res = await scheduleRoundAction(
        {
          roundId: mockRoundId,
          scheduledStartTime: new Date().toISOString(),
          timezone: "America/New_York",
          format: "VIRTUAL",
          meetingUrl: "https://meet.google.com/abc-def-ghi",
        },
        mockAppId
      );
      expect(res.success).toBe(true);
      expect(InterviewService.scheduleRound).toHaveBeenCalled();
    });

    it("calls InterviewService.rescheduleRound from rescheduleRoundAction", async () => {
      const mockResult = { id: mockRoundId, status: "ROUND_RESCHEDULED" } as any;
      vi.spyOn(InterviewService, "rescheduleRound").mockResolvedValue(mockResult);

      const res = await rescheduleRoundAction(
        {
          roundId: mockRoundId,
          newScheduledStartTime: new Date().toISOString(),
          newTimezone: "UTC",
          rescheduledBy: "EMPLOYER",
          rescheduleReason: "Interviewer had a conflict.",
        },
        mockAppId
      );
      expect(res.success).toBe(true);
      expect(InterviewService.rescheduleRound).toHaveBeenCalled();
    });

    it("calls InterviewService.cancelRound from cancelRoundAction", async () => {
      const mockResult = { id: mockRoundId, status: "ROUND_CANCELLED" } as any;
      vi.spyOn(InterviewService, "cancelRound").mockResolvedValue(mockResult);

      const res = await cancelRoundAction(
        {
          roundId: mockRoundId,
          cancelledBy: "EMPLOYER",
          cancelReason: "Role filled internally.",
        },
        mockAppId
      );
      expect(res.success).toBe(true);
      expect(InterviewService.cancelRound).toHaveBeenCalled();
    });

    it("calls InterviewService.recordDebrief from recordDebriefAction", async () => {
      const mockResult = { id: "debrief-1", candidateSentiment: "VERY_POSITIVE" } as any;
      vi.spyOn(InterviewService, "recordDebrief").mockResolvedValue(mockResult);

      const res = await recordDebriefAction(
        {
          roundId: mockRoundId,
          candidateSentiment: "VERY_POSITIVE",
          candidateFeedbackNotes: "Great discussion with engineering director.",
        },
        mockAppId
      );
      expect(res.success).toBe(true);
      expect(InterviewService.recordDebrief).toHaveBeenCalled();
    });

    it("calls InterviewService.concludeRound from concludeRoundAction", async () => {
      const mockResult = { id: mockRoundId, status: "ROUND_CONCLUDED", outcome: "ADVANCED_TO_NEXT_ROUND" } as any;
      vi.spyOn(InterviewService, "concludeRound").mockResolvedValue(mockResult);

      const res = await concludeRoundAction(
        {
          roundId: mockRoundId,
          outcome: "ADVANCED_TO_NEXT_ROUND",
          outcomeNotes: "Passed technical bar with distinction.",
        },
        mockAppId
      );
      expect(res.success).toBe(true);
      expect(InterviewService.concludeRound).toHaveBeenCalled();
    });

    it("calls InterviewService.voidRound from voidRoundAction", async () => {
      const mockResult = { id: mockRoundId, voidedAt: new Date() } as any;
      vi.spyOn(InterviewService, "voidRound").mockResolvedValue(mockResult);

      const res = await voidRoundAction(
        {
          roundId: mockRoundId,
          voidReason: "Accidentally created duplicate round.",
        },
        mockAppId
      );
      expect(res.success).toBe(true);
      expect(InterviewService.voidRound).toHaveBeenCalled();
    });
  });
});
