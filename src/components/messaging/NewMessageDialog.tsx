"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createConversationAction } from "@/lib/communication/actions";

export interface NewMessageCandidateOption {
  id: string;
  name: string;
  email: string;
}

export function NewMessageDialog({
  open,
  onClose,
  candidates,
  basePath,
}: {
  open: boolean;
  onClose: () => void;
  candidates: NewMessageCandidateOption[];
  basePath: string;
}) {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sorted = useMemo(
    () => [...candidates].sort((a, b) => a.name.localeCompare(b.name)),
    [candidates]
  );

  if (!open) return null;

  const submit = () => {
    if (!candidateId || !subject.trim() || !message.trim()) {
      setError("Candidate, subject, and message are required.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await createConversationAction({
        candidateId,
        subject: subject.trim(),
        initialMessage: message.trim(),
      });
      if (!res.success || !res.data?.conversationId) {
        setError(res.error || "Failed to create conversation");
        return;
      }
      onClose();
      router.push(`${basePath}/${res.data.conversationId}`);
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-[#0B3B2C]/35"
        aria-label="Close new message dialog"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-[16px] border border-[#E5EAE7] bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-[#0F1720]">New message</h2>
        <p className="mt-1 text-xs text-[#64748B]">
          Start a candidate conversation using existing operational records.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#64748B]" htmlFor="nm-candidate">
              Candidate
            </label>
            <select
              id="nm-candidate"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full rounded-[10px] border border-[#DDE5E0] px-3 py-2 text-xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            >
              <option value="">Select candidate…</option>
              {sorted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#64748B]" htmlFor="nm-subject">
              Subject
            </label>
            <input
              id="nm-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="w-full rounded-[10px] border border-[#DDE5E0] px-3 py-2 text-xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#64748B]" htmlFor="nm-body">
              Message
            </label>
            <textarea
              id="nm-body"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={4000}
              className="w-full rounded-[10px] border border-[#DDE5E0] px-3 py-2 text-xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            />
          </div>
          {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#E5EAE7] px-3 py-1.5 text-xs font-semibold text-[#64748B] hover:bg-[#F7F9F8]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="rounded-[10px] bg-[#12A150] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0E8541] disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Start conversation"}
          </button>
        </div>
      </div>
    </div>
  );
}
