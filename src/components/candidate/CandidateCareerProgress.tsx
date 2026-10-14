"use client";

import React, { useState } from "react";
import Link from "next/link";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export interface CareerMilestone {
  id: string;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
  status: "COMPLETED" | "CURRENT" | "UPCOMING";
  prerequisiteText?: string;
  actionUrl?: string;
  actionLabel?: string;
}

interface Props {
  milestones: CareerMilestone[];
  currentStageName: string;
  activeApplicationsCount: number;
  submittedApplicationsCount: number;
  interviewsCount: number;
}

export function CandidateCareerProgress({
  milestones,
  currentStageName,
  activeApplicationsCount,
  submittedApplicationsCount,
  interviewsCount,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const completedCount = milestones.filter((m) => m.status === "COMPLETED").length;
  const currentMilestone =
    milestones.find((m) => m.status === "CURRENT") ||
    milestones[milestones.length - 1];

  return (
    <section
      aria-label="Career Progress & Milestones"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Career Service Progress
                </span>
                <HelpTooltip topic="career_milestones" label="Career milestones help" />
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#12A150]/[0.08] text-[#0B3B2C] border border-[#12A150]/20">
                {completedCount} of {milestones.length} Milestones Complete
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {currentStageName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Truthful overview of your verified pipeline stage, cleared prerequisites, and active operational objectives.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition shadow-2xs inline-flex items-center gap-1.5"
            >
              <span>{isExpanded ? "Hide Details" : "View All Stages"}</span>
              <span className="text-[10px] text-slate-400">
                {isExpanded ? "▲" : "▼"}
              </span>
            </button>
          </div>
        </div>

        {/* Horizontal Milestone Stepper */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {milestones.map((m) => {
            const isCompleted = m.status === "COMPLETED";
            const isCurrent = m.status === "CURRENT";

            return (
              <div
                key={m.id}
                className={`rounded-xl p-3 border transition-all text-xs flex flex-col justify-between ${
                  isCompleted
                    ? "bg-emerald-50/50 border-emerald-200/80 text-emerald-900"
                    : isCurrent
                    ? "bg-slate-900 border-slate-900 text-white shadow-sm ring-2 ring-slate-900/10"
                    : "bg-white border-slate-200/70 text-slate-500"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                      isCompleted
                        ? "bg-emerald-600 text-white"
                        : isCurrent
                        ? "bg-[#C6F432] text-[#0B3B2C]"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {isCompleted ? "✓" : m.number}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      isCompleted
                        ? "text-emerald-700"
                        : isCurrent
                        ? "text-[#C6F432]"
                        : "text-slate-400"
                    }`}
                  >
                    {isCompleted ? "Done" : isCurrent ? "Active" : "Queued"}
                  </span>
                </div>

                <div className="min-w-0">
                  <p
                    className={`font-semibold text-xs leading-snug line-clamp-1 ${
                      isCurrent ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {m.shortTitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Stage & Remaining Prerequisites Banner */}
      <div className="p-5 sm:p-6 bg-white space-y-4">
        {currentMilestone && (
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                  Active Milestone #{currentMilestone.number}
                </span>
                <span className="text-xs font-semibold text-slate-800">
                  {currentMilestone.title}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {currentMilestone.description}
              </p>
              {currentMilestone.prerequisiteText && (
                <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50/80 border border-amber-200/80 px-2.5 py-1 rounded-md mt-2">
                  <span className="font-semibold">Prerequisite:</span>
                  <span>{currentMilestone.prerequisiteText}</span>
                </div>
              )}
            </div>

            {currentMilestone.actionUrl && currentMilestone.actionLabel && (
              <div className="shrink-0">
                <Link
                  href={currentMilestone.actionUrl}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs inline-flex items-center gap-1.5"
                >
                  <span>{currentMilestone.actionLabel}</span>
                  <span>→</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Expanded Detailed Milestone Breakdown */}
        {isExpanded && (
          <div className="pt-2 divide-y divide-slate-100 border-t border-slate-100">
            {milestones.map((m) => (
              <div key={m.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${
                        m.status === "COMPLETED"
                          ? "text-emerald-700"
                          : m.status === "CURRENT"
                          ? "text-blue-700"
                          : "text-slate-400"
                      }`}
                    >
                      Step {m.number}: {m.title}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        m.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-800"
                          : m.status === "CURRENT"
                          ? "bg-blue-50 text-blue-800 font-semibold"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {m.status === "COMPLETED"
                        ? "Completed"
                        : m.status === "CURRENT"
                        ? "In Progress"
                        : "Upcoming"}
                    </span>
                  </div>
                  <p className="text-slate-500">{m.description}</p>
                  {m.prerequisiteText && (
                    <p className="text-slate-400 text-[11px]">
                      Requirements: {m.prerequisiteText}
                    </p>
                  )}
                </div>

                {m.actionUrl && m.actionLabel && m.status !== "COMPLETED" && (
                  <Link
                    href={m.actionUrl}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold shrink-0"
                  >
                    {m.actionLabel} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
