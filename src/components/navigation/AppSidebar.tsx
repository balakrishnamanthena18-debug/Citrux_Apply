"use client";

import { usePathname } from "next/navigation";
import type { Role } from "@/generated/prisma";
import { signOutAction } from "@/lib/auth/actions";
import { TransitionLink } from "@/components/ui/TransitionLink";

interface AppSidebarProps {
  role: Role;
  email: string;
  fullName?: string | null;
  organizationName?: string;
  isMobile?: boolean;
  onClose?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: (active: boolean) => React.ReactNode;
  badge?: string;
  highlight?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

export function AppSidebar({
  role,
  email,
  fullName,
  organizationName = "Operations Operating System",
  isMobile = false,
  onClose,
}: AppSidebarProps) {
  const pathname = usePathname();

  const adminNavSections: NavSection[] = [
    {
      title: "WORK",
      items: [
        {
          label: "Operations Command",
          href: "/admin/dashboard",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
        },
        {
          label: "Application Desk",
          href: "/employee/application-log",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        {
          label: "Applications",
          href: "/admin/applications",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          ),
        },
        {
          label: "Tasks & Work",
          href: "/employee/tasks",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          ),
        },
        {
          label: "Escalation Console",
          href: "/admin/tasks/escalations",
          highlight: true,
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-amber-600" : "text-amber-500 group-hover:text-amber-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        },
        {
          label: "Candidates",
          href: "/admin/candidates",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
        },
        {
          label: "Job Opportunities",
          href: "/employee/jobs",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ),
        },
        {
          label: "Team Messages",
          href: "/employee/messages",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "GOVERNANCE",
      items: [
        {
          label: "Staff Roster",
          href: "/admin/members",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ),
        },
        {
          label: "Privacy Requests",
          href: "/admin/privacy",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          ),
        },
        {
          label: "Audit Trail",
          href: "/admin/audit",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "ADMINISTRATION",
      items: [
        {
          label: "Organization Settings",
          href: "/admin/settings",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
        },
      ],
    },
  ];

  const employeeNavSections: NavSection[] = [
    {
      title: "WORK",
      items: [
        {
          label: "My Command Center",
          href: "/employee",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
        },
        {
          label: "Application Desk",
          href: "/employee/application-log",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        {
          label: "Applications",
          href: "/employee/applications",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          ),
        },
        {
          label: "Tasks & Queue",
          href: "/employee/tasks",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          ),
        },
        {
          label: "Candidates",
          href: "/employee/candidates",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
        },
        {
          label: "Job Catalog",
          href: "/employee/jobs",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ),
        },
        {
          label: "Messages",
          href: "/employee/messages",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          ),
        },
      ],
    },
  ];

  const candidateNavSections: NavSection[] = [
    {
      title: "CANDIDATE PORTAL",
      items: [
        {
          label: "Dashboard",
          href: "/candidate",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
        },
        {
          label: "My Applications",
          href: "/candidate/applications",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
        },
        {
          label: "Messages",
          href: "/candidate/messages",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          ),
        },
        {
          label: "Career Profile",
          href: "/candidate/profile",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ),
        },
        {
          label: "Privacy & Data",
          href: "/candidate/privacy",
          icon: (active) => (
            <svg className={`w-4 h-4 ${active ? "text-[#12A150]" : "text-slate-400 group-hover:text-slate-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          ),
        },
      ],
    },
  ];

  const navSections = role === "ADMIN" ? adminNavSections : role === "EMPLOYEE" ? employeeNavSections : candidateNavSections;

  const displayName: string = fullName || (email ? email.split("@")[0] : "User") || "User";
  const initials = displayName
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  return (
    <aside
      className={
        isMobile
          ? "w-full bg-white flex flex-col justify-between flex-1 select-none h-full overflow-hidden"
          : "fixed inset-y-0 left-0 w-64 bg-white border-r border-[#E5EAE7] flex flex-col justify-between flex-shrink-0 select-none z-30 h-screen overflow-hidden"
      }
    >
      {/* Top Section */}
      <div className="flex flex-col flex-1 overflow-y-auto min-h-0">
        {/* Brand Header */}
        <div className="h-14 lg:h-16 flex items-center justify-between px-5 border-b border-[#EDF1EF] flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#0B3B2C] text-[#C6F432] flex items-center justify-center font-bold text-xs tracking-wider shadow-sm">
              OOS
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0F1720] leading-tight tracking-tight">
                Operations OS
              </div>
              <div className="text-[10px] text-[#94A3B8] font-medium truncate">
                {organizationName}
              </div>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          {isMobile && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              aria-label="Close navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <nav className="p-3 space-y-4 flex-1">
          {navSections.map((section, sIdx) => (
            <div key={section.title || sIdx} className="space-y-0.5">
              {section.title && (
                <div className="px-3 pb-1 pt-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const isActive =
                  item.href === "/admin/dashboard"
                    ? pathname === "/admin" || pathname === "/admin/dashboard"
                    : pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href + "/"));

                return (
                  <TransitionLink
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    isActive={isActive}
                    onNavigate={() => {
                      if (isMobile && onClose) onClose();
                    }}
                    className={`group flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                      isActive
                        ? "bg-[#12A150]/[0.08] text-[#0B3B2C] font-semibold shadow-2xs border-l-2 border-[#12A150] pl-2.5"
                        : "text-[#64748B] hover:text-[#0F1720] hover:bg-[#12A150]/[0.04]"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {item.icon(isActive)}
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.highlight && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                    )}
                  </TransitionLink>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* User / Account Footer */}
      <div className="p-3 border-t border-[#EDF1EF] bg-[#F7F9F8]/60 flex-shrink-0">
        <div className="p-2.5 rounded-xl bg-white border border-[#E5EAE7] shadow-2xs flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#12A150]/10 text-[#0B3B2C] border border-[#12A150]/20 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#0F1720] truncate">
                {displayName}
              </div>
              <div className="text-[10px] text-[#94A3B8] truncate max-w-[100px]">
                {email}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 flex-shrink-0">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                role === "ADMIN"
                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                  : role === "EMPLOYEE"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-emerald-50 text-[#12A150] border border-emerald-200"
              }`}
            >
              {role}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}

