"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { assignApplicationAction } from "@/lib/application/actions";
import { AppToast } from "@/components/ui/dialog/AppToast";

export interface AssigneeOption {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  role?: string;
}

export interface ApplicationOwnershipCardProps {
  applicationId: string;
  currentAssigneeId: string | null;
  assigneeName: string;
  ownerInactive?: boolean;
  formerOwnerName?: string | null;
  continuityOutsideScope?: boolean;
  assigneeOptions: AssigneeOption[];
  allowUnassigned?: boolean;
}

function getAssigneeDisplayName(option?: AssigneeOption | null): string {
  if (!option) return "Unassigned";
  return (
    [option.firstName, option.lastName].filter(Boolean).join(" ") ||
    option.email ||
    "Specialist"
  );
}

export function ApplicationOwnershipCard({
  applicationId,
  currentAssigneeId,
  assigneeName: initialAssigneeName,
  ownerInactive = false,
  formerOwnerName = null,
  continuityOutsideScope = false,
  assigneeOptions = [],
  allowUnassigned = false,
}: ApplicationOwnershipCardProps) {
  const router = useRouter();

  // Determine initial selected value
  const initialSelectedId =
    currentAssigneeId &&
    assigneeOptions.some((e) => e.userId === currentAssigneeId)
      ? currentAssigneeId
      : allowUnassigned
        ? ""
        : assigneeOptions[0]?.userId || "";

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialSelectedId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayedAssigneeName, setDisplayedAssigneeName] = useState(initialAssigneeName);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    type: "success" | "error";
  }>({
    open: false,
    message: "",
    type: "success",
  });

  // Sync if initial props change
  const [prevInitialAssigneeName, setPrevInitialAssigneeName] = useState(initialAssigneeName);
  if (prevInitialAssigneeName !== initialAssigneeName) {
    setPrevInitialAssigneeName(initialAssigneeName);
    setDisplayedAssigneeName(initialAssigneeName);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setError(null);
    setSuccessMessage(null);
    setBusy(true);
    setSubmitStatus("Saving Assignee…");

    try {
      const targetId = selectedEmployeeId ? selectedEmployeeId : null;
      const res = await assignApplicationAction({
        applicationId,
        employeeId: targetId,
        reason: reason.trim() || null,
      });

      if (!res.success) {
        const errorText = res.error || "Failed to update application ownership.";
        setError(errorText);
        setToast({
          open: true,
          message: errorText,
          type: "error",
        });
        return;
      }

      // Find the display label for the assigned specialist
      const targetOption = assigneeOptions.find((o) => o.userId === targetId);
      const newLabel = targetId ? getAssigneeDisplayName(targetOption) : "Unassigned";

      setDisplayedAssigneeName(newLabel);
      setReason("");

      const msg = targetId
        ? `Application assigned to ${newLabel} successfully.`
        : "Application unassigned successfully.";

      setSuccessMessage(msg);
      setToast({
        open: true,
        message: msg,
        type: "success",
      });

      // Refresh server components
      router.refresh();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to update assignment.";
      setError(errorMsg);
      setToast({
        open: true,
        message: errorMsg,
        type: "error",
      });
    } finally {
      setBusy(false);
      setSubmitStatus(null);
    }
  };

  return (
    <>
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
        {/* Header */}
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Application Ownership
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Authoritative specialist assignment
          </p>
        </div>

        {/* Current Assignee Display */}
        <div className="text-xs text-slate-600">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
            Current Assignee
          </span>
          {ownerInactive ? (
            <div
              aria-label={
                formerOwnerName
                  ? `Owner inactive. Former owner: ${formerOwnerName}`
                  : "Owner inactive"
              }
              className="p-3 bg-amber-50 rounded-xl border border-amber-200/80"
            >
              <span className="font-bold text-amber-900">Inactive</span>
              {formerOwnerName && (
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Former owner: {formerOwnerName}
                </div>
              )}
              <p className="text-[11px] text-amber-800 mt-1">
                This application needs reassignment to an active eligible employee.
              </p>
            </div>
          ) : displayedAssigneeName === "Unassigned" ? (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="font-semibold text-slate-500 italic">Unassigned</span>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <span className="font-bold text-slate-900 text-sm">
                {displayedAssigneeName}
              </span>
              {continuityOutsideScope && (
                <div
                  className="mt-1.5"
                  aria-label="Continuity: outside current structural scope"
                >
                  <div className="text-[10px] uppercase tracking-wider text-amber-800 font-bold">
                    Continuity Indicator
                  </div>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    Outside current scope — owner remains active; reassign only if operational ownership should move.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reassignment Form or Empty Notice */}
        {assigneeOptions.length === 0 && !allowUnassigned ? (
          <p className="text-xs text-slate-500 italic">
            No eligible team members are available for reassignment under your authority.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            data-testid="application-ownership-form"
            className="space-y-3 pt-2 text-xs"
          >
            <div>
              <label
                htmlFor="assignee-select"
                className="block font-semibold text-slate-800 mb-1"
              >
                Reassign Specialist
              </label>
              <select
                id="assignee-select"
                data-testid="assignee-select"
                name="employeeId"
                disabled={busy}
                value={selectedEmployeeId}
                onChange={(e) => {
                  setSelectedEmployeeId(e.target.value);
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-60 disabled:bg-slate-100 transition"
              >
                {allowUnassigned && <option value="">Unassigned</option>}
                {assigneeOptions.map((e) => (
                  <option key={e.userId} value={e.userId}>
                    {getAssigneeDisplayName(e)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <input
                id="reassign-reason-input"
                data-testid="reassign-reason-input"
                type="text"
                name="reason"
                maxLength={500}
                disabled={busy}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reassignment reason (optional)..."
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-60 disabled:bg-slate-100 transition"
              />
            </div>

            {/* Success Feedback Alert */}
            {successMessage && (
              <div
                role="status"
                aria-live="polite"
                data-testid="assignment-success-alert"
                className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-600 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>{successMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="text-emerald-700 hover:text-emerald-900 font-bold text-xs p-1"
                  aria-label="Dismiss success message"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Error Feedback Alert */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                data-testid="assignment-error-alert"
                className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-rose-600 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-rose-700 hover:text-rose-900 font-bold text-xs p-1"
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Submit Action Button with Active Visual States */}
            <button
              id="save-assignee-btn"
              data-testid="save-assignee-btn"
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-xl text-xs transition shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              {busy && (
                <svg
                  className="animate-spin h-3.5 w-3.5 text-white shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              )}
              <span>{busy ? (submitStatus || "Saving Assignee…") : "Save Assignee"}</span>
            </button>
          </form>
        )}
      </div>

      {/* Floating App Toast for Global Confirmation */}
      <AppToast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        durationMs={4000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
