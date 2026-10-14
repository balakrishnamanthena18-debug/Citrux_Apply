"use client";

import React from "react";
import Link from "next/link";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export type NextActionTone = "urgent" | "important" | "calm";

export interface NextBestActionData {
  tone: NextActionTone;
  badgeText: string;
  title: string;
  description: string;
  whyItMatters: string;
  whatHappensNext: string;
  actionUrl: string;
  actionLabel: string;
}

interface Props {
  action: NextBestActionData;
}

export function CandidateNextBestAction({ action }: Props) {
  const isUrgent = action.tone === "urgent";
  const isCalm = action.tone === "calm";

  const toneConfig = {
    urgent: {
      border: "border-amber-200/90",
      bg: "bg-amber-50/40",
      badge: "bg-amber-100 text-amber-900 border-amber-300",
      button: "bg-amber-600 hover:bg-amber-700 text-white shadow-sm focus-visible:ring-amber-500",
      accentIcon: "⚡",
    },
    important: {
      border: "border-slate-200/90",
      bg: "bg-white",
      badge: "bg-sky-50 text-sky-800 border-sky-200",
      button: "bg-slate-900 hover:bg-slate-800 text-white shadow-sm focus-visible:ring-slate-900",
      accentIcon: "📋",
    },
    calm: {
      border: "border-emerald-200/80",
      bg: "bg-gradient-to-r from-emerald-50/30 via-white to-emerald-50/20",
      badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
      button: "bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-2xs focus-visible:ring-slate-400",
      accentIcon: "✓",
    },
  }[action.tone];

  return (
    <section
      aria-label="Next Best Action"
      className={`rounded-2xl border ${toneConfig.border} ${toneConfig.bg} shadow-2xs overflow-hidden transition-all`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Main Action Information */}
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${toneConfig.badge}`}
              >
                <span>{toneConfig.accentIcon}</span>
                <span>{action.badgeText}</span>
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Priority Directive
                </span>
                <HelpTooltip topic="next_best_action" label="Priority directive guidance" />
              </div>
            </div>

            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {action.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
                {action.description}
              </p>
            </div>

            {/* Why It Matters & What Happens Next Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3 space-y-1">
                <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <span className="text-slate-400">💡</span>
                  <span>Why this matters</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {action.whyItMatters}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3 space-y-1">
                <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <span className="text-slate-400">🔄</span>
                  <span>What happens next</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {action.whatHappensNext}
                </p>
              </div>
            </div>
          </div>

          {/* Action CTA */}
          <div className="shrink-0 flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-center gap-2 pt-2 lg:pt-0">
            <Link
              href={action.actionUrl}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${toneConfig.button}`}
            >
              <span>{action.actionLabel}</span>
              <span className="text-sm leading-none" aria-hidden>
                →
              </span>
            </Link>
            {!isCalm && (
              <span className="text-[11px] text-slate-400 text-center lg:text-right">
                Estimated time: 1–2 minutes
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
