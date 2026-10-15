"use client";

import React, { useEffect, useRef, useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};
function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export interface AlertDialogProps {
  open: boolean;
  title: string;
  message: string | React.ReactNode;
  acknowledgeLabel?: string;
  variant?: "error" | "warning" | "info" | "success";
  onClose: () => void;
}

export function AlertDialog({
  open,
  title,
  message,
  acknowledgeLabel = "Understood",
  variant = "error",
  onClose,
}: AlertDialogProps) {
  const isMounted = useIsMounted();
  const titleId = useId();
  const descId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Focus acknowledgement button on open
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      buttonRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!isMounted || !open) return null;

  const isError = variant === "error";
  const isWarning = variant === "warning";
  const isSuccess = variant === "success";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#E5EAE7] bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isError
                ? "bg-rose-50 text-rose-600 border border-rose-100"
                : isWarning
                ? "bg-amber-50 text-amber-600 border border-amber-100"
                : isSuccess
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-blue-50 text-blue-600 border border-blue-100"
            }`}
            aria-hidden="true"
          >
            {isError ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isWarning ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : isSuccess ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-bold text-[#0F1720] leading-snug">
              {title}
            </h2>
            <div id={descId} className="mt-1.5 text-xs text-[#475569] leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-[#EDF1EF]">
          <button
            ref={buttonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-[#0F1720] px-4 text-xs font-semibold text-white shadow-2xs hover:bg-[#334155] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F1720] transition-colors"
          >
            {acknowledgeLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
