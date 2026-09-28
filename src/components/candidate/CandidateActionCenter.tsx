"use client";

import React from "react";
import Link from "next/link";

export type ActionPriority = "NEEDS_ATTENTION" | "IMPORTANT" | "INFORMATIONAL";

export type ActionType =
  | "APPLICATION_APPROVAL"
  | "APPLICATION_REVISION"
  | "PROFILE_INFORMATION"
  | "DOCUMENT_REQUIRED"
  | "DOCUMENT_EXPIRING"
  | "CONSENT_REQUIRED"
  | "CORRECTION_REVIEW"
  | "WORK_AUTHORIZATION"
  | "VERIFICATION_NOTE"
  | "OTHER_CANDIDATE_ACTION";

export interface CandidateActionItem {
  id: string;
  type: ActionType;
  priority: ActionPriority;
  title: string;
  description: string;
  actionUrl: string;
  actionLabel: string;
  relatedEntity?: {
    type: string;
    name: string;
    id?: string;
  };
  dueDate?: string | null;
  createdAt?: string | Date;
}

interface Props {
  actions: CandidateActionItem[];
  userName?: string;
}

export function CandidateActionCenter({ actions, userName }: Props) {
  // Sort actions: NEEDS_ATTENTION first, then IMPORTANT, then INFORMATIONAL
  const sortedActions = [...actions].sort((a, b) => {
    const pWeight = { NEEDS_ATTENTION: 0, IMPORTANT: 1, INFORMATIONAL: 2 };
    return pWeight[a.priority] - pWeight[b.priority];
  });

  const urgentCount = sortedActions.filter(
    (a) => a.priority === "NEEDS_ATTENTION"
  ).length;

  if (sortedActions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold text-sm">
              ✓
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Action Center · All Caught Up
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                No immediate actions required from you. Your dedicated operations team is actively preparing and monitoring your pipeline.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 border border-slate-200 text-slate-600">
            Pipeline Active
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Action Center Header Bar */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Action Center
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              urgentCount > 0
                ? "bg-amber-100 text-amber-900 border border-amber-300"
                : "bg-blue-50 text-blue-800 border border-blue-200"
            }`}
          >
            {sortedActions.length} item{sortedActions.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          {urgentCount > 0 ? (
            <span className="text-amber-800 font-medium">
              {urgentCount} item{urgentCount > 1 ? "s" : ""} requiring your decision
            </span>
          ) : (
            <span>Optimizing your candidate readiness</span>
          )}
        </div>
      </div>

      {/* Action Items List */}
      <div className="divide-y divide-slate-100">
        {sortedActions.map((item) => {
          const isUrgent = item.priority === "NEEDS_ATTENTION";
          const isImportant = item.priority === "IMPORTANT";

          return (
            <div
              key={item.id}
              className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                isUrgent
                  ? "bg-amber-50/40 hover:bg-amber-50/70"
                  : "hover:bg-slate-50/70"
              }`}
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${
                      isUrgent
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : isImportant
                        ? "bg-blue-50 text-blue-800 border-blue-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {isUrgent ? "Action Required" : isImportant ? "Important" : "Notice"}
                  </span>

                  {item.relatedEntity && (
                    <span className="text-xs font-semibold text-slate-800">
                      {item.relatedEntity.name}
                    </span>
                  )}

                  {item.dueDate && (
                    <span className="text-xs text-slate-400">
                      Due: {item.dueDate}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                  {item.description}
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <Link
                  href={item.actionUrl}
                  className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 shadow-2xs ${
                    isUrgent
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  <span>{item.actionLabel}</span>
                  <span className="text-[13px] leading-none">→</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
