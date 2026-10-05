"use client";

import type { ApplicationIntelligenceViewModel } from "@/lib/application-intelligence/presentation";
import {
  CANDIDATE_ADVISORY_DISCLAIMER,
  CANDIDATE_ASSESSMENT_HEADING,
  CANDIDATE_ASSESSMENT_SUBTITLE,
  STAFF_ADVISORY_DISCLAIMER,
  buildAssessmentSummary,
  buildWhatWeFoundLines,
  humanFitExplanation,
  humanFitStatusLabel,
  humanFreshnessLabel,
  humanImportanceLabel,
  humanIssueExplanation,
  humanRecommendation,
  selectReviewItems,
  selectStrengthItems,
  strengthDisplayLabel,
} from "@/lib/application-intelligence/human-assessment";

type Props = {
  view: ApplicationIntelligenceViewModel;
  /** "candidate" hides staff-only meta; "staff" may show operational ids. */
  audience: "candidate" | "staff";
};

function FindingIcon({ kind }: { kind: "matched" | "partial" | "missing" | "unknown" }) {
  const map = {
    matched: { symbol: "✓", className: "text-emerald-700" },
    partial: { symbol: "◐", className: "text-amber-800" },
    missing: { symbol: "!", className: "text-rose-700" },
    unknown: { symbol: "?", className: "text-slate-600" },
  } as const;
  const item = map[kind];
  return (
    <span aria-hidden="true" className={`font-semibold ${item.className}`}>
      {item.symbol}
    </span>
  );
}

function FitItemRow({
  item,
  index,
  showTechnical,
}: {
  item: ApplicationIntelligenceViewModel["fitItems"][number];
  index: number;
  showTechnical: boolean;
}) {
  const panelId = `assessment-fit-${item.requirementId || index}`;
  const isOptional = item.importance === "PREFERRED";

  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <details className="group">
        <summary
          className="flex cursor-pointer list-none flex-col gap-2 px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded-lg"
          aria-controls={panelId}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                isOptional
                  ? "border-slate-200 bg-slate-50 text-slate-700"
                  : "border-slate-300 bg-white text-slate-800"
              }`}
            >
              {humanImportanceLabel(item.importance)}
            </span>
            <span className="text-[11px] font-medium text-slate-600">
              {humanFitStatusLabel(item.status)}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-900 break-words">
            {item.requirementValue}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {humanFitExplanation(item)}
          </p>
          <span className="text-[11px] font-semibold text-slate-500 group-open:hidden">
            Why we say this →
          </span>
          <span className="hidden text-[11px] font-semibold text-slate-500 group-open:inline">
            Hide details
          </span>
        </summary>
        <div
          id={panelId}
          className="space-y-2 border-t border-slate-100 px-3 py-3 text-xs text-slate-700"
        >
          <div>
            <p className="font-semibold uppercase tracking-wider text-[10px] text-slate-500">
              From your profile
            </p>
            <p className="mt-0.5 leading-relaxed">
              {item.candidateEvidenceSummary ||
                "No matching detail was attached from your profile."}
            </p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider text-[10px] text-slate-500">
              From the job description
            </p>
            <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">
              {item.jobEvidenceExcerpt || "No job excerpt was attached."}
            </p>
          </div>
          {showTechnical && (
            <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-2 text-[11px] text-slate-600 space-y-1">
              <p className="font-semibold uppercase tracking-wider text-[10px] text-slate-500">
                Technical details
              </p>
              <p>
                Status: <span className="font-mono">{item.status}</span>
              </p>
              <p>
                Importance:{" "}
                <span className="font-mono">{item.importance}</span>
              </p>
              {item.ruleId && (
                <p>
                  Rule: <span className="font-mono">{item.ruleId}</span>
                </p>
              )}
              {item.candidateProvenance && (
                <p>
                  Provenance:{" "}
                  <span className="font-mono">{item.candidateProvenance}</span>
                </p>
              )}
              {item.explanation && (
                <p className="leading-relaxed">{item.explanation}</p>
              )}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

export function ApplicationIntelligenceSection({ view, audience }: Props) {
  const showCompleted = view.phase === "CURRENT" || view.phase === "STALE";
  const disclaimer =
    audience === "staff"
      ? STAFF_ADVISORY_DISCLAIMER
      : CANDIDATE_ADVISORY_DISCLAIMER;
  const summary = showCompleted ? buildAssessmentSummary(view) : null;
  const findings = showCompleted ? buildWhatWeFoundLines(view) : [];
  const strengths = showCompleted ? selectStrengthItems(view.fitItems) : [];
  const reviewItems = showCompleted ? selectReviewItems(view.fitItems) : [];
  const recommendation = showCompleted
    ? humanRecommendation(view.nextActions)
    : null;
  const scoreLabel =
    view.overallScore !== null ? `${view.overallScore} / 100` : null;

  return (
    <section
      aria-labelledby="application-intelligence-heading"
      className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-5 overflow-hidden"
      data-testid="application-intelligence-section"
      data-intelligence-phase={view.phase}
    >
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2
            id="application-intelligence-heading"
            className="text-xs font-semibold uppercase tracking-wider text-slate-600"
          >
            {CANDIDATE_ASSESSMENT_HEADING}
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">
            {CANDIDATE_ASSESSMENT_SUBTITLE}
          </p>
        </div>
        <span
          className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
            view.phase === "CURRENT"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : view.phase === "STALE" || view.phase === "PENDING"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : view.phase === "FAILED"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {humanFreshnessLabel(view.phase)}
        </span>
      </div>

      <p
        className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] leading-relaxed text-slate-600"
        data-testid="intelligence-advisory-disclaimer"
        role="note"
      >
        {disclaimer}
      </p>

      {!showCompleted && (
        <div
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 space-y-2"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-slate-900">
            {view.messaging.title}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {view.messaging.body}
          </p>
        </div>
      )}

      {showCompleted && summary && (
        <>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Your match
              </p>
              <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-4">
                <p className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {scoreLabel ?? "—"}
                </p>
                <p className="text-sm font-semibold text-slate-800 pb-1">
                  {summary.matchHeadline}
                </p>
              </div>
              <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                {summary.summaryParagraph}
              </p>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Overall match based on the information currently available.
              </p>
            </div>

            {view.phase === "STALE" && (
              <p
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed"
                role="status"
              >
                Your assessment may be out of date. This assessment was created
                using an earlier version of your profile or the job description.
                An updated assessment is needed.
              </p>
            )}
          </div>

          {findings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                What we found
              </h3>
              <ul className="space-y-1.5">
                {findings.map((line) => (
                  <li
                    key={line.kind}
                    className="flex items-start gap-2 text-sm text-slate-700"
                  >
                    <FindingIcon kind={line.kind} />
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {strengths.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Your strengths
              </h3>
              <ul className="space-y-2">
                {strengths.map((item, i) => (
                  <li
                    key={item.requirementId || `strength-${i}`}
                    className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-sm text-slate-800"
                  >
                    <span aria-hidden="true" className="text-emerald-700 font-semibold">
                      ✓
                    </span>
                    <span>
                      <span className="font-medium">
                        {strengthDisplayLabel(item)}
                      </span>
                      {item.candidateEvidenceSummary && (
                        <span className="block text-xs text-slate-600 mt-0.5">
                          Based on: {item.candidateEvidenceSummary}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.blockers.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
                Important to resolve
              </h3>
              <ul className="space-y-2">
                {view.blockers.map((b) => (
                  <li
                    key={b.code}
                    className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-950 leading-relaxed"
                  >
                    <p className="font-semibold text-sm">{b.message}</p>
                    <p className="mt-1">{humanIssueExplanation(b)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reviewItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Things to review
              </h3>
              <ul className="space-y-2">
                {reviewItems.map((item, i) => (
                  <li
                    key={item.requirementId || `review-${i}`}
                    className="rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-3 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span aria-hidden="true" className="text-amber-800 font-semibold">
                        ⚠
                      </span>
                      <p className="text-sm font-semibold text-slate-900">
                        {item.requirementValue}
                      </p>
                      <span className="text-[11px] font-medium text-slate-600">
                        {humanImportanceLabel(item.importance)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed pl-5">
                      {humanFitExplanation(item)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.warnings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
                Additional notes
              </h3>
              <ul className="space-y-2">
                {view.warnings.map((w) => (
                  <li
                    key={w.code}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-950 leading-relaxed"
                  >
                    <p className="font-semibold">{w.message}</p>
                    <p className="mt-0.5">{humanIssueExplanation(w)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              What this means
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {summary.whatThisMeans}
            </p>
          </div>

          {recommendation && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                What we recommend
              </h3>
              <p className="rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-800 leading-relaxed">
                {recommendation}
              </p>
              <p className="text-[11px] text-slate-500">
                This recommendation is informational only. It does not change
                your application state.
              </p>
            </div>
          )}

          <details className="rounded-lg border border-slate-200">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg">
              View detailed assessment →
            </summary>
            <div className="space-y-4 border-t border-slate-100 px-3 py-4">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Detailed requirement-by-requirement review. Technical status
                codes stay inside each item&apos;s details.
              </p>

              {view.fitItems.length === 0 ? (
                <p className="text-xs text-slate-600">
                  No requirement details were available with this assessment.
                </p>
              ) : (
                <ul className="space-y-2">
                  {view.fitItems.map((item, i) => (
                    <FitItemRow
                      key={item.requirementId || `fit-${i}`}
                      item={item}
                      index={i}
                      showTechnical
                    />
                  ))}
                </ul>
              )}

              <details className="rounded-lg border border-slate-100 bg-slate-50/60">
                <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg">
                  Assessment details
                </summary>
                <dl className="grid grid-cols-1 gap-2 border-t border-slate-100 px-3 py-3 text-xs text-slate-700 sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">
                      Internal readiness
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {view.readinessState || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">
                      Freshness
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {view.freshness || view.phase}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">
                      Scoring
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {view.versions.scoringVersion || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">
                      Explainability
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {view.versions.explainabilityVersion || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">
                      Readiness version
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {view.versions.readinessVersion || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">
                      Normalization
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {view.versions.normalizationVersion || "—"}
                    </dd>
                  </div>
                </dl>
              </details>

              {audience === "staff" && view.staffMeta && (
                <details className="rounded-lg border border-slate-200">
                  <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg">
                    Application Intelligence — staff metadata
                  </summary>
                  <dl className="grid grid-cols-1 gap-2 border-t border-slate-100 px-3 py-3 text-xs text-slate-700 sm:grid-cols-2">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase text-slate-500">
                        Alignment result
                      </dt>
                      <dd className="font-mono text-[11px] break-all">
                        {view.staffMeta.alignmentResultId || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase text-slate-500">
                        Readiness result
                      </dt>
                      <dd className="font-mono text-[11px] break-all">
                        {view.staffMeta.readinessResultId || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase text-slate-500">
                        Run
                      </dt>
                      <dd className="font-mono text-[11px] break-all">
                        {view.staffMeta.runId || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase text-slate-500">
                        Purpose
                      </dt>
                      <dd className="font-mono text-[11px]">
                        {view.staffMeta.analysisPurpose || "—"}
                      </dd>
                    </div>
                  </dl>
                </details>
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
