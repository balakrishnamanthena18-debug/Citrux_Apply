"use client";

import type { ApplicationIntelligenceViewModel } from "@/lib/application-intelligence/presentation";

type Props = {
  view: ApplicationIntelligenceViewModel;
  /** "candidate" hides staff-only meta; "staff" may show operational ids. */
  audience: "candidate" | "staff";
};

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "positive" | "caution" | "attention" | "critical" | "neutral";
}) {
  const styles: Record<typeof tone, string> = {
    positive: "bg-emerald-50 text-emerald-800 border-emerald-200",
    caution: "bg-amber-50 text-amber-900 border-amber-200",
    attention: "bg-orange-50 text-orange-900 border-orange-200",
    critical: "bg-rose-50 text-rose-800 border-rose-200",
    neutral: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${styles[tone]}`}
    >
      <span aria-hidden="true" className="text-[10px]">
        {tone === "positive"
          ? "●"
          : tone === "caution" || tone === "attention"
            ? "▲"
            : tone === "critical"
              ? "■"
              : "○"}
      </span>
      <span>{label}</span>
    </span>
  );
}

function readinessTone(
  state: string | null
): "positive" | "caution" | "attention" | "critical" | "neutral" {
  switch (state) {
    case "READY":
      return "positive";
    case "READY_WITH_WARNINGS":
      return "caution";
    case "REVIEW_REQUIRED":
      return "attention";
    case "BLOCKED":
      return "critical";
    default:
      return "neutral";
  }
}

function fitTone(
  status: string
): "positive" | "caution" | "attention" | "critical" | "neutral" {
  switch (status) {
    case "MATCHED":
      return "positive";
    case "PARTIAL":
      return "attention";
    case "MISSING":
      return "critical";
    default:
      return "neutral";
  }
}

function freshnessTone(
  phase: ApplicationIntelligenceViewModel["phase"]
): "positive" | "caution" | "attention" | "critical" | "neutral" {
  switch (phase) {
    case "CURRENT":
      return "positive";
    case "STALE":
      return "caution";
    case "PENDING":
      return "attention";
    case "FAILED":
      return "critical";
    default:
      return "neutral";
  }
}

function freshnessLabel(phase: ApplicationIntelligenceViewModel["phase"]): string {
  switch (phase) {
    case "CURRENT":
      return "CURRENT";
    case "STALE":
      return "STALE";
    case "PENDING":
      return "PENDING";
    case "FAILED":
      return "FAILED";
    default:
      return "NOT_AVAILABLE";
  }
}

function FitItemRow({
  item,
  index,
  showRuleIds,
}: {
  item: ApplicationIntelligenceViewModel["fitItems"][number];
  index: number;
  showRuleIds: boolean;
}) {
  const panelId = `intel-fit-${item.requirementId || index}`;
  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <details className="group">
        <summary
          className="flex cursor-pointer list-none flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 rounded-lg"
          aria-controls={panelId}
        >
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip
                label={item.importance}
                tone={item.importance === "REQUIRED" ? "critical" : "neutral"}
              />
              <StatusChip label={item.status} tone={fitTone(item.status)} />
            </div>
            <p className="text-sm font-semibold text-slate-900 break-words">
              {item.requirementValue}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              {item.explanation}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-slate-500 group-open:hidden">
            Evidence →
          </span>
          <span className="hidden shrink-0 text-[11px] font-semibold text-slate-500 group-open:inline">
            Hide evidence
          </span>
        </summary>
        <div
          id={panelId}
          className="space-y-2 border-t border-slate-100 px-3 py-3 text-xs text-slate-700"
        >
          <div>
            <p className="font-semibold uppercase tracking-wider text-[10px] text-slate-500">
              Candidate evidence
            </p>
            <p className="mt-0.5 leading-relaxed">
              {item.candidateEvidenceSummary || "No candidate evidence attached."}
            </p>
            {item.candidateProvenance && (
              <p className="mt-1 text-slate-500">
                Source provenance: {item.candidateProvenance}
              </p>
            )}
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider text-[10px] text-slate-500">
              Job evidence
            </p>
            <p className="mt-0.5 leading-relaxed whitespace-pre-wrap">
              {item.jobEvidenceExcerpt || "No job excerpt persisted."}
            </p>
          </div>
          {showRuleIds && item.ruleId && (
            <p className="text-slate-500">
              Rule: <span className="font-mono text-[11px]">{item.ruleId}</span>
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

export function ApplicationIntelligenceSection({ view, audience }: Props) {
  const showCompleted = view.phase === "CURRENT" || view.phase === "STALE";
  // Rule IDs are explainability contract identifiers — safe for both audiences.
  // Staff also see operational result/run metadata separately.
  const showRuleIds = showCompleted;
  const requiredItems = view.fitItems.filter((f) => f.importance === "REQUIRED");
  const preferredItems = view.fitItems.filter((f) => f.importance === "PREFERRED");
  const otherItems = view.fitItems.filter(
    (f) => f.importance !== "REQUIRED" && f.importance !== "PREFERRED"
  );

  return (
    <section
      aria-labelledby="application-intelligence-heading"
      className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-5 overflow-hidden"
      data-testid="application-intelligence-section"
      data-intelligence-phase={view.phase}
    >
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2
            id="application-intelligence-heading"
            className="text-xs font-semibold uppercase tracking-wider text-slate-600"
          >
            Application Intelligence
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {view.messaging.body}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusChip
            label={freshnessLabel(view.phase)}
            tone={freshnessTone(view.phase)}
          />
          {view.readinessState && (
            <StatusChip
              label={`Intelligence readiness: ${view.readinessState.replace(/_/g, " ")}`}
              tone={readinessTone(view.readinessState)}
            />
          )}
        </div>
      </div>

      <p
        className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] leading-relaxed text-slate-600"
        data-testid="intelligence-advisory-disclaimer"
        role="note"
      >
        Intelligence is advisory. Application approval and submission follow the
        application workflow. This panel does not replace QA, candidate approval,
        or external submission.
        {audience === "staff"
          ? " Staff: treat fit/readiness as decision support; QA, approval, and submission remain separate authorities."
          : ""}
      </p>

      {!showCompleted && (
        <div
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-slate-900">
            {view.messaging.title}
          </p>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            {view.messaging.body}
          </p>
          {view.phase === "PENDING" && view.runStatus && (
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Status: {view.runStatus}
            </p>
          )}
        </div>
      )}

      {showCompleted && (
        <>
          {/* Fit summary — mobile priority: readiness, fit, blockers */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Fit summary
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Intelligence readiness
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {view.readinessState?.replace(/_/g, " ") || "UNKNOWN"}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Not application status
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Overall fit
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {view.overallScore !== null ? `${view.overallScore}` : "Not scored"}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Persisted scoring contract value
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Requirements
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusChip
                    label={`${view.counts.matched} matched`}
                    tone="positive"
                  />
                  <StatusChip
                    label={`${view.counts.partial} partial`}
                    tone="attention"
                  />
                  <StatusChip
                    label={`${view.counts.missing} missing`}
                    tone="critical"
                  />
                  <StatusChip
                    label={`${view.counts.unknown} unknown`}
                    tone="neutral"
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {view.counts.required} required · {view.counts.preferred}{" "}
                  preferred
                </p>
              </div>
            </div>
            {view.phase === "STALE" && (
              <p
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                role="status"
              >
                Intelligence is based on an older source version. Do not treat
                this as current analysis.
              </p>
            )}
          </div>

          {/* Readiness detail */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Readiness
            </h3>
            {view.blockers.length === 0 &&
              view.warnings.length === 0 &&
              view.unknowns.length === 0 && (
                <p className="text-xs text-slate-600">
                  No blockers or warnings persisted for this result.
                </p>
              )}
            {view.blockers.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-rose-800">Blockers</p>
                <ul className="space-y-2">
                  {view.blockers.map((b) => (
                    <li
                      key={b.code}
                      className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-950"
                    >
                      <p className="font-semibold">{b.message}</p>
                      <p className="mt-0.5 text-rose-900/80">{b.why}</p>
                      {b.explanation && (
                        <p className="mt-1 text-rose-900/70">{b.explanation}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {view.warnings.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-amber-900">Warnings</p>
                <ul className="space-y-2">
                  {view.warnings.map((w) => (
                    <li
                      key={w.code}
                      className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-950"
                    >
                      <p className="font-semibold">{w.message}</p>
                      <p className="mt-0.5 text-amber-900/80">{w.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {view.unknowns.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-700">
                  Unknown conditions
                </p>
                <ul className="space-y-2">
                  {view.unknowns.map((u) => (
                    <li
                      key={u.code}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                    >
                      <p className="font-semibold">{u.message}</p>
                      <p className="mt-0.5">{u.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {view.nextActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-700">
                  Next action
                </p>
                <ul className="space-y-1.5">
                  {view.nextActions.map((a) => (
                    <li
                      key={a.code}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800"
                    >
                      {a.label}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500">
                  Next actions are informational. This panel does not change
                  application state.
                </p>
              </div>
            )}
          </div>

          {/* Requirement breakdown */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Why this fit
            </h3>
            {requiredItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-800">
                  Required requirements
                </p>
                <ul className="space-y-2">
                  {requiredItems.map((item, i) => (
                    <FitItemRow
                      key={item.requirementId || `req-${i}`}
                      item={item}
                      index={i}
                      showRuleIds={showRuleIds}
                    />
                  ))}
                </ul>
              </div>
            )}
            {preferredItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-800">
                  Preferred requirements
                </p>
                <ul className="space-y-2">
                  {preferredItems.map((item, i) => (
                    <FitItemRow
                      key={item.requirementId || `pref-${i}`}
                      item={item}
                      index={i + requiredItems.length}
                      showRuleIds={showRuleIds}
                    />
                  ))}
                </ul>
              </div>
            )}
            {otherItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-800">
                  Other requirements
                </p>
                <ul className="space-y-2">
                  {otherItems.map((item, i) => (
                    <FitItemRow
                      key={item.requirementId || `other-${i}`}
                      item={item}
                      index={i + requiredItems.length + preferredItems.length}
                      showRuleIds={showRuleIds}
                    />
                  ))}
                </ul>
              </div>
            )}
            {view.fitItems.length === 0 && (
              <p className="text-xs text-slate-600">
                No requirement fit items were persisted with this result.
              </p>
            )}
          </div>

          {/* Versions / evidence metadata */}
          <details className="rounded-lg border border-slate-200">
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg">
              Evidence versions
            </summary>
            <dl className="grid grid-cols-1 gap-2 border-t border-slate-100 px-3 py-3 text-xs text-slate-700 sm:grid-cols-2">
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
                  Readiness
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
              <div>
                <dt className="text-[10px] font-semibold uppercase text-slate-500">
                  Explainability
                </dt>
                <dd className="font-mono text-[11px]">
                  {view.versions.explainabilityVersion || "—"}
                </dd>
              </div>
            </dl>
          </details>

          {audience === "staff" && view.staffMeta && (
            <details className="rounded-lg border border-slate-200">
              <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg">
                Staff operational metadata
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
        </>
      )}
    </section>
  );
}
