"use client";

import React from "react";
import { useNavigationPending } from "@/components/navigation/NavigationPendingContext";
import {
  GenericDashboardSkeleton,
  MessagesPageSkeleton,
  AuditPageSkeleton,
} from "@/components/navigation/RouteSkeletons";

/**
 * Page-level soft-nav feedback:
 *
 * Requirements:
 * 1. The skeleton MUST replace the content, not sit transparently over it.
 * 2. When loading, old content is unmounted/hidden so no text bleeds through.
 * 3. The loading surface is 100% OPAQUE (#F7F9F8 / white) — no bg-white/50, no opacity-50, no backdrop-blur.
 * 4. Local in-segment transitions (like switching conversations) do not trigger this shell.
 */
export function SoftNavPendingShell({ children }: { children: React.ReactNode }) {
  const { isPending, pendingHref } = useNavigationPending();

  return (
    <div className="relative min-h-[40vh]">
      {isPending ? (
        <div
          className="w-full min-h-[50vh] bg-[#F7F9F8] rounded-2xl animate-in fade-in duration-150"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          {/* Subtle status indicator placed inside active loading surface */}
          <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E5EAE7] shadow-2xs">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#12A150]" />
            <span className="text-xs font-semibold text-[#0B3B2C]">Loading workspace…</span>
          </div>

          {/* Opaque skeleton matching target route geometry */}
          {pendingHref?.includes("/messages") ? (
            <MessagesPageSkeleton />
          ) : pendingHref?.includes("/admin/audit") ? (
            <AuditPageSkeleton />
          ) : (
            <GenericDashboardSkeleton />
          )}
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}
