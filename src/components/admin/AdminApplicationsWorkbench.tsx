"use client";

import React, { useState, useMemo } from "react";
import { TransitionLink } from "@/components/ui/TransitionLink";
import {
  WorkbenchShell,
  WorkbenchHeader,
  WorkbenchToolbar,
  WorkbenchEmptyState,
  InstantTabs,
  TabItem,
  InstantSearch,
  InstantSort,
  SortDirection,
  SortOption,
  TablePagination,
} from "@/components/workbench";
import { syncUrlParams } from "@/lib/client/urlSync";

export interface AdminAppItem {
  id: string;
  status: string;
  createdAt: string | Date;
  candidate: {
    user: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    };
  };
  job: {
    title: string;
    companyName: string;
  };
  assignedEmployee?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
}

interface Props {
  applications: AdminAppItem[];
  totalCount: number;
  statusCounts: Array<{ status: string; _count: number }>;
}

const SORT_OPTIONS: SortOption[] = [
  { value: "createdAt", label: "Date Created" },
  { value: "candidate", label: "Candidate Name" },
  { value: "company", label: "Company" },
  { value: "status", label: "Status" },
];

export function AdminApplicationsWorkbench({
  applications,
  totalCount,
  statusCounts,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const tabs: TabItem[] = useMemo(() => {
    const list: TabItem[] = [{ key: "ALL", label: "All Applications", count: totalCount }];
    for (const sc of statusCounts.slice(0, 6)) {
      list.push({
        key: sc.status,
        label: sc.status.replace(/_/g, " "),
        count: sc._count,
        highlight: sc.status === "AWAITING_APPROVAL" || sc.status === "SUBMISSION_ISSUE",
      });
    }
    return list;
  }, [totalCount, statusCounts]);

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    setPage(1);
    syncUrlParams({ status: newTab === "ALL" ? null : newTab });
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPage(1);
    syncUrlParams({ search: term ? term : null });
  };

  const handleSortChange = (field: string, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  const filtered = useMemo(() => {
    let result = applications;

    if (activeTab !== "ALL") {
      result = result.filter((a) => a.status === activeTab);
    }

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((a) => {
        const cand = `${a.candidate?.user?.firstName || ""} ${a.candidate?.user?.lastName || ""}`.toLowerCase();
        const email = (a.candidate?.user?.email || "").toLowerCase();
        const job = (a.job?.title || "").toLowerCase();
        const company = (a.job?.companyName || "").toLowerCase();
        const emp = `${a.assignedEmployee?.firstName || ""} ${a.assignedEmployee?.lastName || ""}`.toLowerCase();

        return cand.includes(q) || email.includes(q) || job.includes(q) || company.includes(q) || emp.includes(q);
      });
    }

    return [...result].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      if (sortField === "createdAt") {
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
      } else if (sortField === "candidate") {
        aVal = `${a.candidate?.user?.firstName || ""} ${a.candidate?.user?.lastName || ""}`.trim() || a.candidate?.user?.email;
        bVal = `${b.candidate?.user?.firstName || ""} ${b.candidate?.user?.lastName || ""}`.trim() || b.candidate?.user?.email;
      } else if (sortField === "company") {
        aVal = a.job?.companyName || "";
        bVal = b.job?.companyName || "";
      } else if (sortField === "status") {
        aVal = a.status;
        bVal = b.status;
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [applications, activeTab, searchTerm, sortField, sortDirection]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      <WorkbenchShell ariaLabel="Admin Application Oversight Workbench">
        <WorkbenchHeader
          title="Application Operations Oversight"
          description="Administrative monitoring, pipeline tracking, and operational audit review across all managed applications."
          badge={`${totalCount} Total`}
          badgeVariant="indigo"
        />

        <WorkbenchToolbar>
          <InstantTabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={handleTabChange}
          />
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <InstantSearch
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search candidate, job, specialist... (/)"
            />
            <InstantSort
              options={SORT_OPTIONS}
              currentField={sortField}
              currentDirection={sortDirection}
              onSortChange={handleSortChange}
            />
          </div>
        </WorkbenchToolbar>

        {filtered.length === 0 ? (
          <WorkbenchEmptyState
            title="No applications match active criteria"
            description="Try adjusting your status tab or clearing the search filter."
            actionText={searchTerm || activeTab !== "ALL" ? "Reset Filters" : undefined}
            onAction={() => {
              setSearchTerm("");
              setActiveTab("ALL");
              syncUrlParams({ search: null, status: null });
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E5EAE7] text-left text-xs">
              <thead className="bg-[#F7F9F8] font-semibold uppercase tracking-wider text-[11px] text-[#64748B]">
                <tr>
                  <th scope="col" className="px-5 py-3">Candidate</th>
                  <th scope="col" className="px-5 py-3">Job & Company</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3">Assigned Specialist</th>
                  <th scope="col" className="px-5 py-3">Created Date</th>
                  <th scope="col" className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF1EF] bg-white">
                {paginated.map((app) => (
                  <tr key={app.id} className="hover:bg-[#F7F9F8]/80 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-[#0F1720]">
                        {[app.candidate?.user?.firstName, app.candidate?.user?.lastName].filter(Boolean).join(" ") ||
                          app.candidate?.user?.email ||
                          "Unnamed Candidate"}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] font-mono mt-0.5">
                        {app.candidate?.user?.email}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-[#0F1720]">{app.job?.title || "Untitled Position"}</div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">{app.job?.companyName || "Unknown Company"}</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          app.status === "READY"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : app.status === "AWAITING_APPROVAL"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : app.status === "SUBMISSION_ISSUE"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : app.status === "SUBMITTED"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-[#EDF1EF] text-[#334155]"
                        }`}
                      >
                        {app.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-[#64748B]">
                      {app.assignedEmployee ? (
                        <div className="font-medium text-[#0F1720]">
                          {[app.assignedEmployee.firstName, app.assignedEmployee.lastName].filter(Boolean).join(" ") ||
                            app.assignedEmployee.email}
                        </div>
                      ) : (
                        <span className="text-[#94A3B8] italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-[#64748B] font-mono text-[11px]">
                      {new Date(app.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <TransitionLink
                        href={`/employee/applications/${app.id}`}
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold text-xs transition-colors"
                      >
                        Inspect Dossier →
                      </TransitionLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </WorkbenchShell>
    </div>
  );
}
