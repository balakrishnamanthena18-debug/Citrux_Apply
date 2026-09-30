"use client";

import React from "react";

interface TelemetryGaugeProps {
  score?: number; // Optional 0 to 100 percentage (only if authoritative)
  displayValue?: string | React.ReactNode; // e.g. "9 / 9 verified", "READY", "2 attempts"
  title: string;
  subtitle: string;
  category?: string;
  metrics?: { label: string; value: string | number }[];
  color?: "blue" | "emerald" | "amber" | "indigo" | "rose";
}

export function TelemetryGauge({
  score,
  displayValue,
  title,
  subtitle,
  category = "Operational Telemetry",
  metrics = [],
  color = "blue",
}: TelemetryGaugeProps) {
  const colorMap = {
    blue: {
      accent: "bg-[#2563EB]",
      text: "text-[#2563EB]",
      badge: "bg-[#2563EB]/10 text-[#2563EB] border-[#2563EB]/20",
      pill: "bg-[#2563EB]/10 text-[#2563EB]",
    },
    emerald: {
      accent: "bg-[#12A150]",
      text: "text-[#12A150]",
      badge: "bg-[#12A150]/10 text-[#0B3B2C] border-[#12A150]/25",
      pill: "bg-[#12A150]/10 text-[#0B3B2C]",
    },
    amber: {
      accent: "bg-[#D97706]",
      text: "text-[#D97706]",
      badge: "bg-[#D97706]/10 text-[#B45309] border-[#D97706]/20",
      pill: "bg-[#D97706]/10 text-[#B45309]",
    },
    indigo: {
      accent: "bg-[#0B3B2C]",
      text: "text-[#0B3B2C]",
      badge: "bg-[#0B3B2C]/10 text-[#0B3B2C] border-[#0B3B2C]/20",
      pill: "bg-[#0B3B2C]/10 text-[#0B3B2C]",
    },
    rose: {
      accent: "bg-[#DC2626]",
      text: "text-[#DC2626]",
      badge: "bg-[#DC2626]/10 text-[#DC2626] border-[#DC2626]/20",
      pill: "bg-[#DC2626]/10 text-[#DC2626]",
    },
  };

  const scheme = colorMap[color] || colorMap.emerald;

  return (
    <div className="bg-white rounded-[16px] border border-[#E5EAE7] p-5 shadow-[0_4px_18px_rgba(15,23,32,0.04)] flex flex-col justify-between transition-all">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
            {category}
          </span>
          {displayValue && (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${scheme.badge}`}>
              {displayValue}
            </span>
          )}
          {!displayValue && typeof score === "number" && (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${scheme.badge}`}>
              {score}% Complete
            </span>
          )}
        </div>

        <h4 className="text-sm font-bold text-[#0F1720] tracking-tight">{title}</h4>
        <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{subtitle}</p>
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#EDF1EF] mt-4">
          {metrics.map((m, idx) => (
            <div key={idx} className="min-w-0">
              <div className="text-[10px] text-[#94A3B8] font-medium truncate">{m.label}</div>
              <div className="text-xs font-bold text-[#0F1720] truncate mt-0.5">{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
