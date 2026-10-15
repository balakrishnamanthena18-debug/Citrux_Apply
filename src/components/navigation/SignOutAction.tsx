"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { signOutAction } from "@/lib/auth/actions";

interface SignOutActionProps {
  variant?: "menu-item" | "sidebar" | "mobile" | "compact";
  className?: string;
  onSignOut?: () => void;
}

function SignOutButton({
  variant,
  className = "",
}: {
  variant: "menu-item" | "sidebar" | "mobile" | "compact";
  className?: string;
}) {
  const { pending } = useFormStatus();

  const logoutIcon = (
    <svg
      className={`shrink-0 ${variant === "sidebar" || variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );

  if (variant === "compact") {
    return (
      <button
        type="submit"
        disabled={pending}
        title="Sign out"
        aria-label="Sign out"
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 ${className}`}
      >
        {logoutIcon}
      </button>
    );
  }

  if (variant === "sidebar") {
    return (
      <button
        type="submit"
        disabled={pending}
        aria-label="Sign out"
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-[#E5EAE7] bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 shadow-2xs transition-all hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 active:scale-[0.99] disabled:opacity-50 ${className}`}
      >
        {logoutIcon}
        <span>{pending ? "Signing out..." : "Sign out"}</span>
      </button>
    );
  }

  if (variant === "mobile") {
    return (
      <button
        type="submit"
        disabled={pending}
        aria-label="Sign out"
        className={`flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/50 px-4 py-2.5 text-xs font-bold text-rose-600 shadow-2xs transition-colors hover:bg-rose-100/70 hover:text-rose-700 active:scale-[0.98] disabled:opacity-50 ${className}`}
      >
        {logoutIcon}
        <span>{pending ? "Signing out..." : "Sign out"}</span>
      </button>
    );
  }

  // menu-item (inside top-right dropdown)
  return (
    <button
      type="submit"
      disabled={pending}
      role="menuitem"
      aria-label="Sign out of Operations OS"
      className={`group flex w-full items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 ${className}`}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-50 text-rose-600 group-hover:bg-rose-100 transition-colors">
        {logoutIcon}
      </span>
      <span className="flex-1 text-left">{pending ? "Signing out..." : "Sign out"}</span>
      <span className="text-[10px] text-rose-400 font-medium">Session ends</span>
    </button>
  );
}

export function SignOutAction({
  variant = "menu-item",
  className = "",
  onSignOut,
}: SignOutActionProps) {
  return (
    <form
      action={signOutAction}
      onSubmit={() => {
        if (onSignOut) onSignOut();
      }}
      className="w-full"
    >
      <SignOutButton variant={variant} className={className} />
    </form>
  );
}
