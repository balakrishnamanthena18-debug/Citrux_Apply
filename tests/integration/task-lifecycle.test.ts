import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createTaskAction,
  transitionTaskStatusAction,
} from "@/lib/task/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { TaskStatus, TaskCategory, TaskType, TaskPriority } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

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

describe("Task Lifecycle & Status Transitions Integration (tests/integration/task-lifecycle.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockTaskId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Staff member creates task in BACKLOG when no assignee provided", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          create: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            title: "Prepare resume",
            category: TaskCategory.APPLICATION,
            type: TaskType.PREPARE_RESUME,
            status: TaskStatus.BACKLOG,
            priority: TaskPriority.NORMAL,
            assignedEmployeeId: null,
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await createTaskAction({
      title: "Prepare resume",
      category: "APPLICATION",
      type: "PREPARE_RESUME",
    });

    expect(result.success).toBe(true);
    expect(result.data?.taskId).toBe(mockTaskId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_CREATED",
        entityId: mockTaskId,
      })
    );
  });

  it("2. Transitions task from ASSIGNED to IN_PROGRESS and records state history", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const stateHistories: any[] = [];

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.ASSIGNED,
            checklistItems: [],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        taskStateHistory: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            stateHistories.push(data);
            return data;
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: "IN_PROGRESS",
    });

    expect(result.success).toBe(true);
    expect(stateHistories).toHaveLength(1);
    expect(stateHistories[0].fromStatus).toBe(TaskStatus.ASSIGNED);
    expect(stateHistories[0].toStatus).toBe(TaskStatus.IN_PROGRESS);
  });

  it("3. Rejects transition to BLOCKED when mandatory reason is omitted", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.IN_PROGRESS,
            checklistItems: [],
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: "BLOCKED",
      reason: "", // Empty reason
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("reason is mandatory");
  });

  it("4. Successfully transitions to BLOCKED when valid reason is provided", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.IN_PROGRESS,
            checklistItems: [],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: "BLOCKED",
      reason: "Missing candidate authorization transcript",
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_STATUS_CHANGED",
        entityId: mockTaskId,
        details: expect.objectContaining({ targetStatus: "BLOCKED" }),
      })
    );
  });

  it("5. Completes task and emits TASK_COMPLETED audit event", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.IN_PROGRESS,
            checklistItems: [],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: "COMPLETED",
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_COMPLETED",
        entityId: mockTaskId,
      })
    );
  });

  it("6. Rejects task mutations when invoked by a Candidate user", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: "candidate-user-1",
      email: "cand@test.com",
      role: "CANDIDATE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(requireEmployeeOrAdmin).mockImplementation(() => {
      throw new AuthorizationError("Staff access required");
    });

    const result = await createTaskAction({
      title: "Unauthorized task",
      category: "APPLICATION",
      type: "PREPARE_RESUME",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Staff access required");
  });
});
