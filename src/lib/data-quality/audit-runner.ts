/**
 * OOS Data Quality & Intelligence — Local Audit Runner
 *
 * Orchestrates deterministic audit of job records in memory.
 * Read-only execution with strictly offline AI and DUPLICATE_MASTER_POLICY=none.
 */

import { evaluateAiReviewOffline } from "./intelligence/offline-reviewer";
import { normalizeRecord } from "./normalizer";
import { detectDuplicates } from "./rules/duplicates";
import { evaluateFreshness } from "./rules/freshness";
import { validateGeography } from "./rules/geography";
import type {
  AuditSummary,
  FreeHireRawJobRecord,
  FullAuditReport,
  JobAuditFinding,
} from "./types";

export interface RunAuditOptions {
  datasetName?: string;
  auditTimestamp?: string;
}

/**
 * Runs a complete deterministic data quality audit over the provided raw job records.
 */
export function runJobInventoryAudit(
  rawRecords: FreeHireRawJobRecord[],
  options?: RunAuditOptions
): FullAuditReport {
  const datasetName = options?.datasetName || "FreeHire US Job Inventory";
  const auditTimestamp = options?.auditTimestamp || new Date().toISOString();

  // 1. Normalization
  const normalizedRecords = rawRecords.map((raw, idx) =>
    normalizeRecord(raw, idx)
  );

  // 2. Duplicate detection
  const duplicateFindings = detectDuplicates(normalizedRecords);

  // 3. Evaluate each record across quality dimensions
  const findings: JobAuditFinding[] = [];

  let validUsCount = 0;
  let explicitForeignCount = 0;
  let metadataDiscrepancyCount = 0;
  let missingLocationCount = 0;
  let ambiguousGeoCount = 0;

  let closureDetectedCount = 0;
  let ingestionBatchCount = 0;
  let unknownVacancyCount = 0;

  let recordsNeedingReviewCount = 0;

  const duplicateGroupsSeen = new Set<string>();
  const exactUrlGroupsSeen = new Set<string>();
  const distinctSameRoleGroupsSeen = new Set<string>();
  let duplicateCandidateRecordsCount = 0;

  for (const rec of normalizedRecords) {
    const dup = duplicateFindings.get(rec.recordId)!;
    const geo = validateGeography(rec);
    const fresh = evaluateFreshness(rec);
    const ai = evaluateAiReviewOffline(rec, dup, geo);

    // Track duplicate metrics
    if (dup.isDuplicateCandidate && dup.duplicateGroupId) {
      duplicateCandidateRecordsCount++;
      duplicateGroupsSeen.add(dup.duplicateGroupId);
      if (dup.reasonCode === "EXACT_ATS_CANONICAL_URL") {
        exactUrlGroupsSeen.add(dup.duplicateGroupId);
      }
    }

    if (dup.reasonCode === "SIMILAR_ROLE_DISTINCT_REQUISITION" && dup.duplicateGroupId) {
      distinctSameRoleGroupsSeen.add(dup.duplicateGroupId);
    }

    // Track geography metrics
    switch (geo.status) {
      case "valid_us":
        validUsCount++;
        break;
      case "explicit_foreign":
        explicitForeignCount++;
        break;
      case "metadata_discrepancy":
        metadataDiscrepancyCount++;
        break;
      case "missing_location":
        missingLocationCount++;
        break;
      case "ambiguous":
        ambiguousGeoCount++;
        break;
    }

    // Track freshness metrics
    if (fresh.status === "closure_detected") {
      closureDetectedCount++;
    } else if (fresh.status === "unknown") {
      unknownVacancyCount++;
    }

    if (fresh.suspectedIngestionBatch) {
      ingestionBatchCount++;
    }

    // Track AI / Review metrics
    if (ai.status === "needs_review") {
      recordsNeedingReviewCount++;
    }

    findings.push({
      recordId: rec.recordId,
      publicSlug: rec.publicSlug,
      externalId: rec.externalId,
      source: rec.source,
      company: rec.rawCompany,
      title: rec.rawTitle,
      location: rec.rawLocation,
      rawUrl: rec.rawUrl,
      canonicalUrl: rec.canonicalUrl,
      ats: rec.ats,
      duplicate: dup,
      geography: geo,
      freshness: fresh,
      aiReview: ai,
    });
  }

  const summary: AuditSummary = {
    auditTimestamp,
    datasetName,
    totalRecordsAudited: rawRecords.length,
    aiMode: "offline",
    duplicatePolicy: "none",
    duplicates: {
      totalDuplicateCandidateRecords: duplicateCandidateRecordsCount,
      totalDuplicateCandidateGroups: duplicateGroupsSeen.size,
      exactAtsUrlGroups: exactUrlGroupsSeen.size,
      distinctSameRoleGroups: distinctSameRoleGroupsSeen.size,
    },
    geography: {
      validUs: validUsCount,
      explicitForeign: explicitForeignCount,
      metadataDiscrepancy: metadataDiscrepancyCount,
      missingLocation: missingLocationCount,
      ambiguous: ambiguousGeoCount,
    },
    freshness: {
      closureDetected: closureDetectedCount,
      suspectedIngestionBatchTimestamps: ingestionBatchCount,
      unknownVacancyStatus: unknownVacancyCount,
    },
    aiReview: {
      offlineInvocations: 0,
      networkCallsBlocked: 0,
      recordsNeedingHumanReview: recordsNeedingReviewCount,
    },
  };

  return {
    summary,
    findings,
  };
}
