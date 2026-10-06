/**
 * Phase 5O — Inactive Assignee Orphan Queue & Scoped Manual Recovery.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Role } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";
import { assertCanAssignApplication } from "@/lib/application/assignment-authority";
import {
  buildInactiveAssigneeOrphanWhere,
  resolveOrphanVisibilityScope,
} from "@/lib/application/orphan-scope";
import { OPERATIONAL_APPLICATION_QUEUES } from "@/lib/application/operations-types";
import { evaluateAuthoritativeQaPass } from "@/lib/qa/authority";
import { assertSubmissionEvidence, SUBMISSION_EVIDENCE_REQUIRED_MESSAGE } from "@/lib/submission/evidence";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";

const ROOT = join(__dirname, "../../..");
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const USER_TL = "33333333-3333-4333-8333-333333333333";
const USER_TEAM_INACTIVE = "66666666-6666-4666-8666-666666666666";
const USER_TEAM_ACTIVE = "66666666-6666-4666-8666-666666666661";
const USER_OTHER_INACTIVE = "77777777-7777-4777-8777-777777777777";
const USER_MGR = "44444444-4444-4444-8444-444444444444";
const USER_REPORT_INACTIVE = "88888888-8888-4888-8888-888888888888";
const USER_REPORT_ACTIVE = "88888888-8888-4888-8888-888888888881";
const USER_EMP = "11111111-1111-4111-8111-111111111111";
const USER_ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const USER_CAND = "55555555-5555-4555-8555-555555555555";
const APP_ORPHAN = "a1000000-0000-4000-8000-0000000000aa";
const APP_OTHER = "a1000000-0000-4000-8000-0000000000bb";

function ctx(userId: string, role: Role, orgId = ORG_A) {
  return {
    userId,
    email: `${userId}@test.com`,
    role,
    organizationId: orgId,
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

type Mem = {
  userId: string;
  role: Role;
  status: string;
  isTeamLead?: boolean;
  teamLeadOf?: string | null;
  team?: string | null;
  reportingManagerId?: string | null;
};

const memberships: Mem[] = [
  {
    userId: USER_TL,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    isTeamLead: true,
    teamLeadOf: "Alpha-Team",
    team: "Alpha-Team",
  },
  {
    userId: USER_TEAM_INACTIVE,
    role: Role.EMPLOYEE,
    status: "DEACTIVATED",
    team: "Alpha-Team",
  },
  {
    userId: USER_TEAM_ACTIVE,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    team: "Alpha-Team",
  },
  {
    userId: USER_OTHER_INACTIVE,
    role: Role.EMPLOYEE,
    status: "DEACTIVATED",
    team: "Beta-Team",
  },
  {
    userId: USER_MGR,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
  },
  {
    userId: USER_REPORT_INACTIVE,
    role: Role.EMPLOYEE,
    status: "DEACTIVATED",
    reportingManagerId: USER_MGR,
  },
  {
    userId: USER_REPORT_ACTIVE,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    reportingManagerId: USER_MGR,
  },
  {
    userId: USER_EMP,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    team: "Alpha-Team",
  },
  {
    userId: USER_ADMIN,
    role: Role.ADMIN,
    status: "ACTIVE",
  },
];

function mockTx(app: {
  id: string;
  organizationId: string;
  assignedEmployeeId: string | null;
} | null) {
  return {
    application: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (!app) return null;
        if (where.id && app.id !== where.id) return null;
        if (where.organizationId && app.organizationId !== where.organizationId) {
          return null;
        }
        return {
          ...app,
          assignedTeamKey: null,
          assignedManagerId: null,
        };
      }),
    },
    membership: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return (
          memberships.find((m) => {
            if (where.userId && m.userId !== where.userId) return false;
            if (where.status === "ACTIVE" && m.status !== "ACTIVE") return false;
            if (where.status?.not === "ACTIVE" && m.status === "ACTIVE") return false;
            if (where.role?.in && !where.role.in.includes(m.role)) return false;
            if (where.reportingManagerId && m.reportingManagerId !== where.reportingManagerId) {
              return false;
            }
            if (where.OR) {
              const keys = where.OR[0]?.team?.in || [];
              const ok =
                (m.team && keys.includes(m.team)) ||
                (m.teamLeadOf && keys.includes(m.teamLeadOf));
              if (!ok) return false;
            }
            return true;
          }) || null
        );
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        let rows = [...memberships];
        if (where.status === "ACTIVE") rows = rows.filter((m) => m.status === "ACTIVE");
        if (where.status?.not === "ACTIVE") {
          rows = rows.filter((m) => m.status !== "ACTIVE");
        }
        if (where.role?.in) rows = rows.filter((m) => where.role.in.includes(m.role));
        if (where.reportingManagerId) {
          rows = rows.filter((m) => m.reportingManagerId === where.reportingManagerId);
        }
        if (where.OR) {
          const keys = where.OR[0]?.team?.in || where.OR[1]?.teamLeadOf?.in || [];
          rows = rows.filter(
            (m) =>
              (m.team && keys.includes(m.team)) ||
              (m.teamLeadOf && keys.includes(m.teamLeadOf))
          );
        }
        if (where.userId?.in) {
          rows = rows.filter((m) => where.userId.in.includes(m.userId));
        }
        if (where.isTeamLead !== undefined || where.userId) {
          // resolveTeamLeadScope findFirst uses findFirst not findMany
        }
        return rows.map((m) => ({
          userId: m.userId,
          isTeamLead: m.isTeamLead,
          teamLeadOf: m.teamLeadOf,
          team: m.team,
          role: m.role,
          user: { firstName: "F", lastName: "L", email: `${m.userId}@t.com` },
        }));
      }),
    },
  };
}

describe("Phase 5O — orphan definition & visibility", () => {
  it("orphan where requires assigned + no ACTIVE staff membership", () => {
    const where = buildInactiveAssigneeOrphanWhere(ORG_A);
    expect(where.assignedEmployeeId).toEqual({ not: null });
    expect(where.organizationId).toBe(ORG_A);
  });

  it("orphaned queue is additive in OPERATIONAL_APPLICATION_QUEUES", () => {
    expect(OPERATIONAL_APPLICATION_QUEUES).toContain("orphaned");
    expect(OPERATIONAL_APPLICATION_QUEUES).toContain("unassigned");
  });

  it("A. Admin can view orphans (org-wide)", async () => {
    const tx = mockTx(null);
    const vis = await resolveOrphanVisibilityScope(tx as any, ctx(USER_ADMIN, Role.ADMIN));
    expect(vis.canViewOrphans).toBe(true);
    expect(vis.inactiveAssigneeUserIds).toBeNull();
  });

  it("B. Team Lead sees former team inactive members only", async () => {
    const tx = mockTx(null);
    // Patch findFirst for TL membership lookup used by resolveTeamLeadScope
    tx.membership.findFirst = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.userId === USER_TL) {
        return {
          isTeamLead: true,
          teamLeadOf: "Alpha-Team",
          team: "Alpha-Team",
        };
      }
      return null;
    });
    const vis = await resolveOrphanVisibilityScope(tx as any, ctx(USER_TL, Role.EMPLOYEE));
    expect(vis.canViewOrphans).toBe(true);
    expect(vis.inactiveAssigneeUserIds).toContain(USER_TEAM_INACTIVE);
    expect(vis.inactiveAssigneeUserIds).not.toContain(USER_OTHER_INACTIVE);
  });

  it("C/E. Employee without TL/Manager cannot view orphan queue", async () => {
    const tx = mockTx(null);
    tx.membership.findFirst = vi.fn().mockResolvedValue({
      isTeamLead: false,
      teamLeadOf: null,
      team: "Alpha-Team",
    });
    tx.membership.findMany = vi.fn().mockResolvedValue([]);
    const vis = await resolveOrphanVisibilityScope(tx as any, ctx(USER_EMP, Role.EMPLOYEE));
    expect(vis.canViewOrphans).toBe(false);
  });

  it("D. Manager sees former direct-report inactive members", async () => {
    const tx = mockTx(null);
    tx.membership.findFirst = vi.fn().mockResolvedValue({
      isTeamLead: false,
      teamLeadOf: null,
      team: null,
    });
    const vis = await resolveOrphanVisibilityScope(tx as any, ctx(USER_MGR, Role.EMPLOYEE));
    expect(vis.canViewOrphans).toBe(true);
    expect(vis.inactiveAssigneeUserIds).toContain(USER_REPORT_INACTIVE);
    expect(vis.inactiveAssigneeUserIds).not.toContain(USER_TEAM_INACTIVE);
  });

  it("G. Candidate cannot view orphans", async () => {
    const tx = mockTx(null);
    const vis = await resolveOrphanVisibilityScope(
      tx as any,
      ctx(USER_CAND, Role.CANDIDATE)
    );
    expect(vis.canViewOrphans).toBe(false);
  });
});

describe("Phase 5O — scoped manual recovery", () => {
  it("Team Lead can recover former-team orphan to active team member", async () => {
    const tx = mockTx({
      id: APP_ORPHAN,
      organizationId: ORG_A,
      assignedEmployeeId: USER_TEAM_INACTIVE,
    });
    tx.membership.findFirst = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.userId === USER_TL && where.status === "ACTIVE") {
        return { isTeamLead: true, teamLeadOf: "Alpha-Team", team: "Alpha-Team" };
      }
      if (
        where.userId === USER_TEAM_INACTIVE &&
        where.status?.not === "ACTIVE"
      ) {
        return { id: "m-inactive", team: "Alpha-Team" };
      }
      if (where.userId === USER_TEAM_ACTIVE && where.status === "ACTIVE") {
        return { userId: USER_TEAM_ACTIVE };
      }
      // isAssigneeInactive — no ACTIVE membership
      if (where.userId === USER_TEAM_INACTIVE && where.status === "ACTIVE") {
        return null;
      }
      return null;
    });
    tx.membership.findMany = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.status === "ACTIVE" && where.OR) {
        return [{ userId: USER_TL }, { userId: USER_TEAM_ACTIVE }, { userId: USER_EMP }];
      }
      if (where.reportingManagerId) return [];
      return [];
    });

    const result = await assertCanAssignApplication(tx as any, ctx(USER_TL, Role.EMPLOYEE), {
      applicationId: APP_ORPHAN,
      targetEmployeeId: USER_TEAM_ACTIVE,
    });
    expect(result.previousAssignedEmployeeId).toBe(USER_TEAM_INACTIVE);
    expect(result.newAssignedEmployeeId).toBe(USER_TEAM_ACTIVE);
  });

  it("C. Team Lead cannot recover unrelated-team orphan", async () => {
    const tx = mockTx({
      id: APP_OTHER,
      organizationId: ORG_A,
      assignedEmployeeId: USER_OTHER_INACTIVE,
    });
    tx.membership.findFirst = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.userId === USER_TL && where.status === "ACTIVE") {
        return { isTeamLead: true, teamLeadOf: "Alpha-Team", team: "Alpha-Team" };
      }
      if (where.userId === USER_OTHER_INACTIVE && where.status === "ACTIVE") {
        return null; // inactive
      }
      if (where.userId === USER_OTHER_INACTIVE && where.status?.not === "ACTIVE") {
        // former scope check — Beta team, not matching Alpha keys
        if (where.OR) return null;
        return { id: "m", team: "Beta-Team" };
      }
      return null;
    });
    tx.membership.findMany = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.status === "ACTIVE" && where.OR) {
        return [{ userId: USER_TL }, { userId: USER_TEAM_ACTIVE }];
      }
      return [];
    });

    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_TL, Role.EMPLOYEE), {
        applicationId: APP_OTHER,
        targetEmployeeId: USER_TEAM_ACTIVE,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("Manager can recover former-report orphan", async () => {
    const tx = mockTx({
      id: APP_ORPHAN,
      organizationId: ORG_A,
      assignedEmployeeId: USER_REPORT_INACTIVE,
    });
    tx.membership.findFirst = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.userId === USER_MGR && where.status === "ACTIVE") {
        return { isTeamLead: false, teamLeadOf: null, team: null };
      }
      if (where.userId === USER_REPORT_INACTIVE && where.status === "ACTIVE") {
        return null;
      }
      if (
        where.userId === USER_REPORT_INACTIVE &&
        where.reportingManagerId === USER_MGR &&
        where.status?.not === "ACTIVE"
      ) {
        return { id: "m-rep" };
      }
      if (where.userId === USER_REPORT_ACTIVE && where.status === "ACTIVE") {
        return { userId: USER_REPORT_ACTIVE };
      }
      return null;
    });
    tx.membership.findMany = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.reportingManagerId === USER_MGR && where.status === "ACTIVE") {
        return [{ userId: USER_REPORT_ACTIVE }];
      }
      return [];
    });

    const result = await assertCanAssignApplication(tx as any, ctx(USER_MGR, Role.EMPLOYEE), {
      applicationId: APP_ORPHAN,
      targetEmployeeId: USER_REPORT_ACTIVE,
    });
    expect(result.newAssignedEmployeeId).toBe(USER_REPORT_ACTIVE);
  });

  it("F. Employee cannot recover peer orphan", async () => {
    const tx = mockTx({
      id: APP_ORPHAN,
      organizationId: ORG_A,
      assignedEmployeeId: USER_TEAM_INACTIVE,
    });
    tx.membership.findFirst = vi.fn().mockResolvedValue({
      isTeamLead: false,
      teamLeadOf: null,
      team: "Alpha-Team",
    });
    tx.membership.findMany = vi.fn().mockResolvedValue([]);

    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_EMP, Role.EMPLOYEE), {
        applicationId: APP_ORPHAN,
        targetEmployeeId: USER_EMP,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("H. Cross-tenant Application denied", async () => {
    const tx = mockTx(null);
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_ADMIN, Role.ADMIN, ORG_A), {
        applicationId: APP_ORPHAN,
        targetEmployeeId: USER_TEAM_ACTIVE,
      })
    ).rejects.toThrow();
  });

  it("I. Inactive target still denied for Admin", async () => {
    const tx = mockTx({
      id: APP_ORPHAN,
      organizationId: ORG_A,
      assignedEmployeeId: USER_TEAM_INACTIVE,
    });
    // Admin eligible list excludes inactive; forged target denied
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_ADMIN, Role.ADMIN), {
        applicationId: APP_ORPHAN,
        targetEmployeeId: USER_OTHER_INACTIVE,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("J. Cross-team target denied for Team Lead recovering orphan", async () => {
    const tx = mockTx({
      id: APP_ORPHAN,
      organizationId: ORG_A,
      assignedEmployeeId: USER_TEAM_INACTIVE,
    });
    tx.membership.findFirst = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.userId === USER_TL && where.status === "ACTIVE") {
        return { isTeamLead: true, teamLeadOf: "Alpha-Team", team: "Alpha-Team" };
      }
      if (where.userId === USER_TEAM_INACTIVE && where.status === "ACTIVE") return null;
      if (where.userId === USER_TEAM_INACTIVE && where.status?.not === "ACTIVE") {
        return { id: "m", team: "Alpha-Team" };
      }
      return null;
    });
    tx.membership.findMany = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.status === "ACTIVE" && where.OR) {
        return [{ userId: USER_TL }, { userId: USER_TEAM_ACTIVE }];
      }
      return [];
    });

    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_TL, Role.EMPLOYEE), {
        applicationId: APP_ORPHAN,
        targetEmployeeId: USER_OTHER_INACTIVE,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("Phase 5O — wiring / schema none / regressions", () => {
  it("K/L/M. No client teamId/managerId/employeeId in orphan-scope", () => {
    const src = readFileSync(join(ROOT, "src/lib/application/orphan-scope.ts"), "utf8");
    expect(src).not.toMatch(/args\.teamId|query\.teamId|input\.managerId/);
  });

  it("UI shows Inactive Owner queue and Inactive label", () => {
    const wb = readFileSync(
      join(ROOT, "src/components/application/EmployeeApplicationsWorkbench.tsx"),
      "utf8"
    );
    expect(wb).toContain("Inactive Owner");
    expect(wb).toContain("ownerInactive");
  });

  it("no Phase 5O migration", () => {
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(migrations.some((m) => /phase5o|orphan/i.test(m))).toBe(false);
  });

  it("5I QA/submission still enforce", () => {
    expect(evaluateAuthoritativeQaPass({ review: null }).ok).toBe(false);
    expect(() => assertSubmissionEvidence({})).toThrowError(
      SUBMISSION_EVIDENCE_REQUIRED_MESSAGE
    );
    void QA_CRITERION_KEYS;
  });

  it("assign audit still records previous/new (5M)", () => {
    const src = readFileSync(join(ROOT, "src/lib/application/actions.ts"), "utf8");
    expect(src).toContain("previousAssignedEmployeeId");
    expect(src).toContain("newAssignedEmployeeId");
  });
});
