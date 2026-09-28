"use client";

import React from "react";

export interface CandidateHistoryItem {
  id: string;
  action: string;
  description: string;
  timestamp: string | Date;
  entityType: string;
}

interface Props {
  history: CandidateHistoryItem[];
}

export function CareerChangeHistory({ history }: Props) {
  const formatHistoryTimestamp = (d: string | Date) => {
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";

    const dateStr = dateObj.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = dateObj.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateStr} · ${timeStr}`;
  };

  const getActionBadge = (action: string) => {
    if (action.includes("CREATED") || action.includes("ADDED") || action.includes("UPLOADED")) {
      return { label: "Added", class: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    if (action.includes("UPDATED") || action.includes("CHANGED") || action.includes("MODIFIED")) {
      return { label: "Updated", class: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (action.includes("DELETED") || action.includes("REMOVED")) {
      return { label: "Removed", class: "bg-rose-50 text-rose-700 border-rose-200" };
    }
    if (action.includes("VERIFIED")) {
      return { label: "Verified", class: "bg-purple-50 text-purple-700 border-purple-200" };
    }
    return { label: "Activity", class: "bg-slate-100 text-slate-700 border-slate-200" };
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Career Record Change History
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Transparent chronological audit of modifications to your canonical profile facts
          </p>
        </div>
        <span className="text-xs text-slate-400 font-medium">
          Authoritative Log
        </span>
      </div>

      {history.length === 0 ? (
        <div className="p-10 text-center text-slate-400 space-y-1 text-xs">
          <div className="text-2xl">⏱️</div>
          <div className="font-semibold text-slate-700">No profile change events recorded yet</div>
          <p>Any updates to your experiences, skills, credentials, or preferences will record here.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 text-xs">
          {history.map((item) => {
            const badge = getActionBadge(item.action);
            return (
              <div
                key={item.id}
                className="p-4 hover:bg-slate-50/70 transition-colors flex items-start justify-between gap-4"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.class}`}
                    >
                      {badge.label}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {item.description}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-slate-400 text-[11px] whitespace-nowrap text-right">
                  {formatHistoryTimestamp(item.timestamp)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
