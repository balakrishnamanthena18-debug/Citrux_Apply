"use client";

import React, { useId } from "react";
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
  /** Full label for desktop / a11y */
  label: string;
  /** Condensed label for mobile chips */
  shortLabel: string;
  description: string;
  count: number;
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

/** Human-readable list heading for the selected pipeline stage. */
export function getPipelineListTitle(stage: PipelineStageKey): string {
  switch (stage) {
    case "ALL":
      return "Active & Recent Applications";
    case "PREPARING":
      return "Preparing Applications";
    case "UNDER_REVIEW":
      return "Under Review";
    case "AWAITING_APPROVAL":
      return "Awaiting Your Review";
    case "READY":
      return "Ready Applications";
    case "SUBMITTED":
      return "Submitted Applications";
    case "EMPLOYER_RESPONSE":
      return "Closed / History";
    default:
      return "Applications";
  }
}

export function getPipelineListSubtitle(stage: PipelineStageKey): string {
  switch (stage) {
    case "ALL":
      return "Continuous operational list with transparent stage statuses and direct candidate actions";
    case "PREPARING":
      return "Applications currently in qualification and material preparation";
    case "UNDER_REVIEW":
      return "Applications in internal quality review before candidate approval";
    case "AWAITING_APPROVAL":
      return "Applications that need your sign-off before submission";
    case "READY":
      return "Approved packages staged for employer portal intake";
    case "SUBMITTED":
      return "Confirmed employer submissions with recorded receipts";
    case "EMPLOYER_RESPONSE":
      return "Archived outcomes and closed application history";
    default:
      return "Applications filtered by pipeline stage";
  }
}

function buildStages(counts: Props["counts"]): PipelineStageConfig[] {
  return [
    {
      key: "ALL",
      label: "All",
      shortLabel: "All",
      description: "All applications across the pipeline",
      count: counts.total,
      matchingStatuses: [],
    },
    {
      key: "PREPARING",
      label: "Preparing",
      shortLabel: "Preparing",
      description: "Qualification and material drafting",
      count: counts.preparing,
      matchingStatuses: ["DISCOVERED", "QUALIFIED", "PREPARING"],
    },
    {
      key: "UNDER_REVIEW",
      label: "Under Review",
      shortLabel: "Review",
      description: "Internal operational quality assurance",
      count: counts.underReview,
      matchingStatuses: ["REVIEW", "REVIEW_REQUIRED", "CORRECTION_APPROVED"],
    },
    {
      key: "AWAITING_APPROVAL",
      label: "Awaiting You",
      shortLabel: "Awaiting",
      description: "Direct sign-off and material authorization",
      count: counts.awaitingApproval,
      matchingStatuses: ["AWAITING_APPROVAL"],
    },
    {
      key: "READY",
      label: "Ready",
      shortLabel: "Ready",
      description: "Approved and staged for portal intake",
      count: counts.ready,
      matchingStatuses: ["READY"],
    },
    {
      key: "SUBMITTED",
      label: "Submitted",
      shortLabel: "Submitted",
      description: "Confirmed employer submissions",
      count: counts.submitted,
      matchingStatuses: ["SUBMITTED", "RESUBMISSION"],
    },
    {
      key: "EMPLOYER_RESPONSE",
      label: "Closed",
      shortLabel: "Closed",
      description: "Outcome recorded or role archived",
      count: counts.employerResponse,
      matchingStatuses: ["REJECTED", "WITHDRAWN", "FAILED"],
    },
  ];
}

export function CandidatePipeline({
  activeStage,
  onSelectStage,
  counts,
}: Props) {
  const stages = buildStages(counts);
  const headingId = useId();
  const activeCount =
    stages.find((s) => s.key === activeStage)?.count ?? counts.total;

  return (
    <section
      className="overflow-hidden rounded-[18px] border border-[#DDE5E1] bg-white shadow-[0_2px_12px_rgba(15,32,26,0.04)]"
      aria-labelledby={headingId}
    >
      {/* Section header */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#EDF1EF] bg-[#F7F9F8] px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B3B2C]"
          >
            Application Pipeline
          </h2>
          <p className="mt-0.5 text-xs text-[#66756E]">
            Track every application from preparation to outcome
          </p>
        </div>
        <p className="shrink-0 text-xs font-semibold tabular-nums text-[#10201A]">
          <span className="text-[#12A150]">{counts.total}</span>
          <span className="ml-1.5 font-medium text-[#66756E]">
            {counts.total === 1 ? "application" : "applications"}
          </span>
        </p>
      </div>

      {/* Desktop: horizontal progression rail */}
      <div className="hidden md:block px-4 py-4 sm:px-5">
        <div
          className="relative flex items-stretch justify-between gap-0"
          role="tablist"
          aria-label="Application pipeline stages"
        >
          {/* Progression connector */}
          <div
            className="pointer-events-none absolute left-[6%] right-[6%] top-[22px] h-px bg-[#DDE5E1]"
            aria-hidden
          />

          {stages.map((stage) => {
            const isSelected = activeStage === stage.key;
            const needsAttention =
              stage.key === "AWAITING_APPROVAL" && stage.count > 0 && !isSelected;
            const ariaLabel = [
              stage.label,
              `${stage.count} ${stage.count === 1 ? "application" : "applications"}`,
              isSelected ? "selected" : null,
              needsAttention ? "action required" : null,
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <button
                key={stage.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={ariaLabel}
                onClick={() => onSelectStage(stage.key)}
                className={`group relative z-10 flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl px-1 py-1.5 text-center transition-[color,background-color,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150] focus-visible:ring-offset-2 ${
                  isSelected
                    ? "bg-[#12A150]/[0.08]"
                    : "hover:bg-[#F7F9F8]"
                }`}
              >
                <span
                  className={`relative flex h-[14px] w-[14px] items-center justify-center rounded-full border-2 transition-colors duration-150 ${
                    isSelected
                      ? "border-[#12A150] bg-[#12A150]"
                      : needsAttention
                        ? "border-amber-500 bg-amber-500"
                        : "border-[#DDE5E1] bg-white group-hover:border-[#12A150]/60"
                  }`}
                  aria-hidden
                >
                  {isSelected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#C6F432]" />
                  )}
                </span>

                <span className="flex min-w-0 flex-col items-center gap-0.5">
                  <span
                    className={`max-w-full truncate text-[11px] font-semibold tracking-tight ${
                      isSelected
                        ? "text-[#12A150]"
                        : "text-[#66756E] group-hover:text-[#10201A]"
                    }`}
                  >
                    {stage.label}
                  </span>
                  <span
                    className={`text-xl font-bold tabular-nums leading-none tracking-tight ${
                      isSelected
                        ? "text-[#0B3B2C]"
                        : needsAttention
                          ? "text-amber-800"
                          : "text-[#10201A]"
                    }`}
                  >
                    {stage.count}
                  </span>
                </span>

                <span
                  className={`h-0.5 w-8 rounded-full transition-opacity duration-150 ${
                    isSelected ? "bg-[#12A150] opacity-100" : "opacity-0"
                  }`}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: compact horizontal scroll chips */}
      <div className="md:hidden">
        <div
          className="flex gap-2 overflow-x-auto px-3 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Application pipeline stages"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {stages.map((stage) => {
            const isSelected = activeStage === stage.key;
            const needsAttention =
              stage.key === "AWAITING_APPROVAL" && stage.count > 0 && !isSelected;
            const ariaLabel = [
              stage.label,
              `${stage.count} ${stage.count === 1 ? "application" : "applications"}`,
              isSelected ? "selected" : null,
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <button
                key={stage.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={ariaLabel}
                onClick={() => onSelectStage(stage.key)}
                className={`inline-flex shrink-0 items-baseline gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-[color,background-color,border-color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150] ${
                  isSelected
                    ? "border-[#12A150]/35 bg-[#12A150]/[0.1] text-[#0B3B2C]"
                    : "border-[#DDE5E1] bg-white text-[#10201A] hover:border-[#12A150]/25"
                }`}
              >
                <span
                  className={`text-[11px] font-semibold ${
                    isSelected ? "text-[#12A150]" : "text-[#66756E]"
                  }`}
                >
                  {stage.shortLabel}
                </span>
                <span
                  className={`text-base font-bold tabular-nums leading-none ${
                    isSelected
                      ? "text-[#0B3B2C]"
                      : needsAttention
                        ? "text-amber-800"
                        : "text-[#10201A]"
                  }`}
                >
                  {stage.count}
                </span>
                {needsAttention && (
                  <span
                    className="ml-0.5 h-1.5 w-1.5 self-center rounded-full bg-amber-500"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Continuity strip — selected stage summary for list relationship */}
      <div className="flex items-center justify-between gap-3 border-t border-[#EDF1EF] bg-white px-4 py-2.5 sm:px-5">
        <p className="min-w-0 truncate text-xs text-[#66756E]">
          <span className="font-semibold text-[#10201A]">
            {getPipelineListTitle(activeStage)}
          </span>
          <span className="mx-1.5 text-[#DDE5E1]" aria-hidden>
            ·
          </span>
          <span className="tabular-nums">{activeCount}</span>
        </p>
        {activeStage !== "ALL" && (
          <button
            type="button"
            onClick={() => onSelectStage("ALL")}
            className="shrink-0 text-[11px] font-semibold text-[#12A150] hover:text-[#0E8541] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150] rounded"
          >
            Show all
          </button>
        )}
      </div>
    </section>
  );
}
