"use client";

import React from "react";

export type SortDirection = "asc" | "desc";

export interface SortOption {
  value: string;
  label: string;
}

interface InstantSortProps {
  options: SortOption[];
  currentField: string;
  currentDirection: SortDirection;
  onSortChange: (field: string, direction: SortDirection) => void;
  className?: string;
  disabled?: boolean;
}

export function InstantSort({
  options,
  currentField,
  currentDirection,
  onSortChange,
  className = "",
  disabled = false,
}: InstantSortProps) {
  const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSortChange(e.target.value, currentDirection);
  };

  const toggleDirection = () => {
    onSortChange(currentField, currentDirection === "asc" ? "desc" : "asc");
  };

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      <label htmlFor="sort-field-select" className="text-slate-500 font-medium whitespace-nowrap">
        Sort by:
      </label>
      <select
        id="sort-field-select"
        value={currentField}
        onChange={handleFieldChange}
        disabled={disabled}
        aria-label="Sort by field"
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 transition-colors cursor-pointer disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={toggleDirection}
        disabled={disabled}
        aria-label={`Toggle sort direction (currently ${currentDirection === "asc" ? "ascending" : "descending"})`}
        title={`Sort ${currentDirection === "asc" ? "Ascending" : "Descending"}`}
        className="p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center min-w-[28px]"
      >
        {currentDirection === "asc" ? "▲" : "▼"}
      </button>
    </div>
  );
}
