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

export interface AccountModalsProps {
  activeModal: "details" | "help" | null;
  onClose: () => void;
  displayName: string;
  email: string;
  badge: { label: string; text: string; bg: string; border: string };
  designationName?: string | null;
  organizationName?: string;
}

export function AccountModals({
  activeModal,
  onClose,
  displayName,
  email,
  badge,
  designationName,
  organizationName = "Operations Operating System",
}: AccountModalsProps) {
  const mounted = useIsMounted();

  // Escape key handler for modals
  useEffect(() => {
    if (!activeModal) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeModal, onClose]);

  if (!mounted || !activeModal) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby={activeModal === "details" ? "account-details-title" : "help-support-title"}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {activeModal === "details" && (
        <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#E5EAE7] bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-[#EDF1EF] pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12A150]/10 text-[#0B3B2C] font-bold text-xs">
                OOS
              </div>
              <h3 id="account-details-title" className="text-sm font-bold text-[#0F1720]">
                Account & Authentication Security
              </h3>
            </div>
            <button
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

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-[#EDF1EF]">
              <span className="text-[#64748B]">Full Name</span>
              <span className="font-semibold text-[#0F1720]">{displayName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#EDF1EF]">
              <span className="text-[#64748B]">Email Address</span>
              <span className="font-semibold text-[#0F1720]">{email}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#EDF1EF]">
              <span className="text-[#64748B]">System Role</span>
              <span className={`font-bold uppercase ${badge.text}`}>{badge.label}</span>
            </div>
            {designationName && (
              <div className="flex justify-between py-1 border-b border-[#EDF1EF]">
                <span className="text-[#64748B]">Designation</span>
                <span className="font-semibold text-[#0F1720]">{designationName}</span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-[#EDF1EF]">
              <span className="text-[#64748B]">Tenant Organization</span>
              <span className="font-semibold text-[#0F1720]">{organizationName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#EDF1EF]">
              <span className="text-[#64748B]">Session Protection</span>
              <span className="font-mono text-[11px] text-[#12A150] bg-emerald-50 px-1.5 py-0.5 rounded">
                HTTP-Only Encrypted Cookie
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#EDF1EF]">
              <span className="text-[#64748B]">Isolation Context</span>
              <span className="font-mono text-[11px] text-[#64748B] bg-[#EDF1EF] px-1.5 py-0.5 rounded">
                PostgreSQL Row-Level Security
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F1720] text-white hover:bg-[#334155] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {activeModal === "help" && (
        <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#E5EAE7] bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-[#EDF1EF] pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12A150]/10 text-[#0B3B2C] font-bold text-xs">
                ?
              </div>
              <h3 id="help-support-title" className="text-sm font-bold text-[#0F1720]">
                Help & Platform Support
              </h3>
            </div>
            <button
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

          <div className="space-y-3 text-xs text-[#64748B]">
            <p>
              Operations Operating System (OOS) technical support and assistance are provided directly through our enterprise operational desk.
            </p>

            <div className="rounded-xl border border-[#E5EAE7] bg-[#F7F9F8] p-3 space-y-2">
              <div className="text-[11px] font-bold text-[#0F1720] uppercase tracking-wider">
                Contact Channels
              </div>
              <div className="flex items-center justify-between">
                <span>Operational Support</span>
                <a
                  href="mailto:support@citrux.in"
                  className="font-mono text-xs font-medium text-[#12A150] hover:underline"
                >
                  support@citrux.in
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span>System Dispatcher</span>
                <span className="font-mono text-xs font-medium text-[#64748B]">
                  notifications@citrux.in
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[#E5EAE7] bg-white p-3 space-y-1">
              <div className="text-[11px] font-bold text-[#0F1720]">
                Keyboard Shortcuts
              </div>
              <div className="text-[11px] space-y-0.5 text-[#64748B]">
                <div><kbd className="px-1.5 py-0.5 rounded bg-[#EDF1EF] border border-[#E5EAE7] font-mono text-[10px]">Esc</kbd> — Dismiss menus, dialogs, and slide-over drawers</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-[#EDF1EF] border border-[#E5EAE7] font-mono text-[10px]">Tab</kbd> — Navigate interactive elements in visual order</div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F1720] text-white hover:bg-[#334155] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
