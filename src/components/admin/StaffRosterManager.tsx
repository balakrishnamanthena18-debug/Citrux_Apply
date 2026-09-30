"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  setEmployeeStatusAction,
  updateEmployeeRoleAction,
  resendStaffActivationAction,
} from "@/lib/admin/actions";
import type { Role, MembershipStatus } from "@/generated/prisma";
import {
  OnboardEmployeeWizard,
  type DesignationOption,
  type ManagerOption,
} from "./OnboardEmployeeWizard";
import { DeactivateMemberModal } from "./DeactivateMemberModal";

export interface StaffMemberItem {
  id: string;
  userId: string;
  employeeId?: string | null;
  role: Role;
  status: MembershipStatus;
  department?: string | null;
  team?: string | null;
  joiningDate?: Date | string | null;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    phone?: string | null;
    personalEmail?: string | null;
  };
  designation?: {
    id: string;
    name: string;
    code?: string | null;
    status: string;
  } | null;
  reportingManager?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
}

interface StaffRosterManagerProps {
  currentUserId: string;
  members: StaffMemberItem[];
  designations: DesignationOption[];
  managers: ManagerOption[];
}

export function StaffRosterManager({
  currentUserId,
  members,
  designations,
  managers,
}: StaffRosterManagerProps) {
  const router = useRouter();
  const [memberList, setMemberList] = useState<StaffMemberItem[]>(members);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [designationFilter, setDesignationFilter] = useState<string>("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");

  // Action Menu open state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Deactivation state
  const [deactivatingMember, setDeactivatingMember] = useState<StaffMemberItem | null>(null);

  // Action status / banner
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (activeMenuId && !(event.target as HTMLElement).closest(".action-menu-container")) {
        setActiveMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeMenuId]);

  // Extract unique departments
  const uniqueDepartments = Array.from(
    new Set(memberList.map((m) => m.department).filter((d): d is string => Boolean(d)))
  ).sort();

  const filtered = memberList.filter((m) => {
    const fullName = `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.name || "";
    const matchesSearch =
      fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.employeeId && m.employeeId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.designation?.name && m.designation.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.department && m.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.team && m.team.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === "ALL" || m.status === statusFilter;
    const matchesRole = roleFilter === "ALL" || m.role === roleFilter;
    const matchesDesignation = designationFilter === "ALL" || m.designation?.id === designationFilter;
    const matchesDepartment = departmentFilter === "ALL" || m.department === departmentFilter;

    return matchesSearch && matchesStatus && matchesRole && matchesDesignation && matchesDepartment;
  });

  const isFiltered =
    searchTerm !== "" ||
    statusFilter !== "ALL" ||
    roleFilter !== "ALL" ||
    designationFilter !== "ALL" ||
    departmentFilter !== "ALL";

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("ALL");
    setRoleFilter("ALL");
    setDesignationFilter("ALL");
    setDepartmentFilter("ALL");
  }

  const totalMembers = memberList.length;
  const activeCount = memberList.filter((m) => m.status === "ACTIVE").length;
  const invitedCount = memberList.filter((m) => m.status === "INVITED").length;
  const deactivatedCount = memberList.filter((m) => m.status === "DEACTIVATED").length;

  async function handleRoleToggle(m: StaffMemberItem) {
    const nextRole = m.role === "ADMIN" ? "EMPLOYEE" : "ADMIN";
    setActionInProgress(m.id);
    setActionMessage(null);
    setActiveMenuId(null);

    // Optimistic local update
    setMemberList((prev) =>
      prev.map((item) => (item.id === m.id ? { ...item, role: nextRole } : item))
    );

    const res = await updateEmployeeRoleAction({
      employeeUserId: m.userId,
      role: nextRole,
    });

    setActionInProgress(null);
    if (!res.success) {
      // Revert on failure
      setMemberList(members);
      setActionMessage({ type: "error", text: res.error || "Failed to update member role." });
      return;
    }

    setActionMessage({
      type: "success",
      text: `Updated role for ${m.user.firstName ?? "Member"} to ${nextRole}.`,
    });
  }

  async function handleResendInvitation(m: StaffMemberItem) {
    setActionInProgress(m.id);
    setActionMessage(null);
    setActiveMenuId(null);

    const res = await resendStaffActivationAction({
      membershipId: m.id,
    });

    setActionInProgress(null);
    if (!res.success) {
      setActionMessage({ type: "error", text: res.error || "Failed to resend activation invitation." });
      return;
    }

    setActionMessage({
      type: "success",
      text: `New activation invitation dispatched to ${m.user.email}.`,
    });
  }

  async function handleReactivate(m: StaffMemberItem) {
    setActionInProgress(m.id);
    setActionMessage(null);
    setActiveMenuId(null);

    // Optimistic local reactivate
    setMemberList((prev) =>
      prev.map((item) =>
        item.id === m.id
          ? { ...item, status: "ACTIVE", user: { ...item.user, status: "ACTIVE" } }
          : item
      )
    );

    const res = await setEmployeeStatusAction({
      employeeUserId: m.userId,
      status: "ACTIVE",
    });

    setActionInProgress(null);
    if (!res.success) {
      setMemberList(members);
      setActionMessage({ type: "error", text: res.error || "Failed to reactivate member." });
      return;
    }

    setActionMessage({
      type: "success",
      text: `Account for ${m.user.firstName ?? "Member"} successfully reactivated.`,
    });
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Governance
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage employees, organizational structure and platform access.
          </p>
        </div>
        <div className="flex items-center space-x-2.5">
          <Link
            href="/admin/settings/designations"
            className="inline-flex items-center px-3.5 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
          >
            Manage Designations
          </Link>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 shadow-xs transition-colors"
          >
            + Onboard Employee
          </button>
        </div>
      </div>

      {/* Restrained Metric Strip */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
          <div className="p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Active Employees</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{activeCount}</div>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Pending Activation</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{invitedCount}</div>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Deactivated</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{deactivatedCount}</div>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Staff</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{totalMembers}</div>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-md text-xs border flex justify-between items-center ${
            actionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200/70"
              : "bg-red-50 text-red-800 border-red-200/70"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-semibold underline ml-4 hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-slate-300 pl-9 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Pending Activation</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="ALL">All Roles</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="ADMIN">Admin</option>
          </select>

          {/* Designation filter */}
          {designations.length > 0 && (
            <select
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 max-w-[160px] truncate"
            >
              <option value="ALL">All Designations</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          {/* Department filter */}
          {uniqueDepartments.length > 0 && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 max-w-[160px] truncate"
            >
              <option value="ALL">All Departments</option>
              {uniqueDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          )}

          {isFiltered && (
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 underline px-1"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="text-[11px] text-slate-400 font-medium">
          Showing {filtered.length} of {totalMembers} employees
        </div>
      </div>

      {/* Enterprise Employee Table */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-visible">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80">
            <thead className="bg-slate-50/75">
              <tr>
                <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Employee
                </th>
                <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Employee ID
                </th>
                <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Designation
                </th>
                <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Department / Team
                </th>
                <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Manager
                </th>
                <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-5 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-xs text-slate-500">
                    No employees match the specified filters.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const fullName = `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.name || "Employee";
                  const isSelf = m.userId === currentUserId;
                  const initials = fullName
                    .split(" ")
                    .map((s) => s[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "E";

                  const isMenuOpen = activeMenuId === m.id;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60 transition-colors h-14">
                      {/* Employee (Avatar + Name + Email) */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px] flex items-center justify-center flex-shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <Link
                                href={`/admin/members/${m.id}`}
                                className="text-xs font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate"
                              >
                                {fullName}
                              </Link>
                              {isSelf && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400 truncate">
                              {m.user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Employee ID */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        {m.employeeId ? (
                          <span className="font-mono font-medium text-xs text-slate-800">
                            {m.employeeId}
                          </span>
                        ) : m.status === "INVITED" ? (
                          <span className="text-xs text-amber-600 font-medium">Pending activation</span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Not assigned</span>
                        )}
                      </td>

                      {/* Designation */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        {m.designation?.name ? (
                          <div className="text-xs text-slate-800">
                            <span>{m.designation.name}</span>
                            {m.designation.status === "ARCHIVED" && (
                              <span className="text-slate-400 italic ml-1 text-[11px]">(Archived)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Not assigned</span>
                        )}
                      </td>

                      {/* Department / Team */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="text-xs text-slate-700">
                          {[m.department, m.team].filter(Boolean).join(" / ") || (
                            <span className="text-slate-400 italic">Not assigned</span>
                          )}
                        </div>
                      </td>

                      {/* Manager */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="text-xs text-slate-700">
                          {m.reportingManager ? (
                            `${m.reportingManager.firstName ?? ""} ${m.reportingManager.lastName ?? ""}`.trim() || m.reportingManager.email
                          ) : (
                            <span className="text-slate-400 italic">No manager assigned</span>
                          )}
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            m.role === "ADMIN"
                              ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                              : "bg-blue-50 text-blue-700 border border-blue-200/60"
                          }`}
                        >
                          {m.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                            m.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                              : m.status === "INVITED"
                              ? "bg-amber-50 text-amber-700 border-amber-200/60"
                              : "bg-slate-100 text-slate-600 border-slate-200/80"
                          }`}
                        >
                          {m.status === "INVITED" ? "PENDING" : m.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3 whitespace-nowrap text-right text-xs">
                        <div className="inline-flex items-center space-x-1.5 action-menu-container relative">
                          <Link
                            href={`/admin/members/${m.id}`}
                            className="px-2.5 py-1 rounded text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            Profile
                          </Link>

                          {/* Action Dropdown Trigger */}
                          <button
                            type="button"
                            onClick={() => setActiveMenuId(isMenuOpen ? null : m.id)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="More actions"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>

                          {/* Dropdown Menu */}
                          {isMenuOpen && (
                            <div className="absolute right-0 top-8 w-44 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-30 text-left">
                              {m.status === "INVITED" && (
                                <button
                                  type="button"
                                  disabled={actionInProgress === m.id}
                                  onClick={() => handleResendInvitation(m)}
                                  className="w-full px-3 py-1.5 text-xs text-left text-amber-700 hover:bg-amber-50 font-medium disabled:opacity-50"
                                >
                                  {actionInProgress === m.id ? "Sending..." : "Resend Invitation"}
                                </button>
                              )}

                              {!isSelf && (
                                <>
                                  <button
                                    type="button"
                                    disabled={actionInProgress === m.id}
                                    onClick={() => handleRoleToggle(m)}
                                    className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 font-medium disabled:opacity-50"
                                  >
                                    Set Role: {m.role === "ADMIN" ? "EMPLOYEE" : "ADMIN"}
                                  </button>

                                  <div className="my-1 border-t border-slate-100" />

                                  {m.status === "ACTIVE" ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        setDeactivatingMember(m);
                                      }}
                                      className="w-full px-3 py-1.5 text-xs text-left text-red-600 hover:bg-red-50 font-medium"
                                    >
                                      Deactivate Member
                                    </button>
                                  ) : m.status === "DEACTIVATED" ? (
                                    <button
                                      type="button"
                                      disabled={actionInProgress === m.id}
                                      onClick={() => handleReactivate(m)}
                                      className="w-full px-3 py-1.5 text-xs text-left text-emerald-700 hover:bg-emerald-50 font-medium disabled:opacity-50"
                                    >
                                      Reactivate Account
                                    </button>
                                  ) : null}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Onboard Wizard Modal */}
      {isWizardOpen && (
        <OnboardEmployeeWizard
          designations={designations}
          managers={managers}
          onSuccess={() => {
            setActionMessage({
              type: "success",
              text: "Employee provisioned successfully and welcome invitation dispatched.",
            });
            router.refresh();
          }}
          onClose={() => setIsWizardOpen(false)}
        />
      )}

      {/* Deactivate Impact Modal */}
      {deactivatingMember && (
        <DeactivateMemberModal
          employeeUserId={deactivatingMember.userId}
          employeeName={`${deactivatingMember.user.firstName ?? ""} ${deactivatingMember.user.lastName ?? ""}`.trim() || deactivatingMember.user.email}
          potentialReassignees={managers}
          onSuccess={() => {
            const targetId = deactivatingMember.userId;
            setMemberList((prev) =>
              prev.map((item) =>
                item.userId === targetId
                  ? { ...item, status: "DEACTIVATED", user: { ...item.user, status: "SUSPENDED" } }
                  : item
              )
            );
            setActionMessage({
              type: "success",
              text: "Employee successfully deactivated and sessions revoked.",
            });
          }}
          onClose={() => setDeactivatingMember(null)}
        />
      )}
    </div>
  );
}
