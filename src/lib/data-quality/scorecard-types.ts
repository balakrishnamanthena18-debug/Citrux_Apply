/**
 * OOS Data Quality & Intelligence — Phase 3 Scorecard Types & Schema
 *
 * Defines runtime Zod validation and TypeScript contracts for the
 * offline data quality scorecard engine.
 *
 * Enforces frozen decisions:
 * - Deterministic output (zero randomness, zero non-deterministic timestamps in core payload).
 * - Explicit distinction between eligible, heuristic, and unresolved records.
 * - Meaningful denominators only (safe handling of zero-division).
 * - Machine-readable exclusions and limitations.
 */

import { z } from "zod";

/**
 * Standard classification metrics for a binary or multiclass category.
 */
export const classificationMetricsSchema = z.object({
  truePositives: z.number().int().nonnegative(),
  falsePositives: z.number().int().nonnegative(),
  falseNegatives: z.number().int().nonnegative(),
  trueNegatives: z.number().int().nonnegative().optional(),
  support: z.number().int().nonnegative(),
  precision: z.number().min(0).max(1).nullable(),
  recall: z.number().min(0).max(1).nullable(),
  f1Score: z.number().min(0).max(1).nullable(),
  specificity: z.number().min(0).max(1).nullable().optional(),
});

export type ClassificationMetrics = z.infer<typeof classificationMetricsSchema>;

/**
 * Multiclass Confusion Matrix with class labels.
 */
export const confusionMatrixSchema = z.object({
  classes: z.array(z.string().min(1)),
  matrix: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())),
});

export type ConfusionMatrix = z.infer<typeof confusionMatrixSchema>;

/**
 * Evaluated coverage and exclusion accounting for a dimension.
 */
export const dimensionEligibilitySchema = z.object({
  totalRecords: z.number().int().nonnegative(),
  eligibleRecords: z.number().int().nonnegative(),
  excludedHeuristicRecords: z.number().int().nonnegative(),
  excludedUnresolvedRecords: z.number().int().nonnegative(),
  eligibleCoverageRatio: z.number().min(0).max(1),
});

export type DimensionEligibility = z.infer<typeof dimensionEligibilitySchema>;

/**
 * Deduplication dimension evaluation block.
 */
export const deduplicationScorecardSchema = z.object({
  eligibility: dimensionEligibilitySchema,
  pairMetrics: z.object({
    totalEligiblePairs: z.number().int().nonnegative(),
    groundTruthPositivePairs: z.number().int().nonnegative(),
    predictedPositivePairs: z.number().int().nonnegative(),
    metrics: classificationMetricsSchema,
  }),
  recordMetrics: z.object({
    metrics: classificationMetricsSchema,
  }),
  pairGenerationPolicy: z.literal("unordered_pairs_within_eligible_deterministic_records"),
  notes: z.string(),
});

export type DeduplicationScorecard = z.infer<typeof deduplicationScorecardSchema>;

/**
 * Geography dimension evaluation block.
 */
export const geographyScorecardSchema = z.object({
  eligibility: dimensionEligibilitySchema,
  overallAccuracy: z.number().min(0).max(1).nullable(),
  macroF1Score: z.number().min(0).max(1).nullable(),
  confusionMatrix: confusionMatrixSchema,
  perClassMetrics: z.record(z.string(), classificationMetricsSchema),
  notes: z.string(),
});

export type GeographyScorecard = z.infer<typeof geographyScorecardSchema>;

/**
 * Timestamp-pattern evaluation block.
 */
export const timestampPatternScorecardSchema = z.object({
  eligibility: dimensionEligibilitySchema,
  overallAccuracy: z.number().min(0).max(1).nullable(),
  macroF1Score: z.number().min(0).max(1).nullable(),
  confusionMatrix: confusionMatrixSchema,
  perClassMetrics: z.record(z.string(), classificationMetricsSchema),
  unverifiedConditionsNotice: z.object({
    jobFreshnessScored: z.literal(false),
    employerPostingDateAuthenticityScored: z.literal(false),
    vacancyActiveClosedScored: z.literal(false),
    ingestionProvenanceScored: z.literal(false),
    explanation: z.string(),
  }),
  notes: z.string(),
});

export type TimestampPatternScorecard = z.infer<typeof timestampPatternScorecardSchema>;

/**
 * Dimension escalation metrics for unresolved cases.
 */
export const dimensionEscalationMetricsSchema = z.object({
  unresolvedCount: z.number().int().nonnegative(),
  escalatedToReviewCount: z.number().int().nonnegative(),
  escalationRate: z.number().min(0).max(1).nullable(),
});

export type DimensionEscalationMetrics = z.infer<typeof dimensionEscalationMetricsSchema>;

/**
 * Abstention and review escalation summary block.
 */
export const abstentionAndReviewScorecardSchema = z.object({
  byDimension: z.object({
    duplicate: dimensionEscalationMetricsSchema,
    geography: dimensionEscalationMetricsSchema,
    freshness: dimensionEscalationMetricsSchema,
  }),
  totalUnresolvedRecords: z.number().int().nonnegative(),
  totalEscalatedUnresolvedRecords: z.number().int().nonnegative(),
  overallUnresolvedEscalationRate: z.number().min(0).max(1).nullable(),
  totalHeuristicRecords: z.number().int().nonnegative(),
  totalEscalatedHeuristicRecords: z.number().int().nonnegative(),
  heuristicEscalationRate: z.number().min(0).max(1).nullable(),
  notes: z.string(),
});

export type AbstentionAndReviewScorecard = z.infer<typeof abstentionAndReviewScorecardSchema>;

/**
 * Individual machine-readable record exclusion entry.
 */
export const metricExclusionEntrySchema = z.object({
  dimension: z.enum(["duplicate", "geography", "freshness"]),
  benchmarkId: z.string(),
  sourceRecordId: z.string(),
  evidenceLevel: z.enum(["heuristic_inference", "unresolved_insufficient"]),
  currentLabel: z.string(),
  exclusionRule: z.string(),
  rationale: z.string(),
});

export type MetricExclusionEntry = z.infer<typeof metricExclusionEntrySchema>;

/**
 * Run-specific metadata cleanly separated from deterministic scorecard payload.
 */
export const scorecardRunMetadataSchema = z.record(z.string(), z.unknown());

export type ScorecardRunMetadata = z.infer<typeof scorecardRunMetadataSchema>;

/**
 * Notice of frozen offline unverified conditions.
 */
export const unverifiedConditionsNoticeSchema = z.object({
  vacancyFreshnessVerified: z.literal(false),
  postingDateAuthenticityVerified: z.literal(false),
  employerClosureVerified: z.literal(false),
  ingestionProvenanceVerified: z.literal(false),
  notice: z.string(),
});

export type UnverifiedConditionsNotice = z.infer<typeof unverifiedConditionsNoticeSchema>;

/**
 * Full Offline Data Quality Scorecard output contract.
 */
export const qualityScorecardSchema = z.object({
  scorecardVersion: z.literal("1.0"),
  benchmarkIdentifier: z.string().min(1),
  benchmarkVersion: z.string().min(1),
  totalRecordsEvaluated: z.number().int().nonnegative(),
  deduplication: deduplicationScorecardSchema,
  geography: geographyScorecardSchema,
  timestampPattern: timestampPatternScorecardSchema,
  abstentionAndReview: abstentionAndReviewScorecardSchema,
  unverifiedConditionsNotice: unverifiedConditionsNoticeSchema,
  exclusionsAndLimitations: z.object({
    exclusionsCount: z.number().int().nonnegative(),
    exclusionsList: z.array(metricExclusionEntrySchema),
    limitations: z.array(z.string().min(1)),
  }),
  runMetadata: scorecardRunMetadataSchema.optional(),
});

export type QualityScorecard = z.infer<typeof qualityScorecardSchema>;
