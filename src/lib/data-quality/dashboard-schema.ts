/**
 * OOS Data Quality & Intelligence — Phase 2 Dashboard Schemas & Contracts
 *
 * Enforces:
 * - Runtime Zod validation for imported Phase 1 JSON reports
 * - Local review state contracts (unreviewed, reviewed, needs_review)
 * - Deterministic finding fingerprinting for safe client-side persistence
 */

import { z } from "zod";

/**
 * Zod schema validating the actual Phase 1 FullAuditReport JSON structure.
 */
export const atsIdentifierInfoSchema = z.object({
  provider: z.string(),
  requisitionId: z.string().nullable().optional(),
  trackingParametersRemoved: z.array(z.string()).default([]),
  canonicalUrl: z.string(),
  isAtsUrl: z.boolean().default(false),
});

export const duplicateCandidateFindingSchema = z.object({
  duplicateGroupId: z.string().nullable().optional(),
  isDuplicateCandidate: z.boolean(),
  confidence: z.enum(["high", "medium", "low", "distinct"]),
  reasonCode: z.enum([
    "EXACT_ATS_CANONICAL_URL",
    "SAME_ATS_REQUISITION_ID",
    "SAME_EXTERNAL_ID",
    "SIMILAR_ROLE_DISTINCT_REQUISITION",
    "UNIQUE_RECORD",
  ]),
  evidence: z.string(),
  candidateIdsInGroup: z.array(z.string()).default([]),
  candidateCountInGroup: z.number().default(1),
});

export const geographyFindingSchema = z.object({
  status: z.enum([
    "valid_us",
    "explicit_foreign",
    "metadata_discrepancy",
    "missing_location",
    "ambiguous",
  ]),
  detectedCountry: z.string().nullable().optional(),
  rawLocation: z.string().nullable().optional(),
  rawCountryCodes: z.array(z.string()).default([]),
  isDiscrepancy: z.boolean().default(false),
  notes: z.string().default(""),
});

export const freshnessFindingSchema = z.object({
  status: z.enum([
    "active_signal",
    "closure_detected",
    "stale_ingestion",
    "unknown",
  ]),
  closureSignals: z.array(z.string()).default([]),
  suspectedIngestionBatch: z.boolean().default(false),
  postedAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  ageDays: z.number().nullable().optional(),
  notes: z.string().default(""),
});

export const aiReviewAssessmentSchema = z.object({
  used: z.literal(false),
  status: z.enum(["needs_review", "not_needed"]),
  reason: z.string().default(""),
});

export const jobAuditFindingSchema = z.object({
  recordId: z.string(),
  publicSlug: z.string().default(""),
  externalId: z.string().default(""),
  source: z.string().default(""),
  company: z.string().default(""),
  title: z.string().default(""),
  location: z.string().nullable().optional(),
  rawUrl: z.string().default(""),
  canonicalUrl: z.string().default(""),
  ats: atsIdentifierInfoSchema,
  duplicate: duplicateCandidateFindingSchema,
  geography: geographyFindingSchema,
  freshness: freshnessFindingSchema,
  aiReview: aiReviewAssessmentSchema,
});

export const auditSummarySchema = z.object({
  auditTimestamp: z.string(),
  datasetName: z.string(),
  totalRecordsAudited: z.number(),
  aiMode: z.literal("offline"),
  duplicatePolicy: z.literal("none"),
  duplicates: z.object({
    totalDuplicateCandidateRecords: z.number(),
    totalDuplicateCandidateGroups: z.number(),
    exactAtsUrlGroups: z.number(),
    distinctSameRoleGroups: z.number(),
  }),
  geography: z.object({
    validUs: z.number(),
    explicitForeign: z.number(),
    metadataDiscrepancy: z.number(),
    missingLocation: z.number(),
    ambiguous: z.number(),
  }),
  freshness: z.object({
    closureDetected: z.number(),
    suspectedIngestionBatchTimestamps: z.number(),
    unknownVacancyStatus: z.number(),
  }),
  aiReview: z.object({
    offlineInvocations: z.literal(0),
    networkCallsBlocked: z.number(),
    recordsNeedingHumanReview: z.number(),
  }),
});

export const fullAuditReportSchema = z.object({
  summary: auditSummarySchema,
  findings: z.array(jobAuditFindingSchema),
});

export type ValidatedAuditReport = z.infer<typeof fullAuditReportSchema>;
export type ValidatedJobFinding = z.infer<typeof jobAuditFindingSchema>;

/**
 * Permitted human review statuses.
 * Per frozen contract: only unreviewed, reviewed, and needs_review are allowed.
 */
export type ReviewStatus = "unreviewed" | "reviewed" | "needs_review";

export const reviewStatusSchema = z.enum(["unreviewed", "reviewed", "needs_review"]);

export const findingReviewEntrySchema = z.object({
  fingerprint: z.string(),
  recordId: z.string(),
  status: reviewStatusSchema,
  notes: z.string().optional(),
  updatedAt: z.string(),
});

export const reviewStateBackupSchema = z.object({
  version: z.literal("1.0"),
  exportedAt: z.string(),
  datasetName: z.string(),
  reviews: z.record(z.string(), findingReviewEntrySchema),
});

export type FindingReviewEntry = z.infer<typeof findingReviewEntrySchema>;
export type ReviewStateBackup = z.infer<typeof reviewStateBackupSchema>;

/**
 * Creates a deterministic, stable fingerprint for a finding.
 * If finding details change, the fingerprint changes, preventing stale review statuses
 * from silently sticking to altered records.
 */
export function computeFindingFingerprint(finding: ValidatedJobFinding): string {
  const parts = [
    finding.recordId,
    finding.canonicalUrl,
    finding.ats.requisitionId ?? "no-req",
    finding.duplicate.duplicateGroupId ?? "no-group",
    finding.duplicate.reasonCode,
    finding.geography.status,
    finding.freshness.status,
  ].join("|");

  // Simple, fast deterministic hash for browser runtime
  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    const char = parts.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `fp_${Math.abs(hash).toString(16)}`;
}

/**
 * Validates that a URL is a valid web address with http: or https: scheme.
 * Defends against unsafe schemes (e.g. javascript:, data:, vbscript:) in imported reports.
 */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
