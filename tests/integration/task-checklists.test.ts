import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateTaskChecklistItemAction, transitionTaskStatusAction } from "@/lib/task/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { TaskStatus } from "@/generated/prisma";

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

describe("Task Preparation Checklists & Completion Gates (tests/integration/task-checklists.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockTaskId = "33333333-3333-4333-8333-333333333333";
  const mockItemId1 = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("1. Toggles checklist item completion state and logs audit event", async () => {
    let updatedData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskChecklistItem: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockItemId1,
            task: { organizationId: mockOrgId },
          }),
          update: vi.fn().mockImplementation(async ({ data }) => {
            updatedData = data;
            return { id: mockItemId1, ...data };
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await updateTaskChecklistItemAction({
      checklistItemId: mockItemId1,
      isCompleted: true,
    });

    expect(result.success).toBe(true);
    expect(updatedData.isCompleted).toBe(true);
    expect(updatedData.completedById).toBe(mockEmployeeId);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_CHECKLIST_UPDATED",
        entityId: mockItemId1,
      })
    );
  });

  it("2. Blocks completing task when incomplete checklist items exist", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.IN_PROGRESS,
            checklistItems: [
              { id: "item-1", isCompleted: true },
              { id: "item-2", isCompleted: false }, // Incomplete item
            ],
          }),
        },
      };
      return callback(tx as any);
    });

    const result = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: "COMPLETED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("All checklist items must be completed");
  });

  it("3. Successfully completes task when all checklist items are completed", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.IN_PROGRESS,
            checklistItems: [
              { id: "item-1", isCompleted: true },
              { id: "item-2", isCompleted: true },
            ],
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
  });
});
