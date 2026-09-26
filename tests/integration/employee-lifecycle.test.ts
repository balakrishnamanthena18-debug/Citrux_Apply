import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEmployeeAction,
  setEmployeeStatusAction,
  updateEmployeeRoleAction,
} from "@/lib/admin/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { Role, MembershipStatus, AuditAction } from "@/generated/prisma";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireAdmin: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn().mockReturnValue({
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

describe("Phase 8 Employee Lifecycle & Role Management (tests/integration/employee-lifecycle.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockTargetUserId = "33333333-3333-4333-8333-333333333333";
  const mockMembershipId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@example.com",
      role: Role.ADMIN,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: MembershipStatus.ACTIVE,
    });
  });

  it("1. Admin provisions new employee -> creates user & membership and writes EMPLOYEE_CREATED audit log", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        membership: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            organizationId: mockOrgId,
            userId: mockTargetUserId,
            role: Role.EMPLOYEE,
            status: MembershipStatus.INVITED,
            employeeId: "CIT-EMP-0001",
          }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockTargetUserId,
            email: "bob@company.com",
            firstName: "Bob",
            lastName: "Jones",
          }),
        },
        staffActivationToken: {
          create: vi.fn().mockResolvedValue({
            id: "token-1",
            membershipId: mockMembershipId,
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await createEmployeeAction({
      email: "bob@company.com",
      firstName: "Bob",
      lastName: "Jones",
      role: "EMPLOYEE",
    });

    expect(res.success).toBe(true);
    expect(res.data?.membershipId).toBe(mockMembershipId);
    expect(res.data?.userId).toBe(mockTargetUserId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMPLOYEE_CREATED,
        entityType: "Membership",
        entityId: mockMembershipId,
        details: expect.objectContaining({
          targetUserId: mockTargetUserId,
          email: "bob@company.com",
          role: "EMPLOYEE",
        }),
      })
    );
  });

  it("2. Admin updates staff role EMPLOYEE -> ADMIN -> writes EMPLOYEE_ROLE_UPDATED audit log", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            organizationId: mockOrgId,
            userId: mockTargetUserId,
            role: Role.EMPLOYEE,
            status: MembershipStatus.ACTIVE,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            role: Role.ADMIN,
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await updateEmployeeRoleAction({
      employeeUserId: mockTargetUserId,
      role: "ADMIN",
    });

    expect(res.success).toBe(true);
    expect(res.data?.role).toBe(Role.ADMIN);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMPLOYEE_ROLE_UPDATED,
        entityId: mockMembershipId,
        details: expect.objectContaining({
          fromRole: Role.EMPLOYEE,
          toRole: "ADMIN",
        }),
      })
    );
  });

  it("3. Admin deactivates and reactivates employee -> writes EMPLOYEE_DEACTIVATED / ACTIVATED audit logs", async () => {
    // Deactivation
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            organizationId: mockOrgId,
            userId: mockTargetUserId,
            status: MembershipStatus.ACTIVE,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            status: MembershipStatus.DEACTIVATED,
          }),
        },
      };
      return callback(tx as any);
    });

    const deactRes = await setEmployeeStatusAction({
      employeeUserId: mockTargetUserId,
      status: "INACTIVE",
    });

    expect(deactRes.success).toBe(true);
    expect(deactRes.data?.status).toBe(MembershipStatus.DEACTIVATED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMPLOYEE_DEACTIVATED,
        entityId: mockMembershipId,
      })
    );

    // Reactivation
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            organizationId: mockOrgId,
            userId: mockTargetUserId,
            status: MembershipStatus.DEACTIVATED,
          }),
          update: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            status: MembershipStatus.ACTIVE,
          }),
        },
      };
      return callback(tx as any);
    });

    const actRes = await setEmployeeStatusAction({
      employeeUserId: mockTargetUserId,
      status: "ACTIVE",
    });

    expect(actRes.success).toBe(true);
    expect(actRes.data?.status).toBe(MembershipStatus.ACTIVE);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMPLOYEE_ACTIVATED,
        entityId: mockMembershipId,
      })
    );
  });
});
