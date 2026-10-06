import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCandidate360 } from "@/lib/candidate-360/service";
import * as careerService from "@/lib/career/service";
import * as rlsModule from "@/lib/db/rls";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError, NotFoundError } from "@/lib/errors";

describe("PHASE 7E.1: Candidate 360 Composition Service Tests", () => {
  const mockCareerIntelligence = {
    candidate: {
      id: "cand-1",
      fullName: "Alex Rivera",
      email: "alex@example.com",
      headline: "Senior Cloud Engineer",
      city: "Austin",
      state: "TX",
      country: "US",
      workAuthorization: "CITIZEN",
      verificationStatus: "VERIFIED",
    },
    careerSnapshot: {
      totalYearsExperience: 8,
      headline: "Senior Cloud Engineer",
      topStrengths: ["AWS", "Kubernetes"],
      verifiedSkillsCount: 2,
      evidencedSkillsCount: 4,
      selfDeclaredSkillsCount: 1,
      totalEvidencedEntities: 7,
    },
    skills: [
      {
        name: "AWS",
        normalizedName: "aws",
        authorityLevel: "VERIFIED" as const,
        evidenceDepth: 3,
        sources: [],
        recency: "RECENT" as const,
        strengthTier: "CORE" as const,
      },
    ],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    evidence: [],
    strengths: [
      {
        skillName: "AWS",
        normalizedName: "aws",
        tier: "CORE" as const,
        evidenceDepth: 3,
        rationale: "Core competency corroborated across 3 independent entities",
        recency: "RECENT" as const,
      },
    ],
    gaps: [
      {
        type: "DATA_GAP" as const,
        category: "LINKS",
        title: "No External Portfolio",
        description: "No GitHub or portfolio links recorded.",
        recommendation: "Add links to showcase code.",
      },
    ],
    timeline: [
      {
        id: "timeline:exp:1",
        type: "EXPERIENCE" as const,
        title: "Cloud Architect",
        subtitle: "Acme",
        startDate: "2023-01-01",
        endDate: null,
        isCurrent: true,
        displayDate: "2023 – Present",
        details: [],
        technologies: ["AWS"],
        sourceId: "exp-1",
      },
    ],
    careerDirection: {
      targetRoles: ["Lead Cloud Architect"],
      targetLocations: ["Remote", "Austin, TX"],
      remotePreference: "REMOTE_ONLY",
      desiredSalaryMin: 180000,
      desiredSalaryMax: 220000,
      salaryCurrency: "USD",
    },
    outcomesSummary: {
      totalOutcomes: 2,
      interviewRequestsCount: 1,
      offersCount: 1,
      employerDeclinesCount: 0,
      recentOutcomes: [
        {
          outcomeType: "INTERVIEW_REQUESTED",
          recordedAt: "2026-02-01T00:00:00.000Z",
          candidateVisible: true,
        },
        {
          outcomeType: "OFFER_RECEIVED",
          recordedAt: "2026-02-15T00:00:00.000Z",
          candidateVisible: true,
        },
      ],
    },
    freshness: {
      status: "FRESH" as const,
      sourceDataVersion: "hash-career-12345",
      computedAt: "2026-10-06T12:00:00.000Z",
    },
  };

  const mockCandidateDb = {
    id: "cand-1",
    organizationId: "org-1",
    userId: "user-cand-1",
    headline: "Senior Cloud Engineer",
    city: "Austin",
    state: "TX",
    country: "US",
    phone: "+1 512-555-0199",
    workAuthorization: "CITIZEN",
    requiresSponsorship: false,
    verificationStatus: "VERIFIED",
    totalYearsExperience: 8,
    applicationAuthorizationMode: "MANAGED",
    user: {
      id: "user-cand-1",
      email: "alex@example.com",
      firstName: "Alex",
      lastName: "Rivera",
    },
    assignedEmployee: {
      id: "emp-1",
      firstName: "Sarah",
      lastName: "Conner",
      email: "sarah@citrux.com",
    },
  };

  let mockTx: any;

  beforeEach(() => {
    vi.spyOn(careerService, "getCandidateCareerIntelligence").mockResolvedValue(
      mockCareerIntelligence as any
    );

    mockTx = {
      candidate: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.id === mockCandidateDb.id && where.organizationId === mockCandidateDb.organizationId) {
            return Promise.resolve(mockCandidateDb);
          }
          return Promise.resolve(null);
        }),
      },
      candidateDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: "doc-1",
          title: "Alex_Rivera_Resume_2026.pdf",
        }),
      },
      resumeReview: {
        findFirst: vi.fn().mockResolvedValue({
          id: "review-1",
          status: "READY",
          overallLabel: "Strong Resume Representation",
          atsReadability: {
            label: "Clean & High Readability",
            summary: "Single-column format easily parsed by all major ATS systems.",
            findings: [{ code: "CLEAN_PARSE", severity: "INFO", message: "Parsed 100%" }],
          },
          completedAt: new Date("2026-02-01"),
        }),
      },
      application: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "app-1",
            status: "SUBMITTED",
            createdAt: new Date("2026-02-01"),
            job: {
              title: "Senior Cloud Architect",
              companyName: "CloudTech Inc.",
            },
            readinessResults: [
              {
                readinessState: "READY_FOR_MANAGED",
                blockers: [],
                warnings: [],
              },
            ],
          },
        ]),
      },
      candidateJobMatch: {
        findMany: vi.fn().mockResolvedValue([
          {
            jobId: "job-101",
            category: "STRONG_MATCH",
            isSaved: true,
            isRequested: false,
            job: {
              title: "Principal Infrastructure Lead",
              companyName: "Stripe",
              location: "Remote",
              isRemote: true,
            },
          },
        ]),
      },
      internalNote: {
        count: vi.fn().mockResolvedValue(3),
      },
      task: {
        count: vi.fn().mockResolvedValue(2),
      },
      candidateFactAttestation: {
        count: vi.fn().mockResolvedValue(4),
      },
    };

    vi.spyOn(rlsModule, "withRlsContext").mockImplementation(
      async (_userId, fn) => fn(mockTx as any)
    );
  });

  // ==========================================
  // 1. CANDIDATE ACCESS & REDACTION
  // ==========================================
  describe("1. Candidate Role Access & Redaction", () => {
    it("allows candidate to access own Candidate 360 profile", async () => {
      const candidateCtx: AuthenticatedContext = {
        userId: "user-cand-1",
        email: "alex@example.com",
        organizationId: "org-1",
        role: Role.CANDIDATE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      const result = await getCandidate360("cand-1", candidateCtx);
      expect(result).toBeDefined();
      expect(result.candidate.id).toBe("cand-1");
      expect(result.candidate.fullName).toBe("Alex Rivera");
      expect(result.resume.hasResume).toBe(true);
      expect(result.resume.atsLabel).toBe("Clean & High Readability");
      expect(result.applications.totalApplications).toBe(1);
      expect(result.matching.totalRelevantMatches).toBe(1);
      expect(result.career.strengths).toHaveLength(1);
      expect(result.outcomes.totalOutcomes).toBe(2);

      // Verify candidate payload NEVER contains staffContext
      expect(result.staffContext).toBeUndefined();
    });

    it("denies candidate attempting to access another candidate profile", async () => {
      const otherCandidateCtx: AuthenticatedContext = {
        userId: "user-cand-2",
        email: "other@example.com",
        organizationId: "org-1",
        role: Role.CANDIDATE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      await expect(getCandidate360("cand-1", otherCandidateCtx)).rejects.toThrow(
        AuthorizationError
      );
    });

    it("denies access when organizationId does not match (tenant isolation)", async () => {
      const foreignOrgCtx: AuthenticatedContext = {
        userId: "user-admin-foreign",
        email: "admin@foreign.com",
        organizationId: "org-foreign",
        role: Role.ADMIN,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      await expect(getCandidate360("cand-1", foreignOrgCtx)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  // ==========================================
  // 2. STAFF ACCESS & CONTEXT
  // ==========================================
  describe("2. Staff Role Access & Operational Context", () => {
    it("allows authorized employee to access candidate and populates operational metrics", async () => {
      const employeeCtx: AuthenticatedContext = {
        userId: "emp-1",
        email: "sarah@citrux.com",
        organizationId: "org-1",
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      const result = await getCandidate360("cand-1", employeeCtx);
      expect(result).toBeDefined();
      expect(result.staffContext).toBeDefined();
      expect(result.staffContext?.internalNotesCount).toBe(3);
      expect(result.staffContext?.activeTasksCount).toBe(2);
      expect(result.staffContext?.attestationsCount).toBe(4);
    });

    it("allows admin to access candidate with organization scope", async () => {
      const adminCtx: AuthenticatedContext = {
        userId: "admin-1",
        email: "admin@citrux.com",
        organizationId: "org-1",
        role: Role.ADMIN,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      const result = await getCandidate360("cand-1", adminCtx);
      expect(result).toBeDefined();
      expect(result.candidate.id).toBe("cand-1");
      expect(result.staffContext).toBeDefined();
    });
  });

  // ==========================================
  // 3. SUBSYSTEM DELEGATION & BOUNDARIES
  // ==========================================
  describe("3. Subsystem Delegation & Boundary Isolation", () => {
    it("delegates career intelligence to Phase 7C service without re-running calculation", async () => {
      const employeeCtx: AuthenticatedContext = {
        userId: "emp-1",
        email: "sarah@citrux.com",
        organizationId: "org-1",
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      await getCandidate360("cand-1", employeeCtx);
      expect(careerService.getCandidateCareerIntelligence).toHaveBeenCalledWith(
        "cand-1",
        employeeCtx
      );
    });

    it("ensures outcomes summary is present but strictly isolated from skill evidence", async () => {
      const candidateCtx: AuthenticatedContext = {
        userId: "user-cand-1",
        email: "alex@example.com",
        organizationId: "org-1",
        role: Role.CANDIDATE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      const result = await getCandidate360("cand-1", candidateCtx);
      expect(result.outcomes.interviewRequestsCount).toBe(1);
      expect(result.outcomes.offersCount).toBe(1);
      // Ensure hiring events never appear as skill evidence
      expect(result.career.skills.some((s) => s.normalizedName === "interview_requested")).toBe(false);
      expect(result.career.skills.some((s) => s.normalizedName === "offer_received")).toBe(false);
    });

    it("ensures raw extracted resume text is never present in DTO payloads", async () => {
      const candidateCtx: AuthenticatedContext = {
        userId: "user-cand-1",
        email: "alex@example.com",
        organizationId: "org-1",
        role: Role.CANDIDATE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      const result = await getCandidate360("cand-1", candidateCtx);
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).not.toContain("extractedText");
      expect(jsonStr).not.toContain("password");
      expect(jsonStr).not.toContain("service_role");
    });
  });

  // ==========================================
  // 4. READ-ONLY GUARANTEE
  // ==========================================
  describe("4. Read-Only Guarantee", () => {
    it("performs zero create, update, or delete operations on database tables", async () => {
      const employeeCtx: AuthenticatedContext = {
        userId: "emp-1",
        email: "sarah@citrux.com",
        organizationId: "org-1",
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      };

      await getCandidate360("cand-1", employeeCtx);

      // Verify mock database transactions executed only findFirst, findMany, and count
      expect(mockTx.candidate.findFirst).toHaveBeenCalled();
      expect(mockTx.candidateDocument.findFirst).toHaveBeenCalled();
      expect(mockTx.resumeReview.findFirst).toHaveBeenCalled();
      expect(mockTx.application.findMany).toHaveBeenCalled();
      expect(mockTx.candidateJobMatch.findMany).toHaveBeenCalled();

      // Zero mutation calls
      expect(mockTx.candidate.create).toBeUndefined();
      expect(mockTx.candidate.update).toBeUndefined();
      expect(mockTx.candidate.delete).toBeUndefined();
    });
  });
});
