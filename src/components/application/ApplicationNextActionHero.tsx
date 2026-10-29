"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { DualTrackWorkflowStatus } from "@/lib/application/workflow-status";
import type { ApplicationPrerequisitesEvaluation } from "@/lib/application/prerequisites";
import type { ApplicationStatus } from "@/generated/prisma/enums";

interface ApplicationNextActionHeroProps {
  applicationId: string;
  status: ApplicationStatus | string;
  workflow: DualTrackWorkflowStatus;
  prerequisites: ApplicationPrerequisitesEvaluation;
  waitingForLabel: string;
  waitingAgeLabel: string;
  waitingSinceFormatted?: string | null;
  ownerDisplayName: string;
  ownerInactive: boolean;
  candidateName: string;
  candidateAuthMode: string;
  externalJobUrl?: string | null;
}

interface ActionCardConfig {
  headline: string;
  description: string;
  accountableRole: string;
  accountablePerson: string;
  buttonLabel: string;
  buttonVariant: "primary" | "warning" | "danger" | "neutral";
  targetTab: string;
  isActionDisabled: boolean;
  disabledReason?: string;
  externalLink?: string | null;
}

const LINEAR_STAGES = [
  { id: "PREPARATION", label: "Preparation", stepNumber: 1 },
  { id: "QUALITY_REVIEW", label: "Quality Review", stepNumber: 2 },
  { id: "APPROVAL", label: "Approval", stepNumber: 3 },
  { id: "READY", label: "Ready to Submit", stepNumber: 4 },
];

export function ApplicationNextActionHero({
  applicationId: _applicationId,
  status,
  workflow,
  prerequisites,
  waitingForLabel,
  waitingAgeLabel,
  waitingSinceFormatted,
  ownerDisplayName,
  ownerInactive,
  candidateName: _candidateName,
  candidateAuthMode: _candidateAuthMode,
  externalJobUrl,
}: ApplicationNextActionHeroProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showAllBlockers, setShowAllBlockers] = useState(false);

  function handleNavigateTab(tabId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // 1. Resolve State-to-Action Mapping
  function resolveActionConfig(): ActionCardConfig {
    switch (status) {
      case "DISCOVERED":
        return {
          headline: "Advance opportunity to qualification",
          description: "Verify that candidate experience and target role requirements align before tailoring materials.",
          accountableRole: "Assigned Specialist",
          accountablePerson: ownerDisplayName,
          buttonLabel: "Review Qualifications",
          buttonVariant: "primary",
          targetTab: "prep_review",
          isActionDisabled: false,
        };

      case "QUALIFIED":
        return {
          headline: "Begin tailoring application materials",
          description: "Select the candidate's latest resume version and write a customized cover letter.",
          accountableRole: "Assigned Specialist",
          accountablePerson: ownerDisplayName,
          buttonLabel: "Prepare Materials",
          buttonVariant: "primary",
          targetTab: "prep_review",
          isActionDisabled: false,
        };

      case "PREPARING": {
        const hasResume = prerequisites.gates.find((g) => g.id === "materials_prepared")?.passed;
        if (!hasResume) {
          return {
            headline: "Complete application preparation",
            description: "Attach the candidate resume version and review the tailored cover letter to prepare for QA.",
            accountableRole: "Assigned Specialist",
            accountablePerson: ownerDisplayName,
            buttonLabel: "Continue Preparation",
            buttonVariant: "primary",
            targetTab: "prep_review",
            isActionDisabled: false,
          };
        }
        return {
          headline: "Application materials ready for QA",
          description: "Candidate materials are attached. Submit this application package for authoritative quality review.",
          accountableRole: "Assigned Specialist",
          accountablePerson: ownerDisplayName,
          buttonLabel: "Submit for QA Review",
          buttonVariant: "primary",
          targetTab: "prep_review",
          isActionDisabled: false,
        };
      }

      case "REVIEW":
        return {
          headline: "Application awaiting quality review",
          description: "Authoritative 9-criterion operational QA checklist must be audited and verified with a Pass decision.",
          accountableRole: "QA Reviewer",
          accountablePerson: "Assigned Quality Specialist",
          buttonLabel: "Review Application",
          buttonVariant: "primary",
          targetTab: "prep_review",
          isActionDisabled: false,
        };

      case "AWAITING_APPROVAL":
        return {
          headline: "Waiting for candidate approval",
          description: "Application passed QA checks and is staged. The candidate must review and sign off in their candidate portal before submission unlocks.",
          accountableRole: "Candidate",
          accountablePerson: "Candidate (Client Portal)",
          buttonLabel: "Sign-off Pending in Portal",
          buttonVariant: "neutral",
          targetTab: "overview",
          isActionDisabled: true,
          disabledReason: "Awaiting candidate signature in candidate portal",
        };

      case "READY":
        return {
          headline: "Ready to submit",
          description: "Internal QA verification and candidate authorization are complete. Open the employer application, complete submission on their portal, then record confirmation evidence.",
          accountableRole: "Assigned Specialist",
          accountablePerson: ownerDisplayName,
          buttonLabel: "Open Employer Application & Submit",
          buttonVariant: "primary",
          targetTab: "submission",
          isActionDisabled: false,
          externalLink: prerequisites.safeJobUrl.isSafe ? (prerequisites.safeJobUrl.sanitizedUrl || externalJobUrl) : null,
        };

      case "SUBMITTED":
        return {
          headline: "Application submitted to employer",
          description: "External employer submission record is active and verified. If a portal rejection, broken link, or requirement issue arises, flag a defect below.",
          accountableRole: "Operations / Specialist",
          accountablePerson: ownerDisplayName,
          buttonLabel: "View Submission Evidence",
          buttonVariant: "neutral",
          targetTab: "submission",
          isActionDisabled: false,
        };

      case "SUBMISSION_ISSUE":
        return {
          headline: "Submission issue reported",
          description: "A submission defect or external portal roadblock was logged. Start incident review to formulate a correction plan.",
          accountableRole: "Incident Manager",
          accountablePerson: ownerDisplayName,
          buttonLabel: "Start Incident Review",
          buttonVariant: "danger",
          targetTab: "submission",
          isActionDisabled: false,
        };

      case "REVIEW_REQUIRED":
        return {
          headline: "Incident review required",
          description: "A correction strategy has been formulated. Review and approve the correction plan before staging resubmission.",
          accountableRole: "Operations Lead",
          accountablePerson: ownerDisplayName,
          buttonLabel: "Approve Correction Plan",
          buttonVariant: "warning",
          targetTab: "submission",
          isActionDisabled: false,
        };

      case "CORRECTION_APPROVED":
        return {
          headline: "Correction approved",
          description: "The resolution strategy has been approved. Stage the application for manual resubmission.",
          accountableRole: "Assigned Specialist",
          accountablePerson: ownerDisplayName,
          buttonLabel: "Stage Resubmission",
          buttonVariant: "primary",
          targetTab: "submission",
          isActionDisabled: false,
        };

      case "RESUBMISSION":
        return {
          headline: "Resubmission staged",
          description: "Perform the manual resubmission on the employer website and record the updated attempt evidence.",
          accountableRole: "Assigned Specialist",
          accountablePerson: ownerDisplayName,
          buttonLabel: "Record Resubmission",
          buttonVariant: "primary",
          targetTab: "submission",
          isActionDisabled: false,
        };

      case "REJECTED":
      case "WITHDRAWN":
      case "FAILED":
        return {
          headline: `Application ${status.toLowerCase()}`,
          description: "This application has reached a terminal state and is no longer being actively processed.",
          accountableRole: "Archived",
          accountablePerson: "No active owner",
          buttonLabel: "Application Closed",
          buttonVariant: "neutral",
          targetTab: "overview",
          isActionDisabled: true,
        };

      default:
        return {
          headline: "Review application status",
          description: "Verify current lifecycle requirements and proceed with required steps.",
          accountableRole: "Assigned Specialist",
          accountablePerson: ownerDisplayName,
          buttonLabel: "View Application Details",
          buttonVariant: "primary",
          targetTab: "overview",
          isActionDisabled: false,
        };
    }
  }

  const action = resolveActionConfig();

  // 2. Identify Blockers and Prioritize
  const blockers: Array<{
    id: string;
    title: string;
    why: string;
    who: string;
    actionLabel: string;
    targetTab: string;
    isCritical: boolean;
  }> = [];

  if (ownerInactive) {
    blockers.push({
      id: "owner_inactive",
      title: "Accountable owner is inactive",
      why: "The currently assigned employee is no longer active in the organization.",
      who: "Team Lead or Manager",
      actionLabel: "Reassign Application",
      targetTab: "overview",
      isCritical: true,
    });
  }

  if (externalJobUrl && !prerequisites.safeJobUrl.isSafe) {
    blockers.push({
      id: "unsafe_url",
      title: "Employer destination blocked by security check",
      why: prerequisites.safeJobUrl.error || "The external URL failed SSRF safety checks.",
      who: "Operations / Administrator",
      actionLabel: "Verify Job URL",
      targetTab: "overview",
      isCritical: true,
    });
  }

  // Add any explicitly failing prerequisite gates
  for (const gate of prerequisites.gates) {
    if (gate.status === "BLOCKED") {
      blockers.push({
        id: gate.id,
        title: gate.label,
        why: gate.detail,
        who: gate.id === "candidate_consent" ? "Candidate / Specialist" : "Assigned Specialist",
        actionLabel: gate.id === "materials_prepared" ? "Attach Materials" : "Resolve Blocker",
        targetTab: gate.id === "materials_prepared" ? "prep_review" : "overview",
        isCritical: true,
      });
    }
  }

  const primaryBlocker = blockers[0] ?? null;
  const secondaryBlockers = blockers.slice(1);

  // 3. Resolve Linear 4-Stage Progress
  function getStageState(stageId: string) {
    // Stage 1: Preparation (DISCOVERED, QUALIFIED, PREPARING)
    // Stage 2: Quality Review (REVIEW)
    // Stage 3: Approval (AWAITING_APPROVAL)
    // Stage 4: Ready for Submission (READY, SUBMITTED, etc.)
    switch (stageId) {
      case "PREPARATION":
        if (["DISCOVERED", "QUALIFIED", "PREPARING"].includes(status)) {
          return "CURRENT";
        }
        return "COMPLETED";

      case "QUALITY_REVIEW":
        if (["DISCOVERED", "QUALIFIED", "PREPARING"].includes(status)) {
          return "UPCOMING";
        }
        if (status === "REVIEW") {
          return "CURRENT";
        }
        return "COMPLETED";

      case "APPROVAL":
        if (["DISCOVERED", "QUALIFIED", "PREPARING", "REVIEW"].includes(status)) {
          return "UPCOMING";
        }
        if (status === "AWAITING_APPROVAL") {
          return "CURRENT";
        }
        return "COMPLETED";

      case "READY":
        if (["DISCOVERED", "QUALIFIED", "PREPARING", "REVIEW", "AWAITING_APPROVAL"].includes(status)) {
          return "UPCOMING";
        }
        return "COMPLETED";

      default:
        return "UPCOMING";
    }
  }

  function handlePrimaryButtonClick() {
    if (action.isActionDisabled) return;
    if (action.externalLink) {
      window.open(action.externalLink, "_blank", "noopener,noreferrer");
    }
    handleNavigateTab(action.targetTab);
  }

  return (
    <section aria-label="Next Action & Lifecycle Progress" className="space-y-4">
      {/* A. Dominant Next-Action Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-7 shadow-sm border border-slate-800 relative overflow-hidden">
        {/* Subtle background glow */}
        <div
          className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 space-y-4">
          {/* Top metadata strip: Next Action indicator + Accountable Owner */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
              <span className="font-bold uppercase tracking-wider text-slate-300 text-[11px]">
                Immediate Required Action
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <span>Accountable:</span>
              <span className="font-semibold text-slate-200 bg-slate-800/80 px-2.5 py-0.5 rounded-md border border-slate-700/80">
                {action.accountableRole} ({action.accountablePerson})
              </span>
              {waitingSinceFormatted && (
                <span className="text-slate-400 text-[11px] hidden sm:inline">
                  • Since {waitingSinceFormatted} ({waitingAgeLabel})
                </span>
              )}
            </div>
          </div>

          {/* Action Headline & Description */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pt-1">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {action.headline}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                {action.description}
              </p>
            </div>

            {/* Dominant Primary Action Button */}
            <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={handlePrimaryButtonClick}
                disabled={action.isActionDisabled}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition shadow-sm inline-flex items-center justify-center gap-2 ${
                  action.isActionDisabled
                    ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                    : action.buttonVariant === "danger"
                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                    : action.buttonVariant === "warning"
                    ? "bg-amber-600 hover:bg-amber-500 text-white"
                    : action.buttonVariant === "neutral"
                    ? "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                <span>{action.buttonLabel}</span>
                {!action.isActionDisabled && <span aria-hidden="true">→</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* B. Actionable Blockers Area (Consolidated, Prioritized) */}
      {primaryBlocker && (
        <div
          role="alert"
          aria-live="polite"
          className="bg-amber-50 rounded-2xl border border-amber-200/90 p-4 sm:p-5 shadow-2xs space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-amber-700 text-lg font-bold shrink-0 mt-0.5" aria-hidden="true">
                ⚠️
              </span>
              <div>
                <h3 className="font-bold text-amber-950 text-sm">
                  Blocker: {primaryBlocker.title}
                </h3>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  {primaryBlocker.why}{" "}
                  <span className="font-semibold">Action required by: {primaryBlocker.who}.</span>
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 pl-7 sm:pl-0">
              <button
                type="button"
                onClick={() => handleNavigateTab(primaryBlocker.targetTab)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition shadow-2xs"
              >
                {primaryBlocker.actionLabel} →
              </button>
              {secondaryBlockers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllBlockers(!showAllBlockers)}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 font-semibold text-xs hover:bg-amber-100/60 transition"
                >
                  {showAllBlockers ? "Hide others" : `+${secondaryBlockers.length} more`}
                </button>
              )}
            </div>
          </div>

          {/* Secondary Blockers List (if toggled) */}
          {showAllBlockers && secondaryBlockers.length > 0 && (
            <div className="border-t border-amber-200/70 pt-3 space-y-2 pl-7">
              {secondaryBlockers.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-xs text-amber-900">
                  <span>
                    <strong>{b.title}:</strong> {b.why} (Owner: {b.who})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleNavigateTab(b.targetTab)}
                    className="font-semibold text-amber-800 hover:underline shrink-0"
                  >
                    {b.actionLabel} →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* C. Simplified Linear Progress Line (4 Stages + External Submission Status) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Linear 4-Stage Stepper */}
          <div className="flex-1">
            <div className="flex items-center justify-between relative">
              {/* Horizontal Connecting Line */}
              <div
                className="absolute top-3.5 left-4 right-4 h-0.5 bg-slate-200 -translate-y-1/2 z-0"
                aria-hidden="true"
              />

              {LINEAR_STAGES.map((s) => {
                const stageState = getStageState(s.id);
                const isCompleted = stageState === "COMPLETED";
                const isCurrent = stageState === "CURRENT";

                return (
                  <div
                    key={s.id}
                    className="flex flex-col items-center gap-1.5 relative z-10 text-center"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                        isCompleted
                          ? "bg-slate-900 text-white"
                          : isCurrent
                          ? "bg-blue-600 text-white ring-4 ring-blue-100 font-extrabold shadow-xs"
                          : "bg-white text-slate-400 border border-slate-300"
                      }`}
                    >
                      {isCompleted ? "✓" : s.stepNumber}
                    </div>
                    <span
                      className={`text-xs whitespace-nowrap ${
                        isCurrent
                          ? "text-blue-700 font-bold"
                          : isCompleted
                          ? "text-slate-800 font-semibold"
                          : "text-slate-400 font-normal"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* External Submission Status Pill */}
          <div className="shrink-0 pt-3 md:pt-0 md:pl-6 md:border-l md:border-slate-100 flex items-center justify-between md:justify-end gap-2 text-xs">
            <span className="text-slate-500 font-medium text-[11px] uppercase tracking-wider">
              External Status:
            </span>
            <span
              className={`px-3 py-1 rounded-full font-bold text-xs border ${workflow.external.badgeClass}`}
            >
              {workflow.external.label}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
