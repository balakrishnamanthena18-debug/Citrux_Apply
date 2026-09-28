"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { ApplicationStatus } from "@/generated/prisma";
import { formatSalary } from "@/lib/utils/status-presenter";
import { InstantTabs, TabItem } from "@/components/workbench/InstantTabs";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { InstantFilterBar, FilterDropdownConfig } from "@/components/workbench/InstantFilterBar";
import { TablePagination } from "@/components/workbench/TablePagination";
import { PendingButton } from "@/components/ui/PendingButton";
import { createApplicationAction } from "@/lib/application/actions";
import { syncUrlParams } from "@/lib/client/urlSync";

export interface ApplicationItem {
  id: string;
  status: ApplicationStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  assignedEmployeeId?: string | null;
  assignedEmployee?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
  candidateId: string;
  candidate: {
    id: string;
    applicationAuthorizationMode: string;
    user: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    };
  };
  jobId: string;
  job: {
    id: string;
    title: string;
    companyName: string;
    location?: string | null;
    isRemote?: boolean;
    source?: string | null;
    externalUrl?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
  };
  submissions: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: string | Date;
    submittedBy?: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    } | null;
  }>;
  stateHistory: Array<{
    id: string;
    toStatus: string;
    createdAt: string | Date;
    changedBy?: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    } | null;
  }>;
}

export interface CandidateOption {
  id: string;
  name: string;
  email: string;
  status: string;
}

export interface JobOption {
  id: string;
  title: string;
  companyName: string;
  source?: string | null;
}

interface Props {
  currentUserId: string;
  applications: ApplicationItem[];
  candidates: CandidateOption[];
  jobs: JobOption[];
  sources: string[];
  initialQueue?: string;
  initialStatus?: string;
  initialCandidateId?: string;
  initialSource?: string;
  initialSort?: string;
  initialSearch?: string;
}

const STATUS_BADGES: Record<string, string> = {
  DISCOVERED: "bg-slate-100 text-slate-700 border-slate-200",
  QUALIFIED: "bg-blue-50 text-blue-700 border-blue-200",
  PREPARING: "bg-indigo-50 text-indigo-700 border-indigo-200",
  REVIEW: "bg-purple-50 text-purple-700 border-purple-200",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-300 font-semibold",
  READY: "bg-sky-100 text-sky-900 border-sky-300 font-bold",
  SUBMITTED: "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold",
  SUBMISSION_ISSUE: "bg-rose-100 text-rose-800 border-rose-300 font-bold",
  REVIEW_REQUIRED: "bg-rose-100 text-rose-800 border-rose-300 font-bold",
  CORRECTION_APPROVED: "bg-purple-100 text-purple-800 border-purple-200 font-semibold",
  RESUBMISSION: "bg-purple-100 text-purple-800 border-purple-200 font-semibold",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  WITHDRAWN: "bg-slate-100 text-slate-800 border-slate-200",
  FAILED: "bg-rose-100 text-rose-900 border-rose-300",
};

export function EmployeeApplicationsWorkbench({
  currentUserId,
  applications,
  candidates,
  jobs,
  sources,
  initialQueue = "all",
  initialStatus = "",
  initialCandidateId = "",
  initialSource = "",
  initialSort = "newest",
  initialSearch = "",
}: Props) {
  const [queue, setQueue] = useState<string>(initialQueue);
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [candidateFilter, setCandidateFilter] = useState<string>(initialCandidateId);
  const [sourceFilter, setSourceFilter] = useState<string>(initialSource);
  const [sortBy, setSortBy] = useState<string>(initialSort);
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  // Compute live queue counts over authoritative application records in memory (<1ms)
  const queueCounts = useMemo(() => {
    const total = applications.length;
    let mine = 0;
    let ready = 0;
    let inProgress = 0;
    let submitted = 0;
    let needsAttention = 0;

    for (const app of applications) {
      if (app.assignedEmployeeId === currentUserId) mine++;
      if (app.status === "READY") ready++;
      if (["DISCOVERED", "QUALIFIED", "PREPARING", "REVIEW"].includes(app.status)) inProgress++;
      if (app.status === "SUBMITTED") submitted++;
      if (["AWAITING_APPROVAL", "SUBMISSION_ISSUE", "REVIEW_REQUIRED", "CORRECTION_APPROVED", "RESUBMISSION", "FAILED"].includes(app.status)) {
        needsAttention++;
      }
    }

    return { total, mine, ready, inProgress, submitted, needsAttention };
  }, [applications, currentUserId]);

  const tabs: TabItem[] = useMemo(
    () => [
      { key: "all", label: "All Applications", count: queueCounts.total },
      { key: "mine", label: "My Work", count: queueCounts.mine },
      { key: "ready", label: "Ready to Apply", count: queueCounts.ready, highlight: true },
      { key: "in_progress", label: "Applying / In Progress", count: queueCounts.inProgress },
      { key: "submitted", label: "Submitted", count: queueCounts.submitted },
      { key: "needs_attention", label: "Needs Attention", count: queueCounts.needsAttention },
    ],
    [queueCounts]
  );

  const handleQueueChange = (newQueue: string) => {
    setQueue(newQueue);
    setPage(1);
    syncUrlParams({ queue: newQueue === "all" ? null : newQueue });
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPage(1);
    syncUrlParams({ search: term ? term : null });
  };

  const handleFilterChange = (key: string, value: string) => {
    setPage(1);
    if (key === "status") {
      setStatusFilter(value);
      syncUrlParams({ status: value || null });
    } else if (key === "candidateId") {
      setCandidateFilter(value);
      syncUrlParams({ candidateId: value || null });
    } else if (key === "source") {
      setSourceFilter(value);
      syncUrlParams({ source: value || null });
    } else if (key === "sort") {
      setSortBy(value);
      syncUrlParams({ sort: value === "newest" ? null : value });
    }
  };

  const handleClearAll = () => {
    setSearchTerm("");
    setStatusFilter("");
    setCandidateFilter("");
    setSourceFilter("");
    setSortBy("newest");
    setQueue("all");
    setPage(1);
    syncUrlParams({
      queue: null,
      search: null,
      status: null,
      candidateId: null,
      source: null,
      sort: null,
    });
  };

  // Instant pure in-memory filtering & sorting (<5ms for 500+ records)
  const filteredApplications = useMemo(() => {
    let result = applications;

    // 1. Queue Partition Filter
    if (queue === "mine") {
      result = result.filter((a) => a.assignedEmployeeId === currentUserId);
    } else if (queue === "ready") {
      result = result.filter((a) => a.status === "READY");
    } else if (queue === "in_progress") {
      result = result.filter((a) =>
        ["DISCOVERED", "QUALIFIED", "PREPARING", "REVIEW"].includes(a.status)
      );
    } else if (queue === "submitted") {
      result = result.filter((a) => a.status === "SUBMITTED");
    } else if (queue === "needs_attention") {
      result = result.filter((a) =>
        ["AWAITING_APPROVAL", "SUBMISSION_ISSUE", "REVIEW_REQUIRED", "CORRECTION_APPROVED", "RESUBMISSION", "FAILED"].includes(a.status)
      );
    }

    // 2. Status Dropdown Filter
    if (statusFilter) {
      result = result.filter((a) => a.status === statusFilter);
    }

    // 3. Candidate Filter
    if (candidateFilter) {
      result = result.filter((a) => a.candidateId === candidateFilter);
    }

    // 4. Source Filter
    if (sourceFilter) {
      result = result.filter((a) => a.job?.source === sourceFilter);
    }

    // 5. Search Filter
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((app) => {
        const candFirst = app.candidate?.user?.firstName || "";
        const candLast = app.candidate?.user?.lastName || "";
        const candEmail = app.candidate?.user?.email || "";
        const title = app.job?.title || "";
        const company = app.job?.companyName || "";
        const source = app.job?.source || "";
        const loc = app.job?.location || "";

        return (
          `${candFirst} ${candLast}`.toLowerCase().includes(q) ||
          candEmail.toLowerCase().includes(q) ||
          title.toLowerCase().includes(q) ||
          company.toLowerCase().includes(q) ||
          source.toLowerCase().includes(q) ||
          loc.toLowerCase().includes(q)
        );
      });
    }

    // 6. In-Memory Sorting
    return [...result].sort((a, b) => {
      if (sortBy === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === "updated") {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      } else if (sortBy === "company") {
        return (a.job?.companyName || "").localeCompare(b.job?.companyName || "");
      } else if (sortBy === "candidate") {
        const nameA = `${a.candidate?.user?.lastName || ""} ${a.candidate?.user?.firstName || ""}`;
        const nameB = `${b.candidate?.user?.lastName || ""} ${b.candidate?.user?.firstName || ""}`;
        return nameA.localeCompare(nameB);
      }
      // default "newest"
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [
    applications,
    queue,
    currentUserId,
    statusFilter,
    candidateFilter,
    sourceFilter,
    searchTerm,
    sortBy,
  ]);

  const totalPages = Math.ceil(filteredApplications.length / pageSize) || 1;
  const paginatedApps = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredApplications.slice(start, start + pageSize);
  }, [filteredApplications, page, pageSize]);

  const filterConfigs: FilterDropdownConfig[] = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        allLabel: "All Statuses",
        options: [
          { value: "DISCOVERED", label: "Discovered" },
          { value: "QUALIFIED", label: "Qualified" },
          { value: "PREPARING", label: "Preparing" },
          { value: "REVIEW", label: "Review (QA)" },
          { value: "AWAITING_APPROVAL", label: "Awaiting Approval" },
          { value: "READY", label: "Ready to Apply" },
          { value: "SUBMITTED", label: "Submitted" },
          { value: "SUBMISSION_ISSUE", label: "Submission Issue" },
          { value: "REVIEW_REQUIRED", label: "Review Required" },
          { value: "CORRECTION_APPROVED", label: "Correction Approved" },
          { value: "RESUBMISSION", label: "Resubmission" },
          { value: "REJECTED", label: "Rejected" },
          { value: "WITHDRAWN", label: "Withdrawn" },
          { value: "FAILED", label: "Failed" },
        ],
      },
      {
        key: "candidateId",
        label: "Candidate",
        allLabel: "All Candidates",
        options: candidates.map((c) => ({ value: c.id, label: `${c.name} (${c.status})` })),
      },
      ...(sources.length > 0
        ? [
            {
              key: "source",
              label: "Source",
              allLabel: "All Sources",
              options: sources.map((s) => ({ value: s, label: s })),
            },
          ]
        : []),
      {
        key: "sort",
        label: "Sort",
        allLabel: "Sort: Newest First",
        options: [
          { value: "newest", label: "Sort: Newest First" },
          { value: "oldest", label: "Sort: Oldest First" },
          { value: "updated", label: "Sort: Last Updated" },
          { value: "company", label: "Sort: Company A–Z" },
          { value: "candidate", label: "Sort: Candidate A–Z" },
        ],
      },
    ],
    [candidates, sources]
  );

  const filterValues: Record<string, string> = {
    status: statusFilter,
    candidateId: candidateFilter,
    source: sourceFilter,
    sort: sortBy === "newest" ? "" : sortBy,
  };

  const isFiltered = Boolean(
    searchTerm.trim() || statusFilter || candidateFilter || sourceFilter || (sortBy && sortBy !== "newest") || queue !== "all"
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Console Header */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Application Operations Console
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Authoritative system of record for external candidate job search, preparation, QA verification, and manual employer submissions.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{applications.length}</span> total managed records
          </div>
        </div>
      </div>

      {/* Top Metric Strip with Instant 0ms Local Tab Selection */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => handleQueueChange("all")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "all"
              ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10"
              : "bg-white border-slate-200/90 hover:border-slate-300"
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${queue === "all" ? "text-slate-300" : "text-slate-400"}`}>
            Total Pipeline
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "all" ? "text-white" : "text-slate-900"}`}>
            {queueCounts.total}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("ready")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "ready"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
              : "bg-white border-slate-200/90 hover:border-blue-300"
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${queue === "ready" ? "text-blue-100" : "text-blue-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${queue === "ready" ? "bg-white" : "bg-blue-600 animate-pulse"}`} />
            Ready to Apply
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "ready" ? "text-white" : "text-blue-950"}`}>
            {queueCounts.ready}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("in_progress")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "in_progress"
              ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20"
              : "bg-white border-slate-200/90 hover:border-indigo-300"
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${queue === "in_progress" ? "text-indigo-100" : "text-indigo-700"}`}>
            In Progress
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "in_progress" ? "text-white" : "text-indigo-950"}`}>
            {queueCounts.inProgress}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("submitted")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "submitted"
              ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20"
              : "bg-white border-slate-200/90 hover:border-emerald-300"
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${queue === "submitted" ? "text-emerald-100" : "text-emerald-700"}`}>
            Submitted
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "submitted" ? "text-white" : "text-emerald-950"}`}>
            {queueCounts.submitted}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            handleQueueChange("needs_attention");
            setStatusFilter("AWAITING_APPROVAL");
          }}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            statusFilter === "AWAITING_APPROVAL"
              ? "bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/20"
              : "bg-white border-slate-200/90 hover:border-amber-300"
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === "AWAITING_APPROVAL" ? "text-amber-100" : "text-amber-700"}`}>
            Awaiting Candidate
          </div>
          <div className={`text-2xl font-bold mt-1 ${statusFilter === "AWAITING_APPROVAL" ? "text-white" : "text-amber-950"}`}>
            {applications.filter((a) => a.status === "AWAITING_APPROVAL").length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("needs_attention")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "needs_attention" && statusFilter !== "AWAITING_APPROVAL"
              ? "bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-500/20"
              : "bg-white border-slate-200/90 hover:border-rose-300"
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${queue === "needs_attention" ? "text-rose-100" : "text-rose-700"}`}>
            Submission Issues
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "needs_attention" ? "text-white" : "text-rose-950"}`}>
            {queueCounts.needsAttention}
          </div>
        </button>
      </div>

      {/* Operational Queue Tabs (Instant 0ms switching) */}
      <InstantTabs tabs={tabs} activeTab={queue} onChange={handleQueueChange} />

      {/* Create Managed Application Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Create Managed Application Record
            </h2>
          </div>
        </div>

        <form
          action={async (formData: FormData) => {
            const candidateId = formData.get("candidateId") as string;
            const jobId = formData.get("jobId") as string;
            if (!candidateId || !jobId) return;
            await createApplicationAction({ candidateId, jobId });
          }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1"
        >
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Candidate *</label>
            <select
              name="candidateId"
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose Candidate...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Discovered Job *</label>
            <select
              name="jobId"
              required
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose Sourced Job...</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} @ {j.companyName} {j.source ? `[${j.source}]` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <PendingButton
              type="submit"
              pendingText="Creating..."
              className="w-full rounded-xl py-2 font-semibold"
            >
              + Create Managed Application
            </PendingButton>
          </div>
        </form>
      </div>

      {/* Advanced Filter, Search & Sort Bar (0ms in-memory response) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <InstantSearch
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search candidate, company, role, source..."
            className="min-w-[220px] flex-1 sm:flex-none"
          />

          <InstantFilterBar
            filters={filterConfigs}
            values={filterValues}
            onChange={handleFilterChange}
            onClearAll={handleClearAll}
            isFiltered={isFiltered}
          />
        </div>

        <div className="text-[11px] text-slate-500 shrink-0">
          Showing <span className="font-semibold text-slate-900">{filteredApplications.length}</span> records
        </div>
      </div>

      {/* Authoritative Applications Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {filteredApplications.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <p className="font-semibold text-slate-700">No applications match the specified criteria.</p>
            <p className="mt-1 text-slate-400">Adjust the filters above or create a new application record.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500 text-[10px]">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Company & Role</th>
                  <th className="px-4 py-3">Location & Comp</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Last Activity</th>
                  <th className="px-4 py-3">Submission Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedApps.map((app) => {
                  const candidateName =
                    [app.candidate.user.firstName, app.candidate.user.lastName].filter(Boolean).join(" ") ||
                    app.candidate.user.email;

                  const latestHistory = app.stateHistory?.[0];
                  const latestSub = app.submissions?.[0];
                  const salaryText = formatSalary(app.job.salaryMin, app.job.salaryMax, app.job.salaryCurrency);

                  return (
                    <tr key={app.id} className="hover:bg-slate-50/75 transition">
                      {/* Candidate Column */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{candidateName}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {app.candidate.user.email}
                        </div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                              app.candidate.applicationAuthorizationMode === "MANAGED"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {app.candidate.applicationAuthorizationMode === "MANAGED" ? "MANAGED" : "REVIEW REQ"}
                          </span>
                        </div>
                      </td>

                      {/* Company & Role Column */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{app.job.title}</div>
                        <div className="text-[11px] text-slate-600 font-medium">
                          {app.job.companyName}
                        </div>
                        {app.job.externalUrl && (
                          <a
                            href={app.job.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                          >
                            <span>External Posting</span>
                            <span>↗</span>
                          </a>
                        )}
                      </td>

                      {/* Location & Compensation Column */}
                      <td className="px-4 py-3">
                        <div className="text-slate-800 font-medium">
                          {app.job.isRemote ? "🌐 Remote" : app.job.location || "On-site"}
                        </div>
                        <div
                          className={`text-[11px] mt-0.5 ${
                            salaryText === "Salary not disclosed" ? "text-slate-400" : "text-emerald-700 font-semibold"
                          }`}
                        >
                          {salaryText}
                        </div>
                      </td>

                      {/* Source Column */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {app.job.source ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                              {app.job.source}
                            </span>
                            {app.job.externalUrl && (
                              <a
                                href={app.job.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-slate-700 text-xs"
                                title="Open original job posting"
                              >
                                ↗
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Direct</span>
                        )}
                      </td>

                      {/* Application Status Column */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${
                            STATUS_BADGES[app.status] || "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {app.status.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Assignee Column */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {app.assignedEmployee ? (
                          <span className={app.assignedEmployeeId === currentUserId ? "font-bold text-slate-900" : ""}>
                            {[app.assignedEmployee.firstName, app.assignedEmployee.lastName].filter(Boolean).join(" ") ||
                              app.assignedEmployee.email}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Last Activity Column */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {latestHistory ? (
                          <div>
                            <span className="text-slate-800 font-medium">
                              {new Date(latestHistory.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {latestHistory.toStatus.replace(/_/g, " ")}
                            </div>
                          </div>
                        ) : (
                          <span>{new Date(app.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                        )}
                      </td>

                      {/* Submission Status Column */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {app.status === "SUBMITTED" && latestSub ? (
                          <div>
                            <span className="font-semibold text-emerald-800">
                              Submitted · Attempt #{latestSub.attemptNumber}
                            </span>
                            <div className="text-[10px] text-slate-500">
                              {new Date(latestSub.submittedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                          </div>
                        ) : app.status === "READY" ? (
                          <span className="inline-flex items-center gap-1 font-bold text-sky-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse" />
                            Ready to submit
                          </span>
                        ) : app.status === "SUBMISSION_ISSUE" ? (
                          <span className="font-bold text-rose-700">Issue reported</span>
                        ) : app.status === "RESUBMISSION" ? (
                          <span className="font-semibold text-purple-700">Resubmission staged</span>
                        ) : (
                          <span className="text-slate-400">Not submitted</span>
                        )}
                      </td>

                      {/* Action Column */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={`/employee/applications/${app.id}`}
                          className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                            app.status === "READY"
                              ? "bg-sky-600 text-white hover:bg-sky-700 shadow-xs"
                              : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {app.status === "READY" ? "Open Application →" : "Open Workbench →"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredApplications.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
