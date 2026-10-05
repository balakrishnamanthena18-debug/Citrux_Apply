import {
  INTELLIGENCE_READINESS_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
  JOB_REQUIREMENT_SCHEMA_VERSION,
  type FitStatus,
  type ReadinessState,
} from "./constants";
import {
  ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
  type AlignmentEvidencePayload,
  type AlignmentFitItem,
} from "./alignment";
import {
  READINESS_EVIDENCE_SCHEMA_VERSION,
  type ReadinessIssue,
  type DeterministicReadinessResult,
} from "./readiness";
import {
  validateRequirementEvidenceAgainstSnapshot,
  type RequirementCategory,
  type StructuredRequirement,
} from "./requirements-contract";
import { isCanonicalCandidateTruth, type FactProvenanceValue } from "./provenance";
import { ProviderError } from "./providers/errors";

/**
 * Gate 8 — Evidence & Explainability contract.
 * Deterministic only. Does not change Gate 6/7 decision outcomes.
 */

export const EXPLAINABILITY_CONTRACT_VERSION = "explainability.v1";

/** Stable alignment rule identifiers (versionable). */
export const ALIGNMENT_RULE_IDS = {
  SKILL_EXACT: "ALIGN.SKILL.EXACT",
  EXPERIENCE_THRESHOLD: "ALIGN.EXPERIENCE.THRESHOLD",
  EXPERIENCE_AMBIGUOUS: "ALIGN.EXPERIENCE.AMBIGUOUS",
  EDUCATION_DEGREE: "ALIGN.EDUCATION.DEGREE",
  CERTIFICATION_EXACT: "ALIGN.CERTIFICATION.EXACT",
  LOCATION_GEO: "ALIGN.LOCATION.GEO",
  LOCATION_REMOTE: "ALIGN.LOCATION.REMOTE",
  AUTHORIZATION_VERIFIED: "ALIGN.AUTHORIZATION.VERIFIED",
  AUTHORIZATION_AMBIGUOUS: "ALIGN.AUTHORIZATION.AMBIGUOUS",
  SALARY_RANGE: "ALIGN.SALARY.RANGE",
  EMPLOYMENT_TYPE: "ALIGN.EMPLOYMENT_TYPE.EXACT",
  CATEGORY_UNSUPPORTED: "ALIGN.CATEGORY.UNSUPPORTED",
  IMPORTANCE_UNCERTAIN: "ALIGN.IMPORTANCE.UNCERTAIN",
} as const;

export type AlignmentRuleId =
  (typeof ALIGNMENT_RULE_IDS)[keyof typeof ALIGNMENT_RULE_IDS];

/** Stable readiness rule identifiers (versionable). */
export const READINESS_RULE_IDS = {
  MISSING_APPROVAL: "READINESS.MISSING_APPROVAL",
  APPROVAL_REVISION: "READINESS.APPROVAL_REVISION",
  MISSING_RESUME: "READINESS.MISSING_RESUME",
  WRONG_RESUME_VERSION: "READINESS.WRONG_RESUME_VERSION",
  STALE_MATERIAL: "READINESS.STALE_MATERIAL",
  MATERIAL_BINDING: "READINESS.MATERIAL_BINDING",
  RESUME_CANDIDATE_MISMATCH: "READINESS.RESUME_CANDIDATE_MISMATCH",
  QA_FAILED: "READINESS.QA_FAILED",
  QA_INCOMPLETE: "READINESS.QA_INCOMPLETE",
  QA_PENDING: "READINESS.QA_PENDING",
  STALE_ALIGNMENT: "READINESS.STALE_ALIGNMENT",
  STALE_REQUIREMENT_SET: "READINESS.STALE_REQUIREMENT_SET",
  REQUIRED_MISMATCH: "READINESS.REQUIRED_REQUIREMENT_MISMATCH",
  REQUIRED_UNKNOWN: "READINESS.UNKNOWN_REQUIRED_FACT",
  REQUIRED_PARTIAL: "READINESS.REQUIRED_REQUIREMENT_PARTIAL",
  PREFERRED_GAP: "READINESS.PREFERRED_REQUIREMENT_GAP",
  MISSING_SCREENING: "READINESS.MISSING_SCREENING",
  APPLICATION_TERMINAL: "READINESS.APPLICATION_TERMINAL",
  ALREADY_SUBMITTED: "READINESS.ALREADY_SUBMITTED",
  SUBMISSION_CORRECTION: "READINESS.SUBMISSION_CORRECTION_REVIEW",
  GENERIC: "READINESS.CONDITION",
} as const;

export type ReadinessRuleId =
  (typeof READINESS_RULE_IDS)[keyof typeof READINESS_RULE_IDS];

export type ExplainabilityVersions = {
  explainabilityVersion: typeof EXPLAINABILITY_CONTRACT_VERSION;
  evidenceSchemaVersion: string;
  scoringVersion: string;
  readinessVersion?: string;
  normalizationVersion: string;
  requirementSchemaVersion: string;
};

export type EnrichedAlignmentFitItem = AlignmentFitItem & {
  ruleId: AlignmentRuleId;
  explanation: string;
};

export type EnrichedReadinessIssue = ReadinessIssue & {
  ruleId: ReadinessRuleId;
  explanation: string;
};

const READINESS_CODE_TO_RULE: Record<string, ReadinessRuleId> = {
  MISSING_APPROVAL: READINESS_RULE_IDS.MISSING_APPROVAL,
  APPROVAL_REVISION_REQUESTED: READINESS_RULE_IDS.APPROVAL_REVISION,
  MISSING_RESUME: READINESS_RULE_IDS.MISSING_RESUME,
  WRONG_RESUME_VERSION: READINESS_RULE_IDS.WRONG_RESUME_VERSION,
  STALE_MATERIAL: READINESS_RULE_IDS.STALE_MATERIAL,
  FIX_MATERIAL_BINDING: READINESS_RULE_IDS.MATERIAL_BINDING,
  MATERIAL_NOT_RESUME: READINESS_RULE_IDS.MATERIAL_BINDING,
  RESUME_CANDIDATE_MISMATCH: READINESS_RULE_IDS.RESUME_CANDIDATE_MISMATCH,
  QA_FAILED: READINESS_RULE_IDS.QA_FAILED,
  QA_INCOMPLETE: READINESS_RULE_IDS.QA_INCOMPLETE,
  QA_PENDING: READINESS_RULE_IDS.QA_PENDING,
  STALE_ALIGNMENT: READINESS_RULE_IDS.STALE_ALIGNMENT,
  STALE_REQUIREMENT_SET: READINESS_RULE_IDS.STALE_REQUIREMENT_SET,
  REQUIRED_REQUIREMENT_MISMATCH: READINESS_RULE_IDS.REQUIRED_MISMATCH,
  REQUIRED_REQUIREMENT_UNKNOWN: READINESS_RULE_IDS.REQUIRED_UNKNOWN,
  REQUIRED_REQUIREMENT_PARTIAL: READINESS_RULE_IDS.REQUIRED_PARTIAL,
  PREFERRED_REQUIREMENT_GAP: READINESS_RULE_IDS.PREFERRED_GAP,
  MISSING_SCREENING_ANSWERS: READINESS_RULE_IDS.MISSING_SCREENING,
  APPLICATION_TERMINAL: READINESS_RULE_IDS.APPLICATION_TERMINAL,
  ALREADY_SUBMITTED: READINESS_RULE_IDS.ALREADY_SUBMITTED,
  SUBMISSION_CORRECTION_REVIEW: READINESS_RULE_IDS.SUBMISSION_CORRECTION,
};

export function resolveAlignmentRuleId(item: {
  category: RequirementCategory;
  status: FitStatus;
  reason: string;
}): AlignmentRuleId {
  const reason = item.reason.toLowerCase();
  if (/importance is (unknown|needs_review)/i.test(item.reason)) {
    return ALIGNMENT_RULE_IDS.IMPORTANCE_UNCERTAIN;
  }
  switch (item.category) {
    case "REQUIRED_SKILL":
    case "PREFERRED_SKILL":
    case "TECHNOLOGY":
    case "DOMAIN_KNOWLEDGE":
      return ALIGNMENT_RULE_IDS.SKILL_EXACT;
    case "EXPERIENCE":
    case "SENIORITY":
      if (reason.includes("ambiguous") || reason.includes("non-numeric")) {
        return ALIGNMENT_RULE_IDS.EXPERIENCE_AMBIGUOUS;
      }
      return ALIGNMENT_RULE_IDS.EXPERIENCE_THRESHOLD;
    case "EDUCATION":
      return ALIGNMENT_RULE_IDS.EDUCATION_DEGREE;
    case "CERTIFICATION":
      return ALIGNMENT_RULE_IDS.CERTIFICATION_EXACT;
    case "LOCATION":
      return ALIGNMENT_RULE_IDS.LOCATION_GEO;
    case "REMOTE_POLICY":
      return ALIGNMENT_RULE_IDS.LOCATION_REMOTE;
    case "WORK_AUTHORIZATION":
      if (reason.includes("ambiguous") || reason.includes("cannot be deterministically")) {
        return ALIGNMENT_RULE_IDS.AUTHORIZATION_AMBIGUOUS;
      }
      return ALIGNMENT_RULE_IDS.AUTHORIZATION_VERIFIED;
    case "SALARY":
      return ALIGNMENT_RULE_IDS.SALARY_RANGE;
    case "EMPLOYMENT_TYPE":
      return ALIGNMENT_RULE_IDS.EMPLOYMENT_TYPE;
    default:
      return ALIGNMENT_RULE_IDS.CATEGORY_UNSUPPORTED;
  }
}

export function resolveReadinessRuleId(code: string): ReadinessRuleId {
  return READINESS_CODE_TO_RULE[code] ?? READINESS_RULE_IDS.GENERIC;
}

/**
 * Deterministic alignment explanation from structured fit item fields.
 * Does not invent facts. Does not use probabilistic language.
 */
export function buildAlignmentExplanation(item: {
  status: FitStatus;
  requirementValue: string;
  importance: string;
  reason: string;
  candidateEvidence: AlignmentFitItem["candidateEvidence"];
  ruleId?: AlignmentRuleId;
}): string {
  const reqLabel = `${item.requirementValue} (${item.importance})`;
  const evidenceSummary = item.candidateEvidence?.summary
    ? item.candidateEvidence.summary
    : "No authoritative candidate fact is attached";
  const provenance = item.candidateEvidence?.provenance ?? "UNKNOWN";

  // Prefer structured templates; fall back to existing deterministic reason.
  switch (item.status) {
    case "MATCHED":
      return (
        `Requirement "${reqLabel}" is MATCHED. ` +
        `Candidate evidence: ${evidenceSummary} (provenance=${provenance}). ` +
        `Rule: ${item.ruleId ?? resolveAlignmentRuleId(item as AlignmentFitItem)}. ` +
        item.reason
      );
    case "PARTIAL":
      return (
        `Requirement "${reqLabel}" is PARTIAL. ` +
        `Candidate evidence: ${evidenceSummary} (provenance=${provenance}). ` +
        `Rule: ${item.ruleId ?? resolveAlignmentRuleId(item as AlignmentFitItem)}. ` +
        item.reason
      );
    case "MISSING":
      // Gate vocabulary: MISSING == mismatch of available evidence
      return (
        `Requirement "${reqLabel}" is MISSING (deterministic mismatch against available evidence). ` +
        `Candidate evidence: ${evidenceSummary} (provenance=${provenance}). ` +
        `Rule: ${item.ruleId ?? resolveAlignmentRuleId(item as AlignmentFitItem)}. ` +
        item.reason
      );
    case "UNKNOWN":
      return (
        `Requirement "${reqLabel}" is UNKNOWN. ` +
        `Authoritative candidate evidence is not established. ` +
        `Rule: ${item.ruleId ?? resolveAlignmentRuleId(item as AlignmentFitItem)}. ` +
        item.reason +
        " UNKNOWN is not treated as MATCH or MISSING."
      );
    default:
      return item.reason;
  }
}

export function buildReadinessExplanation(issue: ReadinessIssue): string {
  const ruleId = resolveReadinessRuleId(issue.code);
  return (
    `[${issue.severity}] ${issue.message} ` +
    `Why: ${issue.why} ` +
    `Rule: ${ruleId}. ` +
    (issue.resolveAction && issue.resolveAction !== "NONE"
      ? `Resolution: ${issue.resolveAction}.`
      : "No automated resolution action.")
  );
}

export function enrichAlignmentFitItem(
  item: AlignmentFitItem
): EnrichedAlignmentFitItem {
  const ruleId = resolveAlignmentRuleId(item);
  return {
    ...item,
    ruleId,
    explanation: buildAlignmentExplanation({ ...item, ruleId }),
  };
}

export function enrichAlignmentEvidencePayload(
  payload: AlignmentEvidencePayload
): AlignmentEvidencePayload & {
  explainabilityVersion: typeof EXPLAINABILITY_CONTRACT_VERSION;
  fitItems: EnrichedAlignmentFitItem[];
  versions: ExplainabilityVersions;
} {
  const fitItems = payload.fitItems.map(enrichAlignmentFitItem);
  return {
    ...payload,
    fitItems,
    explainabilityVersion: EXPLAINABILITY_CONTRACT_VERSION,
    versions: {
      explainabilityVersion: EXPLAINABILITY_CONTRACT_VERSION,
      evidenceSchemaVersion: payload.schemaVersion,
      scoringVersion: payload.scoringVersion,
      normalizationVersion: payload.normalizationVersion,
      requirementSchemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
    },
  };
}

export function enrichReadinessIssue(issue: ReadinessIssue): EnrichedReadinessIssue {
  const ruleId = resolveReadinessRuleId(issue.code);
  return {
    ...issue,
    ruleId,
    explanation: buildReadinessExplanation(issue),
  };
}

export function enrichReadinessResult(
  result: DeterministicReadinessResult
): DeterministicReadinessResult & {
  blockers: EnrichedReadinessIssue[];
  warnings: EnrichedReadinessIssue[];
  unknowns: EnrichedReadinessIssue[];
  issues: EnrichedReadinessIssue[];
} {
  const issues = result.issues.map(enrichReadinessIssue);
  return {
    ...result,
    blockers: issues.filter((i) => i.severity === "BLOCKER"),
    warnings: issues.filter((i) => i.severity === "WARNING"),
    unknowns: issues.filter((i) => i.severity === "UNKNOWN"),
    issues,
    evidence: {
      ...result.evidence,
      explainabilityVersion: EXPLAINABILITY_CONTRACT_VERSION,
      versions: {
        explainabilityVersion: EXPLAINABILITY_CONTRACT_VERSION,
        evidenceSchemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
        scoringVersion: result.evidence.scoringVersion || INTELLIGENCE_SCORING_VERSION,
        readinessVersion: result.readinessVersion || INTELLIGENCE_READINESS_VERSION,
        normalizationVersion:
          result.evidence.normalizationVersion || JOB_REQUIREMENT_NORMALIZATION_VERSION,
        requirementSchemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      },
    } as DeterministicReadinessResult["evidence"] & {
      explainabilityVersion: string;
      versions: ExplainabilityVersions;
    },
  };
}

/**
 * Validate job requirement evidence against immutable snapshot text.
 * Never invents offsets/quotes.
 */
export function validateJobRequirementEvidence(input: {
  snapshotId: string;
  snapshotText: string;
  requirement: StructuredRequirement;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (input.requirement.evidence.snapshotId !== input.snapshotId) {
    return {
      ok: false,
      code: "EVIDENCE_SNAPSHOT_MISMATCH",
      message: "Requirement evidence snapshotId does not match expected snapshot",
    };
  }
  return validateRequirementEvidenceAgainstSnapshot({
    snapshotId: input.snapshotId,
    snapshotText: input.snapshotText,
    requirement: input.requirement,
  });
}

/**
 * Integrity checks for persisted alignment evidence (no decision changes).
 */
export function validateAlignmentEvidenceIntegrity(input: {
  organizationId: string;
  candidateId: string;
  jobId: string;
  applicationId: string;
  snapshotId: string;
  requirementSetId: string;
  evidence: AlignmentEvidencePayload;
  /** Optional live snapshot text for excerpt validation */
  snapshotText?: string;
  allowedRequirementIds?: Set<string>;
}): { ok: true } | { ok: false; code: string; message: string } {
  const ev = input.evidence;
  if (ev.schemaVersion !== ALIGNMENT_EVIDENCE_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "EVIDENCE_SCHEMA_UNSUPPORTED",
      message: `Unsupported alignment evidence schema ${ev.schemaVersion}`,
    };
  }
  if (ev.snapshotId !== input.snapshotId) {
    return {
      ok: false,
      code: "EVIDENCE_SNAPSHOT_MISMATCH",
      message: "Evidence snapshotId does not match run snapshot",
    };
  }
  if (ev.requirementSetId !== input.requirementSetId) {
    return {
      ok: false,
      code: "EVIDENCE_REQUIREMENT_SET_MISMATCH",
      message: "Evidence requirementSetId does not match bound set",
    };
  }
  if (!ev.scoringVersion || !ev.normalizationVersion) {
    return {
      ok: false,
      code: "EVIDENCE_VERSION_MISSING",
      message: "Evidence missing scoring or normalization version",
    };
  }

  for (const item of ev.fitItems) {
    if (item.requirementEvidence.snapshotId !== input.snapshotId) {
      return {
        ok: false,
        code: "EVIDENCE_REQUIREMENT_SOURCE_INVALID",
        message: "Fit item requirement evidence points at wrong snapshot",
      };
    }
    if (
      input.allowedRequirementIds &&
      !input.allowedRequirementIds.has(item.requirementId)
    ) {
      return {
        ok: false,
        code: "EVIDENCE_REQUIREMENT_NOT_IN_SET",
        message: "Fit item requirementId is not in the requirement set",
      };
    }
    if (input.snapshotText && item.requirementEvidence.excerpt) {
      const fakeReq: StructuredRequirement = {
        id: item.requirementId,
        category: item.category,
        rawValue: item.requirementValue,
        normalizedValue: item.normalizedValue,
        importance: item.importance,
        confidence: null,
        derivation: "AI_EXTRACTED",
        evidence: {
          snapshotId: item.requirementEvidence.snapshotId,
          excerpt: item.requirementEvidence.excerpt,
        },
      };
      const check = validateJobRequirementEvidence({
        snapshotId: input.snapshotId,
        snapshotText: input.snapshotText,
        requirement: fakeReq,
      });
      if (!check.ok) return check;
    }
    if (item.candidateEvidence) {
      if (
        item.status === "MATCHED" ||
        item.status === "PARTIAL"
      ) {
        if (!isCanonicalCandidateTruth(item.candidateEvidence.provenance)) {
          return {
            ok: false,
            code: "EVIDENCE_NON_CANONICAL_TRUTH",
            message:
              "MATCHED/PARTIAL evidence must use canonical candidate provenance",
          };
        }
      }
      if (
        item.candidateEvidence.provenance === "AI_INFERRED" &&
        (item.status === "MATCHED" || item.status === "PARTIAL")
      ) {
        return {
          ok: false,
          code: "EVIDENCE_AI_INFERRED_AS_TRUTH",
          message: "AI_INFERRED must not justify MATCHED/PARTIAL as verified truth",
        };
      }
    }
  }

  return { ok: true };
}

export function validateReadinessEvidenceIntegrity(input: {
  organizationId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  alignmentResultId: string;
  requirementSetId: string;
  snapshotId: string;
  result: DeterministicReadinessResult;
}): { ok: true } | { ok: false; code: string; message: string } {
  const ev = input.result.evidence;
  if (ev.schemaVersion !== READINESS_EVIDENCE_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "EVIDENCE_SCHEMA_UNSUPPORTED",
      message: `Unsupported readiness evidence schema ${ev.schemaVersion}`,
    };
  }
  if (ev.alignmentResultId !== input.alignmentResultId) {
    return {
      ok: false,
      code: "EVIDENCE_ALIGNMENT_MISMATCH",
      message: "Readiness evidence alignmentResultId mismatch",
    };
  }
  if (ev.requirementSetId !== input.requirementSetId) {
    return {
      ok: false,
      code: "EVIDENCE_REQUIREMENT_SET_MISMATCH",
      message: "Readiness evidence requirementSetId mismatch",
    };
  }
  if (ev.snapshotId !== input.snapshotId) {
    return {
      ok: false,
      code: "EVIDENCE_SNAPSHOT_MISMATCH",
      message: "Readiness evidence snapshotId mismatch",
    };
  }
  if (!ev.readinessVersion) {
    return {
      ok: false,
      code: "EVIDENCE_VERSION_MISSING",
      message: "Readiness evidence missing readinessVersion",
    };
  }

  for (const issue of input.result.issues) {
    if (!issue.code || !issue.severity || !issue.message || !issue.why) {
      return {
        ok: false,
        code: "EVIDENCE_ISSUE_INCOMPLETE",
        message: "Readiness issue missing required explainability fields",
      };
    }
  }

  return { ok: true };
}

/**
 * Cross-tenant / cross-candidate evidence scope guard.
 */
export function assertEvidenceAccessScope(input: {
  viewerOrganizationId: string;
  recordOrganizationId: string;
  viewerCandidateId?: string | null;
  recordCandidateId?: string | null;
  role: "CANDIDATE" | "EMPLOYEE" | "ADMIN";
  jobVisibility?: "GLOBAL" | "CANDIDATE_PRIVATE";
  jobOwnerCandidateId?: string | null;
}): void {
  if (input.viewerOrganizationId !== input.recordOrganizationId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Cross-tenant evidence access denied",
      { retryable: false }
    );
  }
  if (
    input.role === "CANDIDATE" &&
    input.viewerCandidateId &&
    input.recordCandidateId &&
    input.viewerCandidateId !== input.recordCandidateId
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Cross-candidate evidence access denied",
      { retryable: false }
    );
  }
  if (
    input.jobVisibility === "CANDIDATE_PRIVATE" &&
    input.role === "CANDIDATE" &&
    input.viewerCandidateId &&
    input.jobOwnerCandidateId !== input.viewerCandidateId
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Private job evidence access denied",
      { retryable: false }
    );
  }
}

/**
 * Historical reproducibility: explanations must come from persisted payload,
 * not re-queried mutable candidate/job rows.
 */
export function explainFromPersistedAlignmentEvidence(
  evidence: AlignmentEvidencePayload
): Array<{
  requirementId: string;
  status: FitStatus;
  ruleId: AlignmentRuleId;
  explanation: string;
  scoringVersion: string;
  normalizationVersion: string;
  snapshotId: string;
}> {
  return evidence.fitItems.map((item) => {
    const enriched = enrichAlignmentFitItem(item);
    return {
      requirementId: enriched.requirementId,
      status: enriched.status,
      ruleId: enriched.ruleId,
      explanation: enriched.explanation,
      scoringVersion: evidence.scoringVersion,
      normalizationVersion: evidence.normalizationVersion,
      snapshotId: evidence.snapshotId,
    };
  });
}

export function explainFromPersistedReadinessResult(
  result: DeterministicReadinessResult
): {
  readinessState: ReadinessState;
  readinessVersion: string;
  issues: EnrichedReadinessIssue[];
} {
  const enriched = enrichReadinessResult(result);
  return {
    readinessState: enriched.readinessState,
    readinessVersion: enriched.readinessVersion,
    issues: enriched.issues,
  };
}

export function assertNoProbabilisticExplanationLanguage(text: string): void {
  if (/\b(probably|likely|appears|seems|might|maybe)\b/i.test(text)) {
    throw new Error(
      "Explainability forbids probabilistic language in deterministic explanations"
    );
  }
}

export function provenanceIsPresentableAsVerified(
  provenance: FactProvenanceValue
): boolean {
  return provenance === "VERIFIED";
}
