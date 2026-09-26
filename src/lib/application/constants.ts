import { ApplicationStatus } from "@/generated/prisma";

export const ALLOWED_APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DISCOVERED: [ApplicationStatus.QUALIFIED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN],
  QUALIFIED: [ApplicationStatus.PREPARING, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN],
  PREPARING: [ApplicationStatus.REVIEW, ApplicationStatus.WITHDRAWN],
  REVIEW: [ApplicationStatus.AWAITING_APPROVAL, ApplicationStatus.PREPARING, ApplicationStatus.WITHDRAWN],
  AWAITING_APPROVAL: [ApplicationStatus.READY, ApplicationStatus.PREPARING, ApplicationStatus.WITHDRAWN],
  READY: [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN],
  SUBMITTED: [ApplicationStatus.REJECTED, ApplicationStatus.SUBMISSION_ISSUE],
  SUBMISSION_ISSUE: [ApplicationStatus.REVIEW_REQUIRED, ApplicationStatus.FAILED],
  REVIEW_REQUIRED: [ApplicationStatus.CORRECTION_APPROVED, ApplicationStatus.FAILED],
  CORRECTION_APPROVED: [ApplicationStatus.RESUBMISSION],
  RESUBMISSION: [ApplicationStatus.SUBMITTED, ApplicationStatus.FAILED],
  REJECTED: [],  // Terminal
  WITHDRAWN: [], // Terminal
  FAILED: [],    // Terminal
};
