"use client";

import React from "react";
import type { CareerSectionKey } from "@/lib/candidate/career-sections";

export type { CareerSectionKey };
export { CAREER_SECTION_KEYS, isCareerSectionKey } from "@/lib/candidate/career-sections";

export interface NavSectionItem {
  key: CareerSectionKey;
  label: string;
  badge?: string | number;
  badgeVariant?: "default" | "attention" | "success";
  icon: string;
}

interface Props {
  activeSection: CareerSectionKey;
  onSelectSection: (key: CareerSectionKey) => void;
  counts?: {
    experiences: number;
    educations: number;
    skills: number;
    projects: number;
    certifications: number;
    documents: number;
    needsAttentionCount?: number;
  };
}

export function CandidateCareerNav({
  activeSection,
  onSelectSection,
  counts,
}: Props) {
  const sections: NavSectionItem[] = [
    {
      key: "overview",
      label: "Workspace Overview",
      icon: "📊",
    },
    {
      key: "personal",
      label: "Personal & Contact",
      icon: "👤",
    },
    {
      key: "summary",
      label: "Professional Summary",
      icon: "📝",
    },
    {
      key: "experience",
      label: "Work Experience",
      badge: counts?.experiences,
      icon: "💼",
    },
    {
      key: "education",
      label: "Education History",
      badge: counts?.educations,
      icon: "🎓",
    },
    {
      key: "skills",
      label: "Skills Catalog",
      badge: counts?.skills,
      icon: "⚡",
    },
    {
      key: "projects",
      label: "Projects",
      badge: counts?.projects,
      icon: "🛠️",
    },
    {
      key: "certifications",
      label: "Certifications",
      badge: counts?.certifications,
      icon: "📜",
    },
    {
      key: "work_auth",
      label: "Work Authorization",
      icon: "🛡️",
    },
    {
      key: "preferences",
      label: "Job Preferences",
      icon: "🎯",
    },
    {
      key: "documents",
      label: "Document Vault",
      badge: counts?.documents,
      icon: "📁",
    },
    {
      key: "verification",
      label: "Verification Status",
      badge: counts?.needsAttentionCount && counts.needsAttentionCount > 0 ? "Action" : undefined,
      badgeVariant: "attention",
      icon: "✓",
    },
    {
      key: "history",
      label: "Change History",
      icon: "⏱️",
    },
  ];

  return (
    <nav className="space-y-1 select-none" aria-label="Career Workspace Sections">
      <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        Career Sections
      </div>
      {sections.map((item) => {
        const isActive = activeSection === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelectSection(item.key)}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all text-left cursor-pointer ${
              isActive
                ? "bg-slate-900 text-white shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </div>

            {item.badge !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-2 shrink-0 ${
                  isActive
                    ? "bg-slate-800 text-slate-200"
                    : item.badgeVariant === "attention"
                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
