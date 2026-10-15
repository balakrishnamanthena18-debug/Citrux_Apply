"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Role } from "@/generated/prisma";
import { AccountIdentity, getInitials, getRoleBadgeConfig } from "./AccountIdentity";
import { RoleAwareAccountActions } from "./RoleAwareAccountActions";
import { SignOutAction } from "./SignOutAction";
import { AccountModals } from "./AccountModals";
import { signOutAction } from "@/lib/auth/actions";

export interface ResponsiveAccountPanelProps {
  role: Role;
  email: string;
  fullName?: string | null;
  organizationName?: string;
  designationName?: string | null;
  isTeamLead?: boolean;
  isManager?: boolean;
  membershipId?: string;
  isMobile?: boolean;
  isCollapsed?: boolean;
  hideMobileSignOut?: boolean;
  onClose?: () => void;
}

export function ResponsiveAccountPanel({
  role,
  email,
  fullName,
  organizationName = "Operations Operating System",
  designationName,
  isTeamLead = false,
  isManager = false,
  membershipId,
  isMobile = false,
  isCollapsed = false,
  hideMobileSignOut = false,
  onClose,
}: ResponsiveAccountPanelProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<"details" | "help" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = fullName || (email ? email.split("@")[0] : "User") || "User";
  const initials = getInitials(fullName, email);
  const badge = getRoleBadgeConfig(role, isTeamLead, isManager);

  // Close popup on outside click & Escape
  useEffect(() => {
    if (!popoverOpen && !activeModal) return;

    function handleClickOutside(event: MouseEvent) {
      if (activeModal) return;
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setPopoverOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPopoverOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen, activeModal]);

  // Determine role-aware "My Account" and "Settings" target routes
  let myAccountHref = "/candidate/profile";
  let myAccountLabel = "My Profile";
  let settingsHref = "/candidate/profile?section=preferences";
  let settingsLabel = "Preferences";

  if (role === "ADMIN") {
    myAccountHref = membershipId ? `/admin/members/${membershipId}` : "/admin/members";
    myAccountLabel = "My Profile";
    settingsHref = "/admin/settings";
    settingsLabel = "Settings";
  } else if (role === "EMPLOYEE") {
    myAccountHref = "/employee";
    myAccountLabel = "My Account";
    settingsHref = isManager ? "/employee/outcomes" : "/employee/tasks";
    settingsLabel = isManager ? "Outcomes" : "Tasks";
  }

  // 1. Mobile Drawer Presentation
  if (isMobile) {
    return (
      <div
        className="p-3 border-t border-[#EDF1EF] bg-[#F7F9F8]/60 flex-shrink-0"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="p-3 rounded-xl bg-white border border-[#E5EAE7] shadow-2xs space-y-3">
          <AccountIdentity
            role={role}
            email={email}
            fullName={fullName}
            organizationName={organizationName}
            designationName={designationName}
            isTeamLead={isTeamLead}
            isManager={isManager}
            variant="detailed"
          />

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#EDF1EF]">
            <Link
              href={myAccountHref}
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold text-[#334155] bg-[#F7F9F8] hover:bg-[#EDF1EF] border border-[#E5EAE7] transition-colors"
            >
              <span>{myAccountLabel}</span>
            </Link>
            <Link
              href={settingsHref}
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold text-[#334155] bg-[#F7F9F8] hover:bg-[#EDF1EF] border border-[#E5EAE7] transition-colors"
            >
              <span>{settingsLabel}</span>
            </Link>
          </div>
        </div>

        {/* Mobile drawer: labeled Sign Out above the safe-area, never under the tab bar. */}
        {!hideMobileSignOut && (
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              aria-label="Sign out"
              className="flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E5EAE7] bg-white px-3 py-2.5 text-xs font-semibold text-[#475569] shadow-2xs transition-colors hover:bg-slate-50 hover:text-[#0F1720]"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign out</span>
            </button>
          </form>
        )}
      </div>
    );
  }

  // 2. Desktop Collapsed Presentation (icon-only mode)
  if (isCollapsed) {
    return (
      <div className="relative p-2 border-t border-[#EDF1EF] bg-[#F7F9F8]/60 flex flex-col items-center gap-2 flex-shrink-0" ref={containerRef}>
        {/* Flyout Popover */}
        {popoverOpen && (
          <div
            role="menu"
            aria-label="Account options"
            className="absolute bottom-2 left-full ml-2 w-72 rounded-2xl border border-[#E5EAE7] bg-white shadow-xl z-50 overflow-hidden divide-y divide-[#EDF1EF] animate-in fade-in-0 duration-150"
          >
            <div className="bg-[#F7F9F8]/70 p-3.5">
              <AccountIdentity
                role={role}
                email={email}
                fullName={fullName}
                organizationName={organizationName}
                designationName={designationName}
                isTeamLead={isTeamLead}
                isManager={isManager}
                variant="detailed"
              />
            </div>
            <div className="p-2">
              <RoleAwareAccountActions
                role={role}
                membershipId={membershipId}
                isTeamLead={isTeamLead}
                isManager={isManager}
                onNavigate={() => setPopoverOpen(false)}
                onOpenHelp={() => {
                  setPopoverOpen(false);
                  setActiveModal("help");
                }}
                onOpenDetails={() => {
                  setPopoverOpen(false);
                  setActiveModal("details");
                }}
              />
            </div>
            <div className="p-2">
              <SignOutAction variant="menu-item" onSignOut={() => setPopoverOpen(false)} />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          title={`${displayName} (${badge.label})`}
          aria-label={`Account menu for ${displayName}`}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#12A150]/30 bg-[#12A150]/10 text-xs font-bold text-[#0B3B2C] shadow-2xs hover:scale-105 transition-transform"
        >
          {initials}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
              role === "ADMIN" ? "bg-purple-500" : isManager ? "bg-indigo-500" : isTeamLead ? "bg-amber-500" : role === "EMPLOYEE" ? "bg-blue-500" : "bg-[#12A150]"
            }`}
          />
        </button>

        <form action={signOutAction}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </form>
      </div>
    );
  }

  // 3. Desktop Expanded Presentation
  return (
    <div className="relative p-3 border-t border-[#EDF1EF] bg-[#F7F9F8]/60 flex-shrink-0" ref={containerRef}>
      {/* Popover Menu above account card when clicked */}
      {popoverOpen && (
        <div
          role="menu"
          aria-label="Account options"
          className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl border border-[#E5EAE7] bg-white shadow-xl z-50 overflow-hidden divide-y divide-[#EDF1EF] animate-in fade-in-0 duration-150"
        >
          <div className="bg-[#F7F9F8]/70 p-3.5">
            <AccountIdentity
              role={role}
              email={email}
              fullName={fullName}
              organizationName={organizationName}
              designationName={designationName}
              isTeamLead={isTeamLead}
              isManager={isManager}
              variant="detailed"
            />
          </div>
          <div className="p-2 max-h-56 overflow-y-auto">
            <RoleAwareAccountActions
              role={role}
              membershipId={membershipId}
              isTeamLead={isTeamLead}
              isManager={isManager}
              onNavigate={() => setPopoverOpen(false)}
              onOpenHelp={() => {
                setPopoverOpen(false);
                setActiveModal("help");
              }}
              onOpenDetails={() => {
                setPopoverOpen(false);
                setActiveModal("details");
              }}
            />
          </div>
        </div>
      )}

      {/* Account Identity Card (clickable to open menu) */}
      <div className="p-2.5 rounded-xl bg-white border border-[#E5EAE7] shadow-2xs space-y-2.5">
        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 text-left group hover:opacity-90 transition-opacity"
          aria-label={`Open account menu for ${displayName}`}
          aria-expanded={popoverOpen}
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#12A150]/10 text-[#0B3B2C] border border-[#12A150]/20 font-bold text-[10px] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#0F1720] truncate">
                {displayName}
              </div>
              <div className="text-[10px] text-[#94A3B8] truncate max-w-[110px]">
                {designationName || email}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 flex-shrink-0">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badge.bg} ${badge.text} ${badge.border}`}
            >
              {badge.label}
            </span>
            <svg
              className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform duration-200 ${popoverOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Quick Nav Row (My Account & Settings) */}
        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#EDF1EF]">
          <Link
            href={myAccountHref}
            className="flex items-center justify-center py-1 px-2 rounded-md text-[11px] font-semibold text-[#475569] bg-[#F7F9F8] hover:bg-[#EDF1EF] hover:text-[#0F1720] border border-[#E5EAE7] transition-colors"
          >
            <span>{myAccountLabel}</span>
          </Link>
          <Link
            href={settingsHref}
            className="flex items-center justify-center py-1 px-2 rounded-md text-[11px] font-semibold text-[#475569] bg-[#F7F9F8] hover:bg-[#EDF1EF] hover:text-[#0F1720] border border-[#E5EAE7] transition-colors"
          >
            <span>{settingsLabel}</span>
          </Link>
        </div>

        {/* Explicit Sign Out with text and logout icon */}
        <div className="pt-0.5">
          <SignOutAction variant="sidebar" />
        </div>
      </div>

      {/* Account & Session Details & Help Modals rendered via Portal */}
      <AccountModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        displayName={displayName}
        email={email}
        badge={badge}
        designationName={designationName}
        organizationName={organizationName}
      />
    </div>
  );
}
