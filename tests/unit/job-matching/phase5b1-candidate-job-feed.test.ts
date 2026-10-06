import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  MATCHING_CONTRACT_VERSION,
  CANDIDATE_JOB_FEED_CATEGORIES,
  CANDIDATE_JOB_FEED_DEFAULT_PAGE_SIZE,
  CANDIDATE_JOB_FEED_MAX_PAGE_SIZE,
  evaluateCandidateJobMatch,
  feedCategoryPriority,
  isCandidateJobFeedCategory,
  __feedTestUtils,
  type MatchCandidateInput,
  type MatchJobInput,
} from "@/lib/job-matching";

const ROOT = join(__dirname, "../../..");

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAND_A = "22222222-2222-4222-8222-222222222222";
const CAND_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "66666666-6666-4666-8666-666666666666";
const JOB_G = "44444444-4444-4444-8444-444444444444";
const JOB_P = "55555555-5555-4555-8555-555555555555";
const MATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MATCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

const getAuthenticatedContext = vi.fn();
const requireCandidate = vi.fn();
const withRlsContext = vi.fn();

vi.mock("@/lib/auth/context", () => ({
  getAuthenticatedContext: (...args: unknown[]) => getAuthenticatedContext(...args),
  requireCandidate: (...args: unknown[]) => requireCandidate(...args),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: (...args: unknown[]) => withRlsContext(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), security: vi.fn() },
}));

import {
  getCandidateJobFeed,
  getOwnCandidateJobFeedItem,
} from "@/lib/job-matching/feed";
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

function feedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MATCH_A,
    category: "GOOD_MATCH" as const,
    freshness: "CURRENT" as const,
    evaluatedAt: new Date("2026-10-01T00:00:00.000Z"),
    presentation: {
      why: "Your experience with TypeScript aligns with an important requirement for this role.",
      strengths: [{ title: "TypeScript", message: "Your profile supports TypeScript." }],
      thingsToCheck: [] as Array<{ title: string; message: string }>,
      preferences: [
        {
          title: "Work arrangement",
          message: "Work arrangement matches your preference.",
          tone: "ok" as const,
        },
      ],
      categoryLabel: "Good match",
    },
    savedAt: null as Date | null,
    dismissedAt: null as Date | null,
    applicationRequestedAt: null as Date | null,
    opportunityId: null as string | null,
    job: {
      id: JOB_G,
      title: "Platform Engineer",
      companyName: "Gate13",
      location: "Remote - US",
      isRemote: true,
      employmentType: "FULL_TIME",
      salaryMin: 130000,
      salaryMax: 170000,
      salaryCurrency: "USD",
      status: "OPEN" as const,
      visibility: "GLOBAL" as const,
      ownerCandidateId: null as string | null,
    },
    ...overrides,
  };
}

type FeedRow = {
  id: string;
  category: string;
  freshness: string;
  evaluatedAt: Date;
  presentation: unknown;
  savedAt: Date | null;
  dismissedAt: Date | null;
  applicationRequestedAt: Date | null;
  opportunityId: string | null;
  job: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    isRemote: boolean;
    employmentType: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    status: string;
    visibility: string;
    ownerCandidateId: string | null;
  };
};

type Store = {
  candidateId: string;
  organizationId: string;
  rows: FeedRow[];
  preparingCount: number;
  dismissedCount: number;
  findManyCalls: unknown[];
  findFirstCalls: unknown[];
};

function buildTx(store: Store) {
  return {
    candidate: {
      findFirst: vi.fn(async ({ where }: { where: { userId?: string; organizationId?: string } }) => {
        if (where.userId === USER_A && where.organizationId === store.organizationId) {
          return { id: store.candidateId, organizationId: store.organizationId };
        }
        return null;
      }),
    },
    candidateJobMatch: {
      findMany: vi.fn(async (args: {
        where: Record<string, unknown>;
        skip?: number;
        take?: number;
        orderBy?: unknown;
        select?: unknown;
      }) => {
        store.findManyCalls.push(args);
        // Apply key filters from where for test realism
        let rows = [...store.rows];
        const where = args.where;

        if (where.candidateId && where.candidateId !== store.candidateId) {
          rows = [];
        }
        if (where.organizationId && where.organizationId !== store.organizationId) {
          rows = [];
        }
        if (where.status === "SUCCEEDED") {
          // rows are succeeded by fixture
        }
        if (where.freshness === "CURRENT") {
          rows = rows.filter((r) => r.freshness === "CURRENT");
        }
        if (where.dismissedAt === null) {
          rows = rows.filter((r) => r.dismissedAt == null);
        }
        if (where.category && typeof where.category === "object" && where.category !== null) {
          const cat = where.category as { in?: string[] };
          if (cat.in) rows = rows.filter((r) => cat.in!.includes(String(r.category)));
        }
        if (where.savedAt && typeof where.savedAt === "object") {
          const s = where.savedAt as { not?: null };
          if (s.not === null) rows = rows.filter((r) => r.savedAt != null);
        }
        if (where.applicationRequestedAt && typeof where.applicationRequestedAt === "object") {
          const a = where.applicationRequestedAt as { not?: null };
          if (a.not === null) rows = rows.filter((r) => r.applicationRequestedAt != null);
        }
        if (where.job && typeof where.job === "object") {
          const jobIs = (where.job as { is?: Record<string, unknown> }).is;
          if (jobIs?.status === "OPEN") {
            rows = rows.filter((r) => r.job.status === "OPEN");
          }
          if (typeof jobIs?.isRemote === "boolean") {
            rows = rows.filter((r) => r.job.isRemote === jobIs.isRemote);
          }
          if (jobIs?.OR && Array.isArray(jobIs.OR)) {
            rows = rows.filter((r) => {
              if (r.job.visibility === "GLOBAL") return true;
              return (
                r.job.visibility === "CANDIDATE_PRIVATE" &&
                r.job.ownerCandidateId === store.candidateId
              );
            });
          }
        }

        // Sort like DB: category asc, evaluatedAt desc, id desc
        rows.sort((a, b) => {
          const ca = feedCategoryPriority(String(a.category));
          const cb = feedCategoryPriority(String(b.category));
          if (ca !== cb) return ca - cb;
          const ea = a.evaluatedAt instanceof Date ? a.evaluatedAt.getTime() : 0;
          const eb = b.evaluatedAt instanceof Date ? b.evaluatedAt.getTime() : 0;
          if (ea !== eb) return eb - ea;
          return String(b.id).localeCompare(String(a.id));
        });

        const skip = args.skip ?? 0;
        const take = args.take ?? rows.length;
        return rows.slice(skip, skip + take);
      }),
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        store.findFirstCalls.push(args);
        const where = args.where;
        if (where.candidateId !== store.candidateId) return null;
        if (where.organizationId !== store.organizationId) return null;
        const row = store.rows.find((r) => r.id === where.id);
        if (!row) return null;
        if (where.dismissedAt === null && row.dismissedAt != null) return null;
        if (where.freshness === "CURRENT" && row.freshness !== "CURRENT") return null;
        if (row.job.visibility === "CANDIDATE_PRIVATE" && row.job.ownerCandidateId !== store.candidateId) {
          return null;
        }
        return row;
      }),
      count: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const status = args.where.status;
        if (status && typeof status === "object" && status !== null && "in" in status) {
          return store.preparingCount;
        }
        if (args.where.dismissedAt && typeof args.where.dismissedAt === "object") {
          return store.dismissedCount;
        }
        return 0;
      }),
    },
  };
}

function wire(store: Store) {
  getAuthenticatedContext.mockResolvedValue(
    baseCtx({ organizationId: store.organizationId })
  );
  requireCandidate.mockImplementation(() => undefined);
  withRlsContext.mockImplementation(
    async (_uid: string, fn: (tx: unknown) => Promise<unknown>) => fn(buildTx(store))
  );
}

describe("Phase 5B.1 — feed contract types", () => {
  it("defines primary categories excluding LOW_MATCH", () => {
    expect(CANDIDATE_JOB_FEED_CATEGORIES).toEqual([
      "STRONG_MATCH",
      "GOOD_MATCH",
      "POSSIBLE_MATCH",
      "NEEDS_REVIEW",
    ]);
    expect(isCandidateJobFeedCategory("LOW_MATCH")).toBe(false);
    expect(isCandidateJobFeedCategory("GOOD_MATCH")).toBe(true);
  });

  it("bounds page size 20 default / 50 max", () => {
    expect(CANDIDATE_JOB_FEED_DEFAULT_PAGE_SIZE).toBe(20);
    expect(CANDIDATE_JOB_FEED_MAX_PAGE_SIZE).toBe(50);
  });

  it("category priority is deterministic without numerical scores", () => {
    expect(feedCategoryPriority("STRONG_MATCH")).toBeLessThan(
      feedCategoryPriority("GOOD_MATCH")
    );
    expect(feedCategoryPriority("GOOD_MATCH")).toBeLessThan(
      feedCategoryPriority("POSSIBLE_MATCH")
    );
    expect(feedCategoryPriority("POSSIBLE_MATCH")).toBeLessThan(
      feedCategoryPriority("NEEDS_REVIEW")
    );
  });
});

describe("Phase 5B.1 — projection / forbidden fields", () => {
  it("maps persisted presentation without regenerating matching", () => {
    const item = __feedTestUtils.toFeedItem(feedRow() as never);
    expect(item?.match.whyThisJobMayFit).toMatch(/TypeScript/);
    expect(item?.match.strengths[0]?.title).toBe("TypeScript");
    expect(item?.job.title).toBe("Platform Engineer");
    expect(item?.state.saved).toBe(false);
  });

  it("excludes LOW_MATCH / STALE / closed from projection", () => {
    expect(
      __feedTestUtils.toFeedItem(feedRow({ category: "LOW_MATCH" }) as never)
    ).toBeNull();
    expect(
      __feedTestUtils.toFeedItem(feedRow({ freshness: "STALE" }) as never)
    ).toBeNull();
    expect(
      __feedTestUtils.toFeedItem(
        feedRow({ job: { ...feedRow().job, status: "CLOSED" } }) as never
      )
    ).toBeNull();
  });

  it("feed select omits worker/eval internals and requirements", () => {
    const select = __feedTestUtils.FEED_SELECT as Record<string, unknown>;
    const keys = Object.keys(select);
    expect(keys).not.toContain("idempotencyKey");
    expect(keys).not.toContain("leaseExpiresAt");
    expect(keys).not.toContain("sourceDataVersion");
    expect(keys).not.toContain("attemptCount");
    expect(keys).not.toContain("qualificationSummary");
    expect(keys).not.toContain("errorMessage");
    expect(JSON.stringify(select)).not.toMatch(/requirements|sourceText|extractedText/);
  });

  it("primary where excludes dismissed, requires SUCCEEDED+CURRENT+OPEN visibility", () => {
    const where = __feedTestUtils.buildPrimaryFeedWhere(ORG, CAND_A, {});
    expect(where.status).toBe("SUCCEEDED");
    expect(where.freshness).toBe("CURRENT");
    expect(where.dismissedAt).toBeNull();
    expect(where.candidateId).toBe(CAND_A);
    expect(where.organizationId).toBe(ORG);
    expect(where.category).toEqual({ in: [...CANDIDATE_JOB_FEED_CATEGORIES] });
    const jobIs = (where.job as { is: Record<string, unknown> }).is;
    expect(jobIs.status).toBe("OPEN");
    expect(jobIs.OR).toEqual([
      { visibility: "GLOBAL" },
      { visibility: "CANDIDATE_PRIVATE", ownerCandidateId: CAND_A },
    ]);
  });
});

describe("Phase 5B.1 — getCandidateJobFeed security & eligibility", () => {
  let store: Store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {
      candidateId: CAND_A,
      organizationId: ORG,
      rows: [feedRow()],
      preparingCount: 0,
      dismissedCount: 0,
      findManyCalls: [],
      findFirstCalls: [],
    };
    wire(store);
  });

  it("candidate sees own GLOBAL matches", async () => {
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.state).toBe("LOADED");
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.job.id).toBe(JOB_G);
  });

  it("candidate sees own PRIVATE matches", async () => {
    store.rows = [
      feedRow({
        id: MATCH_A,
        job: {
          ...feedRow().job,
          id: JOB_P,
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: CAND_A,
        },
      }),
    ];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items[0]?.job.id).toBe(JOB_P);
  });

  it("candidate cannot see another candidate's PRIVATE match", async () => {
    store.rows = [
      feedRow({
        job: {
          ...feedRow().job,
          id: JOB_P,
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: CAND_B,
        },
      }),
    ];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(0);
  });

  it("direct match-ID IDOR denied for another candidate's match", async () => {
    store.rows = []; // no owned rows
    const denied = await getOwnCandidateJobFeedItem(MATCH_B);
    expect(denied.success).toBe(false);
    if (denied.success) return;
    expect(denied.code).toBe("NOT_FOUND");
  });

  it("direct match-ID succeeds for own eligible match", async () => {
    store.rows = [feedRow({ id: MATCH_A })];
    const ok = await getOwnCandidateJobFeedItem(MATCH_A);
    expect(ok.success).toBe(true);
    if (!ok.success) return;
    expect(ok.data.matchId).toBe(MATCH_A);
  });

  it("cross-tenant feed denied", async () => {
    store.organizationId = ORG_B;
    getAuthenticatedContext.mockResolvedValue(baseCtx({ organizationId: ORG_B }));
    store.rows = [feedRow()]; // org ORG in row but candidate lookup uses ORG_B — candidate found
    // Candidate is in ORG_B; matches filtered by organizationId ORG_B vs row ORG → empty
    store.rows = [feedRow()]; // organizationId filter on where uses candidate.organizationId = ORG_B
    // feedRow doesn't carry match org; mock filters where.organizationId !== store.organizationId
    // store.organizationId is ORG_B, where uses candidate.organizationId ORG_B — rows pass org filter
    // Fix: store rows as belonging to ORG but candidate in ORG_B means where.organizationId=ORG_B and mock clears when mismatch — rows have no org field so we need to clear candidate
    withRlsContext.mockImplementation(
      async (_uid: string, fn: (tx: unknown) => Promise<unknown>) => {
        const tx = buildTx(store);
        tx.candidate.findFirst = vi.fn(async () => null);
        return fn(tx);
      }
    );
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it("staff denied via requireCandidate", async () => {
    requireCandidate.mockImplementation(() => {
      throw new AuthorizationError("Candidates only");
    });
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it("closed Job excluded", async () => {
    store.rows = [
      feedRow({ job: { ...feedRow().job, status: "CLOSED" } }),
    ];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(0);
  });

  it("STALE match excluded", async () => {
    store.rows = [feedRow({ freshness: "STALE" })];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(0);
  });

  it("RECOMPUTE_REQUIRED excluded", async () => {
    store.rows = [feedRow({ freshness: "RECOMPUTE_REQUIRED" })];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(0);
  });

  it("LOW_MATCH excluded from primary feed", async () => {
    store.rows = [feedRow({ category: "LOW_MATCH" })];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(0);
    const where = store.findManyCalls[0] as { where: { category: { in: string[] } } };
    expect(where.where.category.in).not.toContain("LOW_MATCH");
  });

  it("DISMISSED match excluded", async () => {
    store.rows = [feedRow({ dismissedAt: new Date() })];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(0);
  });

  it("SAVED match remains visible", async () => {
    store.rows = [feedRow({ savedAt: new Date() })];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items[0]?.state.saved).toBe(true);
  });

  it("requested-application match remains visible", async () => {
    store.rows = [
      feedRow({
        applicationRequestedAt: new Date(),
        opportunityId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      }),
    ];
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items[0]?.state.applicationRequested).toBe(true);
    expect(result.data.items[0]?.state.opportunityId).toBeTruthy();
  });

  it("payload omits raw requirements, snapshot, worker, idempotency, resume", async () => {
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const json = JSON.stringify(result.data);
    expect(json).not.toMatch(
      /requirements|sourceText|leaseExpiresAt|idempotencyKey|sourceDataVersion|attemptCount|extractedText|qualificationNotes/
    );
    expect(json).not.toContain(CAND_B);
  });

  it("client candidateId/organizationId spoof ignored", () => {
    const src = readFileSync(join(ROOT, "src/lib/job-matching/feed.ts"), "utf8");
    expect(src).toMatch(/organizationId: ctx\.organizationId/);
    expect(src).toMatch(/userId: ctx\.userId/);
    expect(src).not.toMatch(/parsed\.data\.candidateId/);
    expect(src).not.toMatch(/query\.candidateId/);
    expect(src).not.toMatch(/query\.organizationId/);
  });

  it("pagination bounded and deterministic", async () => {
    store.rows = Array.from({ length: 25 }, (_, i) =>
      feedRow({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
        category: i < 5 ? "STRONG_MATCH" : "GOOD_MATCH",
        evaluatedAt: new Date(Date.UTC(2026, 9, 25 - i)),
      })
    );
    const page1 = await getCandidateJobFeed({ pageSize: 20 });
    expect(page1.success).toBe(true);
    if (!page1.success) return;
    expect(page1.data.items).toHaveLength(20);
    expect(page1.data.nextCursor).toBeTruthy();
    expect(page1.data.pageSize).toBe(20);

    const page2 = await getCandidateJobFeed({
      pageSize: 20,
      cursor: page1.data.nextCursor,
    });
    expect(page2.success).toBe(true);
    if (!page2.success) return;
    expect(page2.data.items.length).toBeGreaterThan(0);
    expect(page2.data.items.length).toBeLessThanOrEqual(20);

    // unbounded request clamped
    const clamped = await getCandidateJobFeed({ pageSize: 500 });
    expect(clamped.success).toBe(true);
    if (!clamped.success) return;
    expect(clamped.data.pageSize).toBe(50);

    // STRONG before GOOD
    const cats = page1.data.items.map((i) => i.match.category);
    const firstGood = cats.indexOf("GOOD_MATCH");
    const lastStrong = cats.lastIndexOf("STRONG_MATCH");
    if (firstGood >= 0 && lastStrong >= 0) {
      expect(lastStrong).toBeLessThan(firstGood);
    }
  });

  it("no N+1: single findMany for page (+ bounded empty counts)", async () => {
    store.rows = [];
    store.preparingCount = 1;
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.state).toBe("EMPTY");
    expect(result.data.emptyReason).toBe("PREPARING");
    expect(store.findManyCalls).toHaveLength(1);
  });

  it("empty ALL_DISMISSED when only dismissed recommendations exist", async () => {
    store.rows = [];
    store.preparingCount = 0;
    store.dismissedCount = 1;
    const result = await getCandidateJobFeed();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.emptyReason).toBe("ALL_DISMISSED");
  });

  it("does not call evaluateCandidateJobMatch or worker", () => {
    const src = readFileSync(join(ROOT, "src/lib/job-matching/feed.ts"), "utf8");
    expect(src).not.toMatch(/evaluateCandidateJobMatch/);
    expect(src).not.toMatch(/drainJobMatchWorker|claimNextJobMatch/);
    expect(src).not.toMatch(/application\.create/);
  });

  it("optional filters: remote + saved", async () => {
    store.rows = [
      feedRow({ savedAt: new Date(), job: { ...feedRow().job, isRemote: true } }),
      feedRow({
        id: MATCH_B,
        savedAt: null,
        job: { ...feedRow().job, id: JOB_P, isRemote: false },
      }),
    ];
    const result = await getCandidateJobFeed({
      filters: { remote: true, saved: true },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items.every((i) => i.job.isRemote && i.state.saved)).toBe(
      true
    );
  });
});

describe("Phase 5B.1 — regressions", () => {
  it("Phase 5A.4 matching.v1 unchanged", () => {
    const cand: MatchCandidateInput = {
      candidateId: CAND_A,
      organizationId: ORG,
      updatedAt: "2026-01-01T00:00:00.000Z",
      city: null,
      state: null,
      country: "US",
      totalYearsExperience: 4,
      workAuthorization: "CITIZEN",
      requiresSponsorship: false,
      remotePreference: "FLEXIBLE",
      targetLocations: [],
      targetRoles: [],
      desiredSalaryMin: null,
      desiredSalaryMax: null,
      salaryCurrency: "USD",
      skills: [{ id: randomUUID(), name: "React" }],
      experiences: [],
      educations: [],
      certifications: [],
      projects: [],
    };
    const job: MatchJobInput = {
      jobId: JOB_G,
      organizationId: ORG,
      title: "Eng",
      companyName: "Acme",
      location: null,
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
    expect(a.matchingContractVersion).toBe(MATCHING_CONTRACT_VERSION);
    expect(a.presentation.why).toBeTruthy();
  });

  it("Phase 5A.5–5A.7 modules remain intact", () => {
    expect(
      readFileSync(join(ROOT, "src/lib/job-matching/persist.ts"), "utf8")
    ).toMatch(/upsertCurrentCandidateJobMatch/);
    expect(
      readFileSync(join(ROOT, "src/lib/job-matching/worker.ts"), "utf8")
    ).toMatch(/claimNextJobMatch/);
    expect(
      readFileSync(join(ROOT, "src/lib/job-matching/actions.ts"), "utf8")
    ).toMatch(/requestCandidateJobApplicationAction/);
  });

  it("no schema migration for 5B.1", () => {
    const dirs = readdirSync(join(ROOT, "prisma/migrations"));
    expect(dirs.some((d: string) => /5b1|phase5b1/i.test(d))).toBe(false);
  });

  it("Phase 2 visibility helper still authoritative", () => {
    const vis = readFileSync(join(ROOT, "src/lib/job/visibility.ts"), "utf8");
    expect(vis).toMatch(/assertJobUsableForCandidate/);
    expect(vis).toMatch(/CANDIDATE_PRIVATE/);
  });
});
