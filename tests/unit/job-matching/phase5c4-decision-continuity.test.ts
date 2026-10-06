/**
 * Phase 5C.4 — Candidate Request Continuity & Decision History.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { AuthorizationError } from "@/lib/errors";
import {
  __continuityTestUtils,
  __feedTestUtils,
  deriveDecisionContinuity,
} from "@/lib/job-matching";
import type { CandidateDecisionHistoryItem } from "@/lib/job-matching/continuity-types";
import type { CandidateJobFeedItem } from "@/lib/job-matching/feed-types";
import { CandidateJobMatchCard } from "@/components/candidate/CandidateJobMatchCard";
import { CandidateJobMatchDetailDrawer } from "@/components/candidate/CandidateJobMatchDetailDrawer";

const ROOT = join(__dirname, "../../..");

const MATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MATCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const JOB_G = "44444444-4444-4444-8444-444444444444";
const APP_A = "55555555-5555-4555-8555-555555555555";
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "99999999-9999-4999-8999-999999999999";
const CAND_A = "22222222-2222-4222-8222-222222222222";
const CAND_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "66666666-6666-4666-8666-666666666666";
const USER_B = "77777777-7777-4777-8777-777777777777";
const OPP_A = "88888888-8888-4888-8888-888888888888";

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

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

import {
  getCandidateDecisionHistory,
  getOwnCandidateDecisionContinuity,
} from "@/lib/job-matching/continuity";
import { getCandidateJobMatchDetail } from "@/lib/job-matching/detail";

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

function historyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MATCH_A,
    category: "STRONG_MATCH",
    freshness: "CURRENT",
    evaluatedAt: new Date("2026-10-01T00:00:00.000Z"),
    presentation: {
      why: "Fit",
      strengths: [],
      thingsToCheck: [],
      preferences: [],
    },
    savedAt: new Date("2026-10-02T00:00:00.000Z"),
    dismissedAt: null,
    applicationRequestedAt: null,
    opportunityId: null,
    job: {
      id: JOB_G,
      title: "Senior Software Engineer",
      companyName: "ACME",
      location: "Remote",
      isRemote: true,
      employmentType: "FULL_TIME",
      salaryMin: 120000,
      salaryMax: 160000,
      salaryCurrency: "USD",
      status: "OPEN",
      visibility: "GLOBAL",
      ownerCandidateId: null,
      applications: [],
    },
    opportunity: null,
    ...overrides,
  };
}

function continuityFixture(
  overrides: Partial<NonNullable<ReturnType<typeof deriveDecisionContinuity>>> = {}
) {
  return {
    decisionState: "REQUESTED" as const,
    decisionLabel: "Requested",
    progressLabel: "Queued for your team",
    jobAvailable: true,
    jobAvailabilityLabel: null,
    applicationExists: false,
    applicationId: null,
    applicationHref: null,
    applicationStatusLabel: null,
    applicationUpdatedAt: null,
    savedAt: null,
    requestedAt: "2026-10-03T00:00:00.000Z",
    lastMeaningfulCandidateVisibleEvent: "Queued for your team",
    ...overrides,
  };
}

function feedItem(
  overrides: Partial<CandidateJobFeedItem> = {}
): CandidateJobFeedItem {
  return {
    matchId: MATCH_A,
    job: {
      id: JOB_G,
      title: "Senior Software Engineer",
      companyName: "ACME",
      location: "Remote",
      isRemote: true,
      employmentType: "FULL_TIME",
      salaryMin: 120000,
      salaryMax: 160000,
      salaryCurrency: "USD",
      status: "OPEN",
    },
    match: {
      category: "STRONG_MATCH",
      categoryLabel: "Strong match",
      freshness: "CURRENT",
      evaluatedAt: "2026-10-01T00:00:00.000Z",
      whyThisJobMayFit: "Fit",
      strengths: [],
      thingsToCheck: [],
      preferences: [],
    },
    state: {
      saved: true,
      dismissed: false,
      applicationRequested: true,
      opportunityId: OPP_A,
    },
    continuity: continuityFixture(),
    ...overrides,
  };
}

describe("Phase 5C.4 — deriveDecisionContinuity", () => {
  it("1. Saved state is authoritative", () => {
    const c = deriveDecisionContinuity({
      savedAt: "2026-10-02T00:00:00.000Z",
      applicationRequestedAt: null,
      opportunityId: null,
      opportunityExists: false,
      jobStatus: "OPEN",
      application: null,
    });
    expect(c?.decisionState).toBe("SAVED");
    expect(c?.decisionLabel).toBe("Saved");
    expect(c?.progressLabel).toBe("Saved");
  });

  it("2. Saved history includes closed jobs label", () => {
    const c = deriveDecisionContinuity({
      savedAt: "2026-10-02T00:00:00.000Z",
      applicationRequestedAt: null,
      opportunityId: null,
      opportunityExists: false,
      jobStatus: "CLOSED",
      application: null,
    });
    expect(c?.decisionState).toBe("SAVED");
    expect(c?.jobAvailabilityLabel).toBe("Job no longer available");
    expect(c?.lastMeaningfulCandidateVisibleEvent).toBe(
      "Job no longer available"
    );
  });

  it("3. Requested state is authoritative with opportunity", () => {
    const c = deriveDecisionContinuity({
      savedAt: null,
      applicationRequestedAt: "2026-10-03T00:00:00.000Z",
      opportunityId: OPP_A,
      opportunityExists: true,
      jobStatus: "OPEN",
      application: null,
    });
    expect(c?.decisionState).toBe("REQUESTED");
    expect(c?.progressLabel).toBe("Queued for your team");
    expect(c?.applicationExists).toBe(false);
  });

  it("4. Opportunity alone does NOT produce Application started", () => {
    const c = deriveDecisionContinuity({
      savedAt: null,
      applicationRequestedAt: "2026-10-03T00:00:00.000Z",
      opportunityId: OPP_A,
      opportunityExists: true,
      jobStatus: "OPEN",
      application: null,
    });
    expect(c?.decisionState).toBe("REQUESTED");
    expect(c?.progressLabel).not.toMatch(/Application started/i);
  });

  it("5. Application existence produces Application started", () => {
    const c = deriveDecisionContinuity({
      savedAt: null,
      applicationRequestedAt: "2026-10-03T00:00:00.000Z",
      opportunityId: OPP_A,
      opportunityExists: true,
      jobStatus: "OPEN",
      application: {
        id: APP_A,
        status: "PREPARING",
        updatedAt: "2026-10-04T00:00:00.000Z",
      },
    });
    expect(c?.decisionState).toBe("APPLICATION_STARTED");
    expect(c?.progressLabel).toBe("Application started");
    expect(c?.applicationHref).toBe(`/candidate/applications/${APP_A}`);
  });

  it("6. Submitted status produces submitted state", () => {
    const c = deriveDecisionContinuity({
      savedAt: null,
      applicationRequestedAt: "2026-10-03T00:00:00.000Z",
      opportunityId: OPP_A,
      opportunityExists: true,
      jobStatus: "OPEN",
      application: {
        id: APP_A,
        status: "SUBMITTED",
        updatedAt: "2026-10-05T00:00:00.000Z",
      },
    });
    expect(c?.decisionState).toBe("SUBMITTED");
    expect(c?.progressLabel).toBe("Application submitted");
  });

  it("7. Terminal status uses existing safe label", () => {
    const c = deriveDecisionContinuity({
      savedAt: null,
      applicationRequestedAt: "2026-10-03T00:00:00.000Z",
      opportunityId: OPP_A,
      opportunityExists: true,
      jobStatus: "CLOSED",
      application: {
        id: APP_A,
        status: "REJECTED",
        updatedAt: "2026-10-06T00:00:00.000Z",
      },
    });
    expect(c?.decisionState).toBe("TERMINAL");
    expect(c?.progressLabel).toBe("Application rejected");
    expect(c?.jobAvailabilityLabel).toBe("Job no longer available");
  });

  it("8. Job closed does not erase historical decision", () => {
    const c = deriveDecisionContinuity({
      savedAt: null,
      applicationRequestedAt: "2026-10-03T00:00:00.000Z",
      opportunityId: OPP_A,
      opportunityExists: true,
      jobStatus: "ARCHIVED",
      application: null,
    });
    expect(c?.decisionState).toBe("REQUESTED");
    expect(c?.progressLabel).toBe("Queued for your team");
    expect(c?.jobAvailabilityLabel).toBe("Job no longer available");
  });

  it("9. Application survives job closure in candidate view", () => {
    const c = deriveDecisionContinuity({
      savedAt: null,
      applicationRequestedAt: "2026-10-03T00:00:00.000Z",
      opportunityId: OPP_A,
      opportunityExists: true,
      jobStatus: "CLOSED",
      application: {
        id: APP_A,
        status: "SUBMITTED",
        updatedAt: "2026-10-05T00:00:00.000Z",
      },
    });
    expect(c?.applicationExists).toBe(true);
    expect(c?.applicationHref).toBe(`/candidate/applications/${APP_A}`);
    expect(c?.progressLabel).toBe("Application submitted");
  });

  it("10. Undecided match returns null continuity", () => {
    expect(
      deriveDecisionContinuity({
        savedAt: null,
        applicationRequestedAt: null,
        opportunityId: null,
        opportunityExists: false,
        jobStatus: "OPEN",
        application: null,
      })
    ).toBeNull();
  });
});

describe("Phase 5C.4 — history where / mapper", () => {
  it("Saved history where allows any job status (not OPEN-only)", () => {
    const where = __continuityTestUtils.buildHistoryWhere(ORG, CAND_A, "SAVED");
    expect(where.savedAt).toEqual({ not: null });
    const job = where.job as { is: Record<string, unknown> };
    expect(job.is.status).toBeUndefined();
  });

  it("Requested history where is authoritative on applicationRequestedAt", () => {
    const where = __continuityTestUtils.buildHistoryWhere(
      ORG,
      CAND_A,
      "REQUESTED"
    );
    expect(where.applicationRequestedAt).toEqual({ not: null });
  });

  it("Primary feed still rejects CLOSED jobs", () => {
    const item = __feedTestUtils.toFeedItem(
      historyRow({
        savedAt: new Date(),
        job: { ...historyRow().job, status: "CLOSED", applications: undefined },
      }) as never
    );
    expect(item).toBeNull();
  });

  it("History mapper includes closed saved jobs", () => {
    const item = __continuityTestUtils.toHistoryItem(
      historyRow({
        savedAt: new Date("2026-10-02T00:00:00.000Z"),
        job: { ...historyRow().job, status: "CLOSED" },
      }) as never,
      CAND_A
    );
    expect(item).not.toBeNull();
    expect(item?.job.status).toBe("CLOSED");
    expect(item?.continuity.decisionState).toBe("SAVED");
    expect(item?.continuity.jobAvailabilityLabel).toBe(
      "Job no longer available"
    );
  });

  it("History mapper includes closed requested jobs", () => {
    const item = __continuityTestUtils.toHistoryItem(
      historyRow({
        savedAt: null,
        applicationRequestedAt: new Date("2026-10-03T00:00:00.000Z"),
        opportunityId: OPP_A,
        opportunity: { id: OPP_A },
        job: { ...historyRow().job, status: "CLOSED" },
      }) as never,
      CAND_A
    );
    expect(item?.continuity.decisionState).toBe("REQUESTED");
    expect(item?.continuity.progressLabel).toBe("Queued for your team");
  });

  it("Application join is scoped by candidateId+organizationId", () => {
    const select = JSON.stringify(
      __continuityTestUtils.buildHistorySelect(CAND_A, ORG)
    );
    expect(select).toContain(CAND_A);
    expect(select).toContain(ORG);
    expect(select).not.toContain("notes");
    expect(select).not.toContain("assignedEmployeeId");
    expect(select).not.toContain("sourceDataVersion");
    expect(select).not.toContain("idempotencyKey");
    expect(select).not.toContain("discoveredById");
  });
});

describe("Phase 5C.4 — history read security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedContext.mockResolvedValue(baseCtx());
    requireCandidate.mockImplementation((ctx) => ctx);
  });

  it("13. Candidate A cannot see Candidate B history", async () => {
    getAuthenticatedContext.mockResolvedValue(baseCtx({ userId: USER_B }));
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_B, organizationId: ORG }),
        },
        candidateJobMatch: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            expect(where.candidateId).toBe(CAND_B);
            return [];
          }),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateDecisionHistory({ mode: "SAVED" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toEqual([]);
  });

  it("14. Cross-tenant history denied via session org", async () => {
    getAuthenticatedContext.mockResolvedValue(
      baseCtx({ organizationId: ORG_B })
    );
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({
            id: CAND_A,
            organizationId: ORG_B,
          }),
        },
        candidateJobMatch: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            expect(where.organizationId).toBe(ORG_B);
            return [];
          }),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateDecisionHistory({ mode: "REQUESTED" });
    expect(result.success).toBe(true);
  });

  it("Direct ID manipulation fails safely for continuity", async () => {
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_A, organizationId: ORG }),
        },
        candidateJobMatch: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return fn(tx);
    });
    const result = await getOwnCandidateDecisionContinuity(MATCH_B);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("NOT_FOUND");
  });

  it("History page returns continuity without forbidden fields", async () => {
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_A, organizationId: ORG }),
        },
        candidateJobMatch: {
          findMany: vi.fn().mockResolvedValue([
            historyRow({
              applicationRequestedAt: new Date("2026-10-03T00:00:00.000Z"),
              opportunityId: OPP_A,
              opportunity: { id: OPP_A },
              job: {
                ...historyRow().job,
                applications: [
                  {
                    id: APP_A,
                    status: "PREPARING",
                    updatedAt: new Date("2026-10-04T00:00:00.000Z"),
                  },
                ],
              },
            }),
          ]),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateDecisionHistory({ mode: "REQUESTED" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const item = result.data.items[0] as CandidateDecisionHistoryItem;
    expect(item.continuity.decisionState).toBe("APPLICATION_STARTED");
    expect(item.continuity.applicationHref).toBe(
      `/candidate/applications/${APP_A}`
    );
    const json = JSON.stringify(item);
    expect(json).not.toContain("notes");
    expect(json).not.toContain("assignedEmployee");
    expect(json).not.toContain("sourceDataVersion");
    expect(json).not.toContain("idempotencyKey");
    expect(json).not.toContain("AuditEvent");
    expect(json).not.toContain("failureReason");
  });

  it("22. Pagination cursor is deterministic", () => {
    const encoded = __continuityTestUtils.encodeCursor(20);
    expect(__continuityTestUtils.decodeCursor(encoded)).toBe(20);
    expect(__continuityTestUtils.decodeCursor("junk")).toBe(0);
  });

  it("Unauthorized without candidate context", async () => {
    requireCandidate.mockImplementation(() => {
      throw new AuthorizationError("Candidate required");
    });
    const result = await getCandidateDecisionHistory({ mode: "SAVED" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("UNAUTHORIZED");
  });
});

describe("Phase 5C.4 — detail continuity with closed history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedContext.mockResolvedValue(baseCtx());
    requireCandidate.mockImplementation((ctx) => ctx);
  });

  it("Closed saved job remains readable in detail", async () => {
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_A, organizationId: ORG }),
        },
        candidateJobMatch: {
          findFirst: vi.fn().mockResolvedValue({
            id: MATCH_A,
            status: "SUCCEEDED",
            freshness: "CURRENT",
            category: "STRONG_MATCH",
            presentation: { why: "Fit", strengths: [], thingsToCheck: [], preferences: [] },
            qualificationSummary: [],
            evaluatedAt: new Date("2026-10-01T00:00:00.000Z"),
            savedAt: new Date("2026-10-02T00:00:00.000Z"),
            dismissedAt: null,
            applicationRequestedAt: null,
            opportunityId: null,
            opportunity: null,
            job: {
              id: JOB_G,
              title: "Senior Software Engineer",
              companyName: "ACME",
              location: "Remote",
              isRemote: true,
              employmentType: "FULL_TIME",
              salaryMin: null,
              salaryMax: null,
              salaryCurrency: null,
              status: "CLOSED",
              visibility: "GLOBAL",
              ownerCandidateId: null,
              jobDescription: "JD",
              externalUrl: null,
              source: null,
              applications: [],
            },
          }),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateJobMatchDetail(MATCH_A);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.continuity?.decisionState).toBe("SAVED");
    expect(result.data.continuity?.jobAvailabilityLabel).toBe(
      "Job no longer available"
    );
  });
});

describe("Phase 5C.4 — history card / detail UI", () => {
  it("12. View application link points to existing Application route", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchCard, {
        item: feedItem({
          continuity: continuityFixture({
            decisionState: "APPLICATION_STARTED",
            progressLabel: "Application started",
            applicationExists: true,
            applicationId: APP_A,
            applicationHref: `/candidate/applications/${APP_A}`,
            applicationStatusLabel: "Being prepared",
          }),
        }),
        historyMode: true,
        onViewDetails: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain(`href="/candidate/applications/${APP_A}"`);
    expect(html).toContain("View application");
    expect(html).toContain("Application started");
    expect(html).toContain("REQUESTED");
  });

  it("History card shows job no longer available for closed saved", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchCard, {
        item: feedItem({
          job: { ...feedItem().job, status: "CLOSED" },
          state: {
            saved: true,
            dismissed: false,
            applicationRequested: false,
            opportunityId: null,
          },
          continuity: continuityFixture({
            decisionState: "SAVED",
            decisionLabel: "Saved",
            progressLabel: "Saved",
            jobAvailable: false,
            jobAvailabilityLabel: "Job no longer available",
            applicationExists: false,
            applicationId: null,
            applicationHref: null,
            lastMeaningfulCandidateVisibleEvent: "Job no longer available",
          }),
        }),
        historyMode: true,
        onViewDetails: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain("Job no longer available");
    expect(html).toContain("SAVED");
    expect(html).not.toContain("Request application");
  });

  it("Detail strip shows YOUR DECISION continuity", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchDetailDrawer, {
        open: true,
        item: feedItem(),
        detail: {
          ...feedItem(),
          job: {
            ...feedItem().job,
            jobDescription: "JD",
            externalUrl: null,
            sourceLabel: null,
          },
          match: {
            ...feedItem().match,
            qualificationSummary: [],
          },
          continuity: continuityFixture(),
        },
        onClose: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain("Your decision");
    expect(html).toContain("Queued for your team");
    expect(html).toContain('data-testid="job-match-decision-strip"');
  });

  it("23/24. Mobile-safe continuity copy is text, not color-only", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchCard, {
        item: feedItem(),
        historyMode: true,
        onViewDetails: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toMatch(/aria-label="Your decision:/);
    expect(html).toContain("Queued for your team");
  });
});

describe("Phase 5C.4 — no feature creep / payload forensics", () => {
  it("15–20. Continuity / history sources omit forbidden fields", () => {
    const continuity = read("src/lib/job-matching/continuity.ts");
    expect(continuity).not.toMatch(/application\.create/i);
    expect(continuity).not.toMatch(/stateHistory/);
    expect(continuity).not.toMatch(/internalNote/i);
    expect(continuity).not.toMatch(/auditEvent/i);
    expect(continuity).not.toMatch(/\.notes/);
    expect(continuity).not.toMatch(/evaluateCandidateJobMatch/);
    expect(continuity).not.toMatch(/drainJobMatchWorker/);
    expect(continuity).toMatch(/buildHistorySelect/);
  });

  it("19/20. History UI does not mutate Application", () => {
    const card = read("src/components/candidate/CandidateJobMatchCard.tsx");
    const drawer = read(
      "src/components/candidate/CandidateJobMatchDetailDrawer.tsx"
    );
    expect(card).not.toMatch(/withdraw|cancel request|undismiss/i);
    expect(drawer).not.toMatch(/withdraw|cancel request|undismiss/i);
  });

  it("No schema / migration for 5C.4", () => {
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(migrations.some((m) => /phase5c4|decision.?history/i.test(m))).toBe(
      false
    );
  });

  it("Action Center left unchanged (no architectural coupling)", () => {
    const page = read("src/app/(dashboard)/candidate/page.tsx");
    expect(page).not.toMatch(/getCandidateDecisionHistory/);
    expect(page).not.toMatch(/applicationRequestedAt/);
  });

  it("Workbench uses history read for Saved/Requested", () => {
    const src = read(
      "src/components/candidate/CandidateJobIntelligenceWorkbench.tsx"
    );
    expect(src).toMatch(/getCandidateDecisionHistory/);
    expect(src).toMatch(/historyMode/);
  });

  it("25. Hydration-safe date formatting reused", () => {
    const card = read("src/components/candidate/CandidateJobMatchCard.tsx");
    expect(card).toMatch(/formatApplicationCardDate/);
    expect(card).not.toMatch(/Date\.now\(|toLocaleDateString|Math\.random/);
  });
});

describe("Phase 5C.4 — frozen phase regression markers", () => {
  it("5A.4 matching.v1 contract still present", () => {
    const evaluate = read("src/lib/job-matching/evaluate.ts");
    expect(evaluate).toMatch(/evaluateCandidateJobMatch/);
  });

  it("5A.5 persist security helpers still present", () => {
    const persist = read("src/lib/job-matching/persist.ts");
    expect(persist).toMatch(/assertCandidateActionPatch/);
    expect(persist).toMatch(/getCandidateSafeJobMatch/);
  });

  it("5A.6 worker still present", () => {
    const worker = read("src/lib/job-matching/worker.ts");
    expect(worker).toMatch(/drainJobMatchWorker/);
  });

  it("5A.7 actions still create Opportunity only", () => {
    const actions = read("src/lib/job-matching/actions.ts");
    expect(actions).toMatch(/ensureCandidateJobOpportunityForMatch/);
    expect(actions).not.toMatch(/application\.create/i);
  });

  it("5B.1 primary feed remains OPEN-only", () => {
    const feed = read("src/lib/job-matching/feed.ts");
    expect(feed).toMatch(/status:\s*"OPEN"/);
    expect(feed).toMatch(/toFeedItem/);
  });

  it("5B.2 / 5C.2 UI surfaces still present", () => {
    expect(
      read("src/components/candidate/CandidateJobIntelligenceWorkbench.tsx")
    ).toMatch(/Job Intelligence/);
    expect(
      read("src/components/candidate/CandidateJobMatchDetailDrawer.tsx")
    ).toMatch(/job-match-detail-drawer/);
  });
});
