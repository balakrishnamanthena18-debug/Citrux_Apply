"use client";

import React, { useTransition } from "react";

interface PendingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingText?: string;
  isPending?: boolean;
  onAsyncClick?: () => Promise<void> | void;
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "amber" | "emerald" | "indigo";
  size?: "sm" | "md" | "lg";
}

export function PendingButton({
  children,
  pendingText,
  isPending: externalIsPending,
  onAsyncClick,
  onClick,
  disabled,
  className = "",
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: PendingButtonProps) {
  const [internalIsPending, startTransition] = useTransition();
  const isPending = externalIsPending ?? internalIsPending;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isPending) return;

    if (onAsyncClick) {
      startTransition(async () => {
        await onAsyncClick();
      });
    } else if (onClick) {
      onClick(e);
    }
  };

  const variantStyles: Record<string, string> = {
    primary: "bg-[#12A150] text-white hover:bg-[#0E8541] disabled:bg-slate-200 disabled:text-slate-400 shadow-sm",
    secondary: "bg-white text-[#0F1720] border border-[#E5EAE7] hover:bg-[#F7F9F8] hover:border-[#DDE5E0] disabled:bg-[#F7F9F8] disabled:text-slate-300 shadow-2xs",
    danger: "bg-[#DC2626] text-white hover:bg-[#B91C1C] disabled:bg-rose-200 disabled:text-rose-400 shadow-sm",
    outline: "bg-white text-[#0F1720] border border-[#E5EAE7] hover:bg-[#F7F9F8] hover:border-[#DDE5E0] disabled:bg-white disabled:text-slate-300",
    ghost: "bg-transparent text-[#64748B] hover:text-[#0F1720] hover:bg-[#12A150]/[0.05] disabled:text-slate-300",
    amber: "bg-[#D97706] text-white hover:bg-[#B45309] disabled:bg-amber-200 shadow-sm",
    emerald: "bg-[#12A150] text-white hover:bg-[#0E8541] disabled:bg-emerald-200 shadow-sm",
    indigo: "bg-[#0B3B2C] text-[#C6F432] hover:bg-[#082d21] disabled:bg-slate-300 shadow-sm",
  };

  const sizeStyles: Record<string, string> = {
    sm: "px-2.5 py-1 text-xs font-medium rounded-lg",
    md: "px-3.5 py-1.5 text-xs font-semibold rounded-[11px]",
    lg: "px-4 py-2 text-sm font-semibold rounded-[11px]",
  };

  return (
    <button
      type={type}
      disabled={disabled || isPending}
      aria-busy={isPending}
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150] focus-visible:ring-offset-1 ${
        variantStyles[variant] || variantStyles.primary
      } ${sizeStyles[size] || sizeStyles.md} ${className}`}
      {...props}
    >
      {isPending && (
        <svg
          className="animate-spin -ml-0.5 h-3.5 w-3.5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      <span>{isPending && pendingText ? pendingText : children}</span>
    </button>
  );
}
