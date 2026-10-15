"use client";

import React from "react";
import Link from "next/link";
import type { Role } from "@/generated/prisma";

export interface RoleAwareAccountActionsProps {
  role: Role;
  membershipId?: string;
  isTeamLead?: boolean;
  isManager?: boolean;
  onNavigate?: () => void;
  onOpenHelp?: () => void;
  onOpenDetails?: () => void;
}

export function RoleAwareAccountActions({
  role,
  membershipId,
  isTeamLead = false,
  isManager = false,
  onNavigate,
  onOpenHelp,
  onOpenDetails,
}: RoleAwareAccountActionsProps) {
  const itemClass =
    "group flex items-center justify-between px-3 py-2 text-xs font-medium text-[#0F1720] hover:bg-[#F7F9F8] hover:text-[#0B3B2C] rounded-lg transition-colors";

  if (role === "ADMIN") {
    const profileHref = membershipId ? `/admin/members/${membershipId}` : "/admin/members";
    return (
      <div className="space-y-4 py-1">
        <div>
          <div className="px-3 pb-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">
            Personal & Governance
          </div>
          <div className="space-y-0.5">
            <Link href={profileHref} onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>My Staff Profile</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Roster</span>
            </Link>

            <Link href="/admin/settings" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Organization Settings</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Config</span>
            </Link>

            <Link href="/admin/settings/designations" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span>Designations</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Titles</span>
            </Link>

            <Link href="/admin/audit" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <span>Audit Trail</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Forensic</span>
            </Link>

            <Link href="/admin/privacy" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Privacy Requests</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Queue</span>
            </Link>
          </div>
        </div>

        <div>
          <div className="px-3 pb-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">
            Platform & Support
          </div>
          <div className="space-y-0.5">
            {onOpenDetails && (
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) onNavigate();
                  onOpenDetails();
                }}
                className={`w-full ${itemClass}`}
              >
                <div className="flex items-center gap-2.5">
                  <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Account & Session Details</span>
                </div>
                <span className="text-[10px] text-[#94A3B8]">Verified</span>
              </button>
            )}

            {onOpenHelp && (
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) onNavigate();
                  onOpenHelp();
                }}
                className={`w-full ${itemClass}`}
              >
                <div className="flex items-center gap-2.5">
                  <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>Help & Support</span>
                </div>
                <span className="text-[10px] text-[#94A3B8]">Assistance</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (role === "CANDIDATE") {
    return (
      <div className="space-y-4 py-1">
        <div>
          <div className="px-3 pb-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">
            Career & Identity
          </div>
          <div className="space-y-0.5">
            <Link href="/candidate/profile" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>My Career Profile</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Edit</span>
            </Link>

            <Link href="/candidate/profile?section=preferences" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span>Job Preferences</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Targets</span>
            </Link>

            <Link href="/candidate/profile?section=documents" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
                </svg>
                <span>Document Vault</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Files</span>
            </Link>

            <Link href="/candidate/privacy" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Privacy & Data Rights</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">GDPR</span>
            </Link>
          </div>
        </div>

        <div>
          <div className="px-3 pb-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">
            Support
          </div>
          <div className="space-y-0.5">
            {onOpenHelp && (
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) onNavigate();
                  onOpenHelp();
                }}
                className={`w-full ${itemClass}`}
              >
                <div className="flex items-center gap-2.5">
                  <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>Help & Candidate Support</span>
                </div>
                <span className="text-[10px] text-[#94A3B8]">Help</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // EMPLOYEE / MANAGER / TEAM LEAD
  return (
    <div className="space-y-4 py-1">
      <div>
        <div className="px-3 pb-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">
          Operations & Workspace
        </div>
        <div className="space-y-0.5">
          <Link href="/employee" onClick={onNavigate} className={itemClass}>
            <div className="flex items-center gap-2.5">
              <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Command Center</span>
            </div>
            <span className="text-[10px] text-[#94A3B8]">Desk</span>
          </Link>

          <Link href="/employee/application-log" onClick={onNavigate} className={itemClass}>
            <div className="flex items-center gap-2.5">
              <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Application Desk</span>
            </div>
            <span className="text-[10px] text-[#94A3B8]">Intake</span>
          </Link>

          <Link href="/employee/tasks" onClick={onNavigate} className={itemClass}>
            <div className="flex items-center gap-2.5">
              <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>Tasks & Queue</span>
            </div>
            <span className="text-[10px] text-[#94A3B8]">Queue</span>
          </Link>

          {isTeamLead && (
            <Link href="/employee/applications" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-semibold text-amber-900">Team Applications</span>
              </div>
              <span className="text-[10px] text-amber-700 font-bold">Lead</span>
            </Link>
          )}

          {isManager && (
            <Link href="/employee/outcomes" onClick={onNavigate} className={itemClass}>
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="font-semibold text-indigo-900">Outcome Reporting</span>
              </div>
              <span className="text-[10px] text-indigo-700 font-bold">Manager</span>
            </Link>
          )}
        </div>
      </div>

      <div>
        <div className="px-3 pb-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">
          Account & Assistance
        </div>
        <div className="space-y-0.5">
          {onOpenDetails && (
            <button
              type="button"
              onClick={() => {
                if (onNavigate) onNavigate();
                onOpenDetails();
              }}
              className={`w-full ${itemClass}`}
            >
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Account & Session Details</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Verified</span>
            </button>
          )}

          {onOpenHelp && (
            <button
              type="button"
              onClick={() => {
                if (onNavigate) onNavigate();
                onOpenHelp();
              }}
              className={`w-full ${itemClass}`}
            >
              <div className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-[#64748B] group-hover:text-[#12A150]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Help & Support</span>
              </div>
              <span className="text-[10px] text-[#94A3B8]">Contact</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
