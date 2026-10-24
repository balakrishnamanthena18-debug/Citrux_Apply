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
 * Escapes a cell value for standard CSV formatting (RFC 4180),
 * with spreadsheet formula injection protection.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  let str = String(value);

  // Neutralize spreadsheet formula injection (=, +, -, @, \t, \r)
  if (/^[\s\u0000-\u001F]*[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

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
 * Exports prioritized actionable findings to CSV format.
 * Focuses on Critical, High, and Medium severity items requiring engineering or operational action.
 */
export function exportActionableFindingsToCsv(findings: JobAuditFinding[]): string {
  const headers = [
    "finding_id",
    "record_id",
    "severity",
    "category",
    "dimension",
    "company",
    "title",
    "location",
    "ats_provider",
    "ats_requisition_id",
    "reason_flagged",
    "observed_evidence",
    "recommended_action",
    "verification_status",
    "canonical_url",
    "raw_url",
  ];

  // Filter to actionable records (Critical, High, Medium, or flagged duplicate/geo/freshness items)
  const actionable = findings.filter((f) => {
    if (f.severity === "Critical" || f.severity === "High" || f.severity === "Medium") {
      return true;
    }
    return (
      f.duplicate.isDuplicateCandidate ||
      f.geography.status !== "valid_us" ||
      f.freshness.status === "closure_detected" ||
      f.freshness.suspectedIngestionBatch
    );
  });

  const rows = actionable.map((f) => {
    const primaryEvidence = f.evidenceItems?.[0];
    const findingId = primaryEvidence?.findingId || `act-${f.recordId}`;
    const severity = f.severity || (f.duplicate.isDuplicateCandidate ? "High" : "Medium");
    const category = f.findingCategory || "confirmed_finding";
    const dimension = primaryEvidence?.dimension || "data_quality";
    const reasonFlagged = primaryEvidence?.reasonFlagged || f.duplicate.evidence || f.geography.notes || "";
    const observedEvidence = primaryEvidence?.observedEvidence || f.freshness.notes || f.geography.notes || "";
    const recommendedAction = primaryEvidence?.recommendedAction || "Review for upstream correction.";
    const verificationStatus = primaryEvidence?.verificationStatus || "confirmed";

    return [
      findingId,
      f.recordId,
      severity,
      category,
      dimension,
      f.company,
      f.title,
      f.location,
      f.ats.provider,
      f.ats.requisitionId,
      reasonFlagged,
      observedEvidence,
      recommendedAction,
      verificationStatus,
      f.canonicalUrl,
      f.rawUrl,
    ];
  });

  return formatCsv(headers, rows);
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
