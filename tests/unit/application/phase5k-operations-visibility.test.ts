/**
 * Phase 5K — Application Operations Visibility & Accountability.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Role } from "@/generated/prisma";
import { AuthorizationError } from "@/lib/errors";
import {
  attachAgesFromHistoryBatch,
  formatCurrentStateAge,
  resolveCurrentStateEnteredAt,
} from "@/lib/application/operations-aging";
import { deriveNextActionGuidance } from "@/lib/application/operations-guidance";
import {
  resolveManagerScope,
  resolveTeamLeadScope,
} from "@/lib/application/operations-scope";
import {
  assertClientScopeIgnored,
  listOperationalApplications,
} from "@/lib/application/operations-read";
import { NEEDS_ATTENTION_STATUSES } from "@/lib/application/operations-types";
import { evaluateAuthoritativeQaPass } from "@/lib/qa/authority";
import {
  assertSubmissionEvidence,
  SUBMISSION_EVIDENCE_REQUIRED_MESSAGE,
} from "@/lib/submission/evidence";
import { buildRequestedIntakeWhere } from "@/lib/application/requested-intake";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";

const ROOT = join(__dirname, "../../..");
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_TL = "33333333-3333-4333-8333-333333333333";
const USER_MGR = "44444444-4444-4444-8444-444444444444";
const USER_CAND = "55555555-5555-4555-8555-555555555555";
const USER_TEAM = "66666666-6666-4666-8666-666666666666";
const USER_OTHER_TEAM = "77777777-7777-4777-8777-777777777777";
const APP_MINE = "a1000000-0000-4000-8000-000000000001";
const APP_UNASSIGNED = "a1000000-0000-4000-8000-000000000002";
const APP_TEAM = "a1000000-0000-4000-8000-000000000003";
const APP_OTHER = "a1000000-0000-4000-8000-000000000004";

function staffCtx(userId: string, orgId = ORG_A) {
  return {
    userId,
    email: `${userId}@test.com`,
    role: Role.EMPLOYEE,
    organizationId: orgId,
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

function candidateCtx() {
  return {
    userId: USER_CAND,
    email: "cand@test.com",
    role: Role.CANDIDATE,
    organizationId: ORG_A,
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

function makeApp(overrides: Record<string, unknown>) {
  return {
    id: APP_MINE,
    status: "PREPARING",
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    updatedAt: new Date("2026-10-02T10:00:00.000Z"),
    assignedEmployeeId: USER_A,
    candidateId: "c1",
    jobId: "j1",
    assignedEmployee: {
      id: USER_A,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@test.com",
    },
    candidate: {
      id: "c1",
      applicationAuthorizationMode: "MANAGED",
      user: { firstName: "Cand", lastName: "One", email: "c1@test.com" },
    },
    job: {
      id: "j1",
      title: "Engineer",
      companyName: "Acme",
      location: "Remote",
      isRemote: true,
      source: "LinkedIn",
      externalUrl: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
    },
    submissions: [],
    ...overrides,
  };
}

describe("Phase 5K — aging", () => {
  const now = new Date("2026-10-06T12:00:00.000Z");

  it("resolves currentStateEnteredAt from matching latest history", () => {
    const entered = resolveCurrentStateEnteredAt("READY", [
      {
        applicationId: APP_MINE,
        toStatus: "READY",
        createdAt: new Date("2026-10-05T08:00:00.000Z"),
      },
      {
        applicationId: APP_MINE,
        toStatus: "AWAITING_APPROVAL",
        createdAt: new Date("2026-10-04T08:00:00.000Z"),
      },
    ]);
    expect(entered?.toISOString()).toBe("2026-10-05T08:00:00.000Z");
  });

  it("returns AGE_UNAVAILABLE when history missing for current status", () => {
    const result = formatCurrentStateAge(null, now);
    expect(result).toEqual({
      kind: "AGE_UNAVAILABLE",
      currentStateEnteredAt: null,
      label: "AGE_UNAVAILABLE",
      ageMs: null,
    });
  });

  it("formats deterministic age labels", () => {
    expect(
      formatCurrentStateAge(new Date("2026-10-06T11:48:00.000Z"), now).label
    ).toBe("12 min");
    expect(
      formatCurrentStateAge(new Date("2026-10-06T10:00:00.000Z"), now).label
    ).toBe("2 hr");
    expect(
      formatCurrentStateAge(new Date("2026-10-05T12:00:00.000Z"), now).label
    ).toBe("1 day");
    expect(
      formatCurrentStateAge(new Date("2026-10-03T12:00:00.000Z"), now).label
    ).toBe("3 days");
  });

  it("batch attach does not use updatedAt as state entry", () => {
    const ages = attachAgesFromHistoryBatch(
      [{ id: APP_MINE, status: "REVIEW" }],
      [],
      now
    );
    expect(ages.get(APP_MINE)?.kind).toBe("AGE_UNAVAILABLE");
  });
});

describe("Phase 5K — Team Lead / Manager scope (structural)", () => {
  it("Team Lead derives assignee ids from teamLeadOf → Membership.team", async () => {
    const tx = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          isTeamLead: true,
          teamLeadOf: "Alpha-Team",
          team: "Alpha-Team",
        }),
        findMany: vi.fn().mockResolvedValue([
          { userId: USER_TEAM },
          { userId: USER_TL },
        ]),
      },
    };
    const scope = await resolveTeamLeadScope(tx as any, staffCtx(USER_TL));
    expect(scope.authorized).toBe(true);
    expect(scope.teamKeys).toContain("Alpha-Team");
    expect(scope.assigneeUserIds).toEqual(
      expect.arrayContaining([USER_TEAM, USER_TL])
    );
    expect(tx.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_A,
          OR: [
            { team: { in: ["Alpha-Team"] } },
            { teamLeadOf: { in: ["Alpha-Team"] } },
          ],
        }),
      })
    );
  });

  it("Team Lead with no team keys fails closed (empty)", async () => {
    const tx = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          isTeamLead: true,
          teamLeadOf: null,
          team: null,
        }),
        findMany: vi.fn(),
      },
    };
    const scope = await resolveTeamLeadScope(tx as any, staffCtx(USER_TL));
    expect(scope.authorized).toBe(false);
    expect(scope.assigneeUserIds).toEqual([]);
    expect(tx.membership.findMany).not.toHaveBeenCalled();
  });

  it("non-lead employee is not authorized for team scope", async () => {
    const tx = {
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          isTeamLead: false,
          teamLeadOf: null,
          team: "Alpha-Team",
        }),
        findMany: vi.fn(),
      },
    };
    const scope = await resolveTeamLeadScope(tx as any, staffCtx(USER_A));
    expect(scope.authorized).toBe(false);
  });

  it("Manager scope uses reportingManagerId only (not client managerId)", async () => {
    const tx = {
      membership: {
        findMany: vi.fn().mockResolvedValue([{ userId: USER_A }, { userId: USER_B }]),
      },
    };
    const scope = await resolveManagerScope(tx as any, staffCtx(USER_MGR));
    expect(scope.authorized).toBe(true);
    expect(scope.assigneeUserIds).toEqual([USER_A, USER_B]);
    expect(tx.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reportingManagerId: USER_MGR,
          organizationId: ORG_A,
        }),
      })
    );
  });

  it("Manager with no reports fails closed", async () => {
    const tx = {
      membership: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const scope = await resolveManagerScope(tx as any, staffCtx(USER_MGR));
    expect(scope.authorized).toBe(false);
    expect(scope.assigneeUserIds).toEqual([]);
  });
});

describe("Phase 5K — listOperationalApplications queues & security", () => {
  const now = new Date("2026-10-06T12:00:00.000Z");

  function mockTx(opts: {
    apps?: any[];
    teamMembers?: { userId: string }[];
    reports?: { userId: string }[];
    tlMembership?: any;
    history?: any[];
  }) {
    const apps = opts.apps ?? [];
    return {
      $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(0) }]),
      membership: {
        findFirst: vi.fn().mockResolvedValue(
          opts.tlMembership ?? {
            isTeamLead: false,
            teamLeadOf: null,
            team: null,
          }
        ),
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where?.reportingManagerId) return opts.reports ?? [];
          if (where?.OR) return opts.teamMembers ?? [];
          // ACTIVE staff check for inactive assignee batch
          if (where?.userId?.in) {
            return (where.userId.in as string[]).map((userId: string) => ({
              userId,
            }));
          }
          return [];
        }),
      },
      application: {
        groupBy: vi.fn().mockResolvedValue(
          apps.reduce((acc: any[], a) => {
            const existing = acc.find((g) => g.status === a.status);
            if (existing) existing._count._all += 1;
            else acc.push({ status: a.status, _count: { _all: 1 } });
            return acc;
          }, [])
        ),
        // Phase 5R — continuity existence probe for zero-report managers
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockImplementation(async ({ where }: any) => {
          return apps.filter((a) => matchWhere(a, where)).length;
        }),
        findMany: vi.fn().mockImplementation(async ({ where, take, skip, orderBy }: any) => {
          let rows = apps.filter((a) => matchWhere(a, where));
          const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
          if (orders.length > 0) {
            rows = [...rows].sort((a, b) => {
              for (const ord of orders) {
                if (ord.createdAt === "desc") {
                  const d = b.createdAt.getTime() - a.createdAt.getTime();
                  if (d !== 0) return d;
                } else if (ord.createdAt === "asc") {
                  const d = a.createdAt.getTime() - b.createdAt.getTime();
                  if (d !== 0) return d;
                } else if (ord.id === "desc") {
                  const d = b.id.localeCompare(a.id);
                  if (d !== 0) return d;
                } else if (ord.id === "asc") {
                  const d = a.id.localeCompare(b.id);
                  if (d !== 0) return d;
                }
              }
              return 0;
            });
          }
          if (typeof skip === "number") rows = rows.slice(skip);
          if (typeof take === "number") rows = rows.slice(0, take);
          return rows;
        }),
      },
      applicationStateHistory: {
        findMany: vi.fn().mockResolvedValue(opts.history ?? []),
      },
    };
  }

  function matchWhere(app: any, where: any): boolean {
    if (!where) return true;
    if (where.id?.in && where.id.in.length === 0) return false;
    if (where.organizationId && app.organizationId !== where.organizationId) {
      return false;
    }
    if (where.assignedEmployeeId === null && app.assignedEmployeeId !== null) {
      return false;
    }
    if (
      typeof where.assignedEmployeeId === "string" &&
      app.assignedEmployeeId !== where.assignedEmployeeId
    ) {
      return false;
    }
    if (
      where.assignedEmployeeId?.in &&
      !where.assignedEmployeeId.in.includes(app.assignedEmployeeId)
    ) {
      return false;
    }
    if (where.status && app.status !== where.status) return false;
    if (where.status?.in && !where.status.in.includes(app.status)) return false;
    return true;
  }

  const baseApps = [
    makeApp({
      id: APP_MINE,
      organizationId: ORG_A,
      assignedEmployeeId: USER_A,
      status: "PREPARING",
    }),
    makeApp({
      id: APP_UNASSIGNED,
      organizationId: ORG_A,
      assignedEmployeeId: null,
      assignedEmployee: null,
      status: "DISCOVERED",
    }),
    makeApp({
      id: APP_TEAM,
      organizationId: ORG_A,
      assignedEmployeeId: USER_TEAM,
      assignedEmployee: {
        id: USER_TEAM,
        firstName: "Team",
        lastName: "Mate",
        email: "tm@test.com",
      },
      status: "READY",
    }),
    makeApp({
      id: APP_OTHER,
      organizationId: ORG_A,
      assignedEmployeeId: USER_OTHER_TEAM,
      assignedEmployee: {
        id: USER_OTHER_TEAM,
        firstName: "Other",
        lastName: "Pod",
        email: "op@test.com",
      },
      status: "REVIEW",
    }),
  ];

  it("1. Unassigned queue is server-side assignedEmployeeId null", async () => {
    const tx = mockTx({ apps: baseApps });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_A),
      { queue: "unassigned", sort: "newest" },
      now
    );
    expect(page.items.every((i) => i.assignedEmployeeId === null)).toBe(true);
    expect(page.items.map((i) => i.id)).toEqual([APP_UNASSIGNED]);
    expect(page.counts.unassigned).toBe(1);
  });

  it("2. Mine queue is server-side assignedEmployeeId = auth user", async () => {
    const tx = mockTx({ apps: baseApps });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_A),
      { queue: "mine", sort: "newest" },
      now
    );
    expect(page.items.every((i) => i.assignedEmployeeId === USER_A)).toBe(true);
    expect(page.items.map((i) => i.id)).toEqual([APP_MINE]);
  });

  it("3. Team Lead queue only includes authorized team assignees", async () => {
    const tx = mockTx({
      apps: baseApps,
      tlMembership: {
        isTeamLead: true,
        teamLeadOf: "Alpha-Team",
        team: "Alpha-Team",
      },
      teamMembers: [{ userId: USER_TEAM }, { userId: USER_TL }],
    });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_TL),
      { queue: "team", sort: "newest" },
      now
    );
    expect(page.scopes.team).toBe(true);
    expect(page.items.map((i) => i.id)).toEqual([APP_TEAM]);
    expect(page.items.find((i) => i.id === APP_OTHER)).toBeUndefined();
  });

  it("4. Manager queue only includes direct-report assignees", async () => {
    const tx = mockTx({
      apps: baseApps,
      reports: [{ userId: USER_A }],
    });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_MGR),
      { queue: "manager", sort: "newest" },
      now
    );
    expect(page.scopes.manager).toBe(true);
    expect(page.items.map((i) => i.id)).toEqual([APP_MINE]);
  });

  it("5. Cross-tenant org filter always uses ctx.organizationId", async () => {
    const cross = [
      ...baseApps,
      makeApp({
        id: "cross",
        organizationId: ORG_B,
        assignedEmployeeId: USER_A,
      }),
    ];
    const tx = mockTx({ apps: cross });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_A, ORG_A),
      { queue: "all", sort: "newest" },
      now
    );
    expect(page.items.every((i) => (i as any).organizationId !== ORG_B)).toBe(true);
    // findMany called with org A
    expect(tx.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A }),
      })
    );
  });

  it("6. Candidate denial", async () => {
    const tx = mockTx({ apps: baseApps });
    await expect(
      listOperationalApplications(tx as any, candidateCtx(), { queue: "mine" }, now)
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("7. Forged employeeId does not alter Mine results", async () => {
    const tx = mockTx({ apps: baseApps });
    const forged = {
      queue: "mine",
      sort: "newest",
      employeeId: USER_B,
    } as any;
    assertClientScopeIgnored(forged);
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_A),
      forged,
      now
    );
    expect(page.items.every((i) => i.assignedEmployeeId === USER_A)).toBe(true);
    expect(page.items.find((i) => i.assignedEmployeeId === USER_B)).toBeUndefined();
  });

  it("8. Forged teamId does not alter Team Lead results", async () => {
    const tx = mockTx({
      apps: baseApps,
      tlMembership: {
        isTeamLead: true,
        teamLeadOf: "Alpha-Team",
        team: "Alpha-Team",
      },
      teamMembers: [{ userId: USER_TEAM }],
    });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_TL),
      { queue: "team", sort: "newest", ...( { teamId: "Evil-Team" } as any) },
      now
    );
    expect(page.scopes.teamKeys).toEqual(["Alpha-Team"]);
    expect(page.items.map((i) => i.id)).toEqual([APP_TEAM]);
  });

  it("9. Forged managerId does not alter Manager results", async () => {
    const tx = mockTx({
      apps: baseApps,
      reports: [{ userId: USER_A }],
    });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_MGR),
      { queue: "manager", sort: "newest", ...( { managerId: USER_B } as any) },
      now
    );
    expect(page.items.map((i) => i.assignedEmployeeId)).toEqual([USER_A]);
  });

  it("10–11. StateHistory aging attached; AGE_UNAVAILABLE when missing", async () => {
    const tx = mockTx({
      apps: [baseApps[0]],
      history: [
        {
          applicationId: APP_MINE,
          toStatus: "PREPARING",
          createdAt: new Date("2026-10-06T10:00:00.000Z"),
        },
      ],
    });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_A),
      { queue: "mine", sort: "newest" },
      now
    );
    const aged = page.items[0];
    expect(aged).toBeDefined();
    expect(aged!.currentStateAgeKind).toBe("AGE");
    expect(aged!.currentStateAgeLabel).toBe("2 hr");
    expect(aged!.currentStateEnteredAt).toBe("2026-10-06T10:00:00.000Z");

    const firstApp = baseApps[0];
    expect(firstApp).toBeDefined();
    const tx2 = mockTx({ apps: [firstApp!], history: [] });
    const page2 = await listOperationalApplications(
      tx2 as any,
      staffCtx(USER_A),
      { queue: "mine", sort: "newest" },
      now
    );
    const unavailable = page2.items[0];
    expect(unavailable).toBeDefined();
    expect(unavailable!.currentStateAgeKind).toBe("AGE_UNAVAILABLE");
    expect(unavailable!.currentStateAgeLabel).toBe("AGE_UNAVAILABLE");
  });

  it("12–14. Pagination bounded + deterministic newest ordering", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeApp({
        id: `a1000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        organizationId: ORG_A,
        assignedEmployeeId: USER_A,
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)),
      })
    );
    const tx = mockTx({ apps: many });
    const page1 = await listOperationalApplications(
      tx as any,
      staffCtx(USER_A),
      { queue: "mine", sort: "newest", page: 1, pageSize: 10 },
      now
    );
    expect(page1.items).toHaveLength(10);
    expect(page1.pageSize).toBe(10);
    expect(page1.totalCount).toBe(30);
    expect(tx.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 0 })
    );
    // Deterministic: createdAt desc
    for (let i = 1; i < page1.items.length; i++) {
      const prev = page1.items[i - 1];
      const curr = page1.items[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      expect(new Date(prev!.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(curr!.createdAt).getTime()
      );
    }
  });

  it("Team queue empty when unauthorized (fail closed)", async () => {
    const tx = mockTx({ apps: baseApps });
    const page = await listOperationalApplications(
      tx as any,
      staffCtx(USER_A),
      { queue: "team", sort: "newest" },
      now
    );
    expect(page.scopes.team).toBe(false);
    expect(page.items).toEqual([]);
  });

  it("needs_attention semantics unchanged", () => {
    expect([...NEEDS_ATTENTION_STATUSES]).toEqual([
      "AWAITING_APPROVAL",
      "SUBMISSION_ISSUE",
      "REVIEW_REQUIRED",
      "CORRECTION_APPROVED",
      "RESUBMISSION",
      "FAILED",
    ]);
  });

  it("next action guidance is advisory only", () => {
    expect(deriveNextActionGuidance("READY")).toMatch(/record submission/i);
  });
});

describe("Phase 5K — console wiring (static)", () => {
  it("page uses listOperationalApplications (not take:150 client filter)", () => {
    const page = readFileSync(
      join(ROOT, "src/app/(dashboard)/employee/applications/page.tsx"),
      "utf8"
    );
    const workbench = readFileSync(
      join(ROOT, "src/components/application/EmployeeApplicationsWorkbench.tsx"),
      "utf8"
    );
    expect(page).toContain("listOperationalApplications");
    expect(page).not.toContain("take: 150");
    expect(workbench).toContain("Unassigned");
    expect(workbench).toContain("currentStateAgeLabel");
    expect(workbench).not.toContain("result.filter((a) => a.assignedEmployeeId");
  });

  it("no Phase 5K schema/migration files", () => {
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(migrations.some((m) => /phase5k|operations.?visibility/i.test(m))).toBe(
      false
    );
  });
});

describe("Phase 5K — 5G / 5I / lifecycle regressions", () => {
  it("15. 5G intake where builder still org-scoped", () => {
    const where = buildRequestedIntakeWhere(ORG_A);
    expect(where.organizationId).toBe(ORG_A);
    expect(where.applicationRequestedAt).toEqual({ not: null });
  });

  it("16–19. 5I QA + submission authority helpers still enforce", () => {
    const qa = evaluateAuthoritativeQaPass({ review: null });
    expect(qa.ok).toBe(false);

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
