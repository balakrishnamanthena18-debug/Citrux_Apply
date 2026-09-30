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
    neutral: "bg-[#F0F4F2] text-[#64748B] border-[#E5EAE7]",
    emerald: "bg-[#12A150]/10 text-[#0B3B2C] border-[#12A150]/25",
    amber: "bg-[#D97706]/10 text-[#B45309] border-[#D97706]/20",
    indigo: "bg-[#0B3B2C]/10 text-[#0B3B2C] border-[#0B3B2C]/20",
    rose: "bg-[#DC2626]/10 text-[#DC2626] border-[#DC2626]/20",
  };

  return (
    <div
      className={`px-5 py-4 border-b border-[#EDF1EF] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-bold text-[#0F1720] tracking-tight">{title}</h1>
          {badge !== undefined && (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                badgeStyles[badgeVariant] || badgeStyles.neutral
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-[#64748B]">{description}</p>}
      </div>

      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
