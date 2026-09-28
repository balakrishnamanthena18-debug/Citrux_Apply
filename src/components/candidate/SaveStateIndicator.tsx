"use client";

import React from "react";

export type SaveStatus = "IDLE" | "SAVING" | "SAVED" | "DIRTY" | "ERROR";

interface Props {
  status: SaveStatus;
  lastSavedAt?: Date | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  className?: string;
}

export function SaveStateIndicator({
  status,
  lastSavedAt,
  errorMessage,
  onRetry,
  className = "",
}: Props) {
  if (status === "IDLE" && !lastSavedAt) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`}>
      {status === "SAVING" && (
        <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
          <svg
            className="animate-spin h-3 w-3 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <span>Saving changes...</span>
        </span>
      )}

      {status === "SAVED" && (
        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full transition-all">
          <span>✓</span>
          <span>Saved just now</span>
        </span>
      )}

      {status === "DIRTY" && (
        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span>Unsaved changes</span>
        </span>
      )}

      {status === "ERROR" && (
        <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
          <span>⚠</span>
          <span>{errorMessage || "Save failed"}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="underline font-semibold ml-1 cursor-pointer hover:text-rose-900"
            >
              Retry
            </button>
          )}
        </span>
      )}

      {status === "IDLE" && lastSavedAt && (
        <span className="text-slate-400 text-[11px]">
          Synced {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}
