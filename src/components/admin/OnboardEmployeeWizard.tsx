"use client";

import { useState } from "react";
import { createEmployeeAction } from "@/lib/admin/actions";
import type { Role } from "@/generated/prisma";

export interface DesignationOption {
  id: string;
  name: string;
  code?: string | null;
  status: string;
}

export interface ManagerOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface OnboardEmployeeWizardProps {
  designations: DesignationOption[];
  managers: ManagerOption[];
  onSuccess?: () => void;
  onClose: () => void;
}

export function OnboardEmployeeWizard({
  designations,
  managers,
  onSuccess,
  onClose,
}: OnboardEmployeeWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1: Personal & Identity
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");

  // Step 2: Organizational Identity
  const [designationId, setDesignationId] = useState("");
  const [department, setDepartment] = useState("");
  const [team, setTeam] = useState("");
  const [reportingManagerId, setReportingManagerId] = useState("");
  const [isTeamLead, setIsTeamLead] = useState(false);
  const [teamLeadOf, setTeamLeadOf] = useState("");

  // Step 3: Employment Details
  const [employmentType, setEmploymentType] = useState<"FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | "CONSULTANT">("FULL_TIME");
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split("T")[0]);
  const [workLocation, setWorkLocation] = useState("");
  const [workMode, setWorkMode] = useState<"REMOTE" | "HYBRID" | "ONSITE">("REMOTE");

  // Step 4: System Access
  const [role, setRole] = useState<"EMPLOYEE" | "ADMIN">("EMPLOYEE");

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeDesignations = designations.filter((d) => d.status === "ACTIVE");

  function validateStep1() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("First Name, Last Name, and Work Email are required.");
      return false;
    }
    setError(null);
    return true;
  }

  function validateStep2() {
    setError(null);
    return true;
  }

  function validateStep3() {
    setError(null);
    return true;
  }

  function handleNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setStep((prev) => Math.min(5, prev + 1) as any);
  }

  function handleBack() {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1) as any);
  }

  async function handleCompleteSubmit() {
    setLoading(true);
    setError(null);

    const res = await createEmployeeAction({
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      personalEmail: personalEmail || undefined,
      designationId: designationId || undefined,
      department: department || undefined,
      team: team || undefined,
      reportingManagerId: reportingManagerId || undefined,
      isTeamLead,
      teamLeadOf: isTeamLead ? (teamLeadOf || team || undefined) : undefined,
      employmentType,
      joiningDate: joiningDate ? new Date(joiningDate).toISOString() : undefined,
      workLocation: workLocation || undefined,
      workMode,
      role,
    });

    if (!res.success) {
      setError(res.error || "Failed to provision employee.");
      setLoading(false);
      return;
    }

    setLoading(false);
    if (onSuccess) onSuccess();
    onClose();
  }

  const selectedDesignation = designations.find((d) => d.id === designationId);
  const selectedManager = managers.find((m) => m.id === reportingManagerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Wizard Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold tracking-tight">Onboard New Operational Employee</h2>
            <p className="text-xs text-slate-400">Step {step} of 5: Enterprise Provisioning Flow</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm font-bold p-1 rounded hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Step Indicator */}
        <div className="bg-slate-100 px-6 py-2.5 border-b border-slate-200 flex justify-between items-center text-xs">
          {[
            { num: 1, label: "Identity" },
            { num: 2, label: "Organization" },
            { num: 3, label: "Employment" },
            { num: 4, label: "Access" },
            { num: 5, label: "Review" },
          ].map((s) => (
            <div
              key={s.num}
              className={`flex items-center space-x-1.5 ${
                step === s.num
                  ? "font-bold text-slate-900"
                  : step > s.num
                  ? "text-emerald-700 font-medium"
                  : "text-slate-400"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  step === s.num
                    ? "bg-slate-900 text-white"
                    : step > s.num
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {step > s.num ? "✓" : s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mx-6 mt-4 rounded-md bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {/* Wizard Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-sm text-slate-700">
          {/* STEP 1: Personal & Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                1. Personal & Identity Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Work Email <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane.doe@company.com"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Primary corporate identity used for system authentication and notifications.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Personal Email (Optional)</label>
                  <input
                    type="email"
                    value={personalEmail}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Organizational Identity */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                2. Organizational Identity & Reporting
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Designation / Official Title
                </label>
                <select
                  value={designationId}
                  onChange={(e) => setDesignationId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">Select a title (Optional)...</option>
                  {activeDesignations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.code ? `(${d.code})` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Titles represent organizational standing and do not grant administrative permissions.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Department</label>
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Operations, Engineering"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Team / Pod</label>
                  <input
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    placeholder="e.g. Core Desk, Verification"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Reporting Manager</label>
                <select
                  value={reportingManagerId}
                  onChange={(e) => setReportingManagerId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">No Direct Manager (Top-level or Executive)</option>
                  {managers.map((m) => (
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
                    id="isTeamLeadWizard"
                    checked={isTeamLead}
                    onChange={(e) => setIsTeamLead(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  <label htmlFor="isTeamLeadWizard" className="text-xs font-semibold text-slate-800">
                    Assign as Operational Team Lead
                  </label>
                </div>
                <p className="text-[11px] text-slate-500">
                  Grants operational governance authority to create tasks for their team scope, independent of official Designation.
                </p>
                {isTeamLead && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700">Team Lead Scope / Team Name</label>
                    <input
                      value={teamLeadOf}
                      onChange={(e) => setTeamLeadOf(e.target.value)}
                      placeholder={team || "e.g. Core Desk"}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Employment Details */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                3. Employment Details & Work Setup
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Employment Type</label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as any)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="FULL_TIME">Full Time</option>
                    <option value="PART_TIME">Part Time</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="INTERN">Intern</option>
                    <option value="CONSULTANT">Consultant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Joining Date</label>
                  <input
                    type="date"
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Work Mode</label>
                  <select
                    value={workMode}
                    onChange={(e) => setWorkMode(e.target.value as any)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="REMOTE">Remote</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="ONSITE">Onsite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Work Location</label>
                  <input
                    value={workLocation}
                    onChange={(e) => setWorkLocation(e.target.value)}
                    placeholder="e.g. San Francisco HQ, London"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              </div>

              <div className="rounded-md bg-slate-50 p-3 border border-slate-200">
                <p className="text-xs font-semibold text-slate-800">Employee Identifier:</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  An authoritative sequential identifier (e.g. <span className="font-mono font-semibold">CIT-EMP-XXXX</span>) will be automatically allocated upon confirmation.
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: System Access */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                4. System Access & Security Role
              </h3>

              <div className="space-y-3">
                <label
                  onClick={() => setRole("EMPLOYEE")}
                  className={`flex items-start p-4 rounded-lg border cursor-pointer transition-all ${
                    role === "EMPLOYEE"
                      ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="roleSelection"
                    checked={role === "EMPLOYEE"}
                    onChange={() => setRole("EMPLOYEE")}
                    className="mt-1 text-slate-900 focus:ring-slate-900"
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-bold text-slate-900">EMPLOYEE (Standard Operational Access)</span>
                    <span className="block text-xs text-slate-500 mt-1">
                      Can process applications, manage candidate tasks, participate in communications, and perform operational workflows.
                    </span>
                  </div>
                </label>

                <label
                  onClick={() => setRole("ADMIN")}
                  className={`flex items-start p-4 rounded-lg border cursor-pointer transition-all ${
                    role === "ADMIN"
                      ? "border-purple-600 bg-purple-50/50 ring-1 ring-purple-600"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="roleSelection"
                    checked={role === "ADMIN"}
                    onChange={() => setRole("ADMIN")}
                    className="mt-1 text-purple-600 focus:ring-purple-600"
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-bold text-purple-900">ADMIN (Full Governance & Security Access)</span>
                    <span className="block text-xs text-purple-700/80 mt-1">
                      Full access to member management, system audit logs, designation catalog, security settings, and organization configuration.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 5: Review & Create */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                5. Review Employee Provisioning Summary
              </h3>

              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">Name:</span>
                    <p className="font-semibold text-slate-900">{firstName} {lastName}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Work Email:</span>
                    <p className="font-mono text-slate-900">{email}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Phone:</span>
                    <p className="text-slate-900">{phone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Personal Email:</span>
                    <p className="text-slate-900">{personalEmail || "—"}</p>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">Designation:</span>
                    <p className="font-semibold text-slate-900">{selectedDesignation?.name || "None specified"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Department / Team:</span>
                    <p className="text-slate-900">{[department, team].filter(Boolean).join(" / ") || "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Reporting Manager:</span>
                    <p className="text-slate-900">{selectedManager?.name || "None"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Employment Type:</span>
                    <p className="text-slate-900">{employmentType} ({workMode})</p>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500">Assigned System Role:</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold mt-0.5 ${
                      role === "ADMIN" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                    }`}>
                      {role}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Account Initial Status:</span>
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 mt-0.5">
                      INVITED (Pending Activation)
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-800 border border-blue-200">
                <p className="font-semibold">Automated Next Steps:</p>
                <p className="mt-1 text-blue-700">
                  Upon creation, an invitation email with a single-use 48-hour activation link will be automatically dispatched to <span className="font-mono font-medium">{email}</span>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Navigation Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <button
            type="button"
            onClick={step === 1 ? onClose : handleBack}
            className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {step === 1 ? "Cancel" : "← Back"}
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 shadow-sm"
            >
              Continue to Step {step + 1} →
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={handleCompleteSubmit}
              className="rounded-md bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow-sm disabled:opacity-50"
            >
              {loading ? "Provisioning Staff..." : "✓ Confirm & Dispatch Invitation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
