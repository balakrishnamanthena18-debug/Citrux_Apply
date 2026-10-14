"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { AddCandidateModal, type StaffOption } from "./AddCandidateModal";
import { resendCandidateInvitationAction } from "@/lib/candidate/actions";

export interface CandidateDirectoryItem {
  id: string;
  status: string;
  verificationStatus?: string | null;
  membershipStatus?: string | null;
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
  currentUserRole?: string;
  canAddCandidate?: boolean;
  candidates: CandidateDirectoryItem[];
  availableStaff?: StaffOption[];
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
  currentUserRole,
  canAddCandidate = currentUserRole ? currentUserRole === "ADMIN" : true,
  candidates,
  availableStaff = [],
  initialScope = "",
  initialStatus = "ALL",
  initialSearch = "",
}: Props) {
  const router = useRouter();
  const [createdCandidates, setCreatedCandidates] = useState<CandidateDirectoryItem[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: "success" | "warning";
    message: string;
  } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const candidateList = useMemo(() => {
    const serverIds = new Set(candidates.map((c) => c.id));
    const newItems = createdCandidates.filter((c) => !serverIds.has(c.id));
    return [...newItems, ...candidates];
  }, [createdCandidates, candidates]);

  const [activeTab, setActiveTab] = useState<string>(initialScope === "mine" ? "mine" : initialStatus !== "ALL" ? initialStatus : "ALL");
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  const myCount = useMemo(
    () => candidateList.filter((c) => c.assignedEmployeeId === currentUserId).length,
    [candidateList, currentUserId]
  );

  const activeCount = useMemo(
    () => candidateList.filter((c) => c.status === "ACTIVE").length,
    [candidateList]
  );

  const onboardingCount = useMemo(
    () => candidateList.filter((c) => c.status === "ONBOARDING").length,
    [candidateList]
  );

  const tabs: TabItem[] = useMemo(
    () => [
      { key: "ALL", label: "All Candidates", count: candidateList.length },
      { key: "mine", label: "My Assigned", count: myCount, highlight: true },
      { key: "ACTIVE", label: "Active", count: activeCount },
      { key: "ONBOARDING", label: "Onboarding", count: onboardingCount },
    ],
    [candidateList.length, myCount, activeCount, onboardingCount]
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

  const handleCandidateCreated = (
    newCandidate: CandidateDirectoryItem,
    invitation?: { attempted: boolean; sent: boolean; error?: string }
  ) => {
    setCreatedCandidates((prev) => [newCandidate, ...prev]);
    const candidateName =
      [newCandidate.user.firstName, newCandidate.user.lastName].filter(Boolean).join(" ") ||
      newCandidate.user.email;

    if (invitation?.attempted) {
      if (invitation.sent) {
        setNotification({
          type: "success",
          message: `Candidate "${candidateName}" was created and an activation invitation was sent to ${newCandidate.user.email}.`,
        });
      } else {
        setNotification({
          type: "warning",
          message: `Candidate "${candidateName}" was created, but invitation email delivery failed: ${invitation.error || "Delivery error"}. You can retry sending the invitation below.`,
        });
      }
    } else {
      setNotification({
        type: "success",
        message: `Candidate "${candidateName}" was successfully added to the directory.`,
      });
    }

    setActiveTab("ALL");
    setPage(1);
    syncUrlParams({ scope: null, status: null });
    router.refresh();
  };

  const handleResendInvitation = async (candidate: CandidateDirectoryItem) => {
    if (resendingId) return;
    setResendingId(candidate.id);
    try {
      const res = await resendCandidateInvitationAction({ candidateId: candidate.id });
      if (res.success) {
        setNotification({
          type: "success",
          message: `Activation invitation email successfully sent to ${candidate.user.email}.`,
        });
      } else {
        setNotification({
          type: "warning",
          message: `Failed to send invitation to ${candidate.user.email}: ${res.error || "Email delivery failed"}`,
        });
      }
    } catch (err: any) {
      setNotification({
        type: "warning",
        message: `Failed to resend invitation: ${err?.message || "An unexpected error occurred"}`,
      });
    } finally {
      setResendingId(null);
    }
  };


  // Instant pure in-memory filtering & sorting (<2ms)
  const filteredCandidates = useMemo(() => {
    let result = candidateList;

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
  }, [candidateList, activeTab, currentUserId, searchTerm, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredCandidates.length / pageSize) || 1;
  const paginatedCandidates = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCandidates.slice(start, start + pageSize);
  }, [filteredCandidates, page, pageSize]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      {notification && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-[12px] border px-4 py-3 text-xs shadow-2xs animate-in fade-in-0 duration-150 ${
            notification.type === "warning"
              ? "border-amber-200/80 bg-amber-50/90 text-amber-900"
              : "border-emerald-200/80 bg-emerald-50/90 text-emerald-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "warning" ? (
              <svg className="h-4 w-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className={`text-xs font-semibold underline ml-4 ${
              notification.type === "warning"
                ? "text-amber-800 hover:text-amber-950"
                : "text-emerald-800 hover:text-emerald-950"
            }`}
          >
            Dismiss
          </button>
        </div>
      )}

      <WorkbenchShell ariaLabel="Candidate Directory Workbench">
        <WorkbenchHeader
          title="Candidate Directory"
          description="Candidate 360 overview, qualification status, active applications, and operational assignment."
          badge={`${candidateList.length} Roster`}
          badgeVariant="indigo"
          actions={
            canAddCandidate ? (
              <button
                type="button"
                id="add-candidate-button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-[#0B3B2C] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#0a3226] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]/50 active:scale-[0.98]"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Add Candidate</span>
              </button>
            ) : null
          }
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
                      <div className="flex flex-col gap-1 items-start">
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
                        {c.membershipStatus === "INVITED" && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold tracking-wide bg-amber-50 text-amber-700 border border-amber-200">
                            Invite Pending
                          </span>
                        )}
                      </div>
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
                      <div className="flex items-center justify-end gap-3">
                        {canAddCandidate && c.membershipStatus === "INVITED" && (
                          <button
                            type="button"
                            onClick={() => handleResendInvitation(c)}
                            disabled={resendingId === c.id}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B3B2C] hover:text-[#12A150] transition-colors disabled:opacity-50"
                            title="Resend activation invitation email"
                          >
                            {resendingId === c.id ? (
                              <>
                                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#0B3B2C] border-t-transparent" />
                                <span>Sending...</span>
                              </>
                            ) : (
                              <span>Resend Invite</span>
                            )}
                          </button>
                        )}
                        <TransitionLink
                          href={`/employee/candidates/${c.id}`}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold text-xs transition-colors"
                        >
                          Inspect 360 →
                        </TransitionLink>
                      </div>
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

      <AddCandidateModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleCandidateCreated}
        availableStaff={availableStaff}
      />
    </div>
  );
}

