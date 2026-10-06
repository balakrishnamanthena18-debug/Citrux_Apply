"use client";

import { useState } from "react";
import {
  recordApplicationSubmissionAction,
  recordApplicationResubmissionAction,
} from "@/lib/submission/actions";
import { EvidenceUploader } from "./SubmissionEvidenceControls";
import { useRouter } from "next/navigation";

interface SubmissionFormProps {
  applicationId: string;
  isResubmission?: boolean;
}

export function SubmissionForm({ applicationId, isResubmission = false }: SubmissionFormProps) {
  const router = useRouter();
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const externalReference = (formData.get("externalReference") as string) || null;
    const externalUrl = (formData.get("externalUrl") as string) || null;
    const confirmationEvidence = (formData.get("confirmationEvidence") as string) || null;
    const submissionNotes = (formData.get("submissionNotes") as string) || null;

    try {
      if (isResubmission) {
        await recordApplicationResubmissionAction({
          applicationId,
          externalReference,
          externalUrl: externalUrl || undefined,
          confirmationEvidence,
          storagePath,
          submissionNotes,
        });
      } else {
        await recordApplicationSubmissionAction({
          applicationId,
          externalReference,
          externalUrl: externalUrl || undefined,
          confirmationEvidence,
          storagePath,
          submissionNotes,
        });
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to record submission");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      <div>
        <label className="block font-medium text-slate-700">External Application Reference / Confirmation ID</label>
        <input
          name="externalReference"
          className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
          placeholder="e.g. Lever ID #12345, Workday #98765"
        />
      </div>

      <div>
        <label className="block font-medium text-slate-700">External Job / Submission URL (Optional)</label>
        <input
          type="url"
          name="externalUrl"
          className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
          placeholder="https://jobs.lever.co/..."
        />
      </div>

      <div>
        <label className="block font-medium text-slate-700">
          Confirmation Evidence Text{" "}
          <span className="font-normal text-slate-500">(or upload file below)</span>
        </label>
        <textarea
          name="confirmationEvidence"
          rows={3}
          className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
          placeholder="Confirmation email snippet, portal response, or submission timestamp notes..."
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Add submission evidence or confirmation before recording submission.
          {storagePath ? " File evidence attached." : ""}
        </p>
      </div>

      <EvidenceUploader
        applicationId={applicationId}
        onUploadSuccess={(path) => setStoragePath(path)}
      />

      <div>
        <label className="block font-medium text-slate-700">Internal Submission Notes (Staff Only)</label>
        <textarea
          name="submissionNotes"
          rows={2}
          className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
          placeholder="Optional notes for operations team..."
        />
      </div>

      {error && <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs">{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-emerald-600 text-white font-bold py-2 rounded text-xs hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting
          ? "Recording..."
          : isResubmission
          ? "✓ Record External Resubmission"
          : "✓ Record External Application"}
      </button>
    </form>
  );
}
