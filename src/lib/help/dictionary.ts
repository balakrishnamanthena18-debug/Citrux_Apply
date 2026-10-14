/**
 * OOS Enterprise Contextual Help System — Authoritative Domain Dictionary
 *
 * Each entry provides truthful, candidate-safe or staff-authorized explanations following:
 * 1. What it means (factual definition)
 * 2. Why it matters (operational context)
 * 3. What to do (action required if applicable)
 *
 * Strict Privacy Rules:
 * - Candidate-facing topics NEVER reveal internal QA checklists, employee notes, or commercial margins.
 * - Staff-facing topics explain operational capacity, SLA rules, and governance truthfully.
 */

export interface HelpTopicDefinition {
  title: string;
  whatItMeans: string;
  whyItMatters?: string;
  whatToDo?: string;
  audience: "CANDIDATE" | "STAFF" | "ADMIN" | "UNIVERSAL";
}

export const HELP_DICTIONARY = {
  // =========================================================================
  // 1. CANDIDATE DESK & APPLICATION LIFECYCLE
  // =========================================================================
  active_pipeline: {
    title: "Active Pipeline",
    whatItMeans: "All applications currently in flight, including positions being researched, tailored, awaiting your review, or submitted to employers.",
    whyItMatters: "Applications remain active until a final decision (e.g. rejection or withdrawal) is recorded.",
    whatToDo: "Monitor your dashboard for pending approvals or confirmed interview invitations.",
    audience: "CANDIDATE",
  },
  awaiting_approval: {
    title: "Awaiting Your Sign-Off",
    whatItMeans: "Tailored materials (custom resume and cover letter) prepared by your operations specialist are ready for your review.",
    whyItMatters: "We strictly enforce a candidate consent boundary: no application is submitted to an external employer without your explicit sign-off.",
    whatToDo: "Review the tailored package and approve it to authorize external submission.",
    audience: "CANDIDATE",
  },
  submitted_applications: {
    title: "Confirmed Submissions",
    whatItMeans: "Applications that our submission desk has successfully completed and verified on the employer's official portal.",
    whyItMatters: "Every submitted application has an authoritative submission confirmation timestamp and receipt.",
    whatToDo: "Your specialist will track employer outreach; check the schedule for interview requests.",
    audience: "CANDIDATE",
  },
  ready_applications: {
    title: "Ready to Apply",
    whatItMeans: "Applications that you have approved, which have passed quality checks and are queued for intake by the external submission desk.",
    whyItMatters: "Submissions are scheduled according to optimal employer posting windows and manual entry rules.",
    whatToDo: "No action required. Your submission specialist will dispatch the package.",
    audience: "CANDIDATE",
  },
  preparing_applications: {
    title: "In Preparation",
    whatItMeans: "Applications currently being researched and authored by your dedicated operations specialist.",
    whyItMatters: "Specialists align your verified career facts and achievements with the employer's core job requirements.",
    whatToDo: "Keep your profile and document vault updated so specialists have complete evidence.",
    audience: "CANDIDATE",
  },
  under_review_applications: {
    title: "Under Quality Review",
    whatItMeans: "Tailored materials undergoing rigorous internal quality assurance review prior to candidate presentation.",
    whyItMatters: "Guarantees high typographical, factual, and ATS keyword fidelity before requesting your sign-off.",
    whatToDo: "No action required. You will be alerted when materials are ready for approval.",
    audience: "CANDIDATE",
  },
  closed_applications: {
    title: "Closed / Concluded Roles",
    whatItMeans: "Positions that have reached a terminal outcome, including employer rejections, candidate withdrawals, or discontinued listings.",
    whyItMatters: "Archived roles are retained for complete history and audit integrity, but are excluded from active search metrics.",
    whatToDo: "Your desk continuously sources and tailors new matching roles to keep your pipeline active.",
    audience: "CANDIDATE",
  },
  document_vault: {
    title: "Document Vault",
    whatItMeans: "Your secure repository of master resumes, portfolios, and career credentials.",
    whyItMatters: "Specialists use your master resume as the sole source of truth to draft tailored applications without hallucinating details.",
    whatToDo: "Ensure your primary resume is marked as Default so specialists reference your latest version.",
    audience: "CANDIDATE",
  },
  verification_status: {
    title: "Profile Verification Status",
    whatItMeans: "Indicates whether your career history, contact details, and work authorization have been factually verified by staff.",
    whyItMatters: "Verified profiles prevent compliance rejections on employer ATS portals and unlock priority application submissions.",
    whatToDo: "If your status is Unverified or Pending, provide any requested clarifications in your profile.",
    audience: "CANDIDATE",
  },
  desk_sla: {
    title: "Operations Desk Response SLA",
    whatItMeans: "Our verified service standard: direct messages sent during business hours (Mon–Fri, 9am–6pm EST) are reviewed within 4 operational hours.",
    whyItMatters: "Guarantees timely support and active monitoring of urgent employer updates.",
    whatToDo: "Use direct messages for time-sensitive questions or interview scheduling notifications.",
    audience: "CANDIDATE",
  },
  next_best_action: {
    title: "Priority Directive",
    whatItMeans: "The single highest-impact action required from you right now to maintain momentum across your pipeline.",
    whyItMatters: "Prioritizes urgent tasks (such as approving materials or uploading a missing resume) while reassuring you when no action is needed.",
    whatToDo: "Click the action button to resolve the pending item in 1–2 minutes.",
    audience: "CANDIDATE",
  },
  career_milestones: {
    title: "Career Service Milestones",
    whatItMeans: "A transparent 6-stage journey tracking your progress from onboarding and baseline setup through employer offers.",
    whyItMatters: "Helps you understand exactly which stage your career search is in and what prerequisites unlock the next phase.",
    whatToDo: "Complete remaining prerequisites highlighted on the active milestone card.",
    audience: "CANDIDATE",
  },

  // =========================================================================
  // 2. INTERVIEW OPERATING SYSTEM (INTERVIEW OS)
  // =========================================================================
  interview_round_type: {
    title: "Interview Round Format",
    whatItMeans: "The evaluation stage requested by the employer (e.g. Recruiter Screening, Technical Assessment, System Design, or Executive Final).",
    whyItMatters: "Different round types require distinct preparation tactics, question sets, and technical depth.",
    whatToDo: "Review the round-specific preparation brief staged by your career specialist.",
    audience: "UNIVERSAL",
  },
  interview_prep_brief: {
    title: "Preparation Brief",
    whatItMeans: "A structured preparation resource synthesizing verified candidate evidence with employer requirements for this specific role.",
    whyItMatters: "Provides tailored talking points, likely technical questions, and company context for the interview.",
    whatToDo: "Review the brief prior to the session; take notes on talking points you want to highlight.",
    audience: "CANDIDATE",
  },
  interview_debrief: {
    title: "Session Debrief",
    whatItMeans: "Your post-interview reflection capturing questions asked, interview sentiment, and topics covered.",
    whyItMatters: "Allows your operations specialist to adjust follow-up communications and calibrate preparation for subsequent rounds.",
    whatToDo: "Submit your debrief within 24 hours of completing the interview session.",
    audience: "CANDIDATE",
  },

  // =========================================================================
  // 3. EMPLOYEE WORKFORCE & CAPACITY (WCOS)
  // =========================================================================
  task_priority: {
    title: "Task Priority",
    whatItMeans: "The operational urgency of this work item (Urgent, High, Normal, or Low) based on role SLA and employer deadlines.",
    whyItMatters: "Automated dispatch and queue ordering prioritize High and Urgent tasks to prevent SLA breaches.",
    whatToDo: "Execute Urgent tasks immediately or escalate if external blockers exist.",
    audience: "STAFF",
  },
  task_sla_deadline: {
    title: "Operational SLA Deadline",
    whatItMeans: "The deterministic completion deadline calculated when this task was enrolled into the workflow.",
    whyItMatters: "Task reassignment does not reset the original SLA deadline. Unresolved tasks trigger automated escalation warnings.",
    whatToDo: "Complete work before the deadline or record an explicit pause reason if candidate response is pending.",
    audience: "STAFF",
  },
  capacity_units: {
    title: "Capacity Units (CU)",
    whatItMeans: "Standardized measure of cognitive and operational workload assigned to an employee.",
    whyItMatters: "Automated task dispatch rejects assignment if the staff member's active CU would exceed their configured maximum capacity.",
    whatToDo: "Close completed work items to release capacity units for newly queued tasks.",
    audience: "STAFF",
  },
  task_escalation: {
    title: "Escalated Task Governance",
    whatItMeans: "A work item that has breached an operational threshold or encountered an unresolvable blocker requiring supervisor intervention.",
    whyItMatters: "Escalated tasks pause normal worker SLAs and alert team leads for triage, reassignment, or executive resolution.",
    whatToDo: "Admins or team leads must reassign, resume active progress, or cancel with audited notes.",
    audience: "ADMIN",
  },

  // =========================================================================
  // 4. OFFER & PLACEMENT (OPOS)
  // =========================================================================
  offer_status: {
    title: "Offer Lifecycle State",
    whatItMeans: "The official commercial state of an employer offer (Offer Recorded, Negotiating, Accepted, Declined, or Rescinded).",
    whyItMatters: "Governs placement record creation, billing attribution, and contract conclusion.",
    whatToDo: "Log verified counter-offers or signed acceptance evidence as soon as received.",
    audience: "STAFF",
  },
  placement_verification: {
    title: "Placement Verification",
    whatItMeans: "The formal verification that a candidate has accepted an offer, satisfied conditions, and established a confirmed start date.",
    whyItMatters: "Triggers placement revenue recognition, service contract conclusion, and client invoicing in CBOS.",
    whatToDo: "Verify signed offer letter and start confirmation before recording placement.",
    audience: "STAFF",
  },

  // =========================================================================
  // 5. COMMERCIAL & BILLING (CBOS)
  // =========================================================================
  service_contract_status: {
    title: "Service Contract Status",
    whatItMeans: "The commercial standing of the candidate's engagement (Draft, Active, Suspended, or Completed).",
    whyItMatters: "Active contracts entitle candidates to allocated application tailoring and dedicated operations desk services.",
    whatToDo: "Review contract terms and billing cadence for renewal dates.",
    audience: "UNIVERSAL",
  },
  entitlements_quota: {
    title: "Allocated Service Entitlements",
    whatItMeans: "The verified quota of tailored applications, intelligence runs, or specialist hours provisioned under this service plan.",
    whyItMatters: "Displays consumption balance against allocated plan limits to prevent unbilled overages.",
    whatToDo: "Contact your account representative if quota replenishment is required.",
    audience: "UNIVERSAL",
  },
  invoice_immutability: {
    title: "Invoice Status & Integrity",
    whatItMeans: "The current billing state. Once an invoice is issued, financial totals are strictly immutable under CBOS accounting rules.",
    whyItMatters: "Prevents silent billing mutations; adjustments require an explicit commercial credit memo.",
    whatToDo: "Admins must issue credit adjustments through formal dispute workflows.",
    audience: "STAFF",
  },

  // =========================================================================
  // 6. ADMIN, GOVERNANCE & PRIVACY
  // =========================================================================
  role_permissions: {
    title: "Role & Permission Boundary",
    whatItMeans: "Controls which actions, routes, and candidate records a user is authorized to view or mutate.",
    whyItMatters: "Strictly enforced by server-side authorization and PostgreSQL Row-Level Security (RLS), not by UI hiding alone.",
    whatToDo: "Assign staff roles based on required operational designation.",
    audience: "ADMIN",
  },
  audit_immutability: {
    title: "Immutable Audit Log",
    whatItMeans: "Tamper-evident record of security, authorization, state transition, and document access events.",
    whyItMatters: "All audit records are append-only. Database triggers physically block row modification and deletion.",
    whatToDo: "Reference event IDs when conducting forensic compliance or incident reviews.",
    audience: "ADMIN",
  },
  privacy_request_type: {
    title: "Privacy Request Lifecycle",
    whatItMeans: "Formal GDPR/CCPA data subject requests (Data Access, Erasure, Rectification, or Portability).",
    whyItMatters: "Subject to strict statutory deadlines; erasure cascades to anonymize non-audit candidate data while preserving financial books.",
    whatToDo: "Verify candidate identity before executing privacy export or anonymization actions.",
    audience: "ADMIN",
  },
} as const;

export type HelpTopicKey = keyof typeof HELP_DICTIONARY;

/**
 * Retrieve an authoritative explanation by key.
 */
export function getHelpTopic(key: HelpTopicKey): HelpTopicDefinition {
  return HELP_DICTIONARY[key];
}
