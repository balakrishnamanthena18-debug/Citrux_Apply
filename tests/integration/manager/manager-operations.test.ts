import { describe, it, expect, vi, beforeEach } from "vitest";
import { assignTaskAction, transitionTaskStatusAction } from "@/lib/task/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { TaskStatus, TaskPriority, Role } from "@/generated/prisma";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Manager Operational Actions Integration Tests", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockManagerId = "22222222-2222-4222-8222-222222222222";
  const mockEmployeeId = "33333333-3333-4333-8333-333333333333";
  const mockTaskId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockManagerId,
      email: "manager@test.com",
      role: Role.EMPLOYEE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Allows authorized Manager to reassign an escalated task to another employee", async () => {
    let updatedData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            canAssignRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(5), // 5 direct reports = Manager role
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.userId === mockEmployeeId) {
              return { userId: mockEmployeeId, role: Role.EMPLOYEE, status: "ACTIVE" };
            }
            return null;
          }),
        },
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.ESCALATED,
            assignedEmployeeId: "prev-emp-id",
          }),
          update: vi.fn().mockImplementation(async ({ data }) => {
            updatedData = data;
            return { id: mockTaskId, ...data };
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-1" }),
        },
      };
      return callback(tx as any);
    });

    const result = await assignTaskAction({
      taskId: mockTaskId,
      assignedEmployeeId: mockEmployeeId,
    });

    expect(result.success).toBe(true);
    expect(updatedData.assignedEmployeeId).toBe(mockEmployeeId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_REASSIGNED",
        userId: mockManagerId,
        entityId: mockTaskId,
      })
    );
  });

  it("2. Rejects task escalation resolution when target task belongs to another organization", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            canCancelRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(5),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        task: {
          findUnique: vi.fn().mockResolvedValue(null), // not found in Manager's organizationId
        },
      };
      return callback(tx as any);
    });

    const result = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: TaskStatus.CANCELED,
      reason: "Canceling cross-tenant task attempt",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Task not found");
  });
});
