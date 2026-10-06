/**
 * Phase 8C.2 — Interview Service & Lifecycle Authority Tests
 * Comprehensive unit and lifecycle state machine tests for InterviewService.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Role,
  InterviewStatus,
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewFormat,
  InterviewRoundOutcome,
  InterviewSentiment,
  AuditAction,
} from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { InterviewService } from "@/lib/interview/interview-service";
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  InvalidStateTransitionError,
} from "@/lib/errors";

// Mock RLS context wrapper to directly execute callback with mock transaction client
vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn((userId, callback) => callback(mockTx)),
}));

// Mock audit logger
vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

let mockTx: any;

describe("Phase 8C.2: Interview Service & Lifecycle Authority", () => {
  const mockOrgId = "11111111-1111-1111-1111-111111111111";
  const mockOtherOrgId = "22222222-2222-2222-2222-222222222222";
  const mockCandidateUserId = "user-cand-1";
  const mockOtherCandidateUserId = "user-cand-2";
  const mockEmployeeUserId = "user-emp-1";
  const mockAdminUserId = "user-admin-1";

  const mockCandidateId = "cand-111";
  const mockAppId = "app-111";
  const mockJobId = "job-111";
  const mockInterviewId = "interview-111";
  const mockRoundId = "round-111";

  const candidateCtx: AuthenticatedContext = {
    userId: mockCandidateUserId,
    email: "candidate@test.com",
    organizationId: mockOrgId,
    role: Role.CANDIDATE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  const employeeCtx: AuthenticatedContext = {
    userId: mockEmployeeUserId,
    email: "employee@test.com",
    organizationId: mockOrgId,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  const adminCtx: AuthenticatedContext = {
    userId: mockAdminUserId,
    email: "admin@test.com",
    organizationId: mockOrgId,
    role: Role.ADMIN,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx = {
      application: {
        findFirst: vi.fn(),
      },
      interview: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      interviewRound: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      interviewDebrief: {
        upsert: vi.fn(),
      },
      candidate: {
        findFirst: vi.fn(),
      },
    };
  });

  describe("1. Interview Creation", () => {
    it("creates an Interview container for a valid application", async () => {
      mockTx.application.findFirst.mockResolvedValue({
        id: mockAppId,
        candidateId: mockCandidateId,
        jobId: mockJobId,
        organizationId: mockOrgId,
        candidate: { userId: mockCandidateUserId },
      });
      mockTx.interview.findUnique.mockResolvedValue(null);
      mockTx.interview.create.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        applicationId: mockAppId,
        candidateId: mockCandidateId,
        jobId: mockJobId,
        status: InterviewStatus.ACTIVE,
      });

      const result = await InterviewService.createInterview(employeeCtx, {
        applicationId: mockAppId,
      });

      expect(result.id).toBe(mockInterviewId);
      expect(mockTx.interview.create).toHaveBeenCalledWith({
        data: {
          organizationId: mockOrgId,
          applicationId: mockAppId,
          candidateId: mockCandidateId,
          jobId: mockJobId,
          status: InterviewStatus.ACTIVE,
        },
      });
    });

    it("returns existing interview if already created for this application", async () => {
      mockTx.application.findFirst.mockResolvedValue({
        id: mockAppId,
        candidateId: mockCandidateId,
        jobId: mockJobId,
        organizationId: mockOrgId,
        candidate: { userId: mockCandidateUserId },
      });
      mockTx.interview.findUnique.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        applicationId: mockAppId,
        status: InterviewStatus.ACTIVE,
      });

      const result = await InterviewService.createInterview(employeeCtx, {
        applicationId: mockAppId,
      });

      expect(result.id).toBe(mockInterviewId);
      expect(mockTx.interview.create).not.toHaveBeenCalled();
    });

    it("throws NotFoundError if application does not exist", async () => {
      mockTx.application.findFirst.mockResolvedValue(null);

      await expect(
        InterviewService.createInterview(employeeCtx, { applicationId: "missing-app" })
      ).rejects.toThrow(NotFoundError);
    });

    it("throws AuthorizationError if candidate attempts to create interview for another candidate's application", async () => {
      mockTx.application.findFirst.mockResolvedValue({
        id: mockAppId,
        candidateId: mockCandidateId,
        jobId: mockJobId,
        organizationId: mockOrgId,
        candidate: { userId: mockOtherCandidateUserId },
      });

      await expect(
        InterviewService.createInterview(candidateCtx, { applicationId: mockAppId })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("2. InterviewRound Creation", () => {
    it("creates a new sequential round with valid timezone", async () => {
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });
      mockTx.interviewRound.findFirst.mockResolvedValue({ roundNumber: 1 });
      mockTx.interviewRound.create.mockImplementation(({ data }: { data: any }) => ({
        id: mockRoundId,
        ...data,
      }));

      const round = await InterviewService.createRound(employeeCtx, {
        interviewId: mockInterviewId,
        roundTitle: "Technical Coding",
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        timezone: "America/New_York",
      });

      expect(round.roundNumber).toBe(2);
      expect(round.roundTitle).toBe("Technical Coding");
      expect(round.status).toBe(InterviewRoundStatus.ROUND_REQUESTED);
    });

    it("throws ValidationError when creating round with invalid timezone", async () => {
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });

      await expect(
        InterviewService.createRound(employeeCtx, {
          interviewId: mockInterviewId,
          roundTitle: "Round",
          timezone: "Invalid/FakeZone",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when scheduledEndTime <= scheduledStartTime", async () => {
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });

      await expect(
        InterviewService.createRound(employeeCtx, {
          interviewId: mockInterviewId,
          roundTitle: "Round",
          scheduledStartTime: new Date("2026-10-15T15:00:00Z"),
          scheduledEndTime: new Date("2026-10-15T14:00:00Z"),
          timezone: "UTC",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("3. Scheduling & Rescheduling", () => {
    it("schedules a requested round with valid times and timezone", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_REQUESTED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });
      mockTx.interviewRound.update.mockImplementation(({ data }: { data: any }) => ({
        id: mockRoundId,
        ...data,
      }));

      const scheduledStart = new Date("2026-10-20T10:00:00Z");
      const scheduledEnd = new Date("2026-10-20T11:00:00Z");

      const scheduled = await InterviewService.scheduleRound(employeeCtx, mockRoundId, {
        scheduledStartTime: scheduledStart,
        scheduledEndTime: scheduledEnd,
        timezone: "America/Los_Angeles",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: "https://zoom.us/j/123456789",
      });

      expect(scheduled.status).toBe(InterviewRoundStatus.ROUND_SCHEDULED);
      expect(scheduled.timezone).toBe("America/Los_Angeles");
      expect(mockTx.interviewRound.update).toHaveBeenCalled();
    });

    it("reschedules a scheduled round and records attribution", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        scheduledStartTime: new Date("2026-10-20T10:00:00Z"),
        timezone: "America/Los_Angeles",
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });
      mockTx.interviewRound.update.mockImplementation(({ data }: { data: any }) => ({
        id: mockRoundId,
        ...data,
      }));

      const newStart = new Date("2026-10-22T14:00:00Z");
      const rescheduled = await InterviewService.rescheduleRound(employeeCtx, mockRoundId, {
        newScheduledStartTime: newStart,
        newTimezone: "America/New_York",
        rescheduledBy: "EMPLOYER",
        rescheduleReason: "Interviewer had a schedule conflict",
      });

      expect(rescheduled.status).toBe(InterviewRoundStatus.ROUND_SCHEDULED);
      expect(rescheduled.rescheduledBy).toBe("EMPLOYER");
      expect(rescheduled.rescheduleReason).toBe("Interviewer had a schedule conflict");
    });
  });

  describe("4. Cancellation & No-Show", () => {
    it("cancels a scheduled round with reason", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });
      mockTx.interviewRound.update.mockImplementation(({ data }: { data: any }) => ({
        id: mockRoundId,
        ...data,
      }));

      const cancelled = await InterviewService.cancelRound(employeeCtx, mockRoundId, {
        cancelledBy: "CANDIDATE",
        cancelReason: "Accepted another offer",
      });

      expect(cancelled.status).toBe(InterviewRoundStatus.ROUND_CANCELLED);
      expect(cancelled.cancelledBy).toBe("CANDIDATE");
      expect(cancelled.cancelReason).toBe("Accepted another offer");
    });

    it("throws ValidationError if cancelReason is empty", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });

      await expect(
        InterviewService.cancelRound(employeeCtx, mockRoundId, {
          cancelledBy: "CANDIDATE",
          cancelReason: "",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("5. Completion, Debrief & Conclusion", () => {
    it("completes a scheduled round and sets occurredAt", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });
      mockTx.interviewRound.update.mockImplementation(({ data }: { data: any }) => ({
        id: mockRoundId,
        ...data,
      }));

      const completed = await InterviewService.completeRound(employeeCtx, mockRoundId);
      expect(completed.status).toBe(InterviewRoundStatus.ROUND_COMPLETED);
      expect(completed.occurredAt).toBeInstanceOf(Date);
    });

    it("records debrief and advances round status to DEBRIEF_COMPLETED", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_COMPLETED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });
      mockTx.interviewDebrief.upsert.mockResolvedValue({
        id: "debrief-111",
        roundId: mockRoundId,
        candidateSentiment: InterviewSentiment.VERY_POSITIVE,
      });
      mockTx.interviewRound.update.mockResolvedValue({
        id: mockRoundId,
        status: InterviewRoundStatus.DEBRIEF_COMPLETED,
      });

      const debrief = await InterviewService.recordDebrief(candidateCtx, mockRoundId, {
        candidateSentiment: InterviewSentiment.VERY_POSITIVE,
        candidateFeedbackNotes: "Great discussion on architecture.",
        questionsAsked: [
          {
            questionText: "How do you structure microservices in Next.js?",
            category: "SYSTEM_DESIGN",
          },
        ],
      });

      expect(debrief.id).toBe("debrief-111");
      expect(mockTx.interviewRound.update).toHaveBeenCalledWith({
        where: { id: mockRoundId },
        data: { status: InterviewRoundStatus.DEBRIEF_COMPLETED },
      });
    });

    it("concludes round with outcome (staff only)", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.DEBRIEF_COMPLETED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });
      mockTx.interviewRound.update.mockImplementation(({ data }: { data: any }) => ({
        id: mockRoundId,
        ...data,
      }));

      const concluded = await InterviewService.concludeRound(employeeCtx, mockRoundId, {
        outcome: InterviewRoundOutcome.ADVANCED_TO_NEXT_ROUND,
        outcomeNotes: "Passed technical bar. Inviting to hiring manager round.",
      });

      expect(concluded.status).toBe(InterviewRoundStatus.ROUND_CONCLUDED);
      expect(concluded.outcome).toBe(InterviewRoundOutcome.ADVANCED_TO_NEXT_ROUND);
    });

    it("throws AuthorizationError when candidate attempts to conclude round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.DEBRIEF_COMPLETED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });

      await expect(
        InterviewService.concludeRound(candidateCtx, mockRoundId, {
          outcome: InterviewRoundOutcome.ADVANCED_TO_NEXT_ROUND,
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("6. Void-Only Semantics (O2 Compliance)", () => {
    it("allows staff to void a round and sets voidedAt", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });
      mockTx.interviewRound.update.mockImplementation(({ data }: { data: any }) => ({
        id: mockRoundId,
        ...data,
      }));

      const voided = await InterviewService.voidRound(employeeCtx, mockRoundId, {
        voidReason: "Accidentally created duplicate round",
      });

      expect(voided.voidedAt).toBeInstanceOf(Date);
      expect(voided.voidedById).toBe(mockEmployeeUserId);
      expect(voided.voidReason).toBe("Accidentally created duplicate round");
    });

    it("throws AuthorizationError if candidate attempts to void a round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });

      await expect(
        InterviewService.voidRound(candidateCtx, mockRoundId, {
          voidReason: "Cancel round",
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("throws ValidationError if round is already voided", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        voidedAt: new Date(),
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockCandidateUserId,
      });

      await expect(
        InterviewService.voidRound(employeeCtx, mockRoundId, {
          voidReason: "Void again",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("7. Multi-Tenant & Cross-Candidate Security", () => {
    it("blocks cross-tenant access when round belongs to another organization", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue(null);

      await expect(
        InterviewService.completeRound(
          { ...employeeCtx, organizationId: mockOtherOrgId },
          mockRoundId
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("blocks candidate from accessing another candidate's round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        organizationId: mockOrgId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: mockOrgId,
        candidateId: mockCandidateId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: mockCandidateId,
        userId: mockOtherCandidateUserId, // Different user
      });

      await expect(
        InterviewService.completeRound(candidateCtx, mockRoundId)
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
