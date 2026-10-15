import { AuditAction } from "@/generated/prisma/enums";

export const ALL_AUDIT_ACTIONS = Object.values(AuditAction);

export type AuditCategory =
  | "ALL"
  | "SECURITY_IDENTITY"
  | "MEMBERSHIP_STAFF"
  | "CANDIDATE_PROFILE"
  | "JOB_APPLICATION"
  | "TASK_WORKFLOW"
  | "INTERVIEW_OFFER"
  | "COMMERCIAL_BILLING"
  | "PRIVACY_COMPLIANCE"
  | "INTELLIGENCE";

export type AuditTone = "neutral" | "emerald" | "amber" | "rose" | "blue" | "purple";

export interface ActionMetadata {
  action: AuditAction;
  category: AuditCategory;
  label: string;
  tone: AuditTone;
  description: string;
}

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  ALL: "All Events",
  SECURITY_IDENTITY: "Security & Identity",
  MEMBERSHIP_STAFF: "Staff & Memberships",
  CANDIDATE_PROFILE: "Candidates & Records",
  JOB_APPLICATION: "Jobs & Applications",
  TASK_WORKFLOW: "Tasks & Operations",
  INTERVIEW_OFFER: "Interviews & Offers",
  COMMERCIAL_BILLING: "Commercial & Billing",
  PRIVACY_COMPLIANCE: "Privacy & Compliance",
  INTELLIGENCE: "AI & Intelligence",
};

export const ACTION_CATALOG: Record<AuditAction, { category: AuditCategory; label: string; tone: AuditTone; description: string }> = {
  // Security & Identity
  [AuditAction.USER_REGISTERED]: {
    category: "SECURITY_IDENTITY",
    label: "User Registered",
    tone: "blue",
    description: "New user account created in the identity directory.",
  },
  [AuditAction.USER_LOGIN]: {
    category: "SECURITY_IDENTITY",
    label: "User Login",
    tone: "emerald",
    description: "User authenticated and initiated a session.",
  },
  [AuditAction.USER_LOGOUT]: {
    category: "SECURITY_IDENTITY",
    label: "User Logout",
    tone: "neutral",
    description: "User session terminated.",
  },
  [AuditAction.USER_INVITED]: {
    category: "SECURITY_IDENTITY",
    label: "User Invited",
    tone: "blue",
    description: "Invitation sent to join the organization.",
  },
  [AuditAction.ACCESS_DENIED]: {
    category: "SECURITY_IDENTITY",
    label: "Access Denied",
    tone: "rose",
    description: "Unauthorized access attempt blocked by security policy.",
  },
  [AuditAction.SECURITY_ALERT]: {
    category: "SECURITY_IDENTITY",
    label: "Security Alert",
    tone: "rose",
    description: "Security anomaly or threat alert triggered.",
  },
  [AuditAction.SECURITY_ALERT_INVALID_STORAGE_PATH]: {
    category: "SECURITY_IDENTITY",
    label: "Invalid Storage Path Alert",
    tone: "rose",
    description: "Attempted file access with an invalid or untrusted storage path.",
  },
  [AuditAction.EMPLOYEE_SESSIONS_REVOKED]: {
    category: "SECURITY_IDENTITY",
    label: "Employee Sessions Revoked",
    tone: "amber",
    description: "All active authenticated sessions for employee terminated.",
  },

  // Staff & Memberships
  [AuditAction.MEMBERSHIP_CREATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Membership Created",
    tone: "blue",
    description: "User added to organization membership roster.",
  },
  [AuditAction.ROLE_CHANGED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Role Changed",
    tone: "amber",
    description: "User organization role modified.",
  },
  [AuditAction.MEMBERSHIP_ACTIVATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Membership Activated",
    tone: "emerald",
    description: "Organization membership set to active status.",
  },
  [AuditAction.MEMBERSHIP_DEACTIVATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Membership Deactivated",
    tone: "rose",
    description: "Organization membership suspended or deactivated.",
  },
  [AuditAction.EMPLOYEE_CREATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Employee Created",
    tone: "blue",
    description: "Staff member profile initialized.",
  },
  [AuditAction.EMPLOYEE_ACTIVATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Employee Activated",
    tone: "emerald",
    description: "Employee profile marked active.",
  },
  [AuditAction.EMPLOYEE_DEACTIVATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Employee Deactivated",
    tone: "rose",
    description: "Employee access and profile deactivated.",
  },
  [AuditAction.EMPLOYEE_ROLE_UPDATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Employee Role Updated",
    tone: "amber",
    description: "Employee permission role updated.",
  },
  [AuditAction.EMPLOYEE_INVITATION_SENT]: {
    category: "MEMBERSHIP_STAFF",
    label: "Staff Invitation Sent",
    tone: "blue",
    description: "Onboarding invitation dispatched to employee email.",
  },
  [AuditAction.EMPLOYEE_INVITATION_RESENT]: {
    category: "MEMBERSHIP_STAFF",
    label: "Staff Invitation Resent",
    tone: "blue",
    description: "Onboarding invitation redelivered.",
  },
  [AuditAction.EMPLOYEE_DESIGNATION_CHANGED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Designation Changed",
    tone: "neutral",
    description: "Employee job title or designation updated.",
  },
  [AuditAction.EMPLOYEE_DEPARTMENT_CHANGED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Department Changed",
    tone: "neutral",
    description: "Employee organizational department updated.",
  },
  [AuditAction.EMPLOYEE_TEAM_CHANGED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Team Changed",
    tone: "neutral",
    description: "Employee assigned team modified.",
  },
  [AuditAction.EMPLOYEE_MANAGER_CHANGED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Manager Changed",
    tone: "neutral",
    description: "Employee reporting line / manager updated.",
  },
  [AuditAction.EMPLOYEE_TEAM_LEAD_CHANGED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Team Lead Changed",
    tone: "neutral",
    description: "Team lead assignment modified.",
  },
  [AuditAction.DESIGNATION_CREATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Designation Created",
    tone: "blue",
    description: "New organization designation definition created.",
  },
  [AuditAction.DESIGNATION_UPDATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Designation Updated",
    tone: "neutral",
    description: "Designation definition modified.",
  },
  [AuditAction.DESIGNATION_ARCHIVED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Designation Archived",
    tone: "neutral",
    description: "Designation archived from active selection.",
  },
  [AuditAction.DESIGNATION_REACTIVATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Designation Reactivated",
    tone: "emerald",
    description: "Archived designation restored to active status.",
  },
  [AuditAction.OPERATIONAL_WORK_REASSIGNED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Work Reassigned",
    tone: "amber",
    description: "Operational workload transferred between staff members.",
  },

  // Candidates & Records
  [AuditAction.CANDIDATE_CREATED]: {
    category: "CANDIDATE_PROFILE",
    label: "Candidate Created",
    tone: "blue",
    description: "New candidate record registered.",
  },
  [AuditAction.CANDIDATE_PROFILE_UPDATED]: {
    category: "CANDIDATE_PROFILE",
    label: "Candidate Profile Updated",
    tone: "neutral",
    description: "Candidate core profile data modified.",
  },
  [AuditAction.CANDIDATE_EXPERIENCE_UPDATED]: {
    category: "CANDIDATE_PROFILE",
    label: "Experience Updated",
    tone: "neutral",
    description: "Candidate work experience records modified.",
  },
  [AuditAction.CANDIDATE_EDUCATION_UPDATED]: {
    category: "CANDIDATE_PROFILE",
    label: "Education Updated",
    tone: "neutral",
    description: "Candidate education records modified.",
  },
  [AuditAction.CANDIDATE_SKILLS_UPDATED]: {
    category: "CANDIDATE_PROFILE",
    label: "Skills Updated",
    tone: "neutral",
    description: "Candidate skill taxonomy modified.",
  },
  [AuditAction.CANDIDATE_DOCUMENT_UPLOADED]: {
    category: "CANDIDATE_PROFILE",
    label: "Document Uploaded",
    tone: "blue",
    description: "Document file uploaded to candidate dossier.",
  },
  [AuditAction.CANDIDATE_DOCUMENT_VIEWED]: {
    category: "CANDIDATE_PROFILE",
    label: "Document Viewed",
    tone: "neutral",
    description: "Candidate document accessed by authorized staff.",
  },
  [AuditAction.CANDIDATE_DOCUMENT_DELETED]: {
    category: "CANDIDATE_PROFILE",
    label: "Document Deleted",
    tone: "rose",
    description: "Document file removed from candidate dossier.",
  },
  [AuditAction.CANDIDATE_ASSIGNED]: {
    category: "CANDIDATE_PROFILE",
    label: "Candidate Assigned",
    tone: "blue",
    description: "Candidate assigned to recruitment specialist.",
  },
  [AuditAction.CANDIDATE_VERIFIED]: {
    category: "CANDIDATE_PROFILE",
    label: "Candidate Verified",
    tone: "emerald",
    description: "Candidate identity / credentials verified.",
  },
  [AuditAction.CANDIDATE_STATUS_CHANGED]: {
    category: "CANDIDATE_PROFILE",
    label: "Candidate Status Changed",
    tone: "neutral",
    description: "Candidate lifecycle status updated.",
  },
  [AuditAction.CANDIDATE_MANAGED_AUTHORIZATION_GRANTED]: {
    category: "CANDIDATE_PROFILE",
    label: "Managed Auth Granted",
    tone: "emerald",
    description: "Candidate authorized agency to manage applications on their behalf.",
  },
  [AuditAction.CANDIDATE_AUTHORIZATION_MODE_CHANGED]: {
    category: "CANDIDATE_PROFILE",
    label: "Auth Mode Changed",
    tone: "amber",
    description: "Candidate application submission authorization mode modified.",
  },
  [AuditAction.APPLICATION_ADVANCED_TO_READY_MANAGED]: {
    category: "CANDIDATE_PROFILE",
    label: "Advanced to Ready Managed",
    tone: "emerald",
    description: "Application moved to ready under managed candidate delegation.",
  },

  // Jobs & Applications
  [AuditAction.JOB_CREATED]: {
    category: "JOB_APPLICATION",
    label: "Job Created",
    tone: "blue",
    description: "New job requisition published.",
  },
  [AuditAction.JOB_UPDATED]: {
    category: "JOB_APPLICATION",
    label: "Job Updated",
    tone: "neutral",
    description: "Job requisition details updated.",
  },
  [AuditAction.APPLICATION_CREATED]: {
    category: "JOB_APPLICATION",
    label: "Application Created",
    tone: "blue",
    description: "Job application submitted for candidate.",
  },
  [AuditAction.APPLICATION_STATUS_CHANGED]: {
    category: "JOB_APPLICATION",
    label: "Application Status Changed",
    tone: "neutral",
    description: "Application lifecycle status updated.",
  },
  [AuditAction.APPLICATION_ASSIGNED]: {
    category: "JOB_APPLICATION",
    label: "Application Assigned",
    tone: "blue",
    description: "Application assigned to staff reviewer.",
  },
  [AuditAction.APPLICATION_MATERIAL_UPDATED]: {
    category: "JOB_APPLICATION",
    label: "Application Material Updated",
    tone: "neutral",
    description: "Resume or cover letter material updated.",
  },
  [AuditAction.APPLICATION_APPROVAL_REQUESTED]: {
    category: "JOB_APPLICATION",
    label: "Approval Requested",
    tone: "amber",
    description: "Application submitted for candidate or internal approval.",
  },
  [AuditAction.APPLICATION_APPROVED]: {
    category: "JOB_APPLICATION",
    label: "Application Approved",
    tone: "emerald",
    description: "Application approved for submission.",
  },
  [AuditAction.APPLICATION_APPROVAL_REJECTED]: {
    category: "JOB_APPLICATION",
    label: "Approval Rejected",
    tone: "rose",
    description: "Application approval request rejected.",
  },
  [AuditAction.APPLICATION_SUBMITTED]: {
    category: "JOB_APPLICATION",
    label: "Application Submitted",
    tone: "emerald",
    description: "Application officially submitted to employer.",
  },
  [AuditAction.APPLICATION_SUBMISSION_ISSUE]: {
    category: "JOB_APPLICATION",
    label: "Submission Issue",
    tone: "rose",
    description: "Issue encountered during application submission.",
  },
  [AuditAction.APPLICATION_CORRECTION_APPROVED]: {
    category: "JOB_APPLICATION",
    label: "Correction Approved",
    tone: "emerald",
    description: "Correction to submitted application approved.",
  },
  [AuditAction.APPLICATION_RESUBMITTED]: {
    category: "JOB_APPLICATION",
    label: "Application Resubmitted",
    tone: "blue",
    description: "Application resubmitted following correction.",
  },
  [AuditAction.APPLICATION_WITHDRAWN]: {
    category: "JOB_APPLICATION",
    label: "Application Withdrawn",
    tone: "neutral",
    description: "Application withdrawn by candidate or staff.",
  },
  [AuditAction.APPLICATION_BULK_WITHDRAWN_CONSENT_REVOKED]: {
    category: "JOB_APPLICATION",
    label: "Consent Revoked Withdrawal",
    tone: "rose",
    description: "Applications withdrawn en masse due to revoked consent.",
  },
  [AuditAction.APPLICATION_SUBMITTED_FOR_QA]: {
    category: "JOB_APPLICATION",
    label: "Submitted for QA",
    tone: "blue",
    description: "Application queued for quality assurance review.",
  },
  [AuditAction.APPLICATION_QA_PASSED]: {
    category: "JOB_APPLICATION",
    label: "QA Passed",
    tone: "emerald",
    description: "Application passed QA review verification.",
  },
  [AuditAction.APPLICATION_QA_FAILED]: {
    category: "JOB_APPLICATION",
    label: "QA Failed",
    tone: "rose",
    description: "Application failed QA review standards.",
  },
  [AuditAction.APPLICATION_APPROVED_BY_CANDIDATE]: {
    category: "JOB_APPLICATION",
    label: "Approved by Candidate",
    tone: "emerald",
    description: "Candidate confirmed and authorized application submission.",
  },
  [AuditAction.APPLICATION_REVISION_REQUESTED_BY_CANDIDATE]: {
    category: "JOB_APPLICATION",
    label: "Candidate Revision Requested",
    tone: "amber",
    description: "Candidate requested edits before approving application.",
  },
  [AuditAction.APPLICATION_SUBMISSION_ISSUE_RECORDED]: {
    category: "JOB_APPLICATION",
    label: "Submission Issue Recorded",
    tone: "rose",
    description: "Operational failure recorded during portal submission.",
  },
  [AuditAction.APPLICATION_CORRECTION_REVIEW_STARTED]: {
    category: "JOB_APPLICATION",
    label: "Correction Review Started",
    tone: "blue",
    description: "Staff initiated review of submission failure.",
  },
  [AuditAction.APPLICATION_RESUBMISSION_STAGED]: {
    category: "JOB_APPLICATION",
    label: "Resubmission Staged",
    tone: "blue",
    description: "Application prepared for secondary submission attempt.",
  },
  [AuditAction.APPLICATION_SUBMISSION_EVIDENCE_UPLOADED]: {
    category: "JOB_APPLICATION",
    label: "Submission Evidence Uploaded",
    tone: "emerald",
    description: "Receipt or screenshot evidence attached to submission.",
  },

  // Tasks & Workflow
  [AuditAction.TASK_CREATED]: {
    category: "TASK_WORKFLOW",
    label: "Task Created",
    tone: "blue",
    description: "Operational task created.",
  },
  [AuditAction.TASK_UPDATED]: {
    category: "TASK_WORKFLOW",
    label: "Task Updated",
    tone: "neutral",
    description: "Task parameters or details modified.",
  },
  [AuditAction.TASK_ASSIGNED]: {
    category: "TASK_WORKFLOW",
    label: "Task Assigned",
    tone: "blue",
    description: "Task assigned to specialist.",
  },
  [AuditAction.TASK_REASSIGNED]: {
    category: "TASK_WORKFLOW",
    label: "Task Reassigned",
    tone: "amber",
    description: "Task transferred to new assignee.",
  },
  [AuditAction.TASK_STATUS_CHANGED]: {
    category: "TASK_WORKFLOW",
    label: "Task Status Changed",
    tone: "neutral",
    description: "Task state changed.",
  },
  [AuditAction.TASK_CHECKLIST_UPDATED]: {
    category: "TASK_WORKFLOW",
    label: "Checklist Updated",
    tone: "neutral",
    description: "Task checklist item updated or checked off.",
  },
  [AuditAction.TASK_COMPLETED]: {
    category: "TASK_WORKFLOW",
    label: "Task Completed",
    tone: "emerald",
    description: "Task successfully completed.",
  },
  [AuditAction.TASK_CANCELED]: {
    category: "TASK_WORKFLOW",
    label: "Task Canceled",
    tone: "neutral",
    description: "Task canceled by supervisor or assignee.",
  },
  [AuditAction.TASK_ESCALATED]: {
    category: "TASK_WORKFLOW",
    label: "Task Escalated",
    tone: "rose",
    description: "Task escalated to management for blocking issue.",
  },
  [AuditAction.TASK_GOVERNANCE_POLICY_UPDATED]: {
    category: "TASK_WORKFLOW",
    label: "Governance Policy Updated",
    tone: "amber",
    description: "Task routing or escalation policy modified.",
  },
  [AuditAction.TASK_CREATION_DENIED]: {
    category: "TASK_WORKFLOW",
    label: "Task Creation Denied",
    tone: "rose",
    description: "Task creation blocked by governance policy.",
  },
  [AuditAction.WCOS_WORK_DEMAND_ENQUEUED]: {
    category: "TASK_WORKFLOW",
    label: "Work Demand Enqueued",
    tone: "blue",
    description: "Work demand entered WCOS capacity queue.",
  },
  [AuditAction.WCOS_WORK_ITEM_DISPATCHED]: {
    category: "TASK_WORKFLOW",
    label: "Work Item Dispatched",
    tone: "emerald",
    description: "Work item dispatched to staff member.",
  },
  [AuditAction.WCOS_WORK_ITEM_ACCEPTED]: {
    category: "TASK_WORKFLOW",
    label: "Work Item Accepted",
    tone: "emerald",
    description: "Staff accepted dispatched work item.",
  },
  [AuditAction.WCOS_WORK_ITEM_BLOCKED]: {
    category: "TASK_WORKFLOW",
    label: "Work Item Blocked",
    tone: "rose",
    description: "Work item marked blocked pending dependencies.",
  },
  [AuditAction.WCOS_WORK_ITEM_UNBLOCKED]: {
    category: "TASK_WORKFLOW",
    label: "Work Item Unblocked",
    tone: "emerald",
    description: "Work item unblocked for continuation.",
  },
  [AuditAction.WCOS_WORK_ITEM_REASSIGNED]: {
    category: "TASK_WORKFLOW",
    label: "Work Item Reassigned",
    tone: "amber",
    description: "WCOS work item reassigned to alternate staff.",
  },
  [AuditAction.WCOS_WORK_ITEM_ESCALATED]: {
    category: "TASK_WORKFLOW",
    label: "Work Item Escalated",
    tone: "rose",
    description: "Work item escalated due to SLA risk.",
  },
  [AuditAction.WCOS_SLA_BREACH_RECORDED]: {
    category: "TASK_WORKFLOW",
    label: "SLA Breach Recorded",
    tone: "rose",
    description: "SLA threshold exceeded for operational work item.",
  },
  [AuditAction.WCOS_CAPACITY_OVERLOADED]: {
    category: "TASK_WORKFLOW",
    label: "Capacity Overloaded",
    tone: "amber",
    description: "Queue capacity threshold warning triggered.",
  },
  [AuditAction.WCOS_MANAGER_OVERRIDE]: {
    category: "TASK_WORKFLOW",
    label: "Manager Override",
    tone: "amber",
    description: "Manager manual override of automated dispatch.",
  },
  [AuditAction.WCOS_WORK_ITEM_COMPLETED]: {
    category: "TASK_WORKFLOW",
    label: "Work Item Completed",
    tone: "emerald",
    description: "WCOS work item completed and closed.",
  },

  // Interviews & Offers
  [AuditAction.INTERVIEW_CREATED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Created",
    tone: "blue",
    description: "Interview cycle created for candidate.",
  },
  [AuditAction.INTERVIEW_ROUND_CREATED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Round Created",
    tone: "blue",
    description: "Interview round added to cycle.",
  },
  [AuditAction.INTERVIEW_ROUND_SCHEDULED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Scheduled",
    tone: "emerald",
    description: "Interview date, time, and link confirmed.",
  },
  [AuditAction.INTERVIEW_ROUND_RESCHEDULED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Rescheduled",
    tone: "amber",
    description: "Interview schedule updated.",
  },
  [AuditAction.INTERVIEW_ROUND_CANCELLED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Cancelled",
    tone: "rose",
    description: "Interview round cancelled.",
  },
  [AuditAction.INTERVIEW_ROUND_COMPLETED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Completed",
    tone: "emerald",
    description: "Interview round concluded.",
  },
  [AuditAction.INTERVIEW_DEBRIEF_RECORDED]: {
    category: "INTERVIEW_OFFER",
    label: "Debrief Recorded",
    tone: "blue",
    description: "Candidate debrief feedback captured.",
  },
  [AuditAction.INTERVIEW_OUTCOME_RECORDED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Outcome Recorded",
    tone: "neutral",
    description: "Employer feedback and stage outcome recorded.",
  },
  [AuditAction.INTERVIEW_ROUND_VOIDED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Voided",
    tone: "rose",
    description: "Interview round voided due to procedural error.",
  },
  [AuditAction.INTERVIEW_ROUND_SUPERSEDED]: {
    category: "INTERVIEW_OFFER",
    label: "Interview Superseded",
    tone: "neutral",
    description: "Interview round superseded by updated record.",
  },
  [AuditAction.APPLICATION_OUTCOME_CREATED]: {
    category: "INTERVIEW_OFFER",
    label: "Application Outcome Created",
    tone: "blue",
    description: "Application outcome recorded in ledger.",
  },
  [AuditAction.APPLICATION_OUTCOME_CANDIDATE_REPORTED]: {
    category: "INTERVIEW_OFFER",
    label: "Outcome Candidate Reported",
    tone: "blue",
    description: "Candidate self-reported interview outcome.",
  },
  [AuditAction.APPLICATION_OUTCOME_VERIFIED]: {
    category: "INTERVIEW_OFFER",
    label: "Outcome Verified",
    tone: "emerald",
    description: "Staff verified application outcome.",
  },
  [AuditAction.APPLICATION_OUTCOME_VOIDED]: {
    category: "INTERVIEW_OFFER",
    label: "Outcome Voided",
    tone: "rose",
    description: "Outcome record voided.",
  },
  [AuditAction.APPLICATION_OUTCOME_SUPERSEDED]: {
    category: "INTERVIEW_OFFER",
    label: "Outcome Superseded",
    tone: "neutral",
    description: "Outcome record superseded by newer ledger entry.",
  },
  [AuditAction.APPLICATION_OUTCOME_EVIDENCE_UPLOADED]: {
    category: "INTERVIEW_OFFER",
    label: "Outcome Evidence Uploaded",
    tone: "emerald",
    description: "Verification proof attached to outcome.",
  },
  [AuditAction.OPOS_OFFER_CREATED]: {
    category: "INTERVIEW_OFFER",
    label: "Offer Created",
    tone: "blue",
    description: "Formal job offer recorded.",
  },
  [AuditAction.OPOS_OFFER_UPDATED]: {
    category: "INTERVIEW_OFFER",
    label: "Offer Updated",
    tone: "neutral",
    description: "Offer parameters updated.",
  },
  [AuditAction.OPOS_OFFER_VERIFIED]: {
    category: "INTERVIEW_OFFER",
    label: "Offer Verified",
    tone: "emerald",
    description: "Offer authenticity verified with documentation.",
  },
  [AuditAction.OPOS_OFFER_VERSION_CREATED]: {
    category: "INTERVIEW_OFFER",
    label: "Offer Version Created",
    tone: "blue",
    description: "New immutable offer version drafted.",
  },
  [AuditAction.OPOS_DEADLINE_EXTENDED]: {
    category: "INTERVIEW_OFFER",
    label: "Deadline Extended",
    tone: "amber",
    description: "Offer decision deadline extended.",
  },
  [AuditAction.OPOS_NEGOTIATION_INITIATED]: {
    category: "INTERVIEW_OFFER",
    label: "Negotiation Initiated",
    tone: "blue",
    description: "Offer compensation negotiation started.",
  },
  [AuditAction.OPOS_NEGOTIATION_EVENT_RECORDED]: {
    category: "INTERVIEW_OFFER",
    label: "Negotiation Event Recorded",
    tone: "neutral",
    description: "Counter-offer or negotiation exchange logged.",
  },
  [AuditAction.OPOS_OFFER_ACCEPTED]: {
    category: "INTERVIEW_OFFER",
    label: "Offer Accepted",
    tone: "emerald",
    description: "Candidate accepted the offer terms.",
  },
  [AuditAction.OPOS_OFFER_DECLINED]: {
    category: "INTERVIEW_OFFER",
    label: "Offer Declined",
    tone: "neutral",
    description: "Candidate declined the offer.",
  },
  [AuditAction.OPOS_JOINING_SCHEDULED]: {
    category: "INTERVIEW_OFFER",
    label: "Joining Scheduled",
    tone: "emerald",
    description: "Candidate start date scheduled.",
  },
  [AuditAction.OPOS_JOINING_UPDATED]: {
    category: "INTERVIEW_OFFER",
    label: "Joining Updated",
    tone: "neutral",
    description: "Candidate start date updated.",
  },
  [AuditAction.OPOS_PLACEMENT_VERIFIED]: {
    category: "INTERVIEW_OFFER",
    label: "Placement Verified",
    tone: "emerald",
    description: "Candidate start confirmed and placement verified.",
  },
  [AuditAction.OPOS_PLACEMENT_VOIDED]: {
    category: "INTERVIEW_OFFER",
    label: "Placement Voided",
    tone: "rose",
    description: "Placement record voided.",
  },
  [AuditAction.OPOS_EVIDENCE_ATTACHED]: {
    category: "INTERVIEW_OFFER",
    label: "Placement Evidence Attached",
    tone: "emerald",
    description: "Documentation proof attached to placement.",
  },

  // Commercial & Billing
  [AuditAction.COMMERCIAL_CUSTOMER_CREATED]: {
    category: "COMMERCIAL_BILLING",
    label: "Customer Created",
    tone: "blue",
    description: "Commercial customer account created.",
  },
  [AuditAction.COMMERCIAL_CUSTOMER_UPDATED]: {
    category: "COMMERCIAL_BILLING",
    label: "Customer Updated",
    tone: "neutral",
    description: "Commercial customer details modified.",
  },
  [AuditAction.COMMERCIAL_CUSTOMER_STATUS_CHANGED]: {
    category: "COMMERCIAL_BILLING",
    label: "Customer Status Changed",
    tone: "neutral",
    description: "Customer commercial status changed.",
  },
  [AuditAction.COMMERCIAL_CANDIDATE_RELATION_CREATED]: {
    category: "COMMERCIAL_BILLING",
    label: "Candidate Contract Bound",
    tone: "blue",
    description: "Candidate relationship bound to commercial contract.",
  },
  [AuditAction.COMMERCIAL_CANDIDATE_RELATION_UPDATED]: {
    category: "COMMERCIAL_BILLING",
    label: "Candidate Contract Updated",
    tone: "neutral",
    description: "Candidate commercial relation terms updated.",
  },
  [AuditAction.COMMERCIAL_CONTRACT_DRAFTED]: {
    category: "COMMERCIAL_BILLING",
    label: "Contract Drafted",
    tone: "blue",
    description: "Commercial contract drafted.",
  },
  [AuditAction.COMMERCIAL_CONTRACT_ACTIVATED]: {
    category: "COMMERCIAL_BILLING",
    label: "Contract Activated",
    tone: "emerald",
    description: "Commercial contract marked active.",
  },
  [AuditAction.COMMERCIAL_CONTRACT_VERSION_CREATED]: {
    category: "COMMERCIAL_BILLING",
    label: "Contract Version Created",
    tone: "blue",
    description: "New contract version created.",
  },
  [AuditAction.COMMERCIAL_CONTRACT_TERMINATED]: {
    category: "COMMERCIAL_BILLING",
    label: "Contract Terminated",
    tone: "rose",
    description: "Commercial contract terminated.",
  },
  [AuditAction.COMMERCIAL_EVENT_RECORDED]: {
    category: "COMMERCIAL_BILLING",
    label: "Commercial Event Recorded",
    tone: "neutral",
    description: "Commercial lifecycle milestone recorded.",
  },
  [AuditAction.COMMERCIAL_OUTBOX_EVENT_PROCESSED]: {
    category: "COMMERCIAL_BILLING",
    label: "Outbox Event Processed",
    tone: "emerald",
    description: "Commercial asynchronous event processed.",
  },
  [AuditAction.COMMERCIAL_INVOICE_GENERATED]: {
    category: "COMMERCIAL_BILLING",
    label: "Invoice Generated",
    tone: "blue",
    description: "Commercial invoice generated.",
  },
  [AuditAction.COMMERCIAL_INVOICE_ISSUED]: {
    category: "COMMERCIAL_BILLING",
    label: "Invoice Issued",
    tone: "emerald",
    description: "Commercial invoice issued to client.",
  },
  [AuditAction.COMMERCIAL_INVOICE_VOIDED]: {
    category: "COMMERCIAL_BILLING",
    label: "Invoice Voided",
    tone: "rose",
    description: "Commercial invoice voided.",
  },
  [AuditAction.COMMERCIAL_INVOICE_WRITTEN_OFF]: {
    category: "COMMERCIAL_BILLING",
    label: "Invoice Written Off",
    tone: "rose",
    description: "Invoice balance written off as uncollectible.",
  },
  [AuditAction.COMMERCIAL_PAYMENT_RECORDED]: {
    category: "COMMERCIAL_BILLING",
    label: "Payment Recorded",
    tone: "emerald",
    description: "Client payment received and recorded.",
  },
  [AuditAction.COMMERCIAL_PAYMENT_FAILED]: {
    category: "COMMERCIAL_BILLING",
    label: "Payment Failed",
    tone: "rose",
    description: "Payment transaction failed.",
  },
  [AuditAction.COMMERCIAL_CREDIT_ISSUED]: {
    category: "COMMERCIAL_BILLING",
    label: "Credit Issued",
    tone: "amber",
    description: "Commercial billing credit issued.",
  },
  [AuditAction.COMMERCIAL_REFUND_EXECUTED]: {
    category: "COMMERCIAL_BILLING",
    label: "Refund Executed",
    tone: "rose",
    description: "Client payment refund executed.",
  },
  [AuditAction.COMMERCIAL_ADJUSTMENT_RECORDED]: {
    category: "COMMERCIAL_BILLING",
    label: "Adjustment Recorded",
    tone: "neutral",
    description: "Financial ledger adjustment recorded.",
  },
  [AuditAction.COMMERCIAL_REVENUE_ATTRIBUTED]: {
    category: "COMMERCIAL_BILLING",
    label: "Revenue Attributed",
    tone: "emerald",
    description: "Revenue attribution recorded for placement.",
  },

  // Privacy & Compliance
  [AuditAction.PRIVACY_REQUEST_CREATED]: {
    category: "PRIVACY_COMPLIANCE",
    label: "Privacy Request Created",
    tone: "blue",
    description: "Data subject privacy request submitted.",
  },
  [AuditAction.PRIVACY_REQUEST_VERIFIED]: {
    category: "PRIVACY_COMPLIANCE",
    label: "Privacy Request Verified",
    tone: "emerald",
    description: "Data subject identity verified.",
  },
  [AuditAction.PRIVACY_REQUEST_COMPLETED]: {
    category: "PRIVACY_COMPLIANCE",
    label: "Privacy Request Completed",
    tone: "emerald",
    description: "Privacy request executed and fulfilled.",
  },
  [AuditAction.PRIVACY_REQUEST_REJECTED]: {
    category: "PRIVACY_COMPLIANCE",
    label: "Privacy Request Rejected",
    tone: "rose",
    description: "Privacy request rejected with documented reason.",
  },
  [AuditAction.CANDIDATE_DATA_EXPORTED]: {
    category: "PRIVACY_COMPLIANCE",
    label: "Candidate Data Exported",
    tone: "emerald",
    description: "Candidate data dossier exported per subject access request.",
  },
  [AuditAction.CANDIDATE_DATA_CORRECTED]: {
    category: "PRIVACY_COMPLIANCE",
    label: "Candidate Data Corrected",
    tone: "amber",
    description: "Candidate data corrected per accuracy request.",
  },
  [AuditAction.CANDIDATE_DATA_DELETED]: {
    category: "PRIVACY_COMPLIANCE",
    label: "Candidate Data Deleted",
    tone: "rose",
    description: "Candidate personal data erased while preserving required records.",
  },

  // AI & Intelligence
  [AuditAction.JOB_DESCRIPTION_SNAPSHOT_CAPTURED]: {
    category: "INTELLIGENCE",
    label: "JD Snapshot Captured",
    tone: "blue",
    description: "Raw job description text snapshot captured.",
  },
  [AuditAction.JOB_REQUIREMENT_SET_CREATED]: {
    category: "INTELLIGENCE",
    label: "Requirement Set Created",
    tone: "blue",
    description: "Structured criteria extracted from job description.",
  },
  [AuditAction.JOB_REQUIREMENT_SET_INVALIDATED]: {
    category: "INTELLIGENCE",
    label: "Requirement Set Invalidated",
    tone: "rose",
    description: "Job requirements marked obsolete due to JD edit.",
  },
  [AuditAction.APPLICATION_INTELLIGENCE_REQUESTED]: {
    category: "INTELLIGENCE",
    label: "AI Analysis Requested",
    tone: "blue",
    description: "Application intelligence computation queued.",
  },
  [AuditAction.APPLICATION_INTELLIGENCE_STARTED]: {
    category: "INTELLIGENCE",
    label: "AI Analysis Started",
    tone: "blue",
    description: "Application intelligence analysis started.",
  },
  [AuditAction.APPLICATION_INTELLIGENCE_COMPLETED]: {
    category: "INTELLIGENCE",
    label: "AI Analysis Completed",
    tone: "emerald",
    description: "Application intelligence computation completed.",
  },
  [AuditAction.APPLICATION_INTELLIGENCE_FAILED]: {
    category: "INTELLIGENCE",
    label: "AI Analysis Failed",
    tone: "rose",
    description: "Intelligence computation failed.",
  },
  [AuditAction.APPLICATION_INTELLIGENCE_INVALIDATED]: {
    category: "INTELLIGENCE",
    label: "AI Analysis Invalidated",
    tone: "rose",
    description: "Intelligence scores invalidated due to material changes.",
  },
  [AuditAction.APPLICATION_INTELLIGENCE_MARKED_STALE]: {
    category: "INTELLIGENCE",
    label: "AI Analysis Stale",
    tone: "amber",
    description: "Intelligence analysis marked stale.",
  },
  [AuditAction.APPLICATION_INTELLIGENCE_RECOMPUTE_REQUESTED]: {
    category: "INTELLIGENCE",
    label: "AI Recompute Requested",
    tone: "blue",
    description: "Recomputation requested for application intelligence.",
  },
  [AuditAction.RESUME_EXTRACT_REQUESTED]: {
    category: "INTELLIGENCE",
    label: "Resume Extract Requested",
    tone: "blue",
    description: "Resume document parse and extraction requested.",
  },
  [AuditAction.RESUME_EXTRACT_COMPLETED]: {
    category: "INTELLIGENCE",
    label: "Resume Extract Completed",
    tone: "emerald",
    description: "Resume document extraction completed.",
  },
  [AuditAction.RESUME_EXTRACT_FAILED]: {
    category: "INTELLIGENCE",
    label: "Resume Extract Failed",
    tone: "rose",
    description: "Resume extraction failed.",
  },
  [AuditAction.RESUME_REVIEW_REQUESTED]: {
    category: "INTELLIGENCE",
    label: "Resume Review Requested",
    tone: "blue",
    description: "ATS score and fit review requested.",
  },
  [AuditAction.RESUME_REVIEW_COMPLETED]: {
    category: "INTELLIGENCE",
    label: "Resume Review Completed",
    tone: "emerald",
    description: "ATS review completed with alignment feedback.",
  },
  [AuditAction.RESUME_REVIEW_FAILED]: {
    category: "INTELLIGENCE",
    label: "Resume Review Failed",
    tone: "rose",
    description: "Resume review evaluation failed.",
  },
  [AuditAction.RESUME_REVIEW_MARKED_STALE]: {
    category: "INTELLIGENCE",
    label: "Resume Review Stale",
    tone: "amber",
    description: "Resume review marked stale due to candidate update.",
  },
  [AuditAction.JOB_MATCH_REQUESTED]: {
    category: "INTELLIGENCE",
    label: "Job Match Requested",
    tone: "blue",
    description: "Job match scoring calculation requested.",
  },
  [AuditAction.JOB_MATCH_COMPLETED]: {
    category: "INTELLIGENCE",
    label: "Job Match Completed",
    tone: "emerald",
    description: "Candidate-job matching computation completed.",
  },
  [AuditAction.JOB_MATCH_FAILED]: {
    category: "INTELLIGENCE",
    label: "Job Match Failed",
    tone: "rose",
    description: "Job match scoring computation failed.",
  },
  [AuditAction.JOB_MATCH_MARKED_STALE]: {
    category: "INTELLIGENCE",
    label: "Job Match Stale",
    tone: "amber",
    description: "Job match marked stale.",
  },
  [AuditAction.JOB_MATCH_SAVED]: {
    category: "INTELLIGENCE",
    label: "Job Match Saved",
    tone: "emerald",
    description: "Job match bookmark saved by candidate or staff.",
  },
  [AuditAction.JOB_MATCH_DISMISSED]: {
    category: "INTELLIGENCE",
    label: "Job Match Dismissed",
    tone: "neutral",
    description: "Job match recommendation dismissed.",
  },
  [AuditAction.JOB_APPLICATION_REQUESTED]: {
    category: "INTELLIGENCE",
    label: "Job Apply Requested",
    tone: "blue",
    description: "Candidate requested staff apply to matching job.",
  },

  // Communications
  [AuditAction.CONVERSATION_CREATED]: {
    category: "MEMBERSHIP_STAFF",
    label: "Conversation Created",
    tone: "blue",
    description: "Messaging channel initialized.",
  },
  [AuditAction.MESSAGE_SENT]: {
    category: "MEMBERSHIP_STAFF",
    label: "Message Sent",
    tone: "neutral",
    description: "Message dispatched in conversation thread.",
  },
  [AuditAction.INTERNAL_NOTE_CREATED]: {
    category: "TASK_WORKFLOW",
    label: "Internal Note Created",
    tone: "neutral",
    description: "Internal staff note added to entity record.",
  },
  [AuditAction.NOTIFICATION_CREATED]: {
    category: "SECURITY_IDENTITY",
    label: "Notification Created",
    tone: "neutral",
    description: "In-app notification generated.",
  },
  [AuditAction.NOTIFICATION_READ]: {
    category: "SECURITY_IDENTITY",
    label: "Notification Read",
    tone: "neutral",
    description: "User marked notification as read.",
  },
  [AuditAction.EMAIL_NOTIFICATION_DISPATCHED]: {
    category: "SECURITY_IDENTITY",
    label: "Email Dispatched",
    tone: "emerald",
    description: "External email notification sent via SMTP.",
  },
};

export function getActionMetadata(action: string): ActionMetadata {
  const recognized = (ACTION_CATALOG as Record<string, { category: AuditCategory; label: string; tone: AuditTone; description: string } | undefined>)[action];
  if (recognized) {
    return {
      action: action as AuditAction,
      category: recognized.category,
      label: recognized.label,
      tone: recognized.tone,
      description: recognized.description,
    };
  }

  // Graceful fallback for dynamic or uncatalogued actions
  const formatted = action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    action: action as AuditAction,
    category: "ALL",
    label: formatted,
    tone: "neutral",
    description: `Audit event for action ${action}`,
  };
}

export function getActionsForCategory(category: string): AuditAction[] {
  if (!category || category === "ALL") {
    return Object.values(AuditAction);
  }

  return (Object.entries(ACTION_CATALOG) as [AuditAction, { category: AuditCategory }][])
    .filter(([_, meta]) => meta.category === category)
    .map(([action]) => action);
}

export function getAllCategories(): { key: AuditCategory; label: string }[] {
  return [
    { key: "ALL", label: CATEGORY_LABELS.ALL },
    { key: "SECURITY_IDENTITY", label: CATEGORY_LABELS.SECURITY_IDENTITY },
    { key: "MEMBERSHIP_STAFF", label: CATEGORY_LABELS.MEMBERSHIP_STAFF },
    { key: "CANDIDATE_PROFILE", label: CATEGORY_LABELS.CANDIDATE_PROFILE },
    { key: "JOB_APPLICATION", label: CATEGORY_LABELS.JOB_APPLICATION },
    { key: "TASK_WORKFLOW", label: CATEGORY_LABELS.TASK_WORKFLOW },
    { key: "INTERVIEW_OFFER", label: CATEGORY_LABELS.INTERVIEW_OFFER },
    { key: "COMMERCIAL_BILLING", label: CATEGORY_LABELS.COMMERCIAL_BILLING },
    { key: "PRIVACY_COMPLIANCE", label: CATEGORY_LABELS.PRIVACY_COMPLIANCE },
    { key: "INTELLIGENCE", label: CATEGORY_LABELS.INTELLIGENCE },
  ];
}
