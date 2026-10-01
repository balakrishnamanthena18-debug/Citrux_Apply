"use client";

import React from "react";

interface WorkbenchErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function WorkbenchErrorState({
  title = "Failed to load records",
  message = "An unexpected error occurred while loading this view.",
  onRetry,
  className = "",
}: WorkbenchErrorStateProps) {
  return (
    <div
      role="alert"
      className={`py-12 px-6 flex flex-col items-center justify-center text-center space-y-3 bg-white ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
        <svg
          className="w-5 h-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-sm font-semibold text-[#0F1720]">{title}</h3>
        <p className="text-xs text-rose-600 font-medium">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
        >
          Retry
        </button>
      )}
    </div>
  );
}
