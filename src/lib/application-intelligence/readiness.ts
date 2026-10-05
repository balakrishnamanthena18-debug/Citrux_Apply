import crypto from "crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma";
import { AuditAction } from "@/generated/prisma";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ANALYSIS_PURPOSE,
  INTELLIGENCE_READINESS_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
  NULL_MODEL_ID,
  NULL_PROVIDER_ID,
  READINESS_STATES,
  type FitStatus,
  type ReadinessState,
} from "./constants";
import {
  GATE7_READINESS_AUDIT_ALIASES,
  sanitizeIntelligenceAuditDetails,
} from "./audit-contract";
import { validateMaterialDocumentBinding } from "./materials-contract";
import { assertIntelligenceScopeComplete } from "./security";
import { ProviderError } from "./providers/errors";
import type { AlignmentEvidencePayload, AlignmentFitItem } from "./alignment";
import { ALIGNMENT_EVIDENCE_SCHEMA_VERSION } from "./alignment";
import { captureJobDescriptionSnapshot } from "./jd-snapshot";
import { buildSourceDataVersion } from "./stale";

export const READINESS_EVIDENCE_SCHEMA_VERSION = "readiness-evidence.v1";

export type ReadinessIssueSeverity = "BLOCKER" | "WARNING" | "UNKNOWN";

export type ReadinessIssue = {
  code: string;
  severity: ReadinessIssueSeverity;
  message: string;
  why: string;
  evidence: Record<string, unknown>;
  resolveAction: string;
  /** Gate 8 explainability — attached at persist/enrich boundary. */
  ruleId?: string;
  explanation?: string;
};

export type ReadinessNextAction = {
  code: string;
  label: string;
  relatedIssueCodes: string[];
};

export type ReadinessInputView = {
  organizationId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  applicationStatus: string;
  approvalStatus: string | null;
  authorizationMode: "MANAGED" | "REVIEW_REQUIRED";
  jobVisibility: "GLOBAL" | "CANDIDATE_PRIVATE";
  jobOwnerCandidateId: string | null;
  alignment: {
    id: string;
    runId: string;
    freshness: string;
    scoringVersion: string;
    overallScore: number | null;
    snapshotId: string;
    requirementSetId: string;
    fitItems: AlignmentFitItem[];
    candidateFactVersion: string;
  };
  requirementSet: {
    id: string;
    snapshotId: string;
    freshness: string;
  };
  material: {
    id: string | null;
    isCurrent: boolean;
    candidateDocumentId: string | null;
    documentVersion: number | null;
    documentType: string | null;
    documentVersionNumber: number | null;
    documentCandidateId: string | null;
    screeningAnswers: unknown;
  } | null;
  qa: {
    id: string | null;
    decision: "PASS" | "FAIL" | null;
    verifiedCount: number;
    criterionCount: number;
  };
};

export type DeterministicReadinessResult = {
  readinessVersion: string;
  readinessState: ReadinessState;
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  unknowns: ReadinessIssue[];
  nextActions: ReadinessNextAction[];
  issues: ReadinessIssue[];
  evidence: {
    schemaVersion: typeof READINESS_EVIDENCE_SCHEMA_VERSION;
    readinessVersion: string;
    alignmentResultId: string;
    requirementSetId: string;
    snapshotId: string;
    scoringVersion: string;
    normalizationVersion: string;
    candidateFactVersion: string;
    applicationStatus: string;
    approvalStatus: string | null;
    authorizationMode: string;
    llmCalls: 0;
  };
};

const TERMINAL_STATUSES = new Set([
  "REJECTED",
  "WITHDRAWN",
  "FAILED",
]);

const POST_SUBMIT_STATUSES = new Set([
  "SUBMITTED",
  "SUBMISSION_ISSUE",
  "REVIEW_REQUIRED",
  "CORRECTION_APPROVED",
  "RESUBMISSION",
]);

const QA_EXPECTED_STATUSES = new Set([
  "REVIEW",
  "AWAITING_APPROVAL",
  "READY",
  "SUBMITTED",
  "SUBMISSION_ISSUE",
  "CORRECTION_APPROVED",
  "RESUBMISSION",
]);

function issue(
  partial: ReadinessIssue
): ReadinessIssue {
  return partial;
}

function deriveState(issues: ReadinessIssue[]): ReadinessState {
  const hasBlocker = issues.some((i) => i.severity === "BLOCKER");
  const hasReview = issues.some(
    (i) =>
      i.code === "MISSING_APPROVAL" ||
      i.code === "APPROVAL_REVISION_REQUESTED" ||
      i.resolveAction === "REQUEST_CANDIDATE_APPROVAL"
  );
  const hasUnknown = issues.some((i) => i.severity === "UNKNOWN");
  const hasWarning = issues.some((i) => i.severity === "WARNING");

  if (hasBlocker && hasReview && !issues.some((i) =>
    i.severity === "BLOCKER" &&
    i.code !== "MISSING_APPROVAL" &&
    i.code !== "APPROVAL_REVISION_REQUESTED"
  )) {
    return "REVIEW_REQUIRED";
  }
  if (hasBlocker) return "BLOCKED";
  if (hasReview) return "REVIEW_REQUIRED";
  if (hasUnknown) return "UNKNOWN";
  if (hasWarning) return "READY_WITH_WARNINGS";
  return "READY";
}

function deriveNextActions(issues: ReadinessIssue[]): ReadinessNextAction[] {
  const byAction = new Map<string, string[]>();
  for (const i of issues) {
    if (!i.resolveAction) continue;
    const list = byAction.get(i.resolveAction) ?? [];
    list.push(i.code);
    byAction.set(i.resolveAction, list);
  }

  const labels: Record<string, string> = {
    REQUEST_CANDIDATE_APPROVAL: "Request candidate approval",
    RESOLVE_QA_ISSUE: "Resolve QA issue",
    COMPLETE_QA: "Complete QA review",
    ATTACH_RESUME: "Attach resume material",
    FIX_MATERIAL_BINDING: "Fix resume document binding",
    REQUEST_CANDIDATE_INFORMATION: "Request candidate information",
    RECOMPUTE_ALIGNMENT: "Recompute alignment",
    COMPLETE_SCREENING: "Complete screening answers",
    NONE: "No action",
  };

  return Array.from(byAction.entries())
    .filter(([code]) => code !== "NONE")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, relatedIssueCodes]) => ({
      code,
      label: labels[code] ?? code,
      relatedIssueCodes: relatedIssueCodes.sort(),
    }));
}

/**
 * Pure deterministic readiness evaluation. No LLM. No I/O. No lifecycle mutation.
 */
export function computeDeterministicReadiness(
  input: ReadinessInputView
): DeterministicReadinessResult {
  if (!(READINESS_STATES as readonly string[]).includes("READY")) {
    throw new Error("Readiness states contract missing");
  }

  if (
    input.jobVisibility === "CANDIDATE_PRIVATE" &&
    input.jobOwnerCandidateId !== input.candidateId
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Private job readiness denied for this candidate",
      { retryable: false }
    );
  }

  if (input.alignment.requirementSetId !== input.requirementSet.id) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Alignment requirement set does not match readiness requirement set",
      { retryable: false }
    );
  }
  if (input.alignment.snapshotId !== input.requirementSet.snapshotId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Alignment snapshot does not match requirement set snapshot",
      { retryable: false }
    );
  }

  const issues: ReadinessIssue[] = [];

  // Lifecycle protection — advisory only; never mutate status.
  if (TERMINAL_STATUSES.has(input.applicationStatus)) {
    issues.push(
      issue({
        code: "APPLICATION_TERMINAL",
        severity: "UNKNOWN",
        message: `Application is terminal (${input.applicationStatus}).`,
        why: "Terminal applications must not receive a misleading current readiness advisory for submission.",
        evidence: { applicationStatus: input.applicationStatus },
        resolveAction: "NONE",
      })
    );
  } else if (POST_SUBMIT_STATUSES.has(input.applicationStatus)) {
    if (input.applicationStatus === "SUBMITTED") {
      issues.push(
        issue({
          code: "ALREADY_SUBMITTED",
          severity: "BLOCKER",
          message: "Application is already SUBMITTED.",
          why: "Readiness advisory does not authorize or re-open submission.",
          evidence: { applicationStatus: input.applicationStatus },
          resolveAction: "NONE",
        })
      );
    } else if (input.applicationStatus === "REVIEW_REQUIRED") {
      issues.push(
        issue({
          code: "SUBMISSION_CORRECTION_REVIEW",
          severity: "BLOCKER",
          message: "Application is in post-submission REVIEW_REQUIRED.",
          why: "Correction review must follow the submission lifecycle, not readiness advisory.",
          evidence: { applicationStatus: input.applicationStatus },
          resolveAction: "RESOLVE_QA_ISSUE",
        })
      );
    }
  }

  // Alignment freshness / binding
  if (input.alignment.freshness !== "CURRENT") {
    issues.push(
      issue({
        code: "STALE_ALIGNMENT",
        severity: "UNKNOWN",
        message: `Alignment freshness is ${input.alignment.freshness}.`,
        why: "Stale alignment must not be treated as current readiness input.",
        evidence: {
          alignmentResultId: input.alignment.id,
          freshness: input.alignment.freshness,
        },
        resolveAction: "RECOMPUTE_ALIGNMENT",
      })
    );
  }
  if (input.requirementSet.freshness !== "CURRENT") {
    issues.push(
      issue({
        code: "STALE_REQUIREMENT_SET",
        severity: "UNKNOWN",
        message: `Requirement set freshness is ${input.requirementSet.freshness}.`,
        why: "Stale requirement sets invalidate current readiness.",
        evidence: {
          requirementSetId: input.requirementSet.id,
          freshness: input.requirementSet.freshness,
        },
        resolveAction: "RECOMPUTE_ALIGNMENT",
      })
    );
  }

  // Required / preferred alignment consumption (Gate 6 fit items — do not rescore)
  for (const fit of input.alignment.fitItems) {
    const status = fit.status as FitStatus;
    const required = fit.importance === "REQUIRED";
    if (required && status === "MISSING") {
      issues.push(
        issue({
          code: "REQUIRED_REQUIREMENT_MISMATCH",
          severity: "BLOCKER",
          message: `Required requirement missing: ${fit.requirementValue}.`,
          why: "Required job requirements must not be MISSING for safe proceed.",
          evidence: {
            requirementId: fit.requirementId,
            category: fit.category,
            status,
            importance: fit.importance,
          },
          resolveAction: "REQUEST_CANDIDATE_INFORMATION",
        })
      );
    } else if (required && status === "UNKNOWN") {
      issues.push(
        issue({
          code: "REQUIRED_REQUIREMENT_UNKNOWN",
          severity: "UNKNOWN",
          message: `Required requirement unknown: ${fit.requirementValue}.`,
          why: "Missing candidate evidence must remain UNKNOWN, not treated as MATCH.",
          evidence: {
            requirementId: fit.requirementId,
            category: fit.category,
            status,
          },
          resolveAction: "REQUEST_CANDIDATE_INFORMATION",
        })
      );
    } else if (required && status === "PARTIAL") {
      issues.push(
        issue({
          code: "REQUIRED_REQUIREMENT_PARTIAL",
          severity: "WARNING",
          message: `Required requirement only partially met: ${fit.requirementValue}.`,
          why: "Partial required matches need attention; no automatic fail threshold invented.",
          evidence: {
            requirementId: fit.requirementId,
            status,
            reason: fit.reason,
          },
          resolveAction: "REQUEST_CANDIDATE_INFORMATION",
        })
      );
    } else if (!required && (status === "MISSING" || status === "PARTIAL")) {
      issues.push(
        issue({
          code: "PREFERRED_REQUIREMENT_GAP",
          severity: "WARNING",
          message: `Preferred requirement gap: ${fit.requirementValue} (${status}).`,
          why: "Preferred requirements must not silently become mandatory blockers.",
          evidence: {
            requirementId: fit.requirementId,
            importance: fit.importance,
            status,
          },
          resolveAction: "NONE",
        })
      );
    }
  }

  // Materials / resume binding
  if (!input.material || !input.material.id) {
    issues.push(
      issue({
        code: "MISSING_RESUME",
        severity: "BLOCKER",
        message: "No current application material package is attached.",
        why: "Applications require an application material package with resume binding where workflow expects it.",
        evidence: { materialId: null },
        resolveAction: "ATTACH_RESUME",
      })
    );
  } else {
    if (!input.material.isCurrent) {
      issues.push(
        issue({
          code: "STALE_MATERIAL",
          severity: "BLOCKER",
          message: "Application material is not marked current.",
          why: "Only the current material package is authoritative for readiness.",
          evidence: { materialId: input.material.id, isCurrent: false },
          resolveAction: "ATTACH_RESUME",
        })
      );
    }
    if (!input.material.candidateDocumentId) {
      issues.push(
        issue({
          code: "MISSING_RESUME",
          severity: "BLOCKER",
          message: "Current material has no bound candidate resume document.",
          why: "Resume document binding is required for readiness advisory.",
          evidence: { materialId: input.material.id },
          resolveAction: "ATTACH_RESUME",
        })
      );
    } else {
      if (
        input.material.documentCandidateId &&
        input.material.documentCandidateId !== input.candidateId
      ) {
        issues.push(
          issue({
            code: "RESUME_CANDIDATE_MISMATCH",
            severity: "BLOCKER",
            message: "Bound document belongs to a different candidate.",
            why: "Never silently substitute another candidate's document.",
            evidence: {
              materialId: input.material.id,
              documentCandidateId: input.material.documentCandidateId,
            },
            resolveAction: "FIX_MATERIAL_BINDING",
          })
        );
      }
      const binding = validateMaterialDocumentBinding({
        candidateDocumentId: input.material.candidateDocumentId,
        documentVersion: input.material.documentVersion,
        documentVersionNumber: input.material.documentVersionNumber,
        documentType: input.material.documentType,
      });
      if (!binding.ok) {
        issues.push(
          issue({
            code:
              binding.code === "MATERIAL_VERSION_MISMATCH"
                ? "WRONG_RESUME_VERSION"
                : binding.code === "MATERIAL_NOT_RESUME"
                  ? "MATERIAL_NOT_RESUME"
                  : "FIX_MATERIAL_BINDING",
            severity: "BLOCKER",
            message: binding.message,
            why: "Resume + exact document version must remain bound to the application material.",
            evidence: {
              materialId: input.material.id,
              documentVersion: input.material.documentVersion,
              documentVersionNumber: input.material.documentVersionNumber,
              documentType: input.material.documentType,
            },
            resolveAction: "FIX_MATERIAL_BINDING",
          })
        );
      }
    }

    // Screening answers — only warn when answers object is explicitly empty/absent
    // after materials exist; do not fabricate answers.
    const answers = input.material.screeningAnswers;
    const missingScreening =
      answers == null ||
      (typeof answers === "object" &&
        !Array.isArray(answers) &&
        Object.keys(answers as object).length === 0) ||
      (Array.isArray(answers) && answers.length === 0);
    if (missingScreening && QA_EXPECTED_STATUSES.has(input.applicationStatus)) {
      issues.push(
        issue({
          code: "MISSING_SCREENING_ANSWERS",
          severity: "WARNING",
          message: "Screening answers are missing on the current material.",
          why: "Required screening/application data must exist when the workflow expects them; missing data is not invented.",
          evidence: { materialId: input.material.id, screeningAnswers: null },
          resolveAction: "COMPLETE_SCREENING",
        })
      );
    }
  }

  // QA — consume existing reviews; never modify QA
  if (input.qa.decision === "FAIL") {
    issues.push(
      issue({
        code: "QA_FAILED",
        severity: "BLOCKER",
        message: "Latest QA review decision is FAIL.",
        why: "Readiness must not bypass failed QA.",
        evidence: {
          qaReviewId: input.qa.id,
          decision: input.qa.decision,
        },
        resolveAction: "RESOLVE_QA_ISSUE",
      })
    );
  } else if (
    QA_EXPECTED_STATUSES.has(input.applicationStatus) &&
    input.qa.decision == null
  ) {
    issues.push(
      issue({
        code: "QA_INCOMPLETE",
        severity: "BLOCKER",
        message: "No passing QA review exists for this application stage.",
        why: "QA is a prerequisite before readiness can advise proceed at this lifecycle stage.",
        evidence: {
          applicationStatus: input.applicationStatus,
          qaReviewId: null,
        },
        resolveAction: "COMPLETE_QA",
      })
    );
  } else if (
    input.applicationStatus === "PREPARING" &&
    input.qa.decision == null
  ) {
    issues.push(
      issue({
        code: "QA_PENDING",
        severity: "WARNING",
        message: "QA has not been completed yet (application still PREPARING).",
        why: "QA is expected later in the lifecycle; not a hard blocker while preparing.",
        evidence: { applicationStatus: input.applicationStatus },
        resolveAction: "COMPLETE_QA",
      })
    );
  }

  // Approval / authorization modes
  if (input.authorizationMode === "REVIEW_REQUIRED") {
    if (input.approvalStatus !== "APPROVED") {
      issues.push(
        issue({
          code:
            input.approvalStatus === "REVISION_REQUESTED"
              ? "APPROVAL_REVISION_REQUESTED"
              : "MISSING_APPROVAL",
          severity: "BLOCKER",
          message:
            input.approvalStatus === "REVISION_REQUESTED"
              ? "Candidate requested revisions; approval is not current."
              : "Candidate approval is required under REVIEW_REQUIRED authorization.",
          why: "REVIEW_REQUIRED mode remains review-dependent until approval exists.",
          evidence: {
            authorizationMode: input.authorizationMode,
            approvalStatus: input.approvalStatus,
          },
          resolveAction: "REQUEST_CANDIDATE_APPROVAL",
        })
      );
    }
  } else if (input.authorizationMode === "MANAGED") {
    // MANAGED: do not invent a per-application approval requirement.
    // If lifecycle already staged AWAITING_APPROVAL with PENDING, surface review.
    if (
      input.applicationStatus === "AWAITING_APPROVAL" &&
      input.approvalStatus === "PENDING"
    ) {
      issues.push(
        issue({
          code: "MISSING_APPROVAL",
          severity: "BLOCKER",
          message: "Application is awaiting candidate approval.",
          why: "Existing lifecycle staged approval; readiness must not bypass it.",
          evidence: {
            authorizationMode: "MANAGED",
            approvalStatus: "PENDING",
            applicationStatus: input.applicationStatus,
          },
          resolveAction: "REQUEST_CANDIDATE_APPROVAL",
        })
      );
    }
  }

  const readinessState = TERMINAL_STATUSES.has(input.applicationStatus)
    ? "UNKNOWN"
    : deriveState(issues);

  const blockers = issues.filter((i) => i.severity === "BLOCKER");
  const warnings = issues.filter((i) => i.severity === "WARNING");
  const unknowns = issues.filter((i) => i.severity === "UNKNOWN");

  return {
    readinessVersion: INTELLIGENCE_READINESS_VERSION,
    readinessState,
    blockers,
    warnings,
    unknowns,
    nextActions: deriveNextActions(issues),
    issues: issues.sort((a, b) => a.code.localeCompare(b.code)),
    evidence: {
      schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
      readinessVersion: INTELLIGENCE_READINESS_VERSION,
      alignmentResultId: input.alignment.id,
      requirementSetId: input.requirementSet.id,
      snapshotId: input.requirementSet.snapshotId,
      scoringVersion: input.alignment.scoringVersion,
      normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
      candidateFactVersion: input.alignment.candidateFactVersion,
      applicationStatus: input.applicationStatus,
      approvalStatus: input.approvalStatus,
      authorizationMode: input.authorizationMode,
      llmCalls: 0,
    },
  };
}

function parseAlignmentEvidence(raw: unknown): {
  fitItems: AlignmentFitItem[];
  snapshotId: string | null;
  requirementSetId: string | null;
  candidateFactVersion: string;
} {
  if (!raw || typeof raw !== "object") {
    return {
      fitItems: [],
      snapshotId: null,
      requirementSetId: null,
      candidateFactVersion: "unknown",
    };
  }
  const ev = raw as Partial<AlignmentEvidencePayload>;
  return {
    fitItems: Array.isArray(ev.fitItems) ? (ev.fitItems as AlignmentFitItem[]) : [],
    snapshotId: typeof ev.snapshotId === "string" ? ev.snapshotId : null,
    requirementSetId:
      typeof ev.requirementSetId === "string" ? ev.requirementSetId : null,
    candidateFactVersion:
      typeof ev.candidateFactVersion === "string"
        ? ev.candidateFactVersion
        : "unknown",
  };
}

export type RequestReadinessInput = {
  organizationId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  requestedById: string;
  candidateUpdatedAt: Date | string;
  materialsFingerprint?: string;
};

function buildReadinessIdempotencyKey(parts: {
  applicationId: string;
  alignmentResultId: string;
  requirementSetId: string;
  candidateFactVersion: string;
  materialFingerprint: string;
  approvalStatus: string;
  qaDecision: string;
  applicationStatus: string;
  readinessVersion: string;
}): string {
  const material = [
    ANALYSIS_PURPOSE.APPLICATION_READINESS,
    parts.applicationId,
    parts.alignmentResultId,
    parts.requirementSetId,
    parts.candidateFactVersion,
    parts.materialFingerprint,
    parts.approvalStatus,
    parts.qaDecision,
    parts.applicationStatus,
    parts.readinessVersion,
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 64);
}

/**
 * Queue APPLICATION_READINESS run. Does NOT call LLM. Does NOT mutate lifecycle.
 */
export async function requestApplicationReadiness(
  tx: Prisma.TransactionClient,
  input: RequestReadinessInput
): Promise<{
  runId: string;
  snapshotId: string;
  alignmentResultId: string;
  created: boolean;
  status: "QUEUED" | "RUNNING" | "RETRY_PENDING" | "SUCCEEDED" | "FAILED";
}> {
  assertIntelligenceScopeComplete({
    organizationId: input.organizationId,
    candidateId: input.candidateId,
    applicationId: input.applicationId,
    jobId: input.jobId,
  });

  const application = await tx.application.findFirst({
    where: {
      id: input.applicationId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
    },
    select: {
      id: true,
      status: true,
      approvalStatus: true,
      job: {
        select: {
          id: true,
          organizationId: true,
          jobDescription: true,
          externalUrl: true,
          source: true,
          updatedAt: true,
          visibility: true,
          ownerCandidateId: true,
        },
      },
      candidate: {
        select: {
          applicationAuthorizationMode: true,
          updatedAt: true,
        },
      },
      materials: {
        where: { isCurrent: true },
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          candidateDocumentId: true,
          documentVersion: true,
        },
      },
      qaReviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, decision: true },
      },
    },
  });

  if (!application) {
    throw new Error("Application scope mismatch for readiness request");
  }
  if (
    application.job.visibility === "CANDIDATE_PRIVATE" &&
    application.job.ownerCandidateId !== input.candidateId
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Private job readiness denied for this candidate",
      { retryable: false }
    );
  }

  const snapshot = await captureJobDescriptionSnapshot(
    tx,
    application.job,
    input.requestedById
  );

  const alignment = await tx.applicationAlignmentResult.findFirst({
    where: {
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      freshness: "CURRENT",
      run: {
        analysisPurpose: ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
        snapshotId: snapshot.id,
        status: "SUCCEEDED",
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      runId: true,
      scoringVersion: true,
      evidence: true,
      run: { select: { requirementSetId: true, snapshotId: true } },
    },
  });

  if (!alignment || !alignment.run.requirementSetId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "CURRENT ApplicationAlignmentResult for this snapshot is required before readiness",
      { retryable: false }
    );
  }

  const parsed = parseAlignmentEvidence(alignment.evidence);
  const requirementSetId =
    parsed.requirementSetId ?? alignment.run.requirementSetId;

  const materialFp =
    input.materialsFingerprint ??
    `mat:${application.materials[0]?.id ?? "none"}:${application.materials[0]?.documentVersion ?? "x"}`;

  const idempotencyKey = buildReadinessIdempotencyKey({
    applicationId: input.applicationId,
    alignmentResultId: alignment.id,
    requirementSetId,
    candidateFactVersion: parsed.candidateFactVersion,
    materialFingerprint: materialFp,
    approvalStatus: application.approvalStatus ?? "NONE",
    qaDecision: application.qaReviews[0]?.decision ?? "NONE",
    applicationStatus: application.status,
    readinessVersion: INTELLIGENCE_READINESS_VERSION,
  });

  const existing = await tx.applicationIntelligenceRun.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true, snapshotId: true },
  });
  if (existing) {
    return {
      runId: existing.id,
      snapshotId: existing.snapshotId,
      alignmentResultId: alignment.id,
      created: false,
      status: existing.status,
    };
  }

  const sourceDataVersion = buildSourceDataVersion({
    snapshotContentHash: snapshot.contentHash,
    candidateUpdatedAt: input.candidateUpdatedAt,
    materialsFingerprint: materialFp,
  });

  const run = await tx.applicationIntelligenceRun.create({
    data: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      requirementSetId,
      requestedById: input.requestedById,
      analysisPurpose: ANALYSIS_PURPOSE.APPLICATION_READINESS,
      status: "QUEUED",
      freshness: "CURRENT",
      validationStatus: "PENDING",
      provider: NULL_PROVIDER_ID,
      model: NULL_MODEL_ID,
      promptVersion: "deterministic.readiness.v1",
      schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
      scoringVersion: INTELLIGENCE_READINESS_VERSION,
      idempotencyKey,
      sourceDataVersion,
    },
    select: { id: true, snapshotId: true },
  });

  await logUserAuditEvent({
    userId: input.requestedById,
    organizationId: input.organizationId,
    action: AuditAction.APPLICATION_INTELLIGENCE_REQUESTED,
    entityType: "ApplicationIntelligenceRun",
    entityId: run.id,
    details: sanitizeIntelligenceAuditDetails({
      auditAlias: GATE7_READINESS_AUDIT_ALIASES.requested,
      analysisPurpose: ANALYSIS_PURPOSE.APPLICATION_READINESS,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      requirementSetId,
      alignmentResultId: alignment.id,
      runId: run.id,
      readinessVersion: INTELLIGENCE_READINESS_VERSION,
      scoringVersion: alignment.scoringVersion ?? INTELLIGENCE_SCORING_VERSION,
    }),
    tx,
  });

  return {
    runId: run.id,
    snapshotId: run.snapshotId,
    alignmentResultId: alignment.id,
    created: true,
    status: "QUEUED",
  };
}

/**
 * Load bounded readiness inputs for an application (no org-wide scans).
 */
export async function loadReadinessInputView(
  db: Prisma.TransactionClient | PrismaClient,
  input: {
    organizationId: string;
    applicationId: string;
    candidateId: string;
    jobId: string;
    alignmentResultId?: string;
    requirementSetId?: string;
    snapshotId: string;
  }
): Promise<ReadinessInputView> {
  const application = await db.application.findFirst({
    where: {
      id: input.applicationId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
    },
    select: {
      id: true,
      status: true,
      approvalStatus: true,
      candidateId: true,
      organizationId: true,
      jobId: true,
      candidate: {
        select: { applicationAuthorizationMode: true },
      },
      job: {
        select: {
          visibility: true,
          ownerCandidateId: true,
        },
      },
      materials: {
        where: { isCurrent: true },
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          isCurrent: true,
          candidateDocumentId: true,
          documentVersion: true,
          screeningAnswers: true,
          candidateDocument: {
            select: {
              id: true,
              candidateId: true,
              documentType: true,
              versionNumber: true,
            },
          },
        },
      },
      qaReviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          decision: true,
          checklistItems: { select: { isVerified: true } },
        },
      },
    },
  });

  if (!application) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Application not found for readiness",
      { retryable: false }
    );
  }

  const alignment = await db.applicationAlignmentResult.findFirst({
    where: {
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      ...(input.alignmentResultId ? { id: input.alignmentResultId } : {}),
      run: {
        snapshotId: input.snapshotId,
        analysisPurpose: ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      runId: true,
      freshness: true,
      scoringVersion: true,
      overallScore: true,
      evidence: true,
      run: { select: { requirementSetId: true, snapshotId: true } },
    },
  });

  if (!alignment?.run.requirementSetId || !alignment.run.snapshotId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Alignment result required for readiness",
      { retryable: false }
    );
  }

  const parsed = parseAlignmentEvidence(alignment.evidence);
  const requirementSetId =
    input.requirementSetId ??
    parsed.requirementSetId ??
    alignment.run.requirementSetId;

  const requirementSet = await db.jobRequirementSet.findFirst({
    where: {
      id: requirementSetId,
      organizationId: input.organizationId,
      jobId: input.jobId,
      snapshotId: input.snapshotId,
    },
    select: { id: true, snapshotId: true, freshness: true },
  });

  if (!requirementSet) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Requirement set not found for readiness",
      { retryable: false }
    );
  }

  const material = application.materials[0] ?? null;
  const qa = application.qaReviews[0] ?? null;

  return {
    organizationId: application.organizationId,
    candidateId: application.candidateId,
    applicationId: application.id,
    jobId: application.jobId,
    applicationStatus: application.status,
    approvalStatus: application.approvalStatus,
    authorizationMode: application.candidate
      .applicationAuthorizationMode as "MANAGED" | "REVIEW_REQUIRED",
    jobVisibility: application.job.visibility as "GLOBAL" | "CANDIDATE_PRIVATE",
    jobOwnerCandidateId: application.job.ownerCandidateId,
    alignment: {
      id: alignment.id,
      runId: alignment.runId,
      freshness: alignment.freshness,
      scoringVersion: alignment.scoringVersion,
      overallScore: alignment.overallScore,
      snapshotId: alignment.run.snapshotId,
      requirementSetId,
      fitItems: parsed.fitItems,
      candidateFactVersion: parsed.candidateFactVersion,
    },
    requirementSet,
    material: material
      ? {
          id: material.id,
          isCurrent: material.isCurrent,
          candidateDocumentId: material.candidateDocumentId,
          documentVersion: material.documentVersion,
          documentType: material.candidateDocument?.documentType ?? null,
          documentVersionNumber:
            material.candidateDocument?.versionNumber ?? null,
          documentCandidateId: material.candidateDocument?.candidateId ?? null,
          screeningAnswers: material.screeningAnswers,
        }
      : null,
    qa: {
      id: qa?.id ?? null,
      decision: (qa?.decision as "PASS" | "FAIL" | null) ?? null,
      verifiedCount: qa?.checklistItems.filter((c) => c.isVerified).length ?? 0,
      criterionCount: qa?.checklistItems.length ?? 0,
    },
  };
}

export async function persistApplicationReadinessResult(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    applicationId: string;
    runId: string;
    freshness: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
    result: DeterministicReadinessResult;
  }
): Promise<{ id: string }> {
  const existing = await tx.applicationReadinessResult.findUnique({
    where: { runId: input.runId },
    select: { id: true },
  });

  // Gate 8: attach ruleIds/explanations at persist boundary (no decision changes).
  const { enrichReadinessResult } = await import("./evidence-contract");
  const enriched = enrichReadinessResult(input.result);

  const data = {
    freshness: input.freshness,
    readinessState: enriched.readinessState,
    blockers: enriched.blockers as object[],
    warnings: enriched.warnings as object[],
    nextActions: enriched.nextActions as object[],
    evidence: {
      ...enriched.evidence,
      unknowns: enriched.unknowns,
      issues: enriched.issues,
      alignmentEvidenceSchema: ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
    } as object,
  };

  if (existing) {
    return tx.applicationReadinessResult.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
  }

  return tx.applicationReadinessResult.create({
    data: {
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      runId: input.runId,
      ...data,
    },
    select: { id: true },
  });
}
