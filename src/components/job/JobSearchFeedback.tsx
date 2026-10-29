"use client";

import React, { useEffect, useState, useId } from "react";
import {
  Loader2,
  Search,
  Sparkles,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Building,
  MapPin,
  ShieldCheck,
  Bookmark,
  ExternalLink,
} from "lucide-react";
import type { LiveProviderExecutionStatus } from "@/lib/job-discovery/types";

export type SearchLifecyclePhase =
  | "IDLE"
  | "PREPARING"
  | "QUERYING"
  | "VERIFYING"
  | "FINALIZING"
  | "COMPLETED"
  | "ERROR";

export interface JobSearchFeedbackProps {
  loading: boolean;
  phase: SearchLifecyclePhase;
  activeSubmittedQuery: string;
  activeLocation?: string;
  providerStatuses: LiveProviderExecutionStatus[];
  error?: string | null;
  onRetry?: () => void;
  onResetFilters?: () => void;
  searchDurationMs?: number;
}

/**
 * Top indeterminate progress line
 * High-precision, calm emerald-to-teal gradient with reduced-motion support.
 */
export function JobSearchProgressBar({ loading }: { loading: boolean }) {
  if (!loading) return null;

  return (
    <div
      role="progressbar"
      aria-label="Job search in progress"
      aria-valuetext="Searching job sources"
      className="w-full h-1 bg-emerald-50 overflow-hidden relative rounded-full"
    >
      <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 via-[#12A150] to-teal-400 w-1/3 rounded-full animate-indeterminate-progress motion-reduce:animate-none motion-reduce:w-full motion-reduce:bg-emerald-600" />
    </div>
  );
}

/**
 * Lifecycle message helper mapping genuine search phases to concise, truthful copy
 */
export function getLifecycleMessage(
  phase: SearchLifecyclePhase,
  elapsedSeconds: number,
  activeLocation?: string
): string {
  if (elapsedSeconds > 4 && phase === "QUERYING") {
    return "Additional sources are still responding…";
  }

  switch (phase) {
    case "PREPARING":
      return activeLocation
        ? `Preparing search parameters for ${activeLocation}…`
        : "Preparing your search…";
    case "QUERYING":
      return "Searching available job sources…";
    case "VERIFYING":
      return "Verifying location and role matches…";
    case "FINALIZING":
      return "Finalizing your opportunities…";
    case "COMPLETED":
      return "Search complete.";
    case "ERROR":
      return "Search encountered an issue.";
    case "IDLE":
    default:
      return "Ready to search.";
  }
}

/**
 * Provider Probing & Status Chip
 */
export function ProviderStatusChip({
  providerName,
  status,
  latencyMs,
  count,
  isLoading,
}: {
  providerName: string;
  status?: "SUCCESS" | "FAILED" | "TIMEOUT" | "UNCONFIGURED";
  latencyMs?: number;
  count?: number;
  isLoading?: boolean;
}) {
  const shortName = providerName.split(" ")[0];

  if (isLoading) {
    return (
      <span
        className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-emerald-200/80 bg-emerald-50/60 text-emerald-800 flex items-center gap-1.5 motion-reduce:animate-none animate-pulse"
        title={`Querying ${providerName}...`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping motion-reduce:animate-none" />
        {shortName}: Querying…
      </span>
    );
  }

  const isSuccess = status === "SUCCESS";
  const isTimeout = status === "TIMEOUT";

  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1.5 transition-colors ${
        isSuccess
          ? "bg-slate-50 text-slate-700 border-slate-200"
          : isTimeout
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : "bg-rose-50 text-rose-800 border-rose-200"
      }`}
      title={`${providerName}: ${status || "Ready"} ${
        latencyMs ? `(${latencyMs}ms)` : ""
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isSuccess
            ? "bg-emerald-500"
            : isTimeout
            ? "bg-amber-500"
            : "bg-rose-500"
        }`}
      />
      {shortName}:{" "}
      {isSuccess
        ? `${count ?? 0} live${latencyMs ? ` • ${latencyMs}ms` : ""}`
        : isTimeout
        ? "Timeout"
        : "Offline"}
    </span>
  );
}

/**
 * Search Status & Diagnostics Bar
 */
export function JobSearchStatusBanner({
  loading,
  phase,
  activeSubmittedQuery,
  activeLocation,
  providerStatuses,
  searchDurationMs,
}: {
  loading: boolean;
  phase: SearchLifecyclePhase;
  activeSubmittedQuery: string;
  activeLocation?: string;
  providerStatuses: LiveProviderExecutionStatus[];
  searchDurationMs?: number;
}) {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (!loading) return;

    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);

    return () => {
      clearInterval(interval);
      setElapsed(0);
    };
  }, [loading]);

  const lifecycleMessage = getLifecycleMessage(phase, elapsed, activeLocation);
  const displayTime = loading
    ? `${(elapsed + 0.5).toFixed(1)}s elapsed`
    : searchDurationMs
    ? `${(searchDurationMs / 1000).toFixed(2)}s`
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-white/80 backdrop-blur-xs border border-emerald-100 rounded-xl px-3.5 py-2.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all"
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-emerald-600 animate-spin motion-reduce:animate-none shrink-0" />
            <span className="text-xs font-semibold text-slate-800">
              {lifecycleMessage}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold text-slate-800">
              Live external results loaded
            </span>
          </div>
        )}

        {activeSubmittedQuery && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/80">
            Query: <strong className="text-slate-800">&ldquo;{activeSubmittedQuery}&rdquo;</strong>
            {activeLocation ? ` • ${activeLocation}` : ""}
          </span>
        )}

        {displayTime && (
          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {displayTime}
          </span>
        )}
      </div>

      {/* Provider Chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {loading && providerStatuses.length === 0 ? (
          <>
            <ProviderStatusChip providerName="FreeHire ATS" isLoading />
            <ProviderStatusChip providerName="Arbeitnow Global" isLoading />
            <ProviderStatusChip providerName="Jobicy API" isLoading />
            <ProviderStatusChip providerName="Direct ATS" isLoading />
          </>
        ) : (
          providerStatuses.map((ps) => (
            <ProviderStatusChip
              key={ps.providerId}
              providerName={ps.providerName}
              status={ps.status}
              latencyMs={ps.latencyMs}
              count={ps.count}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Pixel-Perfect Skeleton Job Cards
 * Matches the actual Job Card structure 1:1 to guarantee zero layout shifts
 */
export function JobSearchSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      role="region"
      aria-busy="true"
      aria-label="Loading job opportunities"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white p-5 rounded-2xl border border-[#E5EAE7] shadow-2xs flex flex-col justify-between space-y-4 animate-pulse motion-reduce:animate-none"
        >
          <div className="space-y-3">
            {/* Top row: Badges + Bookmark */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-24 h-5 bg-emerald-50 border border-emerald-100 rounded-full" />
                <div className="w-16 h-5 bg-slate-100 rounded-full" />
              </div>
              <div className="w-4 h-4 rounded bg-slate-100" />
            </div>

            {/* Title & Employer */}
            <div className="space-y-1.5 pt-1">
              <div className="w-4/5 h-5 bg-slate-200 rounded-md" />
              <div className="w-2/5 h-4 bg-slate-100 rounded-md" />
            </div>

            {/* Location */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <div className="w-3.5 h-3.5 bg-slate-100 rounded-full" />
              <div className="w-1/3 h-3.5 bg-slate-100 rounded" />
            </div>

            {/* Description Snippet (2 lines) */}
            <div className="space-y-1.5 pt-2">
              <div className="w-full h-3 bg-slate-100 rounded" />
              <div className="w-5/6 h-3 bg-slate-100 rounded" />
            </div>

            {/* Skill tags */}
            <div className="flex gap-1.5 pt-2 flex-wrap">
              <div className="w-14 h-5 bg-slate-100 rounded-md" />
              <div className="w-16 h-5 bg-slate-100 rounded-md" />
              <div className="w-12 h-5 bg-slate-100 rounded-md" />
            </div>
          </div>

          {/* Bottom Bar: Relevance bar placeholder + Action buttons */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="w-full h-8 bg-emerald-50/50 border border-emerald-100/60 rounded-lg" />
            <div className="flex items-center justify-between pt-1">
              <div className="w-24 h-4 bg-slate-100 rounded" />
              <div className="flex items-center gap-1.5">
                <div className="w-14 h-7 bg-slate-100 rounded-lg" />
                <div className="w-16 h-7 bg-slate-200 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Terminal Error / Failure State Card
 */
export function JobSearchErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="bg-white p-8 rounded-2xl border border-rose-200 shadow-2xs text-center space-y-4 max-w-xl mx-auto my-6"
    >
      <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
        <AlertCircle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">
          Job Search Encountered an Issue
        </h3>
        <p className="text-xs text-slate-500">{error}</p>
      </div>
      {onRetry && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 bg-[#0B3B2C] hover:bg-[#12A150] text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Search</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Partial Provider Failure Warning
 */
export function JobSearchPartialFailureAlert({
  providerStatuses,
  onRetry,
}: {
  providerStatuses: LiveProviderExecutionStatus[];
  onRetry?: () => void;
}) {
  const failedProviders = providerStatuses.filter(
    (ps) => ps.status === "TIMEOUT" || ps.status === "FAILED"
  );

  if (failedProviders.length === 0) return null;

  return (
    <div
      role="status"
      className="bg-amber-50/90 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between gap-3 shadow-2xs"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          Partial Source Coverage:{" "}
          <strong>
            {failedProviders
              .map(
                (ps) =>
                  `${ps.providerName} (${
                    ps.status === "TIMEOUT" ? "timed out" : "unreachable"
                  })`
              )
              .join(", ")}
          </strong>
          . Showing confirmed results from responsive providers.
        </span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-semibold text-amber-950 underline hover:no-underline shrink-0 cursor-pointer"
        >
          Retry Offline Sources
        </button>
      )}
    </div>
  );
}

/**
 * Clean Empty State when search returns zero matches
 */
export function JobSearchEmptyState({
  query,
  location,
  savedOnly,
  onResetFilters,
}: {
  query?: string;
  location?: string;
  savedOnly?: boolean;
  onResetFilters?: () => void;
}) {
  return (
    <div className="bg-white p-12 rounded-2xl border border-[#E5EAE7] text-center space-y-3 shadow-2xs">
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
        <Search className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">
        No matching job opportunities found
      </h3>
      <p className="text-xs text-slate-500 max-w-md mx-auto">
        {savedOnly
          ? "You haven't bookmarked any job leads yet. Uncheck 'Saved Only' to search live opportunities across external providers."
          : query || location
          ? `No open positions currently matched ${
              query ? `"${query}"` : ""
            } ${location ? `in ${location}` : ""}. Try broadening your keywords or removing negative filters.`
          : "Try broadening your query keywords, removing negative filters, or selecting 'All Countries' and 'All Industries'."}
      </p>
      {onResetFilters && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onResetFilters}
            className="px-4 py-2 bg-[#0B3B2C] hover:bg-[#12A150] text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            Reset all filters
          </button>
        </div>
      )}
    </div>
  );
}
