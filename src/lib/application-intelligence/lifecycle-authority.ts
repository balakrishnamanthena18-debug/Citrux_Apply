/**
 * Gate 12 — Application Intelligence ↔ Application Lifecycle authority matrix.
 *
 * Core invariant: APPLICATION INTELLIGENCE ≠ APPLICATION AUTHORITY.
 * Intelligence informs decisions; it does not make lifecycle decisions.
 */

import {
  AUTHORITY_BOUNDARIES,
  intelligenceMayApproveApplication,
  intelligenceMayCompleteQa,
  intelligenceMayMutateApplicationStatus,
  intelligenceMaySubmitApplication,
} from "./qa-alignment";
import { INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY } from "./mutation-gateway";
import { GATE1_AUTHORITY_LOCK } from "./data-contract";

export const LIFECYCLE_AUTHORITY_MATRIX = [
  {
    decision: "Candidate facts",
    authority: "Candidate truth system",
    intelligenceRole: "READ_ONLY",
  },
  {
    decision: "Job requirements",
    authority: "Job Requirement Set (pinned to JD snapshot)",
    intelligenceRole: "OWN_ARTIFACT",
  },
  {
    decision: "Fit calculation",
    authority: "Alignment engine (advisory)",
    intelligenceRole: "ADVISORY",
  },
  {
    decision: "Readiness recommendation",
    authority: "Readiness engine (advisory)",
    intelligenceRole: "ADVISORY",
  },
  {
    decision: "QA verification",
    authority: "QA system",
    intelligenceRole: "READ_ONLY",
  },
  {
    decision: "Candidate approval",
    authority: "Candidate approval system",
    intelligenceRole: "READ_ONLY",
  },
  {
    decision: "Submission authorization",
    authority: "Application lifecycle",
    intelligenceRole: "READ_ONLY",
  },
  {
    decision: "External submission",
    authority: "Submission workflow",
    intelligenceRole: "FORBIDDEN",
  },
  {
    decision: "Application state",
    authority: "State Mutation Gateway",
    intelligenceRole: "FORBIDDEN",
  },
  {
    decision: "ApplicationStateHistory",
    authority: "Lifecycle / QA / Submission actions",
    intelligenceRole: "FORBIDDEN",
  },
  {
    decision: "Managed authorization mode",
    authority: "Candidate authorization settings",
    intelligenceRole: "READ_ONLY",
  },
] as const;

export const INTELLIGENCE_ADVISORY_DISCLAIMER =
  "Your assessment is a guide, not an approval decision. Your application still goes through the normal review, approval, and submission process.";

export const STAFF_AUTHORITY_GUIDANCE = {
  intelligence: "Advisory decision support — fit, readiness, blockers, evidence",
  qa: "Quality control authority — human verification gate",
  approval: "Candidate authorization — independent of intelligence readiness",
  submission: "Execution authority — external submission workflow",
} as const;

/** Distinct concepts that must never be collapsed into one UI status. */
export const AUTHORITY_STATUS_NAMESPACES = {
  applicationState: "Application.status",
  intelligenceReadiness: "ApplicationReadinessResult.readinessState",
  qaStatus: "ApplicationQaReview / QA workflow",
  candidateApproval: "Application.approvalStatus",
  intelligenceBlocker: "ReadinessIssue severity=BLOCKER (advisory)",
  qaFailure: "QA review outcome (authoritative)",
  candidateRevisionRequest: "candidateRequestRevisionAction",
  lifecycleBlock: "Application.status transition guards",
} as const;

export function assertIntelligenceLifecycleAuthorityLock(): void {
  if (INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY) {
    throw new Error("Gate 12: intelligence must not call the mutation gateway");
  }
  if (GATE1_AUTHORITY_LOCK.mayMutateApplicationStatus) {
    throw new Error("Gate 12: intelligence must not mutate application status");
  }
  if (intelligenceMayMutateApplicationStatus()) {
    throw new Error("Gate 12: intelligenceMayMutateApplicationStatus must be false");
  }
  if (intelligenceMayCompleteQa()) {
    throw new Error("Gate 12: intelligenceMayCompleteQa must be false");
  }
  if (intelligenceMayApproveApplication()) {
    throw new Error("Gate 12: intelligenceMayApproveApplication must be false");
  }
  if (intelligenceMaySubmitApplication()) {
    throw new Error("Gate 12: intelligenceMaySubmitApplication must be false");
  }
  if (AUTHORITY_BOUNDARIES.INTELLIGENCE !== "ADVISORY_ANALYSIS") {
    throw new Error("Gate 12: intelligence authority boundary must remain advisory");
  }
}

/**
 * Readiness READY is not Application.status READY.
 * Intelligence REVIEW_REQUIRED is not ApplicationStatus.REVIEW_REQUIRED.
 */
export function readinessIsNotApplicationState(): true {
  return true;
}
