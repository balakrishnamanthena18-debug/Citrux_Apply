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
      className={`bg-white rounded-[20px] border border-[#E5EAE7] shadow-[0_4px_18px_rgba(15,23,32,0.04)] overflow-hidden flex flex-col transition-all duration-150 ${className}`}
    >
      {children}
    </section>
  );
}
