"use client";

import React, { useState, useRef, useEffect } from "react";

export interface RowActionItem {
  key: string;
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: "default" | "danger" | "warning";
  disabled?: boolean;
}

interface InstantRowActionsProps {
  actions: RowActionItem[];
  label?: string;
  className?: string;
}

export function InstantRowActions({
  actions,
  label = "Row Actions",
  className = "",
}: InstantRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const variantStyles: Record<string, string> = {
    default: "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
    danger: "text-rose-600 hover:bg-rose-50 hover:text-rose-700",
    warning: "text-amber-700 hover:bg-amber-50 hover:text-amber-800",
  };

  return (
    <div ref={menuRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        <svg
          className="w-4 h-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-1 w-44 rounded-md bg-white shadow-lg border border-slate-200 py-1 z-30 focus:outline-none animate-in fade-in zoom-in-95 duration-100"
        >
          {actions.map((action) => (
            <button
              key={action.key}
              role="menuitem"
              type="button"
              disabled={action.disabled}
              onClick={() => {
                setIsOpen(false);
                action.onClick();
              }}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                variantStyles[action.variant || "default"]
              }`}
            >
              {action.icon && <span className="w-3.5 h-3.5 shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
