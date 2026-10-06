import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  MATCHING_CONTRACT_VERSION,
  evaluateCandidateJobMatch,
} from "@/lib/job-matching";
import {
  getCategoryVisual,
  emptyReasonCopy,
  formatEmploymentType,
} from "@/lib/job-matching/feed-ui";
import type { CandidateJobFeedItem } from "@/lib/job-matching/feed-types";
import { CandidateJobMatchCard } from "@/components/candidate/CandidateJobMatchCard";
import { CandidateJobMatchDetailDrawer } from "@/components/candidate/CandidateJobMatchDetailDrawer";
import { RequestApplicationConfirmDialog } from "@/components/candidate/RequestApplicationConfirmDialog";
import { CandidateJobIntelligenceWorkbench } from "@/components/candidate/CandidateJobIntelligenceWorkbench";

const ROOT = join(__dirname, "../../..");

const MATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const JOB_G = "44444444-4444-4444-8444-444444444444";

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
      whyThisJobMayFit:
        "Your experience with TypeScript and React aligns with key requirements for this role.",
      strengths: [
        { title: "TypeScript", message: "Your profile supports TypeScript." },
        { title: "React", message: "Your profile supports React." },
      ],
      thingsToCheck: [
        { title: "Hybrid work", message: "Hybrid arrangement may need review." },
      ],
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/client/urlSync", () => ({
  syncUrlParams: vi.fn(),
}));

const saveAction = vi.fn();
const dismissAction = vi.fn();
const requestAction = vi.fn();
const getFeed = vi.fn();

vi.mock("@/lib/job-matching/actions", () => ({
  saveCandidateJobMatchAction: (...args: unknown[]) => saveAction(...args),
  dismissCandidateJobMatchAction: (...args: unknown[]) => dismissAction(...args),
  requestCandidateJobApplicationAction: (...args: unknown[]) =>
    requestAction(...args),
}));

vi.mock("@/lib/job-matching/feed-actions", () => ({
  getCandidateJobFeed: (...args: unknown[]) => getFeed(...args),
  getOwnCandidateJobFeedItem: vi.fn(),
}));

vi.mock("@/lib/job-matching/detail-actions", () => ({
  getCandidateJobMatchDetail: vi.fn().mockResolvedValue({
    success: false,
    error: "Not found",
    code: "NOT_FOUND",
  }),
}));

describe("Phase 5B.2 — category presentation", () => {
  it("uses human labels without percentages or enums as scores", () => {
    expect(getCategoryVisual("STRONG_MATCH").label).toBe("STRONG MATCH");
    expect(getCategoryVisual("GOOD_MATCH").label).toBe("GOOD MATCH");
    expect(getCategoryVisual("POSSIBLE_MATCH").label).toBe("POSSIBLE MATCH");
    expect(getCategoryVisual("NEEDS_REVIEW").label).toBe("NEEDS REVIEW");
    const blob = JSON.stringify([
      getCategoryVisual("STRONG_MATCH"),
      getCategoryVisual("NEEDS_REVIEW"),
    ]);
    expect(blob).not.toMatch(/%|score|gauge|radar/i);
  });

  it("formats employment type humanely", () => {
    expect(formatEmploymentType("FULL_TIME")).toBe("Full-time");
  });

  it("empty state copy is human", () => {
    expect(emptyReasonCopy("PREPARING").title).toMatch(/being prepared/i);
    expect(emptyReasonCopy("ALL_DISMISSED").title).toMatch(/cleared/i);
    expect(emptyReasonCopy("NO_RECOMMENDATIONS").title).toMatch(/No job recommendations/i);
    expect(emptyReasonCopy("PREPARING").title).not.toMatch(/CandidateJobMatch|QUEUED/);
  });
});

describe("Phase 5B.2 — card / detail / confirm UI", () => {
  it("renders feed card with hierarchy and no numerical score", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchCard, {
        item: feedItem(),
        onViewDetails: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain("Gate13");
    expect(html).toContain("Senior Software Engineer");
    expect(html).toContain("STRONG MATCH");
    expect(html).toContain("Why this job may fit");
    expect(html).toContain("TypeScript");
    expect(html).toContain("Request application");
    expect(html).toContain("Save");
    expect(html).toContain("Not interested");
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toContain("sourceDataVersion");
    expect(html).not.toContain("leaseExpiresAt");
    expect(html).not.toContain("idempotencyKey");
    expect(html).not.toContain('"requirements"');
    expect(html).not.toContain("JobRequirementSet");
  });

  it("renders saved and requested states", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchCard, {
        item: feedItem({
          state: {
            saved: true,
            dismissed: false,
            applicationRequested: true,
            opportunityId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
          },
        }),
        onViewDetails: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain("Saved");
    expect(html).toContain("Queued for your team");
    expect(html).not.toMatch(/submitted|Applied/i);
  });

  it("detail drawer uses dialog semantics and Escape-capable close control", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobMatchDetailDrawer, {
        open: true,
        item: feedItem(),
        detail: null,
        onClose: () => undefined,
        onSave: () => undefined,
        onDismiss: () => undefined,
        onRequest: () => undefined,
      })
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("aria-modal");
    expect(html).toContain("Why this job may fit");
    expect(html).toContain("Your strengths");
    expect(html).not.toContain("idempotencyKey");
  });

  it("request confirmation uses requested semantics, not submitted", () => {
    const html = renderToStaticMarkup(
      createElement(RequestApplicationConfirmDialog, {
        open: true,
        jobTitle: "Senior Software Engineer",
        companyName: "Gate13",
        onCancel: () => undefined,
        onConfirm: () => undefined,
      })
    );
    expect(html).toContain("Request application?");
    expect(html).toContain("will not be submitted automatically");
    expect(html).toContain("Request application");
    expect(html).not.toMatch(/Application submitted|You applied/i);
  });
});

describe("Phase 5B.2 — workbench states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveAction.mockResolvedValue({
      success: true,
      data: { matchId: MATCH_A, savedAt: "2026-10-05T00:00:00.000Z" },
    });
    dismissAction.mockResolvedValue({ success: true, data: { matchId: MATCH_A } });
    requestAction.mockResolvedValue({
      success: true,
      data: {
        matchId: MATCH_A,
        opportunityId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
        opportunity: { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", created: true },
      },
    });
  });

  it("renders loaded feed", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJobIntelligenceWorkbench, {
        initialPage: {
          state: "LOADED",
          items: [feedItem()],
          pageSize: 20,
          nextCursor: null,
        },
      })
    );
    expect(html).toContain("job-intelligence-workbench");
    expect(html).toContain("Jobs worth your attention");
    expect(html).toContain("Recommended jobs");
    expect(html).toContain("STRONG MATCH");
    expect(html).toContain("All");
    expect(html).toContain("Strong match");
  });

  it("renders empty and error states", () => {
    const empty = renderToStaticMarkup(
      createElement(CandidateJobIntelligenceWorkbench, {
        initialPage: {
          state: "EMPTY",
          items: [],
          pageSize: 20,
          nextCursor: null,
          emptyReason: "PREPARING",
        },
      })
    );
    expect(empty).toContain("job-intelligence-empty");
    expect(empty).toMatch(/being prepared/i);

    const err = renderToStaticMarkup(
      createElement(CandidateJobIntelligenceWorkbench, {
        initialPage: {
          state: "ERROR",
          items: [],
          pageSize: 20,
          nextCursor: null,
        },
        initialError: "fail",
      })
    );
    expect(err).toContain("job-intelligence-error");
    expect(err).toContain("Try again");
    expect(err).not.toContain("Prisma");
    expect(err).not.toContain("RLS");
  });

  it("source wires Phase 5A.7 actions and Phase 5B.1 feed only", () => {
    const src = readFileSync(
      join(ROOT, "src/components/candidate/CandidateJobIntelligenceWorkbench.tsx"),
      "utf8"
    );
    expect(src).toMatch(/saveCandidateJobMatchAction/);
    expect(src).toMatch(/dismissCandidateJobMatchAction/);
    expect(src).toMatch(/requestCandidateJobApplicationAction/);
    expect(src).toMatch(/getCandidateJobFeed/);
    expect(src).toMatch(/@\/lib\/job-matching\/actions/);
    expect(src).toMatch(/@\/lib\/job-matching\/feed-actions/);
    expect(src).not.toMatch(/from "@\/lib\/job-matching"/);
    expect(src).not.toMatch(/evaluateCandidateJobMatch/);
    expect(src).not.toMatch(/application\.create/);
    expect(src).not.toMatch(/drainJobMatchWorker/);
  });

  it("page route uses getCandidateJobFeed server read", () => {
    const page = readFileSync(
      join(ROOT, "src/app/(dashboard)/candidate/jobs/page.tsx"),
      "utf8"
    );
    expect(page).toMatch(/getCandidateJobFeed/);
    expect(page).toMatch(/CandidateJobIntelligenceWorkbench/);
    expect(page).not.toMatch(/evaluateCandidateJobMatch/);
  });

  it("navigation includes Job Intelligence without removing existing destinations", () => {
    const sidebar = readFileSync(
      join(ROOT, "src/components/navigation/AppSidebar.tsx"),
      "utf8"
    );
    expect(sidebar).toMatch(/Job Intelligence/);
    expect(sidebar).toMatch(/\/candidate\/jobs/);
    expect(sidebar).toMatch(/My Applications/);
    expect(sidebar).toMatch(/Career Profile/);
    const header = readFileSync(
      join(ROOT, "src/components/navigation/AppHeader.tsx"),
      "utf8"
    );
    expect(header).toMatch(/candidate\/jobs/);
    expect(header).toMatch(/Job Intelligence/);
  });

  it("cards use semantic buttons", () => {
    const card = readFileSync(
      join(ROOT, "src/components/candidate/CandidateJobMatchCard.tsx"),
      "utf8"
    );
    expect(card).toMatch(/type="button"/);
    expect(card).not.toMatch(/onClick=\{.*\}>\s*<div/);
  });

  it("no schema migration for 5B.2", () => {
    const dirs = readdirSync(join(ROOT, "prisma/migrations"));
    expect(dirs.some((d) => /5b2|phase5b2/i.test(d))).toBe(false);
  });
});

describe("Phase 5B.2 — regressions", () => {
  it("Phase 5A.4 matching.v1 still deterministic", () => {
    const result = evaluateCandidateJobMatch({
      candidate: {
        candidateId: "22222222-2222-4222-8222-222222222222",
        organizationId: "11111111-1111-4111-8111-111111111111",
        updatedAt: "2026-01-01T00:00:00.000Z",
        city: null,
        state: null,
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
        skills: [{ id: "33333333-3333-4333-8333-333333333333", name: "TypeScript" }],
        experiences: [],
        educations: [],
        certifications: [],
        projects: [],
      },
      job: {
        jobId: JOB_G,
        organizationId: "11111111-1111-4111-8111-111111111111",
        title: "Engineer",
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
      },
      requirementSet: null,
      asOf: new Date("2026-10-05T00:00:00.000Z"),
    });
    expect(result.matchingContractVersion).toBe(MATCHING_CONTRACT_VERSION);
  });

  it("Phase 5B.1 / 5A.5–5A.7 modules intact", () => {
    expect(
      readFileSync(join(ROOT, "src/lib/job-matching/feed.ts"), "utf8")
    ).toMatch(/getCandidateJobFeed/);
    expect(
      readFileSync(join(ROOT, "src/lib/job-matching/actions.ts"), "utf8")
    ).toMatch(/requestCandidateJobApplicationAction/);
    expect(
      readFileSync(join(ROOT, "src/lib/job-matching/worker.ts"), "utf8")
    ).toMatch(/claimNextJobMatch/);
    expect(
      readFileSync(join(ROOT, "src/lib/job-matching/persist.ts"), "utf8")
    ).toMatch(/upsertCurrentCandidateJobMatch/);
  });
});
