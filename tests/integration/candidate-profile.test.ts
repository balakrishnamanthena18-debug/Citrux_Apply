import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOrCreateCandidateSelfAction,
  updateCandidateProfileSelfAction,
  upsertCandidateExperienceAction,
  deleteCandidateExperienceAction,
  upsertCandidateEducationAction,
  deleteCandidateEducationAction,
  syncCandidateSkillsAction,
} from "@/lib/candidate/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Candidate Profile Management Integration (tests/integration/candidate-profile.test.ts)", () => {
  const mockOrgId = "org-uuid-111";
  const mockUserId = "user-uuid-candidate-1";
  const mockCandidateId = "cand-uuid-101";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockUserId,
      email: "candidate@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Initializes Candidate operational record if it does not exist (Self-service)", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            organizationId: mockOrgId,
            status: "ONBOARDING",
            verificationStatus: "UNVERIFIED",
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await getOrCreateCandidateSelfAction();
    expect(result.success).toBe(true);
    expect(result.data?.candidateId).toBe(mockCandidateId);
    expect(result.data?.status).toBe("ONBOARDING");
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_CREATED",
        entityId: mockCandidateId,
      })
    );
  });

  it("2. Updates candidate career profile and emits audit event", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            status: "ACTIVE",
          }),
          update: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            headline: "Staff Software Engineer",
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await updateCandidateProfileSelfAction({
      headline: "Staff Software Engineer",
      professionalSummary: "10+ years of distributed systems engineering.",
      totalYearsExperience: 10,
      workAuthorization: "CITIZEN",
      requiresSponsorship: false,
      targetRoles: ["Staff Engineer", "Principal Engineer"],
      targetLocations: ["Remote", "San Francisco, CA"],
      remotePreference: "REMOTE_ONLY",
      desiredSalaryMin: 200000,
      desiredSalaryMax: 250000,
      salaryCurrency: "USD",
    });

    expect(result.success).toBe(true);
    expect(result.data?.candidateId).toBe(mockCandidateId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_PROFILE_UPDATED",
        entityId: mockCandidateId,
      })
    );
  });

  it("3. Rejects profile updates if candidate account is ARCHIVED", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            status: "ARCHIVED",
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await updateCandidateProfileSelfAction({
      headline: "Staff Engineer",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot update profile while account is inactive or archived");
  });

  it("4. Adds and deletes experience records with audit logging", async () => {
    const mockExpId = "exp-uuid-1";

    // Add experience
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            status: "ACTIVE",
          }),
        },
        candidateExperience: {
          create: vi.fn().mockResolvedValue({
            id: mockExpId,
            candidateId: mockCandidateId,
            companyName: "Tech Corp",
            jobTitle: "Senior Engineer",
          }),
        },
      };
      return callback(tx as any);
    });

    const addResult = await upsertCandidateExperienceAction({
      companyName: "Tech Corp",
      jobTitle: "Senior Engineer",
      location: "San Francisco, CA",
      isCurrent: true,
      startDate: "2020-01-01",
      description: "Built core platform services.",
    });

    expect(addResult.success).toBe(true);
    expect(addResult.data?.experienceId).toBe(mockExpId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_EXPERIENCE_UPDATED",
        entityId: mockExpId,
      })
    );

    // Delete experience
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            status: "ACTIVE",
          }),
        },
        candidateExperience: {
          delete: vi.fn().mockResolvedValue({ id: mockExpId }),
        },
      };
      return callback(tx as any);
    });

    const delResult = await deleteCandidateExperienceAction(mockExpId);
    expect(delResult.success).toBe(true);
  });

  it("5. Adds and deletes education records", async () => {
    const mockEduId = "edu-uuid-1";

    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            status: "ACTIVE",
          }),
        },
        candidateEducation: {
          create: vi.fn().mockResolvedValue({
            id: mockEduId,
            candidateId: mockCandidateId,
            institution: "Stanford University",
            degree: "B.S. in Computer Science",
          }),
        },
      };
      return callback(tx as any);
    });

    const addResult = await upsertCandidateEducationAction({
      institution: "Stanford University",
      degree: "B.S. in Computer Science",
      fieldOfStudy: "Computer Science",
      startDate: "2016-09-01",
      endDate: "2020-06-01",
    });

    expect(addResult.success).toBe(true);
    expect(addResult.data?.educationId).toBe(mockEduId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_EDUCATION_UPDATED",
        entityId: mockEduId,
      })
    );

    // Delete education
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            status: "ACTIVE",
          }),
        },
        candidateEducation: {
          delete: vi.fn().mockResolvedValue({ id: mockEduId }),
        },
      };
      return callback(tx as any);
    });

    const delResult = await deleteCandidateEducationAction(mockEduId);
    expect(delResult.success).toBe(true);
  });

  it("6. Synchronizes candidate skills with locked minimal schema (name string only)", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockUserId,
            status: "ACTIVE",
          }),
        },
        candidateSkill: {
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          createMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      };
      return callback(tx as any);
    });

    const result = await syncCandidateSkillsAction([
      "TypeScript",
      "PostgreSQL",
      "Distributed Systems",
    ]);

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANDIDATE_SKILLS_UPDATED",
        entityType: "CandidateSkill",
        details: { count: 3 },
      })
    );
  });
});
