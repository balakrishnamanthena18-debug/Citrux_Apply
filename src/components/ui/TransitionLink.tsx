"use client";

import React, { useTransition } from "react";
import Link, { LinkProps } from "next/link";
import { useRouter } from "next/navigation";

interface TransitionLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  isActive?: boolean;
  onNavigate?: () => void;
}

/**
 * Soft-nav link with immediate pending visual feedback.
 *
 * Prefetch defaults OFF. Authenticated RSC routes open session-mode RLS
 * transactions; viewport/sidebar prefetch storms exhaust Supabase Free
 * (pool_size: 15) and surface as React #441.
 */
export function TransitionLink({
  href,
  children,
  className = "",
  activeClassName = "",
  isActive = false,
  onNavigate,
  prefetch = false,
  ...props
}: TransitionLinkProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const target = href.toString();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Allow modified clicks (new tab, etc.) to use native behavior
    if (
      e.defaultPrevented ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    ) {
      return;
    }

    e.preventDefault();
    onNavigate?.();
    startTransition(() => {
      router.push(target);
    });
  };

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={handleClick}
      aria-current={isActive ? "page" : undefined}
      aria-busy={isPending || undefined}
      data-pending={isPending ? "true" : undefined}
      className={`${className} ${isActive ? activeClassName : ""} ${
        isPending ? "opacity-70 pointer-events-none ring-1 ring-[#12A150]/25 bg-[#12A150]/[0.06]" : ""
      } transition-opacity duration-150`}
      {...props}
    >
      {children}
    </Link>
  );
}
