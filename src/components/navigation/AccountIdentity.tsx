"use client";

import React from "react";
import type { Role } from "@/generated/prisma";

export interface AccountIdentityProps {
  role: Role;
  email: string;
  fullName?: string | null;
  organizationName?: string;
  designationName?: string | null;
  isTeamLead?: boolean;
  isManager?: boolean;
  variant?: "compact" | "header" | "detailed";
  className?: string;
}

export function getInitials(fullName?: string | null, email?: string): string {
  const displayName = (fullName || (email ? email.split("@")[0] : "User") || "User").trim();
  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.charAt(0) || "";
    const last = parts[parts.length - 1]?.charAt(0) || "";
    return `${first}${last}`.toUpperCase();
  }
  return (displayName.charAt(0) || "U").toUpperCase();
}

export function getRoleBadgeConfig(
  role: Role,
  isTeamLead?: boolean,
  isManager?: boolean
): { label: string; bg: string; text: string; border: string } {
  if (role === "ADMIN") {
    return {
      label: "SYSTEM ADMIN",
      bg: "bg-purple-50",
      text: "text-purple-700",
      border: "border-purple-200",
    };
  }

  if (role === "EMPLOYEE") {
    if (isManager) {
      return {
        label: "MANAGER",
        bg: "bg-indigo-50",
        text: "text-indigo-700",
        border: "border-indigo-200",
      };
    }
    if (isTeamLead) {
      return {
        label: "TEAM LEAD",
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
      };
    }
    return {
      label: "EMPLOYEE",
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-200",
    };
  }

  return {
    label: "CANDIDATE",
    bg: "bg-[#EBF2ED]",
    text: "text-[#082F26]",
    border: "border-[#C2D6CA]",
  };
}

export function AccountIdentity({
  role,
  email,
  fullName,
  organizationName,
  designationName,
  isTeamLead = false,
  isManager = false,
  variant = "detailed",
  className = "",
}: AccountIdentityProps) {
  const defaultOrgName = role === "CANDIDATE" ? "Career Button" : "Operations Operating System";
  const effectiveOrgName = organizationName || defaultOrgName;
  const displayName = fullName || (email ? email.split("@")[0] : "User") || "User";
  const initials = getInitials(fullName, email);
  const badge = getRoleBadgeConfig(role, isTeamLead, isManager);

  if (variant === "header") {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-2xs transition-transform group-hover:scale-105 ${
            role === "CANDIDATE"
              ? "border-[#082F26]/30 bg-[#082F26]/10 text-[#082F26]"
              : "border-[#12A150]/30 bg-[#12A150]/10 text-[#0B3B2C]"
          }`}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="hidden min-w-0 text-left sm:block">
          <div className="flex items-center gap-1.5">
            <span className="max-w-[130px] truncate text-xs font-semibold text-[#0F1720]">
              {displayName}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badge.bg} ${badge.text} ${badge.border}`}
            >
              {badge.label}
            </span>
          </div>
          <div className="max-w-[170px] truncate text-[10px] text-[#94A3B8]">
            {designationName || email}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
        <div
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
            role === "CANDIDATE"
              ? "border-[#082F26]/20 bg-[#082F26]/10 text-[#082F26]"
              : "border-[#12A150]/20 bg-[#12A150]/10 text-[#0B3B2C]"
          }`}
          aria-hidden="true"
        >
          {initials}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
              role === "ADMIN"
                ? "bg-purple-500"
                : isManager
                ? "bg-indigo-500"
                : isTeamLead
                ? "bg-amber-500"
                : role === "EMPLOYEE"
                ? "bg-blue-500"
                : "bg-[#082F26]"
            }`}
          />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-xs font-semibold text-[#0F1720] leading-tight">
            {displayName}
          </div>
          <div className="truncate text-[10px] text-[#94A3B8] leading-tight">
            {email}
          </div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badge.bg} ${badge.text} ${badge.border}`}
        >
          {badge.label}
        </span>
      </div>
    );
  }

  // Detailed mode (used in dropdown popovers, mobile drawer account card)
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-2xs ${
          role === "CANDIDATE"
            ? "border-[#082F26]/30 bg-[#082F26]/10 text-sm font-bold text-[#082F26]"
            : "border-[#12A150]/30 bg-[#12A150]/10 text-sm font-bold text-[#0B3B2C]"
        }`}
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-bold text-[#0F1720] tracking-tight">
            {displayName}
          </span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badge.bg} ${badge.text} ${badge.border}`}
          >
            {badge.label}
          </span>
        </div>
        <div className="truncate text-xs text-[#64748B]">{email}</div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-[#94A3B8]">
          {designationName && (
            <span className="font-medium text-[#475569]">{designationName}</span>
          )}
          {designationName && <span>•</span>}
          <span className="truncate" data-testid="identity-org-name">{effectiveOrgName}</span>
        </div>
      </div>
    </div>
  );
}
