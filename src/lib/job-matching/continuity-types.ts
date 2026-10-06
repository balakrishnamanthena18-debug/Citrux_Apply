/**
 * Phase 5C.4 — Candidate decision continuity (candidate-safe DTOs).
 * Derived from existing Match / Opportunity / Application / Job authority.
 * No new persistence model.
 */

import type { ApplicationStatus } from "@/generated/prisma";
import type {
  CandidateJobFeedCategory,
  CandidateJobFeedPreferenceLine,
  CandidateJobFeedPresentationLine,
} from "./feed-types";

/** Human-facing decision progression — derived, not a DB enum. */
export type CandidateDecisionState =
  | "SAVED"
  | "REQUESTED"
  | "APPLICATION_STARTED"
  | "SUBMITTED"
  | "APPLICATION_STATUS"
  | "TERMINAL";

/**
 * Candidate-safe continuity strip for Saved / Requested history
 * and detail status.
 */
export type CandidateDecisionContinuity = {
  /** Derived authoritative decision state. */
  decisionState: CandidateDecisionState;
  /**
   * Primary decision badge copy (e.g. "Saved", "Requested").
   * Never raw internal enums.
   */
  decisionLabel: string;
  /**
   * Progress line under the decision badge
   * (e.g. "Queued for your team", "Application started").
   */
  progressLabel: string;
  /** True when Job.status === OPEN. */
  jobAvailable: boolean;
  /** Candidate-safe availability copy when job is closed/archived. */
  jobAvailabilityLabel: string | null;
  /** Present only when an Application exists for this candidate+job. */
  applicationExists: boolean;
  applicationId: string | null;
  /** Candidate-safe Applications route when applicationId is set. */
  applicationHref: string | null;
  /** Reuses Applications UI labels when Application exists. */
  applicationStatusLabel: string | null;
  applicationUpdatedAt: string | null;
  savedAt: string | null;
  requestedAt: string | null;
  /**
   * Compact last meaningful candidate-visible event label
   * (progressLabel, or availability when that is the key signal).
   */
  lastMeaningfulCandidateVisibleEvent: string;
};

/** Inputs for pure continuity derivation (no Prisma types in browser). */
export type ContinuityDerivationInput = {
  savedAt: Date | string | null;
  applicationRequestedAt: Date | string | null;
  opportunityId: string | null;
  /** True when CandidateJobOpportunity row exists (id present). */
  opportunityExists: boolean;
  jobStatus: "OPEN" | "CLOSED" | "ARCHIVED";
  application: {
    id: string;
    status: ApplicationStatus | string;
    updatedAt: Date | string;
  } | null;
};

/**
 * History list item — same job/match surface as the feed card,
 * plus required continuity for Saved/Requested views.
 */
export type CandidateDecisionHistoryItem = {
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
  continuity: CandidateDecisionContinuity;
};

export type CandidateDecisionHistoryMode = "SAVED" | "REQUESTED";

export type CandidateDecisionHistoryQuery = {
  mode: CandidateDecisionHistoryMode;
  cursor?: string | null;
  pageSize?: number;
};

export type CandidateDecisionHistoryPage = {
  state: "LOADED" | "EMPTY" | "ERROR";
  items: CandidateDecisionHistoryItem[];
  pageSize: number;
  nextCursor: string | null;
  emptyReason?: "NO_HISTORY";
  error?: string;
};

export type CandidateDecisionHistoryResult =
  | { success: true; data: CandidateDecisionHistoryPage }
  | { success: false; error: string; code?: string };
