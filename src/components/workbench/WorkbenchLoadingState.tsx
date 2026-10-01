"use client";

import React from "react";

interface WorkbenchLoadingStateProps {
  rows?: number;
  className?: string;
}

export function WorkbenchLoadingState({
  rows = 5,
  className = "",
}: WorkbenchLoadingStateProps) {
  return (
    <div
      role="status"
      aria-label="Loading records"
      className={`divide-y divide-[#EDF1EF] bg-white animate-pulse ${className}`}
    >
      <div className="px-5 py-3.5 bg-[#F7F9F8] flex items-center justify-between">
        <div className="h-4 bg-slate-200 rounded w-1/4" />
        <div className="h-4 bg-slate-200 rounded w-16" />
      </div>
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="h-3.5 bg-slate-200 rounded w-1/3" />
            <div className="h-3 bg-[#EDF1EF] rounded w-1/2" />
          </div>
          <div className="h-6 bg-slate-200 rounded-full w-20" />
          <div className="h-8 bg-[#EDF1EF] rounded-md w-16" />
        </div>
      ))}
    </div>
  );
}
