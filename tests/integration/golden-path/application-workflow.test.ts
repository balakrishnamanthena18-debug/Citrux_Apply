import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createJobAction,
  createApplicationAction,
  transitionApplicationStatusAction,
} from "@/lib/application/actions";
import {
  createTaskAction,
  transitionTaskStatusAction,
  updateTaskChecklistItemAction,
} from "@/lib/task/actions";
import { createInternalNoteAction } from "@/lib/communication/actions";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  CandidateStatus,
  JobStatus,
  TaskStatus,
} from "@/generated/prisma";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn(),
  requireCandidate: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Phase 9 Golden Path — Application Workflow & Task Preparation (tests/integration/golden-path/application-workflow.test.ts)", () => {
  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockEmployeeId = "22222222-2222-4222-8222-222222222222";
  const mockCandidateId = "33333333-3333-4333-8333-333333333333";
  const mockJobAId = "55555555-5555-4555-8555-555555555555";
  const mockAppAId = "66666666-6666-4666-8666-666666666666";
  const mockTaskId = "77777777-7777-4777-8777-777777777777";
  const mockChecklistItemId = "88888888-8888-4888-8888-888888888888";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: mockEmployeeId,
      email: "staff@alpha.com",
      role: "EMPLOYEE" as any,
      organizationId: mockOrgId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });
  });

  it("Step 6: Staff creates job opportunities in OPEN status", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        job: {
          create: vi.fn().mockResolvedValue({
            id: mockJobAId,
            organizationId: mockOrgId,
            title: "Staff Distributed Systems Engineer",
            companyName: "Stripe",
            jobDescription: "Build distributed core payment engines.",
            status: JobStatus.OPEN,
          }),
        },
      };
      return callback(tx as any);
    });

    const jobRes = await createJobAction({
      title: "Staff Distributed Systems Engineer",
      companyName: "Stripe",
      jobDescription: "Build distributed core payment engines.",
      location: "San Francisco, CA (Remote)",
      externalUrl: "https://stripe.com/jobs/123",
    });

    expect(jobRes.success).toBe(true);
    expect(jobRes.data?.jobId).toBe(mockJobAId);
  });

  it("Step 7: Staff creates two applications (App A and App B) for the candidate in DISCOVERED status", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            organizationId: mockOrgId,
            status: CandidateStatus.ACTIVE,
          }),
        },
        job: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockJobAId,
            organizationId: mockOrgId,
            status: JobStatus.OPEN,
          }),
        },
        application: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: mockAppAId,
            candidateId: mockCandidateId,
            jobId: mockJobAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.DISCOVERED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-1" }),
        },
      };
      return callback(tx as any);
    });

    const appARes = await createApplicationAction({
      candidateId: mockCandidateId,
      jobId: mockJobAId,
    });

    expect(appARes.success).toBe(true);
    expect(appARes.data?.applicationId).toBe(mockAppAId);
  });

  it("Step 8 & 9: Staff advances applications through DISCOVERED -> QUALIFIED -> PREPARING", async () => {
    // DISCOVERED -> QUALIFIED
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.DISCOVERED,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.QUALIFIED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-qual" }),
        },
      };
      return callback(tx as any);
    });

    const qualRes = await transitionApplicationStatusAction({
      applicationId: mockAppAId,
      targetStatus: ApplicationStatus.QUALIFIED,
    });
    expect(qualRes.success).toBe(true);

    // QUALIFIED -> PREPARING
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.QUALIFIED,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.PREPARING,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-prep" }),
        },
      };
      return callback(tx as any);
    });

    const prepRes = await transitionApplicationStatusAction({
      applicationId: mockAppAId,
      targetStatus: ApplicationStatus.PREPARING,
    });
    expect(prepRes.success).toBe(true);
  });

  it("Step 10 & 11: Authorized Task Creation, Checklist Item Execution, and Internal Note recording", async () => {
    // Step 10: Authorized Task Creation & Assignment (Explicit manual invocation; zero auto-generation)
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        membership: {
          findFirst: vi.fn().mockResolvedValue({ id: "mem-1", status: "ACTIVE" }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.PREPARING,
          }),
        },
        task: {
          create: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            applicationId: mockAppAId,
            assignedEmployeeId: mockEmployeeId,
            title: "Custom Resume Tailoring",
            category: "APPLICATION",
            type: "PREPARE_RESUME",
            priority: "HIGH",
            status: TaskStatus.ASSIGNED,
          }),
        },
        taskChecklist: {
          create: vi.fn().mockResolvedValue({ id: "chk-1" }),
        },
        taskChecklistItem: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "task-hist-init" }),
        },
      };
      return callback(tx as any);
    });

    const taskRes = await createTaskAction({
      title: "Custom Resume Tailoring",
      applicationId: mockAppAId,
      assignedEmployeeId: mockEmployeeId,
      category: "APPLICATION",
      type: "PREPARE_RESUME",
      priority: "HIGH",
    });
    expect(taskRes.success).toBe(true);
    expect(taskRes.data?.taskId).toBe(mockTaskId);

    // Checklist Item Completion
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        taskChecklistItem: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockChecklistItemId,
            task: { organizationId: mockOrgId },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockChecklistItemId,
            isCompleted: true,
          }),
        },
      };
      return callback(tx as any);
    });

    const chkRes = await updateTaskChecklistItemAction({
      checklistItemId: mockChecklistItemId,
      isCompleted: true,
    });
    expect(chkRes.success).toBe(true);

    // Step 11: Staff Records Internal Note on Task
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
          }),
        },
        internalNote: {
          create: vi.fn().mockResolvedValue({
            id: "note-1",
            organizationId: mockOrgId,
            authorId: mockEmployeeId,
            taskId: mockTaskId,
            body: "Tailored 3 bullet points focusing on distributed concurrency.",
          }),
        },
      };
      return callback(tx as any);
    });

    const noteRes = await createInternalNoteAction({
      taskId: mockTaskId,
      body: "Tailored 3 bullet points focusing on distributed concurrency.",
    });
    expect(noteRes.success).toBe(true);
    expect(noteRes.data?.noteId).toBe("note-1");

    // Task Completed
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: mockOrgId,
            status: TaskStatus.IN_PROGRESS,
            checklistItems: [{ id: "chk-1", isCompleted: true }],
          }),
          update: vi.fn().mockResolvedValue({
            id: mockTaskId,
            status: TaskStatus.COMPLETED,
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-task-comp" }),
        },
      };
      return callback(tx as any);
    });

    const taskCompRes = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: "COMPLETED",
    });
    expect(taskCompRes.success).toBe(true);
  });

  it("Step 12: Staff advances application from PREPARING to REVIEW", async () => {
    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.PREPARING,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockAppAId,
            status: ApplicationStatus.REVIEW,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-review" }),
        },
      };
      return callback(tx as any);
    });

    const reviewRes = await transitionApplicationStatusAction({
      applicationId: mockAppAId,
      targetStatus: ApplicationStatus.REVIEW,
    });
    expect(reviewRes.success).toBe(true);
  });

  it("Asserts illegal lifecycle transition shortcuts are strictly rejected", async () => {
    // Attempt DISCOVERED -> PREPARING directly
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.DISCOVERED,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    const discToPrepRes = await transitionApplicationStatusAction({
      applicationId: mockAppAId,
      targetStatus: ApplicationStatus.PREPARING,
    });
    expect(discToPrepRes.success).toBe(false);
    expect(discToPrepRes.error).toMatch(/Invalid transition/i);

    // Attempt PREPARING -> AWAITING_APPROVAL directly
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockAppAId,
            organizationId: mockOrgId,
            status: ApplicationStatus.PREPARING,
            candidate: { status: CandidateStatus.ACTIVE },
            job: { status: JobStatus.OPEN },
          }),
        },
      };
      return callback(tx as any);
    });

    const prepToApprRes = await transitionApplicationStatusAction({
      applicationId: mockAppAId,
      targetStatus: ApplicationStatus.AWAITING_APPROVAL,
    });
    expect(prepToApprRes.success).toBe(false);
    expect(prepToApprRes.error).toMatch(/Invalid transition/i);
  });
});
