"use client";

import React from "react";
import Link, { LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { shouldPrefetchHref } from "@/lib/navigation/prefetch-policy";
import { useNavigationPending } from "@/components/navigation/NavigationPendingContext";

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
 * Prefetch is allowlisted (priority operational routes only) to avoid
 * session-mode RLS/pool storms while warming the next click.
 */
export function TransitionLink({
  href,
  children,
  className = "",
  activeClassName = "",
  isActive = false,
  onNavigate,
  prefetch,
  ...props
}: TransitionLinkProps) {
  const router = useRouter();
  const { beginNavigation, runTransition, pendingHref } = useNavigationPending();

  const target = href.toString();
  const resolvedPrefetch =
    typeof prefetch === "boolean" ? prefetch : shouldPrefetchHref(target);
  const isPending = pendingHref === target.split("?")[0];

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
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
    beginNavigation(target.split("?")[0] || target);
    runTransition(() => {
      router.push(target);
    });
  };

  return (
    <Link
      href={href}
      prefetch={resolvedPrefetch}
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
