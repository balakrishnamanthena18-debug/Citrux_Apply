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

export const findingSeveritySchema = z.enum([
  "Critical",
  "High",
  "Medium",
  "Low",
  "Informational",
]);

export const findingCategorySchema = z.enum([
  "confirmed_finding",
  "suspected_anomaly",
  "recommendation",
  "limitation",
]);

export const auditDimensionSchema = z.enum([
  "duplicate_detection",
  "geographic_quality",
  "freshness_and_vacancy",
  "source_and_ingestion_quality",
  "application_url_quality",
  "unsupported_fields",
]);

export const findingEvidenceItemSchema = z.object({
  findingId: z.string(),
  dimension: auditDimensionSchema,
  severity: findingSeveritySchema,
  category: findingCategorySchema,
  confidence: z.enum(["high", "medium", "low", "distinct"]),
  affectedRecordIds: z.array(z.string()).default([]),
  observedEvidence: z.string(),
  reasonFlagged: z.string(),
  recommendedAction: z.string(),
  verificationStatus: z.enum(["confirmed", "needs_review", "unverified"]),
});

export const sourceQualityFindingSchema = z.object({
  status: z.enum([
    "healthy",
    "missing_required_fields",
    "malformed_record",
    "anomalous_ingestion",
  ]),
  source: z.string(),
  missingFields: z.array(z.string()).default([]),
  malformedFields: z.array(z.string()).default([]),
  sourceReliability: z.enum(["high", "moderate", "low"]),
  notes: z.string().default(""),
});

export const urlQualityFindingSchema = z.object({
  status: z.enum(["valid_syntax", "malformed_syntax", "missing_url"]),
  syntaxValid: z.boolean(),
  liveCheckStatus: z.enum([
    "untested",
    "reachable",
    "redirected",
    "unavailable",
    "blocked",
    "connection_error",
  ]),
  httpStatus: z.number().nullable().optional(),
  titleMatchScore: z.number().nullable().optional(),
  closureSignals: z.array(z.string()).default([]),
  checkedAt: z.string().nullable().optional(),
  notes: z.string().default(""),
});

export const jobAuditFindingSchema = z.object({
  recordId: z.string(),
  publicSlug: z.string().default(""),
  externalId: z.string().default(""),
  source: z.string().default(""),
  company: z.string().default(""),
  title: z.string().default(""),
  location: z.string().nullable().optional(),
  normalizedLocation: z.string().optional(),
  rawUrl: z.string().default(""),
  canonicalUrl: z.string().default(""),
  ats: atsIdentifierInfoSchema,
  duplicate: duplicateCandidateFindingSchema,
  geography: geographyFindingSchema,
  freshness: freshnessFindingSchema,
  aiReview: aiReviewAssessmentSchema,
  // Extended audit dimensions (optional with defaults for backwards-compatibility)
  sourceQuality: sourceQualityFindingSchema.optional(),
  urlQuality: urlQualityFindingSchema.optional(),
  severity: findingSeveritySchema.optional(),
  findingCategory: findingCategorySchema.optional(),
  evidenceItems: z.array(findingEvidenceItemSchema).optional(),
  unsupportedFieldsPresent: z.array(z.string()).optional(),
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
  // Extended summaries (optional for backwards-compatibility)
  severityCounts: z
    .object({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
      low: z.number(),
      informational: z.number(),
    })
    .optional(),
  categoryCounts: z
    .object({
      confirmedFindings: z.number(),
      suspectedAnomalies: z.number(),
      recommendations: z.number(),
      limitations: z.number(),
    })
    .optional(),
  sourceQuality: z
    .object({
      healthy: z.number(),
      missingFields: z.number(),
      malformedRecords: z.number(),
      anomalousIngestion: z.number(),
      sourceBreakdown: z.record(z.number()),
    })
    .optional(),
  urlQuality: z
    .object({
      validSyntax: z.number(),
      malformedSyntax: z.number(),
      missingUrl: z.number(),
      liveTested: z.number(),
      reachable: z.number(),
      closureDetected: z.number(),
      unavailable: z.number(),
      connectionError: z.number(),
      untested: z.number(),
    })
    .optional(),
  unsupportedFieldsObserved: z.array(z.string()).optional(),
  domainFilter: z.string().optional(),
  domainFilterStats: z
    .object({
      domain: z.string(),
      totalInspected: z.number(),
      matchedRecords: z.number(),
      excludedRecords: z.number(),
      moduleBreakdown: z.record(z.number()).optional(),
    })
    .optional(),
});

export const fullAuditReportSchema = z.object({
  summary: auditSummarySchema,
  findings: z.array(jobAuditFindingSchema),
});

export type ValidatedAuditReport = z.infer<typeof fullAuditReportSchema>;
export type ValidatedJobFinding = z.infer<typeof jobAuditFindingSchema>;

/**
 * Permitted human review statuses.
 * Per frozen contract: only unreviewed, reviewed, and needs_review are allowed at the legacy tier.
 */
export type ReviewStatus = "unreviewed" | "reviewed" | "needs_review";

export const reviewStatusSchema = z.enum(["unreviewed", "reviewed", "needs_review"]);

/**
 * Stage 5: Four mutually exclusive evidence tiers plus historical unstructured tier.
 */
export const evidenceTierSchema = z.enum([
  "EVIDENCE_OBSERVED",
  "EVIDENCE_INACCESSIBLE",
  "EVIDENCE_CONFLICTING",
  "EVIDENCE_INSUFFICIENT",
  "EVIDENCE_HISTORICAL_UNSTRUCTURED",
]);
export type EvidenceTier = z.infer<typeof evidenceTierSchema>;

/**
 * Stage 5: Structured operational review dispositions.
 */
export const reviewDispositionSchema = z.enum([
  "UNREVIEWED",
  "ESCALATED_NEEDS_FURTHER_EVIDENCE",
  "DUPLICATE_CONFIRMED_REDUNDANT",
  "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT",
  "GEO_CONFIRMED_DOMESTIC_US",
  "GEO_CONFIRMED_FOREIGN",
  "GEO_METADATA_COLLISION_VERIFIED",
  "TEMPORAL_VERIFIED_ACTIVE",
  "TEMPORAL_VERIFIED_CLOSED",
  "LEGACY_REVIEWED_UNSTRUCTURED",
]);
export type ReviewDisposition = z.infer<typeof reviewDispositionSchema>;

/**
 * Maps a Stage 5 structured disposition to the Phase 2 legacy tri-state status.
 */
export function toLegacyReviewStatus(disposition: ReviewDisposition): ReviewStatus {
  switch (disposition) {
    case "UNREVIEWED":
      return "unreviewed";
    case "ESCALATED_NEEDS_FURTHER_EVIDENCE":
      return "needs_review";
    case "LEGACY_REVIEWED_UNSTRUCTURED":
    case "DUPLICATE_CONFIRMED_REDUNDANT":
    case "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT":
    case "GEO_CONFIRMED_DOMESTIC_US":
    case "GEO_CONFIRMED_FOREIGN":
    case "GEO_METADATA_COLLISION_VERIFIED":
    case "TEMPORAL_VERIFIED_ACTIVE":
    case "TEMPORAL_VERIFIED_CLOSED":
      return "reviewed";
  }
}

/**
 * Required checklist items per disposition family to prevent evidence-gating bypasses.
 */
export const REQUIRED_CHECKLIST_ITEMS_BY_DISPOSITION: Record<ReviewDisposition, string[]> = {
  UNREVIEWED: [],
  ESCALATED_NEEDS_FURTHER_EVIDENCE: [],
  LEGACY_REVIEWED_UNSTRUCTURED: [],
  DUPLICATE_CONFIRMED_REDUNDANT: ["urlInspected", "requisitionCompared"],
  DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT: ["urlInspected", "requisitionCompared"],
  GEO_CONFIRMED_DOMESTIC_US: ["locationExamined", "entityLocationVerified"],
  GEO_CONFIRMED_FOREIGN: ["locationExamined", "entityLocationVerified"],
  GEO_METADATA_COLLISION_VERIFIED: ["locationExamined", "entityLocationVerified"],
  TEMPORAL_VERIFIED_ACTIVE: ["vacancyStatusVerified", "closureSignalsChecked"],
  TEMPORAL_VERIFIED_CLOSED: ["vacancyStatusVerified", "closureSignalsChecked"],
};

export function getRequiredChecklistItems(disposition: ReviewDisposition): string[] {
  return REQUIRED_CHECKLIST_ITEMS_BY_DISPOSITION[disposition] ?? [];
}

/**
 * Validates that an evidence tier is legally compatible with the proposed disposition,
 * and enforces applicable review checklist completion for confirmed outcomes.
 * Insufficient, inaccessible, or conflicting evidence MUST NOT produce a confirmed outcome;
 * they strictly mandate ESCALATED_NEEDS_FURTHER_EVIDENCE.
 */
export function validateEvidenceGatedDisposition(
  disposition: ReviewDisposition,
  evidenceTier: EvidenceTier,
  checklist?: Record<string, boolean>
): { isValid: boolean; error?: string } {
  if (disposition === "UNREVIEWED") {
    return { isValid: true };
  }

  const nonConfirmedTiers: EvidenceTier[] = [
    "EVIDENCE_INSUFFICIENT",
    "EVIDENCE_INACCESSIBLE",
    "EVIDENCE_CONFLICTING",
  ];

  if (nonConfirmedTiers.includes(evidenceTier)) {
    if (disposition !== "ESCALATED_NEEDS_FURTHER_EVIDENCE") {
      return {
        isValid: false,
        error: `Evidence tier "${evidenceTier}" is non-conclusive and strictly requires disposition "ESCALATED_NEEDS_FURTHER_EVIDENCE". Confirmed outcomes are prohibited without observed primary evidence.`,
      };
    }
    return { isValid: true };
  }

  if (evidenceTier === "EVIDENCE_HISTORICAL_UNSTRUCTURED") {
    if (disposition !== "LEGACY_REVIEWED_UNSTRUCTURED") {
      return {
        isValid: false,
        error: `Evidence tier "EVIDENCE_HISTORICAL_UNSTRUCTURED" applies exclusively to historical unverified reviews ("LEGACY_REVIEWED_UNSTRUCTURED"). Fresh reviews must cite current primary evidence.`,
      };
    }
    return { isValid: true };
  }

  if (evidenceTier === "EVIDENCE_OBSERVED") {
    const requiredChecklist = getRequiredChecklistItems(disposition);
    if (requiredChecklist.length > 0) {
      if (!checklist || typeof checklist !== "object") {
        return {
          isValid: false,
          error: `Disposition "${disposition}" under EVIDENCE_OBSERVED mandates completion of checklist items: ${requiredChecklist.join(", ")}. Checklist is missing or incomplete.`,
        };
      }
      const missing = requiredChecklist.filter((k) => checklist[k] !== true);
      if (missing.length > 0) {
        return {
          isValid: false,
          error: `Disposition "${disposition}" under EVIDENCE_OBSERVED mandates completion of checklist items: ${missing.join(", ")}. Incomplete checklist cannot be accepted.`,
        };
      }
    }
    return { isValid: true };
  }

  return { isValid: true };
}

/**
 * Structured audit trail entry representing an individual human review action.
 * Reviewer identity represents operational attribution metadata, not cryptographic signature.
 */
export const reviewAuditLogEntrySchema = z.object({
  auditId: z.string(),
  recordId: z.string(),
  fingerprint: z.string(),
  datasetName: z.string(),
  disposition: reviewDispositionSchema,
  evidenceTier: evidenceTierSchema,
  verificationSource: z.string().min(1),
  checklist: z.record(z.string(), z.boolean()).default({}),
  reviewerUserId: z.string().optional(),
  reviewerEmail: z.string().optional(),
  notes: z.string().default(""),
  reviewedAt: z.string(),
});
export type ReviewAuditLogEntry = z.infer<typeof reviewAuditLogEntrySchema>;

export const findingReviewEntrySchema = z.object({
  fingerprint: z.string(),
  recordId: z.string(),
  status: reviewStatusSchema,
  disposition: reviewDispositionSchema.optional(),
  evidenceTier: evidenceTierSchema.optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
  reviewerEmail: z.string().optional(),
  verificationSource: z.string().optional(),
  notes: z.string().optional(),
  history: z.array(reviewAuditLogEntrySchema).optional(),
  updatedAt: z.string(),
  isStaleFingerprint: z.boolean().optional(),
});
export type FindingReviewEntry = z.infer<typeof findingReviewEntrySchema>;

export const reviewStateBackupSchema = z.object({
  version: z.enum(["1.0", "2.0"]),
  exportedAt: z.string(),
  datasetName: z.string(),
  trustModelNotice: z.string().optional(),
  reviews: z.record(z.string(), findingReviewEntrySchema),
});
export type ReviewStateBackup = z.infer<typeof reviewStateBackupSchema>;

export const FINGERPRINT_VERSION = "2.0";

/**
 * Normalized factual payload used exclusively for deterministic fingerprint hashing.
 * Distinguishes identity fields from algorithmic finding state fields.
 */
export interface CanonicalFindingFingerprintPayload {
  version: "2.0";
  identity: {
    atsProvider: string;
    canonicalUrl: string;
    recordId: string;
    requisitionId: string | null;
    sourceRecordId: string;
  };
  state: {
    candidateCountInGroup: number;
    duplicateConfidence: string;
    duplicateGroupId: string | null;
    duplicateReasonCode: string;
    freshnessStatus: string;
    freshnessSuspectedBatch: boolean;
    geographyDetectedCountry: string | null;
    geographyRawCountryCodes: string[];
    geographyRawLocation: string | null;
    geographyStatus: string;
  };
}

/**
 * Normalizes a nullable string while strictly preserving the distinction between
 * null/undefined (absent), "" (empty string), and normalized non-empty strings.
 */
export function normalizeNullableString(val: string | null | undefined): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  return val.normalize("NFC").trim();
}

/**
 * Serializes factual inputs into canonical RFC 8785 JSON representation.
 * Keys are strictly sorted, strings are NFC normalized and trimmed,
 * and arrays are lowercased and sorted ascending.
 */
export function serializeCanonicalFingerprintPayload(
  finding: ValidatedJobFinding
): string {
  const payload: CanonicalFindingFingerprintPayload = {
    version: "2.0",
    identity: {
      atsProvider: (finding.ats.provider || finding.source || "")
        .normalize("NFC")
        .trim()
        .toLowerCase(),
      canonicalUrl: (finding.canonicalUrl || "")
        .normalize("NFC")
        .trim()
        .toLowerCase(),
      recordId: (finding.recordId || "").normalize("NFC").trim(),
      requisitionId: normalizeNullableString(finding.ats.requisitionId),
      sourceRecordId: (finding.externalId || "").normalize("NFC").trim(),
    },
    state: {
      candidateCountInGroup:
        typeof finding.duplicate.candidateCountInGroup === "number"
          ? finding.duplicate.candidateCountInGroup
          : 1,
      duplicateConfidence: finding.duplicate.confidence,
      duplicateGroupId: normalizeNullableString(finding.duplicate.duplicateGroupId),
      duplicateReasonCode: finding.duplicate.reasonCode,
      freshnessStatus: finding.freshness.status,
      freshnessSuspectedBatch: Boolean(finding.freshness.suspectedIngestionBatch),
      geographyDetectedCountry: normalizeNullableString(finding.geography.detectedCountry),
      geographyRawCountryCodes: Array.from(
        new Set(
          (finding.geography.rawCountryCodes || []).map((c) =>
            c.normalize("NFC").trim().toLowerCase()
          )
        )
      ).sort(),
      geographyRawLocation: normalizeNullableString(finding.geography.rawLocation),
      geographyStatus: finding.geography.status,
    },
  };

  return JSON.stringify(payload);
}

/**
 * Pure synchronous standard FIPS 180-4 SHA-256 implementation with UTF-8 byte encoding.
 * Operates deterministically without external dependencies or asynchronous Web Crypto requirements.
 */
export function sha256Hex(str: string): string {
  // 1. UTF-8 byte encoding
  const ascii = unescape(encodeURIComponent(str));

  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = "length";
  let i = 0;
  let j = 0;
  let result = "";
  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = true;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let formatted = ascii + "\x80";
  while ((formatted[lengthProperty] % 64) - 56) formatted += "\x00";
  for (i = 0; i < formatted[lengthProperty]; i++) {
    j = formatted.charCodeAt(i);
    words[i >> 2] = (words[i >> 2] ?? 0) | (j << (((3 - i) % 4) * 8));
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 =
        rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 =
        rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = i < 16 ? (w[i] ?? 0) : ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) | 0;
      const ch = (hash[4]! & hash[5]!) ^ (~hash[4]! & hash[6]!);
      const maj =
        (hash[0]! & hash[1]!) ^ (hash[0]! & hash[2]!) ^ (hash[1]! & hash[2]!);
      const s0_round =
        rightRotate(hash[0]!, 2) ^
        rightRotate(hash[0]!, 13) ^
        rightRotate(hash[0]!, 22);
      const s1_round =
        rightRotate(hash[4]!, 6) ^
        rightRotate(hash[4]!, 11) ^
        rightRotate(hash[4]!, 25);
      const temp1 = hash[7]! + s1_round + ch + k[i]! + w[i]!;
      const temp2 = s0_round + maj;
      hash[7] = hash[6]!;
      hash[6] = hash[5]!;
      hash[5] = hash[4]!;
      hash[4] = (hash[3]! + temp1) | 0;
      hash[3] = hash[2]!;
      hash[2] = hash[1]!;
      hash[1] = hash[0]!;
      hash[0] = (temp1 + temp2) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i]! + oldHash[i]!) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i]! >> (b * 8)) & 255;
      result += (byte < 16 ? "0" : "") + byte.toString(16);
    }
  }
  return result;
}

/**
 * Creates a collision-resistant, versioned SHA-256 fingerprint for a finding.
 * Format: `fp_v2_<64_char_hex>`
 *
 * Security Notice: The fingerprint detects changes in raw finding data.
 * It is NOT proof of reviewer identity or tamper-proof storage.
 */
export function computeFindingFingerprintV2(finding: ValidatedJobFinding): string {
  const serialized = serializeCanonicalFingerprintPayload(finding);
  const digest = sha256Hex(serialized);
  return `fp_v2_${digest}`;
}

/**
 * Phase 2 legacy 32-bit FNV-1a fingerprint generator preserved strictly for verifying
 * historical reviews and backups.
 */
export function computeFindingFingerprintLegacy(finding: ValidatedJobFinding): string {
  const parts = [
    finding.recordId,
    finding.canonicalUrl,
    finding.ats.requisitionId ?? "no-req",
    finding.duplicate.duplicateGroupId ?? "no-group",
    finding.duplicate.reasonCode,
    finding.geography.status,
    finding.freshness.status,
  ].join("|");

  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    const char = parts.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(16)}`;
}

/**
 * Primary export: delegates to versioned SHA-256 canonical generator.
 */
export function computeFindingFingerprint(finding: ValidatedJobFinding): string {
  return computeFindingFingerprintV2(finding);
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
