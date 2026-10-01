"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendMessageAction, createInternalNoteAction } from "@/lib/communication/actions";

type ComposerMode = "message" | "note";

export function MessageComposer({
  conversationId,
  candidateId,
  applicationId,
  allowInternalNotes = false,
  placeholder = "Write a message…",
}: {
  conversationId: string;
  candidateId?: string;
  applicationId?: string | null;
  allowInternalNotes?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ComposerMode>("message");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canNote = allowInternalNotes && Boolean(candidateId || applicationId);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || isPending) return;

    startTransition(async () => {
      setError(null);
      if (mode === "note") {
        if (!canNote) {
          setError("Internal notes require a linked candidate or application.");
          return;
        }
        const res = await createInternalNoteAction({
          candidateId: candidateId || null,
          applicationId: applicationId || null,
          body: trimmed,
        });
        if (!res.success) {
          setError(res.error || "Failed to save note");
          return;
        }
      } else {
        const res = await sendMessageAction({
          conversationId,
          body: trimmed,
        });
        if (!res.success) {
          setError(res.error || "Failed to send message");
          return;
        }
      }
      setBody("");
      router.refresh();
    });
  };

  return (
    <div
      className={`border-t ${
        mode === "note" ? "border-amber-200 bg-amber-50/40" : "border-[#EDF1EF] bg-white"
      }`}
    >
      {allowInternalNotes && (
        <div className="flex items-center gap-1 border-b border-[#EDF1EF] px-3 pt-2">
          <button
            type="button"
            onClick={() => setMode("message")}
            className={`rounded-t-[8px] px-3 py-1.5 text-[11px] font-semibold transition ${
              mode === "message"
                ? "bg-white text-[#0B3B2C] shadow-[0_-1px_0_#fff]"
                : "text-[#64748B] hover:text-[#0F1720]"
            }`}
          >
            Message
          </button>
          <button
            type="button"
            onClick={() => setMode("note")}
            disabled={!canNote}
            className={`rounded-t-[8px] px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === "note"
                ? "bg-amber-50 text-amber-900"
                : "text-[#64748B] hover:text-[#0F1720]"
            }`}
          >
            Internal note
          </button>
          {mode === "note" && (
            <span className="ml-auto pb-1 text-[10px] font-medium text-amber-800">
              Staff only · not visible to candidates
            </span>
          )}
        </div>
      )}

      <div className="px-3 py-3">
        {error && <p className="mb-2 text-[11px] font-medium text-rose-600">{error}</p>}
        <label className="sr-only" htmlFor={`composer-${conversationId}`}>
          {mode === "note" ? "Internal note" : "Message"}
        </label>
        <textarea
          id={`composer-${conversationId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          maxLength={4000}
          disabled={isPending}
          placeholder={
            mode === "note"
              ? "Add confidential operational commentary…"
              : placeholder
          }
          className={`w-full resize-none rounded-[12px] border px-3 py-2.5 text-[13px] text-[#0F1720] placeholder:text-[#94A3B8] focus:outline-none focus:ring-1 disabled:opacity-60 ${
            mode === "note"
              ? "border-amber-300 bg-white focus:border-amber-500 focus:ring-amber-500"
              : "border-[#DDE5E0] bg-[#FCFDFC] focus:border-[#12A150] focus:ring-[#12A150]"
          }`}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[10px] text-[#94A3B8]">
            {mode === "note"
              ? "Internal notes stay on the staff record."
              : "⌘/Ctrl + Enter to send"}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !body.trim()}
            className={`inline-flex items-center rounded-[10px] px-3.5 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === "note"
                ? "bg-amber-700 hover:bg-amber-800"
                : "bg-[#12A150] hover:bg-[#0E8541]"
            }`}
          >
            {isPending ? "Sending…" : mode === "note" ? "Save note" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
