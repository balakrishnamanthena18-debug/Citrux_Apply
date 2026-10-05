/**
 * QA semantic alignment contract.
 *
 * INTELLIGENCE = advisory analysis
 * QA           = human verification gate
 * APPROVAL     = candidate/authorized decision
 * SUBMISSION   = authoritative external action
 *
 * AI must never replace QA, approval, or submission.
 */

export const QA_INTELLIGENCE_VOCABULARY_MAP = {
  CANDIDATE_JOB_ALIGNMENT: {
    intelligenceConcept: "alignment.overall + fitItems",
    authority: "QA human attestation remains authoritative",
  },
  RESUME_ACCURACY: {
    intelligenceConcept: "materials.intelligence (future)",
    authority: "QA human attestation remains authoritative",
  },
  JOB_REQUIREMENTS_MATCH: {
    intelligenceConcept: "alignment.requirements / JobRequirementSet",
    authority: "QA human attestation remains authoritative",
  },
  SALARY_ALIGNMENT: {
    intelligenceConcept: "readiness.salary + alignment.preferences",
    authority: "Existing QA boundary checks + human QA remain authoritative",
  },
  LOCATION_AUTHORIZATION: {
    intelligenceConcept: "alignment.location",
    authority: "QA human attestation remains authoritative",
  },
  WORK_AUTHORIZATION: {
    intelligenceConcept: "alignment.workAuthorization",
    authority: "QA human attestation remains authoritative",
  },
  SCREENING_ANSWERS: {
    intelligenceConcept: "readiness.screening",
    authority: "QA human attestation remains authoritative",
  },
  APPLICATION_COMPLETENESS: {
    intelligenceConcept: "readiness.completeness",
    authority: "QA human attestation remains authoritative",
  },
  CANDIDATE_CONSENT_ACTIVE: {
    intelligenceConcept: "readiness.consent",
    authority: "Candidate.status + submission guards remain authoritative",
  },
} as const;

export const AUTHORITY_BOUNDARIES = {
  INTELLIGENCE: "ADVISORY_ANALYSIS",
  QA: "HUMAN_VERIFICATION_GATE",
  APPROVAL: "CANDIDATE_OR_AUTHORIZED_DECISION",
  SUBMISSION: "AUTHORITATIVE_EXTERNAL_ACTION",
} as const;

export function intelligenceMayMutateApplicationStatus(): false {
  return false;
}

export function intelligenceMayCompleteQa(): false {
  return false;
}

export function intelligenceMayApproveApplication(): false {
  return false;
}

export function intelligenceMaySubmitApplication(): false {
  return false;
}
