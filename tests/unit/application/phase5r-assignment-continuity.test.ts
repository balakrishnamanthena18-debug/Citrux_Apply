/**
 * Phase 5R — Application assignment structural snapshot & continuity visibility.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import {
  buildAssignmentWriteData,
  clearAssignmentSnapshot,
  hasKnownAssignmentSnapshot,
  resolveAssignmentSnapshotForEmployee,
} from "@/lib/application/assignment-snapshot";
import {
  buildManagerContinuityWhere,
  buildTeamLeadContinuityWhere,
  activeAssigneeContinuitySubjectAllowed,
  resolveContinuityVisibilityScope,
} from "@/lib/application/continuity-scope";
import { assertCanAssignApplication } from "@/lib/application/assignment-authority";
import { OPERATIONAL_APPLICATION_QUEUES } from "@/lib/application/operations-types";
import { buildInactiveAssigneeOrphanWhere } from "@/lib/application/orphan-scope";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_TL_X = "11111111-1111-4111-8111-111111111111";
const USER_TL_Z = "22222222-2222-4222-8222-222222222222";
const USER_MGR_X = "33333333-3333-4333-8333-333333333333";
const USER_MGR_Z = "44444444-4444-4444-8444-444444444444";
const USER_A = "55555555-5555-4555-8555-555555555555";
const USER_B = "66666666-6666-4666-8666-666666666666";
const USER_EMP = "77777777-7777-4777-8777-777777777777";
const USER_ADMIN = "88888888-8888-4888-8888-888888888888";
const USER_CAND = "99999999-9999-4999-8999-999999999999";
const APP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

function ctx(
  userId: string,
  role: Role,
  organizationId = ORG_A
): AuthenticatedContext {
  return {
    userId,
    email: `${userId}@test.com`,
    role,
    organizationId,
    status: "ACTIVE" as any,
    membershipStatus: "ACTIVE" as any,
  };
}

describe("Phase 5R — assignment snapshot", () => {
  it("1/2. resolves Team + Manager from ACTIVE Membership (server-side)", async () => {
    const tx = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          team: "Team-X",
          reportingManagerId: USER_MGR_X,
        }),
      },
    };
    const snap = await resolveAssignmentSnapshotForEmployee(
      tx as any,
      ORG_A,
      USER_A
    );
    expect(snap.assignedTeamKey).toBe("Team-X");
    expect(snap.assignedManagerId).toBe(USER_MGR_X);
  });

  it("3/4. buildAssignmentWriteData assigns; unassign clears snapshot", async () => {
    const tx = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          team: "Team-Y",
          reportingManagerId: USER_MGR_X,
        }),
      },
    };
    const assigned = await buildAssignmentWriteData(tx as any, ORG_A, USER_B);
    expect(assigned).toEqual({
      assignedEmployeeId: USER_B,
      assignedTeamKey: "Team-Y",
      assignedManagerId: USER_MGR_X,
    });
    expect(clearAssignmentSnapshot()).toEqual({
      assignedEmployeeId: null,
      assignedTeamKey: null,
      assignedManagerId: null,
    });
    const cleared = await buildAssignmentWriteData(tx as any, ORG_A, null);
    expect(cleared.assignedEmployeeId).toBeNull();
    expect(cleared.assignedTeamKey).toBeNull();
    expect(cleared.assignedManagerId).toBeNull();
  });

  it("29. legacy NULL snapshot is SNAPSHOT_UNKNOWN (not out-of-scope)", () => {
    expect(
      hasKnownAssignmentSnapshot({
        assignedTeamKey: null,
        assignedManagerId: null,
      })
    ).toBe(false);
  });

  it("forged client fields are not read by snapshot resolver", async () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/application/assignment-snapshot.ts"),
      "utf8"
    );
    expect(src).toMatch(/membership\.findFirst/);
    expect(src).toMatch(/reportingManagerId/);
    expect(src).not.toMatch(/parsed\.data\.(team|manager)/);
    expect(src).not.toMatch(/input\.(teamId|managerId|assignedTeamKey)/);
  });
});

describe("Phase 5R — continuity visibility", () => {
  it("7. Team X continuity where requires snapshot team + ACTIVE owner outside current set", () => {
    const where = buildTeamLeadContinuityWhere(ORG_A, ["Team-X"], [USER_B]);
    expect(where.assignedTeamKey).toEqual({ in: ["Team-X"] });
    expect(where.assignedEmployeeId).toEqual({
      not: null,
      notIn: [USER_B],
    });
  });

  it("8. Unrelated Team Z keys do not match Team-X snapshot filter", () => {
    const where = buildTeamLeadContinuityWhere(ORG_A, ["Team-Z"], []);
    expect(where.assignedTeamKey).toEqual({ in: ["Team-Z"] });
    expect(where.assignedTeamKey).not.toEqual({ in: ["Team-X"] });
  });

  it("9/10. Manager continuity uses assignedManagerId = viewer", () => {
    const emptyReports = buildManagerContinuityWhere(ORG_A, USER_MGR_X, []);
    expect(emptyReports.assignedEmployeeId).toEqual({ not: null });
    expect(JSON.stringify(emptyReports)).not.toContain('"notIn":[]');

    const where = buildManagerContinuityWhere(ORG_A, USER_MGR_X, [USER_B]);
    expect(where.assignedManagerId).toBe(USER_MGR_X);
    expect(where.assignedEmployeeId).toEqual({
      not: null,
      notIn: [USER_B],
    });
  });

  it("13. Employee without TL/Manager cannot view continuity", async () => {
    const tx = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          isTeamLead: false,
          teamLeadOf: null,
          team: "Team-X",
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      application: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const vis = await resolveContinuityVisibilityScope(
      tx as any,
      ctx(USER_EMP, Role.EMPLOYEE)
    );
    expect(vis.canViewContinuity).toBe(false);
  });

  it("14. Candidate denied continuity", async () => {
    const vis = await resolveContinuityVisibilityScope(
      {} as any,
      ctx(USER_CAND, Role.CANDIDATE)
    );
    expect(vis.canViewContinuity).toBe(false);
  });

  it("G. Admin can view continuity org-wide", async () => {
    const vis = await resolveContinuityVisibilityScope(
      {} as any,
      ctx(USER_ADMIN, Role.ADMIN)
    );
    expect(vis.canViewContinuity).toBe(true);
    expect(vis.kind).toBe("ADMIN");
  });

  it("continuity queue is additive; NEEDS_ATTENTION unchanged", () => {
    expect(OPERATIONAL_APPLICATION_QUEUES).toContain("continuity");
    expect(OPERATIONAL_APPLICATION_QUEUES).toContain("orphaned");
    expect(OPERATIONAL_APPLICATION_QUEUES).toContain("needs_attention");
  });

  it("6/30. inactive orphan predicate remains separate from continuity", () => {
    const orphan = buildInactiveAssigneeOrphanWhere(ORG_A);
    expect(orphan.assignedEmployeeId).toEqual({ not: null });
    // Continuity requires ACTIVE membership; orphan requires none ACTIVE
    expect(JSON.stringify(orphan)).toMatch(/none/);
  });
});

describe("Phase 5R — assignment authority continuity subject", () => {
  function mockTx(app: {
    assignedEmployeeId: string | null;
    assignedTeamKey: string | null;
    assignedManagerId: string | null;
    organizationId?: string;
  }) {
    const memberships = [
      {
        userId: USER_TL_X,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: true,
        teamLeadOf: "Team-X",
        team: "Team-X",
        reportingManagerId: null as string | null,
      },
      {
        userId: USER_A,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null,
        team: "Team-Y", // moved away
        reportingManagerId: USER_MGR_Z,
      },
      {
        userId: USER_B,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null,
        team: "Team-X",
        reportingManagerId: USER_MGR_X, // still reports to MGR_X (current scope)
      },
      {
        userId: USER_MGR_X,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null,
        team: null,
        reportingManagerId: null,
      },
      {
        userId: USER_TL_Z,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: true,
        teamLeadOf: "Team-Z",
        team: "Team-Z",
        reportingManagerId: null,
      },
      {
        userId: USER_EMP,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null,
        team: "Team-X",
        reportingManagerId: null,
      },
    ];

    return {
      application: {
        findUnique: vi.fn().mockResolvedValue({
          id: APP_ID,
          organizationId: app.organizationId ?? ORG_A,
          assignedEmployeeId: app.assignedEmployeeId,
          assignedTeamKey: app.assignedTeamKey,
          assignedManagerId: app.assignedManagerId,
        }),
      },
      membership: {
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          return (
            memberships.find((m) => {
              if (where.userId && m.userId !== where.userId) return false;
              if (where.status === "ACTIVE" && m.status !== "ACTIVE") return false;
              if (where.role?.in && !where.role.in.includes(m.role)) return false;
              return true;
            }) || null
          );
        }),
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          let rows = memberships.filter((m) => m.status === "ACTIVE");
          if (where.role?.in) {
            rows = rows.filter((m) => where.role.in.includes(m.role));
          }
          if (where.reportingManagerId) {
            rows = rows.filter(
              (m) => m.reportingManagerId === where.reportingManagerId
            );
          }
          if (where.OR) {
            const keys = [
              ...(where.OR[0]?.team?.in || []),
              ...(where.OR[1]?.teamLeadOf?.in || []),
            ];
            rows = rows.filter(
              (m) =>
                (m.team && keys.includes(m.team)) ||
                (m.teamLeadOf && keys.includes(m.teamLeadOf))
            );
          }
          return rows.map((m) => ({ userId: m.userId }));
        }),
      },
    };
  }

  it("7/21. Former TL may reassign continuity Application to current team member", async () => {
    const tx = mockTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_X,
    });
    const decision = await assertCanAssignApplication(
      tx as any,
      ctx(USER_TL_X, Role.EMPLOYEE),
      { applicationId: APP_ID, targetEmployeeId: USER_B }
    );
    expect(decision.newAssignedEmployeeId).toBe(USER_B);
    expect(decision.previousAssignedEmployeeId).toBe(USER_A);
  });

  it("8/20. Unrelated TL Z cannot mutate Team-X continuity Application", async () => {
    const tx = mockTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_X,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_TL_Z, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_B,
      })
    ).rejects.toThrow(/not authorized/i);
  });

  it("9. Former Manager X may reassign when snapshot manager = X", async () => {
    const tx = mockTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_X,
    });
    // USER_A reports to MGR_Z (left MGR_X); USER_B still reports to MGR_X.
    // Continuity subject allows mutating A's app; target B is current eligible report.
    const decision = await assertCanAssignApplication(
      tx as any,
      ctx(USER_MGR_X, Role.EMPLOYEE),
      { applicationId: APP_ID, targetEmployeeId: USER_B }
    );
    expect(decision.newAssignedEmployeeId).toBe(USER_B);
    expect(decision.previousAssignedEmployeeId).toBe(USER_A);
  });

  it("13. Employee cannot recover peer continuity Application", async () => {
    const tx = mockTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_X,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_EMP, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_EMP,
      })
    ).rejects.toThrow(/not authorized/i);
  });

  it("15. Cross-tenant Application denied", async () => {
    const tx = mockTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_X,
      organizationId: ORG_B,
    });
    // findUnique filters by ctx org — return null
    tx.application.findUnique = vi.fn().mockResolvedValue(null);
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_TL_X, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_B,
      })
    ).rejects.toThrow(/not found/i);
  });

  it("28. multi-hop: snapshot stays Team-X even if owner now on Team-Z", async () => {
    const allowed = await activeAssigneeContinuitySubjectAllowed(
      {
        membership: {
          findFirst: vi.fn().mockResolvedValue({ id: "active" }),
        },
      } as any,
      ctx(USER_TL_X, Role.EMPLOYEE),
      {
        assignedEmployeeId: USER_A,
        assignedTeamKey: "Team-X",
        assignedManagerId: USER_MGR_X,
      },
      {
        actorKinds: ["EMPLOYEE", "TEAM_LEAD"],
        teamKeys: ["Team-X"],
        eligibleTargetUserIds: [USER_TL_X, USER_B], // A not in current scope
      }
    );
    expect(allowed).toBe(true);
  });

  it("29. NULL snapshot does not grant continuity subject authority", async () => {
    const allowed = await activeAssigneeContinuitySubjectAllowed(
      {
        membership: {
          findFirst: vi.fn().mockResolvedValue({ id: "active" }),
        },
      } as any,
      ctx(USER_TL_X, Role.EMPLOYEE),
      {
        assignedEmployeeId: USER_A,
        assignedTeamKey: null,
        assignedManagerId: null,
      },
      {
        actorKinds: ["EMPLOYEE", "TEAM_LEAD"],
        teamKeys: ["Team-X"],
        eligibleTargetUserIds: [USER_TL_X],
      }
    );
    expect(allowed).toBe(false);
  });
});

describe("Phase 5R fix — Manager with zero current reports", () => {
  const USER_MGR_ZERO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
  const USER_UNRELATED_MGR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11";
  const USER_ARBITRARY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12";

  function zeroReportManagerTx(app: {
    assignedEmployeeId: string;
    assignedTeamKey: string | null;
    assignedManagerId: string | null;
    organizationId?: string;
  }) {
    // MGR_ZERO has ZERO memberships with reportingManagerId = self.
    // USER_A is ACTIVE on another manager. Snapshot still points at MGR_ZERO.
    const memberships = [
      {
        userId: USER_MGR_ZERO,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null as string | null,
        team: null as string | null,
        reportingManagerId: null as string | null,
      },
      {
        userId: USER_A,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null,
        team: "Team-Y",
        reportingManagerId: USER_MGR_Z,
      },
      {
        userId: USER_ARBITRARY,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null,
        team: "Team-Y",
        reportingManagerId: USER_MGR_Z,
      },
      {
        userId: USER_UNRELATED_MGR,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null,
        team: null,
        reportingManagerId: null,
      },
      {
        userId: USER_EMP,
        role: Role.EMPLOYEE,
        status: "ACTIVE",
        isTeamLead: false,
        teamLeadOf: null,
        team: "Team-X",
        reportingManagerId: null,
      },
    ];

    return {
      application: {
        findUnique: vi.fn().mockResolvedValue({
          id: APP_ID,
          organizationId: app.organizationId ?? ORG_A,
          ...app,
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          // Continuity existence probe for resolveContinuityVisibilityScope
          if (
            where?.assignedManagerId === USER_MGR_ZERO &&
            app.assignedManagerId === USER_MGR_ZERO &&
            app.assignedEmployeeId
          ) {
            return { id: APP_ID };
          }
          return null;
        }),
      },
      membership: {
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          return (
            memberships.find((m) => {
              if (where.userId && m.userId !== where.userId) return false;
              if (where.status === "ACTIVE" && m.status !== "ACTIVE") return false;
              if (where.role?.in && !where.role.in.includes(m.role)) return false;
              return true;
            }) || null
          );
        }),
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          let rows = memberships.filter((m) => m.status === "ACTIVE");
          if (where.role?.in) {
            rows = rows.filter((m) => where.role.in.includes(m.role));
          }
          if (where.reportingManagerId) {
            rows = rows.filter(
              (m) => m.reportingManagerId === where.reportingManagerId
            );
          }
          if (where.OR) {
            const keys = [
              ...(where.OR[0]?.team?.in || []),
              ...(where.OR[1]?.teamLeadOf?.in || []),
            ];
            rows = rows.filter(
              (m) =>
                (m.team && keys.includes(m.team)) ||
                (m.teamLeadOf && keys.includes(m.teamLeadOf))
            );
          }
          return rows.map((m) => ({ userId: m.userId }));
        }),
      },
    };
  }

  it("1. Zero-report Manager retains continuity visibility via assignedManagerId", async () => {
    const tx = zeroReportManagerTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_ZERO,
    });
    const vis = await resolveContinuityVisibilityScope(
      tx as any,
      ctx(USER_MGR_ZERO, Role.EMPLOYEE)
    );
    expect(vis.canViewContinuity).toBe(true);
    expect(vis.kind).toBe("MANAGER");
    expect(vis.currentReportIds).toEqual([]);
  });

  it("2. Zero-report Manager may mutate continuity subject (eligible target = self)", async () => {
    const tx = zeroReportManagerTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_ZERO,
    });
    const decision = await assertCanAssignApplication(
      tx as any,
      ctx(USER_MGR_ZERO, Role.EMPLOYEE),
      { applicationId: APP_ID, targetEmployeeId: USER_MGR_ZERO }
    );
    expect(decision.previousAssignedEmployeeId).toBe(USER_A);
    expect(decision.newAssignedEmployeeId).toBe(USER_MGR_ZERO);
    // Zero reports → no MANAGER actor kind from current graph
    expect(decision.profile.actorKinds).not.toContain("MANAGER");
  });

  it("3. Zero-report Manager cannot assign arbitrary org employee", async () => {
    const tx = zeroReportManagerTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_ZERO,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_MGR_ZERO, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_ARBITRARY,
      })
    ).rejects.toThrow(/outside your assignment authority/i);
  });

  it("4. Unrelated Manager cannot see / mutate another Manager's continuity Application", async () => {
    const tx = zeroReportManagerTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_ZERO,
    });
    const vis = await resolveContinuityVisibilityScope(
      tx as any,
      ctx(USER_UNRELATED_MGR, Role.EMPLOYEE)
    );
    expect(vis.canViewContinuity).toBe(false);

    await expect(
      assertCanAssignApplication(
        tx as any,
        ctx(USER_UNRELATED_MGR, Role.EMPLOYEE),
        { applicationId: APP_ID, targetEmployeeId: USER_UNRELATED_MGR }
      )
    ).rejects.toThrow(/not authorized/i);
  });

  it("5. Employee cannot mutate peer continuity Application", async () => {
    const tx = zeroReportManagerTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_ZERO,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_EMP, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_EMP,
      })
    ).rejects.toThrow(/not authorized/i);
  });

  it("6. Candidate cannot view continuity", async () => {
    const vis = await resolveContinuityVisibilityScope(
      {} as any,
      ctx(USER_CAND, Role.CANDIDATE)
    );
    expect(vis.canViewContinuity).toBe(false);
  });

  it("7. Cross-tenant Manager denied", async () => {
    const tx = zeroReportManagerTx({
      assignedEmployeeId: USER_A,
      assignedTeamKey: "Team-X",
      assignedManagerId: USER_MGR_ZERO,
      organizationId: ORG_B,
    });
    tx.application.findUnique = vi.fn().mockResolvedValue(null);
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_MGR_ZERO, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_MGR_ZERO,
      })
    ).rejects.toThrow(/not found/i);
  });

  it("8. Continuity proof is assignedManagerId, not client managerId", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/application/continuity-scope.ts"),
      "utf8"
    );
    expect(src).toMatch(/assignedManagerId === ctx\.userId/);
    expect(src).toMatch(/zero-report|directReports\.length > 0|current report count/i);
    expect(src).not.toMatch(/parsed\.data\.managerId|input\.managerId/);
  });
});

describe("Phase 5R — wiring / schema / regressions", () => {
  it("assign + create + bulk paths write snapshot fields", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/lib/application/actions.ts"),
      "utf8"
    );
    const admin = readFileSync(
      join(process.cwd(), "src/lib/admin/actions.ts"),
      "utf8"
    );
    expect(actions).toMatch(/buildAssignmentWriteData/);
    expect(admin).toMatch(/buildAssignmentWriteData/);
    expect(actions).toMatch(/assignmentData/);
  });

  it("migration exists and does not backfill", () => {
    const path = join(
      process.cwd(),
      "prisma/migrations/20261006120000_phase5r_assignment_structural_snapshot/migration.sql"
    );
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, "utf8");
    expect(sql).toMatch(/assignedTeamKey/);
    expect(sql).toMatch(/assignedManagerId/);
    expect(sql).not.toMatch(/UPDATE\s+applications/i);
    expect(sql).toMatch(/No backfill/i);
  });

  it("UI exposes Out of Scope queue and continuity label", () => {
    const ui = readFileSync(
      join(
        process.cwd(),
        "src/components/application/EmployeeApplicationsWorkbench.tsx"
      ),
      "utf8"
    );
    expect(ui).toMatch(/Out of Scope/);
    expect(ui).toMatch(/continuity/);
    expect(ui).toMatch(/Outside current scope/);
  });

  it("16-19. continuity-scope ignores client teamId/managerId/employeeId", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/application/continuity-scope.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/args\.teamId|input\.teamId|client.*managerId/);
    expect(src).toMatch(/assignedTeamKey/);
    expect(src).toMatch(/assignedManagerId/);
  });

  it("5O orphan module still present", () => {
    expect(
      existsSync(join(process.cwd(), "src/lib/application/orphan-scope.ts"))
    ).toBe(true);
  });
});
