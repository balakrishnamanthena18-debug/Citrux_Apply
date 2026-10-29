"use client";

import React, { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export interface TabConfig {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  badgeColor?: "default" | "sky" | "indigo" | "emerald" | "amber" | "rose";
}

interface ApplicationWorkbenchTabsProps {
  initialTab?: string;
  overviewSlot: React.ReactNode;
  prepReviewSlot?: React.ReactNode;
  submissionSlot: React.ReactNode;
  activitySlot?: React.ReactNode;
  // Legacy slot fallbacks for backward compatibility
  materialsSlot?: React.ReactNode;
  interviewsSlot?: React.ReactNode;
  timelineSlot?: React.ReactNode;
  roundsCount?: number;
  submissionsCount?: number;
  status?: string;
}

export function ApplicationWorkbenchTabs({
  initialTab = "overview",
  overviewSlot,
  prepReviewSlot,
  submissionSlot,
  activitySlot,
  materialsSlot,
  interviewsSlot,
  timelineSlot,
  roundsCount = 0,
  submissionsCount = 0,
  status,
}: ApplicationWorkbenchTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Normalize legacy tab IDs to the 4 streamlined tabs
  function normalizeTab(rawTab?: string | null): string {
    if (!rawTab) return "overview";
    if (rawTab === "materials" || rawTab === "prep_review") return "prep_review";
    if (rawTab === "submission") return "submission";
    if (rawTab === "interviews" || rawTab === "timeline" || rawTab === "activity") return "activity";
    return "overview";
  }

  const rawParam = searchParams.get("tab");
  const [internalTab, setInternalTab] = useState<string>(normalizeTab(initialTab));
  const activeTab = rawParam ? normalizeTab(rawParam) : internalTab;

  function handleSelectTab(tabId: string) {
    setInternalTab(tabId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const tabs: TabConfig[] = [
    {
      id: "overview",
      label: "Overview",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      ),
    },
    {
      id: "prep_review",
      label: "Preparation & Review",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      badge:
        status === "REVIEW"
          ? "QA Pending"
          : status === "PREPARING"
          ? "Tailoring"
          : status === "AWAITING_APPROVAL"
          ? "Sign-off"
          : undefined,
      badgeColor: status === "REVIEW" ? "amber" : "indigo",
    },
    {
      id: "submission",
      label: "Submission Desk",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      ),
      badge: status === "READY" ? "Ready" : submissionsCount > 0 ? `${submissionsCount}` : undefined,
      badgeColor: status === "READY" ? "sky" : "default",
    },
    {
      id: "activity",
      label: "Activity & Outcomes",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      badge: roundsCount > 0 ? `${roundsCount} ${roundsCount === 1 ? "Round" : "Rounds"}` : undefined,
      badgeColor: roundsCount > 0 ? "emerald" : "default",
    },
  ];

  // Resolve content slot for Preparation & Review
  const resolvedPrepReviewContent = prepReviewSlot || materialsSlot;

  // Resolve content slot for Activity & Outcomes
  const resolvedActivityContent =
    activitySlot || (
      <div className="space-y-6">
        {interviewsSlot}
        {timelineSlot}
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Streamlined Workbench Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs px-3 pt-2 pb-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-px outline-none ${
                  isActive
                    ? "border-slate-900 text-slate-950 bg-slate-50/80 rounded-t-lg"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <span className={isActive ? "text-slate-900" : "text-slate-400"} aria-hidden="true">
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      tab.badgeColor === "emerald"
                        ? "bg-emerald-100 text-emerald-800"
                        : tab.badgeColor === "sky"
                        ? "bg-sky-100 text-sky-800"
                        : tab.badgeColor === "amber"
                        ? "bg-amber-100 text-amber-900"
                        : tab.badgeColor === "indigo"
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 Focused Workspace Panels */}
      <div className="transition-opacity duration-200">
        {activeTab === "overview" && <div>{overviewSlot}</div>}
        {activeTab === "prep_review" && <div>{resolvedPrepReviewContent}</div>}
        {activeTab === "submission" && <div>{submissionSlot}</div>}
        {activeTab === "activity" && <div>{resolvedActivityContent}</div>}
      </div>
    </div>
  );
}
