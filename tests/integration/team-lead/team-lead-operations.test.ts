import { describe, it, expect, vi, beforeEach } from "vitest";
import { assignTaskAction, createTaskAction, transitionTaskStatusAction } from "@/lib/task/actions";
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

describe("Team Lead Operational Actions Integration Tests", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockTeamLeadId = "22222222-2222-4222-8222-222222222222";
  const mockEmployeeId = "33333333-3333-4333-8333-333333333333";
  const mockTaskId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockTeamLeadId,
      email: "teamlead@test.com",
      role: Role.EMPLOYEE,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Allows authorized Team Lead to assign backlog task to an active team employee", async () => {
    let updatedData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            canAssignRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.userId === mockTeamLeadId) {
              return { isTeamLead: true, teamLeadOf: "Alpha-Team" };
            }
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
            status: TaskStatus.BACKLOG,
            assignedEmployeeId: null,
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
    expect(updatedData.status).toBe(TaskStatus.ASSIGNED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_ASSIGNED",
        userId: mockTeamLeadId,
        entityId: mockTaskId,
      })
    );
  });

  it("2. Rejects task assignment from unauthorized base employee without Team Lead authority", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            canAssignRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.userId === mockTeamLeadId) {
              return { isTeamLead: false, teamLeadOf: null };
            }
            return null;
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await assignTaskAction({
      taskId: mockTaskId,
      assignedEmployeeId: mockEmployeeId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("You do not have permission to assign operational tasks");
  });
});
