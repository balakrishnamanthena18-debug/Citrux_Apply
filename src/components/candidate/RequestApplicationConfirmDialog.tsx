"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  jobTitle: string;
  companyName: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RequestApplicationConfirmDialog({
  open,
  jobTitle,
  companyName,
  pending = false,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-app-title"
      data-testid="request-application-confirm"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#0B3B2C]/35"
        aria-label="Cancel request"
        onClick={pending ? undefined : onCancel}
        disabled={pending}
      />
      <div className="relative w-full max-w-md rounded-[16px] border border-[#E5EAE7] bg-white p-5 shadow-xl">
        <h2 id="request-app-title" className="text-base font-semibold text-[#0F1720]">
          Request application?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#475569]">
          We&apos;ll add <span className="font-medium text-[#0F1720]">{jobTitle}</span> at{" "}
          <span className="font-medium text-[#0F1720]">{companyName}</span> to your team&apos;s
          work queue. Your application will not be submitted automatically.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#E2E8F0] px-4 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#0B3B2C] px-4 text-sm font-semibold text-white hover:bg-[#0F4A38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
          >
            {pending ? "Requesting…" : "Request application"}
          </button>
        </div>
      </div>
    </div>
  );
}
