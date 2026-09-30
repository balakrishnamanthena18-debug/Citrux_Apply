"use client";

import React from "react";

interface WorkbenchShellProps {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function WorkbenchShell({
  children,
  className = "",
  ariaLabel = "Workbench",
}: WorkbenchShellProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={`bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col transition-all duration-150 ${className}`}
    >
      {children}
    </section>
  );
}
