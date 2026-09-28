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
      accent: "bg-blue-600",
      text: "text-blue-600",
      badge: "bg-blue-50 text-blue-700 border-blue-200",
      pill: "bg-blue-50 text-blue-800",
    },
    emerald: {
      accent: "bg-emerald-600",
      text: "text-emerald-600",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      pill: "bg-emerald-50 text-emerald-800",
    },
    amber: {
      accent: "bg-amber-500",
      text: "text-amber-600",
      badge: "bg-amber-50 text-amber-800 border-amber-200",
      pill: "bg-amber-50 text-amber-900",
    },
    indigo: {
      accent: "bg-indigo-600",
      text: "text-indigo-600",
      badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
      pill: "bg-indigo-50 text-indigo-800",
    },
    rose: {
      accent: "bg-rose-600",
      text: "text-rose-600",
      badge: "bg-rose-50 text-rose-700 border-rose-200",
      pill: "bg-rose-50 text-rose-800",
    },
  };

  const scheme = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {category}
          </span>
          {displayValue && (
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${scheme.badge}`}>
              {displayValue}
            </span>
          )}
          {!displayValue && typeof score === "number" && (
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${scheme.badge}`}>
              {score}% Complete
            </span>
          )}
        </div>

        <h4 className="text-sm font-bold text-slate-900 tracking-tight">{title}</h4>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 mt-4">
          {metrics.map((m, idx) => (
            <div key={idx} className="min-w-0">
              <div className="text-[10px] text-slate-400 font-medium truncate">{m.label}</div>
              <div className="text-xs font-bold text-slate-800 truncate mt-0.5">{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
