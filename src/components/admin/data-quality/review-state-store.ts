/**
 * Client-Side Browser Storage Manager for Finding Reviews
 *
 * Enforces:
 * - Local-only browser storage (localStorage)
 * - Zero network or database transmission
 * - Versioned SHA-256 deterministic fingerprint matching
 * - Evidence-gated disposition validation
 * - Safe error handling for corrupted storage, quota exceeded, or SSR
 * - Backward compatibility with legacy Phase 2 reviews
 * - Advisory storage measurement
 */

import {
  computeFindingFingerprintV2,
  computeFindingFingerprintLegacy,
  computeFindingFingerprint,
  findingReviewEntrySchema,
  reviewStateBackupSchema,
  toLegacyReviewStatus,
  validateEvidenceGatedDisposition,
  type FindingReviewEntry,
  type ReviewStateBackup,
  type ReviewStatus,
  type ReviewDisposition,
  type EvidenceTier,
  type ReviewAuditLogEntry,
  type ValidatedJobFinding,
} from "@/lib/data-quality/dashboard-schema";

const STORAGE_PREFIX = "oos_dq_review_v1_";

export function getStorageKey(datasetName: string): string {
  const sanitized = datasetName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${STORAGE_PREFIX}${sanitized}`;
}

export type ReviewStateMap = Record<string, FindingReviewEntry>;

/**
 * Normalizes a stored review entry from localStorage or imported backup.
 * Upgrades legacy reviews without fabricating evidence or verified outcomes.
 */
export function normalizeStoredReviewEntry(raw: unknown): FindingReviewEntry | null {
  const result = findingReviewEntrySchema.safeParse(raw);
  if (!result.success) return null;

  const entry = result.data;

  // Determine legacy vs structured fields without fabricating evidence
  let disposition = entry.disposition;
  let evidenceTier = entry.evidenceTier;

  if (!disposition) {
    if (entry.status === "reviewed") {
      disposition = "LEGACY_REVIEWED_UNSTRUCTURED";
      evidenceTier = evidenceTier ?? "EVIDENCE_HISTORICAL_UNSTRUCTURED";
    } else if (entry.status === "needs_review") {
      disposition = "ESCALATED_NEEDS_FURTHER_EVIDENCE";
      evidenceTier = evidenceTier ?? "EVIDENCE_INSUFFICIENT";
    } else {
      disposition = "UNREVIEWED";
    }
  }

  // Consistent evidence-gating validation on load and restore (DQ-AUDIT-05)
  if (disposition && evidenceTier) {
    const lastAudit = entry.history?.[entry.history.length - 1];
    const checklist = entry.checklist ?? lastAudit?.checklist;
    const gateValidation = validateEvidenceGatedDisposition(disposition, evidenceTier, checklist);

    if (!gateValidation.isValid) {
      // Quarantine invalid entry: Demote to ESCALATED_NEEDS_FURTHER_EVIDENCE under EVIDENCE_INSUFFICIENT.
      // NEVER silently convert an invalid combination into a verified outcome!
      // Preserve historical notes, timestamps, and audit history.
      return {
        ...entry,
        status: "needs_review",
        disposition: "ESCALATED_NEEDS_FURTHER_EVIDENCE",
        evidenceTier: "EVIDENCE_INSUFFICIENT",
        notes: entry.notes
          ? `[QUARANTINED INVALID REVIEW: ${gateValidation.error}] ${entry.notes}`
          : `[QUARANTINED INVALID REVIEW: ${gateValidation.error}]`,
      };
    }
  }

  return {
    ...entry,
    disposition,
    evidenceTier,
  };
}

/**
 * Loads all review entries for a specific dataset from localStorage.
 */
export function loadReviewState(datasetName: string): ReviewStateMap {
  if (typeof window === "undefined" || !window.localStorage) return {};

  try {
    const raw = window.localStorage.getItem(getStorageKey(datasetName));
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    // Validate and normalize entries
    const validated: ReviewStateMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      const normalized = normalizeStoredReviewEntry(val);
      if (normalized) {
        validated[key] = normalized;
      }
    }
    return validated;
  } catch (err) {
    console.warn("[OOS Data Quality] Failed to load local review state:", err);
    return {};
  }
}

export interface SaveReviewOptions {
  disposition?: ReviewDisposition;
  evidenceTier?: EvidenceTier;
  verificationSource?: string;
  checklist?: Record<string, boolean>;
  reviewerUserId?: string;
  reviewerEmail?: string;
}

export interface SaveReviewResult {
  success: boolean;
  reviews: ReviewStateMap;
  error?: string;
}

/**
 * Saves a review status update to localStorage with evidence-gating enforcement.
 * Returns failure state if evidence rules fail or storage quota is exceeded.
 */
export function saveReviewEntry(
  datasetName: string,
  finding: ValidatedJobFinding,
  statusOrDisposition: ReviewStatus | ReviewDisposition,
  notes?: string,
  options?: SaveReviewOptions
): SaveReviewResult {
  const current = loadReviewState(datasetName);
  const currentFp = computeFindingFingerprintV2(finding);

  // Determine structured disposition and legacy status
  let disposition: ReviewDisposition;
  let status: ReviewStatus;
  let evidenceTier: EvidenceTier | undefined;

  const validDispositions: ReviewDisposition[] = [
    "UNREVIEWED",
    "ESCALATED_NEEDS_FURTHER_EVIDENCE",
    "DUPLICATE_CONFIRMED_REDUNDANT",
    "DUPLICATE_CONFIRMED_DISTINCT_HEADCOUNT",
    "GEO_CONFIRMED_DOMESTIC_US",
    "GEO_CONFIRMED_FOREIGN",
    "GEO_METADATA_COLLISION_VERIFIED",
    "TEMPORAL_VERIFIED_ACTIVE",
    "TEMPORAL_VERIFIED_CLOSED",
    "LEGACY_REVIEWED_UNSTRUCTURED",
  ];

  if (validDispositions.includes(statusOrDisposition as ReviewDisposition)) {
    disposition = statusOrDisposition as ReviewDisposition;
    status = toLegacyReviewStatus(disposition);
    evidenceTier =
      options?.evidenceTier ??
      (disposition === "ESCALATED_NEEDS_FURTHER_EVIDENCE"
        ? "EVIDENCE_INSUFFICIENT"
        : disposition === "LEGACY_REVIEWED_UNSTRUCTURED"
        ? "EVIDENCE_HISTORICAL_UNSTRUCTURED"
        : disposition === "UNREVIEWED"
        ? undefined
        : "EVIDENCE_OBSERVED");
  } else if (options?.disposition) {
    disposition = options.disposition;
    status = toLegacyReviewStatus(disposition);
    evidenceTier =
      options.evidenceTier ??
      (disposition === "ESCALATED_NEEDS_FURTHER_EVIDENCE"
        ? "EVIDENCE_INSUFFICIENT"
        : disposition === "LEGACY_REVIEWED_UNSTRUCTURED"
        ? "EVIDENCE_HISTORICAL_UNSTRUCTURED"
        : disposition === "UNREVIEWED"
        ? undefined
        : "EVIDENCE_OBSERVED");
  } else {
    status = statusOrDisposition as ReviewStatus;
    if (status === "reviewed") {
      disposition = "LEGACY_REVIEWED_UNSTRUCTURED";
      evidenceTier = options?.evidenceTier ?? "EVIDENCE_HISTORICAL_UNSTRUCTURED";
    } else if (status === "needs_review") {
      disposition = "ESCALATED_NEEDS_FURTHER_EVIDENCE";
      evidenceTier = options?.evidenceTier ?? "EVIDENCE_INSUFFICIENT";
    } else {
      disposition = "UNREVIEWED";
      evidenceTier = undefined;
    }
  }

  // Enforce evidence-gating including checklist verification (DQ-AUDIT-02)
  if (evidenceTier) {
    const gateValidation = validateEvidenceGatedDisposition(
      disposition,
      evidenceTier,
      options?.checklist
    );
    if (!gateValidation.isValid) {
      return {
        success: false,
        reviews: current,
        error: gateValidation.error,
      };
    }
  }

  const existing = current[finding.recordId];
  const auditTimestamp = new Date().toISOString();

  // Create append-only audit trail entry for this review event
  const auditEntry: ReviewAuditLogEntry = {
    auditId: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    recordId: finding.recordId,
    fingerprint: currentFp,
    datasetName,
    disposition,
    evidenceTier: evidenceTier ?? "EVIDENCE_HISTORICAL_UNSTRUCTURED",
    verificationSource:
      options?.verificationSource?.trim() ||
      (evidenceTier === "EVIDENCE_HISTORICAL_UNSTRUCTURED"
        ? "historical_unstructured_review"
        : "human_review_inspection"),
    checklist: options?.checklist ?? {},
    reviewerUserId: options?.reviewerUserId?.trim() || undefined,
    reviewerEmail: options?.reviewerEmail?.trim() || undefined,
    notes: notes?.trim() || "",
    reviewedAt: auditTimestamp,
  };

  const priorHistory = Array.isArray(existing?.history) ? existing.history : [];
  const history = [...priorHistory, auditEntry];

  const entry: FindingReviewEntry = {
    fingerprint: currentFp,
    recordId: finding.recordId,
    status,
    disposition,
    evidenceTier,
    checklist: options?.checklist,
    reviewerEmail: options?.reviewerEmail?.trim() || undefined,
    verificationSource: options?.verificationSource?.trim() || undefined,
    notes: notes?.trim() || undefined,
    history,
    updatedAt: auditTimestamp,
    isStaleFingerprint: false,
  };

  const next = { ...current, [finding.recordId]: entry };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(
        getStorageKey(datasetName),
        JSON.stringify(next)
      );
    } catch (err) {
      console.error("[OOS Data Quality] Failed to save review entry:", err);
      const isQuota =
        (err instanceof DOMException &&
          (err.code === 22 ||
            err.code === 1014 ||
            err.name === "QuotaExceededError" ||
            err.name === "NS_ERROR_DOM_QUOTA_REACHED")) ||
        String(err).toLowerCase().includes("quota");
      return {
        success: false,
        reviews: current,
        error: isQuota
          ? "Local storage quota exceeded. Export a review backup and clear older reports."
          : `Failed to save review locally: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { success: true, reviews: next };
}

/**
 * Resolves the effective status of a finding.
 * - Exact v2 fingerprint match returns current saved status.
 * - Exact legacy v1 fingerprint match returns legacy status (unstructured).
 * - Mismatched fingerprint marks the finding stale and resets status to unreviewed.
 */
export function resolveFindingReviewStatus(
  reviews: ReviewStateMap,
  finding: ValidatedJobFinding
): {
  status: ReviewStatus;
  disposition?: ReviewDisposition;
  evidenceTier?: EvidenceTier;
  entry?: FindingReviewEntry;
  isStaleFingerprint: boolean;
} {
  const existing = reviews[finding.recordId];
  if (!existing) {
    return {
      status: "unreviewed",
      disposition: "UNREVIEWED",
      isStaleFingerprint: false,
    };
  }

  const normalized = normalizeStoredReviewEntry(existing) ?? existing;
  const currentFp = computeFindingFingerprintV2(finding);

  // Exact v2 fingerprint match
  if (normalized.fingerprint === currentFp) {
    return {
      status: normalized.status,
      disposition: normalized.disposition,
      evidenceTier: normalized.evidenceTier,
      entry: normalized,
      isStaleFingerprint: false,
    };
  }

  // Check legacy v1 fingerprint match if existing was saved in legacy format
  if (normalized.fingerprint.startsWith("fp_") && !normalized.fingerprint.startsWith("fp_v2_")) {
    const legacyFp = computeFindingFingerprintLegacy(finding);
    if (normalized.fingerprint === legacyFp) {
      // Finding data itself is unchanged since legacy review
      return {
        status: normalized.status,
        disposition: normalized.disposition ?? "LEGACY_REVIEWED_UNSTRUCTURED",
        evidenceTier: normalized.evidenceTier ?? "EVIDENCE_HISTORICAL_UNSTRUCTURED",
        entry: normalized,
        isStaleFingerprint: false,
      };
    }
  }

  // Finding content has mutated since review was recorded -> Stale
  return {
    status: "unreviewed",
    disposition: "UNREVIEWED",
    entry: {
      ...normalized,
      isStaleFingerprint: true,
    },
    isStaleFingerprint: true,
  };
}

/**
 * Measures browser localStorage usage for advisory feedback.
 */
export interface StorageUsageResult {
  bytesUsed: number;
  totalStorageBytesUsed: number;
  quotaEstimateBytes: number;
  usagePercentage: number;
  isNearQuota: boolean;
}

export function measureLocalStorageUsage(datasetName?: string): StorageUsageResult {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      bytesUsed: 0,
      totalStorageBytesUsed: 0,
      quotaEstimateBytes: 5 * 1024 * 1024,
      usagePercentage: 0,
      isNearQuota: false,
    };
  }

  try {
    let totalStorageBytesUsed = 0;
    let datasetBytes = 0;
    const targetKey = datasetName ? getStorageKey(datasetName) : null;

    const keys: string[] = [];
    if (typeof window.localStorage.key === "function" && typeof window.localStorage.length === "number") {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k) keys.push(k);
      }
    }
    if (keys.length === 0) {
      keys.push(...Object.keys(window.localStorage).filter((k) => typeof window.localStorage.getItem(k) === "string"));
    }

    for (const key of keys) {
      const val = window.localStorage.getItem(key) || "";
      const itemBytes = (key.length + val.length) * 2;
      totalStorageBytesUsed += itemBytes;
      if (targetKey && key === targetKey) {
        datasetBytes = itemBytes;
      }
    }

    const quotaEstimateBytes = 5 * 1024 * 1024; // 5MB standard browser quota
    const usagePercentage = Math.min(100, Math.round((totalStorageBytesUsed / quotaEstimateBytes) * 100));
    const isNearQuota = usagePercentage >= 80;

    return {
      bytesUsed: targetKey ? datasetBytes : totalStorageBytesUsed,
      totalStorageBytesUsed,
      quotaEstimateBytes,
      usagePercentage,
      isNearQuota,
    };
  } catch (err) {
    console.warn("[OOS Data Quality] Storage measurement failed:", err);
    return {
      bytesUsed: 0,
      totalStorageBytesUsed: 0,
      quotaEstimateBytes: 5 * 1024 * 1024,
      usagePercentage: 0,
      isNearQuota: false,
    };
  }
}

/**
 * Exports current dataset review state as downloadable JSON backup conforming to v2.0 schema.
 */
export function exportReviewStateBackup(
  datasetName: string,
  reviews: ReviewStateMap
): string {
  const normalizedReviews: ReviewStateMap = {};
  for (const [recId, entry] of Object.entries(reviews)) {
    const normalized = normalizeStoredReviewEntry(entry);
    if (normalized) {
      normalizedReviews[recId] = normalized;
    }
  }

  const backup: ReviewStateBackup = {
    version: "2.0",
    exportedAt: new Date().toISOString(),
    datasetName,
    trustModelNotice:
      "Point-in-Time Snapshot; Unsigned Browser-Local Attribution; Not Tamper-Proof Audit Record",
    reviews: normalizedReviews,
  };
  return JSON.stringify(backup, null, 2);
}

export interface ImportBackupResult {
  success: boolean;
  importedCount: number;
  requiresConfirmation?: boolean;
  backupDatasetName?: string;
  error?: string;
}

/**
 * Validates and imports a review state backup JSON string (v1.0 or v2.0).
 * Preserves legacy reviews and enforces cross-dataset confirmation (SEC-04).
 */
export function importReviewStateBackup(
  datasetName: string,
  jsonString: string,
  options?: { allowCrossDataset?: boolean }
): ImportBackupResult {
  try {
    const raw = JSON.parse(jsonString);
    const parsed = reviewStateBackupSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        success: false,
        importedCount: 0,
        error: `Invalid backup schema: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
      };
    }

    // SEC-04: Warn on cross-dataset restore unless explicitly authorized
    if (parsed.data.datasetName !== datasetName && !options?.allowCrossDataset) {
      return {
        success: false,
        importedCount: 0,
        requiresConfirmation: true,
        backupDatasetName: parsed.data.datasetName,
        error: `Dataset mismatch: Backup was exported from "${parsed.data.datasetName}", but current dataset is "${datasetName}".`,
      };
    }

    const current = loadReviewState(datasetName);
    const incoming = parsed.data.reviews;

    // Merge incoming reviews with normalization
    let count = 0;
    for (const [recId, entry] of Object.entries(incoming)) {
      const normalized = normalizeStoredReviewEntry(entry);
      if (normalized) {
        current[recId] = normalized;
        count++;
      }
    }

    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(
          getStorageKey(datasetName),
          JSON.stringify(current)
        );
      } catch (err) {
        const isQuota =
          (err instanceof DOMException &&
            (err.code === 22 ||
              err.code === 1014 ||
              err.name === "QuotaExceededError" ||
              err.name === "NS_ERROR_DOM_QUOTA_REACHED")) ||
          String(err).toLowerCase().includes("quota");
        return {
          success: false,
          importedCount: 0,
          error: isQuota
            ? "Local storage quota exceeded while restoring backup. Free up storage space."
            : `Failed to write backup to local storage: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    return { success: true, importedCount: count };
  } catch (err) {
    return {
      success: false,
      importedCount: 0,
      error: `Failed to parse backup JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Clears review state for the given dataset.
 */
export function clearDatasetReviewState(datasetName: string): void {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(getStorageKey(datasetName));
    } catch (err) {
      console.warn("[OOS Data Quality] Failed to clear review state:", err);
    }
  }
}

