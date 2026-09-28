"use client";

import React from "react";
import type { ApplicationStatus } from "@/generated/prisma";

export interface LifecycleStage {
  key: string;
  label: string;
  shortLabel?: string;
  description?: string;
}

export const APPLICATION_LIFECYCLE_STAGES: LifecycleStage[] = [
  { key: "DISCOVERED", label: "Discovered", shortLabel: "Intake", description: "Opportunity identified" },
  { key: "QUALIFIED", label: "Qualified", shortLabel: "Qualified", description: "Profile matched" },
  { key: "PREPARING", label: "Preparing", shortLabel: "Tailoring", description: "Materials assembled" },
  { key: "REVIEW", label: "QA Review", shortLabel: "QA", description: "Quality sign-off" },
  { key: "AWAITING_APPROVAL", label: "Candidate Sign-off", shortLabel: "Approval", description: "Candidate consent" },
  { key: "READY", label: "Ready to Apply", shortLabel: "Ready", description: "Staged for submission" },
  { key: "SUBMITTED", label: "Submitted", shortLabel: "Submitted", description: "Portal confirmed" },
];

interface Props {
  currentStatus: ApplicationStatus | string;
  stages?: LifecycleStage[];
  className?: string;
}

export function ApplicationLifecycleBar({
  currentStatus,
  stages = APPLICATION_LIFECYCLE_STAGES,
  className = "",
}: Props) {
  const isTerminal = ["REJECTED", "WITHDRAWN", "FAILED"].includes(currentStatus);
  const isIssue = ["SUBMISSION_ISSUE", "REVIEW_REQUIRED", "CORRECTION_APPROVED", "RESUBMISSION"].includes(currentStatus);

  let activeIndex = stages.findIndex((s) => s.key === currentStatus);
  if (activeIndex === -1) {
    if (currentStatus === "REVIEW_REQUIRED" || currentStatus === "CORRECTION_APPROVED") activeIndex = 3;
    else if (currentStatus === "RESUBMISSION" || currentStatus === "SUBMISSION_ISSUE") activeIndex = 5;
    else activeIndex = 0;
  }

  // Calculate percentage for progress line
  const progressPercentage = Math.max(0, Math.min(100, (activeIndex / (stages.length - 1)) * 100));

  return (
    <div className={`bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs transition-all ${className}`}>
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${isIssue ? "bg-rose-600" : isTerminal ? "bg-slate-400" : "bg-blue-600"}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Operational Lifecycle Pipeline
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-bold text-slate-900">
            {isIssue
              ? `Operational Review (${currentStatus.replace(/_/g, " ")})`
              : isTerminal
              ? `Closed (${currentStatus})`
              : stages[activeIndex]?.label || currentStatus}
          </span>
        </div>

        {isIssue && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            ⚠️ Triage / Correction Active
          </span>
        )}

        {isTerminal && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Terminal State
          </span>
        )}
      </div>

      {/* Connected Clean Linear Pathway */}
      <div className="relative px-2 py-3">
        {/* Background Track Line */}
        <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 h-0.5 bg-slate-200 z-0" />

        {/* Active Filled Progress Line */}
        <div
          className={`absolute top-1/2 left-4 -translate-y-1/2 h-0.5 z-0 transition-all duration-300 ${
            isIssue ? "bg-rose-500" : "bg-blue-600"
          }`}
          style={{ width: `calc(${progressPercentage}% * 0.94)` }}
        />

        {/* Stage Nodes */}
        <div className="relative z-10 flex items-center justify-between">
          {stages.map((stage, idx) => {
            const isPassed = idx < activeIndex;
            const isCurrent = idx === activeIndex && !isTerminal;

            return (
              <div key={stage.key} className="flex flex-col items-center group">
                {/* Circle Node */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    isCurrent
                      ? isIssue
                        ? "bg-rose-600 text-white ring-4 ring-rose-100 shadow-2xs"
                        : "bg-blue-600 text-white ring-4 ring-blue-100 shadow-2xs"
                      : isPassed
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-400 border border-slate-300"
                  }`}
                >
                  {isPassed ? (
                    <span className="text-[10px]">✓</span>
                  ) : isCurrent ? (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  ) : (
                    <span className="text-[10px] font-mono">{idx + 1}</span>
                  )}
                </div>

                {/* Stage Label */}
                <div className="mt-2 text-center">
                  <div
                    className={`text-xs tracking-tight transition-colors ${
                      isCurrent
                        ? isIssue
                          ? "text-rose-700 font-bold"
                          : "text-blue-600 font-bold"
                        : isPassed
                        ? "text-slate-800 font-medium"
                        : "text-slate-400 font-normal"
                    }`}
                  >
                    {stage.shortLabel || stage.label}
                  </div>
                  <div className="text-[10px] text-slate-400 hidden md:block mt-0.5">
                    {stage.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
