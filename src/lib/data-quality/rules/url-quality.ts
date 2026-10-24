/**
 * OOS Data Quality & Intelligence — Application URL Quality Rules
 *
 * Rules:
 * - Validate URL syntax (RFC 3986, valid protocol).
 * - Distinguish untested, reachable (HTTP 200), redirected, unavailable (4xx/5xx), blocked, or connection_error.
 * - Record live HTTP outcomes and check timestamps when available.
 * - Never claim a URL was tested if no request occurred.
 */

import type {
  LiveUrlCheckResult,
  NormalizedJobRecord,
  UrlLiveCheckStatus,
  UrlQualityFinding,
} from "../types";

/**
 * Validates the syntax of an application URL.
 */
export function validateUrlSyntax(rawUrl: string): {
  isValid: boolean;
  parsed: URL | null;
  errorReason: string | null;
} {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    return {
      isValid: false,
      parsed: null,
      errorReason: "Missing URL: string is empty or whitespace.",
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        isValid: false,
        parsed: null,
        errorReason: `Unsupported protocol "${parsed.protocol}". Expected http: or https:.`,
      };
    }
    return { isValid: true, parsed, errorReason: null };
  } catch (err) {
    return {
      isValid: false,
      parsed: null,
      errorReason: `Malformed URL syntax: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Evaluates application URL quality for a record, incorporating optional live check evidence.
 *
 * @param record The normalized job record
 * @param liveResult Optional live check result if live checks were executed/supplied
 */
export function evaluateUrlQuality(
  record: NormalizedJobRecord,
  liveResult?: LiveUrlCheckResult | null
): UrlQualityFinding {
  const { isValid, errorReason } = validateUrlSyntax(record.rawUrl);

  if (!record.rawUrl || !record.rawUrl.trim()) {
    return {
      status: "missing_url",
      syntaxValid: false,
      liveCheckStatus: "untested",
      httpStatus: null,
      titleMatchScore: null,
      closureSignals: [],
      checkedAt: null,
      notes: "Application URL is missing or blank.",
    };
  }

  if (!isValid) {
    return {
      status: "malformed_syntax",
      syntaxValid: false,
      liveCheckStatus: "untested",
      httpStatus: null,
      titleMatchScore: null,
      closureSignals: [],
      checkedAt: null,
      notes: errorReason || "Application URL failed syntax validation.",
    };
  }

  // If no live check was performed for this URL, it MUST remain 'untested'.
  if (!liveResult) {
    return {
      status: "valid_syntax",
      syntaxValid: true,
      liveCheckStatus: "untested",
      httpStatus: null,
      titleMatchScore: null,
      closureSignals: [],
      checkedAt: null,
      notes: "URL syntax is valid. No live network check performed (untested).",
    };
  }

  // Live result was supplied: evaluate outcome
  let liveCheckStatus: UrlLiveCheckStatus = "untested";
  const closureSignals = liveResult.closure || [];
  const httpStatus = liveResult.http ?? null;
  const titleMatchScore = liveResult.title_match ?? null;
  const checkedAt = liveResult.checked_at ?? null;
  const notesList: string[] = [];

  if (liveResult.error) {
    if (
      liveResult.error.toLowerCase().includes("timeout") ||
      liveResult.error.toLowerCase().includes("connect")
    ) {
      liveCheckStatus = "connection_error";
      notesList.push(`Network connection error: ${liveResult.error}`);
    } else if (
      liveResult.error.includes("403") ||
      liveResult.error.toLowerCase().includes("block") ||
      liveResult.error.toLowerCase().includes("cloudflare")
    ) {
      liveCheckStatus = "blocked";
      notesList.push(`Access blocked: ${liveResult.error}`);
    } else {
      liveCheckStatus = "unavailable";
      notesList.push(`Request failed: ${liveResult.error}`);
    }
  } else if (httpStatus !== null) {
    if (httpStatus >= 200 && httpStatus < 300) {
      liveCheckStatus = "reachable";
      notesList.push(`HTTP ${httpStatus} response received.`);
      if (closureSignals.length > 0) {
        notesList.push(
          `Reachable endpoint displays explicit closure text: "${closureSignals.join('", "')}".`
        );
      }
      if (titleMatchScore !== null) {
        notesList.push(
          `Page title match score: ${(titleMatchScore * 100).toFixed(0)}%.`
        );
      }
    } else if (httpStatus >= 300 && httpStatus < 400) {
      liveCheckStatus = "redirected";
      notesList.push(`HTTP redirect status ${httpStatus}.`);
    } else if (httpStatus === 403 || httpStatus === 429) {
      liveCheckStatus = "blocked";
      notesList.push(`HTTP access restricted status ${httpStatus}.`);
    } else if (httpStatus >= 400) {
      liveCheckStatus = "unavailable";
      notesList.push(`HTTP error response status ${httpStatus}.`);
    }
  }

  return {
    status: "valid_syntax",
    syntaxValid: true,
    liveCheckStatus,
    httpStatus,
    titleMatchScore,
    closureSignals,
    checkedAt,
    notes: notesList.join(" ") || "Live check recorded without notes.",
  };
}
