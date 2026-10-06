"use client";

import Link from "next/link";
import type { CandidateJobFeedItem } from "@/lib/job-matching/feed-types";
import { formatSalary } from "@/lib/utils/status-presenter";
import { formatApplicationCardDate } from "@/lib/utils/format-application-date";
import {
  formatEmploymentType,
  getCategoryVisual,
} from "@/lib/job-matching/feed-ui";
import { continuityPrimaryBadge } from "@/lib/job-matching/continuity-ui";

type Props = {
  item: CandidateJobFeedItem;
  busy?: boolean;
  historyMode?: boolean;
  onViewDetails: (matchId: string) => void;
  onSave: (matchId: string) => void;
  onDismiss: (matchId: string) => void;
  onRequest: (matchId: string) => void;
};

export function CandidateJobMatchCard({
  item,
  busy = false,
  historyMode = false,
  onViewDetails,
  onSave,
  onDismiss,
  onRequest,
}: Props) {
  const visual = getCategoryVisual(item.match.category);
  const salary = formatSalary(
    item.job.salaryMin,
    item.job.salaryMax,
    item.job.salaryCurrency
  );
  const metaParts = [
    item.job.isRemote ? "Remote" : item.job.location || null,
    formatEmploymentType(item.job.employmentType),
  ].filter(Boolean);
  const continuity = item.continuity ?? null;
  const jobClosed = item.job.status !== "OPEN";
  const mutationsDisabled = busy || (historyMode && jobClosed);

  return (
    <article
      className="rounded-[14px] border border-[#E5EAE7] bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,32,26,0.04)]"
      data-testid="job-match-card"
      data-match-id={item.matchId}
      data-category={item.match.category}
      data-history={historyMode ? "true" : "false"}
      data-decision-state={continuity?.decisionState ?? ""}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              {item.job.companyName}
            </p>
            <h3 className="text-lg font-semibold tracking-tight text-[#0F1720] sm:text-xl">
              {item.job.title}
            </h3>
            <p className="text-sm text-[#475569]">
              {metaParts.join(" · ")}
              {salary !== "Salary not disclosed" ? (
                <span className="text-[#0F1720]">
                  {" · "}
                  {salary}
                </span>
              ) : (
                <span className="text-[#94A3B8]"> · Salary not listed</span>
              )}
            </p>
          </div>

          {continuity ? (
            <div
              className="space-y-1.5"
              data-testid="job-match-continuity"
              aria-label={`Your decision: ${continuity.decisionLabel}. ${continuity.progressLabel}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold tracking-wide ${continuityPrimaryBadge(continuity).className}`}
                >
                  {continuityPrimaryBadge(continuity).label}
                </span>
                <span className="text-sm font-medium text-[#0F1720]">
                  {continuity.progressLabel}
                </span>
              </div>
              {continuity.jobAvailabilityLabel ? (
                <p className="text-xs font-medium text-[#92400E]">
                  {continuity.jobAvailabilityLabel}
                </p>
              ) : historyMode ? (
                <p className="text-xs text-[#64748B]">Job still available</p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold tracking-wide ${visual.badgeClass}`}
              >
                {visual.label}
              </span>
              <span className={`text-xs font-medium ${visual.accentClass}`}>
                {visual.shortHint}
              </span>
              {item.state.saved && (
                <span className="inline-flex items-center rounded-md border border-[#D1FAE5] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#065F46]">
                  Saved
                </span>
              )}
              {item.state.applicationRequested && (
                <span className="inline-flex items-center rounded-md border border-[#DBEAFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
                  Queued for your team
                </span>
              )}
            </div>
          )}

          {!historyMode && item.match.whyThisJobMayFit ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Why this job may fit
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#334155]">
                {item.match.whyThisJobMayFit}
              </p>
            </div>
          ) : null}

          {!historyMode && item.match.strengths.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Your strengths
              </p>
              <ul className="mt-1.5 space-y-1">
                {item.match.strengths.slice(0, 3).map((s) => (
                  <li key={`${item.matchId}-s-${s.title}`} className="text-sm text-[#0F1720]">
                    <span className="text-[#12A150]">•</span> {s.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!historyMode && item.match.thingsToCheck.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Things to check
              </p>
              <ul className="mt-1.5 space-y-1">
                {item.match.thingsToCheck.slice(0, 2).map((t) => (
                  <li key={`${item.matchId}-t-${t.title}`} className="text-sm text-[#475569]">
                    <span className="text-[#B45309]">•</span> {t.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!historyMode && item.match.preferences.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Your preferences
              </p>
              <ul className="mt-1.5 space-y-1">
                {item.match.preferences.slice(0, 3).map((p) => (
                  <li key={`${item.matchId}-p-${p.title}`} className="text-sm text-[#334155]">
                    <span className="text-[#12A150]" aria-hidden>
                      {p.tone === "ok" ? "✓" : p.tone === "warn" ? "!" : "·"}
                    </span>{" "}
                    {p.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {item.match.evaluatedAt ? (
            <p className="text-[11px] text-[#94A3B8]">
              Evaluated {formatApplicationCardDate(item.match.evaluatedAt)}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:w-44 lg:flex-col">
          <button
            type="button"
            onClick={() => onViewDetails(item.matchId)}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#D5DDD8] bg-white px-3 text-sm font-semibold text-[#0F1720] transition hover:bg-[#F8FAF9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
          >
            {historyMode ? "View details" : "View details"}
          </button>
          {continuity?.applicationHref ? (
            <Link
              href={continuity.applicationHref}
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#0B3B2C] px-3 text-sm font-semibold text-white transition hover:bg-[#0F4A38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150]"
              aria-label={`View application for ${item.job.title}`}
            >
              View application
            </Link>
          ) : null}
          {!historyMode || !jobClosed ? (
            <>
              <button
                type="button"
                onClick={() => onSave(item.matchId)}
                disabled={mutationsDisabled || item.state.saved}
                className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#BBF7D0] bg-[#ECFDF5] px-3 text-sm font-semibold text-[#065F46] transition hover:bg-[#D1FAE5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
              >
                {item.state.saved ? "Saved" : "Save"}
              </button>
              {!item.state.applicationRequested ? (
                <button
                  type="button"
                  onClick={() => onRequest(item.matchId)}
                  disabled={mutationsDisabled}
                  className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#0B3B2C] px-3 text-sm font-semibold text-white transition hover:bg-[#0F4A38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
                >
                  Request application
                </button>
              ) : !continuity?.applicationExists ? (
                <span className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#DBEAFE] bg-[#EFF6FF] px-3 text-sm font-semibold text-[#1D4ED8]">
                  Queued for your team
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onDismiss(item.matchId)}
                disabled={mutationsDisabled}
                className="inline-flex h-10 items-center justify-center rounded-[10px] px-3 text-sm font-medium text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#0F1720] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
              >
                Not interested
              </button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
