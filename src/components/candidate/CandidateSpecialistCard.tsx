"use client";

import React from "react";
import Link from "next/link";

interface Props {
  specialist?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    designationName?: string | null;
  } | null;
  activeApplicationsCount: number;
  lastActivityText?: string;
  hasExistingConversation?: boolean;
}

export function CandidateSpecialistCard({
  specialist,
  activeApplicationsCount,
  lastActivityText = "Active today",
  hasExistingConversation = false,
}: Props) {
  const specialistName = specialist
    ? [specialist.firstName, specialist.lastName].filter(Boolean).join(" ") ||
      specialist.email.split("@")[0]
    : "Operations Team";

  const initials = specialist
    ? (
        (specialist.firstName?.[0] || "") + (specialist.lastName?.[0] || "")
      ).toUpperCase() || specialist.email.substring(0, 2).toUpperCase()
    : "OP";

  const roleTitle =
    specialist?.designationName || "Application Operations Specialist";

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Assigned Operations Team
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Dedicated Desk</span>
          </span>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-2xs shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {specialistName}
              </h3>
              <p className="text-xs text-slate-500 truncate">{roleTitle}</p>
              {specialist?.email && (
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {specialist.email}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-[11px] text-slate-500 font-medium">
                Active Managed
              </div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {activeApplicationsCount} role{activeApplicationsCount !== 1 ? "s" : ""}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-[11px] text-slate-500 font-medium">
                Desk Cadence
              </div>
              <div className="text-xs font-semibold text-slate-800 mt-1 truncate">
                {lastActivityText}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Direct communication
        </span>
        <Link
          href="/candidate/messages"
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
        >
          <span>Message {specialist?.firstName || "Specialist"}</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
