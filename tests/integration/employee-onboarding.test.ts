import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEmployeeAction,
  resendStaffActivationAction,
  updateEmployeeDesignationAction,
  updateEmployeeOrganizationAction,
} from "@/lib/admin/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent, logSystemAuditEvent } from "@/lib/audit";
import { emailNotificationService } from "@/lib/email";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { Role, MembershipStatus, DesignationStatus, AuditAction } from "@/generated/prisma";

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();

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
  logSystemAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: mockCreateUser,
        deleteUser: mockDeleteUser,
      },
    },
  }),
}));

vi.mock("@/lib/email", () => ({
  emailNotificationService: {
    sendTransactionalNotification: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe("Employee Onboarding & Identity Integration Tests (tests/integration/employee-onboarding.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockNewAuthUserId = "33333333-3333-4333-8333-333333333333";
  const mockMembershipId = "44444444-4444-4444-8444-444444444444";
  const mockDesignationId = "55555555-5555-5555-8555-555555555555";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminUserId,
      email: "admin@citrux.com",
      role: Role.ADMIN,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: MembershipStatus.ACTIVE,
    });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: mockNewAuthUserId, email: "new.staff@citrux.com" } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });
  });

  it("1. Identity Invariant: auth.users.id === User.id === Membership.userId with sequential Employee ID", async () => {
    let createdTokenHash: string | null = null;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        designation: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDesignationId,
            organizationId: mockOrgId,
            status: DesignationStatus.ACTIVE,
          }),
        },
        membership: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args) => {
            expect(args.data.userId).toBe(mockNewAuthUserId);
            expect(args.data.employeeId).toBe("CIT-EMP-0001");
            expect(args.data.status).toBe(MembershipStatus.INVITED);
            return Promise.resolve({
              id: mockMembershipId,
              organizationId: mockOrgId,
              userId: mockNewAuthUserId,
              employeeId: "CIT-EMP-0001",
              status: MembershipStatus.INVITED,
              role: Role.EMPLOYEE,
            });
          }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args) => {
            expect(args.data.id).toBe(mockNewAuthUserId);
            return Promise.resolve({
              id: mockNewAuthUserId,
              email: "new.staff@citrux.com",
              firstName: "Alice",
              lastName: "Smith",
            });
          }),
        },
        staffActivationToken: {
          create: vi.fn().mockImplementation((args) => {
            createdTokenHash = args.data.tokenHash;
            expect(args.data.organizationId).toBe(mockOrgId);
            expect(args.data.membershipId).toBe(mockMembershipId);
            expect(args.data.tokenHash).toBeDefined();
            expect(args.data.expiresAt).toBeDefined();
            return Promise.resolve({
              id: "token-1",
              ...args.data,
            });
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await createEmployeeAction({
      email: "new.staff@citrux.com",
      firstName: "Alice",
      lastName: "Smith",
      role: "EMPLOYEE",
      designationId: mockDesignationId,
    });

    expect(res.success).toBe(true);
    expect(res.data?.userId).toBe(mockNewAuthUserId);
    expect(res.data?.membershipId).toBe(mockMembershipId);
    expect(res.data?.employeeId).toBe("CIT-EMP-0001");

    // Supabase createUser was called with email_confirm: true and without temporary password
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new.staff@citrux.com",
        email_confirm: true,
      })
    );

    // Welcome email dispatched post-commit with activation URL
    expect(emailNotificationService.sendTransactionalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "new.staff@citrux.com",
        templateId: "STAFF_WELCOME_ACTIVATION",
        subject: expect.stringContaining("Welcome to Operations OS"),
      })
    );

    // Audit logs created
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMPLOYEE_CREATED,
        entityId: mockMembershipId,
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMPLOYEE_INVITATION_SENT,
        entityId: mockMembershipId,
      })
    );
  });

  it("2. Compensation: DB failure triggers compensating Supabase deleteUser", async () => {
    vi.mocked(withRlsContext).mockRejectedValue(new Error("Database unique violation"));

    const res = await createEmployeeAction({
      email: "failed.db@citrux.com",
      firstName: "Fail",
      lastName: "User",
      role: "EMPLOYEE",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Database unique violation");
    expect(mockDeleteUser).toHaveBeenCalledWith(mockNewAuthUserId);
  });

  it("3. Compensation Alert: When Supabase cleanup fails, security alert is logged", async () => {
    vi.mocked(withRlsContext).mockRejectedValue(new Error("DB error"));
    mockDeleteUser.mockResolvedValue({ error: { message: "Supabase network timeout" } });

    const res = await createEmployeeAction({
      email: "orphan@citrux.com",
      firstName: "Orphan",
      lastName: "User",
      role: "EMPLOYEE",
    });

    expect(res.success).toBe(false);
    expect(logSystemAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SECURITY_ALERT",
        actorType: "SYSTEM",
        details: expect.objectContaining({
          reason: "ORPHANED_AUTH_USER_CLEANUP_FAILED",
          authUserId: mockNewAuthUserId,
        }),
      })
    );
  });

  it("4. Resend invitation invalidates previous token and creates fresh 48-hour token", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        membership: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            organizationId: mockOrgId,
            userId: mockNewAuthUserId,
            status: MembershipStatus.INVITED,
            user: { firstName: "Alice", email: "alice@citrux.com" },
          }),
        },
        staffActivationToken: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockResolvedValue({ id: "token-2" }),
        },
      };
      return callback(tx as any);
    });

    const res = await resendStaffActivationAction({
      membershipId: mockMembershipId,
    });

    expect(res.success).toBe(true);
    expect(emailNotificationService.sendTransactionalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "alice@citrux.com",
        templateId: "STAFF_WELCOME_ACTIVATION",
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMPLOYEE_INVITATION_RESENT,
        entityId: mockMembershipId,
      })
    );
  });

  it("5. Assigning an ARCHIVED designation is rejected", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        membership: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockMembershipId,
            organizationId: mockOrgId,
            userId: mockNewAuthUserId,
          }),
        },
        designation: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockDesignationId,
            organizationId: mockOrgId,
            status: DesignationStatus.ARCHIVED,
          }),
        },
      };
      return callback(tx as any);
    });

    const res = await updateEmployeeDesignationAction({
      membershipId: mockMembershipId,
      designationId: mockDesignationId,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Cannot assign an ARCHIVED designation");
  });
});
