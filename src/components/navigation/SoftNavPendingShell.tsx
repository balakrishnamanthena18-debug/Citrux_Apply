"use client";

import { useNavigationPending } from "@/components/navigation/NavigationPendingContext";

/**
 * Page-level soft-nav feedback: keeps sidebar/header, dims stale content,
 * and shows a restrained OOS skeleton strip — not a full-screen spinner.
 */
export function SoftNavPendingShell({ children }: { children: React.ReactNode }) {
  const { isPending } = useNavigationPending();

  return (
    <div className="relative min-h-[40vh]">
      <div
        className={
          isPending
            ? "pointer-events-none opacity-40 transition-opacity duration-150"
            : "opacity-100 transition-opacity duration-150"
        }
        aria-hidden={isPending || undefined}
      >
        {children}
      </div>

      {isPending && (
        <div
          className="absolute inset-0 z-10 rounded-2xl border border-[#E5EAE7] bg-white/80 p-4 sm:p-6 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#12A150]" />
            <span className="text-xs font-semibold text-[#0B3B2C]">Loading…</span>
          </div>
          <div className="space-y-3">
            <div className="h-8 w-1/3 animate-pulse rounded-md bg-[#E5EAE7]" />
            <div className="h-4 w-2/3 animate-pulse rounded-md bg-[#EDF1EF]" />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#EDF1EF]" />
              ))}
            </div>
            <div className="mt-4 h-48 animate-pulse rounded-2xl bg-[#F7F9F8] border border-[#E5EAE7]" />
          </div>
        </div>
      )}
    </div>
  );
}
