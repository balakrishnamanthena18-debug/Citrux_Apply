import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createTaskAction,
  assignTaskAction,
  transitionTaskStatusAction,
  getTaskGovernancePolicyAction,
  updateTaskGovernancePolicyAction,
} from "@/lib/task/actions";
import { getAuthenticatedContext, requireEmployeeOrAdmin, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent } from "@/lib/audit";
import { TaskStatus, TaskCategory, TaskType, TaskPriority, Role, AuditAction } from "@/generated/prisma";
import { DEFAULT_TASK_GOVERNANCE_POLICY } from "@/lib/task/governance";

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: vi.fn(),
  requireEmployeeOrAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN" && ctx.role !== "EMPLOYEE") {
      throw new Error(`Access denied: requires one of [EMPLOYEE, ADMIN], user has [${ctx.role}]`);
    }
  }),
  requireAdmin: vi.fn((ctx) => {
    if (ctx.role !== "ADMIN") {
      throw new Error("Access denied: requires ADMIN");
    }
  }),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn(),
}));

describe("Task Governance & Authoritative Structural Team Lead (tests/integration/task-governance-access-control.test.ts)", () => {
  const orgAId = "11111111-1111-4111-8111-111111111111";
  const orgBId = "22222222-2222-4222-8222-222222222222";

  const adminUserId = "a0000000-0000-4000-8000-000000000001";
  const managerUserId = "b0000000-0000-4000-8000-000000000002";
  const teamLeadUserId = "c0000000-0000-4000-8000-000000000003";
  const standardEmployeeUserId = "d0000000-0000-4000-8000-000000000004";
  const candidateUserId = "e0000000-0000-4000-8000-000000000005";

  const mockTaskId = "f0000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TEST 1: ADMIN can create operational tasks unconditionally", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: adminUserId,
      email: "admin@citrux.com",
      role: Role.ADMIN,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({ id: "mem-admin" }),
        },
        task: {
          create: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: orgAId,
            title: "Admin created task",
            category: TaskCategory.OPERATIONAL,
            type: TaskType.REVIEW_JOB,
            status: TaskStatus.BACKLOG,
            priority: TaskPriority.NORMAL,
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Admin created task",
      category: "OPERATIONAL",
      type: "REVIEW_JOB",
    });

    expect(res.success).toBe(true);
    expect(res.data?.taskId).toBe(mockTaskId);
  });

  it("TEST 2: MANAGER can create task when Manager task creation policy = ON (via active direct reports)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: managerUserId,
      email: "manager@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            organizationId: orgAId,
            canCreateRoles: ["ADMIN", "MANAGER"],
            canAssignRoles: ["ADMIN", "MANAGER"],
            canCancelRoles: ["ADMIN", "MANAGER"],
            canEscalateRoles: ["ADMIN", "MANAGER"],
            canCompleteRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(4), // 4 direct reports = functional manager
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-mgr",
            isTeamLead: false,
          }),
        },
        task: {
          create: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: orgAId,
            title: "Manager created task",
            category: TaskCategory.APPLICATION,
            type: TaskType.PREPARE_RESUME,
            status: TaskStatus.BACKLOG,
            priority: TaskPriority.HIGH,
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Manager created task",
      category: "APPLICATION",
      type: "PREPARE_RESUME",
    });

    expect(res.success).toBe(true);
    expect(res.data?.taskId).toBe(mockTaskId);
  });

  it("TEST 3: TEAM_LEAD can create task when Team Lead policy = ON (via authoritative isTeamLead structural assignment)", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: teamLeadUserId,
      email: "teamlead@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null), // Defaults to ["ADMIN", "MANAGER", "TEAM_LEAD"]
        },
        membership: {
          count: vi.fn().mockResolvedValue(0), // No direct reports
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-lead",
            isTeamLead: true, // Authoritative structural team lead
            teamLeadOf: "QA Desk",
          }),
        },
        task: {
          create: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: orgAId,
            title: "Team Lead created task",
            category: TaskCategory.QA,
            type: TaskType.APPLICATION_QA,
            status: TaskStatus.BACKLOG,
            priority: TaskPriority.NORMAL,
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Team Lead created task",
      category: "QA",
      type: "APPLICATION_QA",
    });

    expect(res.success).toBe(true);
    expect(res.data?.taskId).toBe(mockTaskId);
  });

  it("TEST 4: Standard EMPLOYEE without structural manager/team-lead authority cannot create task by default", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: standardEmployeeUserId,
      email: "staff@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-employee",
            isTeamLead: false,
            teamLeadOf: null,
          }),
        },
        task: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Unauthorized employee task",
      category: "APPLICATION",
      type: "PREPARE_RESUME",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("You do not have permission to create operational tasks.");
  });

  it("TEST 5: CANDIDATE user cannot create operational tasks", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: candidateUserId,
      email: "candidate@gmail.com",
      role: Role.CANDIDATE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const res = await createTaskAction({
      title: "Candidate task attempt",
      category: "APPLICATION",
      type: "PREPARE_RESUME",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Access denied/i);
  });

  it("TEST 6: MANAGER cannot create task when Manager policy = OFF", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: managerUserId,
      email: "manager@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            organizationId: orgAId,
            canCreateRoles: ["ADMIN", "TEAM_LEAD"], // MANAGER creation disabled!
            canAssignRoles: ["ADMIN", "MANAGER"],
            canCancelRoles: ["ADMIN", "MANAGER"],
            canEscalateRoles: ["ADMIN", "MANAGER"],
            canCompleteRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(5), // Manager has reports
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-mgr",
            isTeamLead: false,
          }),
        },
        task: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Manager task with policy off",
      category: "APPLICATION",
      type: "PREPARE_RESUME",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("You do not have permission to create operational tasks.");
  });

  it("TEST 7: TEAM_LEAD cannot create task when Team Lead policy = OFF", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: teamLeadUserId,
      email: "lead@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            organizationId: orgAId,
            canCreateRoles: ["ADMIN", "MANAGER"], // TEAM_LEAD creation disabled!
            canAssignRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
            canCancelRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
            canEscalateRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
            canCompleteRoles: ["ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-lead",
            isTeamLead: true, // Structural Team Lead
            teamLeadOf: "Core Pod",
          }),
        },
        task: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Team lead task when policy disabled",
      category: "QA",
      type: "APPLICATION_QA",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("You do not have permission to create operational tasks.");
  });

  it("TEST 8: Changing designation from 'Team Lead' to 'Operations Specialist' does NOT remove Team Lead authority if structural isTeamLead remains true", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: teamLeadUserId,
      email: "lead@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-lead",
            isTeamLead: true, // Structural authority preserved!
            teamLeadOf: "Support Pod",
            designation: { name: "Operations Specialist", code: "OPS-SPEC" }, // Arbitrary designation title
          }),
        },
        task: {
          create: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: orgAId,
            title: "Task by structural lead with Specialist designation",
            category: TaskCategory.OPERATIONAL,
            type: TaskType.REVIEW_JOB,
            status: TaskStatus.BACKLOG,
            priority: TaskPriority.NORMAL,
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Task by structural lead with Specialist designation",
      category: "OPERATIONAL",
      type: "REVIEW_JOB",
    });

    expect(res.success).toBe(true);
    expect(res.data?.taskId).toBe(mockTaskId);
  });

  it("TEST 9: Changing designation from 'Operations Specialist' to 'Team Lead' does NOT grant Team Lead authority if structural isTeamLead = false", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: standardEmployeeUserId,
      email: "staff@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-fake-lead",
            isTeamLead: false, // NO structural authority!
            teamLeadOf: null,
            designation: { name: "Team Lead", code: "LEAD" }, // Cosmetic designation label
          }),
        },
        task: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Attempted bypass via designation title",
      category: "APPLICATION",
      type: "PREPARE_RESUME",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("You do not have permission to create operational tasks.");
  });

  it("TEST 10: Removing Team Lead structural assignment (isTeamLead: false) immediately revokes Team Lead authority", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: teamLeadUserId,
      email: "formerlead@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-demoted",
            isTeamLead: false, // Revoked!
            teamLeadOf: null,
          }),
        },
        task: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Demoted user task",
      category: "QA",
      type: "APPLICATION_QA",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("You do not have permission to create operational tasks.");
  });

  it("TEST 11: A Team Lead cannot gain Manager authority merely by setting designation.name to 'Manager'", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: teamLeadUserId,
      email: "lead@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            organizationId: orgAId,
            canCreateRoles: ["ADMIN", "MANAGER"], // TEAM_LEAD not allowed, only MANAGER
            canAssignRoles: ["ADMIN", "MANAGER"],
            canCancelRoles: ["ADMIN", "MANAGER"],
            canEscalateRoles: ["ADMIN", "MANAGER"],
            canCompleteRoles: ["ADMIN", "MANAGER", "EMPLOYEE"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0), // Has NO direct reports!
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-lead-fake-mgr",
            isTeamLead: true,
            teamLeadOf: "QA",
            designation: { name: "General Manager", code: "GEN-MGR" }, // Cosmetic manager title
          }),
        },
        task: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Task requiring manager authority",
      category: "OPERATIONAL",
      type: "REVIEW_JOB",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("You do not have permission to create operational tasks.");
  });

  it("TEST 12: A normal employee cannot bypass the policy by directly invoking createTaskAction", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: standardEmployeeUserId,
      email: "attacker@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-attacker",
            isTeamLead: false,
            teamLeadOf: null,
          }),
        },
        task: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Direct invocation attempt",
      category: "OPERATIONAL",
      type: "QUALIFY_JOB",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("You do not have permission to create operational tasks.");
  });

  it("TEST 13: Candidate cannot bypass the policy by directly invoking createTaskAction", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: candidateUserId,
      email: "candidate@citrux.com",
      role: Role.CANDIDATE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const res = await createTaskAction({
      title: "Candidate direct action attempt",
      category: "OPERATIONAL",
      type: "QUALIFY_JOB",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Access denied/i);
  });

  it("TEST 14: Multi-tenant policy isolation: Tenant A policy does not bleed into Tenant B", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: standardEmployeeUserId,
      email: "staff@tenantb.com",
      role: Role.EMPLOYEE,
      organizationId: orgBId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.organizationId === orgAId) {
              // Org A allows employees
              return Promise.resolve({
                organizationId: orgAId,
                canCreateRoles: ["ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"],
              });
            }
            // Org B restricts employees
            return Promise.resolve({
              organizationId: orgBId,
              canCreateRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
            });
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({
            id: "mem-b",
            isTeamLead: false,
          }),
        },
        task: {
          create: vi.fn(),
        },
      };
      return callback(tx as any);
    });

    const resB = await createTaskAction({
      title: "Task in Org B",
      category: "OPERATIONAL",
      type: "REVIEW_JOB",
    });

    expect(resB.success).toBe(false);
    expect(resB.error).toBe("You do not have permission to create operational tasks.");
  });

  it("TEST 15: Admin override remains functional across restricted policies", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: adminUserId,
      email: "superadmin@citrux.com",
      role: Role.ADMIN,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            organizationId: orgAId,
            canCreateRoles: ["ADMIN"], // Highly restricted policy
          }),
        },
        task: {
          create: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: orgAId,
            title: "Admin override task",
            category: TaskCategory.OPERATIONAL,
            type: TaskType.REVIEW_JOB,
            status: TaskStatus.BACKLOG,
            priority: TaskPriority.NORMAL,
          }),
        },
        taskStateHistory: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx as any);
    });

    const res = await createTaskAction({
      title: "Admin override task",
      category: "OPERATIONAL",
      type: "REVIEW_JOB",
    });

    expect(res.success).toBe(true);
    expect(res.data?.taskId).toBe(mockTaskId);
  });

  it("TEST 16: Task completion preserves authorized employee execution", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: standardEmployeeUserId,
      email: "staff@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            organizationId: orgAId,
            canCreateRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
            canCompleteRoles: ["ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({ id: "mem-emp", isTeamLead: false }),
        },
        task: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockTaskId,
            organizationId: orgAId,
            status: TaskStatus.IN_PROGRESS,
            assignedEmployeeId: standardEmployeeUserId,
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

    const res = await transitionTaskStatusAction({
      taskId: mockTaskId,
      targetStatus: TaskStatus.COMPLETED,
    });

    expect(res.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TASK_COMPLETED",
        entityId: mockTaskId,
      })
    );
  });

  it("TEST 17: Task assignment and escalation governance permissions remain enforced", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: standardEmployeeUserId,
      email: "staff@citrux.com",
      role: Role.EMPLOYEE,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue({
            organizationId: orgAId,
            canAssignRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
            canEscalateRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"],
          }),
        },
        membership: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue({ id: "mem-emp", isTeamLead: false }),
        },
      };
      return callback(tx as any);
    });

    const assignRes = await assignTaskAction({
      taskId: mockTaskId,
      assignedEmployeeId: managerUserId,
    });

    expect(assignRes.success).toBe(false);
    expect(assignRes.error).toBe("You do not have permission to assign operational tasks.");
  });

  it("TEST 18: Admin can update Task Governance Policy and audit event is emitted", async () => {
    vi.mocked(getAuthenticatedContext).mockResolvedValue({
      userId: adminUserId,
      email: "admin@citrux.com",
      role: Role.ADMIN,
      organizationId: orgAId,
      status: "ACTIVE" as any,
      membershipStatus: "ACTIVE" as any,
    });

    const newPolicy = {
      canCreateRoles: ["ADMIN", "MANAGER"] as any[],
      canAssignRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"] as any[],
      canCancelRoles: ["ADMIN", "MANAGER"] as any[],
      canEscalateRoles: ["ADMIN", "MANAGER", "TEAM_LEAD"] as any[],
      canCompleteRoles: ["ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] as any[],
    };

    vi.mocked(withRlsContext).mockImplementation(async (_userId, callback) => {
      const tx = {
        taskGovernancePolicy: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({
            id: "gov-policy-001",
            organizationId: orgAId,
            ...newPolicy,
          }),
        },
      };
      return callback(tx as any);
    });

    const updateRes = await updateTaskGovernancePolicyAction(newPolicy);

    expect(updateRes.success).toBe(true);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.TASK_GOVERNANCE_POLICY_UPDATED,
        entityType: "TaskGovernancePolicy",
        entityId: "gov-policy-001",
      })
    );
  });
});
