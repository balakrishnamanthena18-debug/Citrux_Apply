/**
 * OOS Data Quality & Intelligence — Source and Ingestion Quality Rules
 *
 * Evaluates:
 * - Missing required fields (location, title, company, url, external_id, description).
 * - Malformed records (unparseable values, conflicting formats).
 * - Repeated batch-ingestion patterns.
 * - Source-specific reliability and defect profiles.
 */

import type {
  FreeHireRawJobRecord,
  NormalizedJobRecord,
  SourceQualityFinding,
  SourceQualityStatus,
} from "../types";

/** Known enterprise ATS providers with validated ingestion stability */
const TIER_1_SOURCES = new Set([
  "taleo",
  "ukg",
  "ukgready",
  "lever",
  "greenhouse",
  "smartrecruiters",
  "workday",
  "pinpoint",
  "paycor",
  "paycom",
  "hireology",
  "adp",
  "phenom",
]);

/**
 * Evaluates source and ingestion quality for a single record.
 */
export function evaluateSourceQuality(
  rawRecord: FreeHireRawJobRecord,
  normalizedRecord: NormalizedJobRecord
): SourceQualityFinding {
  const missingFields: string[] = [];
  const malformedFields: string[] = [];

  // 1. Missing Core Fields Check
  if (!rawRecord.title || !rawRecord.title.trim()) {
    missingFields.push("title");
  }
  if (!rawRecord.company || !rawRecord.company.trim()) {
    missingFields.push("company");
  }
  if (!rawRecord.url || !rawRecord.url.trim()) {
    missingFields.push("url");
  }
  if (!rawRecord.external_id || !rawRecord.external_id.trim()) {
    missingFields.push("external_id");
  }
  if (
    !rawRecord.location ||
    !rawRecord.location.trim() ||
    rawRecord.location.trim().toLowerCase() === "null"
  ) {
    missingFields.push("location");
  }
  if (!rawRecord.description || !rawRecord.description.trim()) {
    missingFields.push("description");
  }

  // 2. Malformed Values Check
  if (rawRecord.url) {
    try {
      new URL(rawRecord.url);
    } catch {
      malformedFields.push("url_syntax");
    }
  }

  if (rawRecord.posted_at) {
    const d = Date.parse(rawRecord.posted_at);
    if (isNaN(d)) {
      malformedFields.push("posted_at_invalid_date");
    }
  }

  // 3. Batch Ingestion Pattern Check
  const hasBatchTimestamps =
    Boolean(rawRecord.posted_at && rawRecord.created_at && rawRecord.updated_at) &&
    rawRecord.posted_at === rawRecord.created_at &&
    rawRecord.created_at === rawRecord.updated_at;

  // 4. Source Reliability Assessment
  const sourceName = (rawRecord.source || normalizedRecord.source || "unknown").toLowerCase().trim();
  let sourceReliability: "high" | "moderate" | "low" = "moderate";
  if (TIER_1_SOURCES.has(sourceName)) {
    sourceReliability = missingFields.length === 0 ? "high" : "moderate";
  } else if (!sourceName || sourceName === "unknown") {
    sourceReliability = "low";
  }

  // 5. Determine Overall Status & Detailed Notes
  let status: SourceQualityStatus = "healthy";
  const notesList: string[] = [];

  if (malformedFields.length > 0) {
    status = "malformed_record";
    notesList.push(`Malformed fields detected: ${malformedFields.join(", ")}.`);
  } else if (missingFields.length > 0) {
    status = "missing_required_fields";
    notesList.push(`Missing core fields: ${missingFields.join(", ")}.`);
  } else if (hasBatchTimestamps) {
    status = "anomalous_ingestion";
    notesList.push(
      "Identical batch-ingestion timestamps detected (posted_at == created_at == updated_at). Ingestion pipeline timestamp rather than employer posting date."
    );
  } else {
    notesList.push("All core schema fields present with valid syntax.");
  }

  return {
    status,
    source: sourceName,
    missingFields,
    malformedFields,
    sourceReliability,
    notes: notesList.join(" "),
  };
}
