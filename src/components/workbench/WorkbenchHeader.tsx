"use client";

import React from "react";

interface WorkbenchHeaderProps {
  title: string;
  description?: string;
  badge?: string | number;
  badgeVariant?: "neutral" | "emerald" | "amber" | "indigo" | "rose";
  actions?: React.ReactNode;
  className?: string;
}

export function WorkbenchHeader({
  title,
  description,
  badge,
  badgeVariant = "neutral",
  actions,
  className = "",
}: WorkbenchHeaderProps) {
  const badgeStyles: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <div
      className={`px-5 py-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h1>
          {badge !== undefined && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${
                badgeStyles[badgeVariant] || badgeStyles.neutral
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>

      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
