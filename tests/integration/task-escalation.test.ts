import { describe, it, expect, vi, beforeEach } from "vitest";
import { transitionTaskStatusAction, assignTaskAction } from "@/lib/task/actions";
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

describe("Task Administrative Escalation & Triage (tests/integration/task-escalation.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockAdminId = "33333333-3333-4333-8333-333333333333";
  const mockTaskId = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Staff member escalates task with mandatory reason", async () => {
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
      targetStatus: "ESCALATED",
      reason: "Portal security check requires admin authorization token",
    });

    expect(result.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_ESCALATED",
        entityId: mockTaskId,
        details: expect.objectContaining({ reason: "Portal security check requires admin authorization token" }),
      })
    );
  });

  it("2. Admin triages escalated task by resolving blocker (ESCALATED -> IN_PROGRESS)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminId,
      email: "admin@test.com",
      role: "ADMIN" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    let updatedData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.ESCALATED,
            checklistItems: [],
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

    const result = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: "IN_PROGRESS",
      reason: "Admin provided authorization token; work resumed",
    });

    expect(result.success).toBe(true);
    expect(updatedData.status).toBe(TaskStatus.IN_PROGRESS);
  });

  it("3. Admin triages escalated task by cancelling unresolvable task (ESCALATED -> CANCELED)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockAdminId,
      email: "admin@test.com",
      role: "ADMIN" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    let updatedData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.ESCALATED,
            checklistItems: [],
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

    const result = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: "CANCELED",
      reason: "External job listing was deleted by employer",
    });

    expect(result.success).toBe(true);
    expect(updatedData.status).toBe(TaskStatus.CANCELED);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_CANCELED",
        entityId: mockTaskId,
      })
    );
  });
});
