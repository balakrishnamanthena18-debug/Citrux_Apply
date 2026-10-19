"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { Role } from "@/generated/prisma";
import { AccountIdentity, getInitials, getRoleBadgeConfig } from "./AccountIdentity";
import { RoleAwareAccountActions } from "./RoleAwareAccountActions";
import { SignOutAction } from "./SignOutAction";
import { AccountModals } from "./AccountModals";

export interface AccountMenuProps {
  role: Role;
  email: string;
  fullName?: string | null;
  organizationName?: string;
  designationName?: string | null;
  isTeamLead?: boolean;
  isManager?: boolean;
  membershipId?: string;
}

export function AccountMenu({
  role,
  email,
  fullName,
  organizationName,
  designationName,
  isTeamLead = false,
  isManager = false,
  membershipId,
}: AccountMenuProps) {
  const defaultOrgName = role === "CANDIDATE" ? "Career Button" : "Operations Operating System";
  const effectiveOrgName = organizationName || defaultOrgName;
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<"details" | "help" | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = fullName || (email ? email.split("@")[0] : "User") || "User";
  const initials = getInitials(fullName, email);
  const badge = getRoleBadgeConfig(role, isTeamLead, isManager);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Outside click & Escape listener
  useEffect(() => {
    if (!isOpen && !activeModal) return;

    function handleClickOutside(event: MouseEvent) {
      if (activeModal) return; // Do not dismiss menu behind active modal
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeMenu();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (activeModal) {
          setActiveModal(null);
        } else if (isOpen) {
          closeMenu();
          buttonRef.current?.focus();
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, activeModal, closeMenu]);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Top Header Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        id="user-account-menu-button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`User account menu for ${displayName}`}
        onClick={() => setIsOpen((prev) => !prev)}
        className="group flex items-center gap-2 rounded-full border border-[#E5EAE7] bg-white p-1 pl-1 pr-2.5 transition-all hover:border-[#12A150]/40 hover:bg-[#F7F9F8] focus:outline-none focus:ring-2 focus:ring-[#12A150]/30 shadow-2xs"
      >
        <div
          className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border border-[#12A150]/30 bg-[#12A150]/10 text-xs font-bold text-[#0B3B2C] shadow-2xs transition-transform group-hover:scale-105"
          aria-hidden="true"
        >
          {initials}
        </div>

        <div className="hidden min-w-0 text-left sm:block">
          <div className="flex items-center gap-1.5">
            <span className="max-w-[120px] truncate text-xs font-semibold text-[#0F1720]">
              {displayName}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider border ${badge.bg} ${badge.text} ${badge.border}`}
            >
              {badge.label}
            </span>
          </div>
        </div>

        <svg
          className={`h-3.5 w-3.5 text-[#64748B] transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#0F1720]" : "group-hover:text-[#0F1720]"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-account-menu-button"
          className="absolute right-0 top-full mt-2 w-[min(340px,calc(100vw-1.5rem))] rounded-2xl border border-[#E5EAE7] bg-white shadow-xl z-50 overflow-hidden divide-y divide-[#EDF1EF] animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Popover Identity Header */}
          <div className="bg-[#F7F9F8]/70 p-4">
            <AccountIdentity
              role={role}
              email={email}
              fullName={fullName}
              organizationName={effectiveOrgName}
              designationName={designationName}
              isTeamLead={isTeamLead}
              isManager={isManager}
              variant="detailed"
            />
          </div>

          {/* Role-Aware Action Links */}
          <div className="p-2 max-h-[50vh] overflow-y-auto">
            <RoleAwareAccountActions
              role={role}
              membershipId={membershipId}
              isTeamLead={isTeamLead}
              isManager={isManager}
              onNavigate={closeMenu}
              onOpenHelp={() => setActiveModal("help")}
              onOpenDetails={() => setActiveModal("details")}
            />
          </div>

          {/* Platform Version & Destructive Sign Out Footer */}
          <div className="bg-white p-2 space-y-1">
            <div className="px-3 py-1 flex items-center justify-between text-[10px] text-[#94A3B8]">
              <span>Platform Runtime</span>
              <span className="font-mono font-medium text-[#64748B] bg-[#EDF1EF] px-1.5 py-0.5 rounded">
                v2.2.0-RELEASE
              </span>
            </div>

            <SignOutAction
              variant="menu-item"
              onSignOut={closeMenu}
            />
          </div>
        </div>
      )}

      {/* Account & Session Details & Help Modals rendered via Portal outside header containing block */}
      <AccountModals
        role={role}
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        displayName={displayName}
        email={email}
        badge={badge}
        designationName={designationName}
        organizationName={effectiveOrgName}
      />
    </div>
  );
}
