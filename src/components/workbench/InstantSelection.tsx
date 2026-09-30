"use client";

import React from "react";

interface InstantSelectionProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll?: () => void;
  onClearSelection: () => void;
  actions?: React.ReactNode;
  className?: string;
}

export function InstantSelection({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  actions,
  className = "",
}: InstantSelectionProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="Batch Actions Bar"
      className={`px-5 py-2.5 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-md animate-in fade-in slide-in-from-top-1 duration-150 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-100">
          <span className="font-mono text-emerald-400">{selectedCount}</span> of{" "}
          <span className="font-mono">{totalCount}</span> selected
        </span>

        {onSelectAll && selectedCount < totalCount && (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-slate-300 hover:text-white underline font-medium cursor-pointer"
          >
            Select all {totalCount}
          </button>
        )}

        <button
          type="button"
          onClick={onClearSelection}
          className="text-slate-400 hover:text-slate-200 text-[11px] uppercase tracking-wider font-semibold cursor-pointer ml-1"
        >
          Clear
        </button>
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
