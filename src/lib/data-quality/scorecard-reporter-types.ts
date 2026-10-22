/**
 * OOS Data Quality & Intelligence — Scorecard Reporter Types & Contracts
 *
 * Defines runtime Zod validation and TypeScript contracts for the
 * offline data quality reporting integration (Phase 3, Stage 3).
 *
 * Strict Principles:
 * - Deterministic JSON and Markdown output.
 * - Distinguishes 100-record benchmark evaluation from the 1,000-record inventory feed.
 * - Enforces explicit interpretation rules (no overclaiming of accuracy or authenticity).
 * - Categorizes actionable human-review priorities with clear escalation denominators.
 */

import { z } from "zod";
import { qualityScorecardSchema } from "./scorecard-types";

/**
 * Inventory Audit Context:
 * Details the relationship between the 100-record benchmark and the broader 1,000-record raw feed.
 */
export const inventoryAuditContextSchema = z.object({
  totalInventoryRecords: z.number().int().nonnegative(),
  inventoryDatasetName: z.string().min(1),
  relationshipToBenchmark: z.string().min(1),
  candidateDuplicatesInInventory: z.number().int().nonnegative().optional(),
  foreignSignalsInInventory: z.number().int().nonnegative().optional(),
  suspectedBatchTimestampsInInventory: z.number().int().nonnegative().optional(),
  humanReviewCountInInventory: z.number().int().nonnegative().optional(),
  inventorySummaryNotes: z.array(z.string().min(1)).optional(),
});

export type InventoryAuditContext = z.infer<typeof inventoryAuditContextSchema>;

/**
 * Human review priority item.
 */
export const reviewPriorityItemSchema = z.object({
  priority: z.enum(["high", "medium", "low"]),
  dimension: z.enum(["duplicate", "geography", "freshness"]),
  targetCount: z.number().int().nonnegative(),
  reason: z.string().min(1),
  recommendedAction: z.string().min(1),
  sampleBenchmarkIds: z.array(z.string()),
  targetBenchmarkIds: z.array(z.string()).optional(),
});

export type ReviewPriorityItem = z.infer<typeof reviewPriorityItemSchema>;

/**
 * Summary of human review priority queues and cross-dimension overlaps.
 */
export const reviewQueuesSummarySchema = z.object({
  totalQueueAssignments: z.number().int().nonnegative(),
  uniqueBenchmarkRecordsTargeted: z.number().int().nonnegative(),
  overlappingRecordsCount: z.number().int().nonnegative(),
  overlappingRecordIds: z.array(z.string()).optional(),
  overlapNotice: z.string().min(1),
});

export type ReviewQueuesSummary = z.infer<typeof reviewQueuesSummarySchema>;

/**
 * Summary of excluded record-dimension pairs and unique benchmark records affected.
 */
export const exclusionsSummarySchema = z.object({
  totalExcludedDimensionPairs: z.number().int().nonnegative(),
  uniqueBenchmarkRecordsAffected: z.number().int().nonnegative(),
  dimensionIndependenceNotice: z.string().min(1),
  uniqueBenchmarkIdsPerDimension: z.record(z.string(), z.number()).optional(),
  multiDimensionBenchmarkIds: z.array(z.string()).optional(),
  groupedExclusions: z.record(z.string(), z.number()).optional(),
});

export type ExclusionsSummary = z.infer<typeof exclusionsSummarySchema>;

/**
 * Reporting configuration options.
 */
export const scorecardReportOptionsSchema = z.object({
  inventoryContext: inventoryAuditContextSchema.optional(),
  customReviewPriorities: z.array(reviewPriorityItemSchema).optional(),
  reportTitle: z.string().optional(),
  evaluationMethod: z.string().optional(),
  evaluationInput: z.string().optional(),
  benchmark: z.custom<any>().optional(),
  generatedAt: z.string().optional(),
  generatorVersion: z.string().optional(),
});

export type ScorecardReportOptions = z.infer<typeof scorecardReportOptionsSchema>;

/**
 * Full deterministic JSON report structure.
 */
export const scorecardReportJsonSchema = z.object({
  reportVersion: z.literal("1.0"),
  title: z.string().min(1),
  benchmarkIdentifier: z.string().min(1),
  benchmarkVersion: z.string().min(1),
  scorecardVersion: z.string().min(1),
  evaluationMethod: z.string().min(1).optional(),
  evaluationInput: z.string().min(1).optional(),
  totalBenchmarkRecords: z.number().int().nonnegative(),
  inventoryContext: inventoryAuditContextSchema,
  scorecard: qualityScorecardSchema,
  exclusionsSummary: exclusionsSummarySchema.optional(),
  reviewPriorities: z.array(reviewPriorityItemSchema),
  reviewQueuesSummary: reviewQueuesSummarySchema.optional(),
  interpretationBoundaries: z.array(z.string().min(1)),
  generatedAt: z.string().optional(),
  generatorVersion: z.string().optional(),
});

export type ScorecardReportJson = z.infer<typeof scorecardReportJsonSchema>;
