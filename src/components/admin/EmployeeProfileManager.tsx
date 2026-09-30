"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateEmployeeDesignationAction,
  updateEmployeeOrganizationAction,
  updateEmployeeRoleAction,
  setEmployeeStatusAction,
  resendStaffActivationAction,
} from "@/lib/admin/actions";
import type { Role, MembershipStatus, AuditAction } from "@/generated/prisma";
import { type DesignationOption, type ManagerOption } from "./OnboardEmployeeWizard";
import { DeactivateMemberModal } from "./DeactivateMemberModal";

export interface EmployeeProfileData {
  id: string;
  userId: string;
  employeeId?: string | null;
  role: Role;
  status: MembershipStatus;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  joiningDate?: Date | string | null;
  workLocation?: string | null;
  workMode?: string | null;
  phone?: string | null;
  personalEmail?: string | null;
  activatedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    createdAt: Date | string;
    status: string;
  };
  designation?: {
    id: string;
    name: string;
    code?: string | null;
    status: string;
  } | null;
  reportingManagerId?: string | null;
  isTeamLead?: boolean;
  teamLeadOf?: string | null;
  reportingManager?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorType: string;
  actorId?: string | null;
  createdAt: Date | string;
  details?: any;
}

interface EmployeeProfileManagerProps {
  currentUserId: string;
  member: EmployeeProfileData;
  designations: DesignationOption[];
  managers: ManagerOption[];
  auditLogs: AuditLogEntry[];
}

export function EmployeeProfileManager({
  currentUserId,
  member,
  designations,
  managers,
  auditLogs,
}: EmployeeProfileManagerProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<EmployeeProfileData>(member);
  const isSelf = profile.userId === currentUserId;

  // Edit Designation Modal
  const [isDesignationModalOpen, setIsDesignationModalOpen] = useState(false);
  const [selectedDesignationId, setSelectedDesignationId] = useState(profile.designation?.id || "");
  const [designationLoading, setDesignationLoading] = useState(false);

  // Edit Organization Modal
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [dept, setDept] = useState(profile.department || "");
  const [teamVal, setTeamVal] = useState(profile.team || "");
  const [managerId, setManagerId] = useState(profile.reportingManagerId || "");
  const [isTeamLeadVal, setIsTeamLeadVal] = useState(profile.isTeamLead || false);
  const [teamLeadOfVal, setTeamLeadOfVal] = useState(profile.teamLeadOf || "");
  const [workLoc, setWorkLoc] = useState(profile.workLocation || "");
  const [workMod, setWorkMod] = useState(profile.workMode || "REMOTE");
  const [empType, setEmpType] = useState(profile.employmentType || "FULL_TIME");
  const [phoneVal, setPhoneVal] = useState(profile.phone || "");
  const [personalEmailVal, setPersonalEmailVal] = useState(profile.personalEmail || "");
  const [orgLoading, setOrgLoading] = useState(false);

  // Deactivation Modal
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);

  // Notifications
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const activeDesignations = designations.filter((d) => d.status === "ACTIVE" || d.id === profile.designation?.id);
  const eligibleManagers = managers.filter((m) => m.id !== profile.userId);

  const fullName = `${profile.user.firstName ?? ""} ${profile.user.lastName ?? ""}`.trim() || profile.user.email || "Employee";

  async function handleUpdateDesignation(e: React.FormEvent) {
    e.preventDefault();
    setDesignationLoading(true);
    setBanner(null);

    const res = await updateEmployeeDesignationAction({
      membershipId: profile.id,
      designationId: selectedDesignationId || null,
    });

    setDesignationLoading(false);
    if (!res.success) {
      setBanner({ type: "error", text: res.error || "Failed to update designation." });
      return;
    }

    const matchedDesig = designations.find((d) => d.id === selectedDesignationId);
    setProfile((prev) => ({
      ...prev,
      designation: matchedDesig ? { id: matchedDesig.id, name: matchedDesig.name, status: "ACTIVE" } : null,
    }));
    setIsDesignationModalOpen(false);
    setBanner({ type: "success", text: "Employee designation successfully updated." });
  }

  async function handleUpdateOrganization(e: React.FormEvent) {
    e.preventDefault();
    setOrgLoading(true);
    setBanner(null);

    const res = await updateEmployeeOrganizationAction({
      membershipId: profile.id,
      department: dept || null,
      team: teamVal || null,
      reportingManagerId: managerId || null,
      isTeamLead: isTeamLeadVal,
      teamLeadOf: isTeamLeadVal ? (teamLeadOfVal || teamVal || null) : null,
    });

    setOrgLoading(false);
    if (!res.success) {
      setBanner({ type: "error", text: res.error || "Failed to update organization details." });
      return;
    }

    setProfile((prev) => ({
      ...prev,
      department: dept || null,
      team: teamVal || null,
      reportingManagerId: managerId || null,
      isTeamLead: isTeamLeadVal,
      teamLeadOf: isTeamLeadVal ? (teamLeadOfVal || teamVal || null) : null,
    }));
    setIsOrgModalOpen(false);
    setBanner({ type: "success", text: "Organizational profile successfully updated." });
  }

  async function handleRoleSwitch() {
    const nextRole = profile.role === "ADMIN" ? "EMPLOYEE" : "ADMIN";
    setActionLoading(true);
    setBanner(null);

    // Optimistic local update
    setProfile((prev) => ({ ...prev, role: nextRole }));

    const res = await updateEmployeeRoleAction({
      employeeUserId: profile.userId,
      role: nextRole,
    });

    setActionLoading(false);
    if (!res.success) {
      setProfile(member);
      setBanner({ type: "error", text: res.error || "Failed to update role." });
      return;
    }

    setBanner({ type: "success", text: `Assigned role changed to ${nextRole}.` });
  }

  async function handleResendInvite() {
    setActionLoading(true);
    setBanner(null);

    const res = await resendStaffActivationAction({
      membershipId: profile.id,
    });

    setActionLoading(false);
    if (!res.success) {
      setBanner({ type: "error", text: res.error || "Failed to resend activation invitation." });
      return;
    }

    setBanner({ type: "success", text: `New activation link emailed to ${profile.user.email}.` });
  }

  async function handleReactivate() {
    setActionLoading(true);
    setBanner(null);

    // Optimistic local update
    setProfile((prev) => ({
      ...prev,
      status: "ACTIVE",
      user: { ...prev.user, status: "ACTIVE" },
    }));

    const res = await setEmployeeStatusAction({
      employeeUserId: profile.userId,
      status: "ACTIVE",
    });

    setActionLoading(false);
    if (!res.success) {
      setProfile(member);
      setBanner({ type: "error", text: res.error || "Failed to reactivate employee." });
      return;
    }

    setBanner({ type: "success", text: "Employee account has been reactivated." });
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs">
            <Link href="/admin/members" className="font-semibold text-slate-500 hover:text-slate-800">
              Staff Directory
            </Link>
            <span className="text-slate-400">/</span>
            <span className="font-semibold text-slate-900">{fullName}</span>
          </div>
          <div className="flex items-center space-x-3 mt-1">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{fullName}</h1>
            {member.employeeId && (
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-900 text-white shadow-xs">
                {member.employeeId}
              </span>
            )}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                member.status === "ACTIVE"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                  : member.status === "INVITED"
                  ? "bg-amber-50 text-amber-700 border-amber-200/60"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {member.status === "INVITED" ? "PENDING ACTIVATION" : member.status}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          {member.status === "INVITED" && (
            <button
              disabled={actionLoading}
              onClick={handleResendInvite}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 shadow-xs transition-colors disabled:opacity-50"
            >
              Resend Invitation Email
            </button>
          )}

          {!isSelf && (
            <>
              {member.status === "ACTIVE" ? (
                <button
                  onClick={() => setIsDeactivateOpen(true)}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-red-700 bg-white border border-red-300 hover:bg-red-50 shadow-xs transition-colors"
                >
                  Deactivate Account
                </button>
              ) : member.status === "DEACTIVATED" ? (
                <button
                  disabled={actionLoading}
                  onClick={handleReactivate}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 shadow-xs transition-colors disabled:opacity-50"
                >
                  Reactivate Account
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`p-3.5 rounded-md text-xs border flex justify-between items-center ${
            banner.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200/70"
              : "bg-red-50 text-red-800 border-red-200/70"
          }`}
        >
          <span>{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-xs font-semibold underline ml-4 hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Profile Details + Audit Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Identity, Org, Employment, Access */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identity & Contact Card */}
          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                1. Personal & Identity
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 font-medium">Full Name</span>
                <p className="font-semibold text-slate-900 text-sm mt-0.5">{fullName}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Work Email</span>
                <p className="font-mono text-slate-900 mt-0.5">{member.user.email}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Phone Number</span>
                <p className="text-slate-900 mt-0.5">{member.phone || <span className="text-slate-400 italic">Not assigned</span>}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Personal Email</span>
                <p className="text-slate-900 mt-0.5">{member.personalEmail || <span className="text-slate-400 italic">Not assigned</span>}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">System UUID</span>
                <p className="font-mono text-slate-500 text-[11px] mt-0.5">{member.userId}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Authoritative Employee ID</span>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{member.employeeId || <span className="text-slate-400 italic">Not assigned</span>}</p>
              </div>
            </div>
          </div>

          {/* Organizational Identity Card */}
          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                2. Organizational Identity & Structure
              </h2>
              <button
                type="button"
                onClick={() => setIsOrgModalOpen(true)}
                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
              >
                Edit Organization Info
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-slate-500 font-medium">Designation / Title</span>
                  <button
                    type="button"
                    onClick={() => setIsDesignationModalOpen(true)}
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors"
                  >
                    Change
                  </button>
                </div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  {member.designation ? (
                    <>
                      {member.designation.name}
                      {member.designation.status === "ARCHIVED" && (
                        <span className="text-slate-400 italic ml-1">(Archived)</span>
                      )}
                      {member.designation.code && (
                        <span className="font-mono text-slate-500 text-[11px] ml-1.5">
                          [{member.designation.code}]
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 italic">No designation assigned</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Reporting Manager</span>
                <p className="font-medium text-slate-900 mt-0.5">
                  {member.reportingManager ? (
                    `${member.reportingManager.firstName ?? ""} ${member.reportingManager.lastName ?? ""}`.trim() ||
                    member.reportingManager.email
                  ) : (
                    <span className="text-slate-400 italic">None (Direct Report to Organization)</span>
                  )}
                </p>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Department</span>
                <p className="text-slate-900 mt-0.5">{member.department || <span className="text-slate-400 italic">Not assigned</span>}</p>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Team / Pod</span>
                <p className="text-slate-900 mt-0.5">{member.team || <span className="text-slate-400 italic">Not assigned</span>}</p>
              </div>

              <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                <span className="text-slate-500 font-medium">Operational Authority</span>
                <div className="mt-1 flex items-center gap-2">
                  {member.isTeamLead || member.teamLeadOf ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      Team Lead for: {member.teamLeadOf || member.team || "Assigned Team Scope"}
                    </span>
                  ) : (
                    <span className="text-slate-500 text-xs font-normal">Standard Team Contributor (Not a Team Lead)</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Employment & Logistics Card */}
          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                3. Employment & Logistics
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 font-medium">Employment Type</span>
                <p className="font-medium text-slate-900 mt-0.5">{member.employmentType || "FULL_TIME"}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Work Mode</span>
                <p className="font-medium text-slate-900 mt-0.5">{member.workMode || "REMOTE"}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Location</span>
                <p className="text-slate-900 mt-0.5">{member.workLocation || <span className="text-slate-400 italic">Not assigned</span>}</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Joining Date</span>
                <p className="text-slate-900 mt-0.5">
                  {member.joiningDate
                    ? new Date(member.joiningDate).toLocaleDateString()
                    : <span className="text-slate-400 italic">Not assigned</span>}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Access, Security & Audit Trail */}
        <div className="space-y-6">
          {/* Access & Security Card */}
          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-3">
              Platform Access & Security
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Security Role</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                    member.role === "ADMIN"
                      ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                      : "bg-blue-50 text-blue-700 border border-blue-200/60"
                  }`}
                >
                  {member.role}
                </span>
              </div>

              {!isSelf && (
                <div className="pt-1">
                  <button
                    disabled={actionLoading}
                    onClick={handleRoleSwitch}
                    className="w-full text-center rounded-md border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors disabled:opacity-50"
                  >
                    Switch to {member.role === "ADMIN" ? "EMPLOYEE" : "ADMIN"}
                  </button>
                </div>
              )}

              <div className="border-t border-slate-100 pt-2 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Account Created</span>
                  <span className="text-slate-800">{new Date(member.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Activated At</span>
                  <span className="text-slate-800">
                    {member.activatedAt
                      ? new Date(member.activatedAt).toLocaleString()
                      : <span className="text-amber-600 font-medium">Pending Activation</span>}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Trail Timeline */}
          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-3">
              Employee Audit History ({auditLogs.length})
            </h2>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No audit records logged yet.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {auditLogs.map((log) => (
                  <div key={log.id} className="border-l-2 border-slate-200 pl-3 py-1 text-xs space-y-0.5">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-900">{log.action}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11px]">
                      Actor: <span className="font-mono">{log.actorType}</span>
                    </p>
                    {log.details && (
                      <pre className="mt-1 rounded bg-slate-50 p-1.5 text-[10px] text-slate-600 font-mono overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Designation Modal */}
      {isDesignationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Change Employee Designation</h3>
              <button
                onClick={() => setIsDesignationModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateDesignation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Official Title / Designation</label>
                <select
                  value={selectedDesignationId}
                  onChange={(e) => setSelectedDesignationId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">No Designation (Unassigned)</option>
                  {activeDesignations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.code ? `(${d.code})` : ""} {d.status === "ARCHIVED" ? "[Archived]" : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Changing title updates organizational record and records an audit event.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsDesignationModalOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={designationLoading}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {designationLoading ? "Saving..." : "Save Designation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Organization Modal */}
      {isOrgModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Update Organization & Employment Details</h3>
              <button
                onClick={() => setIsOrgModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateOrganization} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Department</label>
                  <input
                    value={dept}
                    onChange={(e) => setDept(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Team / Pod</label>
                  <input
                    value={teamVal}
                    onChange={(e) => setTeamVal(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Reporting Manager</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">No Direct Manager (Top-level)</option>
                  {eligibleManagers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.email}) — {m.role}
                    </option>
                  ))}
                </select>
              </div>

              {/* Operational Team Lead structural configuration */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isTeamLeadModal"
                    checked={isTeamLeadVal}
                    onChange={(e) => setIsTeamLeadVal(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  <label htmlFor="isTeamLeadModal" className="text-xs font-semibold text-slate-800">
                    Assign Operational Team Lead Authority
                  </label>
                </div>
                <p className="text-[11px] text-slate-500">
                  Grants operational governance authority to create and manage tasks for their team scope, independent of Designation.
                </p>
                {isTeamLeadVal && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">Team Lead Scope / Team Name</label>
                    <input
                      value={teamLeadOfVal}
                      onChange={(e) => setTeamLeadOfVal(e.target.value)}
                      placeholder={teamVal || "e.g. Engineering Operations"}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Work Location</label>
                  <input
                    value={workLoc}
                    onChange={(e) => setWorkLoc(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Work Mode</label>
                  <select
                    value={workMod}
                    onChange={(e) => setWorkMod(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="REMOTE">Remote</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="ONSITE">Onsite</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Phone</label>
                  <input
                    value={phoneVal}
                    onChange={(e) => setPhoneVal(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Personal Email</label>
                  <input
                    value={personalEmailVal}
                    onChange={(e) => setPersonalEmailVal(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsOrgModalOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={orgLoading}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {orgLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Impact Modal */}
      {isDeactivateOpen && (
        <DeactivateMemberModal
          employeeUserId={member.userId}
          employeeName={fullName}
          potentialReassignees={eligibleManagers}
          onSuccess={() => {
            setBanner({
              type: "success",
              text: "Employee deactivated and all active sessions revoked.",
            });
            router.refresh();
          }}
          onClose={() => setIsDeactivateOpen(false)}
        />
      )}
    </div>
  );
}
