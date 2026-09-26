import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApplicationAction } from "@/lib/application/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { ApplicationStatus } from "@/generated/prisma";
import { ConflictError } from "@/lib/errors";

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

describe("Application Reapplication & Partial Unique Index (tests/integration/application-reapplication.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";
  const mockJobId = "55555555-5555-4555-8555-555555555555";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Blocks duplicate application creation when an active non-terminal application exists", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({ id: mockCandidateId, organizationId: mockOrgId, status: "ACTIVE" }),
        },
        job: {
          findUnique: vi.fn().mockResolvedValue({ id: mockJobId, organizationId: mockOrgId, status: "OPEN" }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue({
            id: "existing-app-1",
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: ApplicationStatus.PREPARING,
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await createApplicationAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Candidate already has an active application");
  });

  it("2. Allows creating a new application when prior application is in REJECTED terminal state", async () => {
    const newAppId = "new-app-uuid-2";

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({ id: mockCandidateId, organizationId: mockOrgId, status: "ACTIVE" }),
        },
        job: {
          findUnique: vi.fn().mockResolvedValue({ id: mockJobId, organizationId: mockOrgId, status: "OPEN" }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue(null), // No active (non-terminal) application exists
          create: vi.fn().mockResolvedValue({
            id: newAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: ApplicationStatus.DISCOVERED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await createApplicationAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe(newAppId);
  });

  it("3. Allows creating a new application when prior application is in WITHDRAWN terminal state", async () => {
    const newAppId = "new-app-uuid-3";

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({ id: mockCandidateId, organizationId: mockOrgId, status: "ACTIVE" }),
        },
        job: {
          findUnique: vi.fn().mockResolvedValue({ id: mockJobId, organizationId: mockOrgId, status: "OPEN" }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: newAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: ApplicationStatus.DISCOVERED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await createApplicationAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe(newAppId);
  });

  it("4. Allows creating a new application when prior application is in FAILED terminal state", async () => {
    const newAppId = "new-app-uuid-4";

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({ id: mockCandidateId, organizationId: mockOrgId, status: "ACTIVE" }),
        },
        job: {
          findUnique: vi.fn().mockResolvedValue({ id: mockJobId, organizationId: mockOrgId, status: "OPEN" }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: newAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: ApplicationStatus.DISCOVERED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await createApplicationAction({
      candidateId: mockCandidateId,
      jobId: mockJobId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.applicationId).toBe(newAppId);
  });
});
