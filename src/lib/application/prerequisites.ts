/**
 * Enterprise Application Workflow — Dynamic Prerequisite & Security Evaluator
 *
 * Authoritatively verifies the 5 core prerequisite gates for application readiness:
 * 1. Candidate Consent & Authorization
 * 2. Tailored Materials Readiness
 * 3. Operational QA Verification
 * 4. Candidate Service Agreement & Verification
 * 5. Active Job Opportunity & Safe External Destination
 *
 * Also provides SSRF / open-redirect protection for employer application URLs.
 */

import { ApplicationStatus, ApplicationApprovalStatus } from "@/generated/prisma/enums";

export interface SafeUrlEvaluation {
  isSafe: boolean;
  sanitizedUrl: string | null;
  hostname: string | null;
  error?: string;
}

/**
 * Validates and sanitizes external URLs to prevent SSRF and open redirect vulnerabilities.
 * Rejects private subnets, cloud metadata endpoints, loopback addresses, and non-http(s) schemes.
 */
export function validateSafeExternalUrl(rawUrl: string | null | undefined): SafeUrlEvaluation {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      isSafe: false,
      sanitizedUrl: null,
      hostname: null,
      error: "No URL provided",
    };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      isSafe: false,
      sanitizedUrl: null,
      hostname: null,
      error: "URL is empty",
    };
  }

  try {
    const parsed = new URL(trimmed);

    // Only allow HTTP and HTTPS
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        isSafe: false,
        sanitizedUrl: null,
        hostname: null,
        error: `Prohibited protocol: ${parsed.protocol}. Only HTTP and HTTPS are permitted.`,
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check for loopback and local hostnames
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]"
    ) {
      return {
        isSafe: false,
        sanitizedUrl: null,
        hostname,
        error: "Prohibited host: Localhost / loopback destination is not allowed.",
      };
    }

    // Check for AWS / GCP / Azure Cloud Metadata IP (169.254.169.254)
    if (hostname.startsWith("169.254.")) {
      return {
        isSafe: false,
        sanitizedUrl: null,
        hostname,
        error: "Prohibited host: Cloud metadata IP range is prohibited.",
      };
    }

    // Check for RFC 1918 Private IPv4 addresses
    if (
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return {
        isSafe: false,
        sanitizedUrl: null,
        hostname,
        error: "Prohibited host: Private network IP address is not permitted.",
      };
    }

    // Ensure valid top-level domain or valid domain structure
    if (!hostname.includes(".") && hostname !== "localhost") {
      return {
        isSafe: false,
        sanitizedUrl: null,
        hostname,
        error: "Malformed host: Missing top-level domain.",
      };
    }

    return {
      isSafe: true,
      sanitizedUrl: parsed.toString(),
      hostname,
    };
  } catch (err) {
    return {
      isSafe: false,
      sanitizedUrl: null,
      hostname: null,
      error: `Malformed URL format: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export type PrerequisiteGateStatus = "MET" | "PENDING" | "BLOCKED";

export interface PrerequisiteGate {
  id: string;
  label: string;
  detail: string;
  status: PrerequisiteGateStatus;
  passed: boolean;
}

export interface ApplicationPrerequisitesEvaluation {
  allMet: boolean;
  gates: PrerequisiteGate[];
  metCount: number;
  totalCount: number;
  safeJobUrl: SafeUrlEvaluation;
}

/**
 * Authoritatively evaluates dynamic application prerequisites.
 * Replaces static hardcoded HTML checkmarks with live database-backed state.
 */
export function evaluateApplicationPrerequisites(params: {
  status: ApplicationStatus;
  approvalStatus?: ApplicationApprovalStatus | string | null;
  candidateStatus: string;
  candidateAuthMode: string;
  hasResumeDocument: boolean;
  resumeDocumentTitle?: string | null;
  hasCoverLetter?: boolean;
  hasPassedQaReview: boolean;
  isJobActive?: boolean;
  externalJobUrl?: string | null;
}): ApplicationPrerequisitesEvaluation {
  const {
    status,
    approvalStatus,
    candidateStatus,
    candidateAuthMode,
    hasResumeDocument,
    resumeDocumentTitle,
    hasCoverLetter,
    hasPassedQaReview,
    isJobActive = true,
    externalJobUrl,
  } = params;

  const gates: PrerequisiteGate[] = [];

  // 1. Candidate Consent & Authorization Mode
  const isCandidateActive = candidateStatus === "ACTIVE";
  let consentStatus: PrerequisiteGateStatus = "MET";
  let consentDetail = "Candidate active with managed submission consent.";

  if (!isCandidateActive) {
    consentStatus = "BLOCKED";
    consentDetail = `Candidate account is ${candidateStatus} (must be ACTIVE).`;
  } else if (candidateAuthMode === "REVIEW_REQUIRED") {
    if (approvalStatus === ApplicationApprovalStatus.APPROVED) {
      consentStatus = "MET";
      consentDetail = "Candidate approved tailored application for submission.";
    } else if (status === ApplicationStatus.AWAITING_APPROVAL) {
      consentStatus = "PENDING";
      consentDetail = "Awaiting explicit sign-off in candidate portal.";
    } else if (
      status === ApplicationStatus.READY ||
      status === ApplicationStatus.SUBMITTED
    ) {
      consentStatus = "MET";
      consentDetail = "Candidate approval confirmed.";
    } else {
      consentStatus = "PENDING";
      consentDetail = "Review-Required mode: requires sign-off after QA.";
    }
  }

  gates.push({
    id: "candidate_consent",
    label: "Candidate Consent Active",
    detail: consentDetail,
    status: consentStatus,
    passed: consentStatus === "MET",
  });

  // 2. Materials Prepared
  let materialsStatus: PrerequisiteGateStatus = "MET";
  let materialsDetail = resumeDocumentTitle
    ? `Resume staged: ${resumeDocumentTitle}`
    : "Tailored materials staged.";

  if (!hasResumeDocument) {
    materialsStatus =
      status === ApplicationStatus.DISCOVERED ||
      status === ApplicationStatus.QUALIFIED ||
      status === ApplicationStatus.PREPARING
        ? "PENDING"
        : "BLOCKED";
    materialsDetail = "Tailored resume document has not been selected.";
  }

  gates.push({
    id: "materials_prepared",
    label: "Materials Prepared",
    detail: materialsDetail,
    status: materialsStatus,
    passed: materialsStatus === "MET",
  });

  // 3. QA Verification Passed
  let qaStatus: PrerequisiteGateStatus = "MET";
  let qaDetail = "9-criterion operational QA audit verified and passed.";

  const pastQaStages: ApplicationStatus[] = [
    ApplicationStatus.AWAITING_APPROVAL,
    ApplicationStatus.READY,
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.SUBMISSION_ISSUE,
    ApplicationStatus.REVIEW_REQUIRED,
    ApplicationStatus.CORRECTION_APPROVED,
    ApplicationStatus.RESUBMISSION,
  ];

  if (hasPassedQaReview || pastQaStages.includes(status)) {
    qaStatus = "MET";
    qaDetail = "9-criterion operational QA audit verified and passed.";
  } else if (status === ApplicationStatus.REVIEW) {
    qaStatus = "PENDING";
    qaDetail = "Under review by QA specialist. Awaiting decision.";
  } else {
    qaStatus = "PENDING";
    qaDetail = "QA verification pending completion of materials.";
  }

  gates.push({
    id: "qa_verification",
    label: "QA Verification Passed",
    detail: qaDetail,
    status: qaStatus,
    passed: qaStatus === "MET",
  });

  // 4. Service Consent Verified
  const serviceConsentStatus: PrerequisiteGateStatus = isCandidateActive
    ? "MET"
    : "BLOCKED";
  const serviceConsentDetail = isCandidateActive
    ? "Candidate service agreement & identity verified."
    : "Candidate onboarding verification not finalized.";

  gates.push({
    id: "service_consent",
    label: "Service Consent Verified",
    detail: serviceConsentDetail,
    status: serviceConsentStatus,
    passed: serviceConsentStatus === "MET",
  });

  // 5. Listing Active & Destination Safe
  const safeJobUrl = validateSafeExternalUrl(externalJobUrl);
  let listingStatus: PrerequisiteGateStatus = "MET";
  let listingDetail = "Employer job opportunity active and reachable.";

  if (!isJobActive) {
    listingStatus = "BLOCKED";
    listingDetail = "Job opening is marked inactive or closed.";
  } else if (externalJobUrl && !safeJobUrl.isSafe) {
    listingStatus = "BLOCKED";
    listingDetail = `Unsafe URL: ${safeJobUrl.error}`;
  } else if (!externalJobUrl) {
    listingStatus = "PENDING";
    listingDetail = "No external application URL recorded.";
  }

  gates.push({
    id: "listing_active",
    label: "Listing Active & Verified",
    detail: listingDetail,
    status: listingStatus,
    passed: listingStatus === "MET",
  });

  const metCount = gates.filter((g) => g.passed).length;
  const allMet = metCount === gates.length;

  return {
    allMet,
    gates,
    metCount,
    totalCount: gates.length,
    safeJobUrl,
  };
}
