/**
 * Phase 5M — Application Assignment Authority & Controlled Reassignment.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Role } from "@/generated/prisma";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import {
  assertCanAssignApplication,
  listEligibleAssignees,
  resolveAssignmentAuthority,
} from "@/lib/application/assignment-authority";
import { NEEDS_ATTENTION_STATUSES } from "@/lib/application/operations-types";
import { evaluateAuthoritativeQaPass } from "@/lib/qa/authority";
import {
  assertSubmissionEvidence,
  SUBMISSION_EVIDENCE_REQUIRED_MESSAGE,
} from "@/lib/submission/evidence";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";
import { ApplicationAssignSchema } from "@/lib/validation/application.schemas";

const ROOT = join(__dirname, "../../..");
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const USER_EMP = "11111111-1111-4111-8111-111111111111";
const USER_PEER = "22222222-2222-4222-8222-222222222222";
const USER_TL = "33333333-3333-4333-8333-333333333333";
const USER_TEAM = "66666666-6666-4666-8666-666666666666";
const USER_OTHER_TEAM = "77777777-7777-4777-8777-777777777777";
const USER_MGR = "44444444-4444-4444-8444-444444444444";
const USER_REPORT = "88888888-8888-4888-8888-888888888888";
const USER_OUTSIDE_REPORT = "99999999-9999-4999-8999-999999999999";
const USER_ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const USER_CAND = "55555555-5555-4555-8555-555555555555";
const USER_INACTIVE = "abababab-abab-4aba-8aba-abababababab";
const APP_ID = "a1000000-0000-4000-8000-000000000001";
const APP_OTHER = "a1000000-0000-4000-8000-000000000002";

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

type MembershipRow = {
  userId: string;
  role: Role;
  status: string;
  isTeamLead?: boolean;
  teamLeadOf?: string | null;
  team?: string | null;
  reportingManagerId?: string | null;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function mockTx(opts: {
  application?: {
    id: string;
    organizationId: string;
    assignedEmployeeId: string | null;
    assignedTeamKey?: string | null;
    assignedManagerId?: string | null;
  } | null;
  memberships: MembershipRow[];
}) {
  const memberships = opts.memberships;
  return {
    application: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const app = opts.application;
        if (!app) return null;
        if (where.id && app.id !== where.id) return null;
        if (where.organizationId && app.organizationId !== where.organizationId) {
          return null;
        }
        return {
          ...app,
          assignedTeamKey: app.assignedTeamKey ?? null,
          assignedManagerId: app.assignedManagerId ?? null,
        };
      }),
    },
    membership: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        return (
          memberships.find((m) => {
            if (where.userId && m.userId !== where.userId) return false;
            if (where.organizationId && where.organizationId !== ORG_A) {
              // tests only seed ORG_A memberships
              return false;
            }
            if (where.status && m.status !== where.status) return false;
            if (where.role?.in && !where.role.in.includes(m.role)) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        let rows = memberships.filter((m) => m.status === (where.status || m.status));
        if (where.role?.in) {
          rows = rows.filter((m) => where.role.in.includes(m.role));
        }
        if (where.reportingManagerId) {
          rows = rows.filter((m) => m.reportingManagerId === where.reportingManagerId);
        }
        if (where.OR) {
          const keys =
            where.OR[0]?.team?.in ||
            where.OR[1]?.teamLeadOf?.in ||
            [];
          rows = rows.filter(
            (m) =>
              (m.team && keys.includes(m.team)) ||
              (m.teamLeadOf && keys.includes(m.teamLeadOf))
          );
        }
        if (where.userId?.in) {
          rows = rows.filter((m) => where.userId.in.includes(m.userId));
        }
        if (where.take) rows = rows.slice(0, where.take);
        return rows.map((m) => ({
          userId: m.userId,
          role: m.role,
          user: {
            firstName: m.firstName ?? "F",
            lastName: m.lastName ?? "L",
            email: m.email ?? `${m.userId}@test.com`,
          },
        }));
      }),
    },
  };
}

const teamMemberships: MembershipRow[] = [
  {
    userId: USER_TL,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    isTeamLead: true,
    teamLeadOf: "Alpha-Team",
    team: "Alpha-Team",
  },
  {
    userId: USER_TEAM,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    isTeamLead: false,
    team: "Alpha-Team",
  },
  {
    userId: USER_OTHER_TEAM,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    isTeamLead: false,
    team: "Beta-Team",
  },
  {
    userId: USER_EMP,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    isTeamLead: false,
    team: "Alpha-Team",
  },
  {
    userId: USER_PEER,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    isTeamLead: false,
    team: "Alpha-Team",
  },
  {
    userId: USER_MGR,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    isTeamLead: false,
  },
  {
    userId: USER_REPORT,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    reportingManagerId: USER_MGR,
  },
  {
    userId: USER_OUTSIDE_REPORT,
    role: Role.EMPLOYEE,
    status: "ACTIVE",
    reportingManagerId: USER_PEER,
  },
  {
    userId: USER_ADMIN,
    role: Role.ADMIN,
    status: "ACTIVE",
  },
  {
    userId: USER_INACTIVE,
    role: Role.EMPLOYEE,
    status: "DEACTIVATED",
    team: "Alpha-Team",
  },
];

describe("Phase 5M — Employee policy", () => {
  it("A/B. Employee may assign unassigned Application to self", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    const result = await assertCanAssignApplication(tx as any, ctx(USER_EMP, Role.EMPLOYEE), {
      applicationId: APP_ID,
      targetEmployeeId: USER_EMP,
    });
    expect(result.newAssignedEmployeeId).toBe(USER_EMP);
    expect(result.previousAssignedEmployeeId).toBeNull();
  });

  it("C. Employee cannot assign coworker", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_EMP, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_PEER,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("Employee cannot take coworker's Application", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: USER_PEER,
      },
      memberships: teamMemberships,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_EMP, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_EMP,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("L. Employee cannot unassign", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: USER_EMP,
      },
      memberships: teamMemberships,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_EMP, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: null,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("Phase 5M — Team Lead policy", () => {
  it("D. Team Lead may assign to team member", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    const result = await assertCanAssignApplication(tx as any, ctx(USER_TL, Role.EMPLOYEE), {
      applicationId: APP_ID,
      targetEmployeeId: USER_TEAM,
    });
    expect(result.newAssignedEmployeeId).toBe(USER_TEAM);
  });

  it("E. Team Lead cross-team denial", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_TL, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_OTHER_TEAM,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("Team Lead may unassign within team scope", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: USER_TEAM,
      },
      memberships: teamMemberships,
    });
    const result = await assertCanAssignApplication(tx as any, ctx(USER_TL, Role.EMPLOYEE), {
      applicationId: APP_ID,
      targetEmployeeId: null,
    });
    expect(result.previousAssignedEmployeeId).toBe(USER_TEAM);
    expect(result.newAssignedEmployeeId).toBeNull();
  });

  it("Team Lead cannot mutate Application owned outside team", async () => {
    const tx = mockTx({
      application: {
        id: APP_OTHER,
        organizationId: ORG_A,
        assignedEmployeeId: USER_OTHER_TEAM,
      },
      memberships: teamMemberships,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_TL, Role.EMPLOYEE), {
        applicationId: APP_OTHER,
        targetEmployeeId: USER_TEAM,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("Phase 5M — Manager policy", () => {
  it("F. Manager may assign to direct report", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    const result = await assertCanAssignApplication(tx as any, ctx(USER_MGR, Role.EMPLOYEE), {
      applicationId: APP_ID,
      targetEmployeeId: USER_REPORT,
    });
    expect(result.newAssignedEmployeeId).toBe(USER_REPORT);
  });

  it("G. Manager outside-scope denial", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_MGR, Role.EMPLOYEE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_OUTSIDE_REPORT,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("Phase 5M — Admin / Candidate / tenant / inactive", () => {
  it("H. Admin may assign any ACTIVE org staff", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: USER_OTHER_TEAM,
      },
      memberships: teamMemberships,
    });
    const result = await assertCanAssignApplication(tx as any, ctx(USER_ADMIN, Role.ADMIN), {
      applicationId: APP_ID,
      targetEmployeeId: USER_TEAM,
    });
    expect(result.newAssignedEmployeeId).toBe(USER_TEAM);
    expect(result.previousAssignedEmployeeId).toBe(USER_OTHER_TEAM);
  });

  it("I. Candidate denial", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_CAND, Role.CANDIDATE), {
        applicationId: APP_ID,
        targetEmployeeId: USER_EMP,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("J. Cross-tenant Application denial", async () => {
    const tx = mockTx({
      application: null,
      memberships: teamMemberships,
    });
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_ADMIN, Role.ADMIN, ORG_A), {
        applicationId: APP_ID,
        targetEmployeeId: USER_TEAM,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("K. Inactive target denial", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    // Inactive staff are excluded from Admin eligible lists → denied (forged ID).
    await expect(
      assertCanAssignApplication(tx as any, ctx(USER_ADMIN, Role.ADMIN), {
        applicationId: APP_ID,
        targetEmployeeId: USER_INACTIVE,
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("Phase 5M — forged scope / UI list / audit schema", () => {
  it("M/N/O. Client teamId/managerId/employeeId ignored by authority resolution", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    const profile = await resolveAssignmentAuthority(tx as any, ctx(USER_EMP, Role.EMPLOYEE));
    expect(profile.eligibleTargetUserIds).toEqual([USER_EMP]);
    // forged params are not inputs to resolveAssignmentAuthority
    void ({ teamId: "Evil", managerId: USER_MGR, employeeId: USER_PEER } as any);
  });

  it("UI list for Employee is self-only; TL is team-scoped", async () => {
    const tx = mockTx({
      application: {
        id: APP_ID,
        organizationId: ORG_A,
        assignedEmployeeId: null,
      },
      memberships: teamMemberships,
    });
    const empList = await listEligibleAssignees(tx as any, ctx(USER_EMP, Role.EMPLOYEE));
    expect(empList.allowUnassigned).toBe(false);
    expect(empList.options.map((o) => o.userId)).toEqual([USER_EMP]);

    const tlList = await listEligibleAssignees(tx as any, ctx(USER_TL, Role.EMPLOYEE));
    expect(tlList.allowUnassigned).toBe(true);
    expect(tlList.options.map((o) => o.userId)).toEqual(
      expect.arrayContaining([USER_TL, USER_TEAM, USER_EMP, USER_PEER])
    );
    expect(tlList.options.map((o) => o.userId)).not.toContain(USER_OTHER_TEAM);
  });

  it("Q/R/S. Assign schema accepts optional reason; audit fields documented", () => {
    const parsed = ApplicationAssignSchema.parse({
      applicationId: APP_ID,
      employeeId: USER_EMP,
      reason: "Coverage handoff",
    });
    expect(parsed.reason).toBe("Coverage handoff");
    // Reassignment chain reconstructable via previous/new in details (see assignApplicationAction)
    expect(
      readFileSync(join(ROOT, "src/lib/application/actions.ts"), "utf8")
    ).toContain("previousAssignedEmployeeId");
    expect(
      readFileSync(join(ROOT, "src/lib/application/actions.ts"), "utf8")
    ).toContain("newAssignedEmployeeId");
  });

  it("P. Bulk reassignment remains Admin-gated with previous owners in details", () => {
    const src = readFileSync(join(ROOT, "src/lib/admin/actions.ts"), "utf8");
    expect(src).toContain("requireAdmin(ctx)");
    expect(src).toContain("previousApplicationOwners");
    expect(src).toContain("newAssignedEmployeeId");
  });

  it("T. Concurrency: last-write-wins accepted (no new lock); sequential audits)", () => {
    // Documented contract: assignApplicationAction has no optimistic lock;
    // two authorized actors → last update wins; each writes APPLICATION_ASSIGNED.
    const src = readFileSync(join(ROOT, "src/lib/application/actions.ts"), "utf8");
    expect(src).not.toContain("SELECT FOR UPDATE");
    expect(src).toContain("assertCanAssignApplication");
  });
});

describe("Phase 5M — static wiring / schema none", () => {
  it("detail page uses listEligibleAssignees", () => {
    const page = readFileSync(
      join(ROOT, "src/app/(dashboard)/employee/applications/[id]/page.tsx"),
      "utf8"
    );
    expect(page).toContain("listEligibleAssignees");
    expect(page).not.toContain('role: { in: ["EMPLOYEE", "ADMIN"] }, status: "ACTIVE" }');
  });

  it("no Phase 5M migration", () => {
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(migrations.some((m) => /phase5m|assignment.?authority/i.test(m))).toBe(
      false
    );
  });
});

describe("Phase 5M — 5K / 5I / lifecycle regressions", () => {
  it("U. 5K needs_attention semantics unchanged", () => {
    expect([...NEEDS_ATTENTION_STATUSES]).toContain("AWAITING_APPROVAL");
    expect([...NEEDS_ATTENTION_STATUSES]).not.toContain("UNASSIGNED" as any);
  });

  it("V–Y. 5I QA + submission authority still enforce", () => {
    expect(evaluateAuthoritativeQaPass({ review: null }).ok).toBe(false);
    const pass = evaluateAuthoritativeQaPass({
      review: {
        id: "qa-1",
        decision: "PASS",
        createdAt: new Date("2026-10-06T12:00:00.000Z"),
        checklistItems: QA_CRITERION_KEYS.map((criterionKey) => ({
          criterionKey,
          isVerified: true,
        })),
      },
      currentMaterialCreatedAt: new Date("2026-10-06T11:00:00.000Z"),
    });
    expect(pass).toEqual({ ok: true, qaReviewId: "qa-1" });
    expect(() => assertSubmissionEvidence({})).toThrowError(
      SUBMISSION_EVIDENCE_REQUIRED_MESSAGE
    );
  });
});
