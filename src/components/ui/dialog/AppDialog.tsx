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

export interface AppDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  onClose: () => void;
  footer?: React.ReactNode;
}

export function AppDialog({
  open,
  title,
  description,
  children,
  maxWidth = "md",
  onClose,
  footer,
}: AppDialogProps) {
  const isMounted = useIsMounted();
  const titleId = useId();
  const descId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  const widthClass =
    maxWidth === "sm"
      ? "max-w-sm"
      : maxWidth === "lg"
      ? "max-w-2xl"
      : maxWidth === "xl"
      ? "max-w-4xl"
      : "max-w-lg";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full ${widthClass} max-h-[90vh] flex flex-col rounded-2xl border border-[#E5EAE7] bg-white shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EDF1EF] px-6 py-4 shrink-0">
          <div>
            <h2 id={titleId} className="text-base font-bold text-[#0F1720]">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-xs text-[#64748B]">
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#64748B] hover:bg-[#F7F9F8] hover:text-[#0F1720] transition-colors"
            aria-label="Close dialog"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 text-sm text-[#334155]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-[#EDF1EF] bg-[#F7F9F8]/50 px-6 py-3.5 flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
