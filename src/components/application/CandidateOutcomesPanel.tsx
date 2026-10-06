"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationOutcomeType } from "@/generated/prisma";
import { CANDIDATE_OUTCOME_LABELS } from "@/lib/application/outcome-labels";
import type { OutcomePresentation } from "@/lib/application/outcome-service";
import {
  getOutcomeEvidenceDownloadUrlAction,
  reportCandidateOutcomeAction,
} from "@/lib/application/outcome-actions";

const REPORTABLE: ApplicationOutcomeType[] = [
  "RECRUITER_CONTACT",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "OFFER_RECEIVED",
  "EMPLOYER_REJECTION",
];

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface Props {
  applicationId: string;
  outcomes: OutcomePresentation[];
  canReport: boolean;
  submitted: boolean;
}

export function CandidateOutcomesPanel({
  applicationId,
  outcomes,
  canReport,
  submitted,
}: Props) {
  const router = useRouter();
  const [outcomeType, setOutcomeType] =
    useState<ApplicationOutcomeType>("RECRUITER_CONTACT");
  const [occurredAt, setOccurredAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleReport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await reportCandidateOutcomeAction({
        applicationId,
        outcomeType,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        notes: notes || null,
      });
      setNotes("");
      setOccurredAt("");
      setShowForm(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to submit report");
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
      setError(err instanceof Error ? err.message : "Evidence unavailable");
    }
  }

  if (!submitted && outcomes.length === 0) {
    return null;
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Updates
        </h3>
        {canReport && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline"
          >
            {showForm ? "Cancel" : "Report an update"}
          </button>
        )}
      </div>

      {outcomes.length === 0 ? (
        <p className="text-xs text-slate-500">
          No updates yet for this application.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {outcomes.map((o) => {
            const when = formatWhen(o.occurredAt) || formatWhen(o.recordedAt);
            return (
              <li
                key={o.id}
                className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0"
              >
                <div>
                  <p className="font-semibold text-slate-900">{o.label}</p>
                  {o.provenance === "CANDIDATE_REPORTED" && (
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Awaiting confirmation
                    </p>
                  )}
                  {o.hasEvidence && o.evidenceShareable && (
                    <button
                      type="button"
                      onClick={() => handleDownload(o.id)}
                      className="mt-1 text-[11px] font-semibold text-blue-700 hover:underline"
                    >
                      View shared evidence
                    </button>
                  )}
                </div>
                {when && (
                  <span className="text-[11px] text-slate-500 shrink-0">
                    {when}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showForm && canReport && (
        <form onSubmit={handleReport} className="space-y-2.5 border-t pt-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              What happened?
            </label>
            <select
              value={outcomeType}
              onChange={(e) =>
                setOutcomeType(e.target.value as ApplicationOutcomeType)
              }
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            >
              {REPORTABLE.map((t) => (
                <option key={t} value={t}>
                  {CANDIDATE_OUTCOME_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              When
              {outcomeType === "INTERVIEW_SCHEDULED"
                ? " (required for scheduled interview)"
                : " (optional)"}
            </label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required={outcomeType === "INTERVIEW_SCHEDULED"}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
              placeholder="Any details that help our team confirm this update"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Your report is unmarked until our team confirms it. It does not
            automatically change application status.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="w-full sm:w-auto bg-slate-900 text-white font-semibold px-4 py-2 rounded-lg text-xs hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </form>
      )}

      {error && (
        <p className="text-[11px] text-rose-700 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
