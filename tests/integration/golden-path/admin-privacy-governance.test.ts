import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEmployeeAction,
  setEmployeeStatusAction,
  updateEmployeeRoleAction,
  reassignOperationalWorkAction,
  listAuditLogsAction,
} from "@/lib/admin/actions";
import {
  createPrivacyRequestAction,
  verifyPrivacyRequestAction,
  completePrivacyRequestAction,
  getCandidateExportDataAction,
} from "@/lib/privacy/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  Role,
  MembershipStatus,
  PrivacyRequestType,
  PrivacyRequestStatus,
} from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN") {
      throw new AuthorizationError("Operation requires ADMIN role");
    }
  }),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN" && ctx.role !== "EMPLOYEE") {
      throw new AuthorizationError("Operation requires EMPLOYEE or ADMIN role");
    }
  }),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Operation requires CANDIDATE role");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
  logSystemAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: "33333333-3333-4333-8333-333333333333" } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  }),
}));

vi.mock("@/lib/email", () => ({
  emailNotificationService: {
    sendTransactionalNotification: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe("Phase 9 Golden Path — Admin Operations & Privacy Governance (tests/integration/golden-path/admin-privacy-governance.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockEmployeeUserId = "33333333-3333-4333-8333-333333333333";
  const mockEmployee2UserId = "44444444-4444-4444-8444-444444444444";
  const mockCandidateUserId = "55555555-5555-4555-8555-555555555555";
  const mockCandidateId = "66666666-6666-4666-8666-666666666666";
  const mockRequestId = "77777777-7777-4777-8777-777777777777";
  const mockTaskId1 = "88888888-8888-4888-8888-888888888888";
  const mockTaskId2 = "88888888-8888-4888-8888-888888888889";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Step 5: Admin provisions operational employee, updates role, and toggles status to INACTIVE", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@alpha.com",
      role: "ADMIN" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    // 1. Admin creates employee
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockEmployeeUserId,
            email: "ops-engineer@alpha.com",
            firstName: "Operational",
            lastName: "Engineer",
            status: "ACTIVE",
          }),
        },
        membership: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({
            id: "mem-emp-1",
            userId: mockEmployeeUserId,
            organizationId: mockOrgId,
            role: Role.EMPLOYEE,
            status: MembershipStatus.INVITED,
            employeeId: "CIT-EMP-0001",
          }),
        },
        staffActivationToken: {
          create: vi.fn().mockResolvedValue({ id: "tok-1" }),
        },
      };
      return callback(tx as any);
    });

    const createEmpRes = await createEmployeeAction({
      email: "ops-engineer@alpha.com",
      firstName: "Operational",
      lastName: "Engineer",
      role: "EMPLOYEE",
    });
    expect(createEmpRes.success).toBe(true);
    expect(createEmpRes.data?.userId).toBe(mockEmployeeUserId);

    // 2. Admin updates role to ADMIN
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-emp-1",
            userId: mockEmployeeUserId,
            organizationId: mockOrgId,
            role: Role.EMPLOYEE,
          }),
          update: vi.fn().mockResolvedValue({
            id: "mem-emp-1",
            role: Role.ADMIN,
          }),
        },
        user: {
          update: vi.fn().mockResolvedValue({ id: mockEmployeeUserId, role: Role.ADMIN }),
        },
      };
      return callback(tx as any);
    });

    const roleRes = await updateEmployeeRoleAction({
      employeeUserId: mockEmployeeUserId,
      role: "ADMIN",
    });
    expect(roleRes.success).toBe(true);
    expect(roleRes.data?.role).toBe("ADMIN");

    // 3. Admin deactivates employee -> status becomes INACTIVE
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-emp-1",
            userId: mockEmployeeUserId,
            organizationId: mockOrgId,
            status: MembershipStatus.ACTIVE,
          }),
          update: vi.fn().mockResolvedValue({
            id: "mem-emp-1",
            status: MembershipStatus.DEACTIVATED,
          }),
        },
        user: {
          update: vi.fn().mockResolvedValue({ id: mockEmployeeUserId, status: "INACTIVE" }),
        },
      };
      return callback(tx as any);
    });

    const statusRes = await setEmployeeStatusAction({
      employeeUserId: mockEmployeeUserId,
      status: "INACTIVE",
    });
    expect(statusRes.success).toBe(true);
  });

  it("Admin performs strictly manual work reassignment (No automated routing)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@alpha.com",
      role: "ADMIN" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-emp-2",
            userId: mockEmployee2UserId,
            organizationId: mockOrgId,
            role: Role.EMPLOYEE,
            status: MembershipStatus.ACTIVE,
          }),
        },
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        candidate: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx as any);
    });

    const reassignRes = await reassignOperationalWorkAction({
      targetEmployeeId: mockEmployee2UserId,
      taskIds: [mockTaskId1, mockTaskId2],
      candidateIds: [mockCandidateId],
    });

    expect(reassignRes.success).toBe(true);
    expect(reassignRes.data?.reassignedTasks).toBe(2);
    expect(reassignRes.data?.reassignedCandidates).toBe(1);
  });

  it("Step 22: Admin inspects authoritative audit trail in public.audit_events (Candidate is blinded)", async () => {
    // Admin query succeeds
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: mockAdminUserId,
      email: "admin@alpha.com",
      role: "ADMIN" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        auditEvent: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "audit-evt-1",
              organizationId: mockOrgId,
              actorId: mockAdminUserId,
              actorType: "USER",
              action: "EMPLOYEE_ROLE_UPDATED",
              entityType: "MEMBERSHIP",
              entityId: "mem-emp-1",
              createdAt: new Date(),
            },
          ]),
          count: vi.fn().mockResolvedValue(1),
        },
      };
      return callback(tx as any);
    });

    const auditRes = await listAuditLogsAction({ limit: 10, page: 1 });
    expect(auditRes.success).toBe(true);
    expect(auditRes.data?.logs).toHaveLength(1);
    expect(auditRes.data?.logs[0].action).toBe("EMPLOYEE_ROLE_UPDATED");

    // Candidate query is rejected with 403 Forbidden
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const candAuditRes = await listAuditLogsAction({ limit: 10, page: 1 });
    expect(candAuditRes.success).toBe(false);
    expect(candAuditRes.error).toMatch(/ADMIN role/i);
  });

  it("Step 23: Candidate submits DATA_EXPORT -> Staff verifies identity -> Admin assembles export & completes request", async () => {
    // 1. Candidate submits DATA_EXPORT
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: mockCandidateUserId,
      email: "candidate@alpha.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({ id: mockCandidateId, userId: mockCandidateUserId, organizationId: mockOrgId }),
        },
        privacyRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockRequestId,
            candidateId: mockCandidateId,
            organizationId: mockOrgId,
            requestType: PrivacyRequestType.DATA_EXPORT,
            status: PrivacyRequestStatus.PENDING,
          }),
        },
      };
      return callback(tx as any);
    });

    const candReqRes = await createPrivacyRequestAction({
      requestType: "DATA_EXPORT",
      scopeDetails: "Requesting full copy of my candidate profile data.",
    });
    expect(candReqRes.success).toBe(true);
    expect(candReqRes.data?.requestId).toBe(mockRequestId);

    // 2. Staff verifies identity
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: mockEmployee2UserId,
      email: "staff2@alpha.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        privacyRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockRequestId,
            organizationId: mockOrgId,
            status: PrivacyRequestStatus.PENDING,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx as any);
    });

    const verifyRes = await verifyPrivacyRequestAction({
      requestId: mockRequestId,
      verificationNotes: "Identity confirmed via government ID and secondary email check.",
    });
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.data?.status).toBe(PrivacyRequestStatus.IDENTITY_VERIFIED);

    // 3. Admin queries candidate export data package
    vi.mocked(getAuthenticatedContext).mockResolvedValueOnce({
      userId: mockAdminUserId,
      email: "admin@alpha.com",
      role: "ADMIN" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
            user: {
              id: mockCandidateUserId,
              email: "candidate@alpha.com",
              firstName: "Jane",
              lastName: "Doe",
              createdAt: new Date(),
            },
            headline: "Senior Software Engineer",
            experiences: [],
            educations: [],
            skills: [],
            documents: [],
            applications: [],
            conversations: [],
          }),
        },
      };
      return callback(tx as any);
    });

    const exportDataRes = await getCandidateExportDataAction(mockCandidateId);
    expect(exportDataRes.success).toBe(true);
    expect(exportDataRes.data?.exportBundle.profile.headline).toBe("Senior Software Engineer");

    // 4. Admin completes privacy request
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        privacyRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockRequestId,
            organizationId: mockOrgId,
            status: PrivacyRequestStatus.IDENTITY_VERIFIED,
            requestType: PrivacyRequestType.DATA_EXPORT,
            candidateId: mockCandidateId,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx as any);
    });

    const completeRes = await completePrivacyRequestAction({
      requestId: mockRequestId,
      resolutionNotes: "Export assembled and transmitted to verified candidate.",
    });
    expect(completeRes.success).toBe(true);
    expect(completeRes.data?.status).toBe(PrivacyRequestStatus.COMPLETED);
  });
});
