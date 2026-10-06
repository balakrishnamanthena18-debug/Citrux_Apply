import {
  humanResumeStatusMessage,
  type ResumeHumanStatus,
} from "./constants";

export type ResumeReviewPresentation = {
  status: ResumeHumanStatus;
  statusMessage: string;
  overallLabel: string | null;
  overallSummary: string | null;
  ats: {
    label: string | null;
    summary: string | null;
    findings: Array<{ code: string; severity: string; message: string }>;
  };
  strengths: Array<{ label: string; message: string }>;
  recommendations: Array<{
    code: string;
    category: string;
    title: string;
    message: string;
  }>;
  documentTitle: string | null;
  reviewedAt: string | null;
};

/**
 * Maps persisted ResumeReview rows to candidate-safe presentation.
 * Never includes extractedText or internal version hashes.
 */
export function presentResumeReview(input: {
  review: {
    status: string;
    freshness: string;
    overallLabel: string | null;
    overallSummary: string | null;
    atsReadability: unknown;
    strengths: unknown;
    recommendations: unknown;
    completedAt: Date | null;
    candidateDocument?: { title?: string | null } | null;
  } | null;
}): ResumeReviewPresentation {
  if (!input.review) {
    return {
      status: "NOT_STARTED",
      statusMessage: humanResumeStatusMessage("NOT_STARTED"),
      overallLabel: null,
      overallSummary: null,
      ats: { label: null, summary: null, findings: [] },
      strengths: [],
      recommendations: [],
      documentTitle: null,
      reviewedAt: null,
    };
  }

  const r = input.review;
  let status: ResumeHumanStatus = "QUEUED";
  if (r.status === "ANALYZING") status = "ANALYZING";
  else if (r.status === "FAILED") status = "FAILED";
  else if (r.status === "STALE" || r.freshness === "STALE") status = "STALE";
  else if (r.status === "READY") status = "READY";
  else if (r.status === "QUEUED") status = "QUEUED";

  const atsRaw =
    r.atsReadability && typeof r.atsReadability === "object"
      ? (r.atsReadability as Record<string, unknown>)
      : {};
  const findings = Array.isArray(atsRaw.findings)
    ? (atsRaw.findings as Array<{ code: string; severity: string; message: string }>)
        .filter((f) => f && typeof f.message === "string")
        .map((f) => ({
          code: String(f.code || ""),
          severity: String(f.severity || "info"),
          message: String(f.message),
        }))
    : [];

  const strengths = Array.isArray(r.strengths)
    ? (r.strengths as Array<{ label?: string; message?: string }>)
        .filter((s) => s && s.message)
        .map((s) => ({
          label: String(s.label || "Strength"),
          message: String(s.message),
        }))
    : [];

  const recommendations = Array.isArray(r.recommendations)
    ? (r.recommendations as Array<{
        code?: string;
        category?: string;
        title?: string;
        message?: string;
      }>)
        .filter((rec) => rec && rec.message)
        .map((rec) => ({
          code: String(rec.code || ""),
          category: String(rec.category || "OPTIONAL_IMPROVEMENT"),
          title: String(rec.title || "Suggestion"),
          message: String(rec.message),
        }))
    : [];

  return {
    status,
    statusMessage: humanResumeStatusMessage(status),
    overallLabel: r.overallLabel,
    overallSummary: r.overallSummary,
    ats: {
      label: typeof atsRaw.label === "string" ? atsRaw.label : null,
      summary: typeof atsRaw.summary === "string" ? atsRaw.summary : null,
      findings,
    },
    strengths,
    recommendations,
    documentTitle: input.review.candidateDocument?.title ?? null,
    reviewedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}
