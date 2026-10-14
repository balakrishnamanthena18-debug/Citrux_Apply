"use client";

import React, { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export interface CandidateTabConfig {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  badgeColor?: "default" | "sky" | "indigo" | "emerald" | "amber" | "rose";
}

interface CandidateWorkbenchTabsProps {
  initialTab?: string;
  roleOverviewSlot: React.ReactNode;
  materialsSlot: React.ReactNode;
  interviewsSlot: React.ReactNode;
  timelineSlot: React.ReactNode;
  roundsCount?: number;
  submissionsCount?: number;
  hasActionRequired?: boolean;
  status?: string;
}

export function CandidateWorkbenchTabs({
  initialTab = "overview",
  roleOverviewSlot,
  materialsSlot,
  interviewsSlot,
  timelineSlot,
  roundsCount = 0,
  submissionsCount = 0,
  hasActionRequired = false,
  status,
}: CandidateWorkbenchTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab");
  const [internalTab, setInternalTab] = useState<string>(initialTab);
  const activeTab = tabParam || internalTab;

  function handleSelectTab(tabId: string) {
    setInternalTab(tabId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const tabs: CandidateTabConfig[] = [
    {
      id: "overview",
      label: "Role & Overview",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      id: "materials",
      label: "Materials & Tailoring",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
      badge: hasActionRequired
        ? "Action Needed"
        : status === "PREPARING"
        ? "In Prep"
        : undefined,
      badgeColor: hasActionRequired ? "amber" : "indigo",
    },
    {
      id: "interviews",
      label: "Interviews & Outcomes",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      badge:
        roundsCount > 0
          ? `${roundsCount} ${roundsCount === 1 ? "Round" : "Rounds"}`
          : undefined,
      badgeColor: roundsCount > 0 ? "emerald" : "default",
    },
    {
      id: "timeline",
      label: "Evidence & Milestones",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
      badge: submissionsCount > 0 ? "Verified" : undefined,
      badgeColor: submissionsCount > 0 ? "sky" : "default",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Workbench Navigation Header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs px-3 pt-3 pb-0">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 px-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Application Details & Materials
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Switch tabs to view role specifications, custom materials, interviews, or timeline
          </span>
        </div>

        {/* Tab Buttons Strip */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pt-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-px outline-none cursor-pointer ${
                  isActive
                    ? "border-indigo-600 text-indigo-950 bg-indigo-50/40 rounded-t-lg"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <span className={isActive ? "text-indigo-600" : "text-slate-400"}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                      tab.badgeColor === "emerald"
                        ? "bg-emerald-100 text-emerald-800"
                        : tab.badgeColor === "sky"
                        ? "bg-sky-100 text-sky-800"
                        : tab.badgeColor === "amber"
                        ? "bg-amber-100 text-amber-900 animate-pulse"
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

      {/* Tab Panels */}
      <div className="transition-opacity duration-200">
        {activeTab === "overview" && <div>{roleOverviewSlot}</div>}
        {activeTab === "materials" && <div>{materialsSlot}</div>}
        {activeTab === "interviews" && <div>{interviewsSlot}</div>}
        {activeTab === "timeline" && <div>{timelineSlot}</div>}
      </div>
    </div>
  );
}
