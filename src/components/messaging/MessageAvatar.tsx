"use client";

import { initials } from "./types";

export function MessageAvatar({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "sm" ? "h-8 w-8 text-[10px]" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-[11px]";

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#0B3B2C] font-bold text-white ${sizeClass} ${className}`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
