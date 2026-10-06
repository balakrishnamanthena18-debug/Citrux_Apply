/**
 * Phase 5I — Submission evidence contract.
 *
 * Accept non-empty storagePath OR non-empty confirmationEvidence (after trim).
 */

import { ValidationError } from "@/lib/errors";

export const SUBMISSION_EVIDENCE_REQUIRED_MESSAGE =
  "Add submission evidence or confirmation before recording submission.";

export type NormalizedSubmissionEvidence = {
  confirmationEvidence: string | null;
  storagePath: string | null;
};

export function hasSubmissionEvidence(input: {
  confirmationEvidence?: string | null;
  storagePath?: string | null;
}): boolean {
  const evidence = (input.confirmationEvidence ?? "").trim();
  const path = (input.storagePath ?? "").trim();
  return evidence.length > 0 || path.length > 0;
}

/**
 * Normalize and require at least one evidence form. Does not log contents.
 */
export function assertSubmissionEvidence(input: {
  confirmationEvidence?: string | null;
  storagePath?: string | null;
}): NormalizedSubmissionEvidence {
  const confirmationEvidence = (input.confirmationEvidence ?? "").trim() || null;
  const storagePath = (input.storagePath ?? "").trim() || null;
  if (!confirmationEvidence && !storagePath) {
    throw new ValidationError(SUBMISSION_EVIDENCE_REQUIRED_MESSAGE);
  }
  return { confirmationEvidence, storagePath };
}
