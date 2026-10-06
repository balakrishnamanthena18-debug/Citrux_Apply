/**
 * Phase 5 Job Intelligence — matching.v1 (deterministic).
 * Does not modify Phase 2/3/4 contracts or persistence.
 */

export {
  MATCHING_CONTRACT_VERSION,
  MATCH_CATEGORIES,
  MATCH_CATEGORY_LABELS,
  MATCH_OUTCOMES,
  QUALIFICATION_DIMENSIONS,
  PREFERENCE_DIMENSIONS,
  MATCH_EVALUATION_STATUSES,
  MATCH_WORKER_LEASE_MS,
  MATCH_DRAIN_BATCH_SIZE,
  MATCH_RECLAIM_BATCH_SIZE,
  MATCH_MAX_CONCURRENT_PER_CANDIDATE,
  MATCH_DEFAULT_MAX_ATTEMPTS,
  buildCurrentMatchIdentityKey,
  humanMatchCategoryLabel,
  type MatchCategory,
  type MatchOutcome,
  type MatchDimension,
  type QualificationDimension,
  type PreferenceDimension,
  type MatchEvaluationStatus,
} from "./constants";

export { buildMatchSourceDataVersion } from "./freshness";
export { categorizeMatch, countMatchCounters } from "./category";
export {
  evaluateCandidateJobMatch,
  toCandidateSafeMatchPayload,
} from "./evaluate";
export { buildMatchPresentation } from "./presentation";

export {
  CANDIDATE_ACTION_FIELDS,
  EVALUATION_CONTROLLED_FIELDS,
  IMMUTABLE_IDENTITY_FIELDS,
  buildJobMatchIdempotencyKey,
  assertAuthorizedJobForMatch,
  upsertCurrentCandidateJobMatch,
  markCandidateJobMatchStale,
  markCandidateJobMatchFailed,
  getCandidateSafeJobMatch,
  assertCandidateActionPatch,
  updateOwnCandidateJobMatchActions,
  type AuthorizedMatchActor,
} from "./persist";

export type {
  MatchCandidateInput,
  MatchJobInput,
  MatchRequirementSetInput,
  MatchStructuredRequirement,
  MatchEvaluationResult,
  MatchItemResult,
  MatchPresentation,
  MatchEvidenceRef,
  MatchCategoryCounters,
} from "./types";

export { loadAuthoritativeMatchInputs } from "./load-inputs";

export {
  reclaimExpiredJobMatchLeases,
  requeueStaleJobMatches,
  claimNextJobMatch,
  enqueueCandidateJobMatchWork,
  markJobMatchStaleAndRequeue,
  processJobMatch,
  drainJobMatchWorker,
  type ClaimedJobMatch,
  type JobMatchDrainResult,
} from "./worker";

export {
  saveCandidateJobMatchAction,
  dismissCandidateJobMatchAction,
  requestCandidateJobApplicationAction,
  ensureCandidateJobOpportunityForMatch,
  type MatchActionResult,
  type CandidateSafeMatchActionState,
  type RequestApplicationResult,
} from "./actions";

export {
  CANDIDATE_JOB_FEED_CATEGORIES,
  CANDIDATE_JOB_FEED_DEFAULT_PAGE_SIZE,
  CANDIDATE_JOB_FEED_MAX_PAGE_SIZE,
  isCandidateJobFeedCategory,
  feedCategoryPriority,
  type CandidateJobFeedCategory,
  type CandidateJobFeedItem,
  type CandidateJobFeedFilters,
  type CandidateJobFeedPage,
  type CandidateJobFeedQuery,
  type CandidateJobFeedEmptyReason,
  type CandidateJobFeedPageState,
} from "./feed-types";

export {
  getCandidateJobFeed,
  getOwnCandidateJobFeedItem,
  __feedTestUtils,
} from "./feed";

export {
  getCandidateJobFeed as getCandidateJobFeedAction,
  getOwnCandidateJobFeedItem as getOwnCandidateJobFeedItemAction,
} from "./feed-actions";

export {
  getCandidateJobMatchDetail,
  __detailTestUtils,
} from "./detail";

export { getCandidateJobMatchDetail as getCandidateJobMatchDetailAction } from "./detail-actions";

export type {
  CandidateJobMatchDetail,
  CandidateJobMatchDetailResult,
  CandidateSafeQualificationLine,
} from "./detail-types";

export { groupQualificationByDimension } from "./detail-ui";

export {
  getCategoryVisual,
  formatEmploymentType,
  emptyReasonCopy,
  qualificationDimensionLabel,
} from "./feed-ui";

export {
  deriveDecisionContinuity,
  getCandidateDecisionHistory,
  getOwnCandidateDecisionContinuity,
  __continuityTestUtils,
} from "./continuity";

export {
  invalidateCandidateJobMatchesForCandidate,
  invalidateCandidateJobMatchesForJob,
  JOB_MATCH_INVALIDATION_BATCH_SIZE,
  JOB_MATCH_INVALIDATION_MAX_BATCHES,
  type JobMatchInvalidationReason,
  type JobMatchInvalidationResult,
} from "./invalidation";

export {
  populateJobMatchWorkForJob,
  populateJobMatchWorkForCandidate,
  isCandidateMatchPopulationEligible,
  JOB_MATCH_POPULATION_BATCH_SIZE,
  JOB_MATCH_POPULATION_MAX_BATCHES,
  type JobMatchPopulationReason,
  type JobMatchPopulationResult,
} from "./population";

export {
  getCandidateDecisionHistory as getCandidateDecisionHistoryAction,
  getOwnCandidateDecisionContinuity as getOwnCandidateDecisionContinuityAction,
} from "./continuity-actions";

export type {
  CandidateDecisionState,
  CandidateDecisionContinuity,
  ContinuityDerivationInput,
  CandidateDecisionHistoryItem,
  CandidateDecisionHistoryMode,
  CandidateDecisionHistoryQuery,
  CandidateDecisionHistoryPage,
  CandidateDecisionHistoryResult,
} from "./continuity-types";

export { continuityPrimaryBadge, historyItemAsFeedItem } from "./continuity-ui";

/**
 * Persistence identity (FINAL):
 * ONE CURRENT CandidateJobMatch per (organizationId, candidateId, jobId).
 * matchingContractVersion + sourceDataVersion describe the CURRENT evaluation
 * version on that row — they are not a second feed identity.
 */
export const CANDIDATE_JOB_MATCH_CURRENT_IDENTITY = [
  "organizationId",
  "candidateId",
  "jobId",
] as const;
