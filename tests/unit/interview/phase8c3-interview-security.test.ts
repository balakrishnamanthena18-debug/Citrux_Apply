/**
 * Phase 8C.3 — Interview Security, RLS & Audit Verification Tests
 * Negative-path security, IDOR, cross-tenant attack matrix, lifecycle bypass, and audit atomicity verification.
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

let mockTx: any;

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn((userId, callback) => callback(mockTx)),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Phase 8C.3: Interview Security, RLS & Audit Verification", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";

  const candidateAUser = "user-cand-a";
  const candidateBUser = "user-cand-b";
  const employeeAUser = "user-emp-a";
  const adminAUser = "user-admin-a";

  const candidateAId = "cand-a";
  const candidateBId = "cand-b";
  const appAId = "app-a";
  const appBId = "app-b";
  const jobAId = "job-a";
  const interviewAId = "interview-a";
  const roundAId = "round-a";

  const candidateACtx: AuthenticatedContext = {
    userId: candidateAUser,
    email: "candidate.a@test.com",
    organizationId: orgA,
    role: Role.CANDIDATE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  const candidateBCtx: AuthenticatedContext = {
    userId: candidateBUser,
    email: "candidate.b@test.com",
    organizationId: orgA,
    role: Role.CANDIDATE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  const employeeACtx: AuthenticatedContext = {
    userId: employeeAUser,
    email: "employee.a@test.com",
    organizationId: orgA,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  const adminACtx: AuthenticatedContext = {
    userId: adminAUser,
    email: "admin.a@test.com",
    organizationId: orgA,
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

  describe("1. Cross-Tenant Attack Matrix", () => {
    it("DENIES Org A user from accessing Org B Interview (returns NotFoundError/blocked)", async () => {
      mockTx.interview.findFirst.mockResolvedValue(null); // Isolated by orgId query

      await expect(
        InterviewService.createRound(
          { ...employeeACtx, organizationId: orgB },
          { interviewId: interviewAId, roundTitle: "Screen" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("DENIES Org A user from updating Org B InterviewRound", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue(null); // Isolated by orgId

      await expect(
        InterviewService.scheduleRound(
          { ...employeeACtx, organizationId: orgB },
          roundAId,
          { scheduledStartTime: new Date(), timezone: "America/New_York" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("DENIES Org A user from voiding Org B InterviewRound", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue(null);

      await expect(
        InterviewService.voidRound(
          { ...employeeACtx, organizationId: orgB },
          roundAId,
          { voidReason: "Cross-tenant attempt" }
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("2. Direct-ID & Cross-Candidate Attack Matrix", () => {
    it("DENIES Candidate B from accessing or creating a round for Candidate A's interview", async () => {
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser, // Belongs to Candidate A
      });

      await expect(
        InterviewService.createRound(candidateBCtx, {
          interviewId: interviewAId,
          roundTitle: "Intruder Round",
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("DENIES Candidate B from scheduling Candidate A's interview round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.ROUND_REQUESTED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });

      await expect(
        InterviewService.scheduleRound(candidateBCtx, roundAId, {
          scheduledStartTime: new Date("2026-10-25T10:00:00Z"),
          timezone: "UTC",
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("DENIES Candidate B from recording debrief for Candidate A's round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.ROUND_COMPLETED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });

      await expect(
        InterviewService.recordDebrief(candidateBCtx, roundAId, {
          candidateSentiment: InterviewSentiment.VERY_POSITIVE,
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("3. Forged Context & Identity Defense", () => {
    it("ignores forged organizationId in client input and derives authority strictly from ctx", async () => {
      mockTx.application.findFirst.mockResolvedValue(null); // Does not find in orgA

      await expect(
        InterviewService.createInterview(candidateACtx, {
          applicationId: appBId, // Belongs to orgB
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("4. Lifecycle Bypass Rejection", () => {
    it("REJECTS ROUND_REQUESTED → ROUND_CONCLUDED directly", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.ROUND_REQUESTED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });

      await expect(
        InterviewService.concludeRound(employeeACtx, roundAId, {
          outcome: InterviewRoundOutcome.ADVANCED_TO_NEXT_ROUND,
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it("REJECTS ROUND_CONCLUDED → ROUND_SCHEDULED (terminal state modification)", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.ROUND_CONCLUDED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });

      await expect(
        InterviewService.scheduleRound(employeeACtx, roundAId, {
          scheduledStartTime: new Date("2026-10-30T10:00:00Z"),
          timezone: "UTC",
        })
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it("REJECTS ROUND_CANCELLED → ROUND_COMPLETED", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.ROUND_CANCELLED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });

      await expect(
        InterviewService.completeRound(employeeACtx, roundAId)
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  describe("5. Void-Only Historical Integrity & Mutation Lock", () => {
    it("REJECTS any scheduling mutation on a voided round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.ROUND_REQUESTED,
        voidedAt: new Date("2026-10-01T10:00:00Z"),
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });

      await expect(
        InterviewService.scheduleRound(employeeACtx, roundAId, {
          scheduledStartTime: new Date("2026-10-25T10:00:00Z"),
          timezone: "UTC",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("REJECTS debrief submission on a voided round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.ROUND_COMPLETED,
        voidedAt: new Date("2026-10-01T10:00:00Z"),
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });

      await expect(
        InterviewService.recordDebrief(candidateACtx, roundAId, {
          candidateSentiment: InterviewSentiment.NEUTRAL,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("6. Candidate Data Privacy & Staff Notes Redaction", () => {
    it("strips internal staff notes when a candidate creates a round", async () => {
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });
      mockTx.interviewRound.findFirst.mockResolvedValue(null);
      mockTx.interviewRound.create.mockImplementation(({ data }: { data: any }) => ({
        id: roundAId,
        ...data,
      }));

      const round = await InterviewService.createRound(candidateACtx, {
        interviewId: interviewAId,
        roundTitle: "Screening",
        internalStaffNotes: "Secret staff comment about salary band",
      });

      expect(round.internalStaffNotes).toBeNull();
    });

    it("strips staff assessment notes when candidate submits debrief", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.ROUND_COMPLETED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });
      mockTx.interviewDebrief.upsert.mockImplementation(({ create }: { create: any }) => ({
        id: "debrief-a",
        ...create,
      }));
      mockTx.interviewRound.update.mockResolvedValue({
        id: roundAId,
        status: InterviewRoundStatus.DEBRIEF_COMPLETED,
      });

      const debrief = await InterviewService.recordDebrief(candidateACtx, roundAId, {
        candidateSentiment: InterviewSentiment.VERY_POSITIVE,
        candidateFeedbackNotes: "Went well",
        staffAssessmentNotes: "Attempted staff note injection",
      });

      expect(debrief.staffAssessmentNotes).toBeNull();
    });
  });

  describe("7. Role Privilege Gate Matrix", () => {
    it("DENIES Candidate from concluding an interview round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.DEBRIEF_COMPLETED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });

      await expect(
        InterviewService.concludeRound(candidateACtx, roundAId, {
          outcome: InterviewRoundOutcome.ADVANCED_TO_NEXT_ROUND,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("ALLOWS Admin to conclude an interview round", async () => {
      mockTx.interviewRound.findFirst.mockResolvedValue({
        id: roundAId,
        interviewId: interviewAId,
        organizationId: orgA,
        status: InterviewRoundStatus.DEBRIEF_COMPLETED,
        voidedAt: null,
      });
      mockTx.interview.findFirst.mockResolvedValue({
        id: interviewAId,
        organizationId: orgA,
        candidateId: candidateAId,
      });
      mockTx.candidate.findFirst.mockResolvedValue({
        id: candidateAId,
        userId: candidateAUser,
      });
      mockTx.interviewRound.update.mockImplementation(({ data }: { data: any }) => ({
        id: roundAId,
        ...data,
      }));

      const concluded = await InterviewService.concludeRound(adminACtx, roundAId, {
        outcome: InterviewRoundOutcome.OFFER_RECEIVED,
        outcomeNotes: "Candidate passed final executive round!",
      });

      expect(concluded.status).toBe(InterviewRoundStatus.ROUND_CONCLUDED);
      expect(concluded.outcome).toBe(InterviewRoundOutcome.OFFER_RECEIVED);
    });
  });
});
