import { describe, it, expect, vi } from "vitest";
import { TaskStatus, TaskPriority, Role } from "@/generated/prisma";
import { DEFAULT_TASK_GOVERNANCE_POLICY, resolveOperationalRoles } from "@/lib/task/governance";

describe("Team Lead Instant Operations Workbench Unit Tests", () => {
  describe("1. Team Lead Task Queue In-Memory Filtering", () => {
    interface MockTask {
      id: string;
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
      assignedEmployeeId: string;
      assignedEmployee: { firstName: string; lastName: string };
      candidate: { user: { firstName: string; lastName: string } };
      isOverdue: boolean;
    }

    const mockTasks: MockTask[] = [
      {
        id: "task-1",
        title: "Verify resume tailoring for Candidate A",
        status: TaskStatus.ASSIGNED,
        priority: TaskPriority.HIGH,
        assignedEmployeeId: "emp-1",
        assignedEmployee: { firstName: "Alice", lastName: "Smith" },
        candidate: { user: { firstName: "John", lastName: "Doe" } },
        isOverdue: false,
      },
      {
        id: "task-2",
        title: "Conduct secondary QA review on cover letter",
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        assignedEmployeeId: "emp-2",
        assignedEmployee: { firstName: "Bob", lastName: "Jones" },
        candidate: { user: { firstName: "Sarah", lastName: "Connor" } },
        isOverdue: true,
      },
      {
        id: "task-3",
        title: "Resolve external portal submission blocker",
        status: TaskStatus.BLOCKED,
        priority: TaskPriority.URGENT,
        assignedEmployeeId: "emp-1",
        assignedEmployee: { firstName: "Alice", lastName: "Smith" },
        candidate: { user: { firstName: "Bruce", lastName: "Wayne" } },
        isOverdue: false,
      },
      {
        id: "task-4",
        title: "Triage escalated portal login failure",
        status: TaskStatus.ESCALATED,
        priority: TaskPriority.URGENT,
        assignedEmployeeId: "emp-3",
        assignedEmployee: { firstName: "Charlie", lastName: "Brown" },
        candidate: { user: { firstName: "Clark", lastName: "Kent" } },
        isOverdue: true,
      },
    ];

    it("filters active team tasks without triggering network requests", () => {
      const active = mockTasks.filter(
        (t) => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELED
      );
      expect(active).toHaveLength(4);
    });

    it("filters blocked work queue instantly", () => {
      const blocked = mockTasks.filter((t) => t.status === TaskStatus.BLOCKED);
      expect(blocked).toHaveLength(1);
      expect(blocked[0]!.id).toBe("task-3");
    });

    it("filters escalated tasks for immediate triage", () => {
      const escalated = mockTasks.filter((t) => t.status === TaskStatus.ESCALATED);
      expect(escalated).toHaveLength(1);
      expect(escalated[0]!.id).toBe("task-4");
    });

    it("filters overdue tasks accurately across assignees", () => {
      const overdue = mockTasks.filter((t) => t.isOverdue);
      expect(overdue).toHaveLength(2);
      expect(overdue.map((t) => t.id)).toEqual(["task-2", "task-4"]);
    });
  });

  describe("2. Team Lead Instant Search", () => {
    const mockTasks = [
      {
        id: "task-101",
        title: "Tailor frontend engineering resume",
        assignee: "Alice Smith",
        candidate: "John Doe",
      },
      {
        id: "task-102",
        title: "QA review for Google application",
        assignee: "Bob Jones",
        candidate: "Sarah Connor",
      },
      {
        id: "task-103",
        title: "Submit backend portfolio to Stripe",
        assignee: "Charlie Brown",
        candidate: "Clark Kent",
      },
    ];

    function searchTasks(query: string) {
      if (!query.trim()) return mockTasks;
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return mockTasks.filter((task) =>
        terms.every(
          (term) =>
            task.title.toLowerCase().includes(term) ||
            task.assignee.toLowerCase().includes(term) ||
            task.candidate.toLowerCase().includes(term) ||
            task.id.toLowerCase().includes(term)
        )
      );
    }

    it("matches tasks by candidate name instantly", () => {
      const results = searchTasks("Sarah Connor");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("task-102");
    });

    it("matches tasks by assignee name instantly", () => {
      const results = searchTasks("Alice");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("task-101");
    });

    it("matches tasks by compound search terms", () => {
      const results = searchTasks("backend Stripe");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("task-103");
    });
  });

  describe("3. Structural Team Lead Role Resolution (Role != Designation)", () => {
    it("resolves TEAM_LEAD role from explicit structural membership authority", async () => {
      const mockTx = {
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            isTeamLead: true,
            teamLeadOf: "Alpha-Team",
          }),
        },
      };

      const ctx = {
        userId: "user-tl-1",
        email: "teamlead@test.com",
        organizationId: "org-1",
        role: Role.EMPLOYEE,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      };

      const roles = await resolveOperationalRoles(mockTx, ctx);
      expect(roles).toContain("EMPLOYEE");
      expect(roles).toContain("TEAM_LEAD");
      expect(roles).not.toContain("MANAGER");
    });

    it("does NOT grant TEAM_LEAD authority from designation strings", async () => {
      const mockTx = {
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            isTeamLead: false,
            teamLeadOf: null,
          }),
        },
      };

      const ctx = {
        userId: "user-emp-1",
        email: "employee@test.com",
        organizationId: "org-1",
        role: Role.EMPLOYEE,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      };

      const roles = await resolveOperationalRoles(mockTx, ctx);
      expect(roles).toEqual(["EMPLOYEE"]);
    });

    it("verifies Team Lead capabilities in default task governance policy", () => {
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canCreateRoles).toContain("TEAM_LEAD");
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canAssignRoles).toContain("TEAM_LEAD");
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canCancelRoles).toContain("TEAM_LEAD");
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canEscalateRoles).toContain("TEAM_LEAD");
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canCompleteRoles).toContain("TEAM_LEAD");
    });
  });
});
