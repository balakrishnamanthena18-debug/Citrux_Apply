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
import { evaluateSourceQuality } from "./rules/source-quality";
import { evaluateUrlQuality } from "./rules/url-quality";
import { classifyRecordEvidence } from "./evidence-classifier";
import type {
  AuditSummary,
  FindingCategory,
  FindingSeverity,
  FreeHireRawJobRecord,
  FullAuditReport,
  JobAuditFinding,
  LiveUrlCheckResult,
} from "./types";

export interface RunAuditOptions {
  datasetName?: string;
  auditTimestamp?: string;
  liveResults?: LiveUrlCheckResult[] | Map<string, LiveUrlCheckResult>;
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

  // Index live check results by URL if supplied
  const liveResultsMap = new Map<string, LiveUrlCheckResult>();
  if (options?.liveResults) {
    if (options.liveResults instanceof Map) {
      options.liveResults.forEach((val, key) => {
        liveResultsMap.set(key.trim(), val);
      });
    } else if (Array.isArray(options.liveResults)) {
      for (const res of options.liveResults) {
        if (res.url) {
          liveResultsMap.set(res.url.trim(), res);
        }
      }
    }
  }

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

  // Extended metric counters
  const severityCounts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };

  const categoryCounts: {
    confirmedFindings: number;
    suspectedAnomalies: number;
    recommendations: number;
    limitations: number;
  } = {
    confirmedFindings: 0,
    suspectedAnomalies: 0,
    recommendations: 0,
    limitations: 0,
  };

  const sourceBreakdown: Record<string, number> = {};
  let sourceHealthyCount = 0;
  let sourceMissingFieldsCount = 0;
  let sourceMalformedCount = 0;
  let sourceAnomalousCount = 0;

  let urlValidSyntaxCount = 0;
  let urlMalformedSyntaxCount = 0;
  let urlMissingCount = 0;
  let urlLiveTestedCount = 0;
  let urlReachableCount = 0;
  let urlClosureCount = 0;
  let urlUnavailableCount = 0;
  let urlConnectionErrorCount = 0;
  let urlUntestedCount = 0;

  const allUnsupportedFields = new Set<string>();

  for (let idx = 0; idx < normalizedRecords.length; idx++) {
    const rec = normalizedRecords[idx]!;
    const rawRec = rawRecords[idx] || ({} as FreeHireRawJobRecord);

    const dup = duplicateFindings.get(rec.recordId)!;
    const geo = validateGeography(rec);

    // Look up live check for freshness and URL quality
    const liveCheck = liveResultsMap.get(rec.rawUrl.trim()) || liveResultsMap.get(rec.canonicalUrl.trim()) || null;
    const fresh = evaluateFreshness(
      rec,
      null,
      liveCheck ? liveCheck.http ?? null : null
    );

    // If live check detected closure text, override freshness to closure_detected
    if (liveCheck && liveCheck.closure && liveCheck.closure.length > 0) {
      fresh.status = "closure_detected";
      fresh.closureSignals = [...new Set([...fresh.closureSignals, ...liveCheck.closure])];
      fresh.notes = `Explicit closure language detected during live audit: "${fresh.closureSignals.join(
        '", "'
      )}". HTTP status ${liveCheck.http ?? "unknown"}.`;
    }

    const srcQuality = evaluateSourceQuality(rawRec, rec);
    const urlQuality = evaluateUrlQuality(rec, liveCheck);
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

    // Track source quality metrics
    const srcName = srcQuality.source || "unknown";
    sourceBreakdown[srcName] = (sourceBreakdown[srcName] || 0) + 1;
    if (srcQuality.status === "healthy") sourceHealthyCount++;
    if (srcQuality.status === "missing_required_fields") sourceMissingFieldsCount++;
    if (srcQuality.status === "malformed_record") sourceMalformedCount++;
    if (srcQuality.status === "anomalous_ingestion") sourceAnomalousCount++;

    // Track URL quality metrics
    if (urlQuality.status === "valid_syntax") urlValidSyntaxCount++;
    if (urlQuality.status === "malformed_syntax") urlMalformedSyntaxCount++;
    if (urlQuality.status === "missing_url") urlMissingCount++;

    if (urlQuality.liveCheckStatus === "untested") {
      urlUntestedCount++;
    } else {
      urlLiveTestedCount++;
      if (urlQuality.liveCheckStatus === "reachable") urlReachableCount++;
      if (urlQuality.closureSignals.length > 0) urlClosureCount++;
      if (urlQuality.liveCheckStatus === "unavailable" || urlQuality.liveCheckStatus === "blocked") {
        urlUnavailableCount++;
      }
      if (urlQuality.liveCheckStatus === "connection_error") urlConnectionErrorCount++;
    }

    // Synthesize structured evidence and severity
    const evidenceResult = classifyRecordEvidence(
      rec,
      dup,
      geo,
      fresh,
      srcQuality,
      urlQuality,
      rawRec as Record<string, unknown>
    );

    // Track severity counts
    const sevKey = evidenceResult.severity.toLowerCase();
    severityCounts[sevKey] = (severityCounts[sevKey] || 0) + 1;

    // Track category counts
    if (evidenceResult.category === "confirmed_finding") categoryCounts.confirmedFindings++;
    else if (evidenceResult.category === "suspected_anomaly") categoryCounts.suspectedAnomalies++;
    else if (evidenceResult.category === "recommendation") categoryCounts.recommendations++;
    else if (evidenceResult.category === "limitation") categoryCounts.limitations++;

    for (const field of evidenceResult.unsupportedFieldsPresent) {
      allUnsupportedFields.add(field);
    }

    findings.push({
      recordId: rec.recordId,
      publicSlug: rec.publicSlug,
      externalId: rec.externalId,
      source: rec.source,
      company: rec.rawCompany,
      title: rec.rawTitle,
      location: rec.rawLocation,
      normalizedLocation: rec.normalizedLocation,
      rawUrl: rec.rawUrl,
      canonicalUrl: rec.canonicalUrl,
      ats: rec.ats,
      duplicate: dup,
      geography: geo,
      freshness: fresh,
      aiReview: ai,
      sourceQuality: srcQuality,
      urlQuality,
      severity: evidenceResult.severity,
      findingCategory: evidenceResult.category,
      evidenceItems: evidenceResult.evidenceItems,
      unsupportedFieldsPresent: evidenceResult.unsupportedFieldsPresent,
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
    severityCounts: {
      critical: severityCounts.critical || 0,
      high: severityCounts.high || 0,
      medium: severityCounts.medium || 0,
      low: severityCounts.low || 0,
      informational: severityCounts.informational || 0,
    },
    categoryCounts: {
      confirmedFindings: categoryCounts.confirmedFindings || 0,
      suspectedAnomalies: categoryCounts.suspectedAnomalies || 0,
      recommendations: categoryCounts.recommendations || 0,
      limitations: categoryCounts.limitations || 0,
    },
    sourceQuality: {
      healthy: sourceHealthyCount,
      missingFields: sourceMissingFieldsCount,
      malformedRecords: sourceMalformedCount,
      anomalousIngestion: sourceAnomalousCount,
      sourceBreakdown,
    },
    urlQuality: {
      validSyntax: urlValidSyntaxCount,
      malformedSyntax: urlMalformedSyntaxCount,
      missingUrl: urlMissingCount,
      liveTested: urlLiveTestedCount,
      reachable: urlReachableCount,
      closureDetected: urlClosureCount,
      unavailable: urlUnavailableCount,
      connectionError: urlConnectionErrorCount,
      untested: urlUntestedCount,
    },
    unsupportedFieldsObserved: Array.from(allUnsupportedFields).sort(),
  };

  return {
    summary,
    findings,
  };
}
