"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationOutcomeType } from "@/generated/prisma";
import { STAFF_OUTCOME_LABELS } from "@/lib/application/outcome-labels";
import type { OutcomePresentation } from "@/lib/application/outcome-service";
import {
  createStaffOutcomeAction,
  generateOutcomeEvidenceUploadUrlAction,
  getOutcomeEvidenceDownloadUrlAction,
  verifyOutcomeAction,
  voidOutcomeAction,
} from "@/lib/application/outcome-actions";

const STAFF_TYPES = Object.keys(STAFF_OUTCOME_LABELS) as ApplicationOutcomeType[];

function formatWhen(iso: string | null): string {
  if (!iso) return "Date unknown";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  applicationId: string;
  outcomes: OutcomePresentation[];
  canRecord: boolean;
}

export function StaffOutcomesPanel({
  applicationId,
  outcomes,
  canRecord,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [outcomeType, setOutcomeType] =
    useState<ApplicationOutcomeType>("RECRUITER_CONTACT");
  const [occurredAt, setOccurredAt] = useState("");
  const [notes, setNotes] = useState("");
  const [candidateVisible, setCandidateVisible] = useState(true);
  const [evidenceText, setEvidenceText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [evidenceShareable, setEvidenceShareable] = useState(false);
  const [voidReasonById, setVoidReasonById] = useState<Record<string, string>>(
    {}
  );

  const active = outcomes.filter((o) => o.isActive);
  const inactive = outcomes.filter((o) => !o.isActive);
  const visibleList = showHistory ? outcomes : active;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccessMessage(null);
    setBusy(true);
    setSubmitStatus("Recording outcome…");

    try {
      let storagePath: string | null = null;

      if (selectedFile) {
        setSubmitStatus("Uploading evidence…");
        const res = await generateOutcomeEvidenceUploadUrlAction({
          applicationId,
          filename: selectedFile.name,
        });

        if (!res.success || !res.uploadUrl?.signedUrl) {
          throw new Error("Evidence upload failed. The outcome was not recorded.");
        }

        const put = await fetch(res.uploadUrl.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": selectedFile.type || "application/octet-stream",
          },
          body: selectedFile,
        });

        if (!put.ok) {
          throw new Error("Evidence upload failed. The outcome was not recorded.");
        }

        storagePath = res.storagePath;
        setSubmitStatus("Recording outcome…");
      }

      await createStaffOutcomeAction({
        applicationId,
        outcomeType,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        notes: notes || null,
        candidateVisible:
          outcomeType === "OTHER" ? candidateVisible === true : candidateVisible,
        evidenceText: evidenceText || null,
        evidenceStoragePath: storagePath,
        evidenceShareable,
      });

      const recordedLabel = STAFF_OUTCOME_LABELS[outcomeType] || "Outcome";
      setSuccessMessage(`${recordedLabel} recorded successfully.`);
      setTimeout(() => setSuccessMessage(null), 3500);

      setNotes("");
      setOccurredAt("");
      setEvidenceText("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setEvidenceShareable(false);
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to record outcome. Please try again."
      );
    } finally {
      setBusy(false);
      setSubmitStatus(null);
    }
  }

  async function handleVerify(outcomeId: string) {
    setError(null);
    setBusy(true);
    try {
      await verifyOutcomeAction({ outcomeId });
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid(outcomeId: string) {
    const reason = (voidReasonById[outcomeId] || "").trim();
    if (reason.length < 3) {
      setError("Void reason is required (min 3 characters).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await voidOutcomeAction({ outcomeId, reason });
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Void failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(outcomeId: string) {
    setError(null);
    try {
      const res = await getOutcomeEvidenceDownloadUrlAction(outcomeId);
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Outcomes
        </h3>
        {inactive.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
          >
            {showHistory ? "Hide voided/superseded" : `History (${inactive.length})`}
          </button>
        )}
      </div>

      {visibleList.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          No external outcome events recorded yet.
        </p>
      ) : (
        <ul className="space-y-2.5 max-h-80 overflow-y-auto">
          {visibleList.map((o) => (
            <li
              key={o.id}
              className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                o.isActive
                  ? "bg-slate-50 border-slate-200"
                  : "bg-slate-100/80 border-slate-200 opacity-80"
              }`}
            >
              <div className="flex justify-between gap-2 items-start">
                <div>
                  <p className="font-bold text-slate-900">{o.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {o.occurredAt
                      ? `Occurred ${formatWhen(o.occurredAt)}`
                      : "Occurred date unknown"}
                    {" · "}
                    Recorded {formatWhen(o.recordedAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded ${
                    o.provenance === "CANDIDATE_REPORTED"
                      ? "bg-amber-100 text-amber-900"
                      : o.provenance === "STAFF_VERIFIED"
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-slate-200 text-slate-800"
                  }`}
                >
                  {o.provenanceLabel}
                </span>
              </div>
              {!o.isActive && (
                <p className="text-[11px] font-medium text-slate-600">
                  {o.correctionState}
                </p>
              )}
              {o.notes && (
                <p className="text-[11px] text-slate-700 whitespace-pre-wrap">
                  {o.notes}
                </p>
              )}
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span>
                  Candidate visible: {o.candidateVisible ? "yes" : "no"}
                </span>
                {o.hasEvidence && <span>Evidence on file</span>}
              </div>
              {o.isActive && (
                <div className="flex flex-col gap-2 pt-1 border-t border-slate-200/80">
                  <div className="flex flex-wrap gap-2">
                    {o.provenance === "CANDIDATE_REPORTED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleVerify(o.id)}
                        className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold text-[11px] hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Verify
                      </button>
                    )}
                    {o.hasEvidence && (
                      <button
                        type="button"
                        onClick={() => handleDownload(o.id)}
                        className="px-2.5 py-1 rounded border border-slate-300 text-slate-700 font-semibold text-[11px] hover:bg-white"
                      >
                        Download evidence
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={voidReasonById[o.id] || ""}
                      onChange={(e) =>
                        setVoidReasonById((prev) => ({
                          ...prev,
                          [o.id]: e.target.value,
                        }))
                      }
                      placeholder="Void reason…"
                      aria-label={`Void reason for ${o.label}`}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleVoid(o.id)}
                      className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold text-[11px] hover:bg-rose-700 disabled:opacity-50"
                    >
                      Void
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canRecord && (
        <form onSubmit={handleCreate} className="space-y-2.5 border-t pt-3 text-xs">
          <p className="font-semibold text-slate-800">Record outcome</p>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Outcome type
            </label>
            <select
              value={outcomeType}
              onChange={(e) => {
                const next = e.target.value as ApplicationOutcomeType;
                setOutcomeType(next);
                if (next === "OTHER") setCandidateVisible(false);
                else setCandidateVisible(true);
              }}
              className="w-full rounded border border-slate-300 p-2 text-xs"
            >
              {STAFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {STAFF_OUTCOME_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Occurred at
              {outcomeType === "INTERVIEW_SCHEDULED" ? " (required)" : " (optional)"}
            </label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required={outcomeType === "INTERVIEW_SCHEDULED"}
              className="w-full rounded border border-slate-300 p-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={4000}
              className="w-full rounded border border-slate-300 p-2 text-xs"
              placeholder="Operational context (not a substitute for evidence)"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Evidence text (optional)
            </label>
            <textarea
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              rows={2}
              maxLength={8000}
              className="w-full rounded border border-slate-300 p-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Evidence file (optional, private outcome storage)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setSelectedFile(f);
              }}
              className="block w-full text-[11px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-slate-100"
            />
            {selectedFile && (
              <div className="flex items-center justify-between mt-1 text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                <span className="truncate max-w-[240px]">
                  Attached: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-slate-500 hover:text-slate-800 ml-2 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-700">
            <input
              type="checkbox"
              checked={evidenceShareable}
              onChange={(e) => setEvidenceShareable(e.target.checked)}
            />
            Share evidence with candidate (when visible)
          </label>
          {outcomeType === "OTHER" ? (
            <label className="flex items-center gap-2 text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={candidateVisible}
                onChange={(e) => setCandidateVisible(e.target.checked)}
              />
              Make OTHER visible to candidate (explicit staff choice)
            </label>
          ) : (
            <label className="flex items-center gap-2 text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={candidateVisible}
                onChange={(e) => setCandidateVisible(e.target.checked)}
              />
              Visible to candidate
            </label>
          )}
          {outcomeType === "EMPLOYER_REJECTION" && (
            <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded p-2">
              Recording employer rejection will atomically set Application status
              to REJECTED.
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="w-full bg-slate-900 text-white font-semibold py-2 px-4 rounded-lg text-xs hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer transition-colors"
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
            <span>{busy ? (submitStatus || "Recording outcome…") : "Record outcome"}</span>
          </button>

          {successMessage && (
            <div
              role="status"
              aria-live="polite"
              className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2"
            >
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
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2"
            >
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
          )}
        </form>
      )}

      {!canRecord && (
        <p className="text-[11px] text-slate-500 italic border-t pt-2">
          Outcomes unlock after an authoritative external submission is recorded.
        </p>
      )}

      {!canRecord && error && (
        <p className="text-[11px] text-rose-700 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
