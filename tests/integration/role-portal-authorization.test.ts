import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  candidateApproveApplicationAction,
  candidateRequestRevisionAction,
} from "@/lib/qa/actions";
import { getAuthenticatedContext, requireCandidate, requireEmployeeOrAdmin, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { Role, ApplicationStatus, ApplicationApprovalStatus, JobStatus } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";
import { authoritativeQaTxMocks } from "../helpers/authoritative-qa-mock";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== Role.CANDIDATE) {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== Role.EMPLOYEE && ctx.role !== Role.ADMIN) {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== Role.ADMIN) {
      throw new AuthorizationError("Operation requires ADMIN role");
    }
  }),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Role Isolation & Candidate Approval Authorization (tests/integration/role-portal-authorization.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockCandidateUserId = "33333333-3333-4333-8333-333333333333";
  const mockCandidateId = "44444444-4444-4444-8444-444444444444";
  const mockEmployeeUserId = "55555555-5555-4555-8555-555555555555";
  const mockAdminUserId = "77777777-7777-4777-8777-777777777777";
  const mockAppId = "66666666-6666-4666-8666-666666666666";
  const mockJobId = "88888888-8888-4888-8888-888888888888";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TEST 1 & 2: Candidate accesses own application and approves -> state transition to READY", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@test.com",
      role: Role.CANDIDATE,
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
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            jobId: mockJobId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            job: { id: mockJobId, status: JobStatus.OPEN },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
            approvedBy: mockCandidateUserId,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-1" }),
        },
        ...authoritativeQaTxMocks(),
      };
      return callback(tx as any);
    });

    const result = await candidateApproveApplicationAction({ applicationId: mockAppId });
    expect(result.success).toBe(true);
    expect(result.application.status).toBe(ApplicationStatus.READY);
  });

  it("TEST 3: Candidate requests revision on application in AWAITING_APPROVAL -> moves to PREPARING", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@test.com",
      role: Role.CANDIDATE,
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
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            candidateId: mockCandidateId,
            status: ApplicationStatus.AWAITING_APPROVAL,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppId,
            status: ApplicationStatus.PREPARING,
            approvalStatus: ApplicationApprovalStatus.REVISION_REQUESTED,
            approvalNotes: "Update my recent title please.",
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-2" }),
        },
      };
      return callback(tx as any);
    });

    const result = await candidateRequestRevisionAction({
      applicationId: mockAppId,
      revisionNotes: "Update my recent title please.",
    });
    expect(result.success).toBe(true);
    expect(result.application.status).toBe(ApplicationStatus.PREPARING);
  });

  it("TEST 4 & 6: Employee session attempting candidateApproveApplicationAction directly is rejected with AuthorizationError", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeUserId,
      email: "sarah.chen@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    await expect(
      candidateApproveApplicationAction({ applicationId: mockAppId })
    ).rejects.toThrowError(/Operation requires CANDIDATE role/i);
  });

  it("TEST 6b: Employee session attempting candidateRequestRevisionAction directly is rejected with AuthorizationError", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeUserId,
      email: "sarah.chen@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    await expect(
      candidateRequestRevisionAction({
        applicationId: mockAppId,
        revisionNotes: "Unauthorized employee note",
      })
    ).rejects.toThrowError(/Operation requires CANDIDATE role/i);
  });

  it("TEST 7: Candidate attempting another candidate's application is rejected", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockCandidateUserId,
      email: "candidate@test.com",
      role: Role.CANDIDATE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: "attacker-candidate-id",
            userId: mockCandidateUserId,
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppId,
            organizationId: mockOrgId,
            candidateId: "victim-candidate-id",
            jobId: mockJobId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            job: { id: mockJobId, status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    await expect(
      candidateApproveApplicationAction({ applicationId: mockAppId })
    ).rejects.toThrowError(/You are not authorized to approve this application/i);
  });

  it("TEST 8: Admin attempting candidateApproveApplicationAction directly is rejected with AuthorizationError", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@citrux.com",
      role: Role.ADMIN,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    await expect(
      candidateApproveApplicationAction({ applicationId: mockAppId })
    ).rejects.toThrowError(/Operation requires CANDIDATE role/i);
  });

  it("TEST 9 & 10: Role guards correctly distinguish roles", () => {
    const candidateCtx = {
      userId: mockCandidateUserId,
      email: "candidate@test.com",
      role: Role.CANDIDATE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    };

    const employeeCtx = {
      userId: mockEmployeeUserId,
      email: "staff@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    };

    const adminCtx = {
      userId: mockAdminUserId,
      email: "admin@citrux.com",
      role: Role.ADMIN,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    };

    // Candidate permissions
    expect(() => requireCandidate(candidateCtx)).not.toThrow();
    expect(() => requireEmployeeOrAdmin(candidateCtx)).toThrowError(/Operation requires EMPLOYEE or ADMIN role/i);
    expect(() => requireAdmin(candidateCtx)).toThrowError(/Operation requires ADMIN role/i);

    // Employee permissions
    expect(() => requireCandidate(employeeCtx)).toThrowError(/Operation requires CANDIDATE role/i);
    expect(() => requireEmployeeOrAdmin(employeeCtx)).not.toThrow();
    expect(() => requireAdmin(employeeCtx)).toThrowError(/Operation requires ADMIN role/i);

    // Admin permissions
    expect(() => requireCandidate(adminCtx)).toThrowError(/Operation requires CANDIDATE role/i);
    expect(() => requireEmployeeOrAdmin(adminCtx)).not.toThrow();
    expect(() => requireAdmin(adminCtx)).not.toThrow();
  });
});
