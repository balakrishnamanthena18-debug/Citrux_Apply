/**
 * Report Exporters (JSON and CSV)
 *
 * Enforces:
 * - Deterministic, sanitized output (no credentials or secrets)
 * - Safe handling of empty inputs
 * - Proper CSV escaping (RFC 4180)
 * - Explicit separation of duplicate candidate evidence without master selection
 */

import type { FullAuditReport, JobAuditFinding } from "./types";

/**
 * Escapes a cell value for standard CSV formatting (RFC 4180).
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of headers and rows into CSV text.
 */
export function formatCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const rowLines = rows.map((row) => row.map(escapeCsvCell).join(","));
  return [headerLine, ...rowLines].join("\n");
}

/**
 * Exports duplicate candidates to CSV format.
 * Lists all candidate records in each group with evidence.
 * DUPLICATE_MASTER_POLICY=none: No master is designated.
 */
export function exportDuplicatesToCsv(findings: JobAuditFinding[]): string {
  const headers = [
    "duplicate_group_id",
    "is_duplicate_candidate",
    "confidence",
    "reason_code",
    "candidate_count_in_group",
    "record_id",
    "company",
    "title",
    "location",
    "ats_provider",
    "ats_requisition_id",
    "canonical_url",
    "raw_url",
    "evidence",
  ];

  // Include records that are duplicate candidates or distinct same-role clusters
  const targetFindings = findings.filter(
    (f) => f.duplicate.duplicateGroupId !== null
  );

  const rows = targetFindings.map((f) => [
    f.duplicate.duplicateGroupId,
    f.duplicate.isDuplicateCandidate ? "TRUE" : "FALSE",
    f.duplicate.confidence,
    f.duplicate.reasonCode,
    f.duplicate.candidateCountInGroup,
    f.recordId,
    f.company,
    f.title,
    f.location,
    f.ats.provider,
    f.ats.requisitionId,
    f.canonicalUrl,
    f.rawUrl,
    f.duplicate.evidence,
  ]);

  return formatCsv(headers, rows);
}

/**
 * Exports geographic discrepancies to CSV format.
 */
export function exportGeographyToCsv(findings: JobAuditFinding[]): string {
  const headers = [
    "record_id",
    "company",
    "title",
    "raw_location",
    "status",
    "detected_country",
    "raw_country_codes",
    "is_discrepancy",
    "notes",
  ];

  const targetFindings = findings.filter(
    (f) => f.geography.status !== "valid_us"
  );

  const rows = targetFindings.map((f) => [
    f.recordId,
    f.company,
    f.title,
    f.location,
    f.geography.status,
    f.geography.detectedCountry,
    f.geography.rawCountryCodes.join("; "),
    f.geography.isDiscrepancy ? "TRUE" : "FALSE",
    f.geography.notes,
  ]);

  return formatCsv(headers, rows);
}

/**
 * Exports all findings to a single comprehensive CSV.
 */
export function exportAllFindingsToCsv(findings: JobAuditFinding[]): string {
  const headers = [
    "record_id",
    "source",
    "company",
    "title",
    "location",
    "ats_provider",
    "ats_requisition_id",
    "canonical_url",
    "dup_group_id",
    "is_dup_candidate",
    "dup_confidence",
    "dup_reason",
    "geo_status",
    "geo_notes",
    "freshness_status",
    "closure_signals",
    "ai_review_status",
  ];

  const rows = findings.map((f) => [
    f.recordId,
    f.source,
    f.company,
    f.title,
    f.location,
    f.ats.provider,
    f.ats.requisitionId,
    f.canonicalUrl,
    f.duplicate.duplicateGroupId,
    f.duplicate.isDuplicateCandidate ? "TRUE" : "FALSE",
    f.duplicate.confidence,
    f.duplicate.reasonCode,
    f.geography.status,
    f.geography.notes,
    f.freshness.status,
    f.freshness.closureSignals.join("; "),
    f.aiReview.status,
  ]);

  return formatCsv(headers, rows);
}

/**
 * Exports full report as JSON string.
 */
export function exportReportToJson(report: FullAuditReport): string {
  return JSON.stringify(report, null, 2);
}
