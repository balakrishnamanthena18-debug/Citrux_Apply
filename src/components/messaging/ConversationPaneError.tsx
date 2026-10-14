"use client";

import React from "react";

export function ConversationPaneError({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center bg-[#F7F9F8] p-6 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#E5EAE7] bg-white p-6 shadow-2xs space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[#0F1720]">Unable to load this conversation</h3>
          <p className="text-xs text-[#64748B]">
            An unexpected error occurred while loading message history. Please try again.
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="w-full rounded-xl bg-[#12A150] px-4 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#0E8541] transition cursor-pointer"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
