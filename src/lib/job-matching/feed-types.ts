/**
 * Phase 5B.1 — Candidate Job Feed contract (candidate-safe DTOs).
 * Intentionally smaller than Prisma CandidateJobMatch / Job models.
 */

import type { MatchCategory } from "./constants";
import type { CandidateDecisionContinuity } from "./continuity-types";

/** Primary feed categories — LOW_MATCH excluded from default feed. */
export const CANDIDATE_JOB_FEED_CATEGORIES = [
  "STRONG_MATCH",
  "GOOD_MATCH",
  "POSSIBLE_MATCH",
  "NEEDS_REVIEW",
] as const;

export type CandidateJobFeedCategory =
  (typeof CANDIDATE_JOB_FEED_CATEGORIES)[number];

export const CANDIDATE_JOB_FEED_DEFAULT_PAGE_SIZE = 20;
export const CANDIDATE_JOB_FEED_MAX_PAGE_SIZE = 50;

export type CandidateJobFeedPresentationLine = {
  title: string;
  message: string;
};

export type CandidateJobFeedPreferenceLine = {
  title: string;
  message: string;
  tone: "ok" | "warn" | "info";
};

export type CandidateJobFeedItem = {
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
  };
  state: {
    saved: boolean;
    dismissed: boolean;
    applicationRequested: boolean;
    opportunityId: string | null;
  };
  /**
   * Phase 5C.4 — present on Saved/Requested history items.
   * Absent/null on primary recommendation feed items.
   */
  continuity?: CandidateDecisionContinuity | null;
};

export type CandidateJobFeedFilters = {
  /** Optional single primary-feed category filter. */
  category?: CandidateJobFeedCategory;
  remote?: boolean;
  employmentType?: string;
  saved?: boolean;
  applicationRequested?: boolean;
};

export type CandidateJobFeedEmptyReason =
  | "NO_RECOMMENDATIONS"
  | "PREPARING"
  | "ALL_DISMISSED";

export type CandidateJobFeedPageState = "LOADED" | "EMPTY" | "ERROR";

export type CandidateJobFeedPage = {
  state: CandidateJobFeedPageState;
  items: CandidateJobFeedItem[];
  pageSize: number;
  /** Opaque offset cursor for the next page; null when no more pages. */
  nextCursor: string | null;
  emptyReason?: CandidateJobFeedEmptyReason;
  error?: string;
};

export type CandidateJobFeedQuery = {
  filters?: CandidateJobFeedFilters;
  /** Opaque cursor from a previous page's nextCursor. */
  cursor?: string | null;
  pageSize?: number;
};

/** Runtime check — feed categories are a subset of matching.v1. */
export function isCandidateJobFeedCategory(
  value: string | null | undefined
): value is CandidateJobFeedCategory {
  return (
    value === "STRONG_MATCH" ||
    value === "GOOD_MATCH" ||
    value === "POSSIBLE_MATCH" ||
    value === "NEEDS_REVIEW"
  );
}

export function feedCategoryPriority(category: MatchCategory | string): number {
  switch (category) {
    case "STRONG_MATCH":
      return 0;
    case "GOOD_MATCH":
      return 1;
    case "POSSIBLE_MATCH":
      return 2;
    case "NEEDS_REVIEW":
      return 3;
    default:
      return 99;
  }
}
