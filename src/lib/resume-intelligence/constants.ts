import { createHash } from "crypto";

export const RESUME_ANALYSIS_VERSION = "resume-review.v1";
export const RESUME_PARSER_VERSION = "extract.v1";

/** Max binary size accepted for extraction (10 MiB). */
export const RESUME_EXTRACT_MAX_BYTES = 10 * 1024 * 1024;

/** Max characters persisted from extracted text. */
export const RESUME_EXTRACT_MAX_CHARS = 200_000;

export const RESUME_LEASE_MS = 60_000;

export function sha256Hex(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function truncateExtractedText(text: string): {
  text: string;
  charCount: number;
  truncated: boolean;
} {
  if (text.length <= RESUME_EXTRACT_MAX_CHARS) {
    return { text, charCount: text.length, truncated: false };
  }
  return {
    text: text.slice(0, RESUME_EXTRACT_MAX_CHARS),
    charCount: RESUME_EXTRACT_MAX_CHARS,
    truncated: true,
  };
}

export function buildResumeReviewIdempotencyKey(input: {
  organizationId: string;
  candidateId: string;
  applicationId: string | null;
  candidateDocumentId: string;
  sourceDataVersion: string;
}): string {
  return sha256Hex(
    [
      input.organizationId,
      input.candidateId,
      input.applicationId ?? "none",
      input.candidateDocumentId,
      input.sourceDataVersion,
      RESUME_ANALYSIS_VERSION,
    ].join("|")
  ).slice(0, 191);
}

export type ResumeHumanStatus =
  | "NOT_STARTED"
  | "QUEUED"
  | "ANALYZING"
  | "READY"
  | "STALE"
  | "FAILED";

export function humanResumeStatusMessage(status: ResumeHumanStatus): string {
  switch (status) {
    case "NOT_STARTED":
      return "Resume review hasn't started yet.";
    case "QUEUED":
      return "Your resume is waiting to be reviewed.";
    case "ANALYZING":
      return "We're reviewing your resume.";
    case "READY":
      return "Resume review is ready.";
    case "STALE":
      return "This review may be out of date.";
    case "FAILED":
      return "We couldn't complete the review.";
  }
}
