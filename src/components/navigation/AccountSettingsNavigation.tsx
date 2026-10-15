"use client";

import React from "react";
import Link from "next/link";
import type { Role } from "@/generated/prisma";

export interface AccountSettingsNavigationProps {
  role: Role;
  className?: string;
  itemClassName?: string;
  onNavigate?: () => void;
}

export function getSettingsDestinations(role: Role): Array<{ href: string; label: string; description: string }> {
  if (role === "ADMIN") {
    return [
      {
        href: "/admin/settings",
        label: "Organization Settings",
        description: "Operating entity configuration and domain boundaries",
      },
      {
        href: "/admin/settings/designations",
        label: "Designations",
        description: "Official job titles and business codes",
      },
      {
        href: "/admin/settings/task-rules",
        label: "Task Rules",
        description: "Task creation, assignment and escalation policies",
      },
    ];
  }

  if (role === "CANDIDATE") {
    return [
      {
        href: "/candidate/profile?section=preferences",
        label: "Job Preferences",
        description: "Work mode, target roles, and location preferences",
      },
      {
        href: "/candidate/privacy",
        label: "Privacy & Data",
        description: "GDPR/CCPA consent and data subject rights",
      },
    ];
  }

  // EMPLOYEE
  return [
    {
      href: "/employee/tasks",
      label: "Work Queue",
      description: "Assigned tasks and priority actions",
    },
    {
      href: "/employee/application-log",
      label: "Application Desk",
      description: "Direct application intake and status log",
    },
  ];
}

export function AccountSettingsNavigation({
  role,
  className = "",
  itemClassName = "",
  onNavigate,
}: AccountSettingsNavigationProps) {
  const destinations = getSettingsDestinations(role);

  return (
    <nav className={`space-y-1 ${className}`} aria-label="Settings navigation">
      {destinations.map((dest) => (
        <Link
          key={dest.href}
          href={dest.href}
          onClick={onNavigate}
          className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors hover:bg-[#F7F9F8] ${itemClassName}`}
        >
          <div>
            <div className="font-semibold text-[#0F1720]">{dest.label}</div>
            <div className="text-[10px] text-[#94A3B8]">{dest.description}</div>
          </div>
          <span className="text-[#94A3B8]">→</span>
        </Link>
      ))}
    </nav>
  );
}
