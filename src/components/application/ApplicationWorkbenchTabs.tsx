"use client";

import React, { useState, useEffect } from "react";
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
  materialsSlot: React.ReactNode;
  submissionSlot: React.ReactNode;
  interviewsSlot: React.ReactNode;
  timelineSlot: React.ReactNode;
  roundsCount?: number;
  submissionsCount?: number;
  status?: string;
}

export function ApplicationWorkbenchTabs({
  initialTab = "overview",
  overviewSlot,
  materialsSlot,
  submissionSlot,
  interviewsSlot,
  timelineSlot,
  roundsCount = 0,
  submissionsCount = 0,
  status,
}: ApplicationWorkbenchTabsProps) {
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

  const tabs: TabConfig[] = [
    {
      id: "overview",
      label: "Overview & Context",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      ),
    },
    {
      id: "materials",
      label: "Materials & QA Gate",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      badge: status === "REVIEW" ? "QA Action" : status === "PREPARING" ? "Staging" : undefined,
      badgeColor: status === "REVIEW" ? "amber" : "indigo",
    },
    {
      id: "submission",
      label: "Submission Desk",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      ),
      badge: status === "READY" ? "Ready" : submissionsCount > 0 ? `${submissionsCount}` : undefined,
      badgeColor: status === "READY" ? "sky" : "default",
    },
    {
      id: "interviews",
      label: "Interviews & Outcomes",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      badge: roundsCount > 0 ? `${roundsCount} ${roundsCount === 1 ? "Round" : "Rounds"}` : undefined,
      badgeColor: roundsCount > 0 ? "emerald" : "default",
    },
    {
      id: "timeline",
      label: "Timeline & Governance",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Workbench Navigation Header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs px-3 pt-3 pb-0">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 px-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Operational Workspace
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Select a workspace tab to manage application lifecycle stages
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
                className={`flex items-center gap-2.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-px outline-none ${
                  isActive
                    ? "border-slate-900 text-slate-950 bg-slate-50/70 rounded-t-lg"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <span className={isActive ? "text-slate-900" : "text-slate-400"}>
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

      {/* Tab Panels */}
      <div className="transition-opacity duration-200">
        {activeTab === "overview" && <div>{overviewSlot}</div>}
        {activeTab === "materials" && <div>{materialsSlot}</div>}
        {activeTab === "submission" && <div>{submissionSlot}</div>}
        {activeTab === "interviews" && <div>{interviewsSlot}</div>}
        {activeTab === "timeline" && <div>{timelineSlot}</div>}
      </div>
    </div>
  );
}
