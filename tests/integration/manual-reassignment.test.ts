import { describe, it, expect, vi, beforeEach } from "vitest";
import { reassignOperationalWorkAction } from "@/lib/admin/actions";
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

describe("Phase 8 Strictly Manual Work Reassignment (tests/integration/manual-reassignment.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminUserId = "22222222-2222-4222-8222-222222222222";
  const mockActiveEmployeeId = "33333333-3333-4333-8333-333333333333";
  const mockInactiveEmployeeId = "44444444-4444-4444-8444-444444444444";

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

  it("1. Admin successfully reassigns applications, tasks, and candidates to target active employee", async () => {
    const appIds = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
    const taskIds = ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"];
    const candIds = ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"];

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-1",
            organizationId: mockOrgId,
            userId: mockActiveEmployeeId,
            role: Role.EMPLOYEE,
            status: MembershipStatus.ACTIVE,
          }),
        },
        application: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        candidate: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return callback(tx as any);
    });

    const res = await reassignOperationalWorkAction({
      targetEmployeeId: mockActiveEmployeeId,
      applicationIds: appIds,
      taskIds,
      candidateIds: candIds,
    });

    expect(res.success).toBe(true);
    expect(res.data?.reassignedApplications).toBe(2);
    expect(res.data?.reassignedTasks).toBe(1);
    expect(res.data?.reassignedCandidates).toBe(1);

    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.OPERATIONAL_WORK_REASSIGNED,
        entityType: "Organization",
        entityId: mockOrgId,
        details: expect.objectContaining({
          targetEmployeeId: mockActiveEmployeeId,
          reassignedApplicationsCount: 2,
          reassignedTasksCount: 1,
          reassignedCandidatesCount: 1,
        }),
      })
    );
  });

  it("2. Reassignment fails if target employee is inactive or not found in organization", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue(null), // target not active staff in org
        },
      };
      return callback(tx as any);
    });

    const res = await reassignOperationalWorkAction({
      targetEmployeeId: mockInactiveEmployeeId,
      applicationIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Target employee is not an active staff member in this organization/i);
    expect(logUserAuditEvent).not.toHaveBeenCalled();
  });
});
