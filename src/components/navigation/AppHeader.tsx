"use client";

import { NotificationsBell } from "@/components/NotificationsBell";
import type { Role } from "@/generated/prisma";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface AppHeaderProps {
  role: Role;
  email: string;
  fullName?: string | null;
  onOpenMobileMenu?: () => void;
}

export function AppHeader({ role, email, fullName, onOpenMobileMenu }: AppHeaderProps) {
  const pathname = usePathname();

  // Compute breadcrumb segments
  let breadcrumb = "Operations";
  let section = "";

  if (pathname === "/admin" || pathname === "/admin/dashboard") {
    breadcrumb = "Dashboard";
    section = "Operations Overview";
  } else if (pathname.startsWith("/admin/members")) {
    breadcrumb = "Governance";
    section = "Staff Roster";
  } else if (pathname.startsWith("/admin/settings/designations")) {
    breadcrumb = "Settings";
    section = "Designations";
  } else if (pathname.startsWith("/admin/settings")) {
    breadcrumb = "Settings";
    section = "Overview";
  } else if (pathname.startsWith("/admin/applications") || pathname.startsWith("/employee/applications")) {
    breadcrumb = "Operations";
    section = "Applications";
  } else if (pathname.startsWith("/employee/application-log")) {
    breadcrumb = "Operations";
    section = "Application Desk";
  } else if (pathname.startsWith("/admin/tasks/escalations")) {
    breadcrumb = "Tasks";
    section = "Escalations";
  } else if (pathname.startsWith("/employee/tasks")) {
    breadcrumb = "Tasks";
    section = "All Tasks";
  } else if (pathname.startsWith("/admin/candidates") || pathname.startsWith("/employee/candidates")) {
    breadcrumb = "Operations";
    section = "Candidates";
  } else if (pathname.startsWith("/employee/jobs")) {
    breadcrumb = "Operations";
    section = "Jobs";
  } else if (pathname.startsWith("/admin/privacy") || pathname.startsWith("/candidate/privacy")) {
    breadcrumb = "Compliance";
    section = "Privacy Queue";
  } else if (pathname.startsWith("/admin/audit")) {
    breadcrumb = "Compliance";
    section = "Audit Trail";
  } else if (pathname.startsWith("/employee/messages") || pathname.startsWith("/candidate/messages")) {
    breadcrumb = "Communications";
    section = "Messages";
  } else if (pathname.startsWith("/candidate/profile")) {
    breadcrumb = "Candidate";
    section = "Profile";
  } else if (pathname.startsWith("/candidate")) {
    breadcrumb = "Candidate";
    section = "Portal";
  }

  const displayName: string = fullName || (email ? email.split("@")[0] : "User") || "User";
  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  return (
    <header className="h-14 lg:h-16 bg-white border-b border-[#E5EAE7] px-4 sm:px-6 flex items-center justify-between flex-shrink-0 z-20 sticky top-0">
      {/* Left: Hamburger (Mobile & Tablet) + Breadcrumbs */}
      <div className="flex items-center space-x-2 min-w-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-1.5 -ml-1 text-[#64748B] hover:text-[#0F1720] hover:bg-[#F7F9F8] rounded-lg transition-colors flex-shrink-0"
            aria-label="Open navigation menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex items-center space-x-2 text-xs truncate">
          <span className="font-semibold text-[#94A3B8]">OOS</span>
          <span className="text-[#E5EAE7]">/</span>
          <span className="font-medium text-[#64748B]">{breadcrumb}</span>
          {section && (
            <>
              <span className="text-[#E5EAE7]">/</span>
              <span className="font-bold text-[#0F1720] truncate">{section}</span>
            </>
          )}
        </div>
      </div>

      {/* Right: Actions / Quick indicators */}
      <div className="flex items-center space-x-3 sm:space-x-3.5 flex-shrink-0">
        {/* Realtime Notifications */}
        <NotificationsBell />

        <div className="h-4 w-[1px] bg-[#E5EAE7]" />

        {/* Role Badge */}
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
            role === "ADMIN"
              ? "bg-purple-50 text-purple-700 border border-purple-200/60"
              : role === "EMPLOYEE"
              ? "bg-blue-50 text-blue-700 border border-blue-200/60"
              : "bg-emerald-50 text-[#12A150] border border-emerald-200/60"
          }`}
        >
          {role}
        </span>

        {/* User Account Snippet */}
        <div className="flex items-center space-x-2 pl-1">
          <div className="w-7 h-7 rounded-full bg-[#12A150]/10 text-[#0B3B2C] border border-[#12A150]/20 font-bold text-[10px] flex items-center justify-center">
            {initials}
          </div>
          <span className="text-xs font-semibold text-[#0F1720] hidden sm:inline-block max-w-[140px] truncate">
            {displayName}
          </span>
        </div>
      </div>
    </header>
  );
}
