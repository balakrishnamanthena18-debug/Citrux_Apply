/**
 * OOS Data Quality & Intelligence — Benchmark-to-Rule Adapter
 *
 * Implements a pure, deterministic adapter bridging BenchmarkRecord fixtures
 * with Phase 1 data quality rule interfaces.
 *
 * Interface Gap Documentation:
 * - BenchmarkRecord stores ground-truth metadata, evaluated labels, and verified
 *   telemetry for testing, with property names matching benchmark contracts
 *   (`benchmarkId`, `rawLocation`, `rawCountryCodes`, `atsProvider`, etc.).
 * - Phase 1 rules (detectDuplicates, validateGeography, evaluateFreshness) expect
 *   NormalizedJobRecord with ATS metadata (`ats: AtsIdentifierInfo`), normalized
 *   strings (`normalizedTitle`, `normalizedCompany`, `normalizedLocation`), and
 *   audit IDs (`recordId`).
 * - This adapter bridges the gap by projecting BenchmarkRecord into a complete,
 *   type-safe NormalizedJobRecord using canonical normalization helpers, without
 *   mutating source records or modifying Phase 1 production behavior.
 */

import type { BenchmarkRecord } from "./benchmark-schema";
import {
  canonicalizeAtsUrl,
  normalizeCompany,
  normalizeLocation,
  normalizeTitle,
} from "./normalizer";
import type { NormalizedJobRecord } from "./types";

/**
 * Pure adapter converting a BenchmarkRecord into NormalizedJobRecord.
 *
 * @param record The ground-truth benchmark record
 * @param index Optional array index for sequential fallback ID
 * @returns Standardized NormalizedJobRecord ready for Phase 1 rules
 */
export function adaptBenchmarkToNormalizedRecord(
  record: BenchmarkRecord,
  index = 0
): NormalizedJobRecord {
  // Canonicalize the raw URL using Phase 1 ATS logic to reconstruct complete AtsIdentifierInfo
  const ats = canonicalizeAtsUrl(record.rawUrl || "");

  // Use benchmarkId as the primary unique recordId for deterministic mapping
  const recordId = record.benchmarkId || record.sourceRecordId || `benchmark-${index + 1}`;

  return {
    recordId,
    publicSlug: record.benchmarkId,
    source: record.atsProvider || ats.provider,
    externalId: record.sourceRecordId,
    rawUrl: record.rawUrl,
    canonicalUrl: record.canonicalUrl || ats.canonicalUrl,
    ats: {
      provider: record.atsProvider || ats.provider,
      requisitionId: record.requisitionId ?? ats.requisitionId,
      trackingParametersRemoved: ats.trackingParametersRemoved,
      canonicalUrl: record.canonicalUrl || ats.canonicalUrl,
      isAtsUrl: record.atsProvider !== "generic" && record.atsProvider !== "unknown" && ats.isAtsUrl,
    },
    rawTitle: record.title,
    normalizedTitle: normalizeTitle(record.title || ""),
    rawCompany: record.company,
    normalizedCompany: normalizeCompany(record.company || ""),
    rawLocation: record.rawLocation,
    normalizedLocation: normalizeLocation(record.rawLocation ?? ""),
    descriptionSnippet: "",
    postedAt: record.postedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSeenAt: null,
    rawCountries: record.rawCountryCodes || [],
    rawRealityAgeDays: null,
  };
}
