/**
 * Global Job Discovery & Collection Engine — Deterministic Deduplication
 *
 * Implements multi-tier deduplication:
 * 1. Provider ID + External ID (Exact Primary Key collision)
 * 2. Exact ATS Canonical URL match (Syndicated multi-board postings)
 * 3. Content Fingerprint: SHA-256 hash of normalized (company + title + canonicalUrl/requisition)
 * 4. Distinguishes distinct vacancies with identical titles from real duplicates.
 */

import { createHash } from "crypto";
import { canonicalizeAtsUrl } from "@/lib/data-quality/normalizer";
import type { NormalizedDiscoveredJob } from "./types";

/** Compute stable deterministic content fingerprint */
export function computeContentFingerprint(job: {
  companyName: string;
  title: string;
  canonicalUrl: string;
  location?: string | null;
}): string {
  const normCompany = job.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normTitle = job.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normUrl = job.canonicalUrl.toLowerCase().trim();

  const raw = `${normCompany}::${normTitle}::${normUrl}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export interface DeduplicationAnalysisResult {
  isDuplicate: boolean;
  duplicateGroupId: string | null;
  duplicateReason: string | null;
  canonicalUrl: string;
  fingerprint: string;
}

/**
 * Evaluates a single job against an existing index or batch of jobs to detect duplicate candidates
 */
export function evaluateDeduplication(
  job: NormalizedDiscoveredJob,
  existingIndex: {
    byCanonicalUrl: Map<string, string>; // canonicalUrl -> duplicateGroupId or first job id
    byFingerprint: Map<string, string>; // fingerprint -> duplicateGroupId
    byProviderExtId: Set<string>; // `${providerId}::${externalId}`
  }
): DeduplicationAnalysisResult {
  const atsInfo = canonicalizeAtsUrl(job.externalUrl);
  const canonicalUrl = atsInfo.canonicalUrl || job.externalUrl;
  const fingerprint = computeContentFingerprint({
    companyName: job.normalizedCompany || job.companyName,
    title: job.normalizedTitle || job.title,
    canonicalUrl,
    location: job.city || job.country,
  });

  const providerKey = `${job.providerId}::${job.externalId}`;

  // Priority 1: Exact Provider + External ID
  if (existingIndex.byProviderExtId.has(providerKey)) {
    return {
      isDuplicate: true,
      duplicateGroupId: `dup-id-${createHash("sha256").update(providerKey).digest("hex").slice(0, 16)}`,
      duplicateReason: "EXACT_PROVIDER_EXTERNAL_ID_COLLISION",
      canonicalUrl,
      fingerprint,
    };
  }

  // Priority 2: Exact ATS Canonical URL Match across feeds
  if (canonicalUrl && existingIndex.byCanonicalUrl.has(canonicalUrl)) {
    const existingGroupId = existingIndex.byCanonicalUrl.get(canonicalUrl)!;
    return {
      isDuplicate: true,
      duplicateGroupId: existingGroupId,
      duplicateReason: "EXACT_ATS_CANONICAL_URL_MATCH",
      canonicalUrl,
      fingerprint,
    };
  }

  // Priority 3: Content Fingerprint Match
  if (existingIndex.byFingerprint.has(fingerprint)) {
    const existingGroupId = existingIndex.byFingerprint.get(fingerprint)!;
    return {
      isDuplicate: true,
      duplicateGroupId: existingGroupId,
      duplicateReason: "IDENTICAL_ROLE_COMPANY_FINGERPRINT",
      canonicalUrl,
      fingerprint,
    };
  }

  // Not duplicate
  return {
    isDuplicate: false,
    duplicateGroupId: null,
    duplicateReason: null,
    canonicalUrl,
    fingerprint,
  };
}
