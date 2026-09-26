import { describe, it, expect, vi, beforeEach } from "vitest";
import { assignTaskAction } from "@/lib/task/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { TaskStatus, Role } from "@/generated/prisma";

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

describe("Task Assignment & Work Allocation Integration (tests/integration/task-assignment.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockAdminId = "22222222-2222-4222-8222-222222222222";
  const mockEmployeeA = "33333333-3333-4333-8333-333333333333";
  const mockEmployeeB = "44444444-4444-4444-8444-444444444444";
  const mockTaskId = "55555555-5555-4555-8555-555555555555";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminId,
      email: "admin@test.com",
      role: "ADMIN" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Assigns an unassigned BACKLOG task to an active employee", async () => {
    let updatedData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
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
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            userId: mockEmployeeA,
            role: Role.EMPLOYEE,
            status: "ACTIVE",
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await assignTaskAction({
      taskId: mockTaskId,
      assignedEmployeeId: mockEmployeeA,
    });

    expect(result.success).toBe(true);
    expect(updatedData.assignedEmployeeId).toBe(mockEmployeeA);
    expect(updatedData.status).toBe(TaskStatus.ASSIGNED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_ASSIGNED",
        entityId: mockTaskId,
      })
    );
  });

  it("2. Reassigns task from Employee A to Employee B and marks REASSIGNED", async () => {
    let updatedData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.IN_PROGRESS,
            assignedEmployeeId: mockEmployeeA,
          }),
          update: vi.fn().mockImplementation(async ({ data }) => {
            updatedData = data;
            return { id: mockTaskId, ...data };
          }),
        },
        membership: {
          findFirst: vi.fn().mockResolvedValue({
            userId: mockEmployeeB,
            role: Role.EMPLOYEE,
            status: "ACTIVE",
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await assignTaskAction({
      taskId: mockTaskId,
      assignedEmployeeId: mockEmployeeB,
    });

    expect(result.success).toBe(true);
    expect(updatedData.assignedEmployeeId).toBe(mockEmployeeB);
    expect(updatedData.status).toBe(TaskStatus.REASSIGNED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_REASSIGNED",
        entityId: mockTaskId,
      })
    );
  });

  it("3. Unassigns a task and transitions it back to BACKLOG", async () => {
    let updatedData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.ASSIGNED,
            assignedEmployeeId: mockEmployeeA,
          }),
          update: vi.fn().mockImplementation(async ({ data }) => {
            updatedData = data;
            return { id: mockTaskId, ...data };
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await assignTaskAction({
      taskId: mockTaskId,
      assignedEmployeeId: null,
    });

    expect(result.success).toBe(true);
    expect(updatedData.assignedEmployeeId).toBeNull();
    expect(updatedData.status).toBe(TaskStatus.BACKLOG);
  });

  it("4. Rejects assignment when target user is not active staff in the organization", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.BACKLOG,
          }),
        },
        membership: {
          findFirst: vi.fn().mockResolvedValue(null), // Not found or not active staff
        },
      };
      return callback(tx as any);
    });

    const result = await assignTaskAction({
      taskId: mockTaskId,
      assignedEmployeeId: "99999999-9999-4999-8999-999999999999",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Target user is not an active staff member");
  });
});
