"use client";

import { useState } from "react";
import Link from "next/link";
import { updateTaskGovernancePolicyAction } from "@/lib/task/actions";
import {
  type OperationalRole,
  type TaskGovernancePolicyOutput,
  DEFAULT_TASK_GOVERNANCE_POLICY,
} from "@/lib/validation/task.schemas";

interface TaskGovernanceSettingsProps {
  initialPolicy: TaskGovernancePolicyOutput;
  organizationName: string;
}

interface RoleOption {
  id: OperationalRole;
  label: string;
  description: string;
  isCandidate?: boolean;
}

const OPERATIONAL_ROLES: RoleOption[] = [
  {
    id: "ADMIN",
    label: "Administrators",
    description: "Full tenant administration and operational oversight.",
  },
  {
    id: "MANAGER",
    label: "Managers",
    description: "Operational managers with active direct reporting staff.",
  },
  {
    id: "TEAM_LEAD",
    label: "Team Leads",
    description: "Functional leads managing team desks and assignment queues.",
  },
  {
    id: "EMPLOYEE",
    label: "Employees",
    description: "Operational staff executing prepared tasks and workflows.",
  },
  {
    id: "CANDIDATE",
    label: "Candidates",
    description: "External candidates with read-only portal access (Locked).",
    isCandidate: true,
  },
];

type PolicyKey = keyof TaskGovernancePolicyOutput;

export function TaskGovernanceSettings({
  initialPolicy,
  organizationName,
}: TaskGovernanceSettingsProps) {
  const [policy, setPolicy] = useState<TaskGovernancePolicyOutput>(initialPolicy);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const hasChanges =
    JSON.stringify(policy) !== JSON.stringify(initialPolicy);

  const toggleRole = (key: PolicyKey, role: OperationalRole) => {
    // Candidates are locked out of internal operational governance
    if (role === "CANDIDATE") return;

    setFeedback(null);
    setPolicy((prev) => {
      const currentList = prev[key];
      const exists = currentList.includes(role);

      let updatedList: OperationalRole[];
      if (exists) {
        // Prevent disabling ADMIN on create to ensure organization always has a task creator
        if (role === "ADMIN" && currentList.length === 1) {
          return prev;
        }
        updatedList = currentList.filter((r) => r !== role);
      } else {
        updatedList = [...currentList, role];
      }

      return {
        ...prev,
        [key]: updatedList,
      };
    });
  };

  const handleResetDefaults = () => {
    setFeedback(null);
    setPolicy(DEFAULT_TASK_GOVERNANCE_POLICY);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await updateTaskGovernancePolicyAction(policy);
      if (res.success && res.data) {
        setPolicy(res.data);
        setFeedback({
          type: "success",
          message: "Task governance policy updated and persisted successfully.",
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to update task governance policy.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "An unexpected network error occurred while saving.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderPolicySection = (
    key: PolicyKey,
    title: string,
    subtitle: string,
    description: string,
    footerNote?: string
  ) => {
    const activeRoles = policy[key];

    return (
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Section Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/75 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {title}
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                Authorization policy
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <span className="text-[11px] font-mono text-slate-500 bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs self-start sm:self-auto">
            {activeRoles.filter((r) => r !== "CANDIDATE").length} Roles Allowed
          </span>
        </div>

        {/* Section Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">{description}</p>

          <div className="divide-y divide-slate-100 border border-slate-200/70 rounded-md overflow-hidden bg-slate-50/30">
            {OPERATIONAL_ROLES.map((roleOpt) => {
              const isAllowed = activeRoles.includes(roleOpt.id);
              const isLocked = roleOpt.isCandidate;

              return (
                <div
                  key={roleOpt.id}
                  className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                    isLocked
                      ? "bg-slate-50/70 opacity-60 cursor-not-allowed"
                      : "hover:bg-white"
                  }`}
                >
                  <div className="space-y-0.5 max-w-lg">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {roleOpt.label}
                      </span>
                      {isLocked && (
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-200 text-slate-700">
                          Security Locked
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {roleOpt.description}
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span
                      className={`text-[11px] font-bold tracking-wider ${
                        isAllowed ? "text-blue-600" : "text-slate-400"
                      }`}
                    >
                      {isAllowed ? "ON" : "OFF"}
                    </span>
                    <button
                      type="button"
                      disabled={isLocked || isSaving}
                      onClick={() => toggleRole(key, roleOpt.id)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        isAllowed ? "bg-blue-600" : "bg-slate-300"
                      } ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                      aria-pressed={isAllowed}
                      aria-label={`Toggle ${roleOpt.label} for ${title}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          isAllowed ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {footerNote && (
            <div className="flex items-center space-x-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-md border border-slate-200/60">
              <svg
                className="w-4 h-4 text-slate-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{footerNote}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 max-w-5xl pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <Link href="/admin/settings" className="hover:text-slate-700">
            Settings
          </Link>
          <span>/</span>
          <span className="text-slate-500">Operations</span>
          <span>/</span>
          <span className="text-slate-900">Task Rules</span>
        </div>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Task Governance & Access Control
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Control task creation, assignment, escalation, and completion authority across organizational roles.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium bg-white text-slate-700 border border-slate-200 shadow-xs">
              Tenant: {organizationName}
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-lg border text-xs font-medium flex items-center justify-between ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === "success" ? (
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Policy Sections */}
      <div className="space-y-6">
        {/* Policy A: Task Creation */}
        {renderPolicySection(
          "canCreateRoles",
          "Task Governance — Task Creation Access",
          "Who can create operational tasks?",
          "Control which operational roles or permission groups can create internal tasks.",
          "Employees can still execute and complete tasks assigned to them."
        )}

        {/* Policy B: Task Assignment */}
        {renderPolicySection(
          "canAssignRoles",
          "Task Assignment Access",
          "Who can assign/reassign tasks?",
          "Control authority to assign unassigned backlog tasks or reassign work across staff members."
        )}

        {/* Policy C: Task Cancellation */}
        {renderPolicySection(
          "canCancelRoles",
          "Task Cancellation Access",
          "Who can cancel tasks?",
          "Control authority to terminate and cancel operational tasks."
        )}

        {/* Policy D: Task Escalation */}
        {renderPolicySection(
          "canEscalateRoles",
          "Task Escalation Access",
          "Who can escalate tasks?",
          "Control authority to place tasks into ESCALATED status for administrative triage."
        )}

        {/* Policy E: Task Completion */}
        {renderPolicySection(
          "canCompleteRoles",
          "Task Completion Access",
          "Who can complete tasks?",
          "Control authority to mark tasks as completed once checklist and review criteria are satisfied.",
          "Employees can complete tasks assigned to them when completion access is enabled."
        )}
      </div>

      {/* Sticky Save Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-slate-500">
          {hasChanges ? (
            <span className="text-blue-600 font-medium">
              ● Unsaved policy modifications pending
            </span>
          ) : (
            <span>All policies synchronized with database</span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors disabled:opacity-50"
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            disabled={isSaving || !hasChanges}
            onClick={handleSave}
            className="inline-flex items-center px-4 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving Changes...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
