"use client";

import { useEffect, useState } from "react";
import {
  getEmployeeWorkloadImpactAction,
  setEmployeeStatusAction,
  reassignOperationalWorkAction,
  type WorkloadImpact,
} from "@/lib/admin/actions";
import { type ManagerOption } from "./OnboardEmployeeWizard";

interface DeactivateMemberModalProps {
  employeeUserId: string;
  employeeName: string;
  potentialReassignees: ManagerOption[];
  onSuccess: () => void;
  onClose: () => void;
}

export function DeactivateMemberModal({
  employeeUserId,
  employeeName,
  potentialReassignees,
  onSuccess,
  onClose,
}: DeactivateMemberModalProps) {
  const [loadingImpact, setLoadingImpact] = useState(true);
  const [impact, setImpact] = useState<WorkloadImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);

  // Reassignment state
  const [showReassign, setShowReassign] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [reassignCandidates, setReassignCandidates] = useState(true);
  const [reassignApplications, setReassignApplications] = useState(true);
  const [reassignTasks, setReassignTasks] = useState(true);

  // Deactivation execution
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const availableReassignees = potentialReassignees.filter((p) => p.id !== employeeUserId);

  useEffect(() => {
    async function loadImpact() {
      setLoadingImpact(true);
      const res = await getEmployeeWorkloadImpactAction(employeeUserId);
      if (!res.success || !res.data) {
        setImpactError(res.error || "Failed to retrieve workload impact analysis.");
      } else {
        setImpact(res.data);
      }
      setLoadingImpact(false);
    }

    loadImpact();
  }, [employeeUserId]);

  async function handleConfirmDeactivation() {
    setIsProcessing(true);
    setActionError(null);

    // If reassign option is configured
    if (showReassign && targetUserId) {
      const reassignRes = await reassignOperationalWorkAction({
        sourceEmployeeUserId: employeeUserId,
        targetEmployeeId: targetUserId,
        reassignCandidates,
        reassignApplications,
        reassignTasks,
      });

      if (!reassignRes.success) {
        setActionError(reassignRes.error || "Failed to reassign workload before deactivation.");
        setIsProcessing(false);
        return;
      }
    }

    // Deactivate membership
    const deactRes = await setEmployeeStatusAction({
      employeeUserId,
      status: "INACTIVE",
    });

    if (!deactRes.success) {
      setActionError(deactRes.error || "Failed to deactivate employee.");
      setIsProcessing(false);
      return;
    }

    setIsProcessing(false);
    onSuccess();
    onClose();
  }

  const hasActiveWork =
    impact &&
    (impact.assignedCandidatesCount > 0 ||
      impact.activeApplicationsCount > 0 ||
      impact.openTasksCount > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-red-950 text-white flex justify-between items-center border-b border-red-900">
          <div>
            <h2 className="text-base font-bold tracking-tight text-red-100">
              Deactivate Operational Staff Member
            </h2>
            <p className="text-xs text-red-300">Safeguards & Workload Impact Analysis</p>
          </div>
          <button
            onClick={onClose}
            className="text-red-300 hover:text-white text-sm font-bold p-1 rounded hover:bg-red-900"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-sm text-slate-700">
          <p className="text-slate-800">
            You are initiating the deactivation of <span className="font-bold text-slate-900">{employeeName}</span>.
          </p>

          {actionError && (
            <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              {actionError}
            </div>
          )}

          {loadingImpact ? (
            <div className="p-6 text-center space-y-2">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-red-600" />
              <p className="text-xs text-slate-500">Calculating active workload & dependencies...</p>
            </div>
          ) : impactError ? (
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
              {impactError}
            </div>
          ) : impact ? (
            <div className="space-y-4">
              {/* Workload Impact Metrics Card */}
              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Current Operational Ownership
                </h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <p className="text-xl font-bold text-slate-900">{impact.assignedCandidatesCount}</p>
                    <p className="text-[11px] text-slate-500 font-medium">Candidates</p>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <p className="text-xl font-bold text-amber-700">{impact.activeApplicationsCount}</p>
                    <p className="text-[11px] text-slate-500 font-medium">Applications</p>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <p className="text-xl font-bold text-blue-700">{impact.openTasksCount}</p>
                    <p className="text-[11px] text-slate-500 font-medium">Open Tasks</p>
                  </div>
                </div>

                {hasActiveWork ? (
                  <div className="rounded bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900">
                    <p className="font-semibold">⚠️ Active Workload Detected</p>
                    <p className="mt-1">
                      This employee currently owns active operational items. Deactivating without reassignment may delay candidate workflows.
                    </p>
                  </div>
                ) : (
                  <div className="rounded bg-emerald-50 p-2.5 border border-emerald-200 text-xs text-emerald-800">
                    ✓ No active candidate or task workload is currently assigned to this employee.
                  </div>
                )}
              </div>

              {/* Reassignment Option */}
              {hasActiveWork && (
                <div className="space-y-3 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Reassign Operational Workload?</span>
                    <button
                      type="button"
                      onClick={() => setShowReassign(!showReassign)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-900 underline"
                    >
                      {showReassign ? "Cancel Reassignment" : "Configure Reassignment"}
                    </button>
                  </div>

                  {showReassign && (
                    <div className="rounded-lg bg-indigo-50/50 p-4 border border-indigo-200 space-y-3 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Transfer Ownership To Active Staff Member:
                        </label>
                        <select
                          value={targetUserId}
                          onChange={(e) => setTargetUserId(e.target.value)}
                          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">Select target employee...</option>
                          {availableReassignees.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.email}) — {a.role}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={reassignCandidates}
                            onChange={(e) => setReassignCandidates(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span>Transfer Assigned Candidates ({impact.assignedCandidatesCount})</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={reassignApplications}
                            onChange={(e) => setReassignApplications(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span>Transfer Active Applications ({impact.activeApplicationsCount})</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={reassignTasks}
                            onChange={(e) => setReassignTasks(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span>Transfer Open Assigned Tasks ({impact.openTasksCount})</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Immediate Consequence Warning */}
              <div className="rounded-md bg-red-50 p-3 text-xs text-red-800 border border-red-200 space-y-1">
                <p className="font-semibold">Security Action:</p>
                <p className="text-red-700">
                  Deactivation immediately revokes active Supabase sessions, changes membership status to INACTIVE, and blocks all platform authentication.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isProcessing || (showReassign && !targetUserId)}
            onClick={handleConfirmDeactivation}
            className="rounded-md bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
          >
            {isProcessing
              ? "Processing Deactivation..."
              : showReassign && targetUserId
              ? "Reassign Work & Deactivate"
              : "Confirm Immediate Deactivation"}
          </button>
        </div>
      </div>
    </div>
  );
}
