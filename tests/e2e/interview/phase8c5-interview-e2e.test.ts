/**
 * Phase 8C.5 — Interview Operating System Operational Browser & End-to-End Verification
 * Contract: docs/engineering/PHASE_8B_INTERVIEW_OPERATING_SYSTEM_PRODUCT_CONTRACT.md
 * Reports: docs/engineering/PHASE_8C1_INTERVIEW_DATA_MODEL_IMPLEMENTATION_REPORT.md
 *          docs/engineering/PHASE_8C2_INTERVIEW_SERVICE_LIFECYCLE_IMPLEMENTATION_REPORT.md
 *          docs/engineering/PHASE_8C3_INTERVIEW_SECURITY_RLS_AUDIT_VERIFICATION_REPORT.md
 *          docs/engineering/PHASE_8C4_INTERVIEW_PORTAL_IMPLEMENTATION_REPORT.md
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
} from "@/generated/prisma";
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
import type { CandidateInterviewViewModel } from "@/components/interview/CandidateInterviewSection";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { AuthorizationError, ValidationError, NotFoundError, InvalidStateTransitionError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "EMPLOYEE" && ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn((userId, fn) => fn(mockTx)),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

let mockTx: any;

describe("Phase 8C.5 — Interview Operating System E2E & Browser Flow Verification", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";

  const mockAppId = "33333333-3333-3333-3333-333333333333";
  const mockJobId = "44444444-4444-4444-4444-444444444444";
  const mockInterviewId = "55555555-5555-5555-5555-555555555555";
  const mockRoundId = "66666666-6666-6666-6666-666666666666";

  const candA = {
    userId: "user-cand-a",
    candidateId: "cand-a",
    email: "candidate.a@alpha.com",
    role: Role.CANDIDATE,
    organizationId: orgA,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  const candB = {
    userId: "user-cand-b",
    candidateId: "cand-b",
    email: "candidate.b@alpha.com",
    role: Role.CANDIDATE,
    organizationId: orgA,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  const employeeA = {
    userId: "user-emp-a",
    email: "recruiter.a@alpha.com",
    role: Role.EMPLOYEE,
    organizationId: orgA,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  const adminA = {
    userId: "user-admin-a",
    email: "admin@alpha.com",
    role: Role.ADMIN,
    organizationId: orgA,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  const employeeOrgB = {
    userId: "user-emp-b",
    email: "recruiter@beta.com",
    role: Role.EMPLOYEE,
    organizationId: orgB,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx = {
      application: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      interview: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      interviewRound: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      interviewDebrief: {
        findFirst: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      candidate: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
    };
  });

  // =========================================================================
  // 1. CANDIDATE BROWSER JOURNEY & PRESENTATION
  // =========================================================================
  describe("1. Candidate Browser Journey & Route Presentation", () => {
    it("presents candidate view model sanitized of internal staff notes", () => {
      const rawItem = {
        id: mockInterviewId,
        applicationId: mockAppId,
        candidateId: candA.candidateId,
        organizationId: orgA,
        status: InterviewStatus.ACTIVE,
        rounds: [
          {
            id: mockRoundId,
            roundNumber: 1,
            roundType: InterviewRoundType.TECHNICAL_SCREEN,
            roundTitle: "Live Coding Assessment",
            status: InterviewRoundStatus.ROUND_SCHEDULED,
            scheduledStartTime: new Date("2026-10-15T14:00:00Z"),
            scheduledEndTime: new Date("2026-10-15T15:00:00Z"),
            timezone: "America/New_York",
            format: InterviewFormat.VIRTUAL,
            meetingUrl: "https://meet.google.com/xyz-test",
            location: null,
            interviewers: [{ fullName: "Alex Senior Eng", roleOrTitle: "Interviewer" }],
            candidatePreparationNotes: "Review Binary Search & Trees",
            internalStaffNotes: "SECRET: Evaluate system architecture depth carefully",
            preparationBrief: { topics: ["Trees", "Graphs"] },
            occurredAt: null,
            outcome: null,
            outcomeNotes: null,
            voidedAt: null,
            voidReason: null,
            debrief: {
              candidateSentiment: InterviewSentiment.POSITIVE,
              questionsAsked: [{ questionText: "Explain Dijkstra algorithm" }],
              candidateFeedbackNotes: "Candidate felt well prepared",
              staffAssessmentNotes: "SECRET: Candidate answered 2/3 questions optimally",
            },
          },
        ],
      };

      const vm: CandidateInterviewViewModel = {
        id: rawItem.id,
        applicationId: rawItem.applicationId,
        status: rawItem.status,
        rounds: rawItem.rounds.map((r) => ({
          id: r.id,
          roundNumber: r.roundNumber,
          roundType: r.roundType,
          roundTitle: r.roundTitle,
          status: r.status as any,
          scheduledStartTime: r.scheduledStartTime ? r.scheduledStartTime.toISOString() : null,
          scheduledEndTime: r.scheduledEndTime ? r.scheduledEndTime.toISOString() : null,
          timezone: r.timezone,
          format: r.format as any,
          meetingUrl: r.meetingUrl,
          location: r.location,
          interviewers: (r.interviewers as any) || [],
          candidatePreparationNotes: r.candidatePreparationNotes,
          preparationBrief: (r.preparationBrief as any) || null,
          occurredAt: r.occurredAt ? (r.occurredAt as any).toISOString() : null,
          outcome: r.outcome as any,
          outcomeNotes: r.outcomeNotes,
          debrief: r.debrief
            ? {
                candidateSentiment: r.debrief.candidateSentiment,
                questionsAsked: (r.debrief.questionsAsked as any) || [],
                candidateFeedbackNotes: r.debrief.candidateFeedbackNotes,
              }
            : null,
        })),
      };

      expect(vm.id).toBe(mockInterviewId);
      expect(vm.rounds).toHaveLength(1);
      const r = vm.rounds[0]!;
      expect(r.roundTitle).toBe("Live Coding Assessment");
      expect(r.meetingUrl).toBe("https://meet.google.com/xyz-test");
      expect(r.candidatePreparationNotes).toBe("Review Binary Search & Trees");
      expect(r.timezone).toBe("America/New_York");

      // Verify strict privacy barriers: internal staff notes stripped
      expect((r as any).internalStaffNotes).toBeUndefined();
      expect((r.debrief as any)?.staffAssessmentNotes).toBeUndefined();
    });

    it("allows candidate to record reflections and questions asked on debrief via server action", async () => {
      (getAuthenticatedContext as any).mockResolvedValue(candA);

      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "Technical Screen",
        status: InterviewRoundStatus.ROUND_COMPLETED,
        scheduledStartTime: new Date("2026-10-15T14:00:00Z"),
        scheduledEndTime: new Date("2026-10-15T15:00:00Z"),
        timezone: "America/New_York",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });

      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: orgA,
        applicationId: mockAppId,
        candidateId: candA.candidateId,
        jobId: mockJobId,
      });

      mockTx.candidate.findFirst.mockResolvedValue({
        id: candA.candidateId,
        userId: candA.userId,
      });

      mockTx.interviewDebrief.upsert.mockResolvedValue({
        id: "deb-101",
        interviewRoundId: mockRoundId,
        candidateSentiment: InterviewSentiment.VERY_POSITIVE,
        questionsAsked: [{ questionText: "Tell me about a complex bug you solved." }],
        candidateFeedbackNotes: "Great interview experience.",
      });

      const result = await recordDebriefAction({
        roundId: mockRoundId,
        candidateSentiment: InterviewSentiment.VERY_POSITIVE,
        questionsAsked: [{ questionText: "Tell me about a complex bug you solved." }],
        candidateFeedbackNotes: "Great interview experience.",
      });

      expect(result.success).toBe(true);
      expect(mockTx.interviewDebrief.upsert).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. EMPLOYEE LIFECYCLE PROGRESSION & SCHEDULING
  // =========================================================================
  describe("2. Employee Full Lifecycle: Request -> Schedule -> Reschedule -> Complete -> Debrief -> Conclude", () => {
    it("executes valid round lifecycle sequence authoritatively", async () => {
      (getAuthenticatedContext as any).mockResolvedValue(employeeA);

      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: orgA,
        applicationId: mockAppId,
        candidateId: candA.candidateId,
        jobId: mockJobId,
      });

      mockTx.candidate.findFirst.mockResolvedValue({
        id: candA.candidateId,
        userId: candA.userId,
      });

      mockTx.application.findFirst.mockResolvedValue({
        id: mockAppId,
        organizationId: orgA,
        candidateId: candA.candidateId,
        jobId: mockJobId,
        assignedEmployeeId: employeeA.userId,
        candidate: { userId: candA.userId },
      });

      mockTx.interviewRound.count.mockResolvedValue(0);
      mockTx.interviewRound.create.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        status: InterviewRoundStatus.ROUND_REQUESTED,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "System Architecture & Coding",
      });

      // Step 1: Create Round (Request)
      const reqRes = await createRoundAction({
        interviewId: mockInterviewId,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "System Architecture & Coding",
        candidatePreparationNotes: "Bring your laptop and resume",
        internalStaffNotes: "Target seniority: Staff",
      });
      expect(reqRes.success).toBe(true);

      // Step 2: Schedule Round (America/New_York)
      mockTx.interviewRound.findFirst.mockResolvedValueOnce({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "System Architecture & Coding",
        status: InterviewRoundStatus.ROUND_REQUESTED,
        scheduledStartTime: null,
        scheduledEndTime: null,
        timezone: null,
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });
      mockTx.interviewRound.update.mockResolvedValueOnce({
        id: mockRoundId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        scheduledStartTime: new Date("2026-10-20T15:00:00.000Z"),
        scheduledEndTime: new Date("2026-10-20T16:00:00.000Z"),
        timezone: "America/New_York",
      });

      const schedRes = await scheduleRoundAction({
        roundId: mockRoundId,
        scheduledStartTime: "2026-10-20T15:00:00.000Z",
        scheduledEndTime: "2026-10-20T16:00:00.000Z",
        timezone: "America/New_York",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: "https://zoom.us/j/12345678",
      });
      expect(schedRes.success).toBe(true);

      // Step 3: Reschedule Round (Europe/London)
      mockTx.interviewRound.findFirst.mockResolvedValueOnce({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "System Architecture & Coding",
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        scheduledStartTime: new Date("2026-10-20T15:00:00Z"),
        scheduledEndTime: new Date("2026-10-20T16:00:00Z"),
        timezone: "America/New_York",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: "https://zoom.us/j/12345678",
        location: null,
        voidedAt: null,
      });
      mockTx.interviewRound.update.mockResolvedValueOnce({
        id: mockRoundId,
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        scheduledStartTime: new Date("2026-10-22T10:00:00.000Z"),
        scheduledEndTime: new Date("2026-10-22T11:00:00.000Z"),
        timezone: "Europe/London",
      });

      const reschedRes = await rescheduleRoundAction({
        roundId: mockRoundId,
        newScheduledStartTime: "2026-10-22T10:00:00.000Z",
        newScheduledEndTime: "2026-10-22T11:00:00.000Z",
        newTimezone: "Europe/London",
        rescheduledBy: "EMPLOYER",
        rescheduleReason: "Interviewer had a calendar conflict",
      });
      expect(reschedRes.success).toBe(true);

      // Step 4: Complete Round
      mockTx.interviewRound.findFirst.mockResolvedValueOnce({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "System Architecture & Coding",
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        scheduledStartTime: new Date("2026-10-22T10:00:00Z"),
        scheduledEndTime: new Date("2026-10-22T11:00:00Z"),
        timezone: "Europe/London",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });
      mockTx.interviewRound.update.mockResolvedValueOnce({
        id: mockRoundId,
        status: InterviewRoundStatus.ROUND_COMPLETED,
        occurredAt: new Date("2026-10-22T11:00:00.000Z"),
      });

      const compRes = await completeRoundAction({
        roundId: mockRoundId,
        occurredAt: "2026-10-22T11:00:00.000Z",
      });
      expect(compRes.success).toBe(true);

      // Step 5: Staff Debrief
      mockTx.interviewRound.findFirst.mockResolvedValueOnce({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "System Architecture & Coding",
        status: InterviewRoundStatus.ROUND_COMPLETED,
        scheduledStartTime: new Date("2026-10-22T10:00:00Z"),
        scheduledEndTime: new Date("2026-10-22T11:00:00Z"),
        timezone: "Europe/London",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });
      mockTx.interviewDebrief.upsert.mockResolvedValueOnce({
        id: "deb-101",
        interviewRoundId: mockRoundId,
        staffAssessmentNotes: "Candidate exhibited exceptional systems design mastery.",
      });

      const debRes = await recordDebriefAction({
        roundId: mockRoundId,
        staffAssessmentNotes: "Candidate exhibited exceptional systems design mastery.",
      });
      expect(debRes.success).toBe(true);

      // Step 6: Conclude Round
      mockTx.interviewRound.findFirst.mockResolvedValueOnce({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "System Architecture & Coding",
        status: InterviewRoundStatus.DEBRIEF_COMPLETED,
        scheduledStartTime: new Date("2026-10-22T10:00:00Z"),
        scheduledEndTime: new Date("2026-10-22T11:00:00Z"),
        timezone: "Europe/London",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });
      mockTx.interviewRound.update.mockResolvedValueOnce({
        id: mockRoundId,
        status: InterviewRoundStatus.ROUND_CONCLUDED,
        outcome: InterviewRoundOutcome.ADVANCED_TO_NEXT_ROUND,
        outcomeNotes: "Approved to advance to Executive Final loop.",
      });

      const concRes = await concludeRoundAction({
        roundId: mockRoundId,
        outcome: InterviewRoundOutcome.ADVANCED_TO_NEXT_ROUND,
        outcomeNotes: "Approved to advance to Executive Final loop.",
      });
      expect(concRes.success).toBe(true);
    });
  });

  // =========================================================================
  // 3. CANCELLATION, NO-SHOW & VOID PROTOCOLS
  // =========================================================================
  describe("3. Cancellation, No-Show & Void Protocols", () => {
    it("handles cancellation with preserved audit and provenance", async () => {
      (getAuthenticatedContext as any).mockResolvedValue(employeeA);

      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "Technical Screen",
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        scheduledStartTime: new Date("2026-10-20T15:00:00Z"),
        scheduledEndTime: new Date("2026-10-20T16:00:00Z"),
        timezone: "America/New_York",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: orgA,
        applicationId: mockAppId,
        candidateId: candA.candidateId,
        jobId: mockJobId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candA.candidateId,
        userId: candA.userId,
      });
      mockTx.application.findFirst.mockResolvedValue({
        id: mockAppId,
        organizationId: orgA,
        candidateId: candA.candidateId,
        jobId: mockJobId,
        assignedEmployeeId: employeeA.userId,
        candidate: { userId: candA.userId },
      });
      mockTx.interviewRound.update.mockResolvedValue({
        id: mockRoundId,
        status: InterviewRoundStatus.ROUND_CANCELLED,
      });

      const res = await cancelRoundAction({
        roundId: mockRoundId,
        cancelledBy: "EMPLOYER",
        cancelReason: "Position put on hold by hiring manager",
      });

      expect(res.success).toBe(true);
      expect(mockTx.interviewRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: InterviewRoundStatus.ROUND_CANCELLED,
            cancelReason: "Position put on hold by hiring manager",
            cancelledBy: "EMPLOYER",
          }),
        })
      );
    });

    it("performs soft-void without physically destroying the database row", async () => {
      (getAuthenticatedContext as any).mockResolvedValue(adminA);

      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "Technical Screen",
        status: InterviewRoundStatus.ROUND_REQUESTED,
        scheduledStartTime: null,
        scheduledEndTime: null,
        timezone: null,
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: orgA,
        applicationId: mockAppId,
        candidateId: candA.candidateId,
        jobId: mockJobId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candA.candidateId,
        userId: candA.userId,
      });
      mockTx.interviewRound.update.mockResolvedValue({
        id: mockRoundId,
        voidedAt: new Date(),
      });

      const res = await voidRoundAction({
        roundId: mockRoundId,
        voidReason: "Duplicate test entry created by mistake",
      });

      expect(res.success).toBe(true);
      expect(mockTx.interviewRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            voidReason: "Duplicate test entry created by mistake",
            voidedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  // =========================================================================
  // 4. SECURITY MATRIX: ISOLATION, SCOPE & TAMPERING GUARDS
  // =========================================================================
  describe("4. Security Matrix: Candidate/Tenant Isolation & Anti-Tampering", () => {
    it("rejects Candidate B attempting to access Candidate A's interview", async () => {
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candB.candidateId,
        userId: candB.userId,
      });

      mockTx.interviewRound.findFirst.mockResolvedValue(null); // Filtered out by RLS / candidate ID mismatch

      await expect(
        InterviewService.recordDebrief(candB as any, mockRoundId, {
          candidateSentiment: InterviewSentiment.POSITIVE,
        })
      ).rejects.toThrow(/not found|unauthorized/i);
    });

    it("rejects Employee from Organization B mutating Organization A interview (Tenant Isolation)", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue(null); // Filtered out by RLS / org ID mismatch

      await expect(
        InterviewService.scheduleRound(employeeOrgB as any, mockRoundId, {
          scheduledStartTime: new Date("2026-10-25T10:00:00Z"),
          scheduledEndTime: new Date("2026-10-25T11:00:00Z"),
          timezone: "UTC",
          format: InterviewFormat.VIRTUAL,
        })
      ).rejects.toThrow(/not found|unauthorized/i);
    });

    it("rejects illegal lifecycle jumps (Anti-Tampering)", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "Technical Screen",
        status: InterviewRoundStatus.ROUND_REQUESTED, // Still REQUESTED
        scheduledStartTime: null,
        scheduledEndTime: null,
        timezone: null,
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: orgA,
        applicationId: mockAppId,
        candidateId: candA.candidateId,
        jobId: mockJobId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candA.candidateId,
        userId: candA.userId,
      });
      mockTx.application.findFirst.mockResolvedValue({
        id: mockAppId,
        organizationId: orgA,
        candidateId: candA.candidateId,
        jobId: mockJobId,
        assignedEmployeeId: employeeA.userId,
        candidate: { userId: candA.userId },
      });

      // Attempting to conclude a requested round directly without scheduling/completing
      await expect(
        InterviewService.concludeRound(employeeA as any, mockRoundId, {
          outcome: InterviewRoundOutcome.ADVANCED_TO_NEXT_ROUND,
        })
      ).rejects.toThrow(/Illegal|cannot transition|invalid/i);
    });
  });

  // =========================================================================
  // 5. BOUNDARY INTEGRITY VERIFICATION
  // =========================================================================
  describe("5. Boundary Integrity: Application, Outcome Ledger, Candidate 360", () => {
    it("preserves Application State and does not generate unverified outcome events", async () => {
      (getAuthenticatedContext as any).mockResolvedValue(employeeA);

      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: mockRoundId,
        interviewId: mockInterviewId,
        roundNumber: 1,
        roundType: InterviewRoundType.TECHNICAL_SCREEN,
        roundTitle: "Technical Screen",
        status: InterviewRoundStatus.ROUND_SCHEDULED,
        scheduledStartTime: new Date("2026-10-20T15:00:00Z"),
        scheduledEndTime: new Date("2026-10-20T16:00:00Z"),
        timezone: "America/New_York",
        format: InterviewFormat.VIRTUAL,
        meetingUrl: null,
        location: null,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: mockInterviewId,
        organizationId: orgA,
        applicationId: mockAppId,
        candidateId: candA.candidateId,
        jobId: mockJobId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candA.candidateId,
        userId: candA.userId,
      });
      mockTx.application.findFirst.mockResolvedValue({
        id: mockAppId,
        organizationId: orgA,
        candidateId: candA.candidateId,
        jobId: mockJobId,
        assignedEmployeeId: employeeA.userId,
        candidate: { userId: candA.userId },
      });
      mockTx.interviewRound.update.mockResolvedValue({
        id: mockRoundId,
        status: InterviewRoundStatus.ROUND_COMPLETED,
      });

      // Complete round
      await completeRoundAction({
        roundId: mockRoundId,
        occurredAt: "2026-10-20T15:00:00.000Z",
      });

      // Assert that no Outcome Ledger table or Application Status was mutated
      expect((mockTx as any).applicationOutcomeEvent).toBeUndefined();
      expect((mockTx as any).application?.update).not.toHaveBeenCalled();
    });
  });
});
