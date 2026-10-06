/**
 * Phase 6C / Phase 6D.1 — authorization / security matrix (service + action forensics).
 * Contract: docs/engineering/PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { Role } from "@/generated/prisma";
import {
  assertCandidateOwnsApplication,
  assertStaffCanAccessApplication,
  createCandidateReportedOutcome,
  createStaffOutcome,
  verifyCandidateReportedOutcome,
  voidOutcome,
  supersedeOutcome,
  listOutcomesForStaff,
  listOutcomesForCandidate,
} from "@/lib/application/outcome-service";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import {
  generateOutcomeEvidencePath,
  isCanonicalOutcomeEvidencePath,
} from "@/lib/storage";

const ROOT = join(__dirname, "../../..");
const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "99999999-9999-4999-8999-999999999999";

const USER_EMP = "11111111-1111-4111-8111-111111111111";
const USER_PEER = "22222222-2222-4222-8222-222222222222";
const USER_TL = "33333333-3333-4333-8333-333333333333";
const USER_TEAM_MEMBER = "44444444-4444-4444-8444-444444444444";
const USER_OTHER_TEAM_MEMBER = "55555555-5555-4555-8555-555555555555";
const USER_MGR = "66666666-6666-4666-8666-666666666666";
const USER_REPORT = "77777777-7777-4777-8777-777777777777";
const USER_OUTSIDE_REPORT = "88888888-8888-4888-8888-888888888888";
const USER_ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAND_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAND_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const APP_1 = "a1000000-0000-4000-8000-000000000001";
const APP_B = "b1000000-0000-4000-8000-000000000001";

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

type AppRow = {
  id: string;
  organizationId: string;
  status: string;
  candidateId: string;
  candidateUserId: string;
  assignedEmployeeId: string | null;
  assignedTeamKey?: string | null;
  assignedManagerId?: string | null;
  submissionsCount?: number;
};

type MemRow = {
  userId: string;
  organizationId: string;
  role: Role;
  status: string;
  isTeamLead?: boolean;
  teamLeadOf?: string | null;
  team?: string | null;
  reportingManagerId?: string | null;
};

function staffCtx(userId: string, role: Role = Role.EMPLOYEE, orgId = ORG_A) {
  return {
    userId,
    email: `${userId}@citrux.com`,
    role,
    organizationId: orgId,
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

function candidateCtx(userId: string = CAND_A, orgId = ORG_A) {
  return {
    userId,
    email: `${userId}@cand.com`,
    role: "CANDIDATE" as const,
    organizationId: orgId,
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
}

function mockStructuralTx(opts: {
  applications: AppRow[];
  memberships: MemRow[];
}) {
  return {
    application: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        const hit = opts.applications.find((a) => {
          if (where.id && a.id !== where.id) return false;
          if (
            where.organizationId &&
            a.organizationId !== where.organizationId
          )
            return false;
          return true;
        });
        if (!hit) return null;
        return {
          id: hit.id,
          organizationId: hit.organizationId,
          status: hit.status,
          candidateId: hit.candidateId,
          assignedEmployeeId: hit.assignedEmployeeId,
          assignedTeamKey: hit.assignedTeamKey ?? null,
          assignedManagerId: hit.assignedManagerId ?? null,
          candidate: { userId: hit.candidateUserId },
          _count: { submissions: hit.submissionsCount ?? 1 },
        };
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const hit = opts.applications.find((a) => {
          if (where.id && a.id !== where.id) return false;
          if (
            where.organizationId &&
            a.organizationId !== where.organizationId
          )
            return false;
          return true;
        });
        if (!hit) return null;
        return {
          id: hit.id,
          organizationId: hit.organizationId,
          status: hit.status,
          candidateId: hit.candidateId,
          assignedEmployeeId: hit.assignedEmployeeId,
          assignedTeamKey: hit.assignedTeamKey ?? null,
          assignedManagerId: hit.assignedManagerId ?? null,
          candidate: { userId: hit.candidateUserId },
          _count: { submissions: hit.submissionsCount ?? 1 },
        };
      }),
    },
    membership: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        const hit = opts.memberships.find((m) => {
          if (where.userId && m.userId !== where.userId) return false;
          if (
            where.organizationId &&
            m.organizationId !== where.organizationId
          )
            return false;
          if (where.status && m.status !== where.status) return false;
          if (where.role?.in && !where.role.in.includes(m.role)) return false;
          return true;
        });
        if (!hit) return null;
        return {
          id: `mem-${hit.userId}`,
          organizationId: hit.organizationId,
          userId: hit.userId,
          role: hit.role,
          status: hit.status,
          isTeamLead: hit.isTeamLead ?? false,
          teamLeadOf: hit.teamLeadOf ?? null,
          team: hit.team ?? null,
          reportingManagerId: hit.reportingManagerId ?? null,
        };
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return opts.memberships
          .filter((m) => {
            if (
              where.organizationId &&
              m.organizationId !== where.organizationId
            )
              return false;
            if (where.status && m.status !== where.status) return false;
            if (where.role?.in && !where.role.in.includes(m.role)) return false;
            if (where.reportingManagerId && m.reportingManagerId !== where.reportingManagerId)
              return false;
            if (where.userId?.in && !where.userId.in.includes(m.userId))
              return false;
            if (where.OR) {
              const matchesOr = where.OR.some((clause: any) => {
                if (clause.team?.in && m.team && clause.team.in.includes(m.team))
                  return true;
                if (
                  clause.teamLeadOf?.in &&
                  m.teamLeadOf &&
                  clause.teamLeadOf.in.includes(m.teamLeadOf)
                )
                  return true;
                return false;
              });
              if (!matchesOr) return false;
            }
            return true;
          })
          .map((m) => ({
            userId: m.userId,
            organizationId: m.organizationId,
            role: m.role,
            status: m.status,
          }));
      }),
    },
    applicationOutcomeEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }: any) => ({
        id: "out-1",
        ...data,
        recordedAt: new Date(),
      })),
      update: vi.fn(async ({ data }: any) => ({
        id: "out-1",
        ...data,
      })),
    },
  };
}

describe("Phase 6D.1 — Structural Scope Authority Matrix", () => {
  const defaultMemberships: MemRow[] = [
    {
      userId: USER_EMP,
      organizationId: ORG_A,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      team: "TeamAlpha",
    },
    {
      userId: USER_PEER,
      organizationId: ORG_A,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      team: "TeamBeta",
    },
    {
      userId: USER_TL,
      organizationId: ORG_A,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      isTeamLead: true,
      teamLeadOf: "TeamAlpha",
      team: "TeamAlpha",
    },
    {
      userId: USER_TEAM_MEMBER,
      organizationId: ORG_A,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      team: "TeamAlpha",
    },
    {
      userId: USER_OTHER_TEAM_MEMBER,
      organizationId: ORG_A,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      team: "TeamBeta",
    },
    {
      userId: USER_MGR,
      organizationId: ORG_A,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      team: "Engineering",
    },
    {
      userId: USER_REPORT,
      organizationId: ORG_A,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      reportingManagerId: USER_MGR,
    },
    {
      userId: USER_OUTSIDE_REPORT,
      organizationId: ORG_A,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      reportingManagerId: null,
    },
    {
      userId: USER_ADMIN,
      organizationId: ORG_A,
      role: Role.ADMIN,
      status: "ACTIVE",
    },
  ];

  describe("EMPLOYEE Scope", () => {
    it("EMPLOYEE: own Application → ALLOW", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_EMP,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_EMP), APP_1)
      ).resolves.toMatchObject({ id: APP_1 });
    });

    it("EMPLOYEE: unrelated peer Application → DENY", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_PEER,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_EMP), APP_1)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("TEAM LEAD Scope", () => {
    it("TEAM LEAD: Application in current team → ALLOW", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_TEAM_MEMBER,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_TL), APP_1)
      ).resolves.toMatchObject({ id: APP_1 });
    });

    it("TEAM LEAD: Application in another team → DENY", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_OTHER_TEAM_MEMBER,
            assignedTeamKey: "TeamBeta",
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_TL), APP_1)
      ).rejects.toThrow(AuthorizationError);
    });

    it("TEAM LEAD: continuity Application within former authorized structural scope → ALLOW", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_OTHER_TEAM_MEMBER,
            assignedTeamKey: "TeamAlpha", // Snapshotted under TL's team!
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_TL), APP_1)
      ).resolves.toMatchObject({ id: APP_1 });
    });

    it("TEAM LEAD: unrelated continuity Application → DENY", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_OTHER_TEAM_MEMBER,
            assignedTeamKey: "TeamGamma", // Unrelated snapshot team
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_TL), APP_1)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("MANAGER Scope", () => {
    it("MANAGER: Application belonging to direct report → ALLOW", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_REPORT,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_MGR), APP_1)
      ).resolves.toMatchObject({ id: APP_1 });
    });

    it("MANAGER: Application belonging to unrelated employee → DENY", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_OUTSIDE_REPORT,
            assignedManagerId: null,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_MGR), APP_1)
      ).rejects.toThrow(AuthorizationError);
    });

    it("MANAGER: continuity Application with assignedManagerId = self → ALLOW", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_OUTSIDE_REPORT,
            assignedManagerId: USER_MGR, // Snapshotted under this manager!
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_MGR), APP_1)
      ).resolves.toMatchObject({ id: APP_1 });
    });

    it("MANAGER: continuity Application assigned to another manager → DENY", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_OUTSIDE_REPORT,
            assignedManagerId: "other-mgr-id",
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_MGR), APP_1)
      ).rejects.toThrow(AuthorizationError);
    });

    it("MANAGER: zero-current-reports continuity case → ALLOW when structurally justified", async () => {
      // Manager with 0 active reports
      const membershipsWithZeroReports = defaultMemberships.filter(
        (m) => m.reportingManagerId !== USER_MGR
      );

      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_OUTSIDE_REPORT,
            assignedManagerId: USER_MGR, // Continuity snapshot proof
          },
        ],
        memberships: membershipsWithZeroReports,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_MGR), APP_1)
      ).resolves.toMatchObject({ id: APP_1 });
    });

    it("MANAGER: unrelated organization Application → DENY", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_B, // Different Org
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_REPORT,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, staffCtx(USER_MGR, Role.EMPLOYEE, ORG_A), APP_1)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("ADMIN Scope", () => {
    it("ADMIN: organization Application → ALLOW", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_OUTSIDE_REPORT,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(
          tx as never,
          staffCtx(USER_ADMIN, Role.ADMIN),
          APP_1
        )
      ).resolves.toMatchObject({ id: APP_1 });
    });

    it("ADMIN: other organization Application → DENY", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_B,
            organizationId: ORG_B,
            status: "SUBMITTED",
            candidateId: "c1",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_EMP,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(
          tx as never,
          staffCtx(USER_ADMIN, Role.ADMIN, ORG_A),
          APP_B
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("CANDIDATE Scope", () => {
    it("CANDIDATE: own Application → ALLOW", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "cA",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_EMP,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertCandidateOwnsApplication(tx as never, candidateCtx(CAND_A), APP_1)
      ).resolves.toMatchObject({ id: APP_1 });
    });

    it("CANDIDATE: other candidate Application → DENY", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "cB",
            candidateUserId: CAND_B,
            assignedEmployeeId: USER_EMP,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertCandidateOwnsApplication(tx as never, candidateCtx(CAND_A), APP_1)
      ).rejects.toThrow(NotFoundError);
    });

    it("CANDIDATE: cannot invoke staff access helper", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "cA",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_EMP,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        assertStaffCanAccessApplication(tx as never, candidateCtx(CAND_A) as never, APP_1)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("IDOR / Context Derivation Tests", () => {
    it("forged organizationId in context cannot access other org application", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "cA",
            candidateUserId: CAND_A,
            assignedEmployeeId: USER_EMP,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        createStaffOutcome(
          tx as never,
          staffCtx(USER_EMP, Role.EMPLOYEE, ORG_B), // Forged ORG_B
          { applicationId: APP_1, outcomeType: "RECRUITER_CONTACT" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("forged candidate cannot report on another candidate's application", async () => {
      const tx = mockStructuralTx({
        applications: [
          {
            id: APP_1,
            organizationId: ORG_A,
            status: "SUBMITTED",
            candidateId: "cB",
            candidateUserId: CAND_B, // Belongs to CAND_B
            assignedEmployeeId: USER_EMP,
          },
        ],
        memberships: defaultMemberships,
      });

      await expect(
        createCandidateReportedOutcome(
          tx as never,
          candidateCtx(CAND_A), // CAND_A attempts to report
          { applicationId: APP_1, outcomeType: "INTERVIEW_REQUESTED" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    it("evidence path validation rejects traversal and forged prefixes", () => {
      const canonical = generateOutcomeEvidencePath(ORG_A, APP_1, "oid-1", "doc.pdf");
      expect(isCanonicalOutcomeEvidencePath(canonical, ORG_A, APP_1)).toBe(true);
      expect(isCanonicalOutcomeEvidencePath(canonical, ORG_B, APP_1)).toBe(false);
      expect(isCanonicalOutcomeEvidencePath(canonical, ORG_A, APP_B)).toBe(false);
      expect(
        isCanonicalOutcomeEvidencePath(
          `tenants/${ORG_A}/applications/${APP_1}/outcomes/../escape.pdf`,
          ORG_A,
          APP_1
        )
      ).toBe(false);
    });
  });
});

describe("Phase 6C — Action Surface Forensics", () => {
  const actionsSrc = readFileSync(
    join(ROOT, "src/lib/application/outcome-actions.ts"),
    "utf8"
  );
  const serviceSrc = readFileSync(
    join(ROOT, "src/lib/application/outcome-service.ts"),
    "utf8"
  );

  it("verify/void/create staff paths require employee/admin", () => {
    expect(actionsSrc).toMatch(
      /export async function verifyOutcomeAction[\s\S]*?requireEmployeeOrAdmin/
    );
    expect(actionsSrc).toMatch(
      /export async function voidOutcomeAction[\s\S]*?requireEmployeeOrAdmin/
    );
    expect(actionsSrc).toMatch(
      /export async function createStaffOutcomeAction[\s\S]*?requireEmployeeOrAdmin/
    );
  });

  it("candidate report action rejects non-candidates", () => {
    expect(actionsSrc).toContain('ctx.role !== "CANDIDATE"');
    expect(actionsSrc).toContain("Only candidates may report outcomes");
  });

  it("does not trust client organizationId for mutations", () => {
    expect(actionsSrc).not.toMatch(
      /organizationId:\s*(parsed|raw|input)\.data\.organizationId/
    );
    expect(serviceSrc).toContain("organizationId: ctx.organizationId");
  });

  it("evidence download enforces shareable for candidates", () => {
    expect(actionsSrc).toContain("!event.evidenceShareable");
    expect(actionsSrc).toContain("Evidence is not shareable");
  });

  it("never logs signed URLs or full private storage paths in audit details", () => {
    const auditBlocks = actionsSrc.match(
      /logUserAuditEvent\(\{[\s\S]*?\}\);/g
    );
    expect(auditBlocks?.length).toBeGreaterThan(0);
    for (const block of auditBlocks ?? []) {
      expect(block).not.toContain("signedUrl");
      expect(block).not.toMatch(/details:\s*\{[^}]*storagePath\s*:/);
    }
    expect(actionsSrc).toContain("pathFingerprint");
    expect(actionsSrc).toContain("never log signed URLs");
  });
});

describe("Phase 6C — UI Contract Forensics", () => {
  it("candidate UI uses O1 labels and never exposes provenance enums as labels", () => {
    const ui = readFileSync(
      join(ROOT, "src/components/application/CandidateOutcomesPanel.tsx"),
      "utf8"
    );
    expect(ui).toContain("CANDIDATE_OUTCOME_LABELS");
    expect(ui).not.toContain("EMPLOYEE_RECORDED");
    expect(ui).not.toContain("STAFF_VERIFIED");
    expect(ui).not.toContain("IMPORTED");
  });

  it("staff UI presents Outcomes panel without confirmation checkbox for O4", () => {
    const ui = readFileSync(
      join(ROOT, "src/components/application/StaffOutcomesPanel.tsx"),
      "utf8"
    );
    expect(ui).toContain("Record outcome");
    expect(ui).not.toMatch(/confirm.*reject|rejection.*confirm/i);
    expect(ui).toContain("atomically set Application status");
  });
});

describe("Phase 6C — Action Auth Integration (Mocked)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("candidate cannot call verifyOutcomeAction", async () => {
    vi.doMock("@/lib/auth/context", () => ({
      getAuthenticatedContext: vi.fn().mockResolvedValue({
        userId: CAND_A,
        organizationId: ORG_A,
        role: "CANDIDATE",
        email: "a@t.com",
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      }),
      requireEmployeeOrAdmin: vi.fn(() => {
        throw new AuthorizationError("Staff access required");
      }),
    }));
    vi.doMock("@/lib/db/rls", () => ({
      withRlsContext: vi.fn(),
    }));
    vi.doMock("@/lib/audit", () => ({ logUserAuditEvent: vi.fn() }));

    const { verifyOutcomeAction } = await import(
      "@/lib/application/outcome-actions"
    );
    await expect(
      verifyOutcomeAction({ outcomeId: APP_1 })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("candidate report action rejects staff role", async () => {
    vi.doMock("@/lib/auth/context", () => ({
      getAuthenticatedContext: vi.fn().mockResolvedValue({
        userId: USER_EMP,
        organizationId: ORG_A,
        role: "EMPLOYEE",
        email: "s@t.com",
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      }),
      requireEmployeeOrAdmin: vi.fn(),
    }));
    vi.doMock("@/lib/db/rls", () => ({ withRlsContext: vi.fn() }));
    vi.doMock("@/lib/audit", () => ({ logUserAuditEvent: vi.fn() }));

    const { reportCandidateOutcomeAction } = await import(
      "@/lib/application/outcome-actions"
    );
    await expect(
      reportCandidateOutcomeAction({
        applicationId: APP_1,
        outcomeType: "RECRUITER_CONTACT",
      })
    ).rejects.toThrow(/Only candidates/i);
  });
});
