"use client";

import React, { useState, useMemo } from "react";
import { TransitionLink } from "@/components/ui/TransitionLink";
import type { ApplicationStatus } from "@/generated/prisma";
import {
  ApplicationFilterTab,
  FILTER_TAB_STATES,
  getCandidateStatusPresentation,
  formatSalary,
  getCandidateActionRequirement,
} from "@/lib/utils/status-presenter";
import { InstantTabs, TabItem } from "@/components/workbench/InstantTabs";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { TablePagination } from "@/components/workbench/TablePagination";
import { syncUrlParams } from "@/lib/client/urlSync";

export interface CandidateApplicationItem {
  id: string;
  status: ApplicationStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  job: {
    id: string;
    title: string;
    companyName: string;
    location?: string | null;
    isRemote?: boolean;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
  };
  submissions: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: string | Date;
  }>;
}

interface Props {
  applications: CandidateApplicationItem[];
  initialTab?: string;
}

export function CandidateApplicationsWorkbench({
  applications,
  initialTab = "ALL",
}: Props) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Compute live counts over candidate's authorized application records in memory (<1ms)
  const counts = useMemo(() => {
    return {
      ALL: applications.length,
      AWAITING_ACTION: applications.filter((a) => a.status === "AWAITING_APPROVAL").length,
      IN_PROGRESS: applications.filter((a) => FILTER_TAB_STATES.IN_PROGRESS.includes(a.status)).length,
      SUBMITTED: applications.filter((a) => a.status === "SUBMITTED").length,
      HISTORY: applications.filter((a) => FILTER_TAB_STATES.HISTORY.includes(a.status)).length,
    };
  }, [applications]);

  const tabs: TabItem[] = useMemo(
    () => [
      { key: "ALL", label: "All Applications", count: counts.ALL },
      { key: "AWAITING_ACTION", label: "Action Required", count: counts.AWAITING_ACTION, highlight: true },
      { key: "IN_PROGRESS", label: "In Progress", count: counts.IN_PROGRESS },
      { key: "SUBMITTED", label: "Submitted", count: counts.SUBMITTED },
      { key: "HISTORY", label: "Closed / History", count: counts.HISTORY },
    ],
    [counts]
  );

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    setPage(1);
    syncUrlParams({ tab: newTab === "ALL" ? null : newTab });
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPage(1);
  };

  // Instant pure in-memory filtering (<2ms)
  const filteredApps = useMemo(() => {
    let result = applications;

    const currentFilterTab = (activeTab as ApplicationFilterTab) || "ALL";
    const targetStatuses = FILTER_TAB_STATES[currentFilterTab] || FILTER_TAB_STATES.ALL;
    result = result.filter((a) => targetStatuses.includes(a.status));

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((a) => {
        const title = a.job.title.toLowerCase();
        const company = a.job.companyName.toLowerCase();
        const loc = (a.job.location || "").toLowerCase();
        return title.includes(q) || company.includes(q) || loc.includes(q);
      });
    }

    return result;
  }, [applications, activeTab, searchTerm]);

  const totalPages = Math.ceil(filteredApps.length / pageSize) || 1;
  const paginatedApps = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredApps.slice(start, start + pageSize);
  }, [filteredApps, page, pageSize]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F1720]">My Applications</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Authoritative visibility and transparent status for every job opportunity managed on your behalf.
          </p>
        </div>
      </div>

      {/* Top Metric Strip with Instant Local State */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => handleTabChange("ALL")}
          className={`p-3.5 rounded-[16px] border shadow-2xs transition-all text-left cursor-pointer ${
            activeTab === "ALL"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white border-[#E5EAE7] hover:border-[#DDE5E0]"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${activeTab === "ALL" ? "text-slate-300" : "text-[#64748B]"}`}>
            Total Applications
          </div>
          <div className={`text-xl font-bold mt-1 ${activeTab === "ALL" ? "text-white" : "text-[#0F1720]"}`}>
            {counts.ALL}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("SUBMITTED")}
          className={`p-3.5 rounded-[16px] border shadow-2xs transition-all text-left cursor-pointer ${
            activeTab === "SUBMITTED"
              ? "bg-emerald-700 text-white border-emerald-700"
              : "bg-white border-[#E5EAE7] hover:border-emerald-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${activeTab === "SUBMITTED" ? "text-emerald-100" : "text-emerald-700"}`}>
            Submitted
          </div>
          <div className={`text-xl font-bold mt-1 ${activeTab === "SUBMITTED" ? "text-white" : "text-emerald-950"}`}>
            {counts.SUBMITTED}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("IN_PROGRESS")}
          className={`p-3.5 rounded-[16px] border shadow-2xs transition-all text-left cursor-pointer ${
            activeTab === "IN_PROGRESS"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white border-[#E5EAE7] hover:border-blue-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${activeTab === "IN_PROGRESS" ? "text-blue-100" : "text-blue-700"}`}>
            In Progress
          </div>
          <div className={`text-xl font-bold mt-1 ${activeTab === "IN_PROGRESS" ? "text-white" : "text-blue-950"}`}>
            {counts.IN_PROGRESS}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("AWAITING_ACTION")}
          className={`p-3.5 rounded-[16px] border shadow-2xs transition-all text-left cursor-pointer ${
            activeTab === "AWAITING_ACTION"
              ? "bg-amber-600 text-white border-amber-600"
              : "bg-white border-[#E5EAE7] hover:border-amber-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${activeTab === "AWAITING_ACTION" ? "text-amber-100" : "text-amber-700"}`}>
            Awaiting My Action
          </div>
          <div className={`text-xl font-bold mt-1 ${activeTab === "AWAITING_ACTION" ? "text-white" : "text-amber-950"}`}>
            {counts.AWAITING_ACTION}
          </div>
        </button>
      </div>

      {/* Instant 0ms Tab Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <InstantTabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} className="border-b-0 pb-0" />
        <div className="w-64">
          <InstantSearch
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search role, company..."
          />
        </div>
      </div>

      {/* Applications List */}
      <div className="bg-white rounded-[16px] border border-[#E5EAE7] shadow-2xs overflow-hidden">
        {filteredApps.length === 0 ? (
          <div className="p-12 text-center text-[#64748B]">
            <div className="text-3xl mb-2">📋</div>
            <h3 className="text-sm font-semibold text-[#0F1720]">No applications in this view</h3>
            <p className="text-xs text-[#94A3B8] mt-1">
              Opportunities matching your profile and preferences will appear here as they are discovered and prepared.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EDF1EF]">
            {paginatedApps.map((app) => {
              const presentation = getCandidateStatusPresentation(app.status);
              const actionReq = getCandidateActionRequirement(app.status);
              const salaryText = formatSalary(app.job.salaryMin, app.job.salaryMax, app.job.salaryCurrency);
              const latestSub = app.submissions[0];

              return (
                <div
                  key={app.id}
                  className="p-5 hover:bg-[#F7F9F8]/75 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${presentation.badgeClass}`}>
                        {presentation.label}
                      </span>

                      {actionReq.isActionRequired && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                          ⚠️ {actionReq.actionText}
                        </span>
                      )}

                      <span className="text-xs text-[#94A3B8]">
                        Updated {new Date(app.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-[#0F1720]">
                      <TransitionLink href={`/candidate/applications/${app.id}`} className="hover:text-blue-600 transition">
                        {app.job.title}
                      </TransitionLink>
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-[#64748B] flex-wrap">
                      <span className="font-semibold text-[#0F1720]">{app.job.companyName}</span>
                      <span>•</span>
                      <span>{app.job.isRemote ? "🌐 Remote" : app.job.location || "On-site"}</span>
                      <span>•</span>
                      <span className={salaryText === "Salary not disclosed" ? "text-[#94A3B8]" : "text-emerald-700 font-semibold"}>
                        {salaryText}
                      </span>
                    </div>

                    <p className="text-xs text-[#64748B]">{presentation.description}</p>

                    {app.status === "SUBMITTED" && latestSub && (
                      <div className="text-[11px] text-emerald-800 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded inline-block">
                        ✓ Submitted on {new Date(latestSub.submittedAt).toLocaleDateString()} (Attempt #{latestSub.attemptNumber})
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <TransitionLink
                      href={`/candidate/applications/${app.id}`}
                      className={`px-4 py-2 rounded-md text-xs font-semibold shadow-2xs transition inline-flex items-center gap-1 ${
                        actionReq.isActionRequired
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                      }`}
                    >
                      {actionReq.isActionRequired ? "Review & Sign-Off →" : "View Application →"}
                    </TransitionLink>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredApps.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
