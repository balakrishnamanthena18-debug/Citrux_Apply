/**
 * Phase 8C.1 — Interview Operating System Persistence & Data Model Tests
 * Tests for Interview, InterviewRound, InterviewDebrief, Timezone validation, Void semantics, and Tenant isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  InterviewStatus,
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewFormat,
  InterviewRoundOutcome,
  InterviewSentiment,
  isValidIanaTimezone,
} from "@/lib/interview/types";
import {
  findInterviewByApplicationId,
  findInterviewById,
  createInterview,
  findRoundsByInterviewId,
  findRoundById,
  createInterviewRound,
  updateInterviewRound,
  voidInterviewRound,
  createInterviewDebrief,
  findActiveInterviewsForCandidate,
} from "@/lib/interview/interview-repository";
import { ValidationError, NotFoundError } from "@/lib/errors";

describe("Phase 8C.1: Interview Data Model & Persistence Foundation", () => {
  const mockOrgId = "11111111-1111-1111-1111-111111111111";
  const mockOtherOrgId = "22222222-2222-2222-2222-222222222222";
  const mockCandidateId = "33333333-3333-3333-3333-333333333333";
  const mockAppId = "44444444-4444-4444-4444-444444444444";
  const mockJobId = "55555555-5555-5555-5555-555555555555";
  const mockUserId = "66666666-6666-6666-6666-666666666666";
  const mockInterviewId = "77777777-7777-7777-7777-777777777777";
  const mockRoundId = "88888888-8888-8888-8888-888888888888";

  describe("1. Timezone Contract Validation", () => {
    it("accepts valid canonical IANA timezones", () => {
      expect(isValidIanaTimezone("America/New_York")).toBe(true);
      expect(isValidIanaTimezone("America/Los_Angeles")).toBe(true);
      expect(isValidIanaTimezone("Europe/London")).toBe(true);
      expect(isValidIanaTimezone("Asia/Kolkata")).toBe(true);
      expect(isValidIanaTimezone("UTC")).toBe(true);
    });

    it("rejects invalid, numeric-only, or fabricated timezones", () => {
      expect(isValidIanaTimezone("")).toBe(false);
      expect(isValidIanaTimezone("GMT+5:30")).toBe(false);
      expect(isValidIanaTimezone("+05:30")).toBe(false);
      expect(isValidIanaTimezone("Mars/Curiosity")).toBe(false);
      expect(isValidIanaTimezone("Random/Fake_Tz")).toBe(false);
    });
  });

  describe("2. Interview Entity Creation & Scoping", () => {
    it("creates an Interview record bound to Application, Candidate, Job, and Organization", async () => {
      const mockTx = {
        interview: {
          create: vi.fn().mockResolvedValue({
            id: mockInterviewId,
            organizationId: mockOrgId,
            applicationId: mockAppId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: InterviewStatus.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      } as any;

      const interview = await createInterview(
        {
          organizationId: mockOrgId,
          applicationId: mockAppId,
          candidateId: mockCandidateId,
          jobId: mockJobId,
        },
        mockTx
      );

      expect(interview.id).toBe(mockInterviewId);
      expect(interview.applicationId).toBe(mockAppId);
      expect(interview.candidateId).toBe(mockCandidateId);
      expect(interview.status).toBe(InterviewStatus.ACTIVE);
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

    it("finds interview by application ID within same organization", async () => {
      const mockTx = {
        interview: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockInterviewId,
            organizationId: mockOrgId,
            applicationId: mockAppId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: InterviewStatus.ACTIVE,
            rounds: [],
          }),
        },
      } as any;

      const result = await findInterviewByApplicationId(mockAppId, mockOrgId, mockTx);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(mockInterviewId);
      expect(mockTx.interview.findFirst).toHaveBeenCalledWith({
        where: {
          applicationId: mockAppId,
          organizationId: mockOrgId,
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
    });

    it("returns null for interview lookup when organizationId does not match (cross-tenant protection)", async () => {
      const mockTx = {
        interview: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const result = await findInterviewByApplicationId(mockAppId, mockOtherOrgId, mockTx);
      expect(result).toBeNull();
    });
  });

  describe("3. InterviewRound Lifecycle & Scheduling", () => {
    it("creates a scheduled InterviewRound with IANA timezone and participants", async () => {
      const mockTx = {
        interviewRound: {
          findFirst: vi.fn().mockResolvedValue(null), // no prior rounds
          create: vi.fn().mockImplementation(({ data }) => ({
            id: mockRoundId,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
      } as any;

      const scheduledStart = new Date("2026-10-15T14:00:00Z");
      const scheduledEnd = new Date("2026-10-15T15:00:00Z");

      const round = await createInterviewRound(
        {
          interviewId: mockInterviewId,
          organizationId: mockOrgId,
          roundTitle: "Technical Coding Screen",
          roundType: InterviewRoundType.TECHNICAL_SCREEN,
          status: InterviewRoundStatus.ROUND_SCHEDULED,
          scheduledStartTime: scheduledStart,
          scheduledEndTime: scheduledEnd,
          timezone: "America/New_York",
          format: InterviewFormat.VIRTUAL,
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          interviewers: [
            {
              fullName: "Sarah Connor",
              roleOrTitle: "Staff Engineer",
              linkedinUrl: "https://linkedin.com/in/sconnor",
            },
          ],
          preparationBrief: {
            targetRole: "Senior Full Stack Engineer",
            keyCompetenciesToEmphasize: ["TypeScript", "Next.js", "PostgreSQL"],
          },
        },
        mockTx
      );

      expect(round.id).toBe(mockRoundId);
      expect(round.roundNumber).toBe(1);
      expect(round.roundType).toBe(InterviewRoundType.TECHNICAL_SCREEN);
      expect(round.status).toBe(InterviewRoundStatus.ROUND_SCHEDULED);
      expect(round.timezone).toBe("America/New_York");
      expect(round.format).toBe(InterviewFormat.VIRTUAL);
    });

    it("auto-increments roundNumber sequentially if not provided", async () => {
      const mockTx = {
        interviewRound: {
          findFirst: vi.fn().mockResolvedValue({ roundNumber: 2 }),
          create: vi.fn().mockImplementation(({ data }) => ({
            id: mockRoundId,
            ...data,
          })),
        },
      } as any;

      const round = await createInterviewRound(
        {
          interviewId: mockInterviewId,
          organizationId: mockOrgId,
          roundTitle: "System Design Round",
          roundType: InterviewRoundType.SYSTEM_DESIGN,
        },
        mockTx
      );

      expect(round.roundNumber).toBe(3);
    });

    it("throws ValidationError when creating a round with invalid timezone", async () => {
      const mockTx = {} as any;

      await expect(
        createInterviewRound(
          {
            interviewId: mockInterviewId,
            organizationId: mockOrgId,
            roundTitle: "Screen",
            timezone: "Invalid/Fake_Tz",
          },
          mockTx
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("4. Void Semantics (Decision Lock O2 Compliance)", () => {
    it("voids an InterviewRound without hard deletion", async () => {
      const mockTx = {
        interviewRound: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockRoundId,
            organizationId: mockOrgId,
          }),
          update: vi.fn().mockImplementation(({ where, data }) => ({
            id: where.id,
            voidedAt: data.voidedAt,
            voidedById: data.voidedById,
            voidReason: data.voidReason,
          })),
        },
      } as any;

      const voided = await voidInterviewRound(
        mockRoundId,
        mockOrgId,
        mockUserId,
        "Duplicate scheduling entry",
        mockTx
      );

      expect(voided.voidedAt).toBeInstanceOf(Date);
      expect(voided.voidedById).toBe(mockUserId);
      expect(voided.voidReason).toBe("Duplicate scheduling entry");
      expect(mockTx.interviewRound.update).toHaveBeenCalled();
    });

    it("throws NotFoundError when attempting to void a round belonging to another organization", async () => {
      const mockTx = {
        interviewRound: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      await expect(
        voidInterviewRound(
          mockRoundId,
          mockOtherOrgId,
          mockUserId,
          "Void attempt across tenant",
          mockTx
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("5. Debrief & Question Intelligence Persistence", () => {
    it("creates an InterviewDebrief with candidate sentiment, questions, and staff notes", async () => {
      const mockDebriefId = "99999999-9999-9999-9999-999999999999";
      const mockTx = {
        interviewRound: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockRoundId,
            organizationId: mockOrgId,
          }),
        },
        interviewDebrief: {
          create: vi.fn().mockImplementation(({ data }) => ({
            id: mockDebriefId,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
      } as any;

      const debrief = await createInterviewDebrief(
        {
          roundId: mockRoundId,
          organizationId: mockOrgId,
          candidateSentiment: InterviewSentiment.VERY_POSITIVE,
          questionsAsked: [
            {
              questionText: "How do you handle database concurrency in high-load Next.js apps?",
              category: "TECHNICAL",
              candidateAnswerNotes: "Explained Prisma connection pooling and optimistic locking.",
              perceivedDifficulty: "MEDIUM",
            },
          ],
          candidateFeedbackNotes: "Interviewer was very engaged and liked the system architecture diagram.",
          staffAssessmentNotes: "Candidate handled concurrency questions excellently.",
          submittedById: mockUserId,
        },
        mockTx
      );

      expect(debrief.id).toBe(mockDebriefId);
      expect(debrief.roundId).toBe(mockRoundId);
      expect(debrief.candidateSentiment).toBe(InterviewSentiment.VERY_POSITIVE);
      expect(debrief.questionsAsked).toHaveLength(1);
    });
  });

  describe("6. Candidate Active Interview Aggregation", () => {
    it("retrieves active non-voided interviews for a candidate", async () => {
      const mockTx = {
        interview: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: mockInterviewId,
              candidateId: mockCandidateId,
              organizationId: mockOrgId,
              status: InterviewStatus.ACTIVE,
              rounds: [
                {
                  id: mockRoundId,
                  roundNumber: 1,
                  roundTitle: "Screen",
                  status: InterviewRoundStatus.ROUND_SCHEDULED,
                  voidedAt: null,
                },
              ],
            },
          ]),
        },
      } as any;

      const interviews = await findActiveInterviewsForCandidate(
        mockCandidateId,
        mockOrgId,
        mockTx
      );

      expect(interviews).toHaveLength(1);
      expect(interviews[0]!.id).toBe(mockInterviewId);
      expect(interviews[0]!.rounds).toHaveLength(1);
      expect(mockTx.interview.findMany).toHaveBeenCalledWith({
        where: {
          candidateId: mockCandidateId,
          organizationId: mockOrgId,
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
    });
  });
});
