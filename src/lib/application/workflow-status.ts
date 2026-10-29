/**
 * Enterprise Application Workflow — Dual-Track State Model
 *
 * Separates Internal Processing Stages from External Submission States:
 * - Internal Stages: INTAKE -> QUALIFICATION -> MATERIALS_PREPARATION -> QUALITY_REVIEW -> APPROVAL -> APPROVED_COMPLETED
 * - External States: NOT_STARTED, READY_FOR_SUBMISSION, SUBMISSION_IN_PROGRESS, SUBMITTED, NEEDS_VERIFICATION, FAILED, WITHDRAWN
 *
 * Provides authoritative state derivation, context-sensitive primary actions,
 * and accountable party attribution.
 */

import { ApplicationStatus, ApplicationApprovalStatus } from "@/generated/prisma/enums";

export type InternalStage =
  | "INTAKE"
  | "QUALIFICATION"
  | "MATERIALS_PREPARATION"
  | "QUALITY_REVIEW"
  | "APPROVAL"
  | "APPROVED_COMPLETED"
  | "TERMINATED";

export type ExternalSubmissionState =
  | "NOT_STARTED"
  | "READY_FOR_SUBMISSION"
  | "SUBMISSION_IN_PROGRESS"
  | "SUBMITTED"
  | "NEEDS_VERIFICATION"
  | "FAILED"
  | "WITHDRAWN";

export interface InternalStageInfo {
  stage: InternalStage;
  label: string;
  stepNumber: number; // 1 to 5
  totalSteps: number;
  description: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface ExternalSubmissionInfo {
  state: ExternalSubmissionState;
  label: string;
  description: string;
  variant: "neutral" | "info" | "warning" | "success" | "danger" | "purple";
  badgeClass: string;
  hasConfirmedSubmission: boolean;
}

export type PrimaryActionTargetTab = "overview" | "materials" | "submission" | "interviews" | "timeline";

export interface PrimaryAction {
  id: string;
  label: string;
  description: string;
  targetTab: PrimaryActionTargetTab;
  actionType: "NAVIGATE_TAB" | "SERVER_ACTION" | "MODAL" | "EXTERNAL_LINK";
  disabled: boolean;
  disabledReason?: string;
  badge?: string;
  variant?: "primary" | "warning" | "danger" | "success" | "secondary";
}

export type AccountableActor =
  | "ASSIGNED_SPECIALIST"
  | "QA_REVIEWER"
  | "CANDIDATE"
  | "INCIDENT_MANAGER"
  | "SYSTEM"
  | "NONE";

export interface DualTrackWorkflowStatus {
  internal: InternalStageInfo;
  external: ExternalSubmissionInfo;
  primaryAction: PrimaryAction;
  accountableActor: AccountableActor;
  accountableActorLabel: string;
  isTerminal: boolean;
  canWithdraw: boolean;
}

export const INTERNAL_STAGE_STEPS: readonly {
  stage: InternalStage;
  label: string;
  stepNumber: number;
  description: string;
}[] = [
  {
    stage: "INTAKE",
    label: "Intake",
    stepNumber: 1,
    description: "Initial job discovery and candidate opportunity intake",
  },
  {
    stage: "QUALIFICATION",
    label: "Qualification",
    stepNumber: 2,
    description: "Match score verification and role fit evaluation",
  },
  {
    stage: "MATERIALS_PREPARATION",
    label: "Materials Prep",
    stepNumber: 3,
    description: "Tailored resume versioning and cover letter drafting",
  },
  {
    stage: "QUALITY_REVIEW",
    label: "Quality Review",
    stepNumber: 4,
    description: "9-criterion operational QA audit and verification",
  },
  {
    stage: "APPROVAL",
    label: "Approval",
    stepNumber: 5,
    description: "Candidate authorization and pre-submission sign-off",
  },
] as const;

/**
 * Resolves the dual-track status from an application record.
 */
export function resolveDualTrackWorkflowStatus(params: {
  status: ApplicationStatus;
  approvalStatus?: ApplicationApprovalStatus | string | null;
  submissionCount?: number;
  hasMaterials?: boolean;
  authorizationMode?: string;
  isAssigned?: boolean;
}): DualTrackWorkflowStatus {
  const {
    status,
    approvalStatus,
    submissionCount = 0,
    hasMaterials = false,
    authorizationMode = "MANAGED",
    isAssigned = true,
  } = params;

  let internalStage: InternalStage = "INTAKE";
  let internalStep = 1;
  let isInternalCompleted = false;

  let externalState: ExternalSubmissionState = "NOT_STARTED";
  let externalLabel = "Not Started";
  let externalDesc = "Internal materials preparation and QA must complete first";
  let externalVariant: ExternalSubmissionInfo["variant"] = "neutral";
  let externalBadgeClass = "bg-slate-100 text-slate-700 border-slate-200";

  let accountableActor: AccountableActor = "ASSIGNED_SPECIALIST";
  let accountableActorLabel = "Assigned Specialist";
  let isTerminal = false;
  let canWithdraw = true;

  let primaryAction: PrimaryAction = {
    id: "qualify",
    label: "Qualify Opportunity",
    description: "Review opportunity fit and advance to qualification",
    targetTab: "overview",
    actionType: "SERVER_ACTION",
    disabled: false,
    variant: "primary",
  };

  switch (status) {
    case ApplicationStatus.DISCOVERED:
      internalStage = "INTAKE";
      internalStep = 1;
      externalState = "NOT_STARTED";
      accountableActor = isAssigned ? "ASSIGNED_SPECIALIST" : "ASSIGNED_SPECIALIST";
      accountableActorLabel = isAssigned ? "Assigned Specialist" : "Unassigned Specialist";
      primaryAction = {
        id: "qualify",
        label: "Qualify Application",
        description: "Advance opportunity to formal qualification",
        targetTab: "overview",
        actionType: "SERVER_ACTION",
        disabled: false,
        variant: "primary",
      };
      break;

    case ApplicationStatus.QUALIFIED:
      internalStage = "QUALIFICATION";
      internalStep = 2;
      externalState = "NOT_STARTED";
      accountableActor = "ASSIGNED_SPECIALIST";
      accountableActorLabel = "Assigned Specialist";
      primaryAction = {
        id: "prepare",
        label: "Begin Material Preparation",
        description: "Stage tailored resume and cover letter",
        targetTab: "materials",
        actionType: "SERVER_ACTION",
        disabled: false,
        variant: "primary",
      };
      break;

    case ApplicationStatus.PREPARING:
      internalStage = "MATERIALS_PREPARATION";
      internalStep = 3;
      externalState = "NOT_STARTED";
      accountableActor = "ASSIGNED_SPECIALIST";
      accountableActorLabel = "Assigned Specialist";
      primaryAction = {
        id: "submit_qa",
        label: hasMaterials ? "Submit for QA Review" : "Attach Tailored Resume",
        description: hasMaterials
          ? "Submit staged materials for independent 9-criterion QA review"
          : "Tailored candidate document must be selected before submitting for QA",
        targetTab: "materials",
        actionType: hasMaterials ? "SERVER_ACTION" : "NAVIGATE_TAB",
        disabled: !hasMaterials,
        disabledReason: !hasMaterials ? "Staged resume document is required" : undefined,
        variant: "primary",
      };
      break;

    case ApplicationStatus.REVIEW:
      internalStage = "QUALITY_REVIEW";
      internalStep = 4;
      externalState = "NOT_STARTED";
      accountableActor = "QA_REVIEWER";
      accountableActorLabel = "QA Reviewer";
      primaryAction = {
        id: "conduct_qa",
        label: "Complete QA Verification",
        description: "Execute 9-criterion compliance check and record decision",
        targetTab: "materials",
        actionType: "NAVIGATE_TAB",
        disabled: false,
        variant: "warning",
      };
      break;

    case ApplicationStatus.AWAITING_APPROVAL:
      internalStage = "APPROVAL";
      internalStep = 5;
      externalState = "NOT_STARTED";
      accountableActor = "CANDIDATE";
      accountableActorLabel = "Candidate (Portal Sign-off)";
      primaryAction = {
        id: "await_approval",
        label: "Awaiting Candidate Sign-off",
        description: "Candidate must approve tailored materials in portal before submission unlocks",
        targetTab: "overview",
        actionType: "NAVIGATE_TAB",
        disabled: true,
        disabledReason: "Waiting on candidate approval in portal",
        variant: "warning",
      };
      break;

    case ApplicationStatus.READY:
      internalStage = "APPROVED_COMPLETED";
      internalStep = 5;
      isInternalCompleted = true;
      externalState = "READY_FOR_SUBMISSION";
      externalLabel = "Ready for Submission";
      externalDesc = "Materials passed QA and candidate authorization is active. Proceed with external submission.";
      externalVariant = "info";
      externalBadgeClass = "bg-sky-50 text-sky-800 border-sky-300 font-bold";
      accountableActor = "ASSIGNED_SPECIALIST";
      accountableActorLabel = "Assigned Specialist (Apply)";
      primaryAction = {
        id: "record_submission",
        label: "Record External Submission",
        description: "Submit on employer portal and record confirmation reference and evidence",
        targetTab: "submission",
        actionType: "NAVIGATE_TAB",
        disabled: false,
        variant: "primary",
      };
      break;

    case ApplicationStatus.SUBMITTED:
      internalStage = "APPROVED_COMPLETED";
      internalStep = 5;
      isInternalCompleted = true;
      externalState = "SUBMITTED";
      externalLabel = "Submitted";
      externalDesc = "Application authoritatively submitted to employer. Awaiting employer interview or response.";
      externalVariant = "success";
      externalBadgeClass = "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold";
      accountableActor = "NONE";
      accountableActorLabel = "External Employer Review";
      canWithdraw = false;
      primaryAction = {
        id: "track_interviews",
        label: "Manage Interviews & Outcomes",
        description: "Schedule interview rounds or record employer updates",
        targetTab: "interviews",
        actionType: "NAVIGATE_TAB",
        disabled: false,
        variant: "secondary",
      };
      break;

    case ApplicationStatus.SUBMISSION_ISSUE:
    case ApplicationStatus.REVIEW_REQUIRED:
    case ApplicationStatus.CORRECTION_APPROVED:
      internalStage = "APPROVED_COMPLETED";
      internalStep = 5;
      isInternalCompleted = true;
      externalState = "NEEDS_VERIFICATION";
      externalLabel = "Needs Verification / Incident";
      externalDesc = "Submission defect or employer listing issue reported. Correction plan required.";
      externalVariant = "danger";
      externalBadgeClass = "bg-rose-50 text-rose-800 border-rose-300 font-bold";
      accountableActor = "INCIDENT_MANAGER";
      accountableActorLabel = "Specialist / Lead (Correction)";
      primaryAction = {
        id: "manage_incident",
        label:
          status === ApplicationStatus.SUBMISSION_ISSUE
            ? "Start Incident Review"
            : status === ApplicationStatus.REVIEW_REQUIRED
              ? "Approve Correction Plan"
              : "Stage Resubmission",
        description: "Resolve external submission defect and stage correction",
        targetTab: "submission",
        actionType: "NAVIGATE_TAB",
        disabled: false,
        variant: "danger",
      };
      break;

    case ApplicationStatus.RESUBMISSION:
      internalStage = "APPROVED_COMPLETED";
      internalStep = 5;
      isInternalCompleted = true;
      externalState = "SUBMISSION_IN_PROGRESS";
      externalLabel = "Resubmission In Progress";
      externalDesc = "Correction approved. Re-submitting on external employer portal.";
      externalVariant = "purple";
      externalBadgeClass = "bg-purple-50 text-purple-800 border-purple-300 font-bold";
      accountableActor = "ASSIGNED_SPECIALIST";
      accountableActorLabel = "Assigned Specialist (Resubmit)";
      primaryAction = {
        id: "record_resubmission",
        label: "Record Resubmission Evidence",
        description: "Submit corrected application on employer site and save evidence",
        targetTab: "submission",
        actionType: "NAVIGATE_TAB",
        disabled: false,
        variant: "primary",
      };
      break;

    case ApplicationStatus.REJECTED:
      internalStage = "TERMINATED";
      internalStep = 5;
      isInternalCompleted = false;
      externalState = submissionCount > 0 ? "SUBMITTED" : "NOT_STARTED";
      externalLabel = "Employer Rejected";
      externalDesc = "Employer concluded consideration for this application";
      externalVariant = "neutral";
      externalBadgeClass = "bg-slate-100 text-slate-700 border-slate-300";
      accountableActor = "NONE";
      accountableActorLabel = "Concluded";
      isTerminal = true;
      canWithdraw = false;
      primaryAction = {
        id: "view_timeline",
        label: "View Final History",
        description: "Review audit log and outcome disposition",
        targetTab: "timeline",
        actionType: "NAVIGATE_TAB",
        disabled: false,
        variant: "secondary",
      };
      break;

    case ApplicationStatus.WITHDRAWN:
      internalStage = "TERMINATED";
      internalStep = 0;
      isInternalCompleted = false;
      externalState = "WITHDRAWN";
      externalLabel = "Withdrawn";
      externalDesc = "Application was withdrawn prior to conclusion";
      externalVariant = "neutral";
      externalBadgeClass = "bg-slate-100 text-slate-700 border-slate-300";
      accountableActor = "NONE";
      accountableActorLabel = "Withdrawn";
      isTerminal = true;
      canWithdraw = false;
      primaryAction = {
        id: "view_timeline",
        label: "View Transition Timeline",
        description: "Review withdrawal reason and audit trail",
        targetTab: "timeline",
        actionType: "NAVIGATE_TAB",
        disabled: false,
        variant: "secondary",
      };
      break;

    case ApplicationStatus.FAILED:
      internalStage = "TERMINATED";
      internalStep = 0;
      isInternalCompleted = false;
      externalState = "FAILED";
      externalLabel = "Submission Failed";
      externalDesc = "Operational failure could not be resolved";
      externalVariant = "danger";
      externalBadgeClass = "bg-rose-100 text-rose-800 border-rose-300";
      accountableActor = "NONE";
      accountableActorLabel = "Failed";
      isTerminal = true;
      canWithdraw = false;
      primaryAction = {
        id: "view_timeline",
        label: "Inspect Incident Logs",
        description: "Review failure reasons and state transitions",
        targetTab: "timeline",
        actionType: "NAVIGATE_TAB",
        disabled: false,
        variant: "secondary",
      };
      break;
  }

  const internalLabel =
    internalStage === "APPROVED_COMPLETED"
      ? "Preparation Complete"
      : internalStage === "TERMINATED"
        ? "Processing Ended"
        : INTERNAL_STAGE_STEPS.find((s) => s.stage === internalStage)?.label ?? "Intake";

  const internalDesc =
    internalStage === "APPROVED_COMPLETED"
      ? "All internal gates passed (QA passed & consent authorized)"
      : internalStage === "TERMINATED"
        ? "Application process ended"
        : INTERNAL_STAGE_STEPS.find((s) => s.stage === internalStage)?.description ?? "";

  return {
    internal: {
      stage: internalStage,
      label: internalLabel,
      stepNumber: internalStep,
      totalSteps: 5,
      description: internalDesc,
      isCompleted: isInternalCompleted,
      isCurrent: !isInternalCompleted && !isTerminal,
    },
    external: {
      state: externalState,
      label: externalLabel,
      description: externalDesc,
      variant: externalVariant,
      badgeClass: externalBadgeClass,
      hasConfirmedSubmission: externalState === "SUBMITTED" || submissionCount > 0,
    },
    primaryAction,
    accountableActor,
    accountableActorLabel,
    isTerminal,
    canWithdraw,
  };
}
