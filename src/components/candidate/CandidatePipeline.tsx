"use client";

import React from "react";
import type { ApplicationStatus } from "@/generated/prisma";

export type PipelineStageKey =
  | "ALL"
  | "PREPARING"
  | "UNDER_REVIEW"
  | "AWAITING_APPROVAL"
  | "READY"
  | "SUBMITTED"
  | "EMPLOYER_RESPONSE";

export interface PipelineStageConfig {
  key: PipelineStageKey;
  label: string;
  description: string;
  count: number;
  badgeColor: string;
  matchingStatuses: ApplicationStatus[];
}

interface Props {
  activeStage: PipelineStageKey;
  onSelectStage: (stage: PipelineStageKey) => void;
  counts: {
    total: number;
    preparing: number;
    underReview: number;
    awaitingApproval: number;
    ready: number;
    submitted: number;
    employerResponse: number;
  };
}

export function CandidatePipeline({
  activeStage,
  onSelectStage,
  counts,
}: Props) {
  const stages: PipelineStageConfig[] = [
    {
      key: "ALL",
      label: "All Pipeline",
      description: "Total active & historical applications",
      count: counts.total,
      badgeColor: "bg-slate-100 text-slate-800 border-slate-200",
      matchingStatuses: [],
    },
    {
      key: "PREPARING",
      label: "Preparing",
      description: "Opportunity qualification & material drafting",
      count: counts.preparing,
      badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
      matchingStatuses: ["DISCOVERED", "QUALIFIED", "PREPARING"],
    },
    {
      key: "UNDER_REVIEW",
      label: "Under Review",
      description: "Internal operational quality assurance gate",
      count: counts.underReview,
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
      matchingStatuses: ["REVIEW", "REVIEW_REQUIRED", "CORRECTION_APPROVED"],
    },
    {
      key: "AWAITING_APPROVAL",
      label: "Awaiting You",
      description: "Direct sign-off & material authorization",
      count: counts.awaitingApproval,
      badgeColor: "bg-amber-50 text-amber-800 border-amber-300",
      matchingStatuses: ["AWAITING_APPROVAL"],
    },
    {
      key: "READY",
      label: "Ready",
      description: "Approved & staged for manual portal intake",
      count: counts.ready,
      badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
      matchingStatuses: ["READY"],
    },
    {
      key: "SUBMITTED",
      label: "Submitted",
      description: "Confirmed employer submissions with receipts",
      count: counts.submitted,
      badgeColor: "bg-emerald-50 text-emerald-800 border-emerald-200",
      matchingStatuses: ["SUBMITTED", "RESUBMISSION"],
    },
    {
      key: "EMPLOYER_RESPONSE",
      label: "Closed / History",
      description: "Outcome recorded or role archived",
      count: counts.employerResponse,
      badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
      matchingStatuses: ["REJECTED", "WITHDRAWN", "FAILED"],
    },
  ];

  return (
    <div className="bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden">
      {/* Pipeline Header */}
      <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#0F1720]">
            Application Pipeline
          </span>
          <p className="text-xs text-[#64748B] mt-0.5">
            Real-time tracking across operations stages from qualification to submission
          </p>
        </div>
        <div className="text-xs text-[#94A3B8] font-medium">
          Click any stage to filter
        </div>
      </div>

      {/* Horizontal Interactive Pipeline Rail */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-y sm:divide-y-0 lg:divide-x divide-[#EDF1EF]">
        {stages.map((stage) => {
          const isSelected = activeStage === stage.key;
          const isAwaitingAction = stage.key === "AWAITING_APPROVAL" && stage.count > 0;

          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onSelectStage(stage.key)}
              className={`p-3.5 text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                isSelected
                  ? "bg-[#12A150]/[0.08] text-[#0B3B2C] ring-2 ring-inset ring-[#12A150] z-10"
                  : "hover:bg-[#12A150]/[0.035] text-[#0F1720]"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-semibold truncate">
                  {stage.label}
                </span>
                {isAwaitingAction && !isSelected && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                )}
              </div>

              <div className="flex items-baseline justify-between gap-2 mt-2">
                <span
                  className={`text-xl font-bold tracking-tight ${
                    isSelected
                      ? "text-[#0B3B2C]"
                      : isAwaitingAction
                      ? "text-amber-800"
                      : "text-[#0F1720]"
                  }`}
                >
                  {stage.count}
                </span>

                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    isSelected
                      ? "bg-[#12A150]/20 text-[#0B3B2C] border-[#12A150]/40 font-semibold"
                      : stage.badgeColor
                  }`}
                >
                  {isSelected ? "Active" : stage.count === 0 ? "0" : stage.count}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
