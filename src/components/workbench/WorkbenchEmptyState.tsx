"use client";

import React from "react";

interface WorkbenchEmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function WorkbenchEmptyState({
  title = "No records found",
  description = "No items match your active search or filter criteria.",
  actionText,
  onAction,
  icon,
  className = "",
}: WorkbenchEmptyStateProps) {
  return (
    <div
      role="status"
      className={`py-12 px-6 flex flex-col items-center justify-center text-center space-y-3 bg-white ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-[#12A150]/10 flex items-center justify-center text-[#12A150] text-base">
        {icon || (
          <svg
            className="w-5 h-5 text-[#12A150]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        )}
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-sm font-bold text-[#0F1720]">{title}</h3>
        <p className="text-xs text-[#64748B]">{description}</p>
      </div>
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] border border-[#E5EAE7] bg-white text-xs font-semibold text-[#0F1720] hover:bg-[#F7F9F8] transition-colors cursor-pointer shadow-2xs"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
