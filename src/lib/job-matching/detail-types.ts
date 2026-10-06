/**
 * Phase 5C.2 / 5C.4 — Candidate Job Match Detail DTO (candidate-safe).
 * Loaded on demand when detail opens — not embedded in feed cards.
 * 5C.4 adds decision continuity (derived; no new persistence).
 */

import type {
  CandidateJobFeedCategory,
  CandidateJobFeedPreferenceLine,
  CandidateJobFeedPresentationLine,
} from "./feed-types";
import type { CandidateDecisionContinuity } from "./continuity-types";

export type CandidateSafeQualificationLine = {
  dimension: string;
  dimensionLabel: string;
  outcome: string;
  label: string;
};

export type CandidateJobMatchDetail = {
  matchId: string;
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
    status: "OPEN" | "CLOSED" | "ARCHIVED";
    /** Full JD — detail only. Never on feed cards. */
    jobDescription: string;
    /** Present only when Job.externalUrl is a usable http(s) URL. */
    externalUrl: string | null;
    /** Curated Job.source label when non-empty. */
    sourceLabel: string | null;
  };
  match: {
    category: CandidateJobFeedCategory;
    categoryLabel: string;
    freshness: "CURRENT";
    evaluatedAt: string | null;
    whyThisJobMayFit: string;
    strengths: CandidateJobFeedPresentationLine[];
    thingsToCheck: CandidateJobFeedPresentationLine[];
    preferences: CandidateJobFeedPreferenceLine[];
    /** Scrubbed dimension/outcome/label only — never raw requirements. */
    qualificationSummary: CandidateSafeQualificationLine[];
  };
  state: {
    saved: boolean;
    dismissed: boolean;
    applicationRequested: boolean;
    opportunityId: string | null;
  };
  /** Phase 5C.4 — derived decision continuity strip (null when undecided). */
  continuity: CandidateDecisionContinuity | null;
};

export type CandidateJobMatchDetailResult =
  | { success: true; data: CandidateJobMatchDetail }
  | {
      success: false;
      error: string;
      code?: "UNAUTHORIZED" | "NOT_FOUND" | "STALE" | "CLOSED" | "VALIDATION" | "FAILED";
    };
