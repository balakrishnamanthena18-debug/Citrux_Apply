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
    neutral: "bg-[#F7F9F8] text-[#64748B] border-[#E5EAE7]",
    emerald: "bg-[#12A150]/10 text-[#0B3B2C] border-[#12A150]/25",
    amber: "bg-amber-50 text-amber-800 border-amber-200/80",
    indigo: "bg-[#0B3B2C]/8 text-[#0B3B2C] border-[#0B3B2C]/15",
    rose: "bg-rose-50 text-rose-700 border-rose-200/80",
  };

  return (
    <div
      className={`px-5 py-5 border-b border-[#EDF1EF] bg-[#FCFDFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-semibold tracking-[-0.03em] text-[#0F1720]">{title}</h1>
          {badge !== undefined && (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold tabular-nums border ${
                badgeStyles[badgeVariant] || badgeStyles.neutral
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-[#64748B] leading-relaxed">{description}</p>}
      </div>

      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
