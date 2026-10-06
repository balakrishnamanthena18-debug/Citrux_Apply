/**
 * Phase 5C.2 — pure UI helpers for detail qualification grouping.
 * Client-safe (no prisma / auth).
 */

import type { CandidateSafeQualificationLine } from "./detail-types";
import { QUALIFICATION_DIMENSIONS } from "./constants";

const DIMENSION_LABELS: Record<string, string> = {
  SKILLS: "Skills",
  EXPERIENCE: "Experience",
  EDUCATION: "Education",
  CERTIFICATIONS: "Certifications",
  WORK_AUTHORIZATION: "Work authorization",
};

export function groupQualificationByDimension(
  lines: CandidateSafeQualificationLine[]
): Array<{
  dimension: string;
  dimensionLabel: string;
  items: CandidateSafeQualificationLine[];
}> {
  const map = new Map<string, CandidateSafeQualificationLine[]>();
  for (const line of lines) {
    const list = map.get(line.dimension) ?? [];
    list.push(line);
    map.set(line.dimension, list);
  }
  const groups: Array<{
    dimension: string;
    dimensionLabel: string;
    items: CandidateSafeQualificationLine[];
  }> = [];
  for (const dim of QUALIFICATION_DIMENSIONS) {
    const items = map.get(dim);
    if (!items || items.length === 0) continue;
    groups.push({
      dimension: dim,
      dimensionLabel: DIMENSION_LABELS[dim] ?? dim,
      items,
    });
  }
  return groups;
}
