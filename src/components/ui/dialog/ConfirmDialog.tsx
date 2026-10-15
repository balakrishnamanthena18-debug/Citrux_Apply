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

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  pending?: boolean;
  icon?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  pending = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isMounted = useIsMounted();
  const titleId = useId();
  const descId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management: move focus into dialog on open (cancel button for safety on danger variant)
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (variant === "danger") {
        cancelButtonRef.current?.focus();
      } else {
        confirmButtonRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [open, variant]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pending, onCancel]);

  if (!isMounted || !open) return null;

  const isDanger = variant === "danger";
  const isWarning = variant === "warning";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#E5EAE7] bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          {/* Variant Icon */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isDanger
                ? "bg-rose-50 text-rose-600 border border-rose-100"
                : isWarning
                ? "bg-amber-50 text-amber-600 border border-amber-100"
                : "bg-emerald-50 text-emerald-700 border border-emerald-100"
            }`}
            aria-hidden="true"
          >
            {icon ? (
              icon
            ) : isDanger ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ) : isWarning ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-bold text-[#0F1720] leading-snug">
              {title}
            </h2>
            <div id={descId} className="mt-1.5 text-xs text-[#475569] leading-relaxed">
              {description}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-2 border-t border-[#EDF1EF]">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-[#E5EAE7] bg-white px-4 text-xs font-semibold text-[#475569] hover:bg-[#F7F9F8] hover:text-[#0F1720] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white shadow-2xs transition-all disabled:opacity-50 ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                : isWarning
                ? "bg-amber-600 hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                : "bg-[#0B3B2C] hover:bg-[#0F4A38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150]"
            }`}
          >
            {pending && (
              <svg className="h-3.5 w-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            <span>{pending ? "Processing…" : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
