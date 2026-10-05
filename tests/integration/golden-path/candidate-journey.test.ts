import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signUpCandidateAction } from "@/lib/auth/actions";
import {
  getOrCreateCandidateSelfAction,
  updateCandidateProfileSelfAction,
  upsertCandidateExperienceAction,
  upsertCandidateEducationAction,
  syncCandidateSkillsAction,
  requestDocumentUploadUrlAction,
  registerCandidateDocumentAction,
  getDocumentDownloadUrlAction,
} from "@/lib/candidate/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import { Role, MembershipStatus, CandidateStatus } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServerClient: vi.fn(() => ({
    auth: {
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: "user-alpha-cand-1", email: "candidate@alpha.com" } },
        error: null,
      }),
    },
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: vi.fn().mockResolvedValue({
          data: {
            signedUrl: "https://storage.supabase.co/upload/signed-token",
            path: "tenants/11111111-1111-4111-8111-111111111111/candidates/c0000000-0000-4000-8000-000000000001/documents/doc-1/1/resume.pdf",
            token: "tok-123",
          },
          error: null,
        }),
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://storage.supabase.co/download/signed-token" },
          error: null,
        }),
      })),
    },
  })),
}));

describe("Phase 9 Golden Path — Candidate Journey Integration (tests/integration/golden-path/candidate-journey.test.ts)", () => {
  const originalEnv = process.env.OPERATING_ORGANIZATION_ID;
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateId = "33333333-3333-4333-8333-333333333333";
  const mockDocId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPERATING_ORGANIZATION_ID = mockOrgId;
  });

  afterEach(() => {
    process.env.OPERATING_ORGANIZATION_ID = originalEnv;
  });

  it("Step 1: Candidate registers and completes email verification boundary", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: mockOrgId,
      name: "Org Alpha",
      slug: "org-alpha",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({
            id: mockCandidateUserId,
            email: "candidate@alpha.com",
            role: Role.CANDIDATE,
            status: "ACTIVE",
          }),
        },
        membership: {
          create: vi.fn().mockResolvedValue({
            id: "mem-1",
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
            role: Role.CANDIDATE,
            status: MembershipStatus.ACTIVE,
          }),
        },
        auditEvent: {
          create: vi.fn().mockResolvedValue({ id: "audit-1" }),
        },
      };
      return callback(tx as any);
    });

    const formData = new FormData();
    formData.set("email", "candidate@alpha.com");
    formData.set("password", "Password123!");
    formData.set("firstName", "Jane");
    formData.set("lastName", "Doe");

    const result = await signUpCandidateAction(formData);

    expect(result.success).toBe(true);
    expect(result.data?.redirectUrl).toBeDefined();
  });

  it("Step 2: Candidate initializes profile and populates experiences, education, and skills", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    // 1. Get or create candidate record
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
            status: CandidateStatus.ONBOARDING,
          }),
        },
      };
      return callback(tx as any);
    });

    const initResult = await getOrCreateCandidateSelfAction();
    expect(initResult.success).toBe(true);
    expect(initResult.data?.candidateId).toBe(mockCandidateId);

    // 2. Update profile details
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
            status: CandidateStatus.ONBOARDING,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            headline: "Senior Software Engineer",
            professionalSummary: "10+ years building scalable distributed systems",
            city: "San Francisco",
          }),
        },
        application: { findMany: vi.fn().mockResolvedValue([]) },
        applicationIntelligenceRun: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        applicationAlignmentResult: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        applicationReadinessResult: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return callback(tx as any);
    });

    const updateResult = await updateCandidateProfileSelfAction({
      headline: "Senior Software Engineer",
      professionalSummary: "10+ years building scalable distributed systems",
      city: "San Francisco",
    });
    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.candidateId).toBe(mockCandidateId);

    // 3. Upsert Experience
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
            status: CandidateStatus.ACTIVE,
          }),
        },
        candidateExperience: {
          create: vi.fn().mockResolvedValue({
            id: "exp-1",
            candidateId: mockCandidateId,
            companyName: "Stripe",
            jobTitle: "Staff Engineer",
            startDate: "2020-01-01",
            isCurrent: true,
          }),
        },
      };
      return callback(tx as any);
    });

    const expResult = await upsertCandidateExperienceAction({
      companyName: "Stripe",
      jobTitle: "Staff Engineer",
      startDate: "2020-01-01",
      isCurrent: true,
    });
    expect(expResult.success).toBe(true);

    // 4. Upsert Education
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
            status: CandidateStatus.ACTIVE,
          }),
        },
        candidateEducation: {
          create: vi.fn().mockResolvedValue({
            id: "edu-1",
            candidateId: mockCandidateId,
            institution: "MIT",
            degree: "BS",
            fieldOfStudy: "Computer Science",
          }),
        },
      };
      return callback(tx as any);
    });

    const eduResult = await upsertCandidateEducationAction({
      institution: "MIT",
      degree: "BS",
      fieldOfStudy: "Computer Science",
    });
    expect(eduResult.success).toBe(true);

    // 5. Sync Skills
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
            status: CandidateStatus.ACTIVE,
          }),
        },
        candidateSkill: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      };
      return callback(tx as any);
    });

    const skillResult = await syncCandidateSkillsAction(["TypeScript", "PostgreSQL", "Next.js"]);
    expect(skillResult.success).toBe(true);
  });

  it("Step 3: Candidate requests upload URL and registers document", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: mockCandidateUserId,
            organizationId: mockOrgId,
            status: CandidateStatus.ACTIVE,
          }),
        },
        candidateDocument: {
          create: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            documentType: "RESUME",
            title: "resume.pdf",
            storagePath: `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/resume.pdf`,
            fileSizeBytes: 204800,
            mimeType: "application/pdf",
          }),
          findUnique: vi.fn().mockResolvedValue({
            id: mockDocId,
            candidateId: mockCandidateId,
            storagePath: `tenants/${mockOrgId}/candidates/${mockCandidateId}/documents/resume.pdf`,
            title: "resume.pdf",
            candidate: { organizationId: mockOrgId, userId: mockCandidateUserId },
          }),
        },
      };
      return callback(tx as any);
    });

    const uploadUrlRes = await requestDocumentUploadUrlAction({
      candidateId: mockCandidateId,
      filename: "resume.pdf",
    });
    expect(uploadUrlRes.success).toBe(true);
    expect(uploadUrlRes.data?.signedUrl).toBeDefined();

    const regRes = await registerCandidateDocumentAction({
      candidateId: mockCandidateId,
      documentType: "RESUME",
      title: "resume.pdf",
      fileSizeBytes: 204800,
      mimeType: "application/pdf",
      storagePath: uploadUrlRes.data!.storagePath,
    });
    expect(regRes.success).toBe(true);
    expect(regRes.data?.documentId).toBe(mockDocId);

    const downloadRes = await getDocumentDownloadUrlAction(mockDocId);
    expect(downloadRes.success).toBe(true);
    expect(downloadRes.data?.downloadUrl).toBeDefined();
  });
});
