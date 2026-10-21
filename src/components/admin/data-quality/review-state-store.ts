/**
 * Client-Side Browser Storage Manager for Finding Reviews
 *
 * Enforces:
 * - Local-only browser storage (localStorage)
 * - Zero network or database transmission
 * - Deterministic fingerprint matching
 * - Safe error handling for corrupted storage or SSR
 */

import {
  computeFindingFingerprint,
  findingReviewEntrySchema,
  reviewStateBackupSchema,
  type FindingReviewEntry,
  type ReviewStateBackup,
  type ReviewStatus,
  type ValidatedJobFinding,
} from "@/lib/data-quality/dashboard-schema";

const STORAGE_PREFIX = "oos_dq_review_v1_";

function getStorageKey(datasetName: string): string {
  const sanitized = datasetName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${STORAGE_PREFIX}${sanitized}`;
}

export type ReviewStateMap = Record<string, FindingReviewEntry>;

/**
 * Loads all review entries for a specific dataset from localStorage.
 */
export function loadReviewState(datasetName: string): ReviewStateMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(getStorageKey(datasetName));
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    // Validate entries
    const validated: ReviewStateMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      const result = findingReviewEntrySchema.safeParse(val);
      if (result.success) {
        validated[key] = result.data;
      }
    }
    return validated;
  } catch (err) {
    console.warn("[OOS Data Quality] Failed to load local review state:", err);
    return {};
  }
}

export interface SaveReviewResult {
  success: boolean;
  reviews: ReviewStateMap;
  error?: string;
}

/**
 * Saves a review status update to localStorage.
 * Returns failure state if localStorage write fails (e.g. QuotaExceededError).
 */
export function saveReviewEntry(
  datasetName: string,
  finding: ValidatedJobFinding,
  status: ReviewStatus,
  notes?: string
): SaveReviewResult {
  const current = loadReviewState(datasetName);
  const fingerprint = computeFindingFingerprint(finding);

  const entry: FindingReviewEntry = {
    fingerprint,
    recordId: finding.recordId,
    status,
    notes: notes?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  const next = { ...current, [finding.recordId]: entry };

  if (typeof window !== "undefined") {
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
 * If fingerprint matches, returns saved status; otherwise defaults to "unreviewed".
 */
export function resolveFindingReviewStatus(
  reviews: ReviewStateMap,
  finding: ValidatedJobFinding
): { status: ReviewStatus; entry?: FindingReviewEntry; isStaleFingerprint: boolean } {
  const existing = reviews[finding.recordId];
  if (!existing) {
    return { status: "unreviewed", isStaleFingerprint: false };
  }

  const currentFp = computeFindingFingerprint(finding);
  if (existing.fingerprint !== currentFp) {
    // Finding content changed since it was reviewed!
    return { status: "unreviewed", entry: existing, isStaleFingerprint: true };
  }

  return { status: existing.status, entry: existing, isStaleFingerprint: false };
}

/**
 * Exports current dataset review state as downloadable JSON backup.
 */
export function exportReviewStateBackup(
  datasetName: string,
  reviews: ReviewStateMap
): string {
  const backup: ReviewStateBackup = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    datasetName,
    reviews,
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
 * Validates and imports a review state backup JSON string.
 * Requires explicit allowCrossDataset option if backup datasetName does not match target.
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

    // Merge incoming reviews
    let count = 0;
    for (const [recId, entry] of Object.entries(incoming)) {
      current[recId] = entry;
      count++;
    }

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          getStorageKey(datasetName),
          JSON.stringify(current)
        );
      } catch (err) {
        return {
          success: false,
          importedCount: 0,
          error: `Failed to write backup to local storage: ${err instanceof Error ? err.message : String(err)}`,
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
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(getStorageKey(datasetName));
    } catch (err) {
      console.warn("[OOS Data Quality] Failed to clear review state:", err);
    }
  }
}
