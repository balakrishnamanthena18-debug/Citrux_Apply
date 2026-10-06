/**
 * Phase 5K — advisory next-action copy for Application operations console.
 * Does not alter lifecycle semantics; mirrors employee detail guidance.
 */

import type { ApplicationStatus } from "@/generated/prisma";

export function deriveNextActionGuidance(status: ApplicationStatus): string {
  switch (status) {
    case "DISCOVERED":
      return "Review job qualifications and advance application to Qualified status.";
    case "QUALIFIED":
      return "Begin tailoring candidate resume and cover letter materials.";
    case "PREPARING":
      return "Complete tailoring and submit application package for internal QA review.";
    case "REVIEW":
      return "Execute the 9-criterion QA checklist and record Pass or Fail decision.";
    case "AWAITING_APPROVAL":
      return "Application package is staged for candidate approval. Awaiting candidate sign-off.";
    case "READY":
      return "Open the external job posting, complete the application on employer portal, then record submission details.";
    case "SUBMITTED":
      return "Authoritative external submission recorded. Monitor status or flag defects if encountered.";
    case "SUBMISSION_ISSUE":
      return "Submission issue reported. Start operational correction review.";
    case "REVIEW_REQUIRED":
      return "Formulate correction resolution and approve correction plan.";
    case "CORRECTION_APPROVED":
      return "Stage corrected application for resubmission.";
    case "RESUBMISSION":
      return "Perform manual external resubmission and record attempt details.";
    case "REJECTED":
      return "Application was rejected by candidate during approval stage.";
    case "WITHDRAWN":
      return "Application was withdrawn.";
    case "FAILED":
      return "Application reached a terminal failure state.";
    default:
      return "Review current application status.";
  }
}
