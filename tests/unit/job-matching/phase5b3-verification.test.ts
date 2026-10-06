/**
 * Phase 5B.3 — hardening / payload forensics (no browser).
 * Updated for Phase 5C.2: JD/qualificationSummary allowed only via detail DTO,
 * never via feed-types or feed cards.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../../..");

const FORBIDDEN_INTERNAL = [
  "sourceDataVersion",
  "idempotencyKey",
  "leaseExpiresAt",
  "attemptCount",
  "maxAttempts",
  "requirementSetId",
  "snapshotId",
  "evidenceRefs",
  "extractedText",
  "rawRequirements",
  "qualificationNotes",
];

const CLIENT_CANDIDATE_FILES = [
  "src/components/candidate/CandidateJobIntelligenceWorkbench.tsx",
  "src/components/candidate/CandidateJobMatchCard.tsx",
  "src/components/candidate/CandidateJobMatchDetailDrawer.tsx",
  "src/components/candidate/RequestApplicationConfirmDialog.tsx",
  "src/lib/job-matching/feed-ui.ts",
];

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 5B.3 — client payload boundary", () => {
  it("feed-types DTO excludes internal match fields and full JD", () => {
    const src = read("src/lib/job-matching/feed-types.ts");
    for (const key of [
      ...FORBIDDEN_INTERNAL,
      "qualificationSummary",
      "preferenceSummary",
      "jobDescription",
    ]) {
      expect(src.includes(`${key}:`)).toBe(false);
    }
    expect(src).toMatch(/matchId: string/);
    expect(src).toMatch(/whyThisJobMayFit: string/);
  });

  it("feed cards never embed jobDescription", () => {
    const card = read("src/components/candidate/CandidateJobMatchCard.tsx");
    expect(card.includes("jobDescription")).toBe(false);
  });

  it("candidate UI modules do not reference forbidden internal persistence keys", () => {
    for (const file of CLIENT_CANDIDATE_FILES) {
      const src = read(file);
      for (const key of FORBIDDEN_INTERNAL) {
        expect(src.includes(key), `${file} must not mention ${key}`).toBe(false);
      }
    }
  });

  it("workbench does not import job-matching server barrel", () => {
    const src = read("src/components/candidate/CandidateJobIntelligenceWorkbench.tsx");
    expect(src).not.toMatch(/from "@\/lib\/job-matching"/);
    expect(src).toMatch(/feed-actions/);
    expect(src).toMatch(/feed-types/);
    expect(src).toMatch(/detail-actions/);
  });

  it("actions do not accept client-supplied candidateId", () => {
    const src = read("src/lib/job-matching/actions.ts");
    expect(src).toMatch(/getAuthenticatedContext/);
    expect(src).not.toMatch(/candidateId:\s*z\./);
    expect(src).not.toMatch(/organizationId:\s*z\./);
  });

  it("feed read derives identity from session only", () => {
    const src = read("src/lib/job-matching/feed.ts");
    expect(src).toMatch(/getAuthenticatedContext/);
    expect(src).not.toMatch(/query\.candidateId/);
    expect(src).not.toMatch(/filters\.organizationId/);
  });

  it("page route wires category/filter search params without trusting foreign ids", () => {
    const src = read("src/app/(dashboard)/candidate/jobs/page.tsx");
    expect(src).toMatch(/isCandidateJobFeedCategory/);
    expect(src).not.toMatch(/matchId/);
  });

  it("success path uses queued-for-team wording (not submitted)", () => {
    const workbench = read("src/components/candidate/CandidateJobIntelligenceWorkbench.tsx");
    expect(workbench).toMatch(/Queued for your team/);
    // Workbench success banner remains queued — Application submitted lives in continuity history UI.
    expect(workbench).not.toMatch(/Applied successfully/);
    const dialog = read("src/components/candidate/RequestApplicationConfirmDialog.tsx");
    expect(dialog).not.toMatch(/Application submitted/);
  });
});

describe("Phase 5B.3 — navigation surface", () => {
  it("sidebar links Job Intelligence to /candidate/jobs", () => {
    const src = read("src/components/navigation/AppSidebar.tsx");
    expect(src).toMatch(/\/candidate\/jobs/);
    expect(src).toMatch(/Job Intelligence/);
  });
});
