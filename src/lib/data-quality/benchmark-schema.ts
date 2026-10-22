/**
 * OOS Data Quality & Intelligence — Phase 3 Benchmark Schema & Ground-Truth Contracts
 *
 * Defines runtime Zod validation and TypeScript contracts for the 100-record
 * Ground-Truth Quality Benchmark dataset.
 *
 * Strict Principles:
 * - Every label MUST declare evidence, rationale, and verificationSource.
 * - Inferences must never be labeled as confirmed facts.
 * - Missing or insufficient evidence MUST be explicitly tagged 'unresolved'.
 */

import { z } from "zod";

/**
 * Permitted ground-truth duplicate classifications.
 */
export const benchmarkDuplicateLabelSchema = z.enum([
  "confirmed_duplicate",
  "distinct_requisition",
  "unique_record",
  "unresolved",
]);

export type BenchmarkDuplicateLabel = z.infer<typeof benchmarkDuplicateLabelSchema>;

/**
 * Permitted ground-truth geography classifications.
 *
 * Contract semantics:
 * - valid_us: Domestic US location verified by structured state/city/country string. resolvedCountry === "USA".
 * - explicit_foreign: Verified non-US sovereign territory (e.g. Canada). resolvedCountry is country name.
 * - metadata_discrepancy: Domestic US location misclassified by upstream scraper ISO code. resolvedCountry === "USA".
 * - missing_location: Location field is empty/null. resolvedCountry === null.
 * - unresolved: Location metadata lacks municipal granularity or jurisdictional clarity to resolve definitively. resolvedCountry === null.
 */
export const benchmarkGeographyLabelSchema = z.enum([
  "valid_us",
  "explicit_foreign",
  "metadata_discrepancy",
  "missing_location",
  "unresolved",
]);

export type BenchmarkGeographyLabel = z.infer<typeof benchmarkGeographyLabelSchema>;

/**
 * Permitted ground-truth timestamp relationship classifications.
 *
 * Distinguishes observable timestamp patterns from unverified claims of
 * real-world vacancy freshness, job activity, or employer posting authenticity.
 *
 * Contract semantics:
 * - identical_timestamp_pattern: postedAt === createdAt === updatedAt (deterministic pattern).
 * - distinct_timestamp_values: At least one timestamp differs.
 * - closure_signal: Explicit closure language detected in payload.
 * - unresolved: Timestamps missing or insufficient to evaluate pattern.
 *
 * Metric Eligibility:
 * - Timestamp pattern detection algorithms MAY be scored against hasIdenticalTimestamps (57 true, 43 false).
 * - Genuine vacancy freshness, original employer posting time, and crawler ingestion provenance
 *   are UNVERIFIED and MUST NOT be scored as verified ground truth against this offline fixture alone.
 */
export const benchmarkFreshnessLabelSchema = z.enum([
  "identical_timestamp_pattern",
  "distinct_timestamp_values",
  "closure_signal",
  "unresolved",
]);

export type BenchmarkFreshnessLabel = z.infer<typeof benchmarkFreshnessLabelSchema>;

/**
 * Permitted ingestion provenance classifications.
 *
 * Distinguishes crawler batch execution assumptions from verified facts.
 */
export const benchmarkIngestionProvenanceSchema = z.enum([
  "suspected_batch",
  "unknown",
  "confirmed_batch",
  "confirmed_realtime",
]);

export type BenchmarkIngestionProvenance = z.infer<typeof benchmarkIngestionProvenanceSchema>;

/**
 * Explicit evidentiary tiers classifying ground-truth defensibility.
 */
export const benchmarkEvidenceLevelSchema = z.enum([
  "deterministic_dataset",
  "heuristic_inference",
  "unresolved_insufficient",
]);

export type BenchmarkEvidenceLevel = z.infer<typeof benchmarkEvidenceLevelSchema>;

/**
 * Permitted verification sources certifying how ground-truth was established.
 */
export const benchmarkVerificationSourceSchema = z.enum([
  "deterministic_exact_canonical_url",
  "ats_provider_requisition_id",
  "employer_distinct_requisition_ids",
  "explicit_country_string_match",
  "employer_jurisdiction_context",
  "state_postal_scraper_iso_collision",
  "empty_location_field",
  "identical_database_timestamps",
  "distinct_database_timestamps",
  "content_closure_phrase",
  "human_auditor_verified",
  "unresolved_insufficient_evidence",
]);

export type BenchmarkVerificationSource = z.infer<typeof benchmarkVerificationSourceSchema>;

/**
 * Ground-truth evaluation block for a single benchmark record.
 */
export const benchmarkRecordLabelSchema = z.object({
  duplicate: z.object({
    label: benchmarkDuplicateLabelSchema,
    groundTruthGroupId: z.string().nullable(),
    evidenceLevel: benchmarkEvidenceLevelSchema,
    evidence: z.string().min(1),
    rationale: z.string().min(1),
    verificationSource: benchmarkVerificationSourceSchema,
    missingEvidence: z.string().nullable().optional(),
  }),
  geography: z.object({
    label: benchmarkGeographyLabelSchema,
    resolvedCountry: z.string().nullable(),
    evidenceLevel: benchmarkEvidenceLevelSchema,
    evidence: z.string().min(1),
    rationale: z.string().min(1),
    verificationSource: benchmarkVerificationSourceSchema,
    missingEvidence: z.string().nullable().optional(),
  }),
  freshness: z.object({
    label: benchmarkFreshnessLabelSchema,
    hasIdenticalTimestamps: z.boolean(),
    ingestionProvenance: benchmarkIngestionProvenanceSchema,
    /**
     * @deprecated Do not use `isIngestionBatch`. Offline feed data cannot verify crawler batch execution.
     * Ingestion provenance is represented via `ingestionProvenance` ("suspected_batch" | "unknown").
     * Omitted from benchmark records to avoid falsely encoding unverified provenance as confirmed false or true.
     */
    isIngestionBatch: z.boolean().optional(),
    evidenceLevel: benchmarkEvidenceLevelSchema,
    evidence: z.string().min(1),
    rationale: z.string().min(1),
    verificationSource: benchmarkVerificationSourceSchema,
    missingEvidence: z.string().nullable().optional(),
  }),
});

export type BenchmarkRecordLabel = z.infer<typeof benchmarkRecordLabelSchema>;

/**
 * Schema for an individual ground-truth benchmark record.
 */
export const benchmarkRecordSchema = z.object({
  benchmarkId: z.string().regex(/^BM-\d{3}$/, "Must be BM-xxx"),
  sourceRecordId: z.string().min(1),
  company: z.string(),
  title: z.string(),
  rawUrl: z.string(),
  canonicalUrl: z.string(),
  rawLocation: z.string().nullable(),
  rawCountryCodes: z.array(z.string()),
  atsProvider: z.string(),
  requisitionId: z.string().nullable(),
  postedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  groundTruth: benchmarkRecordLabelSchema,
});

export type BenchmarkRecord = z.infer<typeof benchmarkRecordSchema>;

/**
 * Composition counts summary validating distribution of categories.
 *
 * Authoritative freshness fields:
 * - identicalTimestampPatternRecords (57)
 * - distinctTimestampValuesRecords (43)
 * - unresolvedFreshnessRecords (0)
 */
export const benchmarkCompositionSummarySchema = z.object({
  confirmedDuplicateRecords: z.number().int().nonnegative(),
  distinctRequisitionRecords: z.number().int().nonnegative(),
  uniqueRecords: z.number().int().nonnegative(),
  unresolvedDuplicateRecords: z.number().int().nonnegative(),
  validUsRecords: z.number().int().nonnegative(),
  explicitForeignRecords: z.number().int().nonnegative(),
  metadataDiscrepancyRecords: z.number().int().nonnegative(),
  missingLocationRecords: z.number().int().nonnegative(),
  unresolvedGeographyRecords: z.number().int().nonnegative(),
  identicalTimestampPatternRecords: z.number().int().nonnegative(),
  distinctTimestampValuesRecords: z.number().int().nonnegative(),
  unresolvedFreshnessRecords: z.number().int().nonnegative(),
});

export type BenchmarkCompositionSummary = z.infer<typeof benchmarkCompositionSummarySchema>;

/**
 * Complete Ground-Truth Benchmark Dataset schema.
 */
export const benchmarkDatasetSchema = z.object({
  version: z.literal("1.0"),
  datasetName: z.string().min(1),
  sourceDataset: z.string().min(1),
  description: z.string().min(1),
  createdAt: z.string(),
  totalRecords: z.number().int().min(1).max(100),
  compositionSummary: benchmarkCompositionSummarySchema,
  records: z.array(benchmarkRecordSchema).min(1).max(100),
});

export type BenchmarkDataset = z.infer<typeof benchmarkDatasetSchema>;
