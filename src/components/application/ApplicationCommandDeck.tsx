"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { DualTrackWorkflowStatus } from "@/lib/application/workflow-status";
import type { ApplicationPrerequisitesEvaluation } from "@/lib/application/prerequisites";
import { INTERNAL_STAGE_STEPS } from "@/lib/application/workflow-status";

interface ApplicationCommandDeckProps {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  createdAt: string;
  ownerDisplayName: string;
  ownerInactive: boolean;
  continuityOutsideScope: boolean;
  isRemote: boolean;
  location?: string | null;
  salaryText: string;
  authMode: string;
  employmentType: string;
  externalJobUrl?: string | null;
  candidateStatusLabel: string;
  candidateStatusSubtext?: string | null;
  waitingForLabel: string;
  waitingAgeLabel: string;
  waitingSinceFormatted?: string | null;
  nextActionGuidance: string;
  workflow: DualTrackWorkflowStatus;
  prerequisites: ApplicationPrerequisitesEvaluation;
}

export function ApplicationCommandDeck({
  applicationId,
  candidateId,
  candidateName,
  jobTitle,
  companyName,
  createdAt,
  ownerDisplayName,
  ownerInactive,
  continuityOutsideScope,
  isRemote,
  location,
  salaryText,
  authMode,
  employmentType,
  externalJobUrl,
  candidateStatusLabel,
  candidateStatusSubtext,
  waitingForLabel,
  waitingAgeLabel,
  waitingSinceFormatted,
  nextActionGuidance,
  workflow,
  prerequisites,
}: ApplicationCommandDeckProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  function handleNavigateTab(tabId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handlePrimaryActionClick() {
    if (workflow.primaryAction.disabled) return;
    handleNavigateTab(workflow.primaryAction.targetTab);
  }

  const isSafeJobUrl = prerequisites.safeJobUrl.isSafe && Boolean(prerequisites.safeJobUrl.sanitizedUrl);

  return (
    <div className="space-y-4">
      {/* 1. Identity & Context Header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
        {/* Breadcrumb Strip */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Link
            href="/employee/applications"
            className="hover:text-slate-800 transition hover:underline"
          >
            Applications Console
          </Link>
          <span className="text-slate-300">/</span>
          <Link
            href={`/employee/candidates/${candidateId}`}
            className="hover:text-slate-800 transition hover:underline font-semibold text-slate-700"
          >
            {candidateName}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-bold truncate max-w-xs">{jobTitle}</span>
        </div>

        {/* Title, Twin-Track Status Badges, and External Link */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
                {jobTitle}
              </h1>
              {/* Internal Stage Badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                <span>Internal: {workflow.internal.label}</span>
              </span>
              {/* External Submission Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${workflow.external.badgeClass}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>External: {workflow.external.label}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-800">{companyName}</span>
              <span>•</span>
              <span>Created {createdAt}</span>
              <span>•</span>
              <span>Accountable: <strong className="text-slate-800 font-semibold">{workflow.accountableActorLabel}</strong></span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {externalJobUrl && isSafeJobUrl ? (
              <a
                href={prerequisites.safeJobUrl.sanitizedUrl || externalJobUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open official job posting at ${prerequisites.safeJobUrl.hostname || "employer website"}`}
                className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition inline-flex items-center gap-1.5 shadow-2xs group"
              >
                <span>Job Posting</span>
                <span className="text-slate-400 group-hover:text-slate-700 transition">↗</span>
              </a>
            ) : externalJobUrl ? (
              <span
                title={prerequisites.safeJobUrl.error || "Unsafe employer URL blocked"}
                className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 cursor-not-allowed"
              >
                <span>⚠️ Unsafe URL Blocked</span>
              </span>
            ) : null}

            {/* Context Primary Action Button */}
            <button
              onClick={handlePrimaryActionClick}
              disabled={workflow.primaryAction.disabled}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-1.5 ${
                workflow.primaryAction.disabled
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : workflow.primaryAction.variant === "warning"
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : workflow.primaryAction.variant === "danger"
                      ? "bg-rose-600 hover:bg-rose-700 text-white"
                      : workflow.primaryAction.variant === "secondary"
                        ? "bg-slate-900 hover:bg-slate-800 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              <span>{workflow.primaryAction.label}</span>
              {!workflow.primaryAction.disabled && <span>→</span>}
            </button>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Candidate
            </span>
            <Link
              href={`/employee/candidates/${candidateId}`}
              className="font-bold text-slate-900 hover:underline truncate block"
            >
              {candidateName}
            </Link>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Specialist Owner
            </span>
            <span className={`font-semibold block truncate ${ownerInactive ? "text-amber-700 font-bold" : "text-slate-800"}`}>
              {ownerInactive
                ? `Inactive (${ownerDisplayName})`
                : continuityOutsideScope
                  ? `${ownerDisplayName} (Scope)`
                  : ownerDisplayName}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Location
            </span>
            <span className="font-medium text-slate-800 block truncate">
              {isRemote ? "🌐 Remote" : location || "On-site"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Compensation
            </span>
            <span
              className={`font-semibold block truncate ${
                salaryText === "Salary not disclosed" ? "text-slate-500 font-normal" : "text-emerald-700 font-bold"
              }`}
            >
              {salaryText}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Auth Mode
            </span>
            <span
              className={`font-bold block truncate ${
                authMode === "MANAGED" ? "text-indigo-700" : "text-amber-700"
              }`}
            >
              {authMode === "MANAGED" ? "Managed Submission" : "Review Required"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Employment
            </span>
            <span className="font-medium text-slate-800 block truncate">
              {employmentType.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Dual-Track Progression & Stepper Deck */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        {/* Track Headers */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Dual-Track Workflow Progression
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              Internal Track:{" "}
              <strong className="text-slate-900">
                {workflow.internal.isCompleted ? "5 of 5 Complete" : `Step ${workflow.internal.stepNumber} of 5`}
              </strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">
              External Track: <strong className="text-slate-900">{workflow.external.label}</strong>
            </span>
          </div>
        </div>

        {/* Linear Stepper for Internal Processing */}
        <div className="relative pt-2 pb-1">
          {/* Background Connector Bar */}
          <div className="absolute top-5 left-6 right-6 h-0.5 bg-slate-200 -translate-y-1/2 z-0 hidden sm:block" />

          {/* Stepper Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 relative z-10">
            {INTERNAL_STAGE_STEPS.map((step) => {
              const isPassed =
                workflow.internal.isCompleted ||
                step.stepNumber < workflow.internal.stepNumber;
              const isCurrent =
                !workflow.internal.isCompleted &&
                step.stepNumber === workflow.internal.stepNumber;

              return (
                <div
                  key={step.stage}
                  className={`flex sm:flex-col items-center sm:text-center gap-3 sm:gap-2 p-2.5 sm:p-2 rounded-xl border sm:border-0 transition-colors ${
                    isCurrent
                      ? "bg-blue-50/70 border-blue-200 sm:bg-transparent"
                      : "border-slate-100 sm:bg-transparent"
                  }`}
                >
                  {/* Step Badge */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                      isPassed
                        ? "bg-blue-600 text-white"
                        : isCurrent
                          ? "bg-blue-600 text-white ring-4 ring-blue-100 shadow-2xs font-extrabold"
                          : "bg-white text-slate-400 border border-slate-300"
                    }`}
                  >
                    {isPassed ? "✓" : step.stepNumber}
                  </div>

                  {/* Step Title & Subtext */}
                  <div>
                    <div
                      className={`text-xs tracking-tight ${
                        isCurrent
                          ? "text-blue-700 font-bold"
                          : isPassed
                            ? "text-slate-800 font-semibold"
                            : "text-slate-400 font-normal"
                      }`}
                    >
                      {step.label}
                    </div>
                    <div className="text-[10px] text-slate-400 hidden lg:block mt-0.5">
                      {step.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* External Track Status Banner */}
        <div
          className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            workflow.external.state === "READY_FOR_SUBMISSION"
              ? "bg-sky-50 border-sky-300 text-sky-950 font-medium"
              : workflow.external.state === "SUBMITTED"
                ? "bg-emerald-50 border-emerald-300 text-emerald-950 font-medium"
                : workflow.external.state === "NEEDS_VERIFICATION"
                  ? "bg-rose-50 border-rose-300 text-rose-950 font-medium"
                  : workflow.external.state === "SUBMISSION_IN_PROGRESS"
                    ? "bg-purple-50 border-purple-300 text-purple-950 font-medium"
                    : "bg-slate-50 border-slate-200 text-slate-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] shrink-0 ${
                workflow.external.state === "READY_FOR_SUBMISSION"
                  ? "bg-sky-600 text-white"
                  : workflow.external.state === "SUBMITTED"
                    ? "bg-emerald-600 text-white"
                    : workflow.external.state === "NEEDS_VERIFICATION"
                      ? "bg-rose-600 text-white"
                      : workflow.external.state === "SUBMISSION_IN_PROGRESS"
                        ? "bg-purple-600 text-white"
                        : "bg-slate-600 text-white"
              }`}
            >
              External Track: {workflow.external.label}
            </span>
            <span className="text-xs font-normal">
              {workflow.external.description}
            </span>
          </div>

          {workflow.external.state === "READY_FOR_SUBMISSION" && (
            <button
              onClick={() => handleNavigateTab("submission")}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs transition"
            >
              Open Submission Desk →
            </button>
          )}
        </div>
      </div>

      {/* 3. Consolidated Action-Required & Prerequisite Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Waiting Attribution */}
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">
              Waiting For
            </span>
            <div className="font-bold text-slate-900 text-sm">
              {waitingForLabel}
            </div>
            <div className="text-slate-500 text-[11px]">
              <span className="font-medium text-slate-600">Waiting Since:</span>{" "}
              {waitingSinceFormatted ? `${waitingSinceFormatted} · ` : ""}
              {waitingAgeLabel}
            </div>
          </div>

          {/* Next Milestone Guidance */}
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">
              Next Operational Milestone
            </span>
            <div className="font-semibold text-slate-800 text-xs leading-relaxed">
              {nextActionGuidance}
            </div>
          </div>

          {/* Candidate Portal Projection */}
          <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Candidate Perspective
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400">
                Live View
              </span>
            </div>
            <div className="font-bold text-white text-sm">
              {candidateStatusLabel}
            </div>
            {candidateStatusSubtext && (
              <div className="text-amber-400 text-[11px] font-medium">
                {candidateStatusSubtext}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Authoritative Prerequisite Gate Chips */}
        <div className="border-t border-slate-100 pt-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
              Authoritative Readiness Prerequisites ({prerequisites.metCount} of {prerequisites.totalCount} Passed)
            </span>
            {prerequisites.allMet ? (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 inline-flex items-center gap-1">
                <span>✓</span> All Prerequisites Authoritatively Satisfied
              </span>
            ) : (
              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 inline-flex items-center gap-1">
                <span>⏳</span> Prerequisites In Progress
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
            {prerequisites.gates.map((gate) => {
              const isMet = gate.passed;
              const isPending = gate.status === "PENDING";
              const isBlocked = gate.status === "BLOCKED";

              return (
                <div
                  key={gate.id}
                  onMouseEnter={() => setActiveTooltip(gate.id)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className={`p-2 rounded-lg border font-medium flex items-center justify-between gap-1.5 transition-all cursor-help relative ${
                    isMet
                      ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                      : isPending
                        ? "bg-slate-50 border-slate-200 text-slate-700"
                        : "bg-rose-50 border-rose-200 text-rose-950"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className={`font-bold ${
                        isMet
                          ? "text-emerald-600"
                          : isPending
                            ? "text-slate-400"
                            : "text-rose-600"
                      }`}
                    >
                      {isMet ? "✓" : isPending ? "○" : "✕"}
                    </span>
                    <span className="truncate">{gate.label}</span>
                  </div>

                  {/* Popover Detail on Hover */}
                  {activeTooltip === gate.id && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 p-2 rounded-lg bg-slate-900 text-white text-[10px] shadow-lg z-50 pointer-events-none leading-tight font-normal">
                      <div className="font-bold text-white mb-0.5">{gate.label}</div>
                      <div>{gate.detail}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
