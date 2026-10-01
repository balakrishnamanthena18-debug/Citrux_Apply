"use client";

import { NotificationsBell } from "@/components/NotificationsBell";
import type { Role } from "@/generated/prisma";
import { usePathname } from "next/navigation";

interface AppHeaderProps {
  role: Role;
  email: string;
  fullName?: string | null;
  onOpenMobileMenu?: () => void;
}

function resolveSection(pathname: string): { breadcrumb: string; section: string; mobileTitle: string } {
  let breadcrumb = "Operations";
  let section = "";
  let mobileTitle = "OOS";

  if (pathname === "/admin" || pathname === "/admin/dashboard") {
    breadcrumb = "Dashboard";
    section = "Operations Overview";
    mobileTitle = "Operations";
  } else if (pathname.startsWith("/admin/members")) {
    breadcrumb = "Governance";
    section = "Staff Roster";
    mobileTitle = "Staff";
  } else if (pathname.startsWith("/admin/settings/designations")) {
    breadcrumb = "Settings";
    section = "Designations";
    mobileTitle = "Designations";
  } else if (pathname.startsWith("/admin/settings")) {
    breadcrumb = "Settings";
    section = "Overview";
    mobileTitle = "Settings";
  } else if (pathname.startsWith("/admin/applications") || pathname.startsWith("/employee/applications")) {
    breadcrumb = "Operations";
    section = "Applications";
    mobileTitle = "Applications";
  } else if (pathname.startsWith("/employee/application-log")) {
    breadcrumb = "Operations";
    section = "Application Desk";
    mobileTitle = "App Desk";
  } else if (pathname.startsWith("/admin/tasks/escalations")) {
    breadcrumb = "Tasks";
    section = "Escalations";
    mobileTitle = "Escalations";
  } else if (pathname.startsWith("/employee/tasks")) {
    breadcrumb = "Tasks";
    section = "All Tasks";
    mobileTitle = "Tasks";
  } else if (pathname.startsWith("/admin/candidates") || pathname.startsWith("/employee/candidates")) {
    breadcrumb = "Operations";
    section = "Candidates";
    mobileTitle = "Candidates";
  } else if (pathname.startsWith("/employee/jobs")) {
    breadcrumb = "Operations";
    section = "Jobs";
    mobileTitle = "Jobs";
  } else if (pathname.startsWith("/admin/privacy") || pathname.startsWith("/candidate/privacy")) {
    breadcrumb = "Compliance";
    section = "Privacy Queue";
    mobileTitle = "Privacy";
  } else if (pathname.startsWith("/admin/audit")) {
    breadcrumb = "Compliance";
    section = "Audit Trail";
    mobileTitle = "Audit";
  } else if (pathname.startsWith("/employee/messages") || pathname.startsWith("/candidate/messages")) {
    breadcrumb = "Communications";
    section = "Messages";
    mobileTitle = "Messages";
  } else if (pathname.startsWith("/candidate/profile")) {
    breadcrumb = "Candidate";
    section = "Profile";
    mobileTitle = "Profile";
  } else if (pathname.startsWith("/candidate/applications")) {
    breadcrumb = "Candidate";
    section = "Applications";
    mobileTitle = "Applications";
  } else if (pathname === "/candidate" || pathname.startsWith("/candidate")) {
    breadcrumb = "Candidate";
    section = "Portal";
    mobileTitle = "Candidate Portal";
  } else if (pathname === "/employee") {
    breadcrumb = "Operations";
    section = "Command Center";
    mobileTitle = "Command";
  }

  return { breadcrumb, section, mobileTitle };
}

export function AppHeader({ email, fullName, onOpenMobileMenu }: AppHeaderProps) {
  const pathname = usePathname();
  const { breadcrumb, section, mobileTitle } = resolveSection(pathname);

  const displayName: string = fullName || (email ? email.split("@")[0] : "User") || "User";
  const initials =
    displayName
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <header
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-[#E5EAE7] bg-white/95 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-white/90 sm:px-6 lg:h-16"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#64748B] transition hover:bg-[#F7F9F8] hover:text-[#0F1720] lg:hidden"
            aria-label="Open navigation menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Mobile app title */}
        <div className="min-w-0 md:hidden">
          <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#0F1720]">
            {mobileTitle}
          </div>
        </div>

        {/* Desktop breadcrumbs */}
        <div className="hidden min-w-0 items-center space-x-2 text-xs md:flex">
          <span className="font-semibold text-[#94A3B8]">OOS</span>
          <span className="text-[#E5EAE7]">/</span>
          <span className="font-medium text-[#64748B]">{breadcrumb}</span>
          {section && (
            <>
              <span className="text-[#E5EAE7]">/</span>
              <span className="truncate font-bold text-[#0F1720]">{section}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <NotificationsBell />

        <div className="hidden h-4 w-px bg-[#E5EAE7] sm:block" />

        <div className="flex items-center gap-2 pl-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#12A150]/20 bg-[#12A150]/10 text-[10px] font-bold text-[#0B3B2C] sm:h-7 sm:w-7">
            {initials}
          </div>
          <span className="hidden max-w-[140px] truncate text-xs font-semibold text-[#0F1720] sm:inline-block">
            {displayName}
          </span>
        </div>
      </div>
    </header>
  );
}
