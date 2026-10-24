/**
 * OOS Data Quality & Intelligence — Reconciled Reporting Types & Schemas
 *
 * Defines runtime Zod validation and TypeScript contracts for the
 * pure reconciled reporting engine (Stage 6.3A).
 *
 * Strict Principles:
 * - Distinguishes automated algorithmic findings from human review outcomes.
 * - Explicitly tracks evidence provenance, verification status, and checklist completion.
 * - Unverified conditions (stale, legacy, escalated, quarantined, unreviewed)
 *   are NEVER silently promoted to verified outcomes.
 * - Preserves orphaned reviews in a dedicated section without corrupting finding denominators.
 * - Labels exports as unsigned snapshots of locally stored working state.
 */

import { z } from "zod";
import {
  evidenceTierSchema,
  reviewDispositionSchema,
  reviewStatusSchema,
} from "./dashboard-schema";

export const RECONCILED_REPORT_VERSION = "1.0" as const;

export const RECONCILED_TRUST_MODEL_NOTICE =
  "Notice: Review records and operational attribution are stored locally in client browser storage and verified through deterministic SHA-256 data fingerprints. This artifact represents an unsigned operational snapshot of local working state and does NOT constitute a cryptographically signed PKI audit log or tamper-proof compliance ledger." as const;

/**
 * Mutually exclusive reconciliation states for an audited finding or orphaned review.
 */
export const reconciliationStatusSchema = z.enum([
  "evidence_verified",
  "unreviewed",
  "legacy_unstructured_review",
  "escalated_needs_evidence",
  "stale_review",
  "quarantined_invalid_review",
  "orphaned_review",
]);

export type ReconciliationStatus = z.infer<typeof reconciliationStatusSchema>;

/**
 * Algorithmic assessment output from Phase 1 rule execution.
 */
export const reconciledAlgorithmicAssessmentSchema = z.object({
  duplicate: z.object({
    isDuplicateCandidate: z.boolean(),
    confidence: z.enum(["high", "medium", "low", "distinct"]),
    reasonCode: z.string(),
    duplicateGroupId: z.string().nullable().optional(),
    candidateCountInGroup: z.number().int().nonnegative(),
    evidence: z.string(),
  }),
  geography: z.object({
    status: z.enum([
      "valid_us",
      "explicit_foreign",
      "metadata_discrepancy",
      "missing_location",
      "ambiguous",
    ]),
    detectedCountry: z.string().nullable().optional(),
    rawLocation: z.string().nullable().optional(),
    rawCountryCodes: z.array(z.string()),
    isDiscrepancy: z.boolean(),
  }),
  freshness: z.object({
    status: z.enum([
      "active_signal",
      "closure_detected",
      "stale_ingestion",
      "unknown",
    ]),
    closureSignals: z.array(z.string()),
    suspectedIngestionBatch: z.boolean(),
    postedAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    ageDays: z.number().nullable().optional(),
  }),
});

export type ReconciledAlgorithmicAssessment = z.infer<
  typeof reconciledAlgorithmicAssessmentSchema
>;

/**
 * Human review decision and evidence provenance from browser storage.
 */
export const reconciledHumanReviewOutcomeSchema = z.object({
  status: reviewStatusSchema,
  disposition: reviewDispositionSchema.nullable(),
  evidenceTier: evidenceTierSchema.nullable(),
  verificationSource: z.string().nullable(),
  checklistCompleted: z.record(z.string(), z.boolean()),
  auditorNotes: z.string().nullable(),
  reviewerAttribution: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});

export type ReconciledHumanReviewOutcome = z.infer<
  typeof reconciledHumanReviewOutcomeSchema
>;

/**
 * Fingerprint verification and quarantine metadata.
 */
export const reconciledIntegritySchema = z.object({
  currentFingerprint: z.string(),
  storedFingerprint: z.string().nullable(),
  fingerprintVersion: z.string(),
  isStaleFingerprint: z.boolean(),
  isQuarantined: z.boolean(),
  quarantineReason: z.string().nullable(),
});

export type ReconciledIntegrity = z.infer<typeof reconciledIntegritySchema>;

/**
 * Final reconciled resolution classification and actionability.
 */
export const reconciledResolutionSchema = z.object({
  reconciliationStatus: reconciliationStatusSchema,
  isVerifiedOutcome: z.boolean(),
  unresolvedReason: z.string().nullable(),
  requiredNextAction: z.string().nullable(),
});

export type ReconciledResolution = z.infer<typeof reconciledResolutionSchema>;

/**
 * Reconciled finding combining algorithmic findings with review state.
 */
export const reconciledFindingEntrySchema = z.object({
  recordId: z.string(),
  publicSlug: z.string().default(""),
  externalId: z.string().default(""),
  source: z.string().default(""),
  company: z.string().default(""),
  title: z.string().default(""),
  rawLocation: z.string().nullable().optional(),
  rawUrl: z.string().default(""),
  canonicalUrl: z.string().default(""),
  atsProvider: z.string(),
  atsRequisitionId: z.string().nullable().optional(),
  algorithmicAssessment: reconciledAlgorithmicAssessmentSchema,
  humanReviewOutcome: reconciledHumanReviewOutcomeSchema,
  integrity: reconciledIntegritySchema,
  resolution: reconciledResolutionSchema,
});

export type ReconciledFindingEntry = z.infer<typeof reconciledFindingEntrySchema>;

/**
 * Orphaned review entry representing stored reviews for records absent from the audit report.
 */
export const orphanedReviewEntrySchema = z.object({
  recordId: z.string(),
  storedFingerprint: z.string(),
  status: reviewStatusSchema,
  disposition: reviewDispositionSchema.nullable().optional(),
  evidenceTier: evidenceTierSchema.nullable().optional(),
  verificationSource: z.string().nullable().optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
  auditorNotes: z.string().nullable().optional(),
  reviewerAttribution: z.string().nullable().optional(),
  updatedAt: z.string(),
  reconciliationStatus: z.literal("orphaned_review"),
  unresolvedReason: z.string(),
  requiredNextAction: z.string(),
});

export type OrphanedReviewEntry = z.infer<typeof orphanedReviewEntrySchema>;

/**
 * Summary breakdown of findings and reconciliation resolution.
 */
export const reconciledReportSummarySchema = z.object({
  totalRecordsAudited: z.number().int().nonnegative(),
  totalFindingsInReport: z.number().int().nonnegative(),
  uniqueRecordsWithFindings: z.number().int().nonnegative(),
  reconciliationBreakdown: z.object({
    evidenceVerified: z.number().int().nonnegative(),
    unreviewed: z.number().int().nonnegative(),
    escalatedNeedsEvidence: z.number().int().nonnegative(),
    staleReview: z.number().int().nonnegative(),
    legacyUnstructured: z.number().int().nonnegative(),
    quarantinedInvalid: z.number().int().nonnegative(),
    orphanedReviews: z.number().int().nonnegative(),
  }),
  dimensionBreakdown: z.object({
    duplicate: z.object({
      totalFlagged: z.number().int().nonnegative(),
      confirmedRedundant: z.number().int().nonnegative(),
      confirmedDistinct: z.number().int().nonnegative(),
      escalated: z.number().int().nonnegative(),
      unreviewed: z.number().int().nonnegative(),
      staleReview: z.number().int().nonnegative().default(0),
      legacyUnstructured: z.number().int().nonnegative().default(0),
      quarantinedInvalid: z.number().int().nonnegative().default(0),
    }),
    geography: z.object({
      totalFlagged: z.number().int().nonnegative(),
      confirmedUs: z.number().int().nonnegative(),
      confirmedForeign: z.number().int().nonnegative(),
      verifiedCollision: z.number().int().nonnegative(),
      escalated: z.number().int().nonnegative(),
      unreviewed: z.number().int().nonnegative(),
      staleReview: z.number().int().nonnegative().default(0),
      legacyUnstructured: z.number().int().nonnegative().default(0),
      quarantinedInvalid: z.number().int().nonnegative().default(0),
    }),
    freshness: z.object({
      totalFlagged: z.number().int().nonnegative(),
      verifiedActive: z.number().int().nonnegative(),
      verifiedClosed: z.number().int().nonnegative(),
      escalated: z.number().int().nonnegative(),
      unreviewed: z.number().int().nonnegative(),
      staleReview: z.number().int().nonnegative().default(0),
      legacyUnstructured: z.number().int().nonnegative().default(0),
      quarantinedInvalid: z.number().int().nonnegative().default(0),
    }),
  }),
});

export type ReconciledReportSummary = z.infer<
  typeof reconciledReportSummarySchema
>;

/**
 * Complete Reconciled Audit Report schema (v1.0).
 */
export const reconciledAuditReportJsonSchema = z.object({
  schemaVersion: z.literal("1.0"),
  reportTitle: z.string().min(1),
  datasetName: z.string().min(1),
  generatedAt: z.string(),
  generatorVersion: z.string(),
  trustModelNotice: z.string(),
  summary: reconciledReportSummarySchema,
  reconciledFindings: z.array(reconciledFindingEntrySchema),
  orphanedReviews: z.array(orphanedReviewEntrySchema),
});

export type ReconciledAuditReportJson = z.infer<
  typeof reconciledAuditReportJsonSchema
>;

/**
 * Options for pure reconciliation execution.
 */
export interface ReconcileOptions {
  reviewDatasetName?: string;
  allowCrossDataset?: boolean;
  reportTitle?: string;
  generatedAt?: string;
  generatorVersion?: string;
}

/**
 * Options for CSV export.
 */
export interface CsvExportOptions {
  includeBom?: boolean;
  lineEnding?: "\r\n" | "\n";
  includeOrphanedReviews?: boolean;
}
