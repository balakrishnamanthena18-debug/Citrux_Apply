import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskAction, cancelTasksOnConsentRevocationAction } from "@/lib/task/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { TaskStatus, TaskCategory, TaskType } from "@/generated/prisma";

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

describe("Task Context Linkage & Consent Independence (tests/integration/task-context-linkage.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateId = "33333333-3333-4333-8333-333333333333";
  const mockJobId = "44444444-4444-4444-8444-444444444444";
  const mockAppId = "55555555-5555-4555-8555-555555555555";
  const mockTaskId = "66666666-6666-4666-8666-666666666666";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Creates task linked to Candidate, Job, and Application without mutating their statuses", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    let createdTaskData: any;

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({ id: mockCandidateId, organizationId: mockOrgId, status: "ACTIVE" }),
        },
        job: {
          findUnique: vi.fn().mockResolvedValue({ id: mockJobId, organizationId: mockOrgId, status: "OPEN" }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({ id: mockAppId, organizationId: mockOrgId, status: "PREPARING" }),
        },
        task: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            createdTaskData = data;
            return { id: mockTaskId, ...data };
          }),
        },
        taskChecklistItem: {
          createMany: vi.fn().mockResolvedValue({}),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await createTaskAction({
      title: "Tailor resume for Stripe",
      category: "APPLICATION",
      type: "PREPARE_RESUME",
      candidateId: mockCandidateId,
      jobId: mockJobId,
      applicationId: mockAppId,
    });

    expect(result.success).toBe(true);
    expect(createdTaskData.candidateId).toBe(mockCandidateId);
    expect(createdTaskData.jobId).toBe(mockJobId);
    expect(createdTaskData.applicationId).toBe(mockAppId);
  });

  it("2. Bulk cancels active candidate tasks upon candidate consent revocation", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@test.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const activeTasks = [
      { id: "task-1", status: TaskStatus.IN_PROGRESS },
      { id: "task-2", status: TaskStatus.ASSIGNED },
    ];

    const updatedTaskIds: string[] = [];

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
          }),
        },
        task: {
          findMany: vi.fn().mockResolvedValue(activeTasks),
          update: vi.fn().mockImplementation(async ({ where, data }) => {
            updatedTaskIds.push(where.id);
            return { id: where.id, ...data };
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const result = await cancelTasksOnConsentRevocationAction(mockCandidateId);

    expect(result.success).toBe(true);
    expect(result.data?.canceledCount).toBe(2);
    expect(updatedTaskIds).toEqual(["task-1", "task-2"]);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_CANCELED",
        entityId: mockCandidateId,
      })
    );
  });
});
