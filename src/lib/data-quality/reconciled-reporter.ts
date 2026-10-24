/**
 * OOS Data Quality & Intelligence — Pure Reconciled Reporting Engine
 *
 * Implements deterministic reconciliation combining algorithmic Phase 1 audit
 * findings with locally stored human-review decisions and evidence tiers.
 *
 * Strict Principles:
 * - Deterministic, versioned JSON (v1.0) and RFC 4180 CSV outputs.
 * - Exact dataset and recordId identity join; title/company matching is prohibited.
 * - Reuses existing fingerprinting (computeFindingFingerprintV2), review status
 *   resolution, and Stage 5 evidence-gating rules.
 * - Distinguishes automated findings from human review outcomes.
 * - Explicitly tracks unreviewed, verified, stale, legacy, escalated, quarantined,
 *   and orphaned review states.
 * - Never promotes stale, legacy, invalid, insufficient-evidence, or conflicting-evidence
 *   reviews to verified outcomes.
 * - Preserves orphaned review entries in a dedicated section without corrupting finding denominators.
 * - Neutralizes spreadsheet formula-injection (=, +, -, @, \t, \r) in CSV, including cases
 *   with leading whitespace or control characters, while strictly preserving raw source values in JSON.
 * - Isolates scoped storage keys; never touches credentials or unrelated localStorage data.
 * - Labels exports as unsigned working snapshots, not authoritative or tamper-proof audit logs.
 */

import {
  computeFindingFingerprintLegacy,
  computeFindingFingerprintV2,
  getRequiredChecklistItems,
  validateEvidenceGatedDisposition,
  type ValidatedAuditReport,
  type ValidatedJobFinding,
} from "./dashboard-schema";
import {
  normalizeStoredReviewEntry,
  type ReviewStateMap,
} from "@/components/admin/data-quality/review-state-store";
import {
  RECONCILED_REPORT_VERSION,
  RECONCILED_TRUST_MODEL_NOTICE,
  reconciledAuditReportJsonSchema,
  type CsvExportOptions,
  type OrphanedReviewEntry,
  type ReconciledAuditReportJson,
  type ReconciledFindingEntry,
  type ReconcileOptions,
  type ReconciliationStatus,
} from "./reconciled-reporter-types";

/**
 * Error thrown when an audit report and review state originate from differing datasets.
 */
export class DatasetMismatchError extends Error {
  public readonly reportDatasetName: string;
  public readonly reviewDatasetName: string;

  constructor(reportDatasetName: string, reviewDatasetName: string) {
    super(
      `Dataset mismatch: Audit report is for dataset "${reportDatasetName}", but review state is for dataset "${reviewDatasetName}". Cross-dataset reconciliation is rejected by default to prevent data corruption. Pass { allowCrossDataset: true } to override.`
    );
    this.name = "DatasetMismatchError";
    this.reportDatasetName = reportDatasetName;
    this.reviewDatasetName = reviewDatasetName;
  }
}

/**
 * Error thrown when reconciling without verifiable review dataset identity.
 */
export class MissingDatasetIdentityError extends DatasetMismatchError {
  constructor(reportDatasetName: string) {
    super(reportDatasetName, "MISSING_DATASET_IDENTITY");
    this.name = "MissingDatasetIdentityError";
    this.message = `Missing dataset identity: Reconciling reviews against report dataset "${reportDatasetName}" requires verified review dataset identity. Provide { reviewDatasetName: "<name>" } or explicitly authorize cross-dataset reconciliation with { allowCrossDataset: true }.`;
  }
}

/**
 * Error thrown when duplicate recordId values appear within the input report findings.
 */
export class DuplicateRecordIdError extends Error {
  public readonly duplicateRecordId: string;

  constructor(duplicateRecordId: string) {
    super(
      `Malformed audit report: Duplicate recordId "${duplicateRecordId}" detected in report findings. Each finding must have a unique recordId to ensure deterministic reconciliation.`
    );
    this.name = "DuplicateRecordIdError";
    this.duplicateRecordId = duplicateRecordId;
  }
}

/**
 * Determines the version of a stored fingerprint from its structure.
 */
export function resolveStoredFingerprintVersion(
  fp: string | null | undefined
): string {
  if (!fp || typeof fp !== "string") {
    return "unknown";
  }
  if (fp.startsWith("fp_v2_")) {
    return "2.0";
  }
  if (fp.startsWith("fp_")) {
    return "1.0";
  }
  return "unknown";
}

/**
 * Checks whether an untrusted string requires spreadsheet formula-injection protection.
 * Matches values beginning with formula trigger characters (=, +, -, @, \t, \r)
 * even after arbitrary leading whitespace or ASCII control characters (0x00 to 0x1F).
 */
export function isFormulaInjectionTarget(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  return /^[\s\u0000-\u001F]*[=+\-@\t\r]/.test(value);
}

/**
 * Sanitizes a cell value for RFC 4180 CSV export with formula-injection neutralization.
 * Preserves raw value semantics while safeguarding spreadsheet interpreters (Excel, Sheets, Calc).
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  let str = String(value);

  // Neutralize formula injection by prepending single quote
  if (isFormulaInjectionTarget(str)) {
    str = `'${str}`;
  }

  // RFC 4180 wrapping & quote escaping
  if (/[",\r\n]/.test(str) || str.startsWith("'")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Formats a checklist record into a concise, human-readable CSV summary string.
 */
function formatChecklistSummary(
  checklist: Record<string, boolean> = {},
  requiredKeys: string[] = []
): string {
  const completedKeys = Object.entries(checklist)
    .filter(([_, val]) => val === true)
    .map(([k]) => k)
    .sort();

  if (requiredKeys.length === 0 && completedKeys.length === 0) {
    return "none_required";
  }

  return `${completedKeys.length}/${requiredKeys.length || completedKeys.length} completed (${
    completedKeys.join(", ") || "none"
  })`;
}

/**
 * Reconciles an audit report with local review records using exact dataset and recordId identity.
 */
export function reconcileFindingsWithReviews(
  report: ValidatedAuditReport,
  reviews: ReviewStateMap,
  options: ReconcileOptions = {}
): ReconciledAuditReportJson {
  const reportDatasetName = report.summary.datasetName;
  const reviewDatasetName = options.reviewDatasetName?.trim();

  // 1. Enforce verifiable dataset identity (Fail-Closed)
  if (!options.allowCrossDataset) {
    if (!reviewDatasetName) {
      throw new MissingDatasetIdentityError(reportDatasetName);
    }
    if (reviewDatasetName !== reportDatasetName) {
      throw new DatasetMismatchError(reportDatasetName, reviewDatasetName);
    }
  }

  // 2. Deterministically sort findings by recordId ascending
  const sortedFindings = [...report.findings].sort((a, b) =>
    a.recordId.localeCompare(b.recordId)
  );

  const reconciledFindings: ReconciledFindingEntry[] = [];
  const processedRecordIds = new Set<string>();

  // Metrics accumulators
  let evidenceVerifiedCount = 0;
  let unreviewedCount = 0;
  let escalatedCount = 0;
  let staleReviewCount = 0;
  let legacyUnstructuredCount = 0;
  let quarantinedInvalidCount = 0;

  const dimensionStats = {
    duplicate: {
      totalFlagged: 0,
      confirmedRedundant: 0,
      confirmedDistinct: 0,
      escalated: 0,
      unreviewed: 0,
      staleReview: 0,
      legacyUnstructured: 0,
      quarantinedInvalid: 0,
    },
    geography: {
      totalFlagged: 0,
      confirmedUs: 0,
      confirmedForeign: 0,
      verifiedCollision: 0,
      escalated: 0,
      unreviewed: 0,
      staleReview: 0,
      legacyUnstructured: 0,
      quarantinedInvalid: 0,
    },
    freshness: {
      totalFlagged: 0,
      verifiedActive: 0,
      verifiedClosed: 0,
      escalated: 0,
      unreviewed: 0,
      staleReview: 0,
      legacyUnstructured: 0,
      quarantinedInvalid: 0,
    },
  };

  // 3. Process each finding
  for (const finding of sortedFindings) {
    if (processedRecordIds.has(finding.recordId)) {
      throw new DuplicateRecordIdError(finding.recordId);
    }
    processedRecordIds.add(finding.recordId);

    const currentFp = computeFindingFingerprintV2(finding);
    const storedEntry = reviews[finding.recordId];

    // Dimension tracking
    const isDupCandidate = finding.duplicate.isDuplicateCandidate;
    const isGeoFlagged = finding.geography.status !== "valid_us";
    const isFreshnessFlagged =
      finding.freshness.status === "closure_detected" ||
      finding.freshness.suspectedIngestionBatch;

    if (isDupCandidate) dimensionStats.duplicate.totalFlagged++;
    if (isGeoFlagged) dimensionStats.geography.totalFlagged++;
    if (isFreshnessFlagged) dimensionStats.freshness.totalFlagged++;

    // Base algorithmic assessment
    const algorithmicAssessment = {
      duplicate: {
        isDuplicateCandidate: finding.duplicate.isDuplicateCandidate,
        confidence: finding.duplicate.confidence,
        reasonCode: finding.duplicate.reasonCode,
        duplicateGroupId: finding.duplicate.duplicateGroupId ?? null,
        candidateCountInGroup:
          typeof finding.duplicate.candidateCountInGroup === "number"
            ? finding.duplicate.candidateCountInGroup
            : 1,
        evidence: finding.duplicate.evidence,
      },
      geography: {
        status: finding.geography.status,
        detectedCountry: finding.geography.detectedCountry ?? null,
        rawLocation: finding.geography.rawLocation ?? null,
        rawCountryCodes: finding.geography.rawCountryCodes || [],
        isDiscrepancy: Boolean(finding.geography.isDiscrepancy),
      },
      freshness: {
        status: finding.freshness.status,
        closureSignals: finding.freshness.closureSignals || [],
        suspectedIngestionBatch: Boolean(
          finding.freshness.suspectedIngestionBatch
        ),
        postedAt: finding.freshness.postedAt ?? null,
        updatedAt: finding.freshness.updatedAt ?? null,
        ageDays: finding.freshness.ageDays ?? null,
      },
    };

    if (!storedEntry) {
      // CASE 1: Unreviewed Finding
      unreviewedCount++;
      if (isDupCandidate) dimensionStats.duplicate.unreviewed++;
      if (isGeoFlagged) dimensionStats.geography.unreviewed++;
      if (isFreshnessFlagged) dimensionStats.freshness.unreviewed++;

      reconciledFindings.push({
        recordId: finding.recordId,
        publicSlug: finding.publicSlug || "",
        externalId: finding.externalId || "",
        source: finding.source || finding.ats.provider || "",
        company: finding.company || "",
        title: finding.title || "",
        rawLocation: finding.location ?? null,
        rawUrl: finding.rawUrl || "",
        canonicalUrl: finding.canonicalUrl || "",
        atsProvider: finding.ats.provider,
        atsRequisitionId: finding.ats.requisitionId ?? null,
        algorithmicAssessment,
        humanReviewOutcome: {
          status: "unreviewed",
          disposition: null,
          evidenceTier: null,
          verificationSource: null,
          checklistCompleted: {},
          auditorNotes: null,
          reviewerAttribution: null,
          reviewedAt: null,
        },
        integrity: {
          currentFingerprint: currentFp,
          storedFingerprint: null,
          fingerprintVersion: "2.0",
          isStaleFingerprint: false,
          isQuarantined: false,
          quarantineReason: null,
        },
        resolution: {
          reconciliationStatus: "unreviewed",
          isVerifiedOutcome: false,
          unresolvedReason:
            "Pending human auditor inspection and verification",
          requiredNextAction: "Triage finding in Data Quality Workbench",
        },
      });
      continue;
    }

    // Existing review entry present
    const normalized = normalizeStoredReviewEntry(storedEntry) ?? storedEntry;
    const lastAudit =
      normalized.history && normalized.history.length > 0
        ? normalized.history[normalized.history.length - 1]
        : undefined;

    // Check fingerprint match
    const isExactV2Match = normalized.fingerprint === currentFp;
    let isLegacyMatch = false;
    if (
      !isExactV2Match &&
      normalized.fingerprint.startsWith("fp_") &&
      !normalized.fingerprint.startsWith("fp_v2_")
    ) {
      const legacyFp = computeFindingFingerprintLegacy(finding);
      if (normalized.fingerprint === legacyFp) {
        isLegacyMatch = true;
      }
    }

    const isStale = !isExactV2Match && !isLegacyMatch;

    // Check evidence-gating quarantine status
    let isQuarantined = false;
    let quarantineReason: string | null = null;

    if (storedEntry.disposition && storedEntry.evidenceTier) {
      const chk = storedEntry.checklist ?? lastAudit?.checklist;
      const rawGate = validateEvidenceGatedDisposition(
        storedEntry.disposition,
        storedEntry.evidenceTier,
        chk
      );
      if (!rawGate.isValid) {
        isQuarantined = true;
        quarantineReason =
          rawGate.error || "Stored review violated evidence-gating rule";
      }
    }

    if (
      normalized.notes?.startsWith("[QUARANTINED INVALID REVIEW:") ||
      storedEntry.notes?.startsWith("[QUARANTINED INVALID REVIEW:")
    ) {
      isQuarantined = true;
      const noteStr = normalized.notes || storedEntry.notes || "";
      const match = noteStr.match(/\[QUARANTINED INVALID REVIEW:\s*([^\]]+)\]/);
      quarantineReason = match?.[1] || "Quarantined invalid review decision";
    }

    // Resolve reconciliation status
    let reconciliationStatus: ReconciliationStatus;
    let isVerifiedOutcome = false;
    let unresolvedReason: string | null = null;
    let requiredNextAction: string | null = null;

    if (isStale) {
      // CASE 2: Stale Review
      reconciliationStatus = "stale_review";
      staleReviewCount++;
      isVerifiedOutcome = false;
      unresolvedReason =
        "Job posting data has mutated since review was recorded; fingerprint is stale";
      requiredNextAction =
        "Perform explicit re-verification of updated finding in Workbench";

      if (isDupCandidate) dimensionStats.duplicate.staleReview++;
      if (isGeoFlagged) dimensionStats.geography.staleReview++;
      if (isFreshnessFlagged) dimensionStats.freshness.staleReview++;
    } else if (isQuarantined) {
      // CASE 3: Quarantined Invalid Review
      reconciliationStatus = "quarantined_invalid_review";
      quarantinedInvalidCount++;
      isVerifiedOutcome = false;
      unresolvedReason =
        quarantineReason ||
        "Stored review decision violated evidence-gating validation rules";
      requiredNextAction =
        "Correct evidence tier and complete mandatory checklist in Workbench";

      if (isDupCandidate) dimensionStats.duplicate.quarantinedInvalid++;
      if (isGeoFlagged) dimensionStats.geography.quarantinedInvalid++;
      if (isFreshnessFlagged) dimensionStats.freshness.quarantinedInvalid++;
    } else if (
      isLegacyMatch ||
      normalized.evidenceTier === "EVIDENCE_HISTORICAL_UNSTRUCTURED" ||
      normalized.disposition === "LEGACY_REVIEWED_UNSTRUCTURED"
    ) {
      // CASE 4: Legacy Unstructured Review
      reconciliationStatus = "legacy_unstructured_review";
      legacyUnstructuredCount++;
      isVerifiedOutcome = false;
      unresolvedReason =
        "Historical review lacks Stage 5 evidence tier and verification checklist";
      requiredNextAction =
        "Re-review under Stage 5 evidence-gating protocol with cited primary source";

      if (isDupCandidate) dimensionStats.duplicate.legacyUnstructured++;
      if (isGeoFlagged) dimensionStats.geography.legacyUnstructured++;
      if (isFreshnessFlagged) dimensionStats.freshness.legacyUnstructured++;
    } else if (
      normalized.disposition === "ESCALATED_NEEDS_FURTHER_EVIDENCE" ||
      normalized.status === "needs_review" ||
      normalized.evidenceTier === "EVIDENCE_INSUFFICIENT" ||
      normalized.evidenceTier === "EVIDENCE_INACCESSIBLE" ||
      normalized.evidenceTier === "EVIDENCE_CONFLICTING"
    ) {
      // CASE 5: Escalated Review
      reconciliationStatus = "escalated_needs_evidence";
      escalatedCount++;
      isVerifiedOutcome = false;
      if (normalized.evidenceTier === "EVIDENCE_INACCESSIBLE") {
        unresolvedReason =
          "Primary source inaccessible (404, authentication wall, or geoblocked)";
        requiredNextAction =
          "Investigate employer career site accessibility or verify alternate ATS mirror";
      } else if (normalized.evidenceTier === "EVIDENCE_CONFLICTING") {
        unresolvedReason =
          "Conflicting employer sources or posting timestamps detected";
        requiredNextAction =
          "Resolve conflicting employer signals with hiring entity directly";
      } else {
        unresolvedReason =
          "Insufficient evidence to confirm disposition; escalated for further investigation";
        requiredNextAction =
          "Gather primary ATS evidence and complete required checklist";
      }

      if (isDupCandidate) dimensionStats.duplicate.escalated++;
      if (isGeoFlagged) dimensionStats.geography.escalated++;
      if (isFreshnessFlagged) dimensionStats.freshness.escalated++;
    } else if (normalized.evidenceTier === "EVIDENCE_OBSERVED") {
      // CASE 6: Evidence Observed -> Verify Checklist Completion
      const disp = normalized.disposition;
      const reqItems = disp ? getRequiredChecklistItems(disp) : [];
      const chk = normalized.checklist ?? lastAudit?.checklist ?? {};
      const completedAll =
        reqItems.length > 0 && reqItems.every((k) => chk[k] === true);

      const confirmedDispositions = [
        "DUPLICATE_CONFIRMED_REDUNDANT",
        "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT",
        "GEO_CONFIRMED_DOMESTIC_US",
        "GEO_CONFIRMED_FOREIGN",
        "GEO_METADATA_COLLISION_VERIFIED",
        "TEMPORAL_VERIFIED_ACTIVE",
        "TEMPORAL_VERIFIED_CLOSED",
      ];

      if (disp && confirmedDispositions.includes(disp) && completedAll) {
        // Confirmed Evidence-Verified Outcome
        reconciliationStatus = "evidence_verified";
        isVerifiedOutcome = true;
        evidenceVerifiedCount++;
        unresolvedReason = null;
        requiredNextAction = null;

        // Dimension disposition tallies
        if (disp === "DUPLICATE_CONFIRMED_REDUNDANT") {
          dimensionStats.duplicate.confirmedRedundant++;
        } else if (disp === "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT") {
          dimensionStats.duplicate.confirmedDistinct++;
        } else if (disp === "GEO_CONFIRMED_DOMESTIC_US") {
          dimensionStats.geography.confirmedUs++;
        } else if (disp === "GEO_CONFIRMED_FOREIGN") {
          dimensionStats.geography.confirmedForeign++;
        } else if (disp === "GEO_METADATA_COLLISION_VERIFIED") {
          dimensionStats.geography.verifiedCollision++;
        } else if (disp === "TEMPORAL_VERIFIED_ACTIVE") {
          dimensionStats.freshness.verifiedActive++;
        } else if (disp === "TEMPORAL_VERIFIED_CLOSED") {
          dimensionStats.freshness.verifiedClosed++;
        }
      } else {
        reconciliationStatus = "quarantined_invalid_review";
        quarantinedInvalidCount++;
        isVerifiedOutcome = false;
        unresolvedReason =
          "Checklist verification incomplete for confirmed disposition";
        requiredNextAction =
          "Complete mandatory verification checklist in Workbench";

        if (isDupCandidate) dimensionStats.duplicate.quarantinedInvalid++;
        if (isGeoFlagged) dimensionStats.geography.quarantinedInvalid++;
        if (isFreshnessFlagged) dimensionStats.freshness.quarantinedInvalid++;
      }
    } else {
      reconciliationStatus = "unreviewed";
      unreviewedCount++;
      isVerifiedOutcome = false;
      unresolvedReason =
        "Pending human auditor inspection and verification";
      requiredNextAction = "Triage finding in Data Quality Workbench";

      if (isDupCandidate) dimensionStats.duplicate.unreviewed++;
      if (isGeoFlagged) dimensionStats.geography.unreviewed++;
      if (isFreshnessFlagged) dimensionStats.freshness.unreviewed++;
    }

    reconciledFindings.push({
      recordId: finding.recordId,
      publicSlug: finding.publicSlug || "",
      externalId: finding.externalId || "",
      source: finding.source || finding.ats.provider || "",
      company: finding.company || "",
      title: finding.title || "",
      rawLocation: finding.location ?? null,
      rawUrl: finding.rawUrl || "",
      canonicalUrl: finding.canonicalUrl || "",
      atsProvider: finding.ats.provider,
      atsRequisitionId: finding.ats.requisitionId ?? null,
      algorithmicAssessment,
      humanReviewOutcome: {
        status: normalized.status,
        disposition: normalized.disposition ?? null,
        evidenceTier: normalized.evidenceTier ?? null,
        verificationSource:
          normalized.verificationSource ??
          lastAudit?.verificationSource ??
          null,
        checklistCompleted:
          normalized.checklist ?? lastAudit?.checklist ?? {},
        auditorNotes: normalized.notes ?? lastAudit?.notes ?? null,
        reviewerAttribution:
          normalized.reviewerEmail ??
          lastAudit?.reviewerEmail ??
          lastAudit?.reviewerUserId ??
          null,
        reviewedAt: lastAudit?.reviewedAt ?? normalized.updatedAt ?? null,
      },
      integrity: {
        currentFingerprint: currentFp,
        storedFingerprint: normalized.fingerprint,
        fingerprintVersion: resolveStoredFingerprintVersion(
          normalized.fingerprint
        ),
        isStaleFingerprint: isStale,
        isQuarantined,
        quarantineReason,
      },
      resolution: {
        reconciliationStatus,
        isVerifiedOutcome,
        unresolvedReason,
        requiredNextAction,
      },
    });
  }

  // 4. Preserve Orphaned Review Entries (reviews for records absent from report)
  const orphanedKeys = Object.keys(reviews)
    .filter((k) => !processedRecordIds.has(k))
    .sort();

  const orphanedReviews: OrphanedReviewEntry[] = [];
  for (const recId of orphanedKeys) {
    const raw = reviews[recId]!;
    const norm = normalizeStoredReviewEntry(raw) ?? raw;
    const lastAudit =
      norm.history && norm.history.length > 0
        ? norm.history[norm.history.length - 1]
        : undefined;

    orphanedReviews.push({
      recordId: recId,
      storedFingerprint: norm.fingerprint,
      status: norm.status,
      disposition: norm.disposition ?? null,
      evidenceTier: norm.evidenceTier ?? null,
      verificationSource:
        norm.verificationSource ?? lastAudit?.verificationSource ?? null,
      checklist: norm.checklist ?? lastAudit?.checklist ?? {},
      auditorNotes: norm.notes ?? lastAudit?.notes ?? null,
      reviewerAttribution:
        norm.reviewerEmail ??
        lastAudit?.reviewerEmail ??
        lastAudit?.reviewerUserId ??
        null,
      updatedAt: norm.updatedAt,
      reconciliationStatus: "orphaned_review",
      unresolvedReason:
        "Review record has no matching finding in current audit report",
      requiredNextAction:
        "Verify dataset identity or inspect source audit report version",
    });
  }

  const generatedAt = options.generatedAt || new Date().toISOString();
  const generatorVersion = options.generatorVersion || "1.0.0";
  const reportTitle =
    options.reportTitle ||
    `Reconciled Data Quality Audit Report: ${reportDatasetName}`;

  const reportPayload: ReconciledAuditReportJson = {
    schemaVersion: RECONCILED_REPORT_VERSION,
    reportTitle,
    datasetName: reportDatasetName,
    generatedAt,
    generatorVersion,
    trustModelNotice: RECONCILED_TRUST_MODEL_NOTICE,
    summary: {
      totalRecordsAudited: report.summary.totalRecordsAudited,
      totalFindingsInReport: report.findings.length,
      uniqueRecordsWithFindings: processedRecordIds.size,
      reconciliationBreakdown: {
        evidenceVerified: evidenceVerifiedCount,
        unreviewed: unreviewedCount,
        escalatedNeedsEvidence: escalatedCount,
        staleReview: staleReviewCount,
        legacyUnstructured: legacyUnstructuredCount,
        quarantinedInvalid: quarantinedInvalidCount,
        orphanedReviews: orphanedReviews.length,
      },
      dimensionBreakdown: dimensionStats,
    },
    reconciledFindings,
    orphanedReviews,
  };

  return reconciledAuditReportJsonSchema.parse(reportPayload);
}

/**
 * Exports a reconciled audit report as a deterministic, versioned JSON string.
 */
export function exportReconciledJsonReport(
  report: ValidatedAuditReport,
  reviews: ReviewStateMap,
  options: ReconcileOptions = {}
): string {
  const reconciled = reconcileFindingsWithReviews(report, reviews, options);
  return JSON.stringify(reconciled, null, 2);
}

/**
 * Standard CSV column headers for reconciled findings.
 */
export const RECONCILED_CSV_COLUMNS = [
  "record_id",
  "public_slug",
  "external_id",
  "source",
  "company",
  "role_title",
  "raw_location",
  "canonical_url",
  "ats_provider",
  "ats_requisition_id",
  "algo_dup_is_candidate",
  "algo_dup_confidence",
  "algo_dup_reason_code",
  "algo_dup_group_id",
  "algo_dup_candidate_count",
  "algo_geo_status",
  "algo_geo_detected_country",
  "algo_freshness_status",
  "algo_suspected_batch",
  "reconciliation_status",
  "is_verified_outcome",
  "human_review_status",
  "human_disposition",
  "evidence_tier",
  "verification_source",
  "checklist_summary",
  "auditor_notes",
  "reviewer_attribution",
  "reviewed_at",
  "fingerprint_v2",
  "is_stale_fingerprint",
  "is_quarantined",
  "unresolved_reason",
  "required_next_action",
] as const;

/**
 * Converts a ReconciledAuditReportJson into an RFC 4180-compliant CSV string
 * with spreadsheet formula-injection protection and UTF-8 encoding.
 */
export function exportReconciledCsvReport(
  reconciled: ReconciledAuditReportJson,
  options: CsvExportOptions = {}
): string {
  const lineEnding = options.lineEnding || "\r\n";
  const rows: string[] = [];

  // Header row
  rows.push(RECONCILED_CSV_COLUMNS.join(","));

  // Reconciled findings
  for (const f of reconciled.reconciledFindings) {
    const disp = f.humanReviewOutcome.disposition;
    const reqKeys = disp ? getRequiredChecklistItems(disp) : [];
    const checklistStr = formatChecklistSummary(
      f.humanReviewOutcome.checklistCompleted,
      reqKeys
    );

    const values: string[] = [
      sanitizeCsvCell(f.recordId),
      sanitizeCsvCell(f.publicSlug),
      sanitizeCsvCell(f.externalId),
      sanitizeCsvCell(f.source),
      sanitizeCsvCell(f.company),
      sanitizeCsvCell(f.title),
      sanitizeCsvCell(f.rawLocation),
      sanitizeCsvCell(f.canonicalUrl),
      sanitizeCsvCell(f.atsProvider),
      sanitizeCsvCell(f.atsRequisitionId),
      sanitizeCsvCell(f.algorithmicAssessment.duplicate.isDuplicateCandidate),
      sanitizeCsvCell(f.algorithmicAssessment.duplicate.confidence),
      sanitizeCsvCell(f.algorithmicAssessment.duplicate.reasonCode),
      sanitizeCsvCell(f.algorithmicAssessment.duplicate.duplicateGroupId),
      sanitizeCsvCell(f.algorithmicAssessment.duplicate.candidateCountInGroup),
      sanitizeCsvCell(f.algorithmicAssessment.geography.status),
      sanitizeCsvCell(f.algorithmicAssessment.geography.detectedCountry),
      sanitizeCsvCell(f.algorithmicAssessment.freshness.status),
      sanitizeCsvCell(f.algorithmicAssessment.freshness.suspectedIngestionBatch),
      sanitizeCsvCell(f.resolution.reconciliationStatus),
      sanitizeCsvCell(f.resolution.isVerifiedOutcome),
      sanitizeCsvCell(f.humanReviewOutcome.status),
      sanitizeCsvCell(f.humanReviewOutcome.disposition),
      sanitizeCsvCell(f.humanReviewOutcome.evidenceTier),
      sanitizeCsvCell(f.humanReviewOutcome.verificationSource),
      sanitizeCsvCell(checklistStr),
      sanitizeCsvCell(f.humanReviewOutcome.auditorNotes),
      sanitizeCsvCell(f.humanReviewOutcome.reviewerAttribution),
      sanitizeCsvCell(f.humanReviewOutcome.reviewedAt),
      sanitizeCsvCell(f.integrity.currentFingerprint),
      sanitizeCsvCell(f.integrity.isStaleFingerprint),
      sanitizeCsvCell(f.integrity.isQuarantined),
      sanitizeCsvCell(f.resolution.unresolvedReason),
      sanitizeCsvCell(f.resolution.requiredNextAction),
    ];

    rows.push(values.join(","));
  }

  // Optionally append orphaned reviews
  if (options.includeOrphanedReviews && reconciled.orphanedReviews.length > 0) {
    for (const orphan of reconciled.orphanedReviews) {
      const disp = orphan.disposition;
      const reqKeys = disp ? getRequiredChecklistItems(disp) : [];
      const checklistStr = formatChecklistSummary(
        orphan.checklist ?? {},
        reqKeys
      );

      const values: string[] = [
        sanitizeCsvCell(orphan.recordId),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell(false),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell(0),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell("-"),
        sanitizeCsvCell(false),
        sanitizeCsvCell(orphan.reconciliationStatus),
        sanitizeCsvCell(false),
        sanitizeCsvCell(orphan.status),
        sanitizeCsvCell(orphan.disposition),
        sanitizeCsvCell(orphan.evidenceTier),
        sanitizeCsvCell(orphan.verificationSource),
        sanitizeCsvCell(checklistStr),
        sanitizeCsvCell(orphan.auditorNotes),
        sanitizeCsvCell(orphan.reviewerAttribution),
        sanitizeCsvCell(orphan.updatedAt),
        sanitizeCsvCell(orphan.storedFingerprint),
        sanitizeCsvCell(false),
        sanitizeCsvCell(false),
        sanitizeCsvCell(orphan.unresolvedReason),
        sanitizeCsvCell(orphan.requiredNextAction),
      ];

      rows.push(values.join(","));
    }
  }

  const csvContent = rows.join(lineEnding) + lineEnding;
  return options.includeBom !== false ? `\uFEFF${csvContent}` : csvContent;
}

/**
 * Dedicated CSV export for orphaned review entries.
 */
export function exportOrphanedReviewsCsv(
  orphans: OrphanedReviewEntry[],
  options: CsvExportOptions = {}
): string {
  const lineEnding = options.lineEnding || "\r\n";
  const rows: string[] = [];

  const headers = [
    "record_id",
    "stored_fingerprint",
    "status",
    "disposition",
    "evidence_tier",
    "verification_source",
    "checklist_summary",
    "auditor_notes",
    "reviewer_attribution",
    "updated_at",
    "reconciliation_status",
    "unresolved_reason",
    "required_next_action",
  ];

  rows.push(headers.join(","));

  for (const o of orphans) {
    const disp = o.disposition;
    const reqKeys = disp ? getRequiredChecklistItems(disp) : [];
    const checklistStr = formatChecklistSummary(o.checklist ?? {}, reqKeys);

    const values: string[] = [
      sanitizeCsvCell(o.recordId),
      sanitizeCsvCell(o.storedFingerprint),
      sanitizeCsvCell(o.status),
      sanitizeCsvCell(o.disposition),
      sanitizeCsvCell(o.evidenceTier),
      sanitizeCsvCell(o.verificationSource),
      sanitizeCsvCell(checklistStr),
      sanitizeCsvCell(o.auditorNotes),
      sanitizeCsvCell(o.reviewerAttribution),
      sanitizeCsvCell(o.updatedAt),
      sanitizeCsvCell(o.reconciliationStatus),
      sanitizeCsvCell(o.unresolvedReason),
      sanitizeCsvCell(o.requiredNextAction),
    ];
    rows.push(values.join(","));
  }

  const csvContent = rows.join(lineEnding) + lineEnding;
  return options.includeBom !== false ? `\uFEFF${csvContent}` : csvContent;
}
