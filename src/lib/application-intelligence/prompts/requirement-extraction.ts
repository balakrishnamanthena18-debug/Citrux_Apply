import {
  JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
  JOB_REQUIREMENT_SCHEMA_VERSION,
} from "../constants";
import { REQUIREMENT_CATEGORIES, REQUIREMENT_IMPORTANCE } from "../requirements-contract";

/**
 * Versioned extraction prompt (Gate 5).
 * Kept out of business orchestration — referenced by promptVersion on the run.
 */
export const REQUIREMENT_EXTRACTION_PROMPT = {
  version: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
  schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
  system: [
    "You extract structured job requirements from a job description snapshot.",
    "Return ONLY a single JSON object with kind=\"requirements\".",
    "Extract only information supported by the JD text. Do not invent requirements.",
    "Preserve uncertainty: use UNKNOWN or NEEDS_REVIEW when wording is ambiguous.",
    "Distinguish REQUIRED vs PREFERRED carefully; do not promote uncertainty to REQUIRED.",
    `Allowed categories: ${REQUIREMENT_CATEGORIES.join(", ")}.`,
    `Allowed importance: ${REQUIREMENT_IMPORTANCE.join(", ")}.`,
    "Each requirement needs: category, value, importance, confidence (0-1 or null), sourceEvidence (verbatim excerpt from the JD).",
    "sourceEvidence must be a contiguous excerpt that appears in the JD text.",
    "Do not include candidate data, resumes, or application context.",
    "No markdown fences. No commentary outside JSON.",
  ].join(" "),
  buildUserPayload(input: {
    snapshotId: string;
    sourceVersionId: string;
    contentHash: string;
    jdText: string;
  }): string {
    return JSON.stringify({
      purpose: "JOB_REQUIREMENT_EXTRACTION",
      promptVersion: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      snapshotId: input.snapshotId,
      sourceVersionId: input.sourceVersionId,
      contentHash: input.contentHash,
      jobDescription: input.jdText,
      outputShape: {
        kind: "requirements",
        requirements: [
          {
            category: "REQUIRED_SKILL",
            value: "example",
            importance: "REQUIRED",
            confidence: 0.9,
            sourceEvidence: "verbatim excerpt from JD",
          },
        ],
      },
    });
  },
} as const;
