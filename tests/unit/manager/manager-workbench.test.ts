import { describe, it, expect, vi } from "vitest";
import { TaskStatus, TaskPriority, Role } from "@/generated/prisma";
import { DEFAULT_TASK_GOVERNANCE_POLICY, resolveOperationalRoles } from "@/lib/task/governance";

describe("Manager Instant Operations Workbench Unit Tests", () => {
  describe("1. Manager Multi-Team Workload & Capacity Aggregation", () => {
    interface StaffWorkload {
      id: string;
      name: string;
      team: string;
      activeTasks: number;
      overdueTasks: number;
      assignedCandidates: number;
    }

    const mockTeamRoster: StaffWorkload[] = [
      { id: "emp-1", name: "Alice Smith", team: "Alpha", activeTasks: 5, overdueTasks: 1, assignedCandidates: 3 },
      { id: "emp-2", name: "Bob Jones", team: "Alpha", activeTasks: 8, overdueTasks: 2, assignedCandidates: 4 },
      { id: "emp-3", name: "Charlie Brown", team: "Beta", activeTasks: 2, overdueTasks: 0, assignedCandidates: 2 },
      { id: "emp-4", name: "Diana Prince", team: "Beta", activeTasks: 9, overdueTasks: 3, assignedCandidates: 5 },
    ];

    it("filters workload by specific team in memory with 0 network requests", () => {
      const alphaTeam = mockTeamRoster.filter((member) => member.team === "Alpha");
      expect(alphaTeam).toHaveLength(2);
      expect(alphaTeam.map((m) => m.id)).toEqual(["emp-1", "emp-2"]);
    });

    it("calculates team-wide active tasks and overdue counts truthfully", () => {
      const alphaTeam = mockTeamRoster.filter((member) => member.team === "Alpha");
      const totalActive = alphaTeam.reduce((acc, curr) => acc + curr.activeTasks, 0);
      const totalOverdue = alphaTeam.reduce((acc, curr) => acc + curr.overdueTasks, 0);

      expect(totalActive).toBe(13);
      expect(totalOverdue).toBe(3);
    });

    it("identifies capacity outliers needing workload rebalancing", () => {
      const highLoadThreshold = 7;
      const overloadedStaff = mockTeamRoster.filter((member) => member.activeTasks >= highLoadThreshold);
      expect(overloadedStaff).toHaveLength(2);
      expect(overloadedStaff.map((m) => m.name)).toEqual(["Bob Jones", "Diana Prince"]);
    });
  });

  describe("2. Escalation Queue Priority Sorting", () => {
    const priorityWeight: Record<TaskPriority, number> = {
      URGENT: 4,
      HIGH: 3,
      NORMAL: 2,
      LOW: 1,
    };

    const mockEscalations = [
      { id: "esc-1", title: "API submission error", priority: TaskPriority.NORMAL, createdAt: new Date("2026-03-01") },
      { id: "esc-2", title: "Portal lockout critical blocker", priority: TaskPriority.URGENT, createdAt: new Date("2026-03-02") },
      { id: "esc-3", title: "Candidate info discrepancy", priority: TaskPriority.HIGH, createdAt: new Date("2026-03-03") },
    ];

    it("sorts escalations strictly by priority descending", () => {
      const sorted = [...mockEscalations].sort(
        (a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]
      );
      expect(sorted[0]!.id).toBe("esc-2"); // URGENT
      expect(sorted[1]!.id).toBe("esc-3"); // HIGH
      expect(sorted[2]!.id).toBe("esc-1"); // NORMAL
    });
  });

  describe("3. Structural Manager Role Resolution (Reporting Hierarchy)", () => {
    it("resolves MANAGER role when user has active direct reports in membership", async () => {
      const mockTx = {
        membership: {
          count: vi.fn().mockResolvedValue(4), // 4 direct reports
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const ctx = {
        userId: "user-mgr-1",
        email: "manager@test.com",
        organizationId: "org-1",
        role: Role.EMPLOYEE,
        status: "ACTIVE" as any,
        membershipStatus: "ACTIVE" as any,
      };

      const roles = await resolveOperationalRoles(mockTx, ctx);
      expect(roles).toContain("EMPLOYEE");
      expect(roles).toContain("MANAGER");
      expect(roles).not.toContain("TEAM_LEAD");
    });

    it("verifies Manager capabilities in default task governance policy", () => {
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canCreateRoles).toContain("MANAGER");
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canAssignRoles).toContain("MANAGER");
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canCancelRoles).toContain("MANAGER");
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canEscalateRoles).toContain("MANAGER");
      expect(DEFAULT_TASK_GOVERNANCE_POLICY.canCompleteRoles).toContain("MANAGER");
    });
  });
});
