import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  MATCHING_CONTRACT_VERSION,
  evaluateCandidateJobMatch,
  ensureCandidateJobOpportunityForMatch,
  type MatchCandidateInput,
  type MatchJobInput,
} from "@/lib/job-matching";

const ROOT = join(__dirname, "../../..");

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAND_A = "22222222-2222-4222-8222-222222222222";
const CAND_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "66666666-6666-4666-8666-666666666666";
const USER_B = "77777777-7777-4777-8777-777777777777";
const JOB_G = "44444444-4444-4444-8444-444444444444";
const JOB_P = "55555555-5555-4555-8555-555555555555";
const MATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MATCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const OPP_A = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

const getAuthenticatedContext = vi.fn();
const requireCandidate = vi.fn();
const withRlsContext = vi.fn();
const logUserAuditEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: (...args: unknown[]) => getAuthenticatedContext(...args),
  requireCandidate: (...args: unknown[]) => requireCandidate(...args),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: (...args: unknown[]) => withRlsContext(...args),
}));

vi.mock("@/lib/audit", () => ({
  logUserAuditEvent: (...args: unknown[]) => logUserAuditEvent(...args),
  logSystemAuditEvent: vi.fn(),
}));

import {
  saveCandidateJobMatchAction,
  dismissCandidateJobMatchAction,
  requestCandidateJobApplicationAction,
} from "@/lib/job-matching/actions";
import { AuditAction } from "@/generated/prisma/client";
import { AuthorizationError } from "@/lib/errors";

function baseCtx(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_A,
    email: "a@example.com",
    organizationId: ORG,
    role: "CANDIDATE",
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
    ...overrides,
  };
}

function matchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MATCH_A,
    organizationId: ORG,
    candidateId: CAND_A,
    jobId: JOB_G,
    status: "SUCCEEDED",
    freshness: "CURRENT",
    category: "GOOD_MATCH",
    matchingContractVersion: MATCHING_CONTRACT_VERSION,
    savedAt: null,
    dismissedAt: null,
    dismissReason: null,
    applicationRequestedAt: null,
    opportunityId: null,
    job: {
      id: JOB_G,
      organizationId: ORG,
      status: "OPEN",
      visibility: "GLOBAL",
      ownerCandidateId: null,
    },
    ...overrides,
  };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CAND_A,
    organizationId: ORG,
    status: "ACTIVE",
    ...overrides,
  };
}

type MatchRow = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobId: string;
  status: string;
  freshness: string;
  category: string | null;
  matchingContractVersion: string;
  savedAt: Date | null;
  dismissedAt: Date | null;
  dismissReason: string | null;
  applicationRequestedAt: Date | null;
  opportunityId: string | null;
  job: {
    id: string;
    organizationId: string;
    status: string;
    visibility: string;
    ownerCandidateId: string | null;
  };
};

type Store = {
  match: MatchRow;
  candidate: { id: string; organizationId: string; status: string };
  opportunity: {
    id: string;
    status: string;
    jobId: string;
    organizationId: string;
    candidateId: string;
  } | null;
  applicationsCreated: number;
  updatePayloads: unknown[];
  opportunityCreates: number;
};

function buildTx(store: Store) {
  return {
    candidate: {
      findFirst: vi.fn(async ({ where }: { where: { userId?: string; organizationId?: string } }) => {
        if (where.userId === USER_A && where.organizationId === ORG) {
          return store.candidate;
        }
        return null;
      }),
    },
    candidateJobMatch: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { id: string; organizationId: string; candidateId: string };
        }) => {
          if (
            where.id === store.match.id &&
            where.organizationId === store.match.organizationId &&
            where.candidateId === store.match.candidateId
          ) {
            return store.match;
          }
          return null;
        }
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (where.id !== store.match.id) return { count: 0 };
          if (
            where.applicationRequestedAt === null &&
            store.match.applicationRequestedAt != null
          ) {
            return { count: 0 };
          }
          if (where.opportunityId === null && store.match.opportunityId != null) {
            return { count: 0 };
          }
          store.updatePayloads.push(data);
          for (const banned of [
            "category",
            "presentation",
            "sourceDataVersion",
            "status",
            "freshness",
            "qualificationSummary",
            "leaseExpiresAt",
            "idempotencyKey",
          ]) {
            if (banned in data) {
              throw new Error(`EVAL_FIELD_MUTATION:${banned}`);
            }
          }
          store.match = {
            ...store.match,
            ...data,
            savedAt:
              data.savedAt === undefined
                ? store.match.savedAt
                : (data.savedAt as Date | null),
            dismissedAt:
              data.dismissedAt === undefined
                ? store.match.dismissedAt
                : (data.dismissedAt as Date | null),
            dismissReason:
              data.dismissReason === undefined
                ? store.match.dismissReason
                : (data.dismissReason as string | null),
            applicationRequestedAt:
              data.applicationRequestedAt === undefined
                ? store.match.applicationRequestedAt
                : (data.applicationRequestedAt as Date | null),
            opportunityId:
              data.opportunityId === undefined
                ? store.match.opportunityId
                : (data.opportunityId as string | null),
          };
          return { count: 1 };
        }
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          store.updatePayloads.push(data);
          for (const banned of [
            "category",
            "presentation",
            "sourceDataVersion",
            "status",
            "freshness",
            "qualificationSummary",
            "leaseExpiresAt",
            "idempotencyKey",
          ]) {
            if (banned in data) {
              throw new Error(`EVAL_FIELD_MUTATION:${banned}`);
            }
          }
          store.match = {
            ...store.match,
            ...data,
            id: where.id,
            savedAt:
              data.savedAt === undefined
                ? store.match.savedAt
                : (data.savedAt as Date | null),
            dismissedAt:
              data.dismissedAt === undefined
                ? store.match.dismissedAt
                : (data.dismissedAt as Date | null),
            dismissReason:
              data.dismissReason === undefined
                ? store.match.dismissReason
                : (data.dismissReason as string | null),
            applicationRequestedAt:
              data.applicationRequestedAt === undefined
                ? store.match.applicationRequestedAt
                : (data.applicationRequestedAt as Date | null),
            opportunityId:
              data.opportunityId === undefined
                ? store.match.opportunityId
                : (data.opportunityId as string | null),
          };
          return store.match;
        }
      ),
    },
    candidateJobOpportunity: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { candidateId_jobId: { candidateId: string; jobId: string } };
        }) => {
          if (
            store.opportunity &&
            store.opportunity.candidateId === where.candidateId_jobId.candidateId &&
            store.opportunity.jobId === where.candidateId_jobId.jobId
          ) {
            return store.opportunity;
          }
          return null;
        }
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
            organizationId: string;
            candidateId: string;
            jobId: string;
          };
        }) => {
          if (
            store.opportunity &&
            store.opportunity.id === where.id &&
            store.opportunity.organizationId === where.organizationId &&
            store.opportunity.candidateId === where.candidateId &&
            store.opportunity.jobId === where.jobId
          ) {
            return store.opportunity;
          }
          return null;
        }
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            organizationId: string;
            candidateId: string;
            jobId: string;
            discoveredById: string;
            status: string;
          };
        }) => {
          store.opportunityCreates += 1;
          if (
            store.opportunity &&
            store.opportunity.candidateId === data.candidateId &&
            store.opportunity.jobId === data.jobId
          ) {
            const err = Object.assign(new Error("Unique constraint"), {
              code: "P2002",
            });
            throw err;
          }
          store.opportunity = {
            id: OPP_A,
            status: data.status,
            jobId: data.jobId,
            organizationId: data.organizationId,
            candidateId: data.candidateId,
          };
          return {
            id: store.opportunity.id,
            status: store.opportunity.status,
            jobId: store.opportunity.jobId,
          };
        }
      ),
    },
    application: {
      create: vi.fn(async () => {
        store.applicationsCreated += 1;
        throw new Error("Application must not be created by Request Application");
      }),
    },
  };
}

function wireAuth(store: Store) {
  getAuthenticatedContext.mockResolvedValue(baseCtx());
  requireCandidate.mockImplementation(() => undefined);
  withRlsContext.mockImplementation(
    async (_userId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn(buildTx(store))
  );
}

describe("Phase 5A.7 — SAVE", () => {
  let store: Store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {
      match: matchRow(),
      candidate: candidateRow(),
      opportunity: null,
      applicationsCreated: 0,
      updatePayloads: [],
      opportunityCreates: 0,
    };
    wireAuth(store);
  });

  it("candidate can save own match", async () => {
    const result = await saveCandidateJobMatchAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.savedAt).toBeTruthy();
    expect(result.data.matchId).toBe(MATCH_A);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.JOB_MATCH_SAVED })
    );
  });

  it("save is idempotent", async () => {
    store.match = matchRow({ savedAt: new Date("2026-01-01T00:00:00.000Z") });
    const a = await saveCandidateJobMatchAction({ matchId: MATCH_A });
    const b = await saveCandidateJobMatchAction({ matchId: MATCH_A });
    expect(a.success && b.success).toBe(true);
    expect(store.updatePayloads).toHaveLength(0);
    expect(logUserAuditEvent).not.toHaveBeenCalled();
  });

  it("candidate cannot save another candidate's match", async () => {
    store.match = matchRow({ id: MATCH_B, candidateId: CAND_B });
    // findFirst filters by candidate A — not found
    const result = await saveCandidateJobMatchAction({ matchId: MATCH_B });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("NOT_FOUND");
  });

  it("cross-tenant save denied", async () => {
    getAuthenticatedContext.mockResolvedValue(baseCtx({ organizationId: ORG_B }));
    withRlsContext.mockImplementation(
      async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => {
        const tx = buildTx(store);
        tx.candidate.findFirst = vi.fn(async () => null);
        return fn(tx);
      }
    );
    const result = await saveCandidateJobMatchAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it("save does not modify evaluation fields", async () => {
    await saveCandidateJobMatchAction({ matchId: MATCH_A });
    for (const payload of store.updatePayloads) {
      const keys = Object.keys(payload as object);
      expect(keys.every((k) =>
        ["savedAt", "dismissedAt", "dismissReason"].includes(k)
      )).toBe(true);
    }
  });

  it("save clears dismiss state", async () => {
    store.match = matchRow({
      dismissedAt: new Date("2026-01-02"),
      dismissReason: "NOT_INTERESTED",
    });
    const result = await saveCandidateJobMatchAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dismissedAt).toBeNull();
    expect(result.data.savedAt).toBeTruthy();
  });

  it("stale match save rejected safely", async () => {
    store.match = matchRow({ freshness: "STALE" });
    const result = await saveCandidateJobMatchAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/recommendation is updated/i);
  });
});

describe("Phase 5A.7 — DISMISS", () => {
  let store: Store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {
      match: matchRow(),
      candidate: candidateRow(),
      opportunity: null,
      applicationsCreated: 0,
      updatePayloads: [],
      opportunityCreates: 0,
    };
    wireAuth(store);
  });

  it("candidate can dismiss own match", async () => {
    const result = await dismissCandidateJobMatchAction({
      matchId: MATCH_A,
      reason: "NOT_INTERESTED",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dismissedAt).toBeTruthy();
    expect(result.data.dismissReason).toBe("NOT_INTERESTED");
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.JOB_MATCH_DISMISSED })
    );
  });

  it("dismiss is idempotent", async () => {
    store.match = matchRow({
      dismissedAt: new Date("2026-01-01"),
      dismissReason: "NOT_INTERESTED",
    });
    const result = await dismissCandidateJobMatchAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
    expect(store.updatePayloads).toHaveLength(0);
    expect(logUserAuditEvent).not.toHaveBeenCalled();
  });

  it("candidate cannot dismiss another candidate's match", async () => {
    store.match = matchRow({ id: MATCH_B, candidateId: CAND_B });
    const result = await dismissCandidateJobMatchAction({ matchId: MATCH_B });
    expect(result.success).toBe(false);
  });

  it("cross-tenant dismiss denied", async () => {
    withRlsContext.mockImplementation(
      async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => {
        const tx = buildTx(store);
        tx.candidate.findFirst = vi.fn(async () => null);
        return fn(tx);
      }
    );
    const result = await dismissCandidateJobMatchAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it("dismiss does not modify evaluation fields and preserves savedAt", async () => {
    store.match = matchRow({ savedAt: new Date("2026-01-01") });
    const result = await dismissCandidateJobMatchAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.savedAt).toBeTruthy();
    for (const payload of store.updatePayloads) {
      const keys = Object.keys(payload as object);
      expect(keys.every((k) => ["dismissedAt", "dismissReason"].includes(k))).toBe(
        true
      );
    }
  });
});

describe("Phase 5A.7 — REQUEST APPLICATION", () => {
  let store: Store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {
      match: matchRow(),
      candidate: candidateRow(),
      opportunity: null,
      applicationsCreated: 0,
      updatePayloads: [],
      opportunityCreates: 0,
    };
    wireAuth(store);
  });

  it("creates CandidateJobOpportunity and does NOT create Application", async () => {
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.opportunityId).toBe(OPP_A);
    expect(result.data.opportunity.id).toBe(OPP_A);
    expect(result.data.opportunity.created).toBe(true);
    expect(result.data.applicationRequestedAt).toBeTruthy();
    expect(store.opportunityCreates).toBe(1);
    expect(store.applicationsCreated).toBe(0);
    expect(logUserAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.JOB_APPLICATION_REQUESTED,
        details: expect.objectContaining({ opportunityId: OPP_A }),
      })
    );
  });

  it("repeated request reuses same opportunity", async () => {
    store.opportunity = {
      id: OPP_A,
      status: "ACTIVE",
      jobId: JOB_G,
      organizationId: ORG,
      candidateId: CAND_A,
    };
    store.match = matchRow({
      opportunityId: OPP_A,
      applicationRequestedAt: new Date("2026-01-01"),
    });
    const a = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    const b = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(a.success && b.success).toBe(true);
    expect(store.opportunityCreates).toBe(0);
    expect(logUserAuditEvent).not.toHaveBeenCalled();
  });

  it("concurrent requests create one opportunity (P2002 race)", async () => {
    const results = await Promise.all([
      requestCandidateJobApplicationAction({ matchId: MATCH_A }),
      requestCandidateJobApplicationAction({ matchId: MATCH_A }),
    ]);
    expect(results.every((r) => r.success)).toBe(true);
    const ids = results.map((r) =>
      r.success ? r.data.opportunity.id : null
    );
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(OPP_A);
    // Second create hits unique and reuses — at most one successful insert identity
    expect(store.opportunityCreates).toBeLessThanOrEqual(2);
    expect(store.applicationsCreated).toBe(0);
  });

  it("existing opportunity is reused without Application", async () => {
    store.opportunity = {
      id: OPP_A,
      status: "ACTIVE",
      jobId: JOB_G,
      organizationId: ORG,
      candidateId: CAND_A,
    };
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.opportunity.created).toBe(false);
    expect(result.data.opportunityId).toBe(OPP_A);
    expect(store.opportunityCreates).toBe(0);
  });

  it("candidate cannot request another candidate's match", async () => {
    store.match = matchRow({ id: MATCH_B, candidateId: CAND_B });
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_B });
    expect(result.success).toBe(false);
  });

  it("cross-tenant request denied", async () => {
    withRlsContext.mockImplementation(
      async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => {
        const tx = buildTx(store);
        tx.candidate.findFirst = vi.fn(async () => null);
        return fn(tx);
      }
    );
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
  });

  it("private job owner can request", async () => {
    store.match = matchRow({
      jobId: JOB_P,
      job: {
        id: JOB_P,
        organizationId: ORG,
        status: "OPEN",
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: CAND_A,
      },
    });
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
  });

  it("private job non-owner cannot request", async () => {
    store.match = matchRow({
      jobId: JOB_P,
      job: {
        id: JOB_P,
        organizationId: ORG,
        status: "OPEN",
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: CAND_B,
      },
    });
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it("closed/unusable job rejected", async () => {
    store.match = matchRow({
      job: {
        id: JOB_G,
        organizationId: ORG,
        status: "CLOSED",
        visibility: "GLOBAL",
        ownerCandidateId: null,
      },
    });
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/no longer available/i);
  });

  it("stale match request rejected safely", async () => {
    store.match = matchRow({ freshness: "STALE" });
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/recommendation is updated/i);
  });

  it("RECOMPUTE_REQUIRED request rejected safely", async () => {
    store.match = matchRow({ freshness: "RECOMPUTE_REQUIRED" });
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/recommendation is updated/i);
  });

  it("LOW_MATCH is still requestable without reinterpretation", async () => {
    store.match = matchRow({ category: "LOW_MATCH" });
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.category).toBe("LOW_MATCH");
  });

  it("responses omit raw requirements and worker fields", async () => {
    const result = await requestCandidateJobApplicationAction({ matchId: MATCH_A });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const json = JSON.stringify(result.data);
    expect(json).not.toMatch(/requirements|sourceDataVersion|leaseExpiresAt|idempotencyKey|extractedText/);
  });
});

describe("Phase 5A.7 — security spoof / IDOR", () => {
  it("client candidateId/organizationId/ownerCandidateId are ignored (only matchId accepted)", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/job-matching/actions.ts"),
      "utf8"
    );
    expect(src).toMatch(/MatchIdSchema/);
    expect(src).toMatch(/userId: ctx\.userId/);
    expect(src).toMatch(/organizationId: ctx\.organizationId/);
    // Public action inputs accept matchId only — never client identity fields.
    expect(src).toMatch(
      /export async function saveCandidateJobMatchAction\(\s*input: \{ matchId: string \}/
    );
    expect(src).toMatch(
      /export async function requestCandidateJobApplicationAction\(\s*input: \{ matchId: string \}/
    );
    expect(src).not.toMatch(/parsed\.data\.candidateId/);
    expect(src).not.toMatch(/parsed\.data\.organizationId/);
    expect(src).not.toMatch(/parsed\.data\.ownerCandidateId/);
  });

  it("requireCandidate is enforced", async () => {
    getAuthenticatedContext.mockResolvedValue(baseCtx());
    requireCandidate.mockImplementation(() => {
      throw new AuthorizationError("Candidates only");
    });
    withRlsContext.mockImplementation(async () => {
      throw new Error("should not run");
    });
    const result = await saveCandidateJobMatchAction({ matchId: MATCH_A });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it("ensureCandidateJobOpportunityForMatch is concurrent-safe via P2002", async () => {
    let created = false;
    const tx = {
      candidateJobOpportunity: {
        findUnique: vi.fn(async () => {
          if (!created) return null;
          return {
            id: OPP_A,
            status: "ACTIVE",
            jobId: JOB_G,
            organizationId: ORG,
          };
        }),
        create: vi.fn(async () => {
          if (created) {
            throw Object.assign(new Error("dup"), { code: "P2002" });
          }
          created = true;
          return { id: OPP_A, status: "ACTIVE", jobId: JOB_G };
        }),
      },
    };

    const a = await ensureCandidateJobOpportunityForMatch(tx as never, {
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_G,
      discoveredById: USER_A,
    });
    const b = await ensureCandidateJobOpportunityForMatch(tx as never, {
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_G,
      discoveredById: USER_A,
    });
    expect(a.opportunity.id).toBe(b.opportunity.id);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
  });
});

describe("Phase 5A.7 — migration / RLS / regressions", () => {
  it("adds action audit enums and candidate opportunity self-insert", () => {
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261005170000_phase5a7_candidate_match_actions/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toMatch(/JOB_MATCH_SAVED/);
    expect(mig).toMatch(/JOB_MATCH_DISMISSED/);
    expect(mig).toMatch(/JOB_APPLICATION_REQUESTED/);
    expect(mig).toMatch(/candidate_belongs_to_user/);
    expect(mig).toMatch(/discoveredById/);
    expect(mig).not.toMatch(/job_requirement_sets/);
  });

  it("schema includes new AuditAction values", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/JOB_MATCH_SAVED/);
    expect(schema).toMatch(/JOB_MATCH_DISMISSED/);
    expect(schema).toMatch(/JOB_APPLICATION_REQUESTED/);
  });

  it("never creates Application in action source", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/job-matching/actions.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/application\.create/);
    expect(src).toMatch(/Never creates Application/);
    expect(src).toMatch(/CandidateJobOpportunity/);
  });

  it("Phase 5A.4 evaluateCandidateJobMatch regression", () => {
    const cand: MatchCandidateInput = {
      candidateId: CAND_A,
      organizationId: ORG,
      updatedAt: "2026-01-01T00:00:00.000Z",
      city: "Austin",
      state: "TX",
      country: "US",
      totalYearsExperience: 5,
      workAuthorization: "CITIZEN",
      requiresSponsorship: false,
      remotePreference: "FLEXIBLE",
      targetLocations: [],
      targetRoles: [],
      desiredSalaryMin: null,
      desiredSalaryMax: null,
      salaryCurrency: "USD",
      skills: [{ id: randomUUID(), name: "TypeScript" }],
      experiences: [],
      educations: [],
      certifications: [],
      projects: [],
    };
    const job: MatchJobInput = {
      jobId: JOB_G,
      organizationId: ORG,
      title: "Engineer",
      companyName: "Acme",
      location: "Remote",
      isRemote: true,
      employmentType: "FULL_TIME",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "USD",
      status: "OPEN",
      visibility: "GLOBAL",
      ownerCandidateId: null,
    };
    const a = evaluateCandidateJobMatch({
      candidate: cand,
      job,
      requirementSet: null,
      asOf: new Date("2026-10-05T00:00:00.000Z"),
    });
    const b = evaluateCandidateJobMatch({
      candidate: cand,
      job,
      requirementSet: null,
      asOf: new Date("2026-10-05T00:00:00.000Z"),
    });
    expect(a.category).toBe(b.category);
    expect(a.matchingContractVersion).toBe(MATCHING_CONTRACT_VERSION);
  });

  it("Phase 5A.5 / 5A.6 contracts remain", () => {
    const persist = readFileSync(
      join(ROOT, "src/lib/job-matching/persist.ts"),
      "utf8"
    );
    expect(persist).toMatch(/updateOwnCandidateJobMatchActions/);
    expect(persist).toMatch(/CANDIDATE_ACTION_FIELDS/);
    const worker = readFileSync(
      join(ROOT, "src/lib/job-matching/worker.ts"),
      "utf8"
    );
    expect(worker).toMatch(/claimNextJobMatch/);
    expect(worker).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it("Phase 2 opportunity ensure path still exists for staff Application creation", () => {
    const appActions = readFileSync(
      join(ROOT, "src/lib/application/actions.ts"),
      "utf8"
    );
    expect(appActions).toMatch(/ensureCandidateJobOpportunity/);
    expect(appActions).toMatch(/application\.create/);
  });
});
