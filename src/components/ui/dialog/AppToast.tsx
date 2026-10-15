"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};
function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export interface AppToastProps {
  open: boolean;
  message: string;
  type?: "success" | "error" | "info";
  durationMs?: number;
  onClose: () => void;
}

export function AppToast({
  open,
  message,
  type = "success",
  durationMs = 4000,
  onClose,
}: AppToastProps) {
  const isMounted = useIsMounted();

  useEffect(() => {
    if (!open || durationMs <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs, onClose]);

  if (!isMounted || !open) return null;

  const isSuccess = type === "success";
  const isError = type === "error";

  return createPortal(
    <div
      className="fixed bottom-5 right-5 z-[110] flex items-center gap-3 rounded-xl border p-3.5 shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-200 max-w-sm sm:max-w-md bg-white"
      style={{
        borderColor: isSuccess ? "#A7F3D0" : isError ? "#FECDD3" : "#E2E8F0",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isSuccess
            ? "bg-emerald-100 text-emerald-800"
            : isError
            ? "bg-rose-100 text-rose-800"
            : "bg-blue-100 text-blue-800"
        }`}
      >
        {isSuccess ? "✓" : isError ? "✕" : "ℹ"}
      </div>

      <div className="flex-1 text-xs font-medium text-[#0F1720] leading-snug">
        {message}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-[#94A3B8] hover:text-[#0F1720] transition-colors"
        aria-label="Dismiss notification"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>,
    document.body
  );
}
