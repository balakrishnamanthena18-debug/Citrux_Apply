"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { CandidateJobFeedItem } from "@/lib/job-matching/feed-types";
import type { CandidateJobMatchDetail } from "@/lib/job-matching/detail-types";
import { formatSalary } from "@/lib/utils/status-presenter";
import { formatApplicationCardDate } from "@/lib/utils/format-application-date";
import {
  formatEmploymentType,
  getCategoryVisual,
} from "@/lib/job-matching/feed-ui";
import { groupQualificationByDimension } from "@/lib/job-matching/detail-ui";
import { continuityPrimaryBadge } from "@/lib/job-matching/continuity-ui";

type Props = {
  item: CandidateJobFeedItem | null;
  detail: CandidateJobMatchDetail | null;
  detailLoading?: boolean;
  detailError?: string | null;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (matchId: string) => void;
  onDismiss: (matchId: string) => void;
  onRequest: (matchId: string) => void;
};

export function CandidateJobMatchDetailDrawer({
  item,
  detail,
  detailLoading = false,
  detailError = null,
  open,
  busy = false,
  onClose,
  onSave,
  onDismiss,
  onRequest,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !item) return null;

  const visual = getCategoryVisual(item.match.category);
  const salary = formatSalary(
    item.job.salaryMin,
    item.job.salaryMax,
    item.job.salaryCurrency
  );
  const view = detail ?? null;
  const why = view?.match.whyThisJobMayFit ?? item.match.whyThisJobMayFit;
  const strengths = view?.match.strengths ?? item.match.strengths;
  const thingsToCheck = view?.match.thingsToCheck ?? item.match.thingsToCheck;
  const preferences = view?.match.preferences ?? item.match.preferences;
  const evaluatedAt = view?.match.evaluatedAt ?? item.match.evaluatedAt;
  const saved = view?.state.saved ?? item.state.saved;
  const requested =
    view?.state.applicationRequested ?? item.state.applicationRequested;
  const externalUrl = view?.job.externalUrl ?? null;
  const sourceLabel = view?.job.sourceLabel ?? null;
  const jobDescription = view?.job.jobDescription ?? null;
  const jobStatus = view?.job.status ?? item.job.status;
  const continuity = view?.continuity ?? item.continuity ?? null;
  const qualificationGroups = groupQualificationByDimension(
    view?.match.qualificationSummary ?? []
  );
  const jobClosed = jobStatus !== "OPEN";
  const actionsDisabled = busy || Boolean(detailError) || jobClosed;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-match-detail-title"
      data-testid="job-match-detail-drawer"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#0B3B2C]/30"
        aria-label="Close job details"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[#E5EAE7] bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#E5EAE7] bg-white px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              {item.job.companyName}
            </p>
            <h2
              id="job-match-detail-title"
              className="mt-1 text-xl font-semibold tracking-tight text-[#0F1720]"
            >
              {item.job.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#64748B] hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150]"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-5">
          {continuity ? (
            <section
              className="rounded-[12px] border border-[#E5EAE7] bg-[#F8FAF9] px-3 py-3"
              data-testid="job-match-decision-strip"
              aria-label="Your decision"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Your decision
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold tracking-wide ${continuityPrimaryBadge(continuity).className}`}
                >
                  {continuityPrimaryBadge(continuity).label}
                </span>
                <span className="text-sm font-semibold text-[#0F1720]">
                  {continuity.progressLabel}
                </span>
              </div>
              {continuity.jobAvailabilityLabel ? (
                <p className="mt-1.5 text-xs font-medium text-[#92400E]">
                  {continuity.jobAvailabilityLabel}
                </p>
              ) : null}
              {continuity.applicationHref ? (
                <p className="mt-2">
                  <Link
                    href={continuity.applicationHref}
                    className="text-sm font-semibold text-[#0B3B2C] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150]"
                    aria-label={`View application for ${item.job.title}`}
                  >
                    View application
                  </Link>
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="space-y-2 text-sm text-[#475569]">
            <p>
              {[
                item.job.isRemote ? "Remote" : item.job.location || "Location unspecified",
                formatEmploymentType(item.job.employmentType),
              ].join(" · ")}
            </p>
            <p
              className={
                salary === "Salary not disclosed"
                  ? "text-[#94A3B8]"
                  : "font-medium text-[#0F1720]"
              }
            >
              {salary === "Salary not disclosed" ? "Salary not listed" : salary}
            </p>
            {sourceLabel ? (
              <p className="text-xs text-[#94A3B8]">Source: {sourceLabel}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold tracking-wide ${visual.badgeClass}`}
            >
              {visual.label}
            </span>
            <span className={`text-xs font-medium ${visual.accentClass}`}>
              {visual.shortHint}
            </span>
            {!continuity && saved ? (
              <span className="inline-flex items-center rounded-md border border-[#D1FAE5] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#065F46]">
                Saved
              </span>
            ) : null}
            {!continuity && requested ? (
              <span className="inline-flex items-center rounded-md border border-[#DBEAFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
                Queued for your team
              </span>
            ) : null}
          </div>

          {externalUrl ? (
            <p>
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#0B3B2C] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12A150]"
              >
                View original posting
                <span aria-hidden>↗</span>
              </a>
            </p>
          ) : null}

          {detailError ? (
            <div
              className="rounded-[12px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-sm text-[#92400E]"
              role="status"
              data-testid="job-match-detail-unavailable"
            >
              {detailError}
            </div>
          ) : null}

          {why ? (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Why this job may fit
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#334155]">{why}</p>
            </section>
          ) : null}

          {strengths.length > 0 ? (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Your strengths
              </h3>
              <ul className="mt-2 space-y-2">
                {strengths.map((s) => (
                  <li key={`d-s-${s.title}`} className="text-sm text-[#0F1720]">
                    <span className="font-medium">{s.title}</span>
                    <span className="block text-[#64748B]">{s.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {thingsToCheck.length > 0 ? (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Things to check
              </h3>
              <ul className="mt-2 space-y-2">
                {thingsToCheck.map((t) => (
                  <li key={`d-t-${t.title}`} className="text-sm text-[#0F1720]">
                    <span className="font-medium">{t.title}</span>
                    <span className="block text-[#64748B]">{t.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {preferences.length > 0 ? (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                Your preferences
              </h3>
              <ul className="mt-2 space-y-2">
                {preferences.map((p) => (
                  <li key={`d-p-${p.title}`} className="text-sm text-[#334155]">
                    {p.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detailLoading ? (
            <p className="text-sm text-[#64748B]" role="status">
              Loading job details…
            </p>
          ) : null}

          {!detailLoading && qualificationGroups.length > 0 ? (
            <section data-testid="job-match-role-looks-for">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                What this role looks for
              </h3>
              <div className="mt-3 space-y-3">
                {qualificationGroups.map((group) => (
                  <div key={group.dimension}>
                    <p className="text-xs font-semibold text-[#0F1720]">
                      {group.dimensionLabel}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {group.items.map((line) => (
                        <li
                          key={`${group.dimension}-${line.label}`}
                          className="text-sm text-[#475569]"
                        >
                          {line.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!detailLoading && jobDescription ? (
            <section data-testid="job-match-about-role">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                About the role
              </h3>
              <div className="mt-2 max-h-[min(50vh,28rem)] overflow-y-auto rounded-[12px] border border-[#E5EAE7] bg-[#F8FAF9] p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#334155]">
                  {jobDescription}
                </p>
              </div>
            </section>
          ) : null}

          {evaluatedAt ? (
            <p className="text-[11px] text-[#94A3B8]">
              Evaluated {formatApplicationCardDate(evaluatedAt)}
            </p>
          ) : null}
        </div>

        <div className="sticky bottom-0 mt-auto space-y-2 border-t border-[#E5EAE7] bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
            Your decision
          </p>
          {continuity?.applicationHref ? (
            <Link
              href={continuity.applicationHref}
              className="inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[#0B3B2C] text-sm font-semibold text-white hover:bg-[#0F4A38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150]"
              aria-label={`View application for ${item.job.title}`}
            >
              View application
            </Link>
          ) : null}
          {!requested ? (
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => onRequest(item.matchId)}
              className="inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[#0B3B2C] text-sm font-semibold text-white hover:bg-[#0F4A38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
            >
              Request application
            </button>
          ) : !continuity?.applicationExists ? (
            <div className="rounded-[10px] border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-2.5 text-center">
              <p className="text-sm font-semibold text-[#1D4ED8]">
                Queued for your team
              </p>
              <p className="mt-0.5 text-xs text-[#3B82F6]">
                Your team has been asked to pursue this opportunity.
              </p>
            </div>
          ) : (
            <div className="rounded-[10px] border border-[#E5EAE7] bg-[#F8FAF9] px-3 py-2.5 text-center">
              <p className="text-sm font-semibold text-[#0F1720]">
                {continuity?.progressLabel ?? "Application started"}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={actionsDisabled || saved}
              onClick={() => onSave(item.matchId)}
              className="inline-flex h-11 items-center justify-center rounded-[10px] border border-[#BBF7D0] bg-[#ECFDF5] text-sm font-semibold text-[#065F46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
            >
              {saved ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={() => onDismiss(item.matchId)}
              className="inline-flex h-11 items-center justify-center rounded-[10px] border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12A150] disabled:opacity-50"
            >
              Not interested
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
