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
    <div className="bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E5EAE7] bg-[#F7F9F8] flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#0F1720]">
            Assigned Operations Team
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#12A150]/[0.08] text-[#12A150] border border-[#12A150]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#12A150] animate-pulse" />
            <span>Dedicated Desk</span>
          </span>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#0B3B2C] text-white font-bold text-sm flex items-center justify-center shadow-2xs shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#0F1720] truncate">
                {specialistName}
              </h3>
              <p className="text-xs text-[#64748B] truncate">{roleTitle}</p>
              {specialist?.email && (
                <p className="text-[11px] text-[#94A3B8] font-mono truncate mt-0.5">
                  {specialist.email}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EDF1EF] text-xs">
            <div className="p-3 rounded-[12px] bg-[#F7F9F8] border border-[#E5EAE7]">
              <div className="text-[11px] text-[#64748B] font-semibold">
                Active Managed
              </div>
              <div className="text-base font-bold text-[#0F1720] mt-0.5">
                {activeApplicationsCount} role{activeApplicationsCount !== 1 ? "s" : ""}
              </div>
            </div>

            <div className="p-3 rounded-[12px] bg-[#F7F9F8] border border-[#E5EAE7]">
              <div className="text-[11px] text-[#64748B] font-semibold">
                Desk Cadence
              </div>
              <div className="text-xs font-semibold text-[#0F1720] mt-1 truncate">
                {lastActivityText}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-5 py-3.5 border-t border-[#EDF1EF] bg-[#F7F9F8] flex items-center justify-between">
        <span className="text-xs text-[#64748B]">
          Direct communication
        </span>
        <Link
          href="/candidate/messages"
          className="text-xs font-semibold text-[#12A150] hover:text-[#0B3B2C] inline-flex items-center gap-1"
        >
          <span>Message {specialist?.firstName || "Specialist"}</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
