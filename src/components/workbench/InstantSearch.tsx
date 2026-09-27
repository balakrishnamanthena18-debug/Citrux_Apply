"use client";

import React, { useCallback } from "react";

interface InstantSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function InstantSearch({
  value,
  onChange,
  placeholder = "Search records...",
  className = "",
  disabled = false,
}: InstantSearchProps) {
  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  return (
    <div className={`relative flex items-center ${className}`}>
      <span
        aria-hidden="true"
        className="absolute left-3 text-slate-400 select-none pointer-events-none text-xs"
      >
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={placeholder}
        className="w-full rounded-md border border-slate-300 pl-8 pr-8 py-1.5 text-xs bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 transition-colors"
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2.5 text-slate-400 hover:text-slate-700 text-xs font-bold p-0.5 rounded cursor-pointer"
        >
          ✕
        </button>
      )}
    </div>
  );
}
