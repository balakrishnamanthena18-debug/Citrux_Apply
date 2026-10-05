/**
 * Phase 2 Design Lock — intelligence visibility classification.
 * Data/authorization contract only; no UI rendering here.
 */

export const INTELLIGENCE_VISIBILITY_CLASS = [
  "CANDIDATE_VISIBLE",
  "STAFF_ONLY",
  "INTERNAL_SYSTEM",
] as const;

export type IntelligenceVisibilityClass =
  (typeof INTELLIGENCE_VISIBILITY_CLASS)[number];

/**
 * Locked field classes. Staff = EMPLOYEE (incl. TL/Manager designations) + ADMIN.
 * INTERNAL_SYSTEM must never render in product UI.
 */
export const INTELLIGENCE_VISIBILITY_MATRIX = {
  alignmentOverallScore: "CANDIDATE_VISIBLE",
  dimensionScores: "CANDIDATE_VISIBLE",
  fitItems: "CANDIDATE_VISIBLE",
  candidateRelevantEvidence: "CANDIDATE_VISIBLE",
  readinessState: "CANDIDATE_VISIBLE",
  candidateSafeBlockersWarnings: "CANDIDATE_VISIBLE",
  candidateSafeNextActions: "CANDIDATE_VISIBLE",
  pendingStaleUnavailableMessaging: "CANDIDATE_VISIBLE",

  qaCriterionCorrelation: "STAFF_ONLY",
  qaNotes: "STAFF_ONLY",
  internalOperationalRecommendations: "STAFF_ONLY",
  analysisMetadata: "STAFF_ONLY",
  failureDiagnostics: "STAFF_ONLY",

  rawProviderPayload: "INTERNAL_SYSTEM",
  prompts: "INTERNAL_SYSTEM",
  securityMetadata: "INTERNAL_SYSTEM",
  executionDiagnostics: "INTERNAL_SYSTEM",
} as const satisfies Record<string, IntelligenceVisibilityClass>;

/** Credentials are never a visibility class — they must not be stored or exposed. */
export const CREDENTIALS_NEVER_EXPOSED = true;

export function isCandidateVisible(
  field: keyof typeof INTELLIGENCE_VISIBILITY_MATRIX
): boolean {
  return INTELLIGENCE_VISIBILITY_MATRIX[field] === "CANDIDATE_VISIBLE";
}

export function isStaffOnly(
  field: keyof typeof INTELLIGENCE_VISIBILITY_MATRIX
): boolean {
  return INTELLIGENCE_VISIBILITY_MATRIX[field] === "STAFF_ONLY";
}

export function isInternalSystem(
  field: keyof typeof INTELLIGENCE_VISIBILITY_MATRIX
): boolean {
  return INTELLIGENCE_VISIBILITY_MATRIX[field] === "INTERNAL_SYSTEM";
}
