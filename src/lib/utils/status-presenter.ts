import type { ApplicationStatus } from "@/generated/prisma";

export type ApplicationFilterTab = "ALL" | "AWAITING_ACTION" | "IN_PROGRESS" | "SUBMITTED" | "HISTORY";

export interface CandidateStatusPresentation {
  label: string;
  description: string;
  badgeClass: string;
  progressStage: 1 | 2 | 3 | 4 | 5; // 1: Intake, 2: Preparation, 3: QA Review, 4: Candidate Approval, 5: Submission
  isTerminal: boolean;
  isActionRequired: boolean;
  isIncident: boolean;
}

export const CANDIDATE_STATUS_MAP: Record<ApplicationStatus, CandidateStatusPresentation> = {
  DISCOVERED: {
    label: "Job identified",
    description: "Opportunity identified; undergoing initial eligibility screening by operations staff.",
    badgeClass: "bg-slate-100 text-slate-800 border-slate-200",
    progressStage: 1,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  },
  QUALIFIED: {
    label: "Application being prepared",
    description: "Eligibility confirmed; queued for tailored application material assembly.",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    progressStage: 1,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  },
  PREPARING: {
    label: "Preparing application",
    description: "Operations specialist is actively authoring tailored resume bullet points and cover letter.",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    progressStage: 2,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  },
  REVIEW: {
    label: "Under review",
    description: "Prepared application materials undergoing rigorous internal quality assurance review.",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    progressStage: 3,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  },
  AWAITING_APPROVAL: {
    label: "Waiting for your approval",
    description: "Application materials are ready for your review and explicit submission authorization.",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300 font-semibold",
    progressStage: 4,
    isTerminal: false,
    isActionRequired: true,
    isIncident: false,
  },
  READY: {
    label: "Ready to apply",
    description: "Approved by candidate; queued for manual external submission by operations staff.",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    progressStage: 5,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  },
  SUBMITTED: {
    label: "Application submitted",
    description: "Successfully submitted to employer; official confirmation evidence recorded.",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
    progressStage: 5,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  },
  SUBMISSION_ISSUE: {
    label: "Application issue",
    description: "External portal or listing issue detected during submission; undergoing specialist triage.",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    progressStage: 5,
    isTerminal: false,
    isActionRequired: false,
    isIncident: true,
  },
  REVIEW_REQUIRED: {
    label: "Application needs review",
    description: "Post-submission correction materials undergoing secondary quality review.",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    progressStage: 3,
    isTerminal: false,
    isActionRequired: false,
    isIncident: true,
  },
  CORRECTION_APPROVED: {
    label: "Correction approved",
    description: "Corrected submission materials verified by staff; staged for resubmission.",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    progressStage: 3,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  },
  RESUBMISSION: {
    label: "Being resubmitted",
    description: "Queued for secondary manual submission attempt by operations staff.",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    progressStage: 5,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  },
  REJECTED: {
    label: "Application rejected",
    description: "Role was closed or candidate was not selected by employer.",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    progressStage: 5,
    isTerminal: true,
    isActionRequired: false,
    isIncident: false,
  },
  WITHDRAWN: {
    label: "Application withdrawn",
    description: "Application withdrawn at candidate request or upon consent revocation.",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    progressStage: 5,
    isTerminal: true,
    isActionRequired: false,
    isIncident: false,
  },
  FAILED: {
    label: "Application could not be completed",
    description: "Submission could not be completed (e.g. external role was discontinued).",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
    progressStage: 5,
    isTerminal: true,
    isActionRequired: false,
    isIncident: false,
  },
};

/**
 * Filter categories for candidate UI presentation.
 * Maps derived filter tabs to authoritative underlying states.
 */
export const FILTER_TAB_STATES: Record<ApplicationFilterTab, ApplicationStatus[]> = {
  ALL: [
    "DISCOVERED",
    "QUALIFIED",
    "PREPARING",
    "REVIEW",
    "AWAITING_APPROVAL",
    "READY",
    "SUBMITTED",
    "SUBMISSION_ISSUE",
    "REVIEW_REQUIRED",
    "CORRECTION_APPROVED",
    "RESUBMISSION",
    "REJECTED",
    "WITHDRAWN",
    "FAILED",
  ] as ApplicationStatus[],
  AWAITING_ACTION: [
    "AWAITING_APPROVAL",
  ] as ApplicationStatus[],
  IN_PROGRESS: [
    "DISCOVERED",
    "QUALIFIED",
    "PREPARING",
    "REVIEW",
    "READY",
    "SUBMISSION_ISSUE",
    "REVIEW_REQUIRED",
    "CORRECTION_APPROVED",
    "RESUBMISSION",
  ] as ApplicationStatus[],
  SUBMITTED: [
    "SUBMITTED",
  ] as ApplicationStatus[],
  HISTORY: [
    "REJECTED",
    "WITHDRAWN",
    "FAILED",
  ] as ApplicationStatus[],
};

export function getCandidateStatusPresentation(status: ApplicationStatus): CandidateStatusPresentation {
  return CANDIDATE_STATUS_MAP[status] || {
    label: status.replace(/_/g, " "),
    description: "Operational state in progress.",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    progressStage: 1,
    isTerminal: false,
    isActionRequired: false,
    isIncident: false,
  };
}

/**
 * Formats authoritative salary range into human-readable string.
 * Never fabricates or infers missing data.
 */
export function formatSalary(
  salaryMin?: number | null,
  salaryMax?: number | null,
  currency: string | null = "USD"
): string {
  const curr = currency || "USD";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 0,
  });

  if (salaryMin && salaryMax) {
    if (salaryMin === salaryMax) {
      return `${formatter.format(salaryMin)} / year`;
    }
    return `${formatter.format(salaryMin)} – ${formatter.format(salaryMax)} / year`;
  } else if (salaryMin) {
    return `From ${formatter.format(salaryMin)} / year`;
  } else if (salaryMax) {
    return `Up to ${formatter.format(salaryMax)} / year`;
  }

  return "Salary not disclosed";
}

/**
 * Returns candidate-facing action requirement label based on authoritative state.
 */
export function getCandidateActionRequirement(status: ApplicationStatus): {
  actionText: string;
  badgeClass: string;
  isActionRequired: boolean;
} {
  switch (status) {
    case "AWAITING_APPROVAL":
      return {
        actionText: "Your approval is required",
        badgeClass: "bg-amber-100 text-amber-900 border-amber-300 font-semibold animate-pulse",
        isActionRequired: true,
      };
    case "DISCOVERED":
    case "QUALIFIED":
      return {
        actionText: "Initial screening in progress",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
        isActionRequired: false,
      };
    case "PREPARING":
      return {
        actionText: "Application being prepared by your team",
        badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
        isActionRequired: false,
      };
    case "REVIEW":
      return {
        actionText: "Under internal QA review",
        badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
        isActionRequired: false,
      };
    case "READY":
      return {
        actionText: "Ready for external submission",
        badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
        isActionRequired: false,
      };
    case "SUBMITTED":
      return {
        actionText: "Application submitted",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200 font-medium",
        isActionRequired: false,
      };
    case "SUBMISSION_ISSUE":
    case "REVIEW_REQUIRED":
    case "CORRECTION_APPROVED":
    case "RESUBMISSION":
      return {
        actionText: "Under specialist review",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        isActionRequired: false,
      };
    case "WITHDRAWN":
      return {
        actionText: "Application withdrawn",
        badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
        isActionRequired: false,
      };
    case "REJECTED":
      return {
        actionText: "Application closed",
        badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
        isActionRequired: false,
      };
    case "FAILED":
      return {
        actionText: "Submission unsuccessful",
        badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
        isActionRequired: false,
      };
    default:
      return {
        actionText: "Nothing required",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
        isActionRequired: false,
      };
  }
}
