"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { CandidateActionItem } from "./CandidateActionCenter";

export interface CandidateCurrentOperationsProfile {
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  headline?: string | null;
  professionalSummary?: string | null;
  workAuthorization?: string | null;
  experiencesCount: number;
  educationsCount: number;
  skillsCount: number;
  projectsCount: number;
  documentsCount: number;
  verificationStatus?: string | null;
  verificationNotes?: string | null;
}

export interface CandidateCurrentOperationsStats {
  totalApplications: number;
  activeApplications: number;
  awaitingApprovalApplications: number;
  submittedApplications: number;
  readyApplications: number;
  preparingApplications: number;
  underReviewApplications: number;
  employerResponseApplications: number;
}

interface Props {
  stats: CandidateCurrentOperationsStats;
  candidateProfile: CandidateCurrentOperationsProfile;
  actions?: CandidateActionItem[];
}

interface DerivedNextAction {
  type: "ACTION_REQUIRED" | "PROFILE_COMPLETION" | "READY";
  eyebrow: string;
  title: string;
  description: string;
  actionUrl?: string;
  actionLabel?: string;
  isUrgent?: boolean;
}

export function CandidateCurrentOperations({
  stats,
  candidateProfile,
  actions = [],
}: Props) {
  // 1. Authoritative Operational Pipeline Projection (Left)
  const operationalState = useMemo(() => {
    const total = stats.totalApplications;
    const submitted = stats.submittedApplications;
    const inPrep =
      stats.preparingApplications +
      stats.underReviewApplications +
      stats.awaitingApprovalApplications +
      stats.readyApplications;

    if (total === 0) {
      return {
        hasOperations: false,
        headline: "No active application operations",
        detail: "Your search pipeline will populate as positions are matched and qualified.",
        badgeText: "Pipeline Idle",
        badgeColor: "bg-slate-100 text-slate-600 border-slate-200",
      };
    }

    const headline = `${total} application${total === 1 ? "" : "s"} currently managed`;

    let detail = "";
    if (submitted > 0 && inPrep > 0) {
      detail = `${submitted} submitted · ${inPrep} in preparation`;
    } else if (submitted > 0) {
      detail = `${submitted} application${submitted === 1 ? " has" : "s have"} been submitted`;
    } else if (inPrep > 0) {
      detail = `${inPrep} application${inPrep === 1 ? " is" : "s are"} in active preparation`;
    } else if (stats.employerResponseApplications > 0) {
      detail = `${stats.employerResponseApplications} application outcome${
        stats.employerResponseApplications === 1 ? "" : "s"
      } recorded`;
    } else {
      detail = `${total} application${total === 1 ? "" : "s"} in tracking`;
    }

    return {
      hasOperations: true,
      headline,
      detail,
      badgeText:
        stats.awaitingApprovalApplications > 0
          ? `${stats.awaitingApprovalApplications} Action Needed`
          : submitted > 0
          ? `${submitted} Submitted`
          : `${inPrep} In Progress`,
      badgeColor:
        stats.awaitingApprovalApplications > 0
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : "bg-blue-50 text-blue-800 border-blue-200",
    };
  }, [stats]);

  // 2. Deterministic Next Candidate Action Priority (Right)
  const nextAction = useMemo<DerivedNextAction>(() => {
    // Priority 1: Pending Application Approvals
    if (stats.awaitingApprovalApplications > 0) {
      return {
        type: "ACTION_REQUIRED",
        eyebrow: "Next candidate action",
        title: "Approve Application Materials",
        description:
          "Your operations team has prepared materials for review. Sign off so we can submit.",
        actionUrl: "/candidate/applications",
        actionLabel: "Review Approvals",
        isUrgent: true,
      };
    }

    // Priority 2: Verification notes from operations
    if (
      candidateProfile.verificationNotes &&
      candidateProfile.verificationStatus !== "VERIFIED"
    ) {
      return {
        type: "ACTION_REQUIRED",
        eyebrow: "Next candidate action",
        title: "Action Requested on Verification",
        description:
          candidateProfile.verificationNotes ||
          "Specialists requested updated information to complete verification.",
        actionUrl: "/candidate/profile",
        actionLabel: "Update Profile",
        isUrgent: true,
      };
    }

    // Priority 3: Contact & Location
    if (
      !candidateProfile.phone ||
      (!candidateProfile.city && !candidateProfile.country)
    ) {
      return {
        type: "PROFILE_COMPLETION",
        eyebrow: "Next candidate action",
        title: "Add Contact & Location Details",
        description:
          "Provide your phone number and location so operations can target eligible geographic listings.",
        actionUrl: "/candidate/profile",
        actionLabel: "Complete Profile",
      };
    }

    // Priority 4: Resume / Document Vault
    if (candidateProfile.documentsCount === 0) {
      return {
        type: "PROFILE_COMPLETION",
        eyebrow: "Next candidate action",
        title: "Upload Your Resume",
        description:
          "Upload your master resume so specialists can extract verified facts and tailor submissions.",
        actionUrl: "/candidate/profile",
        actionLabel: "Upload Resume",
      };
    }

    // Priority 5: Work Authorization
    if (
      !candidateProfile.workAuthorization ||
      candidateProfile.workAuthorization === "OTHER"
    ) {
      return {
        type: "PROFILE_COMPLETION",
        eyebrow: "Next candidate action",
        title: "Confirm Work Authorization Status",
        description:
          "Clarify your citizenship or visa sponsorship requirements for accurate qualification.",
        actionUrl: "/candidate/profile",
        actionLabel: "Set Authorization",
      };
    }

    // Priority 6: Professional Summary
    if (
      !candidateProfile.headline ||
      !candidateProfile.professionalSummary
    ) {
      return {
        type: "PROFILE_COMPLETION",
        eyebrow: "Next candidate action",
        title: "Complete your Professional Summary",
        description:
          "Your profile is missing information needed for more precise application tailoring.",
        actionUrl: "/candidate/profile",
        actionLabel: "Complete Profile",
      };
    }

    // Priority 7: Work Experience
    if (candidateProfile.experiencesCount === 0) {
      return {
        type: "PROFILE_COMPLETION",
        eyebrow: "Next candidate action",
        title: "Add Work Experience",
        description:
          "Record your employment history to empower tailored resume drafting.",
        actionUrl: "/candidate/profile",
        actionLabel: "Add Experience",
      };
    }

    // Priority 8: Skills
    if (candidateProfile.skillsCount === 0) {
      return {
        type: "PROFILE_COMPLETION",
        eyebrow: "Next candidate action",
        title: "Catalog Key Skills",
        description:
          "Add core technical skills to optimize keyword matching with job descriptions.",
        actionUrl: "/candidate/profile",
        actionLabel: "Add Skills",
      };
    }

    // Priority 9: Education
    if (candidateProfile.educationsCount === 0) {
      return {
        type: "PROFILE_COMPLETION",
        eyebrow: "Next candidate action",
        title: "Add Education History",
        description:
          "Add your academic background or degrees for verified qualification.",
        actionUrl: "/candidate/profile",
        actionLabel: "Add Education",
      };
    }

    // Priority 10: Projects
    if (candidateProfile.projectsCount === 0) {
      return {
        type: "PROFILE_COMPLETION",
        eyebrow: "Next candidate action",
        title: "Add Projects",
        description:
          "Showcase portfolio work or key projects to strengthen tailored proposals.",
        actionUrl: "/candidate/profile",
        actionLabel: "Add Projects",
      };
    }

    // Default: Everything complete & ready
    return {
      type: "READY",
      eyebrow: "Ready",
      title: "Profile & Materials Ready",
      description:
        "Your candidate profile and application materials are ready for ongoing operations.",
    };
  }, [stats, candidateProfile]);

  return (
    <section
      aria-label="Current Operations Summary"
      className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden"
    >
      <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 items-center divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* Left: Authoritative Operational State */}
        <div className="md:col-span-6 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Current Operations
            </span>
            {operationalState.hasOperations && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {operationalState.headline}
          </h2>

          <div className="flex items-center gap-2.5 flex-wrap pt-0.5">
            <p className="text-xs sm:text-sm text-slate-600 font-medium">
              {operationalState.detail}
            </p>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${operationalState.badgeColor}`}
            >
              {operationalState.badgeText}
            </span>
          </div>
        </div>

        {/* Right: Next Candidate Action / Ready State */}
        <div className="pt-4 md:pt-0 md:pl-8 md:col-span-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  nextAction.type === "READY"
                    ? "text-emerald-700"
                    : nextAction.isUrgent
                    ? "text-amber-800"
                    : "text-slate-500"
                }`}
              >
                {nextAction.eyebrow}
              </span>
              {nextAction.type === "READY" && (
                <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center text-[10px] font-bold">
                  ✓
                </span>
              )}
            </div>

            <h3 className="text-xs sm:text-sm font-semibold text-slate-900">
              {nextAction.title}
            </h3>

            <p className="text-xs text-slate-500 leading-relaxed max-w-md">
              {nextAction.description}
            </p>
          </div>

          {nextAction.actionUrl && nextAction.actionLabel && (
            <div className="shrink-0 pt-1 sm:pt-0">
              <Link
                href={nextAction.actionUrl}
                className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  nextAction.isUrgent
                    ? "bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-600"
                    : "bg-slate-900 hover:bg-slate-800 text-white focus-visible:ring-slate-900"
                }`}
              >
                <span>{nextAction.actionLabel}</span>
                <span className="text-[13px] leading-none">→</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
