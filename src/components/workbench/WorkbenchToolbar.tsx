"use client";

import React from "react";

interface WorkbenchToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export function WorkbenchToolbar({
  children,
  className = "",
}: WorkbenchToolbarProps) {
  return (
    <div
      className={`px-5 py-3 border-b border-[#EDF1EF] bg-[#F7F9F8]/60 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 ${className}`}
    >
      {children}
    </div>
  );
}
