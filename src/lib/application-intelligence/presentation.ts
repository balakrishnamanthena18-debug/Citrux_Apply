/**
 * Gate 9 — UI view-model projection from persisted intelligence.
 * Does not recalculate alignment/readiness. Role-filters STAFF_ONLY fields.
 */

import type { FitStatus, ReadinessState } from "./constants";

export type IntelligenceUiPhase =
  | "NOT_AVAILABLE"
  | "PENDING"
  | "FAILED"
  | "STALE"
  | "CURRENT";

export type IntelligenceFitItemView = {
  requirementId: string;
  requirementValue: string;
  importance: "REQUIRED" | "PREFERRED" | "UNKNOWN" | "NEEDS_REVIEW";
  status: FitStatus;
  explanation: string;
  ruleId: string | null;
  candidateEvidenceSummary: string | null;
  candidateProvenance: string | null;
  jobEvidenceExcerpt: string | null;
  snapshotId: string | null;
};

export type IntelligenceIssueView = {
  code: string;
  severity: "BLOCKER" | "WARNING" | "UNKNOWN";
  message: string;
  why: string;
  explanation: string | null;
  ruleId: string | null;
  resolveAction: string | null;
};

export type IntelligenceNextActionView = {
  code: string;
  label: string;
};

export type ApplicationIntelligenceViewModel = {
  phase: IntelligenceUiPhase;
  overallScore: number | null;
  readinessState: ReadinessState | null;
  freshness: string | null;
  runStatus: string | null;
  counts: {
    matched: number;
    partial: number;
    missing: number;
    unknown: number;
    required: number;
    preferred: number;
  };
  fitItems: IntelligenceFitItemView[];
  blockers: IntelligenceIssueView[];
  warnings: IntelligenceIssueView[];
  unknowns: IntelligenceIssueView[];
  nextActions: IntelligenceNextActionView[];
  versions: {
    scoringVersion: string | null;
    readinessVersion: string | null;
    normalizationVersion: string | null;
    explainabilityVersion: string | null;
  };
  /** Staff-only metadata — null for candidates. */
  staffMeta: {
    alignmentResultId: string;
    readinessResultId: string | null;
    requirementSetId: string | null;
    snapshotId: string | null;
    runId: string | null;
    analysisPurpose: string | null;
    errorCode: string | null;
  } | null;
  messaging: {
    title: string;
    body: string;
  };
};

type RawFitItem = {
  requirementId?: string;
  requirementValue?: string;
  importance?: string;
  status?: string;
  reason?: string;
  explanation?: string;
  ruleId?: string;
  candidateEvidence?: {
    summary?: string;
    provenance?: string;
  } | null;
  requirementEvidence?: {
    excerpt?: string;
    snapshotId?: string;
  } | null;
};

type RawIssue = {
  code?: string;
  severity?: string;
  message?: string;
  why?: string;
  explanation?: string;
  ruleId?: string;
  resolveAction?: string;
};

function asFitStatus(v: string | undefined): FitStatus | null {
  if (v === "MATCHED" || v === "PARTIAL" || v === "MISSING" || v === "UNKNOWN") {
    return v;
  }
  return null;
}

function mapFitItems(raw: unknown): IntelligenceFitItemView[] {
  if (!Array.isArray(raw)) return [];
  const out: IntelligenceFitItemView[] = [];
  for (const item of raw as RawFitItem[]) {
    const status = asFitStatus(item.status);
    if (!status || !item.requirementValue) continue;
    const importance =
      item.importance === "REQUIRED" ||
      item.importance === "PREFERRED" ||
      item.importance === "UNKNOWN" ||
      item.importance === "NEEDS_REVIEW"
        ? item.importance
        : "UNKNOWN";
    out.push({
      requirementId: item.requirementId ?? "",
      requirementValue: item.requirementValue,
      importance,
      status,
      explanation: item.explanation || item.reason || "No explanation persisted.",
      ruleId: item.ruleId ?? null,
      candidateEvidenceSummary: item.candidateEvidence?.summary ?? null,
      candidateProvenance: item.candidateEvidence?.provenance ?? null,
      jobEvidenceExcerpt: item.requirementEvidence?.excerpt ?? null,
      snapshotId: item.requirementEvidence?.snapshotId ?? null,
    });
  }
  return out.sort((a, b) => {
    const rank = (i: IntelligenceFitItemView) =>
      i.importance === "REQUIRED" ? 0 : i.importance === "PREFERRED" ? 1 : 2;
    const byImp = rank(a) - rank(b);
    if (byImp !== 0) return byImp;
    return a.requirementValue.localeCompare(b.requirementValue);
  });
}

function mapIssues(raw: unknown): IntelligenceIssueView[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawIssue[])
    .filter((i) => i.code && i.message && i.severity)
    .map((i) => ({
      code: i.code!,
      severity: (i.severity === "BLOCKER" ||
      i.severity === "WARNING" ||
      i.severity === "UNKNOWN"
        ? i.severity
        : "WARNING") as IntelligenceIssueView["severity"],
      message: i.message!,
      why: i.why ?? "",
      explanation: i.explanation ?? null,
      ruleId: i.ruleId ?? null,
      resolveAction:
        i.resolveAction && i.resolveAction !== "NONE" ? i.resolveAction : null,
    }));
}

function messagingForPhase(phase: IntelligenceUiPhase): {
  title: string;
  body: string;
} {
  switch (phase) {
    case "NOT_AVAILABLE":
      return {
        title: "No analysis available yet",
        body: "The system has not generated intelligence for this application. Absence of analysis is not a negative result.",
      };
    case "PENDING":
      return {
        title: "Analysis in progress",
        body: "We're analyzing the job requirements and application information. Results will appear when the analysis completes.",
      };
    case "FAILED":
      return {
        title: "Analysis unavailable",
        body: "The application intelligence analysis could not be completed. Existing application workflow is unaffected.",
      };
    case "STALE":
      return {
        title: "Intelligence is based on an older source version",
        body: "Displayed results may not reflect the latest candidate facts or job description. Treat them as historical until recomputed. Intelligence is advisory and does not replace QA, candidate approval, or submission.",
      };
    case "CURRENT":
      return {
        title: "Application Intelligence",
        body: "Advisory fit and readiness from persisted analysis. Intelligence does not approve, submit, or change application state — QA, candidate approval, and submission remain separate workflow authorities.",
      };
  }
}

export function buildApplicationIntelligenceViewModel(input: {
  viewer: "CANDIDATE" | "STAFF";
  alignment: {
    id: string;
    runId: string;
    freshness: string;
    scoringVersion: string;
    overallScore: number | null;
    evidence: unknown;
    run: {
      id: string;
      status: string;
      analysisPurpose: string | null;
      requirementSetId: string | null;
      snapshotId: string | null;
      errorCode: string | null;
    } | null;
  } | null;
  readiness: {
    id: string;
    runId: string;
    freshness: string;
    readinessState: string;
    blockers: unknown;
    warnings: unknown;
    nextActions: unknown;
    evidence: unknown;
    run: {
      id: string;
      status: string;
      analysisPurpose: string | null;
      errorCode: string | null;
    } | null;
  } | null;
  latestRun: {
    id: string;
    status: string;
    analysisPurpose: string | null;
    errorCode: string | null;
    freshness: string;
  } | null;
}): ApplicationIntelligenceViewModel {
  const alignment = input.alignment;
  const readiness = input.readiness;
  const latest = input.latestRun;

  let phase: IntelligenceUiPhase = "NOT_AVAILABLE";
  if (
    alignment &&
    alignment.freshness === "CURRENT" &&
    alignment.run?.status === "SUCCEEDED"
  ) {
    phase = "CURRENT";
  } else if (
    alignment &&
    (alignment.freshness === "STALE" ||
      alignment.freshness === "RECOMPUTE_REQUIRED") &&
    alignment.run?.status === "SUCCEEDED"
  ) {
    phase = "STALE";
  } else if (
    latest &&
    (latest.status === "QUEUED" ||
      latest.status === "RUNNING" ||
      latest.status === "RETRY_PENDING")
  ) {
    phase = "PENDING";
  } else if (latest?.status === "FAILED") {
    phase = "FAILED";
  } else if (!alignment && !readiness && !latest) {
    phase = "NOT_AVAILABLE";
  } else if (latest && latest.status !== "SUCCEEDED") {
    phase =
      latest.status === "FAILED"
        ? "FAILED"
        : latest.status === "QUEUED" ||
            latest.status === "RUNNING" ||
            latest.status === "RETRY_PENDING"
          ? "PENDING"
          : "NOT_AVAILABLE";
  }

  const evidence =
    alignment?.evidence &&
    typeof alignment.evidence === "object" &&
    !Array.isArray(alignment.evidence)
      ? (alignment.evidence as Record<string, unknown>)
      : {};
  const fitItems = mapFitItems(evidence.fitItems);
  const counts = {
    matched: fitItems.filter((f) => f.status === "MATCHED").length,
    partial: fitItems.filter((f) => f.status === "PARTIAL").length,
    missing: fitItems.filter((f) => f.status === "MISSING").length,
    unknown: fitItems.filter((f) => f.status === "UNKNOWN").length,
    required: fitItems.filter((f) => f.importance === "REQUIRED").length,
    preferred: fitItems.filter((f) => f.importance === "PREFERRED").length,
  };

  const readinessEvidence =
    readiness?.evidence &&
    typeof readiness.evidence === "object" &&
    !Array.isArray(readiness.evidence)
      ? (readiness.evidence as Record<string, unknown>)
      : {};

  const blockers = mapIssues(readiness?.blockers);
  const warnings = mapIssues(readiness?.warnings);
  const unknowns = mapIssues(readinessEvidence.unknowns).filter(
    (i) => i.severity === "UNKNOWN"
  );

  const nextActionsRaw = Array.isArray(readiness?.nextActions)
    ? (readiness!.nextActions as Array<{ code?: string; label?: string }>)
    : [];
  const nextActions = nextActionsRaw
    .filter((a) => a.code && a.label)
    .map((a) => ({ code: a.code!, label: a.label! }));

  const versions = {
    scoringVersion:
      (typeof evidence.scoringVersion === "string"
        ? evidence.scoringVersion
        : null) ??
      alignment?.scoringVersion ??
      null,
    readinessVersion:
      typeof readinessEvidence.readinessVersion === "string"
        ? readinessEvidence.readinessVersion
        : readiness
          ? "readiness.v1"
          : null,
    normalizationVersion:
      typeof evidence.normalizationVersion === "string"
        ? evidence.normalizationVersion
        : typeof readinessEvidence.normalizationVersion === "string"
          ? readinessEvidence.normalizationVersion
          : null,
    explainabilityVersion:
      typeof evidence.explainabilityVersion === "string"
        ? evidence.explainabilityVersion
        : typeof readinessEvidence.explainabilityVersion === "string"
          ? readinessEvidence.explainabilityVersion
          : null,
  };

  const readinessState =
    readiness?.readinessState === "READY" ||
    readiness?.readinessState === "READY_WITH_WARNINGS" ||
    readiness?.readinessState === "REVIEW_REQUIRED" ||
    readiness?.readinessState === "BLOCKED" ||
    readiness?.readinessState === "UNKNOWN"
      ? readiness.readinessState
      : null;

  return {
    phase,
    overallScore: alignment?.overallScore ?? null,
    readinessState: phase === "CURRENT" || phase === "STALE" ? readinessState : null,
    freshness: alignment?.freshness ?? readiness?.freshness ?? latest?.freshness ?? null,
    runStatus: alignment?.run?.status ?? readiness?.run?.status ?? latest?.status ?? null,
    counts,
    fitItems: phase === "CURRENT" || phase === "STALE" ? fitItems : [],
    blockers:
      phase === "CURRENT" || phase === "STALE"
        ? blockers.filter((b) => b.severity === "BLOCKER")
        : [],
    warnings: phase === "CURRENT" || phase === "STALE" ? warnings : [],
    unknowns: phase === "CURRENT" || phase === "STALE" ? unknowns : [],
    nextActions: phase === "CURRENT" || phase === "STALE" ? nextActions : [],
    versions,
    staffMeta:
      input.viewer === "STAFF"
        ? {
            alignmentResultId: alignment?.id ?? "",
            readinessResultId: readiness?.id ?? null,
            requirementSetId: alignment?.run?.requirementSetId ?? null,
            snapshotId: alignment?.run?.snapshotId ?? null,
            runId: alignment?.runId ?? readiness?.runId ?? latest?.id ?? null,
            analysisPurpose:
              alignment?.run?.analysisPurpose ??
              readiness?.run?.analysisPurpose ??
              latest?.analysisPurpose ??
              null,
            errorCode:
              latest?.errorCode ??
              alignment?.run?.errorCode ??
              readiness?.run?.errorCode ??
              null,
          }
        : null,
    messaging: messagingForPhase(phase),
  };
}
