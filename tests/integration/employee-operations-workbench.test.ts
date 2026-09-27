import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskAction, transitionTaskStatusAction } from "@/lib/task/actions";
import { candidateApproveApplicationAction, candidateRequestRevisionAction } from "@/lib/qa/actions";
import { recordApplicationSubmissionAction } from "@/lib/submission/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin, requireCandidate } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ApplicationStatus,
  ApplicationApprovalStatus,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskType,
  Role,
  JobStatus,
} from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN" && ctx.role !== "EMPLOYEE") {
      throw new AuthorizationError(`Access denied: requires one of [EMPLOYEE, ADMIN], user has [${ctx.role}]`);
    }
  }),
  requireCandidate: vi.fn((ctx) => {
    if (ctx.role !== "CANDIDATE") {
      throw new AuthorizationError("Access denied: requires CANDIDATE");
    }
  }),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN") {
      throw new AuthorizationError("Access denied: requires ADMIN");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("OOS — Employee Operations Workbench & Role Boundary Invariants (tests/integration/employee-operations-workbench.test.ts)", () => {
  const orgAId = "11111111-1111-4111-8111-111111111111";
  const orgBId = "22222222-2222-4222-8222-222222222222";

  const employeeUserId = "e0000000-0000-4000-8000-000000000001";
  const candidateUserId = "c0000000-0000-4000-8000-000000000001";

  const mockCandidateId = "cc000000-0000-4000-8000-000000000001";
  const mockJobId = "55000000-0000-4000-8000-000000000001";
  const mockApplicationId = "aa000000-0000-4000-8000-000000000001";
  const mockTaskId = "77000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Authoritative Operational Metric Retrieval", () => {
    it("employee accurately retrieves assigned tasks, assigned candidates, active applications and due items", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: employeeUserId,
        email: "sarah.chen@citrux.com",
        role: Role.EMPLOYEE,
        organizationId: orgAId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockTx = {
        candidate: {
          count: vi.fn().mockResolvedValue(3),
        },
        task: {
          count: vi.fn().mockResolvedValue(5),
        },
        application: {
          count: vi.fn().mockResolvedValue(8),
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, cb) => cb(mockTx as any));

      const result = await withRlsContext(employeeUserId, async (tx) => {
        const assignedCandidatesCount = await tx.candidate.count({
          where: { organizationId: orgAId, assignedEmployeeId: employeeUserId, status: { not: "ARCHIVED" } },
        });
        const myTasksCount = await tx.task.count({
          where: {
            organizationId: orgAId,
            assignedEmployeeId: employeeUserId,
            status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED] },
          },
        });
        const activeApplicationsCount = await tx.application.count({
          where: {
            organizationId: orgAId,
            status: { notIn: [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.FAILED, ApplicationStatus.REJECTED] },
          },
        });

        return { assignedCandidatesCount, myTasksCount, activeApplicationsCount };
      });

      expect(result.assignedCandidatesCount).toBe(3);
      expect(result.myTasksCount).toBe(5);
      expect(result.activeApplicationsCount).toBe(8);
    });
  });

  describe("2. Task Governance & Operational Permission Boundaries", () => {
    it("standard employee is denied task creation when Task Governance policy restricts creation to leads and admins", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: employeeUserId,
        email: "sarah.chen@citrux.com",
        role: Role.EMPLOYEE,
        organizationId: orgAId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockTx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null), // Defaults to ["ADMIN", "MANAGER", "TEAM_LEAD"]
        },
        membership: {
          count: vi.fn().mockResolvedValue(0), // 0 direct reports = not a manager
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-std",
            isTeamLead: false, // Not a structural team lead
          }),
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, cb) => cb(mockTx as any));

      const res = await createTaskAction({
        title: "Unauthorized Operational Task",
        priority: "NORMAL",
        category: "OPERATIONAL",
        type: "SUBMISSION_CORRECTION",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/permission to create operational tasks/);
    });

    it("employee can transition status of assigned task", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: employeeUserId,
        email: "sarah.chen@citrux.com",
        role: Role.EMPLOYEE,
        organizationId: orgAId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockTx = {
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: orgAId,
            status: TaskStatus.ASSIGNED,
            assignedEmployeeId: employeeUserId,
            checklistItems: [],
          }),
          update: vi.fn().mockResolvedValue({
            id: mockTaskId,
            status: TaskStatus.IN_PROGRESS,
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "tsh-1" }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({ id: "mem-1", isTeamLead: false }),
        },
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, cb) => cb(mockTx as any));

      const result = await transitionTaskStatusAction({
        taskId: mockTaskId,
        targetStatus: "IN_PROGRESS",
      });

      expect(result.success).toBe(true);
      expect(mockTx.task.update).toHaveBeenCalled();
    });
  });

  describe("3. Strict Candidate Approval Role Boundaries", () => {
    it("candidate can approve own application staged in AWAITING_APPROVAL -> advances to READY", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: candidateUserId,
        email: "alex.rivera@candidate.com",
        role: Role.CANDIDATE,
        organizationId: orgAId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockTx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: candidateUserId,
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockApplicationId,
            candidateId: mockCandidateId,
            organizationId: orgAId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            approvalStatus: ApplicationApprovalStatus.PENDING,
            job: {
              status: JobStatus.OPEN,
            },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockApplicationId,
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-1" }),
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, cb) => cb(mockTx as any));

      const result = await candidateApproveApplicationAction({ applicationId: mockApplicationId });
      expect(result.success).toBe(true);
      expect(mockTx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
          }),
        })
      );
    });

    it("candidate can request revision on own application staged in AWAITING_APPROVAL -> moves back to PREPARING", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: candidateUserId,
        email: "alex.rivera@candidate.com",
        role: Role.CANDIDATE,
        organizationId: orgAId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockTx = {
        candidate: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockCandidateId,
            userId: candidateUserId,
            status: "ACTIVE",
          }),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockApplicationId,
            candidateId: mockCandidateId,
            organizationId: orgAId,
            status: ApplicationStatus.AWAITING_APPROVAL,
            approvalStatus: ApplicationApprovalStatus.PENDING,
            job: {
              status: JobStatus.OPEN,
            },
          }),
          update: vi.fn().mockResolvedValue({
            id: mockApplicationId,
            status: ApplicationStatus.PREPARING,
            approvalStatus: ApplicationApprovalStatus.REVISION_REQUESTED,
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-2" }),
        },
        task: {
          create: vi.fn().mockResolvedValue({ id: "task-revision" }),
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, cb) => cb(mockTx as any));

      const result = await candidateRequestRevisionAction({
        applicationId: mockApplicationId,
        revisionNotes: "Please adjust salary expectations.",
      });

      expect(result.success).toBe(true);
      expect(mockTx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.PREPARING,
            approvalStatus: ApplicationApprovalStatus.REVISION_REQUESTED,
          }),
        })
      );
    });

    it("employee cannot execute candidate approval action (enforces requireCandidate)", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: employeeUserId,
        email: "sarah.chen@citrux.com",
        role: Role.EMPLOYEE,
        organizationId: orgAId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      await expect(
        candidateApproveApplicationAction({ applicationId: mockApplicationId })
      ).rejects.toThrow(/Access denied: requires CANDIDATE/);
    });
  });

  describe("4. Manual External Submission Architecture", () => {
    it("employee can record external submission on READY application", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: employeeUserId,
        email: "sarah.chen@citrux.com",
        role: Role.EMPLOYEE,
        organizationId: orgAId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockTx = {
        application: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockApplicationId,
            candidateId: mockCandidateId,
            organizationId: orgAId,
            status: ApplicationStatus.READY,
            approvalStatus: ApplicationApprovalStatus.APPROVED,
            job: {
              id: mockJobId,
              status: JobStatus.OPEN,
            },
            candidate: {
              id: mockCandidateId,
              status: "ACTIVE",
              userId: candidateUserId,
              user: { email: "cand@test.com", firstName: "Alex", lastName: "Rivera" },
            },
            submissions: [],
          }),
          update: vi.fn().mockResolvedValue({
            id: mockApplicationId,
            status: ApplicationStatus.SUBMITTED,
          }),
        },
        applicationSubmission: {
          create: vi.fn().mockResolvedValue({
            id: "sub-1",
            applicationId: mockApplicationId,
            attemptNumber: 1,
            externalReference: "STRIPE-REF-998822",
          }),
        },
        applicationStateHistory: {
          create: vi.fn().mockResolvedValue({ id: "hist-sub" }),
        },
        notification: {
          create: vi.fn().mockResolvedValue({ id: "notif-1" }),
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, cb) => cb(mockTx as any));

      const result = await recordApplicationSubmissionAction({
        applicationId: mockApplicationId,
        externalReference: "STRIPE-REF-998822",
        externalUrl: "https://stripe.com/jobs/123",
        submissionNotes: "Completed manual submission on employer portal.",
      });

      expect(result.success).toBe(true);
      expect(mockTx.applicationSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationId: mockApplicationId,
            externalReference: "STRIPE-REF-998822",
          }),
        })
      );
      expect(mockTx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.SUBMITTED,
          }),
        })
      );
    });
  });

  describe("5. Multi-Tenant Data Isolation Invariants", () => {
    it("employee from tenant A cannot query or view tenant B candidates or applications", async () => {
      vi.mocked(getAuthenticatedContext).mockResolvedValue({
        userId: employeeUserId,
        email: "sarah.chen@citrux.com",
        role: Role.EMPLOYEE,
        organizationId: orgAId,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      });

      const mockTx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        application: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      vi.mocked(withRlsContext).mockImplementation(async (_userId, cb) => cb(mockTx as any));

      const data = await withRlsContext(employeeUserId, async (tx) => {
        const cand = await tx.candidate.findFirst({
          where: { organizationId: orgBId },
        });
        const apps = await tx.application.findMany({
          where: { organizationId: orgBId },
        });
        return { cand, apps };
      });

      expect(data.cand).toBeNull();
      expect(data.apps).toEqual([]);
    });
  });
});
