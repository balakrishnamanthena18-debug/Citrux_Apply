/**
 * OOS Data Quality & Intelligence — Evidence & Severity Classifier
 *
 * Implements deterministic evidence synthesis and severity assignment:
 * - Severity levels: Critical, High, Medium, Low, Informational.
 * - Evidence taxonomy:
 *   1. Confirmed findings (deterministic proof)
 *   2. Suspected anomalies (statistical/pattern evidence requiring human review)
 *   3. Recommendations (actionable engineering or operations steps)
 *   4. Limitations (documented boundaries and unverified assumptions)
 */

import type {
  DuplicateCandidateFinding,
  FindingCategory,
  FindingEvidenceItem,
  FindingSeverity,
  FreshnessFinding,
  GeographyFinding,
  NormalizedJobRecord,
  SourceQualityFinding,
  UrlQualityFinding,
} from "./types";

function deterministicId(prefix: string, seed: string): string {
  let hash1 = 5381;
  let hash2 = 52711;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash1 = (hash1 * 33) ^ char;
    hash2 = (hash2 * 33) ^ char;
  }
  const part1 = (hash1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (hash2 >>> 0).toString(16).padStart(8, "0");
  return `${prefix}-${part1}${part2}`;
}

export interface ClassificationResult {
  severity: FindingSeverity;
  category: FindingCategory;
  evidenceItems: FindingEvidenceItem[];
  unsupportedFieldsPresent: string[];
}

/** Known fields that are recognized by the core audit engine */
const RECOGNIZED_CORE_FIELDS = new Set([
  "public_slug",
  "source",
  "external_id",
  "url",
  "title",
  "company",
  "company_slug",
  "location",
  "description",
  "countries",
  "posted_at",
  "created_at",
  "updated_at",
  "last_seen_at",
  "closed_at",
]);

/**
 * Classifies a job record across all quality dimensions, producing structured evidence and severity.
 */
export function classifyRecordEvidence(
  record: NormalizedJobRecord,
  duplicateFinding: DuplicateCandidateFinding,
  geographyFinding: GeographyFinding,
  freshnessFinding: FreshnessFinding,
  sourceFinding: SourceQualityFinding,
  urlFinding: UrlQualityFinding,
  rawJobRecord: Record<string, unknown>
): ClassificationResult {
  const evidenceItems: FindingEvidenceItem[] = [];

  // Identify unsupported / unfamiliar fields
  const unsupportedFieldsPresent: string[] = [];
  for (const key of Object.keys(rawJobRecord)) {
    if (!RECOGNIZED_CORE_FIELDS.has(key)) {
      unsupportedFieldsPresent.push(key);
    }
  }

  // --- Dimension A: Duplicate Detection ---
  if (duplicateFinding.isDuplicateCandidate) {
    const isExactUrl = duplicateFinding.reasonCode === "EXACT_ATS_CANONICAL_URL";
    evidenceItems.push({
      findingId: deterministicId("ev-dup", `${record.recordId}-${duplicateFinding.duplicateGroupId}`),
      dimension: "duplicate_detection",
      severity: "High",
      category: "confirmed_finding",
      confidence: duplicateFinding.confidence,
      affectedRecordIds: duplicateFinding.candidateIdsInGroup,
      observedEvidence: duplicateFinding.evidence,
      reasonFlagged: isExactUrl
        ? "Identical canonical ATS destination URL detected across multiple inventory records."
        : "Matching ATS provider and requisition ID detected across syndication domains.",
      recommendedAction:
        "Preserve candidate records without deletion (DUPLICATE_MASTER_POLICY=none); flag redundant tracking URLs for upstream feed suppression.",
      verificationStatus: "confirmed",
    });
  } else if (duplicateFinding.reasonCode === "SIMILAR_ROLE_DISTINCT_REQUISITION") {
    evidenceItems.push({
      findingId: deterministicId("ev-role", `${record.recordId}-${duplicateFinding.duplicateGroupId}`),
      dimension: "duplicate_detection",
      severity: "Informational",
      category: "confirmed_finding",
      confidence: "distinct",
      affectedRecordIds: duplicateFinding.candidateIdsInGroup,
      observedEvidence: duplicateFinding.evidence,
      reasonFlagged:
        "Matching employer and title but distinct ATS requisition identifiers. Verified distinct headcount vacancies.",
      recommendedAction:
        "Do NOT merge or deduplicate. Treat each distinct requisition as an independent employer opening.",
      verificationStatus: "confirmed",
    });
  }

  // --- Dimension B: Geographic Quality ---
  if (geographyFinding.status === "explicit_foreign") {
    evidenceItems.push({
      findingId: deterministicId("ev-geo", `${record.recordId}-foreign`),
      dimension: "geographic_quality",
      severity: "Critical",
      category: "confirmed_finding",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: `Explicit foreign municipality/country detected: ${geographyFinding.notes}`,
      reasonFlagged: "Job advertised in US inventory feed is physically located in a foreign country.",
      recommendedAction:
        "Reroute posting to relevant country inventory (e.g. Canada) and exclude from US candidate job recommendations.",
      verificationStatus: "confirmed",
    });
  } else if (geographyFinding.status === "metadata_discrepancy") {
    evidenceItems.push({
      findingId: deterministicId("ev-geo", `${record.recordId}-discrepancy`),
      dimension: "geographic_quality",
      severity: "High",
      category: "confirmed_finding",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: geographyFinding.notes,
      reasonFlagged:
        "Upstream scraper country metadata collides with US state postal code (e.g. IN=Indiana vs India, MN=Minnesota vs Mongolia).",
      recommendedAction:
        "Remap location metadata based on verified US state abbreviations; patch upstream scraper ISO country assignment.",
      verificationStatus: "confirmed",
    });
  } else if (geographyFinding.status === "missing_location") {
    evidenceItems.push({
      findingId: deterministicId("ev-geo", `${record.recordId}-missing-loc`),
      dimension: "geographic_quality",
      severity: "Critical",
      category: "confirmed_finding",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: "Location field is null, empty string, or whitespace.",
      reasonFlagged: "Job record is missing physical or remote geographic location.",
      recommendedAction:
        "Quarantine record from domestic applicant matching until employer location can be backfilled from description.",
      verificationStatus: "confirmed",
    });
  }

  // --- Dimension C: Freshness & Vacancy Status ---
  if (freshnessFinding.status === "closure_detected") {
    evidenceItems.push({
      findingId: deterministicId("ev-fresh", `${record.recordId}-closed`),
      dimension: "freshness_and_vacancy",
      severity: "Critical",
      category: "confirmed_finding",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: freshnessFinding.notes,
      reasonFlagged: "Explicit vacancy closure phrases detected in job posting content or live check response.",
      recommendedAction:
        "Expire job posting immediately from active search results; mark status as closed.",
      verificationStatus: "confirmed",
    });
  } else if (freshnessFinding.suspectedIngestionBatch) {
    evidenceItems.push({
      findingId: deterministicId("ev-fresh", `${record.recordId}-batch`),
      dimension: "freshness_and_vacancy",
      severity: "Medium",
      category: "suspected_anomaly",
      confidence: "medium",
      affectedRecordIds: [record.recordId],
      observedEvidence: freshnessFinding.notes,
      reasonFlagged:
        "Provider timestamps (posted_at == created_at == updated_at) reflect crawler batch ingestion time rather than verified employer creation date.",
      recommendedAction:
        "Label timestamp provenance as feed_ingestion rather than original_employer_post_date. Avoid sorting solely by posted_at.",
      verificationStatus: "unverified",
    });
  }

  // --- Dimension D: Source and Ingestion Quality ---
  if (sourceFinding.status === "missing_required_fields") {
    evidenceItems.push({
      findingId: deterministicId("ev-src", `${record.recordId}-missing`),
      dimension: "source_and_ingestion_quality",
      severity: "Medium",
      category: "confirmed_finding",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: sourceFinding.notes,
      reasonFlagged: `Missing core schema fields: ${sourceFinding.missingFields.join(", ")}.`,
      recommendedAction:
        "Enforce ingestion schema contract requiring mandatory title, company, URL, and location.",
      verificationStatus: "confirmed",
    });
  }

  // --- Dimension E: Application URL Quality ---
  if (urlFinding.status === "missing_url" || !urlFinding.syntaxValid) {
    evidenceItems.push({
      findingId: deterministicId("ev-url", `${record.recordId}-invalid`),
      dimension: "application_url_quality",
      severity: "Critical",
      category: "confirmed_finding",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: urlFinding.notes,
      reasonFlagged: "Application URL is missing or has malformed syntax.",
      recommendedAction: "Purge or suppress record; candidates cannot apply without valid destination URL.",
      verificationStatus: "confirmed",
    });
  } else if (urlFinding.liveCheckStatus === "reachable" && urlFinding.closureSignals.length > 0) {
    // Already flagged under freshness, add URL specific recommendation
    evidenceItems.push({
      findingId: deterministicId("ev-url", `${record.recordId}-live-closed`),
      dimension: "application_url_quality",
      severity: "Critical",
      category: "confirmed_finding",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: `HTTP ${urlFinding.httpStatus} reached but page contained closure text: "${urlFinding.closureSignals.join(', ')}".`,
      reasonFlagged: "Reachable endpoint confirmed closed vacancy.",
      recommendedAction: "Deactivate posting immediately.",
      verificationStatus: "confirmed",
    });
  } else if (urlFinding.liveCheckStatus === "unavailable" || urlFinding.liveCheckStatus === "connection_error") {
    evidenceItems.push({
      findingId: deterministicId("ev-url", `${record.recordId}-unavail`),
      dimension: "application_url_quality",
      severity: "High",
      category: "confirmed_finding",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: urlFinding.notes,
      reasonFlagged: "Live request to application URL resulted in HTTP failure or connection timeout.",
      recommendedAction: "Verify ATS endpoint availability; flag for employer link renewal.",
      verificationStatus: "confirmed",
    });
  } else if (urlFinding.liveCheckStatus === "untested") {
    // Informational limitation item
    evidenceItems.push({
      findingId: deterministicId("ev-url", `${record.recordId}-untested`),
      dimension: "application_url_quality",
      severity: "Low",
      category: "limitation",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: "URL syntax validated; live HTTP check was not requested or enabled.",
      reasonFlagged: "URL reachability remains unverified live.",
      recommendedAction: "Enable targeted rate-limited live checks if active vacancy verification is required.",
      verificationStatus: "unverified",
    });
  }

  // --- Dimension F: Unsupported Fields ---
  if (unsupportedFieldsPresent.length > 0) {
    evidenceItems.push({
      findingId: deterministicId("ev-extra", `${record.recordId}-unsupported`),
      dimension: "unsupported_fields",
      severity: "Informational",
      category: "limitation",
      confidence: "high",
      affectedRecordIds: [record.recordId],
      observedEvidence: `Documented ${unsupportedFieldsPresent.length} additional fields present in raw input: ${unsupportedFieldsPresent.slice(0, 5).join(", ")}${unsupportedFieldsPresent.length > 5 ? ` (+${unsupportedFieldsPresent.length - 5} more)` : ""}.`,
      reasonFlagged: "Input payload contains extension fields not directly evaluated by core quality rules.",
      recommendedAction: "Preserve raw attributes in JSON exports for future audit rule development.",
      verificationStatus: "unverified",
    });
  }

  // Calculate Overall Record Severity: highest severity among evidence items
  let overallSeverity: FindingSeverity = "Informational";
  const severityRank: Record<FindingSeverity, number> = {
    Critical: 5,
    High: 4,
    Medium: 3,
    Low: 2,
    Informational: 1,
  };

  for (const item of evidenceItems) {
    if (severityRank[item.severity] > severityRank[overallSeverity]) {
      overallSeverity = item.severity;
    }
  }

  // Calculate Overall Record Category
  let overallCategory: FindingCategory = "limitation";
  if (evidenceItems.some((i) => i.category === "confirmed_finding")) {
    overallCategory = "confirmed_finding";
  } else if (evidenceItems.some((i) => i.category === "suspected_anomaly")) {
    overallCategory = "suspected_anomaly";
  } else if (evidenceItems.some((i) => i.category === "recommendation")) {
    overallCategory = "recommendation";
  }

  return {
    severity: overallSeverity,
    category: overallCategory,
    evidenceItems,
    unsupportedFieldsPresent,
  };
}
