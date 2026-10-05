/**
 * Single state mutation gateway contract for Phase 2.
 *
 * Do not redesign the lifecycle. Future AI/background workers MUST use
 * these authoritative modules only — never duplicate Prisma status writes.
 */

export const PHASE2_MUTATION_GATEWAY = {
  /**
   * Candidate approval / revision (UI-canonical).
   * Legacy duplicates in application/actions.ts must NOT be used by intelligence.
   */
  approval: {
    module: "src/lib/qa/actions.ts",
    approve: "candidateApproveApplicationAction",
    requestRevision: "candidateRequestRevisionAction",
    /** Staff QA completion that may advance REVIEW → AWAITING_APPROVAL or READY (managed). */
    completeQa: "completeQaReviewAction",
    submitForQa: "submitApplicationForQaAction",
  },
  /**
   * Submission + correction chain (UI-canonical).
   * Legacy duplicates in application/actions.ts must NOT be used by intelligence.
   */
  submission: {
    module: "src/lib/submission/actions.ts",
    recordSubmission: "recordApplicationSubmissionAction",
    recordIssue: "recordSubmissionIssueAction",
    startCorrection: "startCorrectionReviewAction",
    approveCorrection: "approveSubmissionCorrectionAction",
    stageResubmission: "stageApplicationResubmissionAction",
    recordResubmission: "recordApplicationResubmissionAction",
  },
  /**
   * General status transitions / withdraw / create / materials.
   */
  application: {
    module: "src/lib/application/actions.ts",
    transition: "transitionApplicationStatusAction",
    withdraw: "withdrawApplicationAction",
    updateMaterials: "updateApplicationMaterialAction",
    create: "createApplicationAction",
    assign: "assignApplicationAction",
  },
  /**
   * Forbidden for intelligence / workers.
   */
  forbiddenLegacyPaths: [
    "src/lib/application/actions.ts#requestCandidateApprovalAction",
    "src/lib/application/actions.ts#submitCandidateApprovalAction",
    "src/lib/application/actions.ts#recordApplicationSubmissionAction",
    "src/lib/application/actions.ts#recordSubmissionIssueAction",
    "src/lib/application/actions.ts#approveSubmissionCorrectionAction",
    "src/lib/application/actions.ts#stageApplicationResubmissionAction",
    "src/lib/application/actions.ts#recordApplicationResubmissionAction",
  ],
} as const;

export function isForbiddenLegacyMutationPath(path: string): boolean {
  return (PHASE2_MUTATION_GATEWAY.forbiddenLegacyPaths as readonly string[]).includes(
    path
  );
}

/** Intelligence layer hard ban — no status mutation APIs. */
export const INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY = false;
