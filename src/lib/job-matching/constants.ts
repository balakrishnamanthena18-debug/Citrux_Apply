/**
 * Phase 5 — matching.v1 contract constants.
 * Deterministic. No LLM. No numerical percentage score.
 */

export const MATCHING_CONTRACT_VERSION = "matching.v1" as const;

export const MATCH_CATEGORIES = [
  "STRONG_MATCH",
  "GOOD_MATCH",
  "POSSIBLE_MATCH",
  "NEEDS_REVIEW",
  "LOW_MATCH",
] as const;

export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

export const MATCH_CATEGORY_LABELS: Record<MatchCategory, string> = {
  STRONG_MATCH: "Strong match",
  GOOD_MATCH: "Good match",
  POSSIBLE_MATCH: "Possible match",
  NEEDS_REVIEW: "Needs review",
  LOW_MATCH: "Low match",
};

/** Per-item evaluation outcomes (matching.v1). */
export const MATCH_OUTCOMES = [
  "MATCH",
  "PARTIAL",
  "MISMATCH",
  "UNKNOWN",
  "NOT_APPLICABLE",
] as const;

export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

export const QUALIFICATION_DIMENSIONS = [
  "SKILLS",
  "EXPERIENCE",
  "EDUCATION",
  "CERTIFICATIONS",
  "WORK_AUTHORIZATION",
] as const;

export type QualificationDimension = (typeof QUALIFICATION_DIMENSIONS)[number];

export const PREFERENCE_DIMENSIONS = [
  "LOCATION",
  "REMOTE_PREFERENCE",
  "SALARY",
  "EMPLOYMENT_TYPE",
] as const;

export type PreferenceDimension = (typeof PREFERENCE_DIMENSIONS)[number];

export type MatchDimension = QualificationDimension | PreferenceDimension;

export const MATCH_EVALUATION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "STALE",
  "FAILED",
] as const;

export type MatchEvaluationStatus = (typeof MATCH_EVALUATION_STATUSES)[number];

/**
 * Phase 5A.6 worker limits — reuse intelligence-worker cron.
 * Lease semantics mirror application-intelligence (5 minutes).
 */
export const MATCH_WORKER_LEASE_MS = 5 * 60 * 1000;
/** V1: max match work items per drain batch. */
export const MATCH_DRAIN_BATCH_SIZE = 25;
export const MATCH_RECLAIM_BATCH_SIZE = 50;
/** V1: at most one RUNNING match evaluation per candidate. */
export const MATCH_MAX_CONCURRENT_PER_CANDIDATE = 1;
export const MATCH_DEFAULT_MAX_ATTEMPTS = 3;

/** Feed / action identity — one CURRENT row per candidate×job in an org. */
export function buildCurrentMatchIdentityKey(input: {
  organizationId: string;
  candidateId: string;
  jobId: string;
}): string {
  return `${input.organizationId}:${input.candidateId}:${input.jobId}`;
}

export function humanMatchCategoryLabel(category: MatchCategory): string {
  return MATCH_CATEGORY_LABELS[category];
}
