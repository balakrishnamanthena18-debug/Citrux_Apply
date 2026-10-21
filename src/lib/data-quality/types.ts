/**
 * OOS Data Quality & Intelligence — Core Types & Contracts
 * Phase 1: Local Read-Only Job Inventory Audit
 *
 * Enforces frozen decisions:
 * - AI_MODE=offline
 * - DUPLICATE_MASTER_POLICY=none
 * - Read-only audit (zero master selection, zero merging, zero deletion)
 */

export interface FreeHireRawJobRecord {
  public_slug?: string;
  source?: string;
  manually_added?: boolean;
  external_id?: string;
  url: string;
  title: string;
  company?: string;
  company_slug?: string;
  location?: string | null;
  description?: string;
  countries?: string[];
  regions?: string[];
  skills?: string[];
  cities?: string[];
  collections?: unknown[];
  is_tech?: string;
  posted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_seen_at?: string | null;
  closed_at?: string | null;
  enrichment?: {
    category?: string;
    posting_language?: string;
  };
  reality?: {
    class?: string;
    age_days?: number;
    repost_count?: number;
    mass_posting_count?: number;
    fake_freshness?: boolean;
  };
  [key: string]: unknown;
}

export interface AtsIdentifierInfo {
  provider: string; // "taleo" | "ukg_pro" | "ukg_ready" | "greenhouse" | "lever" | "smartrecruiters" | "workday" | "hireology" | "pinpoint" | "breezy" | "generic"
  requisitionId: string | null;
  trackingParametersRemoved: string[];
  canonicalUrl: string;
  isAtsUrl: boolean;
}

export interface NormalizedJobRecord {
  recordId: string;
  publicSlug: string;
  source: string;
  externalId: string;
  rawUrl: string;
  canonicalUrl: string;
  ats: AtsIdentifierInfo;
  rawTitle: string;
  normalizedTitle: string;
  rawCompany: string;
  normalizedCompany: string;
  rawLocation: string | null;
  normalizedLocation: string;
  descriptionSnippet: string;
  postedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSeenAt: string | null;
  rawCountries: string[];
  rawRealityAgeDays: number | null;
}

export type DuplicateConfidence = "high" | "medium" | "low" | "distinct";

export type DuplicateReasonCode =
  | "EXACT_ATS_CANONICAL_URL"
  | "SAME_ATS_REQUISITION_ID"
  | "SAME_EXTERNAL_ID"
  | "SIMILAR_ROLE_DISTINCT_REQUISITION"
  | "UNIQUE_RECORD";

export interface DuplicateCandidateFinding {
  duplicateGroupId: string | null; // null if unique
  isDuplicateCandidate: boolean;
  confidence: DuplicateConfidence;
  reasonCode: DuplicateReasonCode;
  evidence: string;
  candidateIdsInGroup: string[]; // List of all candidate record IDs in the group (no master selected!)
  candidateCountInGroup: number;
}

export type GeographyStatus =
  | "valid_us"
  | "explicit_foreign"
  | "metadata_discrepancy"
  | "missing_location"
  | "ambiguous";

export interface GeographyFinding {
  status: GeographyStatus;
  detectedCountry: string | null;
  rawLocation: string | null;
  rawCountryCodes: string[];
  isDiscrepancy: boolean;
  notes: string;
}

export type FreshnessStatus =
  | "active_signal"
  | "closure_detected"
  | "stale_ingestion"
  | "unknown";

export interface FreshnessFinding {
  status: FreshnessStatus;
  closureSignals: string[];
  suspectedIngestionBatch: boolean;
  postedAt: string | null;
  updatedAt: string | null;
  ageDays: number | null;
  notes: string;
}

export interface AiReviewAssessment {
  used: false; // strictly offline
  status: "needs_review" | "not_needed";
  reason: string;
}

export interface JobAuditFinding {
  recordId: string;
  publicSlug: string;
  externalId: string;
  source: string;
  company: string;
  title: string;
  location: string | null;
  rawUrl: string;
  canonicalUrl: string;
  ats: AtsIdentifierInfo;
  duplicate: DuplicateCandidateFinding;
  geography: GeographyFinding;
  freshness: FreshnessFinding;
  aiReview: AiReviewAssessment;
}

export interface AuditSummary {
  auditTimestamp: string;
  datasetName: string;
  totalRecordsAudited: number;
  aiMode: "offline";
  duplicatePolicy: "none";
  duplicates: {
    totalDuplicateCandidateRecords: number;
    totalDuplicateCandidateGroups: number;
    exactAtsUrlGroups: number;
    distinctSameRoleGroups: number; // e.g. nursing clinical units, distinct craft roles
  };
  geography: {
    validUs: number;
    explicitForeign: number;
    metadataDiscrepancy: number;
    missingLocation: number;
    ambiguous: number;
  };
  freshness: {
    closureDetected: number;
    suspectedIngestionBatchTimestamps: number;
    unknownVacancyStatus: number;
  };
  aiReview: {
    offlineInvocations: 0;
    networkCallsBlocked: 0;
    recordsNeedingHumanReview: number;
  };
}

export interface FullAuditReport {
  summary: AuditSummary;
  findings: JobAuditFinding[];
}
