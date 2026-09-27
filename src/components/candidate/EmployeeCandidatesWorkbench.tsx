"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { InstantSearch } from "@/components/workbench/InstantSearch";
import { TablePagination } from "@/components/workbench/TablePagination";
import { syncUrlParams } from "@/lib/client/urlSync";

export interface CandidateDirectoryItem {
  id: string;
  status: string;
  verificationStatus?: string | null;
  headline?: string | null;
  assignedEmployeeId?: string | null;
  assignedEmployee?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
  skills?: Array<{ id: string; name: string }>;
  applications?: Array<{ id: string; status: string }>;
}

interface Props {
  currentUserId: string;
  candidates: CandidateDirectoryItem[];
  initialScope?: string;
  initialStatus?: string;
  initialSearch?: string;
}

export function EmployeeCandidatesWorkbench({
  currentUserId,
  candidates,
  initialScope = "",
  initialStatus = "ALL",
  initialSearch = "",
}: Props) {
  const [scope, setScope] = useState<string>(initialScope);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  const handleScopeChange = (newScope: string) => {
    setScope(newScope);
    setPage(1);
    syncUrlParams({ scope: newScope || null });
  };

  const handleStatusChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setPage(1);
    syncUrlParams({ status: newStatus === "ALL" ? null : newStatus });
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPage(1);
    syncUrlParams({ search: term ? term : null });
  };

  // Instant pure in-memory filtering (<2ms)
  const filteredCandidates = useMemo(() => {
    let result = candidates;

    if (scope === "mine") {
      result = result.filter((c) => c.assignedEmployeeId === currentUserId);
    }

    if (statusFilter && statusFilter !== "ALL") {
      result = result.filter((c) => c.status === statusFilter);
    }

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((c) => {
        const fullName = `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.toLowerCase();
        const email = c.user.email.toLowerCase();
        const headline = (c.headline ?? "").toLowerCase();
        const skills = (c.skills ?? []).map((s) => s.name.toLowerCase()).join(" ");
        return fullName.includes(q) || email.includes(q) || headline.includes(q) || skills.includes(q);
      });
    }

    return result;
  }, [candidates, scope, currentUserId, statusFilter, searchTerm]);

  const totalPages = Math.ceil(filteredCandidates.length / pageSize) || 1;
  const paginatedCandidates = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCandidates.slice(start, start + pageSize);
  }, [filteredCandidates, page, pageSize]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Candidate Directory</h1>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Candidate 360 overview, operational qualification status, active applications, and specialist assignment.
          </p>
        </div>
      </div>

      {/* Filter Toolbar with Instant 0ms Local Transitions */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scope Filters */}
          <button
            type="button"
            onClick={() => handleScopeChange("")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              !scope ? "bg-slate-900 text-white shadow-2xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All Candidates ({candidates.length})
          </button>
          <button
            type="button"
            onClick={() => handleScopeChange("mine")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              scope === "mine" ? "bg-blue-600 text-white shadow-2xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            My Assigned Candidates ({candidates.filter((c) => c.assignedEmployeeId === currentUserId).length})
          </button>

          <span className="text-slate-300 mx-1">|</span>

          {/* Status Pills */}
          {["ALL", "ONBOARDING", "ACTIVE", "INACTIVE", "ARCHIVED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleStatusChange(st)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                statusFilter === st
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="w-64">
          <InstantSearch
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search candidate name, email, skills..."
          />
        </div>
      </div>

      {/* Candidates Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center text-xs">
          <span className="font-bold text-slate-700 uppercase tracking-wider">
            Showing {filteredCandidates.length} {filteredCandidates.length === 1 ? "candidate" : "candidates"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3 text-left">Candidate</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Verification</th>
                <th className="px-6 py-3 text-left">Active Apps</th>
                <th className="px-6 py-3 text-left">Assigned Specialist</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="text-3xl mb-2">👤</div>
                    <div className="text-sm font-bold text-slate-700">No candidates found</div>
                    <p className="text-xs text-slate-400 mt-1">
                      {scope === "mine"
                        ? "No candidates are currently assigned to you."
                        : "No candidates matching your filter criteria."}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedCandidates.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs mr-3">
                          {c.user.firstName?.[0] || (c.user.email?.[0] ? c.user.email[0].toUpperCase() : "?")}
                        </div>
                        <div>
                          <Link
                            href={`/employee/candidates/${c.id}`}
                            className="font-bold text-slate-900 hover:text-blue-600 transition"
                          >
                            {[c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || c.user.email}
                          </Link>
                          <div className="text-[11px] text-slate-400 font-mono">{c.user.email}</div>
                          {c.headline && <div className="text-slate-500 text-[11px] mt-0.5">{c.headline}</div>}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          c.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : c.status === "ONBOARDING"
                            ? "bg-blue-100 text-blue-800"
                            : c.status === "PLACED"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                          c.verificationStatus === "VERIFIED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : c.verificationStatus === "REJECTED"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {c.verificationStatus || "UNVERIFIED"}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-900">
                        {c.applications?.length || 0}
                      </span>{" "}
                      <span className="text-slate-400 text-[11px]">staged</span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {c.assignedEmployee ? (
                        <span className={c.assignedEmployeeId === currentUserId ? "font-bold text-slate-900" : ""}>
                          {[c.assignedEmployee.firstName, c.assignedEmployee.lastName].filter(Boolean).join(" ") ||
                            c.assignedEmployee.email}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link
                        href={`/employee/candidates/${c.id}`}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-xs transition"
                      >
                        Inspect 360 →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredCandidates.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
