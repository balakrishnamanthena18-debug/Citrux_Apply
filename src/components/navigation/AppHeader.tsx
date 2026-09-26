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
    <header className="h-14 lg:h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between flex-shrink-0 z-20 sticky top-0">
      {/* Left: Hamburger (Mobile & Tablet) + Breadcrumbs */}
      <div className="flex items-center space-x-2 min-w-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors flex-shrink-0"
            aria-label="Open navigation menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex items-center space-x-2 text-xs truncate">
          <span className="font-medium text-slate-400">OOS</span>
          <span className="text-slate-300">/</span>
          <span className="font-medium text-slate-600">{breadcrumb}</span>
          {section && (
            <>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-900 truncate">{section}</span>
            </>
          )}
        </div>
      </div>

      {/* Right: Actions / Quick indicators */}
      <div className="flex items-center space-x-3 sm:space-x-3.5 flex-shrink-0">
        {/* Realtime Notifications */}
        <NotificationsBell />

        <div className="h-4 w-[1px] bg-slate-200" />

        {/* Role Badge */}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${
            role === "ADMIN"
              ? "bg-purple-50 text-purple-700 border border-purple-200/60"
              : role === "EMPLOYEE"
              ? "bg-blue-50 text-blue-700 border border-blue-200/60"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
          }`}
        >
          {role}
        </span>

        {/* User Account Snippet */}
        <div className="flex items-center space-x-2 pl-1">
          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[10px] flex items-center justify-center">
            {initials}
          </div>
          <span className="text-xs font-medium text-slate-700 hidden sm:inline-block max-w-[140px] truncate">
            {displayName}
          </span>
        </div>
      </div>
    </header>
  );
}
