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

const SORT_OPTIONS: SortOption[] = [
  { value: "name", label: "Candidate Name" },
  { value: "status", label: "Status" },
  { value: "apps", label: "Active Applications" },
];

export function EmployeeCandidatesWorkbench({
  currentUserId,
  candidates,
  initialScope = "",
  initialStatus = "ALL",
  initialSearch = "",
}: Props) {
  const [activeTab, setActiveTab] = useState<string>(initialScope === "mine" ? "mine" : initialStatus !== "ALL" ? initialStatus : "ALL");
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  const myCount = useMemo(
    () => candidates.filter((c) => c.assignedEmployeeId === currentUserId).length,
    [candidates, currentUserId]
  );

  const activeCount = useMemo(
    () => candidates.filter((c) => c.status === "ACTIVE").length,
    [candidates]
  );

  const onboardingCount = useMemo(
    () => candidates.filter((c) => c.status === "ONBOARDING").length,
    [candidates]
  );

  const tabs: TabItem[] = useMemo(
    () => [
      { key: "ALL", label: "All Candidates", count: candidates.length },
      { key: "mine", label: "My Assigned", count: myCount, highlight: true },
      { key: "ACTIVE", label: "Active", count: activeCount },
      { key: "ONBOARDING", label: "Onboarding", count: onboardingCount },
    ],
    [candidates.length, myCount, activeCount, onboardingCount]
  );

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    setPage(1);
    if (newTab === "mine") {
      syncUrlParams({ scope: "mine", status: null });
    } else if (newTab === "ALL") {
      syncUrlParams({ scope: null, status: null });
    } else {
      syncUrlParams({ scope: null, status: newTab });
    }
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

  // Instant pure in-memory filtering & sorting (<2ms)
  const filteredCandidates = useMemo(() => {
    let result = candidates;

    if (activeTab === "mine") {
      result = result.filter((c) => c.assignedEmployeeId === currentUserId);
    } else if (activeTab !== "ALL") {
      result = result.filter((c) => c.status === activeTab);
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

    return [...result].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      if (sortField === "name") {
        aVal = `${a.user.firstName ?? ""} ${a.user.lastName ?? ""}`.trim() || a.user.email;
        bVal = `${b.user.firstName ?? ""} ${b.user.lastName ?? ""}`.trim() || b.user.email;
      } else if (sortField === "status") {
        aVal = a.status;
        bVal = b.status;
      } else if (sortField === "apps") {
        aVal = a.applications?.length || 0;
        bVal = b.applications?.length || 0;
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [candidates, activeTab, currentUserId, searchTerm, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredCandidates.length / pageSize) || 1;
  const paginatedCandidates = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCandidates.slice(start, start + pageSize);
  }, [filteredCandidates, page, pageSize]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      <WorkbenchShell ariaLabel="Candidate Directory Workbench">
        <WorkbenchHeader
          title="Candidate Directory"
          description="Candidate 360 overview, qualification status, active applications, and operational assignment."
          badge={`${candidates.length} Roster`}
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
              placeholder="Search name, email, skills... (/)"
            />
            <InstantSort
              options={SORT_OPTIONS}
              currentField={sortField}
              currentDirection={sortDirection}
              onSortChange={handleSortChange}
            />
          </div>
        </WorkbenchToolbar>

        {filteredCandidates.length === 0 ? (
          <WorkbenchEmptyState
            title="No candidates match active criteria"
            description={
              activeTab === "mine"
                ? "No candidates are currently assigned to you."
                : "Try adjusting your search terms or status tab."
            }
            actionText={searchTerm || activeTab !== "ALL" ? "Reset Filters" : undefined}
            onAction={() => {
              setSearchTerm("");
              setActiveTab("ALL");
              syncUrlParams({ search: null, scope: null, status: null });
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E5EAE7] text-xs">
              <thead className="bg-[#F7F9F8] text-[#64748B] uppercase tracking-wider font-semibold">
                <tr>
                  <th scope="col" className="px-5 py-3 text-left">Candidate</th>
                  <th scope="col" className="px-5 py-3 text-left">Status</th>
                  <th scope="col" className="px-5 py-3 text-left">Verification</th>
                  <th scope="col" className="px-5 py-3 text-left">Active Apps</th>
                  <th scope="col" className="px-5 py-3 text-left">Assigned Specialist</th>
                  <th scope="col" className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#EDF1EF]">
                {paginatedCandidates.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F7F9F8]/80 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-[#EDF1EF] border border-[#E5EAE7] text-[#334155] font-semibold flex items-center justify-center text-xs shrink-0">
                          {c.user.firstName?.[0] || (c.user.email?.[0] ? c.user.email[0].toUpperCase() : "?")}
                        </div>
                        <div>
                          <TransitionLink
                            href={`/employee/candidates/${c.id}`}
                            className="font-semibold text-[#0F1720] hover:text-indigo-600 transition-colors"
                          >
                            {[c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || c.user.email}
                          </TransitionLink>
                          <div className="text-[11px] text-[#94A3B8] font-mono">{c.user.email}</div>
                          {c.headline && <div className="text-[#64748B] text-[11px] mt-0.5 max-w-xs truncate">{c.headline}</div>}
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          c.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : c.status === "ONBOARDING"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : c.status === "PLACED"
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : "bg-[#EDF1EF] text-[#64748B]"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap">
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

                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="font-semibold text-[#0F1720]">
                        {c.applications?.length || 0}
                      </span>{" "}
                      <span className="text-[#94A3B8] text-[11px]">staged</span>
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap text-[#64748B]">
                      {c.assignedEmployee ? (
                        <span className={c.assignedEmployeeId === currentUserId ? "font-semibold text-[#0F1720]" : ""}>
                          {[c.assignedEmployee.firstName, c.assignedEmployee.lastName].filter(Boolean).join(" ") ||
                            c.assignedEmployee.email}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8] italic">Unassigned</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <TransitionLink
                        href={`/employee/candidates/${c.id}`}
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold text-xs transition-colors"
                      >
                        Inspect 360 →
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
          totalItems={filteredCandidates.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </WorkbenchShell>
    </div>
  );
}
