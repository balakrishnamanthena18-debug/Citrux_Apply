"use client";

import React, { useTransition } from "react";

interface PendingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingText?: string;
  isPending?: boolean;
  onAsyncClick?: () => Promise<void> | void;
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "amber";
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
    primary: "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300",
    secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400",
    danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
    outline: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400",
    amber: "bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300",
  };

  const sizeStyles: Record<string, string> = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-1.5 text-xs font-semibold",
    lg: "px-4 py-2 text-sm font-semibold",
  };

  return (
    <button
      type={type}
      disabled={disabled || isPending}
      aria-busy={isPending}
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
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
