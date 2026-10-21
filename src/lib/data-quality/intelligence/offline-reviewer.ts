/**
 * Offline AI Reviewer Module
 *
 * Enforces frozen AI policy:
 * - AI_MODE=offline
 * - Zero network calls to NVIDIA, DeepSeek, or external endpoints.
 * - No API key required.
 * - Ambiguous cases deterministically assigned "needs_review".
 */

import type {
  AiReviewAssessment,
  DuplicateCandidateFinding,
  GeographyFinding,
  NormalizedJobRecord,
} from "../types";

export interface OfflineReviewerOptions {
  aiMode?: "offline";
}

/**
 * Deterministically evaluates whether a record requires human review
 * without making any external AI network calls.
 */
export function evaluateAiReviewOffline(
  _record: NormalizedJobRecord,
  duplicateFinding: DuplicateCandidateFinding,
  geographyFinding: GeographyFinding
): AiReviewAssessment {
  // Check for ambiguous conditions that require human attention
  const reasons: string[] = [];

  if (geographyFinding.status === "ambiguous") {
    reasons.push("Ambiguous geographic location requires manual verification.");
  }

  if (duplicateFinding.reasonCode === "SIMILAR_ROLE_DISTINCT_REQUISITION") {
    reasons.push(
      "Same title and employer across distinct requisitions requires verification of operational independence."
    );
  }

  if (reasons.length > 0) {
    return {
      used: false,
      status: "needs_review",
      reason: `Offline policy: ${reasons.join(" ")}`,
    };
  }

  return {
    used: false,
    status: "not_needed",
    reason: "Deterministic quality rules resolved record status without ambiguity.",
  };
}
