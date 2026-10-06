/**
 * Phase 6C — O1 candidate-safe labels + staff operational labels.
 * Contract: docs/engineering/PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md
 */

import type { ApplicationOutcomeType } from "@/generated/prisma";

export const CANDIDATE_OUTCOME_LABELS: Record<ApplicationOutcomeType, string> = {
  EMPLOYER_REJECTION: "Employer declined",
  RECRUITER_CONTACT: "Recruiter contacted you",
  INTERVIEW_REQUESTED: "Interview requested",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  OFFER_RECEIVED: "Offer received",
  OTHER: "Other update",
};

export const STAFF_OUTCOME_LABELS: Record<ApplicationOutcomeType, string> = {
  EMPLOYER_REJECTION: "Employer rejection",
  RECRUITER_CONTACT: "Recruiter contact",
  INTERVIEW_REQUESTED: "Interview requested",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  OFFER_RECEIVED: "Offer received",
  OTHER: "Other external update",
};

export function candidateOutcomeLabel(type: ApplicationOutcomeType): string {
  return CANDIDATE_OUTCOME_LABELS[type];
}

export function staffOutcomeLabel(type: ApplicationOutcomeType): string {
  return STAFF_OUTCOME_LABELS[type];
}

export function candidateProvenanceLabel(
  provenance: "EMPLOYEE_RECORDED" | "CANDIDATE_REPORTED" | "STAFF_VERIFIED",
  isOwnReport: boolean
): string {
  if (provenance === "CANDIDATE_REPORTED" && isOwnReport) {
    return "You reported";
  }
  if (provenance === "CANDIDATE_REPORTED") {
    return "Reported";
  }
  if (provenance === "STAFF_VERIFIED") {
    return "Confirmed";
  }
  return "Update";
}
