/**
 * Shared route-loading skeleton primitives for Phase 10.
 * Matches OOS corporate surfaces: #F7F9F8, white cards, soft borders, green accents.
 * Server-safe (no "use client") so loading.tsx can import freely.
 */

import type { ReactNode } from "react";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#E5EAE7] ${className}`} />;
}

function SkeletonCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#E5EAE7] bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function RouteLoadingAnnounce({ label }: { label: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {label}
    </span>
  );
}

/** Metric strip: 4 KPI tiles */
export function MetricsStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className="p-4 space-y-3">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-2.5 w-28" />
        </SkeletonCard>
      ))}
    </div>
  );
}

/** Workbench toolbar: tabs + search + filters */
export function WorkbenchToolbarSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div className="flex items-center gap-2 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-8 w-20 rounded-lg" />
        ))}
      </div>
      <SkeletonBlock className="h-9 w-full sm:w-56 rounded-[11px]" />
    </div>
  );
}

/** Table-like list skeleton */
export function TableRowsSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <SkeletonCard className="overflow-hidden">
      <div className="px-4 py-3 border-b border-[#EDF1EF] bg-[#F7F9F8] flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBlock key={i} className="h-3 flex-1 max-w-[120px]" />
        ))}
      </div>
      <div className="divide-y divide-[#EDF1EF]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3.5 flex items-center gap-4">
            {Array.from({ length: columns }).map((_, c) => (
              <SkeletonBlock
                key={c}
                className={`h-3.5 ${c === 0 ? "w-1/4" : c === columns - 1 ? "w-16" : "flex-1"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

/** Card list skeleton (tasks / candidate apps) */
export function CardListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} className="p-4 flex items-start gap-4">
          <SkeletonBlock className="h-10 w-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-2/5" />
            <SkeletonBlock className="h-3 w-3/5" />
            <div className="flex gap-2 pt-1">
              <SkeletonBlock className="h-5 w-16 rounded-full" />
              <SkeletonBlock className="h-5 w-20 rounded-full" />
            </div>
          </div>
          <SkeletonBlock className="h-8 w-20 rounded-lg flex-shrink-0" />
        </SkeletonCard>
      ))}
    </div>
  );
}

/** Page header skeleton */
export function PageHeaderSkeleton({ withActions = true }: { withActions?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-7 w-56" />
        <SkeletonBlock className="h-3 w-72 max-w-full" />
      </div>
      {withActions && (
        <div className="flex gap-2">
          <SkeletonBlock className="h-9 w-28 rounded-lg" />
          <SkeletonBlock className="h-9 w-24 rounded-lg" />
        </div>
      )}
    </div>
  );
}

/** Dashboard command-center style skeleton */
export function DashboardSkeleton({
  label = "Loading dashboard",
  metricCount = 4,
  showAttention = true,
}: {
  label?: string;
  metricCount?: number;
  showAttention?: boolean;
}) {
  return (
    <div className="space-y-6">
      <RouteLoadingAnnounce label={label} />
      <PageHeaderSkeleton />
      <MetricsStripSkeleton count={metricCount} />
      {showAttention && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SkeletonCard className="lg:col-span-2 p-5 space-y-4">
            <SkeletonBlock className="h-4 w-40" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard className="p-5 space-y-3">
            <SkeletonBlock className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-12 w-full rounded-lg" />
            ))}
          </SkeletonCard>
        </div>
      )}
      <SkeletonCard className="p-5 space-y-3">
        <SkeletonBlock className="h-4 w-36" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonBlock className="h-8 w-8 rounded-full" />
            <SkeletonBlock className="h-3 flex-1" />
            <SkeletonBlock className="h-3 w-12" />
          </div>
        ))}
      </SkeletonCard>
    </div>
  );
}

/** Applications / tasks workbench skeleton */
export function WorkbenchPageSkeleton({
  label = "Loading workbench",
  variant = "table",
}: {
  label?: string;
  variant?: "table" | "cards";
}) {
  return (
    <div className="space-y-5">
      <RouteLoadingAnnounce label={label} />
      <PageHeaderSkeleton />
      <MetricsStripSkeleton count={4} />
      <WorkbenchToolbarSkeleton />
      {variant === "table" ? <TableRowsSkeleton /> : <CardListSkeleton />}
    </div>
  );
}

/** Messages list skeleton */
export function MessagesPageSkeleton() {
  return (
    <div className="space-y-5">
      <RouteLoadingAnnounce label="Loading messages" />
      <PageHeaderSkeleton withActions={false} />
      <SkeletonCard className="divide-y divide-[#EDF1EF] overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-4 py-4 flex items-center gap-3">
            <SkeletonBlock className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-3.5 w-40" />
              <SkeletonBlock className="h-3 w-3/5" />
            </div>
            <SkeletonBlock className="h-3 w-12" />
          </div>
        ))}
      </SkeletonCard>
    </div>
  );
}

/** Profile / career workspace skeleton */
export function ProfilePageSkeleton() {
  return (
    <div className="space-y-5">
      <RouteLoadingAnnounce label="Loading profile" />
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard className="lg:col-span-2 p-5 space-y-4">
          <SkeletonBlock className="h-4 w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-10 w-full rounded-lg" />
          ))}
        </SkeletonCard>
        <div className="space-y-4">
          <SkeletonCard className="p-5 space-y-3">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-24 w-full rounded-xl" />
          </SkeletonCard>
          <SkeletonCard className="p-5 space-y-3">
            <SkeletonBlock className="h-4 w-24" />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-8 w-full rounded-lg" />
            ))}
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}

/** Application log / desk skeleton */
export function ApplicationLogSkeleton() {
  return (
    <div className="space-y-5">
      <RouteLoadingAnnounce label="Loading application desk" />
      <PageHeaderSkeleton />
      <MetricsStripSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <SkeletonCard className="lg:col-span-2 p-5 space-y-4">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-10 w-full rounded-lg" />
          <SkeletonBlock className="h-32 w-full rounded-xl" />
          <SkeletonBlock className="h-10 w-full rounded-lg" />
        </SkeletonCard>
        <SkeletonCard className="lg:col-span-3 p-5 space-y-3">
          <SkeletonBlock className="h-4 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-14 w-full rounded-lg" />
          ))}
        </SkeletonCard>
      </div>
    </div>
  );
}

/** Members / roster skeleton */
export function MembersPageSkeleton() {
  return (
    <div className="space-y-5">
      <RouteLoadingAnnounce label="Loading members" />
      <PageHeaderSkeleton />
      <WorkbenchToolbarSkeleton />
      <CardListSkeleton rows={8} />
    </div>
  );
}

/** Audit log skeleton */
export function AuditPageSkeleton() {
  return (
    <div className="space-y-5">
      <RouteLoadingAnnounce label="Loading audit trail" />
      <PageHeaderSkeleton withActions={false} />
      <WorkbenchToolbarSkeleton />
      <TableRowsSkeleton rows={10} columns={4} />
    </div>
  );
}

/** Generic dashboard content fallback */
export function GenericDashboardSkeleton() {
  return <WorkbenchPageSkeleton label="Loading workspace" />;
}
