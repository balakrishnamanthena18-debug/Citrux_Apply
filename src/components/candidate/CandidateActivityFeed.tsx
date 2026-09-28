"use client";

import React from "react";
import Link from "next/link";

export interface CandidateActivityEvent {
  id: string;
  type: "SUBMISSION" | "APPROVAL_REQUEST" | "QA_PASS" | "PREPARATION" | "DOCUMENT" | "GENERAL";
  title: string;
  description: string;
  timestamp: string | Date;
  linkUrl?: string;
  linkText?: string;
}

interface Props {
  events: CandidateActivityEvent[];
  title?: string;
  subtitle?: string;
}

export function CandidateActivityFeed({
  events,
  title = "Recent Application & Team Activity",
  subtitle = "Authoritative operational milestones and submission timeline",
}: Props) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 text-center text-slate-500 shadow-2xs space-y-1">
        <div className="text-xl">⏱️</div>
        <h3 className="text-xs font-semibold text-slate-900">
          No activity recorded yet
        </h3>
        <p className="text-xs text-slate-400">
          Activity will record here automatically as your team progresses applications through the pipeline.
        </p>
      </div>
    );
  }

  const getEventIcon = (type: CandidateActivityEvent["type"]) => {
    switch (type) {
      case "SUBMISSION":
        return { icon: "✓", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      case "APPROVAL_REQUEST":
        return { icon: "⚠️", bg: "bg-amber-50 text-amber-700 border-amber-200" };
      case "QA_PASS":
        return { icon: "★", bg: "bg-purple-50 text-purple-700 border-purple-200" };
      case "PREPARATION":
        return { icon: "✎", bg: "bg-blue-50 text-blue-700 border-blue-200" };
      case "DOCUMENT":
        return { icon: "📄", bg: "bg-slate-100 text-slate-700 border-slate-200" };
      default:
        return { icon: "•", bg: "bg-slate-100 text-slate-700 border-slate-200" };
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            {title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-xs text-slate-400 font-medium">
          Verified Events
        </span>
      </div>

      {/* Events List */}
      <div className="divide-y divide-slate-100">
        {events.map((evt) => {
          const { icon, bg } = getEventIcon(evt.type);
          const dateText = new Date(evt.timestamp).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          });
          const timeText = new Date(evt.timestamp).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });

          return (
            <div
              key={evt.id}
              className="p-4 hover:bg-slate-50/75 transition flex items-start justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <span
                  className={`w-6 h-6 rounded-md border flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${bg}`}
                >
                  {icon}
                </span>

                <div className="space-y-0.5 min-w-0">
                  <h4 className="font-semibold text-slate-900 text-xs">
                    {evt.title}
                  </h4>
                  <p className="text-slate-600 leading-relaxed max-w-xl">
                    {evt.description}
                  </p>
                  {evt.linkUrl && (
                    <div className="pt-1">
                      <Link
                        href={evt.linkUrl}
                        className="font-medium text-blue-600 hover:text-blue-800 text-[11px] inline-flex items-center gap-1"
                      >
                        <span>{evt.linkText || "View details"}</span>
                        <span>→</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0 text-slate-400 text-[11px] whitespace-nowrap">
                <span className="block font-medium text-slate-600">{dateText}</span>
                <span className="block text-[10px]">{timeText}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
