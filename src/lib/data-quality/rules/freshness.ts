/**
 * Freshness and Source Signal Rules
 *
 * Rules:
 * - Treat ingestion/update timestamps as evidence, not proof of employer's original posting date.
 * - An HTTP 200 response is not proof that a vacancy remains active.
 * - Explicit closure language may be reported as a closure signal.
 * - Inaccessible, timed-out, or inconclusive pages must remain unknown rather than marked closed.
 */

import type { FreshnessFinding, NormalizedJobRecord } from "../types";

/** Known explicit closure phrases that signal a vacancy has ended. */
export const KNOWN_CLOSURE_PHRASES = [
  "job is no longer available",
  "position has been filled",
  "job posting has expired",
  "position is no longer available",
  "requisition is no longer available",
  "this position has been closed",
  "no longer accepting applications",
  "this job posting is closed",
  "application window has closed",
  "this job has expired",
];

/**
 * Evaluates freshness signals from timestamps and observed content.
 *
 * @param record The normalized job record
 * @param observedPageText Optional text fetched from the live URL during an audit check
 * @param httpStatus Optional HTTP status code if a live check was performed
 */
export function evaluateFreshness(
  record: NormalizedJobRecord,
  observedPageText?: string | null,
  httpStatus?: number | null
): FreshnessFinding {
  const closureSignals: string[] = [];

  // 1. Evaluate text content (from description snippet or observed live page)
  const textToScan = [
    record.descriptionSnippet,
    observedPageText || "",
  ]
    .join(" ")
    .toLowerCase();

  for (const phrase of KNOWN_CLOSURE_PHRASES) {
    if (textToScan.includes(phrase)) {
      closureSignals.push(phrase);
    }
  }

  // 2. Ingestion Batch Timestamp Detection
  // If posted_at == created_at == updated_at, it is an ingestion batch timestamp, not verified employer original posting date.
  const isIngestionBatch =
    Boolean(record.postedAt && record.createdAt && record.updatedAt) &&
    record.postedAt === record.createdAt &&
    record.createdAt === record.updatedAt;

  // 3. Closure signals take precedence if explicitly detected
  if (closureSignals.length > 0) {
    return {
      status: "closure_detected",
      closureSignals,
      suspectedIngestionBatch: isIngestionBatch,
      postedAt: record.postedAt,
      updatedAt: record.updatedAt,
      ageDays: record.rawRealityAgeDays,
      notes: `Explicit closure language detected: "${closureSignals.join(
        '", "'
      )}". HTTP status ${httpStatus ?? "untested"} does not negate closure.`,
    };
  }

  // 4. HTTP and connectivity evaluation
  // If HTTP status is provided:
  if (httpStatus !== undefined && httpStatus !== null) {
    // If HTTP was 200, but no closure phrase was found, the status is STILL "unknown" regarding real-world vacancy truth
    // because HTTP 200 simply means the web server served a page.
    if (httpStatus === 200) {
      return {
        status: "active_signal",
        closureSignals: [],
        suspectedIngestionBatch: isIngestionBatch,
        postedAt: record.postedAt,
        updatedAt: record.updatedAt,
        ageDays: record.rawRealityAgeDays,
        notes: isIngestionBatch
          ? "HTTP 200 observed with reachable endpoint. Provider timestamp matches batch ingestion time (not employer posting date)."
          : "HTTP 200 observed with reachable endpoint. Vacancy appears live on provider.",
      };
    }

    if (httpStatus >= 400) {
      return {
        status: "unknown",
        closureSignals: [],
        suspectedIngestionBatch: isIngestionBatch,
        postedAt: record.postedAt,
        updatedAt: record.updatedAt,
        ageDays: record.rawRealityAgeDays,
        notes: `HTTP error status ${httpStatus}. Inaccessible or inconclusive page classified as unknown (not assumed closed without explicit signal).`,
      };
    }
  }

  // 5. Offline timestamp evaluation (default when no live page check is performed)
  if (isIngestionBatch) {
    return {
      status: "unknown",
      closureSignals: [],
      suspectedIngestionBatch: true,
      postedAt: record.postedAt,
      updatedAt: record.updatedAt,
      ageDays: record.rawRealityAgeDays,
      notes: "Provider timestamps (posted_at, created_at, updated_at) are identical batch ingestion timestamps. True employer vacancy age is unverified.",
    };
  }

  return {
    status: "unknown",
    closureSignals: [],
    suspectedIngestionBatch: false,
    postedAt: record.postedAt,
    updatedAt: record.updatedAt,
    ageDays: record.rawRealityAgeDays,
    notes: "No live network check performed (AI_MODE=offline). Employer vacancy status remains unverified.",
  };
}
