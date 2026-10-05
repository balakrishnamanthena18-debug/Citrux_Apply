import type { AuditAction } from "@/generated/prisma";

/**
 * Audit contract for intelligence operations.
 * Never log API keys, provider credentials, or unnecessary PII dumps.
 */

export const INTELLIGENCE_AUDIT_ACTIONS = {
  snapshotCaptured: "JOB_DESCRIPTION_SNAPSHOT_CAPTURED",
  /** Gate 2 alias preferred in docs: JD_SNAPSHOT_CREATED → JOB_DESCRIPTION_SNAPSHOT_CAPTURED */
  jdSnapshotCreated: "JOB_DESCRIPTION_SNAPSHOT_CAPTURED",
  requirementSetCreated: "JOB_REQUIREMENT_SET_CREATED",
  requirementSetInvalidated: "JOB_REQUIREMENT_SET_INVALIDATED",
  requested: "APPLICATION_INTELLIGENCE_REQUESTED",
  started: "APPLICATION_INTELLIGENCE_STARTED",
  completed: "APPLICATION_INTELLIGENCE_COMPLETED",
  failed: "APPLICATION_INTELLIGENCE_FAILED",
  invalidated: "APPLICATION_INTELLIGENCE_INVALIDATED",
  markedStale: "APPLICATION_INTELLIGENCE_MARKED_STALE",
  recomputeRequested: "APPLICATION_INTELLIGENCE_RECOMPUTE_REQUESTED",
  /** Gate 3 AI execution lifecycle aliases (no separate enum values required). */
  aiAnalysisRequested: "APPLICATION_INTELLIGENCE_REQUESTED",
  aiAnalysisStarted: "APPLICATION_INTELLIGENCE_STARTED",
  aiAnalysisSucceeded: "APPLICATION_INTELLIGENCE_COMPLETED",
  aiAnalysisFailed: "APPLICATION_INTELLIGENCE_FAILED",
  /**
   * Gate 5 extraction lifecycle aliases.
   * Persist via APPLICATION_INTELLIGENCE_* + details.auditAlias / analysisPurpose.
   */
  extractionRequested: "APPLICATION_INTELLIGENCE_REQUESTED",
  extractionStarted: "APPLICATION_INTELLIGENCE_STARTED",
  extractionCompleted: "APPLICATION_INTELLIGENCE_COMPLETED",
  extractionFailed: "APPLICATION_INTELLIGENCE_FAILED",
  /** Gate 6 alignment lifecycle aliases. */
  alignmentRequested: "APPLICATION_INTELLIGENCE_REQUESTED",
  alignmentStarted: "APPLICATION_INTELLIGENCE_STARTED",
  alignmentCompleted: "APPLICATION_INTELLIGENCE_COMPLETED",
  alignmentFailed: "APPLICATION_INTELLIGENCE_FAILED",
  alignmentInvalidated: "APPLICATION_INTELLIGENCE_INVALIDATED",
  /** Gate 7 readiness lifecycle aliases. */
  readinessRequested: "APPLICATION_INTELLIGENCE_REQUESTED",
  readinessStarted: "APPLICATION_INTELLIGENCE_STARTED",
  readinessCompleted: "APPLICATION_INTELLIGENCE_COMPLETED",
  readinessFailed: "APPLICATION_INTELLIGENCE_FAILED",
  readinessInvalidated: "APPLICATION_INTELLIGENCE_INVALIDATED",
  /** Gate 8 evidence lifecycle aliases. */
  evidenceCreated: "APPLICATION_INTELLIGENCE_COMPLETED",
  evidenceValidated: "APPLICATION_INTELLIGENCE_COMPLETED",
  evidenceInvalidated: "APPLICATION_INTELLIGENCE_INVALIDATED",
  explanationGenerated: "APPLICATION_INTELLIGENCE_COMPLETED",
} as const satisfies Record<string, AuditAction>;

/** Doc-facing Gate 5 audit names (stored in details.auditAlias). */
export const GATE5_EXTRACTION_AUDIT_ALIASES = {
  requested: "JOB_REQUIREMENT_EXTRACTION_REQUESTED",
  started: "JOB_REQUIREMENT_EXTRACTION_STARTED",
  completed: "JOB_REQUIREMENT_EXTRACTION_COMPLETED",
  failed: "JOB_REQUIREMENT_EXTRACTION_FAILED",
  setCreated: "JOB_REQUIREMENT_SET_CREATED",
  setInvalidated: "JOB_REQUIREMENT_SET_INVALIDATED",
} as const;

/** Doc-facing Gate 6 audit names (stored in details.auditAlias). */
export const GATE6_ALIGNMENT_AUDIT_ALIASES = {
  requested: "ALIGNMENT_REQUESTED",
  started: "ALIGNMENT_STARTED",
  completed: "ALIGNMENT_COMPLETED",
  failed: "ALIGNMENT_FAILED",
  invalidated: "ALIGNMENT_INVALIDATED",
} as const;

/** Doc-facing Gate 7 audit names (stored in details.auditAlias). */
export const GATE7_READINESS_AUDIT_ALIASES = {
  requested: "READINESS_REQUESTED",
  started: "READINESS_STARTED",
  completed: "READINESS_COMPLETED",
  blocked: "READINESS_BLOCKED",
  reviewRequired: "READINESS_REVIEW_REQUIRED",
  failed: "READINESS_FAILED",
  invalidated: "READINESS_INVALIDATED",
} as const;

/** Doc-facing Gate 8 audit names (stored in details.auditAlias). */
export const GATE8_EVIDENCE_AUDIT_ALIASES = {
  created: "EVIDENCE_CREATED",
  validated: "EVIDENCE_VALIDATED",
  invalidated: "EVIDENCE_INVALIDATED",
  explanationGenerated: "EXPLANATION_GENERATED",
} as const;

export type IntelligenceAuditDetails = {
  applicationId?: string;
  candidateId?: string;
  jobId?: string;
  snapshotId?: string;
  runId?: string;
  requirementSetId?: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  schemaVersion?: string;
  scoringVersion?: string;
  errorCode?: string;
  /** Forbidden keys must never appear. */
  apiKey?: never;
  providerCredential?: never;
  authorizationHeader?: never;
};

export function sanitizeIntelligenceAuditDetails(
  details: Record<string, unknown>
): Record<string, unknown> {
  const banned = [
    "apiKey",
    "api_key",
    "providerCredential",
    "authorization",
    "Authorization",
    "password",
    "secret",
    "token",
  ];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (banned.some((b) => k.toLowerCase().includes(b.toLowerCase()))) continue;
    out[k] = v;
  }
  return out;
}
