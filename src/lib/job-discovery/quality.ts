/**
 * Global Job Discovery & Collection Engine — Quality & Verification Assessor
 *
 * Computes deterministic quality scores, verifies essential completeness,
 * detects in-text closure phrases, and assigns accurate verification statuses.
 */

import { JobVerificationStatus, JobStatus, type NormalizedDiscoveredJob } from "./types";

const CLOSED_PHRASES = [
  "job is no longer available",
  "position has been filled",
  "job posting has expired",
  "position is no longer available",
  "requisition is no longer available",
  "this job is closed",
  "applications are no longer being accepted",
];

export interface JobQualityAssessment {
  qualityScore: number;
  verificationStatus: JobVerificationStatus;
  availabilityStatus: JobStatus;
  flags: string[];
}

export function assessJobQuality(job: {
  title: string;
  companyName: string;
  externalUrl: string;
  jobDescription: string;
  postedAt?: Date | string | null;
  closingDate?: Date | string | null;
}): JobQualityAssessment {
  let score = 100;
  const flags: string[] = [];

  // 1. Title completeness
  if (!job.title || job.title.trim().length < 3) {
    score -= 30;
    flags.push("INCOMPLETE_OR_MISSING_TITLE");
  }

  // 2. Company completeness
  if (!job.companyName || job.companyName.trim().length < 2) {
    score -= 25;
    flags.push("INCOMPLETE_OR_MISSING_COMPANY");
  }

  // 3. Application URL validity
  if (!job.externalUrl || !job.externalUrl.startsWith("http")) {
    score -= 40;
    flags.push("INVALID_OR_MISSING_APPLICATION_URL");
  }

  // 4. Description depth
  const descLen = (job.jobDescription || "").trim().length;
  if (descLen < 50) {
    score -= 20;
    flags.push("SHORT_OR_EMPTY_DESCRIPTION");
  }

  // 5. Detect closure phrases in description
  const descLower = (job.jobDescription || "").toLowerCase();
  const hasClosure = CLOSED_PHRASES.some((phrase) => descLower.includes(phrase));
  if (hasClosure) {
    score -= 40;
    flags.push("CLOSURE_PHRASE_DETECTED");
  }

  // 6. Check closing date if present
  let isPastClosing = false;
  if (job.closingDate) {
    const closing = new Date(job.closingDate);
    if (!isNaN(closing.getTime()) && closing.getTime() < Date.now()) {
      isPastClosing = true;
      flags.push("PAST_CLOSING_DATE");
    }
  }

  // 7. Check staleness from posted date
  let isStale = false;
  if (job.postedAt) {
    const posted = new Date(job.postedAt);
    if (!isNaN(posted.getTime())) {
      const ageDays = (Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 90) {
        isStale = true;
        score -= 15;
        flags.push("POSTING_OLDER_THAN_90_DAYS");
      }
    }
  }

  const finalScore = Math.max(0, Math.min(100, score));

  // Determine verification & availability statuses
  let verificationStatus: JobVerificationStatus = "NEWLY_DISCOVERED";
  let availabilityStatus: JobStatus = "OPEN";

  if (hasClosure || isPastClosing) {
    verificationStatus = "CLOSED";
    availabilityStatus = "CLOSED";
  } else if (isStale) {
    verificationStatus = "STALE";
  } else if (finalScore >= 80 && job.externalUrl && job.title && job.companyName) {
    verificationStatus = "SOURCE_CONFIRMED";
  } else if (finalScore < 60) {
    verificationStatus = "NEEDS_VERIFICATION";
  }

  return {
    qualityScore: finalScore,
    verificationStatus,
    availabilityStatus,
    flags,
  };
}
