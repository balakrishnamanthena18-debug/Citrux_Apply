"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { TransitionLink } from "@/components/ui/TransitionLink";
import type { ApplicationStatus } from "@/generated/prisma";
import {
  ApplicationFilterTab,
  FILTER_TAB_STATES,
  getCandidateStatusPresentation,
  formatSalary,
  getCandidateActionRequirement,
} from "@/lib/utils/status-presenter";
import {
  formatApplicationCardDate,
} from "@/lib/utils/format-application-date";
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
  const [remoteOnly, setRemoteOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"updated" | "company" | "title">("updated");
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!isFilterOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterOpen]);

  // Compute live counts over authorized application records (<1ms)
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
      {
        key: "AWAITING_ACTION",
        label: "Action Required",
        count: counts.AWAITING_ACTION,
        highlight: counts.AWAITING_ACTION > 0,
      },
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

  // Instant in-memory filtering and sorting (<2ms)
  const filteredApps = useMemo(() => {
    let result = applications;

    const currentFilterTab = (activeTab as ApplicationFilterTab) || "ALL";
    const targetStatuses = FILTER_TAB_STATES[currentFilterTab] || FILTER_TAB_STATES.ALL;
    result = result.filter((a) => targetStatuses.includes(a.status));

    if (remoteOnly) {
      result = result.filter((a) => a.job.isRemote);
    }

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((a) => {
        const title = a.job.title.toLowerCase();
        const company = a.job.companyName.toLowerCase();
        const loc = (a.job.location || "").toLowerCase();
        const appId = a.id.toLowerCase();
        const shortAppId = a.id.slice(0, 8).toLowerCase();
        return (
          title.includes(q) ||
          company.includes(q) ||
          loc.includes(q) ||
          appId.includes(q) ||
          shortAppId.includes(q)
        );
      });
    }

    // Sort order
    result = [...result].sort((a, b) => {
      if (sortBy === "company") {
        return a.job.companyName.localeCompare(b.job.companyName);
      }
      if (sortBy === "title") {
        return a.job.title.localeCompare(b.job.title);
      }
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return timeB - timeA;
    });

    return result;
  }, [applications, activeTab, searchTerm, remoteOnly, sortBy]);

  const totalPages = Math.ceil(filteredApps.length / pageSize) || 1;
  const paginatedApps = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredApps.slice(start, start + pageSize);
  }, [filteredApps, page, pageSize]);

  const hasActiveFilters = remoteOnly || sortBy !== "updated" || searchTerm.trim().length > 0;

  const resetFilters = () => {
    setRemoteOnly(false);
    setSortBy("updated");
    setSearchTerm("");
    setActiveTab("ALL");
    setPage(1);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#E5EAE7] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F1720]">My Applications</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Authoritative visibility and transparent status for every job opportunity managed on your behalf.
          </p>
        </div>
      </div>

      {/* Summary Metric Cards (Operational Decision Strip) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* TOTAL APPLICATIONS */}
        <button
          type="button"
          onClick={() => handleTabChange("ALL")}
          className={`p-4 rounded-[14px] border shadow-2xs transition-all text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
            activeTab === "ALL"
              ? "bg-slate-900 text-white border-slate-900 ring-1 ring-slate-900"
              : "bg-white border-[#E5EAE7] hover:border-slate-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${activeTab === "ALL" ? "text-slate-300" : "text-[#64748B]"}`}>
            Total Applications
          </div>
          <div className={`text-2xl font-bold mt-1.5 ${activeTab === "ALL" ? "text-white" : "text-[#0F1720]"}`}>
            {counts.ALL}
          </div>
          <div className={`text-[11px] mt-1 ${activeTab === "ALL" ? "text-slate-300" : "text-[#94A3B8]"}`}>
            Managed opportunities
          </div>
        </button>

        {/* SUBMITTED */}
        <button
          type="button"
          onClick={() => handleTabChange("SUBMITTED")}
          className={`p-4 rounded-[14px] border shadow-2xs transition-all text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
            activeTab === "SUBMITTED"
              ? "bg-emerald-800 text-white border-emerald-800 ring-1 ring-emerald-800"
              : "bg-white border-[#E5EAE7] hover:border-emerald-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${activeTab === "SUBMITTED" ? "text-emerald-100" : "text-emerald-800"}`}>
            Submitted
          </div>
          <div className={`text-2xl font-bold mt-1.5 ${activeTab === "SUBMITTED" ? "text-white" : "text-emerald-950"}`}>
            {counts.SUBMITTED}
          </div>
          <div className={`text-[11px] mt-1 ${activeTab === "SUBMITTED" ? "text-emerald-100" : "text-[#94A3B8]"}`}>
            Confirmed with employers
          </div>
        </button>

        {/* IN PROGRESS */}
        <button
          type="button"
          onClick={() => handleTabChange("IN_PROGRESS")}
          className={`p-4 rounded-[14px] border shadow-2xs transition-all text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            activeTab === "IN_PROGRESS"
              ? "bg-blue-700 text-white border-blue-700 ring-1 ring-blue-700"
              : "bg-white border-[#E5EAE7] hover:border-blue-300"
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${activeTab === "IN_PROGRESS" ? "text-blue-100" : "text-blue-800"}`}>
            In Progress
          </div>
          <div className={`text-2xl font-bold mt-1.5 ${activeTab === "IN_PROGRESS" ? "text-white" : "text-blue-950"}`}>
            {counts.IN_PROGRESS}
          </div>
          <div className={`text-[11px] mt-1 ${activeTab === "IN_PROGRESS" ? "text-blue-100" : "text-[#94A3B8]"}`}>
            Active preparation & QA
          </div>
        </button>

        {/* AWAITING MY ACTION (Operational Exception Signal) */}
        <button
          type="button"
          onClick={() => handleTabChange("AWAITING_ACTION")}
          className={`p-4 rounded-[14px] border shadow-2xs transition-all text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
            activeTab === "AWAITING_ACTION"
              ? "bg-amber-700 text-white border-amber-700 ring-1 ring-amber-700"
              : counts.AWAITING_ACTION > 0
              ? "bg-amber-50/70 border-amber-300 hover:border-amber-400"
              : "bg-white border-[#E5EAE7] hover:border-slate-300"
          }`}
        >
          <div
            className={`text-[11px] font-semibold uppercase tracking-wider ${
              activeTab === "AWAITING_ACTION"
                ? "text-amber-100"
                : counts.AWAITING_ACTION > 0
                ? "text-amber-900"
                : "text-[#64748B]"
            }`}
          >
            Awaiting My Action
          </div>
          <div
            className={`text-2xl font-bold mt-1.5 ${
              activeTab === "AWAITING_ACTION"
                ? "text-white"
                : counts.AWAITING_ACTION > 0
                ? "text-amber-950"
                : "text-[#0F1720]"
            }`}
          >
            {counts.AWAITING_ACTION}
          </div>
          <div className="mt-1">
            {counts.AWAITING_ACTION > 0 ? (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  activeTab === "AWAITING_ACTION"
                    ? "bg-amber-800 text-amber-100"
                    : "bg-amber-200/80 text-amber-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                Action required
              </span>
            ) : (
              <span className="text-[11px] text-[#94A3B8]">All items up to date</span>
            )}
          </div>
        </button>
      </div>

      {/* Filter Bar & Search Affordance */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <InstantTabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} className="border-b-0 pb-0" />

        <div className="flex items-center gap-2">
          {/* Compact Filter Menu */}
          <div className="relative" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              aria-expanded={isFilterOpen}
              aria-label="Filter and Sort options"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                remoteOnly || sortBy !== "updated"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-[#64748B] border-[#DDE5E0] hover:border-slate-400 hover:text-[#0F1720]"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              <span>Filter</span>
              {(remoteOnly || sortBy !== "updated") && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white border border-[#E5EAE7] rounded-xl shadow-lg p-3 z-30 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Location Type
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remoteOnly}
                      onChange={(e) => setRemoteOnly(e.target.checked)}
                      className="rounded text-slate-900 focus:ring-slate-900"
                    />
                    <span>🌐 Remote positions only</span>
                  </label>
                </div>

                <div className="border-t border-slate-100 pt-2.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Sort Order
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full text-xs rounded-lg border border-[#DDE5E0] bg-white px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="updated">Recently Updated</option>
                    <option value="company">Company (A–Z)</option>
                    <option value="title">Role Title (A–Z)</option>
                  </select>
                </div>

                {hasActiveFilters && (
                  <div className="border-t border-slate-100 pt-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setRemoteOnly(false);
                        setSortBy("updated");
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                    >
                      Reset Quick Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="w-64">
            <InstantSearch
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search role, company, ID..."
            />
          </div>
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
          <span className="font-semibold text-slate-500">Active filters:</span>
          {searchTerm && (
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200 text-xs">
              Query: &quot;{searchTerm}&quot;
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="hover:text-slate-900 ml-0.5 cursor-pointer"
                aria-label="Remove search filter"
              >
                ✕
              </button>
            </span>
          )}
          {remoteOnly && (
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200 text-xs">
              Remote only
              <button
                type="button"
                onClick={() => setRemoteOnly(false)}
                className="hover:text-slate-900 ml-0.5 cursor-pointer"
                aria-label="Remove remote only filter"
              >
                ✕
              </button>
            </span>
          )}
          {sortBy !== "updated" && (
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200 text-xs">
              Sort: {sortBy === "company" ? "Company (A-Z)" : "Role Title (A-Z)"}
              <button
                type="button"
                onClick={() => setSortBy("updated")}
                className="hover:text-slate-900 ml-0.5 cursor-pointer"
                aria-label="Reset sort order"
              >
                ✕
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Applications Operations Roster */}
      <div className="bg-white rounded-[16px] border border-[#E5EAE7] shadow-2xs overflow-hidden">
        {filteredApps.length === 0 ? (
          <div className="p-12 text-center text-[#64748B]">
            <div className="text-3xl mb-2">📋</div>
            <h3 className="text-sm font-semibold text-[#0F1720]">
              {hasActiveFilters ? "No applications match your filter" : "No applications in this view"}
            </h3>
            <p className="text-xs text-[#94A3B8] mt-1 max-w-md mx-auto">
              {hasActiveFilters
                ? "Try adjusting your search keywords, location filters, or active status tab."
                : "Opportunities matching your profile and preferences will appear here as they are discovered and prepared."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-block bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                Clear Filters
              </button>
            ) : (
              <TransitionLink
                href="/candidate/jobs"
                className="mt-4 inline-block bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-slate-800 transition"
              >
                Explore Job Intelligence →
              </TransitionLink>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#EDF1EF]">
            {paginatedApps.map((app) => {
              const presentation = getCandidateStatusPresentation(app.status);
              const actionReq = getCandidateActionRequirement(app.status);
              const salaryText = formatSalary(app.job.salaryMin, app.job.salaryMax, app.job.salaryCurrency);
              const latestSub = app.submissions[0];
              const updatedDateText = formatApplicationCardDate(app.updatedAt, { year: false });
              const exactDate = formatApplicationCardDate(app.updatedAt);
              const shortId = app.id.slice(0, 8);

              return (
                <div
                  key={app.id}
                  className={`p-5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${
                    actionReq.isActionRequired
                      ? "bg-amber-50/30 hover:bg-amber-50/60"
                      : "hover:bg-[#F8FAFC]"
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {/* Status & Timestamp Header */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${presentation.badgeClass}`}>
                        {presentation.label}
                      </span>

                      {actionReq.isActionRequired && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                          {actionReq.actionText}
                        </span>
                      )}

                      <span className="text-xs text-[#94A3B8]" title={`Updated on ${exactDate}`}>
                        Updated {updatedDateText}
                      </span>

                      <span className="text-[11px] font-mono text-slate-400 select-all" title={`Application ID: ${app.id}`}>
                        #{shortId}
                      </span>
                    </div>

                    {/* Role Title */}
                    <h2 className="text-base font-semibold text-[#0F1720]">
                      <TransitionLink
                        href={`/candidate/applications/${app.id}`}
                        className="hover:text-blue-600 transition-colors focus:outline-none focus-visible:underline"
                      >
                        {app.job.title}
                      </TransitionLink>
                    </h2>

                    {/* Metadata Strip */}
                    <div className="flex items-center gap-2 text-xs text-[#64748B] flex-wrap">
                      <span className="font-semibold text-[#0F1720]">{app.job.companyName}</span>
                      <span>•</span>
                      <span>{app.job.isRemote ? "🌐 Remote" : app.job.location || "On-site"}</span>
                      <span>•</span>
                      <span className={salaryText === "Salary not disclosed" ? "text-[#94A3B8]" : "text-emerald-700 font-semibold"}>
                        {salaryText}
                      </span>
                    </div>

                    {/* Operational Description */}
                    <p className="text-xs text-[#64748B] leading-relaxed">{presentation.description}</p>

                    {/* Verified Submission Evidence Badge */}
                    {app.status === "SUBMITTED" && latestSub && (
                      <div className="text-[11px] text-emerald-800 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded inline-block">
                        ✓ Submitted on {formatApplicationCardDate(latestSub.submittedAt)} (Attempt #{latestSub.attemptNumber})
                      </div>
                    )}
                  </div>

                  {/* Primary Action Button */}
                  <div className="shrink-0 flex items-center gap-2 pt-2 sm:pt-0">
                    <TransitionLink
                      href={`/candidate/applications/${app.id}`}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 ${
                        actionReq.isActionRequired
                          ? "bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-600"
                          : "bg-slate-900 hover:bg-slate-800 text-white focus-visible:ring-slate-900"
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
