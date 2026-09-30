"use client";

import React, { useCallback, useRef, useEffect } from "react";

interface InstantSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  enableShortcut?: boolean;
}

export function InstantSearch({
  value,
  onChange,
  placeholder = "Search records...",
  className = "",
  disabled = false,
  enableShortcut = true,
}: InstantSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    onChange("");
    inputRef.current?.focus();
  }, [onChange]);

  useEffect(() => {
    if (!enableShortcut || disabled) return;

    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Don't trigger if user is already typing in an input/textarea/select
      const activeElement = document.activeElement;
      const isInput =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement as HTMLElement)?.isContentEditable;

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !isInput) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [enableShortcut, disabled]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && value) {
      e.stopPropagation();
      handleClear();
    }
  };

  return (
    <div className={`relative flex items-center min-w-[200px] max-w-sm w-full ${className}`}>
      <span
        aria-hidden="true"
        className="absolute left-2.5 text-slate-400 select-none pointer-events-none text-xs flex items-center"
      >
        <svg
          className="w-3.5 h-3.5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={placeholder}
        className="w-full rounded-md border border-slate-300 pl-8 pr-12 py-1.5 text-xs bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors disabled:opacity-50"
      />
      <div className="absolute right-2 flex items-center gap-1">
        {value && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="text-slate-400 hover:text-slate-700 text-xs p-0.5 rounded cursor-pointer transition-colors"
          >
            ✕
          </button>
        ) : enableShortcut && !disabled ? (
          <kbd
            aria-hidden="true"
            className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded select-none"
          >
            /
          </kbd>
        ) : null}
      </div>
    </div>
  );
}
