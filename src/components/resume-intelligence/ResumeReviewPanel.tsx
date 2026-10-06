"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
  getApplicationResumeReviewAction,
  requestApplicationResumeReviewAction,
} from "@/lib/resume-intelligence/actions";
import type { ResumeReviewPresentation } from "@/lib/resume-intelligence/presentation";

interface Props {
  applicationId: string;
  canRequest?: boolean;
}

export function ResumeReviewPanel({ applicationId, canRequest = true }: Props) {
  const [review, setReview] = useState<ResumeReviewPresentation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showDetails, setShowDetails] = useState(false);

  const load = () => {
    startTransition(async () => {
      const res = await getApplicationResumeReviewAction(applicationId);
      if (!res.success) {
        setError(res.error || "We couldn't load your resume review.");
        return;
      }
      setError(null);
      setReview(res.data || null);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const requestReview = () => {
    startTransition(async () => {
      const res = await requestApplicationResumeReviewAction(applicationId);
      if (!res.success) {
        setError(res.error || "We couldn't start the resume review.");
        return;
      }
      setError(null);
      load();
    });
  };

  return (
    <section
      className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden"
      data-testid="resume-review-panel"
    >
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Resume Review
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          How well this resume represents your experience
        </p>
      </div>

      <div className="p-5 space-y-4 text-xs">
        {error && (
          <div
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800"
            role="alert"
          >
            {error}
            <button
              type="button"
              onClick={load}
              className="ml-2 font-semibold underline cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}

        {!review && !error && (
          <p className="text-slate-500">{pending ? "Loading…" : "Preparing…"}</p>
        )}

        {review && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">
                  {review.statusMessage}
                </p>
                {review.documentTitle && (
                  <p className="text-slate-500 mt-1">
                    Resume: {review.documentTitle}
                  </p>
                )}
              </div>
              {canRequest &&
                (review.status === "NOT_STARTED" ||
                  review.status === "FAILED" ||
                  review.status === "STALE") && (
                  <button
                    type="button"
                    onClick={requestReview}
                    disabled={pending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition disabled:opacity-50 cursor-pointer"
                  >
                    {pending ? "Starting…" : "Review this resume"}
                  </button>
                )}
            </div>

            {(review.status === "READY" || review.status === "STALE") && (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Overall
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1 capitalize">
                    {(review.overallLabel || "good foundation").replace(/_/g, " ")}
                  </p>
                  {review.overallSummary && (
                    <p className="text-slate-600 mt-1 leading-relaxed">
                      {review.overallSummary}
                    </p>
                  )}
                </div>

                {review.strengths.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                      What&apos;s working
                    </p>
                    <ul className="space-y-1.5 text-slate-700">
                      {review.strengths.map((s, i) => (
                        <li key={`${s.label}-${i}`} className="flex gap-2">
                          <span className="text-emerald-600" aria-hidden>
                            ✓
                          </span>
                          <span>{s.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {review.recommendations.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                      What could be stronger
                    </p>
                    <ul className="space-y-2 text-slate-700">
                      {review.recommendations.slice(0, 6).map((r) => (
                        <li
                          key={r.code || r.title}
                          className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2"
                        >
                          <p className="font-semibold text-slate-900">{r.title}</p>
                          <p className="mt-0.5 leading-relaxed">{r.message}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    ATS readability
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1 capitalize">
                    {(review.ats.label || "good").replace(/_/g, " ")}
                  </p>
                  {review.ats.summary && (
                    <p className="text-slate-600 mt-1 leading-relaxed">
                      {review.ats.summary}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Recommended next steps
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700">
                    <li>Make your strongest relevant experience easier to find.</li>
                    <li>Review the areas that are not clearly represented.</li>
                    <li>
                      Keep all resume claims accurate to your actual experience.
                    </li>
                  </ol>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="text-xs font-semibold text-slate-700 underline underline-offset-2 cursor-pointer"
                >
                  {showDetails ? "Hide detailed analysis" : "View detailed analysis"}
                </button>

                {showDetails && review.ats.findings.length > 0 && (
                  <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-slate-600">
                    {review.ats.findings.map((f) => (
                      <li key={f.code}>
                        <span className="font-medium text-slate-800">
                          {f.severity === "issue"
                            ? "Issue"
                            : f.severity === "warning"
                              ? "Note"
                              : "Info"}
                          :
                        </span>{" "}
                        {f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {(review.status === "QUEUED" || review.status === "ANALYZING") && (
              <p className="text-slate-500">
                This may take a minute. Your resume itself is unchanged.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
