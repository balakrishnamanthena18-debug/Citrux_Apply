"use client";

import React from "react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDropdownConfig {
  key: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
}

interface InstantFilterBarProps {
  filters: FilterDropdownConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClearAll?: () => void;
  isFiltered?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function InstantFilterBar({
  filters,
  values,
  onChange,
  onClearAll,
  isFiltered = false,
  className = "",
  children,
}: InstantFilterBarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2.5 text-xs ${className}`}>
      {filters.map((filter) => {
        const currentValue = values[filter.key] || "";
        return (
          <div key={filter.key} className="flex items-center">
            <label htmlFor={`filter-${filter.key}`} className="sr-only">
              {filter.label}
            </label>
            <select
              id={`filter-${filter.key}`}
              value={currentValue}
              onChange={(e) => onChange(filter.key, e.target.value)}
              className="rounded-[10px] border border-[#DDE5E0] px-3 py-1.5 text-xs bg-white text-[#0F1720] font-medium focus:outline-none focus:ring-1 focus:ring-[#12A150] focus:border-[#12A150] transition-colors cursor-pointer"
            >
              <option value="">{filter.allLabel || `All ${filter.label}`}</option>
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      {children}

      {isFiltered && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="px-2.5 py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#12A150] transition-colors cursor-pointer"
        >
          Reset Filters
        </button>
      )}
    </div>
  );
}
