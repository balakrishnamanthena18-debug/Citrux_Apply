/**
 * Phase 5C.2 — Candidate Job Detail & Decision Continuity.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { AuthorizationError } from "@/lib/errors";
import {
  __detailTestUtils,
  groupQualificationByDimension,
} from "@/lib/job-matching";
import { emptyReasonCopy } from "@/lib/job-matching/feed-ui";
import type { CandidateJobFeedItem } from "@/lib/job-matching/feed-types";
import type { CandidateJobMatchDetail } from "@/lib/job-matching/detail-types";
import { CandidateJobMatchCard } from "@/components/candidate/CandidateJobMatchCard";
import { CandidateJobMatchDetailDrawer } from "@/components/candidate/CandidateJobMatchDetailDrawer";

const ROOT = join(__dirname, "../../..");

const MATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MATCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const JOB_G = "44444444-4444-4444-8444-444444444444";
const ORG = "11111111-1111-4111-8111-111111111111";
const CAND_A = "22222222-2222-4222-8222-222222222222";
const CAND_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "66666666-6666-4666-8666-666666666666";
const USER_B = "77777777-7777-4777-8777-777777777777";

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function feedItem(
  overrides: Partial<CandidateJobFeedItem> = {}
): CandidateJobFeedItem {
  return {
    matchId: MATCH_A,
    job: {
      id: JOB_G,
      title: "Senior Software Engineer",
      companyName: "Gate13",
      location: "Hyderabad",
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
      whyThisJobMayFit: "Your TypeScript experience aligns with this role.",
      strengths: [{ title: "TypeScript", message: "Supported." }],
      thingsToCheck: [{ title: "Clearance", message: "Confirm if needed." }],
      preferences: [
        {
          title: "Work arrangement",
          message: "Work arrangement matches your preference.",
          tone: "ok",
        },
      ],
    },
    state: {
      saved: false,
      dismissed: false,
      applicationRequested: false,
      opportunityId: null,
    },
    ...overrides,
  };
}

function detailDto(
  overrides: Partial<CandidateJobMatchDetail> = {}
): CandidateJobMatchDetail {
  const base = feedItem();
  return {
    matchId: base.matchId,
    job: {
      ...base.job,
      jobDescription: "REQUIRED:\n- TypeScript\n\nPREFERRED:\n- AWS",
      externalUrl: "https://example.com/jobs/123",
      sourceLabel: "LinkedIn",
    },
    match: {
      ...base.match,
      qualificationSummary: [
        {
          dimension: "SKILLS",
          dimensionLabel: "Skills",
          outcome: "MATCH",
          label: "TypeScript",
        },
        {
          dimension: "EXPERIENCE",
          dimensionLabel: "Experience",
          outcome: "PARTIAL",
          label: "5+ years",
        },
      ],
    },
    state: base.state,
    continuity: null,
    ...overrides,
  };
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

function matchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MATCH_A,
    status: "SUCCEEDED",
    freshness: "CURRENT",
    category: "STRONG_MATCH",
    presentation: {
      why: "Fit reason",
      strengths: [{ title: "TypeScript", message: "ok" }],
      thingsToCheck: [],
      preferences: [],
    },
    qualificationSummary: [
      { dimension: "SKILLS", outcome: "MATCH", label: "TypeScript" },
    ],
    evaluatedAt: new Date("2026-10-01T00:00:00.000Z"),
    savedAt: null,
    dismissedAt: null,
    applicationRequestedAt: null,
    opportunityId: null,
    job: {
      id: JOB_G,
      title: "Senior Software Engineer",
      companyName: "Gate13",
      location: "Remote",
      isRemote: true,
      employmentType: "FULL_TIME",
      salaryMin: 100000,
      salaryMax: 140000,
      salaryCurrency: "USD",
      status: "OPEN",
      visibility: "GLOBAL",
      ownerCandidateId: null,
      jobDescription: "Full JD text here.",
      externalUrl: "https://jobs.example.com/role",
      source: "Indeed",
      applications: [],
    },
    opportunity: null,
    ...overrides,
  };
}

describe("Phase 5C.2 — detail DTO scrubbing helpers", () => {
  it("parses scrubbed qualificationSummary and drops unknown/junk", () => {
    const parsed = __detailTestUtils.parseSafeQualificationSummary([
      { dimension: "SKILLS", outcome: "MATCH", label: "Go" },
      { dimension: "HACK", outcome: "MATCH", label: "nope" },
      { dimension: "SKILLS", outcome: "MATCH", label: "" },
      { secret: true },
      "x",
    ]);
    expect(parsed).toEqual([
      {
        dimension: "SKILLS",
        dimensionLabel: "Skills",
        outcome: "MATCH",
        label: "Go",
      },
    ]);
  });

  it("groups qualifications by dimension without inventing empty groups", () => {
    const groups = groupQualificationByDimension([
      {
        dimension: "EDUCATION",
        dimensionLabel: "Education",
        outcome: "MATCH",
        label: "BS CS",
      },
      {
        dimension: "SKILLS",
        dimensionLabel: "Skills",
        outcome: "MATCH",
        label: "Rust",
      },
    ]);
    expect(groups.map((g) => g.dimension)).toEqual(["SKILLS", "EDUCATION"]);
    expect(groups.find((g) => g.dimension === "CERTIFICATIONS")).toBeUndefined();
  });

  it("sanitizes external URLs", () => {
    expect(__detailTestUtils.sanitizeExternalUrl("https://x.com")).toBe(
      "https://x.com"
    );
    expect(__detailTestUtils.sanitizeExternalUrl("javascript:alert(1)")).toBe(
      null
    );
    expect(__detailTestUtils.sanitizeExternalUrl(null)).toBe(null);
  });
});

describe("Phase 5C.2 — getCandidateJobMatchDetail security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedContext.mockResolvedValue(baseCtx());
    requireCandidate.mockImplementation((ctx) => ctx);
  });

  it("derives identity from session and returns candidate-safe detail", async () => {
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_A, organizationId: ORG }),
        },
        candidateJobMatch: {
          findFirst: vi.fn().mockResolvedValue(matchRow()),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateJobMatchDetail(MATCH_A);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.job.jobDescription).toBe("Full JD text here.");
    expect(result.data.job.externalUrl).toBe("https://jobs.example.com/role");
    expect(result.data.job.sourceLabel).toBe("Indeed");
    expect(result.data.match.qualificationSummary[0]?.label).toBe("TypeScript");
    const json = JSON.stringify(result.data);
    expect(json).not.toContain("sourceDataVersion");
    expect(json).not.toContain("idempotencyKey");
    expect(json).not.toContain("leaseExpiresAt");
    expect(json).not.toContain("attemptCount");
    expect(json).not.toContain("qualificationNotes");
    expect(json).not.toContain("evidenceRefs");
  });

  it("denies Candidate B accessing Candidate A match", async () => {
    getAuthenticatedContext.mockResolvedValue(baseCtx({ userId: USER_B }));
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_B, organizationId: ORG }),
        },
        candidateJobMatch: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateJobMatchDetail(MATCH_A);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("NOT_FOUND");
  });

  it("denies private job owned by another candidate", async () => {
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_A, organizationId: ORG }),
        },
        candidateJobMatch: {
          findFirst: vi.fn().mockResolvedValue(
            matchRow({
              job: {
                ...matchRow().job,
                visibility: "CANDIDATE_PRIVATE",
                ownerCandidateId: CAND_B,
              },
            })
          ),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateJobMatchDetail(MATCH_A);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("NOT_FOUND");
  });

  it("returns closed human message when job is closed", async () => {
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_A, organizationId: ORG }),
        },
        candidateJobMatch: {
          findFirst: vi.fn().mockResolvedValue(
            matchRow({
              job: { ...matchRow().job, status: "CLOSED" },
            })
          ),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateJobMatchDetail(MATCH_A);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("CLOSED");
    expect(result.error).toMatch(/no longer available/i);
  });

  it("returns stale human message when freshness is not current", async () => {
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_A, organizationId: ORG }),
        },
        candidateJobMatch: {
          findFirst: vi.fn().mockResolvedValue(
            matchRow({ freshness: "STALE", status: "STALE" })
          ),
        },
      };
      return fn(tx);
    });

    const result = await getCandidateJobMatchDetail(MATCH_A);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("STALE");
    expect(result.error).toMatch(/no longer current/i);
  });

  it("returns unauthorized when auth context fails", async () => {
    getAuthenticatedContext.mockRejectedValue(
      new AuthorizationError("User is not authenticated")
    );
    const result = await getCandidateJobMatchDetail(MATCH_A);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it("omits externalUrl when absent or invalid", async () => {
    withRlsContext.mockImplementation(async (_userId, fn) => {
      const tx = {
        candidate: {
          findFirst: vi.fn().mockResolvedValue({ id: CAND_A, organizationId: ORG }),
        },
        candidateJobMatch: {
          findFirst: vi.fn().mockResolvedValue(
            matchRow({
              job: { ...matchRow().job, externalUrl: "not-a-url", source: null },
            })
          ),
        },
      };
      return fn(tx);
    });
    const result = await getCandidateJobMatchDetail(MATCH_A);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.job.externalUrl).toBeNull();
    expect(result.data.job.sourceLabel).toBeNull();
  });
});

describe("Phase 5C.2 — UI detail / filters / wording", () => {
  it("feed card does not include JD or original posting", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchCard, {
        item: feedItem(),
        onViewDetails: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).not.toContain("Full JD");
    expect(html).not.toContain("View original posting");
    expect(html).not.toContain("About the role");
  });

  it("detail drawer shows JD, external posting, and role looks-for", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchDetailDrawer, {
        open: true,
        item: feedItem(),
        detail: detailDto(),
        onClose: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain("About the role");
    expect(html).toContain("REQUIRED:");
    expect(html).toContain("View original posting");
    expect(html).toContain("What this role looks for");
    expect(html).toContain("Skills");
    expect(html).toContain("TypeScript");
    expect(html).toContain("Your decision");
    expect(html).not.toContain("sourceDataVersion");
    expect(html).not.toContain("idempotencyKey");
  });

  it("detail omits original posting button when URL absent", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchDetailDrawer, {
        open: true,
        item: feedItem(),
        detail: detailDto({
          job: {
            ...detailDto().job,
            externalUrl: null,
          },
        }),
        onClose: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).not.toContain("View original posting");
  });

  it("requested state shows queued-for-team copy", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchDetailDrawer, {
        open: true,
        item: feedItem({
          state: {
            saved: false,
            dismissed: false,
            applicationRequested: true,
            opportunityId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
          },
        }),
        detail: detailDto({
          state: {
            saved: false,
            dismissed: false,
            applicationRequested: true,
            opportunityId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
          },
        }),
        onClose: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain("Queued for your team");
    expect(html).toContain("Your team has been asked to pursue this opportunity.");
    expect(html).not.toMatch(/Applied|Application submitted/i);
  });

  it("shows unavailable message for stale/closed detail errors", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchDetailDrawer, {
        open: true,
        item: feedItem(),
        detail: null,
        detailError: "This recommendation is no longer current.",
        onClose: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain("This recommendation is no longer current.");
  });

  it("empty copy for Saved and Requested filters", () => {
    expect(emptyReasonCopy(undefined, "SAVED").title).toMatch(/saved/i);
    expect(emptyReasonCopy(undefined, "REQUESTED").title).toMatch(/requested/i);
  });

  it("workbench wires Saved/Requested filters and detail-actions", () => {
    const src = read(
      "src/components/candidate/CandidateJobIntelligenceWorkbench.tsx"
    );
    expect(src).toMatch(/SAVED/);
    expect(src).toMatch(/REQUESTED/);
    expect(src).toMatch(/saved:\s*true/);
    expect(src).toMatch(/applicationRequested:\s*true/);
    expect(src).toMatch(/getCandidateJobMatchDetail/);
    expect(src).toMatch(/detail-actions/);
    expect(src).not.toMatch(/evaluateCandidateJobMatch/);
  });

  it("page supports filter search params for Saved/Requested history", () => {
    const src = read("src/app/(dashboard)/candidate/jobs/page.tsx");
    expect(src).toMatch(/filter === "SAVED"/);
    expect(src).toMatch(/filter === "REQUESTED"/);
    expect(src).toMatch(/getCandidateDecisionHistory/);
  });

  it("detail select includes JD but not worker/internal fields", () => {
    const select = JSON.stringify(
      __detailTestUtils.buildDetailSelect(CAND_A, ORG)
    );
    expect(select).toContain("jobDescription");
    expect(select).toContain("externalUrl");
    expect(select).toContain("qualificationSummary");
    expect(select).not.toContain("sourceDataVersion");
    expect(select).not.toContain("idempotencyKey");
    expect(select).not.toContain("leaseExpiresAt");
    expect(select).not.toContain("attemptCount");
    expect(select).not.toContain("\"notes\"");
  });

  it("actions still create Opportunity only (no Application.create)", () => {
    const src = read("src/lib/job-matching/actions.ts");
    expect(src).toMatch(/ensureCandidateJobOpportunityForMatch/);
    expect(src).not.toMatch(/application\.create/i);
    expect(src).toMatch(/JOB_APPLICATION_REQUESTED/);
  });

  it("feed FEED_SELECT still omits jobDescription", () => {
    const feed = read("src/lib/job-matching/feed.ts");
    expect(feed).toMatch(/const FEED_SELECT/);
    // jobDescription must not appear in FEED_SELECT block — check nearby select fields
    const idx = feed.indexOf("const FEED_SELECT");
    const block = feed.slice(idx, idx + 800);
    expect(block).not.toContain("jobDescription");
    expect(block).not.toContain("externalUrl");
  });
});

describe("Phase 5C.2 — static architecture constraints", () => {
  it("does not add schema/migration for 5C.2", () => {
    const dirs = readdirSync(join(ROOT, "prisma/migrations"));
    expect(dirs.some((d) => /phase5c2/i.test(d))).toBe(false);
  });

  it("detail path does not call evaluateCandidateJobMatch", () => {
    const src = read("src/lib/job-matching/detail.ts");
    expect(src).not.toMatch(/evaluateCandidateJobMatch/);
    expect(src).not.toMatch(/drainJobMatchWorker/);
  });
});
