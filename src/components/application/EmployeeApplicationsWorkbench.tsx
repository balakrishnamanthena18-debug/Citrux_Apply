"use client";

import React, { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationStatus } from "@/generated/prisma";
import { formatSalary } from "@/lib/utils/status-presenter";
import { InstantTabs, TabItem } from "@/components/workbench/InstantTabs";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { InstantFilterBar, FilterDropdownConfig } from "@/components/workbench/InstantFilterBar";
import { TablePagination } from "@/components/workbench/TablePagination";
import { PendingButton } from "@/components/ui/PendingButton";
import { TransitionLink } from "@/components/ui/TransitionLink";
import { createApplicationAction } from "@/lib/application/actions";
import type {
  OperationalApplicationItem,
  OperationalQueueCounts,
  OperationalScopeAvailability,
} from "@/lib/application/operations-types";

export type ApplicationItem = OperationalApplicationItem;

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

export type ServerQueueCounts = OperationalQueueCounts;

interface Props {
  currentUserId: string;
  applications: ApplicationItem[];
  candidates: CandidateOption[];
  jobs: JobOption[];
  sources: string[];
  serverQueueCounts: ServerQueueCounts;
  scopes: OperationalScopeAvailability;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  asOf: string;
  initialQueue?: string;
  initialStatus?: string;
  initialCandidateId?: string;
  initialSource?: string;
  initialSort?: string;
  initialSearch?: string;
}

const STATUS_BADGES: Record<string, string> = {
  DISCOVERED: "bg-[#EDF1EF] text-[#334155] border-[#E5EAE7]",
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
  WITHDRAWN: "bg-[#EDF1EF] text-[#0F1720] border-[#E5EAE7]",
  FAILED: "bg-rose-100 text-rose-900 border-rose-300",
};

function buildHref(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      sp.set(key, value);
    }
  }
  const q = sp.toString();
  return q ? `/employee/applications?${q}` : "/employee/applications";
}

export function EmployeeApplicationsWorkbench({
  currentUserId,
  applications,
  candidates,
  jobs,
  sources,
  serverQueueCounts,
  scopes,
  page,
  pageSize,
  totalCount,
  totalPages,
  asOf,
  initialQueue = "all",
  initialStatus = "",
  initialCandidateId = "",
  initialSource = "",
  initialSort = "age",
  initialSearch = "",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(initialSearch);

  const queue = initialQueue;
  const statusFilter = initialStatus;
  const candidateFilter = initialCandidateId;
  const sourceFilter = initialSource;
  const sortBy = initialSort;

  const navigate = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = {
        queue: queue === "all" ? null : queue,
        search: initialSearch || null,
        status: statusFilter || null,
        candidateId: candidateFilter || null,
        source: sourceFilter || null,
        sort: sortBy === "age" ? null : sortBy,
        page: page > 1 ? String(page) : null,
        ...patch,
      };
      startTransition(() => {
        router.push(buildHref(next));
      });
    },
    [
      router,
      queue,
      initialSearch,
      statusFilter,
      candidateFilter,
      sourceFilter,
      sortBy,
      page,
    ]
  );

  const queueCounts = serverQueueCounts;

  const tabs: TabItem[] = useMemo(() => {
    const base: TabItem[] = [
      { key: "all", label: "All Applications", count: queueCounts.total },
      { key: "mine", label: "My Work", count: queueCounts.mine },
      { key: "unassigned", label: "Unassigned", count: queueCounts.unassigned },
      { key: "ready", label: "Ready to Apply", count: queueCounts.ready, highlight: true },
      { key: "in_progress", label: "Applying / In Progress", count: queueCounts.inProgress },
      { key: "submitted", label: "Submitted", count: queueCounts.submitted },
      { key: "needs_attention", label: "Needs Attention", count: queueCounts.needsAttention },
      { key: "failed", label: "Failed", count: queueCounts.failed },
    ];
    let insertAt = 3;
    if (scopes.team) {
      base.splice(insertAt, 0, {
        key: "team",
        label: "Team",
        count: queueCounts.team,
      });
      insertAt += 1;
    }
    if (scopes.manager) {
      base.splice(insertAt, 0, {
        key: "manager",
        label: "Direct Reports",
        count: queueCounts.manager,
      });
      insertAt += 1;
    }
    if (scopes.orphaned) {
      base.splice(insertAt, 0, {
        key: "orphaned",
        label: "Inactive Owner",
        count: queueCounts.orphaned,
      });
      insertAt += 1;
    }
    if (scopes.continuity) {
      base.splice(insertAt, 0, {
        key: "continuity",
        label: "Out of Scope",
        count: queueCounts.continuity,
      });
    }
    return base;
  }, [queueCounts, scopes.team, scopes.manager, scopes.orphaned, scopes.continuity]);

  const handleQueueChange = (newQueue: string) => {
    navigate({
      queue: newQueue === "all" ? null : newQueue,
      page: null,
      status: null,
    });
  };

  const handleSearchSubmit = () => {
    navigate({
      search: searchDraft.trim() || null,
      page: null,
    });
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === "status") {
      navigate({ status: value || null, page: null });
    } else if (key === "candidateId") {
      navigate({ candidateId: value || null, page: null });
    } else if (key === "source") {
      navigate({ source: value || null, page: null });
    } else if (key === "sort") {
      // Empty = default age sort
      navigate({ sort: value && value !== "age" ? value : null, page: null });
    }
  };

  const handleClearAll = () => {
    setSearchDraft("");
    startTransition(() => {
      router.push("/employee/applications");
    });
  };

  const handlePageChange = (nextPage: number) => {
    navigate({ page: nextPage > 1 ? String(nextPage) : null });
  };

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
      {
        key: "source",
        label: "Source",
        allLabel: "All Sources",
        options: sources.map((s) => ({ value: s, label: s })),
      },
      {
        key: "sort",
        label: "Sort",
        allLabel: "Age (longest first)",
        options: [
          { value: "newest", label: "Newest created" },
          { value: "oldest", label: "Oldest created" },
          { value: "updated", label: "Recently updated" },
        ],
      },
    ],
    [candidates, sources]
  );

  const filterValues = useMemo(
    () => ({
      status: statusFilter,
      candidateId: candidateFilter,
      source: sourceFilter,
      // Empty select value maps to default age sort (allLabel).
      sort: sortBy === "age" ? "" : sortBy,
    }),
    [statusFilter, candidateFilter, sourceFilter, sortBy]
  );

  const isFiltered = Boolean(
    searchDraft || statusFilter || candidateFilter || sourceFilter || sortBy !== "age" || queue !== "all"
  );

  return (
    <div className={`space-y-5 max-w-[1600px] mx-auto pb-16 ${isPending ? "opacity-70" : ""}`}>
      <div className="bg-white p-6 rounded-[16px] border border-[#E5EAE7] shadow-2xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
              <h1 className="text-xl font-bold tracking-tight text-[#0F1720]">
                Application Operations Console
              </h1>
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Server-authorized queues: owner, status, current-state age, and next action.
            </p>
          </div>
          <div className="text-xs text-[#64748B] text-right">
            <div>
              <span className="font-semibold text-[#0F1720]">{queueCounts.total}</span> org applications
            </div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5" suppressHydrationWarning>
              Age as of {asOf.slice(0, 16).replace("T", " ")}Z
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => handleQueueChange("all")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "all"
              ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10"
              : "bg-white border-[#E5EAE7]/90 hover:border-[#DDE5E0]"
          }`}
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wider ${
              queue === "all" ? "text-slate-300" : "text-[#94A3B8]"
            }`}
          >
            Total Pipeline
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "all" ? "text-white" : "text-[#0F1720]"}`}>
            {queueCounts.total}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("mine")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "mine"
              ? "bg-slate-800 text-white border-slate-800"
              : "bg-white border-[#E5EAE7]/90 hover:border-[#DDE5E0]"
          }`}
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wider ${
              queue === "mine" ? "text-slate-300" : "text-[#64748B]"
            }`}
          >
            My Work
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "mine" ? "text-white" : "text-[#0F1720]"}`}>
            {queueCounts.mine}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("unassigned")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "unassigned"
              ? "bg-amber-700 text-white border-amber-700"
              : "bg-white border-[#E5EAE7]/90 hover:border-amber-300"
          }`}
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wider ${
              queue === "unassigned" ? "text-amber-100" : "text-amber-800"
            }`}
          >
            Unassigned
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              queue === "unassigned" ? "text-white" : "text-amber-950"
            }`}
          >
            {queueCounts.unassigned}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("ready")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "ready"
              ? "bg-sky-700 text-white border-sky-700"
              : "bg-white border-[#E5EAE7]/90 hover:border-sky-300"
          }`}
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wider ${
              queue === "ready" ? "text-sky-100" : "text-sky-700"
            }`}
          >
            Ready
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "ready" ? "text-white" : "text-sky-950"}`}>
            {queueCounts.ready}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("needs_attention")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "needs_attention"
              ? "bg-rose-600 text-white border-rose-600"
              : "bg-white border-[#E5EAE7]/90 hover:border-rose-300"
          }`}
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wider ${
              queue === "needs_attention" ? "text-rose-100" : "text-rose-700"
            }`}
          >
            Needs Attention
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              queue === "needs_attention" ? "text-white" : "text-rose-950"
            }`}
          >
            {queueCounts.needsAttention}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange("failed")}
          className={`p-4 rounded-2xl border shadow-xs transition-all text-left cursor-pointer ${
            queue === "failed"
              ? "bg-rose-900 text-white border-rose-900"
              : "bg-white border-[#E5EAE7]/90 hover:border-rose-400"
          }`}
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wider ${
              queue === "failed" ? "text-rose-200" : "text-rose-800"
            }`}
          >
            Failed
          </div>
          <div className={`text-2xl font-bold mt-1 ${queue === "failed" ? "text-white" : "text-rose-950"}`}>
            {queueCounts.failed}
          </div>
        </button>
      </div>

      <InstantTabs tabs={tabs} activeTab={queue} onChange={handleQueueChange} />

      <div className="bg-white p-6 rounded-2xl border border-[#E5EAE7]/90 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F1720]">
            Create Managed Application Record
          </h2>
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
            <label className="block font-semibold text-[#334155] mb-1">Select Candidate *</label>
            <select
              name="candidateId"
              required
              className="w-full rounded-[20px] border border-[#DDE5E0] px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block font-semibold text-[#334155] mb-1">Select Discovered Job *</label>
            <select
              name="jobId"
              required
              className="w-full rounded-[20px] border border-[#DDE5E0] px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full rounded-[20px] py-2 font-semibold"
            >
              + Create Managed Application
            </PendingButton>
          </div>
        </form>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E5EAE7]/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="flex gap-2 min-w-[220px] flex-1 sm:flex-none">
            <InstantSearch
              value={searchDraft}
              onChange={setSearchDraft}
              placeholder="Search candidate, company, role, source..."
              className="flex-1"
            />
            <button
              type="button"
              onClick={handleSearchSubmit}
              className="px-3 py-2 rounded-[12px] border border-[#DDE5E0] bg-white font-semibold text-[#0F1720] hover:bg-[#F7F9F8]"
            >
              Search
            </button>
          </div>

          <InstantFilterBar
            filters={filterConfigs}
            values={filterValues}
            onChange={handleFilterChange}
            onClearAll={handleClearAll}
            isFiltered={isFiltered}
          />
        </div>

        <div className="text-[11px] text-[#64748B] shrink-0">
          Showing <span className="font-semibold text-[#0F1720]">{applications.length}</span> of{" "}
          <span className="font-semibold text-[#0F1720]">{totalCount}</span> (server page)
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5EAE7]/90 shadow-xs overflow-hidden">
        {applications.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#64748B]">
            <p className="font-semibold text-[#334155]">No applications match the specified criteria.</p>
            <p className="mt-1 text-[#94A3B8]">
              {queue === "team" && !scopes.team
                ? "No authorized team scope for this account."
                : queue === "manager" && !scopes.manager
                  ? "No authorized direct-report scope for this account."
                  : queue === "orphaned"
                    ? "No Applications with inactive owners in your recovery scope."
                    : queue === "continuity"
                      ? "No Applications with active owners outside your current structural scope."
                      : "Adjust the filters above or create a new application record."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E5EAE7] text-left text-xs">
              <thead className="bg-[#F7F9F8] font-semibold uppercase tracking-wider text-[#64748B] text-[10px]">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Company & Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">Next Action</th>
                  <th className="px-4 py-3">Submission</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF1EF]">
                {applications.map((app) => {
                  const candidateName =
                    [app.candidate.user.firstName, app.candidate.user.lastName]
                      .filter(Boolean)
                      .join(" ") || app.candidate.user.email;

                  const latestSub = app.submissions?.[0];
                  const salaryText = formatSalary(
                    app.job.salaryMin,
                    app.job.salaryMax,
                    app.job.salaryCurrency
                  );

                  return (
                    <tr key={app.id} className="hover:bg-[#F7F9F8]/75 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0F1720]">{candidateName}</div>
                        <div className="text-[11px] text-[#64748B] truncate max-w-[180px]">
                          {app.candidate.user.email}
                        </div>
                        <div className="text-[10px] text-[#94A3B8] mt-0.5">
                          {app.job.isRemote ? "Remote" : app.job.location || "On-site"}
                          {salaryText !== "Salary not disclosed" ? ` · ${salaryText}` : ""}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0F1720]">{app.job.title}</div>
                        <div className="text-[11px] text-[#64748B] font-medium">
                          {app.job.companyName}
                        </div>
                        {app.job.source && (
                          <span className="inline-flex mt-0.5 items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#EDF1EF] text-[#0F1720] border border-[#E5EAE7]">
                            {app.job.source}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] border ${
                            STATUS_BADGES[app.status] ||
                            "bg-[#EDF1EF] text-[#334155] border-[#E5EAE7]"
                          }`}
                        >
                          {app.status.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-[#64748B] whitespace-nowrap">
                        <div className="text-[10px] uppercase tracking-wider text-[#94A3B8]">
                          Owner
                        </div>
                        {app.ownerDisplayName === "Unassigned" ? (
                          <span className="text-[#94A3B8] italic">Unassigned</span>
                        ) : app.ownerInactive ? (
                          <div
                            aria-label={`Owner inactive. Former owner: ${app.ownerDisplayName}`}
                          >
                            <span className="font-bold text-amber-900">Inactive</span>
                            <div className="text-[10px] text-[#94A3B8] truncate max-w-[140px]">
                              Former: {app.ownerDisplayName}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span
                              className={
                                app.assignedEmployeeId === currentUserId
                                  ? "font-bold text-[#0F1720]"
                                  : "text-[#0F1720] font-medium"
                              }
                            >
                              {app.ownerDisplayName}
                            </span>
                            {app.continuityOutsideScope && (
                              <div
                                className="text-[10px] text-amber-800 mt-0.5"
                                aria-label="Continuity: outside current structural scope"
                              >
                                Outside current scope
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {app.currentStateAgeKind === "AGE_UNAVAILABLE" ? (
                          <span className="text-[#94A3B8] italic text-[11px]">AGE_UNAVAILABLE</span>
                        ) : (
                          <div>
                            <span className="font-semibold text-[#0F1720]">
                              {app.currentStateAgeLabel}
                            </span>
                            {app.currentStateEnteredAt && (
                              <div className="text-[10px] text-[#94A3B8] font-mono">
                                {app.currentStateEnteredAt.slice(0, 16).replace("T", " ")}Z
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="text-[11px] text-[#334155] leading-snug">{app.nextAction}</p>
                      </td>

                      <td className="px-4 py-3 text-[#64748B] whitespace-nowrap">
                        {app.status === "SUBMITTED" && latestSub ? (
                          <span className="font-semibold text-emerald-800">
                            Attempt #{latestSub.attemptNumber}
                          </span>
                        ) : app.status === "READY" ? (
                          <span className="font-bold text-sky-800">Ready to submit</span>
                        ) : app.status === "SUBMISSION_ISSUE" ? (
                          <span className="font-bold text-rose-700">Issue reported</span>
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <TransitionLink
                          href={`/employee/applications/${app.id}`}
                          className="inline-flex items-center px-3 py-1.5 rounded-[10px] border border-[#DDE5E0] bg-white text-[11px] font-semibold text-[#0F1720] hover:bg-[#F7F9F8]"
                        >
                          Open
                        </TransitionLink>
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
          totalItems={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}

export type { ApplicationStatus };
