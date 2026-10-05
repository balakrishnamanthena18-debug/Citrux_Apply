import type { IntelligenceResultFreshness } from "@/generated/prisma";

export type StaleTrigger =
  | "JD_SNAPSHOT_CHANGED"
  | "CANDIDATE_PROFILE_CHANGED"
  | "EXPERIENCE_CHANGED"
  | "SKILLS_CHANGED"
  | "EDUCATION_CHANGED"
  | "CERTIFICATION_CHANGED"
  | "WORK_AUTHORIZATION_CHANGED"
  | "PREFERENCES_CHANGED"
  | "APPLICATION_MATERIAL_CHANGED"
  | "MANUAL_INVALIDATION";

/**
 * Stale / recompute contract.
 * Automatic recompute is NOT authorized in foundation — only marking freshness.
 */
export function freshnessAfterTrigger(
  trigger: StaleTrigger
): Extract<IntelligenceResultFreshness, "STALE" | "RECOMPUTE_REQUIRED"> {
  if (trigger === "MANUAL_INVALIDATION" || trigger === "JD_SNAPSHOT_CHANGED") {
    return "RECOMPUTE_REQUIRED";
  }
  return "STALE";
}

export function isPresentableAsCurrent(
  freshness: IntelligenceResultFreshness,
  runStatus: string
): boolean {
  return freshness === "CURRENT" && runStatus === "SUCCEEDED";
}

export function buildSourceDataVersion(parts: {
  snapshotContentHash: string;
  candidateUpdatedAt: string | Date;
  materialsFingerprint: string;
}): string {
  const cand =
    parts.candidateUpdatedAt instanceof Date
      ? parts.candidateUpdatedAt.toISOString()
      : String(parts.candidateUpdatedAt);
  return `snap:${parts.snapshotContentHash.slice(0, 16)}|cand:${cand}|mat:${parts.materialsFingerprint}`;
}
