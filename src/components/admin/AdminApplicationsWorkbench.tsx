"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { TablePagination } from "@/components/workbench/TablePagination";

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

export function AdminApplicationsWorkbench({
  applications,
  totalCount,
  statusCounts,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const filtered = useMemo(() => {
    let result = applications;

    if (statusFilter !== "ALL") {
      result = result.filter((a) => a.status === statusFilter);
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

    return result;
  }, [applications, statusFilter, searchTerm]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Application Operations Oversight</h1>
          <p className="text-sm text-slate-500 mt-1">
            Administrative monitoring, pipeline tracking, and audit review across all managed applications.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("ALL");
              setPage(1);
            }}
            className={`p-4 text-left transition-colors cursor-pointer ${statusFilter === "ALL" ? "bg-slate-50" : "hover:bg-slate-50/60"}`}
          >
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Total Applications</div>
            <div className="text-2xl font-semibold text-slate-900 mt-1">{totalCount}</div>
          </button>
          {statusCounts.slice(0, 5).map((sc) => (
            <button
              key={sc.status}
              type="button"
              onClick={() => {
                setStatusFilter(sc.status);
                setPage(1);
              }}
              className={`p-4 text-left transition-colors cursor-pointer ${statusFilter === sc.status ? "bg-slate-50" : "hover:bg-slate-50/60"}`}
            >
              <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wide truncate">
                {sc.status.replace(/_/g, " ")}
              </div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">{sc._count}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Oversight Table */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50/75 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Managed Applications ({filtered.length})
            </h2>
            {statusFilter !== "ALL" && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                Filtered: {statusFilter.replace(/_/g, " ")}
              </span>
            )}
          </div>

          <div className="w-64">
            <InstantSearch
              value={searchTerm}
              onChange={(term) => {
                setSearchTerm(term);
                setPage(1);
              }}
              placeholder="Search candidate, job, company..."
            />
          </div>
        </div>

        <table className="min-w-full divide-y divide-slate-200/80 text-left text-xs">
          <thead className="bg-slate-50/75 font-semibold uppercase tracking-wider text-[11px] text-slate-500">
            <tr>
              <th className="px-5 py-3">Candidate</th>
              <th className="px-5 py-3">Job & Company</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Assignee</th>
              <th className="px-5 py-3">Created</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                  No applications match the criteria.
                </td>
              </tr>
            ) : (
              paginated.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/60 transition-colors h-14">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">
                      {app.candidate.user.firstName || app.candidate.user.lastName
                        ? `${app.candidate.user.firstName ?? ""} ${app.candidate.user.lastName ?? ""}`.trim()
                        : app.candidate.user.email}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">{app.candidate.user.email}</div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="font-medium text-slate-800">{app.job.title}</div>
                    <div className="text-[11px] text-slate-400">{app.job.companyName}</div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                      {app.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-600">
                    {app.assignedEmployee
                      ? `${app.assignedEmployee.firstName || ""} ${app.assignedEmployee.lastName || app.assignedEmployee.email}`.trim()
                      : <span className="text-slate-400 italic">Unassigned</span>}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-right">
                    <Link
                      href={`/employee/applications/${app.id}`}
                      className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                    >
                      Inspect →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
