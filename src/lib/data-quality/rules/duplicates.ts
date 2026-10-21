/**
 * Deterministic Duplicate-Candidate Rules
 *
 * Enforces frozen decisions:
 * - DUPLICATE_MASTER_POLICY=none: Never select a master record, never merge, never delete.
 * - Do not treat matching title, company, and location alone as proof of duplication.
 * - Exact ATS canonical URL matches form high-confidence duplicate groups.
 * - Same-role distinct requisitions are recognized as distinct vacancies (not duplicates).
 */

import { createHash } from "crypto";
import type {
  DuplicateCandidateFinding,
  NormalizedJobRecord,
} from "../types";

function hashString(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

export function detectDuplicates(
  records: NormalizedJobRecord[]
): Map<string, DuplicateCandidateFinding> {
  const results = new Map<string, DuplicateCandidateFinding>();

  // 1. Group by exact ATS Canonical URL
  const urlGroups = new Map<string, NormalizedJobRecord[]>();
  for (const rec of records) {
    if (rec.canonicalUrl) {
      const list = urlGroups.get(rec.canonicalUrl) || [];
      list.push(rec);
      urlGroups.set(rec.canonicalUrl, list);
    }
  }

  // 2. Group by ATS Provider + Requisition ID (for multi-subdomain syndication e.g. hdr.taleo.net vs hdr_mobile)
  const reqGroups = new Map<string, NormalizedJobRecord[]>();
  for (const rec of records) {
    if (rec.ats.requisitionId && rec.ats.provider !== "generic") {
      const key = `${rec.ats.provider}::${rec.ats.requisitionId}`;
      const list = reqGroups.get(key) || [];
      list.push(rec);
      reqGroups.set(key, list);
    }
  }

  // 3. Group by Title + Company + Location (to detect similar distinct roles)
  const roleGroups = new Map<string, NormalizedJobRecord[]>();
  for (const rec of records) {
    if (rec.normalizedTitle && rec.normalizedCompany) {
      const key = `${rec.normalizedCompany}::${rec.normalizedTitle}::${rec.normalizedLocation}`;
      const list = roleGroups.get(key) || [];
      list.push(rec);
      roleGroups.set(key, list);
    }
  }

  for (const rec of records) {
    const urlMatches = urlGroups.get(rec.canonicalUrl) || [rec];
    const reqKey =
      rec.ats.requisitionId && rec.ats.provider !== "generic"
        ? `${rec.ats.provider}::${rec.ats.requisitionId}`
        : null;
    const reqMatches = reqKey ? reqGroups.get(reqKey) || [rec] : [rec];

    // Priority 1: Exact ATS canonical URL match across multiple records
    if (urlMatches.length > 1) {
      const allIds = urlMatches.map((r) => r.recordId);
      const groupId = `dup-url-${hashString(rec.canonicalUrl)}`;
      results.set(rec.recordId, {
        duplicateGroupId: groupId,
        isDuplicateCandidate: true,
        confidence: "high",
        reasonCode: "EXACT_ATS_CANONICAL_URL",
        evidence: `Exact ATS canonical URL match across ${urlMatches.length} records (${rec.canonicalUrl})`,
        candidateIdsInGroup: allIds,
        candidateCountInGroup: urlMatches.length,
      });
      continue;
    }

    // Priority 2: Same ATS Provider + Requisition ID across different subdomains / portals
    if (reqMatches.length > 1) {
      const allIds = reqMatches.map((r) => r.recordId);
      const groupId = `dup-req-${hashString(reqKey!)}`;
      results.set(rec.recordId, {
        duplicateGroupId: groupId,
        isDuplicateCandidate: true,
        confidence: "high",
        reasonCode: "SAME_ATS_REQUISITION_ID",
        evidence: `Same ATS requisition identifier (${rec.ats.requisitionId}) on provider ${rec.ats.provider} across ${reqMatches.length} records`,
        candidateIdsInGroup: allIds,
        candidateCountInGroup: reqMatches.length,
      });
      continue;
    }

    // Priority 3: Check Title + Company + Location collision
    const roleKey = `${rec.normalizedCompany}::${rec.normalizedTitle}::${rec.normalizedLocation}`;
    const roleMatches = roleGroups.get(roleKey) || [rec];

    if (roleMatches.length > 1) {
      // Different URLs / requisitions for the same role -> DISTINCT VACANCIES
      const distinctReqIds = new Set(
        roleMatches.map((r) => r.ats.requisitionId || r.canonicalUrl)
      );
      const allIds = roleMatches.map((r) => r.recordId);

      results.set(rec.recordId, {
        duplicateGroupId: `role-cluster-${hashString(roleKey)}`,
        isDuplicateCandidate: false, // NOT a duplicate!
        confidence: "distinct",
        reasonCode: "SIMILAR_ROLE_DISTINCT_REQUISITION",
        evidence: `Matching title and company but distinct ATS requisition identity (${rec.ats.requisitionId || rec.canonicalUrl}). Found ${distinctReqIds.size} distinct requisition(s) across ${roleMatches.length} postings.`,
        candidateIdsInGroup: allIds,
        candidateCountInGroup: roleMatches.length,
      });
      continue;
    }

    // Default: Completely unique record
    results.set(rec.recordId, {
      duplicateGroupId: null,
      isDuplicateCandidate: false,
      confidence: "distinct",
      reasonCode: "UNIQUE_RECORD",
      evidence: "Unique ATS URL, requisition identifier, and role specification.",
      candidateIdsInGroup: [rec.recordId],
      candidateCountInGroup: 1,
    });
  }

  return results;
}
