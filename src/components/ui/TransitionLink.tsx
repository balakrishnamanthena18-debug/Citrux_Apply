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
 * Navigation link with immediate pending visual feedback.
 * Preserves next/link prefetch while acknowledging the click before RSC completes.
 */
export function TransitionLink({
  href,
  children,
  className = "",
  activeClassName = "",
  isActive = false,
  onNavigate,
  prefetch = true,
  ...props
}: TransitionLinkProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const target = href.toString();

  const warm = () => {
    try {
      router.prefetch(target);
    } catch {
      // best-effort
    }
  };

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
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
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
