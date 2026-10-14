"use client";

import React from "react";

export interface ContentSkeletonOverlayProps {
  isLoading: boolean;
  children?: React.ReactNode;
  skeleton?: React.ReactNode;
  statusLabel?: string;
  className?: string;
}

/**
 * Loading Architecture:
 * 1. Real content: rendered normally when not loading.
 * 2. When loading: the skeleton completely REPLACES the content on an opaque surface,
 *    preventing any underlying stale text or ghost content from bleeding through.
 */
export function ContentSkeletonOverlay({
  isLoading,
  children,
  skeleton,
  statusLabel,
  className = "",
}: ContentSkeletonOverlayProps) {
  return (
    <div className={`relative min-h-[40vh] ${className}`}>
      {isLoading ? (
        <div
          className="w-full min-h-[40vh] bg-[#F7F9F8] rounded-2xl"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          {statusLabel && (
            <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E5EAE7] shadow-2xs">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#12A150]" />
              <span className="text-xs font-semibold text-[#0B3B2C]">{statusLabel}</span>
            </div>
          )}

          {skeleton || (
            <div className="space-y-6 p-2 sm:p-4 animate-pulse">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="space-y-2.5 w-full sm:w-1/3">
                  <div className="h-6 w-48 rounded-lg bg-slate-200" />
                  <div className="h-3.5 w-72 rounded-md bg-slate-100" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-24 rounded-lg bg-slate-200" />
                  <div className="h-8 w-28 rounded-lg bg-slate-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-2xl bg-white border border-slate-200 p-4 space-y-2 shadow-2xs"
                  >
                    <div className="h-3 w-16 rounded bg-slate-200" />
                    <div className="h-6 w-24 rounded bg-slate-300" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 h-80 rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-2xs">
                  <div className="h-5 w-48 rounded-md bg-slate-200" />
                  <div className="space-y-3 pt-2">
                    <div className="h-3 w-full rounded bg-slate-100" />
                    <div className="h-3 w-11/12 rounded bg-slate-100" />
                    <div className="h-3 w-4/5 rounded bg-slate-100" />
                  </div>
                </div>
                <div className="lg:col-span-4 h-80 rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-2xs">
                  <div className="h-5 w-36 rounded-md bg-slate-200" />
                  <div className="h-20 rounded-xl bg-slate-100" />
                  <div className="h-20 rounded-xl bg-slate-100" />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}
