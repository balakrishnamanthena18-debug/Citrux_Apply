/**
 * ATS-Aware URL and Requisition Identity Normalization
 *
 * Preserves functional ATS requisition identifiers while safely stripping
 * marketing and tracking parameters.
 */

import type {
  AtsIdentifierInfo,
  FreeHireRawJobRecord,
  NormalizedJobRecord,
} from "./types";

/** Known tracking-only query parameters that are safe to remove. */
const TRACKING_PARAM_NAMES = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
  "src",
  "lang",
  "language",
  "locale",
  "fbclid",
  "gclid",
  "msclkid",
  "twclid",
  "igshid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
]);

/** Functional parameters that MUST NOT be removed because they define requisition identity. */
const FUNCTIONAL_PARAM_NAMES = new Set([
  "job",
  "opportunityid",
  "showjob",
  "gh_jid",
  "jobid",
  "requisitionid",
  "req_id",
  "id",
]);

/**
 * Normalizes an ATS URL, preserving functional requisition identifiers
 * and stripping only known tracking parameters.
 */
export function canonicalizeAtsUrl(rawUrl: string): AtsIdentifierInfo {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    return {
      provider: "unknown",
      requisitionId: null,
      trackingParametersRemoved: [],
      canonicalUrl: "",
      isAtsUrl: false,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // If not a parseable URL, return trimmed as canonical
    return {
      provider: "invalid_url",
      requisitionId: null,
      trackingParametersRemoved: [],
      canonicalUrl: trimmed,
      isAtsUrl: false,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;
  let provider = "generic";
  let isAts = false;
  let requisitionId: string | null = null;

  // Detect ATS Provider and Requisition ID from URL structure
  if (hostname.includes("taleo.net")) {
    provider = "taleo";
    isAts = true;
    const jobParam = parsed.searchParams.get("job");
    if (jobParam) {
      requisitionId = jobParam.trim();
    }
  } else if (
    hostname.includes("ultipro.com") ||
    hostname.includes("rec.pro.ukg.net")
  ) {
    provider = "ukg_pro";
    isAts = true;
    const oppParam = parsed.searchParams.get("opportunityId");
    if (oppParam) {
      requisitionId = oppParam.trim();
    }
  } else if (hostname.includes("ukgready") || parsed.searchParams.has("ShowJob")) {
    provider = "ukg_ready";
    isAts = true;
    const showJob = parsed.searchParams.get("ShowJob");
    if (showJob) {
      requisitionId = showJob.trim();
    }
  } else if (
    hostname.includes("greenhouse.io") ||
    hostname.includes("boards.greenhouse.io")
  ) {
    provider = "greenhouse";
    isAts = true;
    const ghJid = parsed.searchParams.get("gh_jid");
    if (ghJid) {
      requisitionId = ghJid.trim();
    } else {
      const match = pathname.match(/\/jobs\/(\d+)/i);
      if (match?.[1]) {
        requisitionId = match[1];
      }
    }
  } else if (hostname.includes("lever.co")) {
    provider = "lever";
    isAts = true;
    // Lever URLs: /company/<posting-uuid>
    const match = pathname.match(
      /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (match?.[1]) {
      requisitionId = match[1];
    }
  } else if (hostname.includes("smartrecruiters.com")) {
    provider = "smartrecruiters";
    isAts = true;
    // SmartRecruiters: /Company/<numericId>-slug
    const match = pathname.match(/\/(\d{10,25})/);
    if (match?.[1]) {
      requisitionId = match[1];
    }
  } else if (
    hostname.includes("myworkdayjobs.com") ||
    hostname.includes("workday.com")
  ) {
    provider = "workday";
    isAts = true;
    const afterJob = pathname.split(/\/job\//i)[1];
    if (afterJob) {
      const segments = afterJob.split("/").filter(Boolean);
      requisitionId = segments[segments.length - 1] ?? null;
    } else {
      const jobId = parsed.searchParams.get("jobId");
      if (jobId) requisitionId = jobId.trim();
    }
  } else if (hostname.includes("pinpointhq.com")) {
    provider = "pinpoint";
    isAts = true;
    const match = pathname.match(
      /\/postings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (match?.[1]) {
      requisitionId = match[1];
    }
  } else if (hostname.includes("hireology.com")) {
    provider = "hireology";
    isAts = true;
    const match = pathname.match(/\/careers\/[^\/]+\/([A-Za-z0-9_-]+)/i);
    if (match?.[1]) {
      requisitionId = match[1];
    }
  } else if (hostname.includes("breezy.hr")) {
    provider = "breezy";
    isAts = true;
    // Breezy: /p/<slug-or-id>
    const match = pathname.match(/\/p\/([a-zA-Z0-9]+)/i);
    if (match?.[1]) {
      requisitionId = match[1];
    }
  }

  // Filter query parameters: strip tracking parameters, KEEP functional ones
  const trackingRemoved: string[] = [];
  const retainedParams = new URLSearchParams();

  // Iterate over all query parameters
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (TRACKING_PARAM_NAMES.has(lowerKey)) {
      trackingRemoved.push(key);
    } else {
      retainedParams.append(key, value);
    }
  }

  // Sort retained parameters deterministically for consistent URL hashing
  retainedParams.sort();

  // Rebuild canonical URL
  const searchString = retainedParams.toString();
  // Strip trailing slash unless root path
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  const canonicalUrl = `${parsed.protocol}//${hostname}${normalizedPath}${
    searchString ? `?${searchString}` : ""
  }`;

  return {
    provider,
    requisitionId,
    trackingParametersRemoved: trackingRemoved,
    canonicalUrl,
    isAtsUrl: isAts,
  };
}

/**
 * Normalizes title text for matching comparisons:
 * - Trims whitespace and collapses multiple spaces
 * - Lowercases for case-insensitive matching
 * - Cleans up formatting artifacts
 */
export function normalizeTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  return rawTitle
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\\:/g, ":")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Normalizes company name:
 * - Collapses spaces, trims, and lowercases
 */
export function normalizeCompany(rawCompany?: string): string {
  if (!rawCompany) return "";
  return rawCompany
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Normalizes location string:
 * - Collapses spaces, trims, and lowercases
 */
export function normalizeLocation(rawLocation?: string | null): string {
  if (!rawLocation) return "";
  return rawLocation
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Normalizes a raw FreeHire job record into the standardized audit format.
 */
export function normalizeRecord(
  raw: FreeHireRawJobRecord,
  index: number
): NormalizedJobRecord {
  const ats = canonicalizeAtsUrl(raw.url || "");
  const recordId =
    raw.external_id || raw.public_slug || `record-${index + 1}`;

  return {
    recordId,
    publicSlug: raw.public_slug || "",
    source: raw.source || ats.provider,
    externalId: raw.external_id || "",
    rawUrl: raw.url || "",
    canonicalUrl: ats.canonicalUrl,
    ats,
    rawTitle: raw.title || "",
    normalizedTitle: normalizeTitle(raw.title || ""),
    rawCompany: raw.company || "",
    normalizedCompany: normalizeCompany(raw.company || ""),
    rawLocation: raw.location ?? null,
    normalizedLocation: normalizeLocation(raw.location ?? ""),
    descriptionSnippet: (raw.description || "").slice(0, 300),
    postedAt: raw.posted_at || null,
    createdAt: raw.created_at || null,
    updatedAt: raw.updated_at || null,
    lastSeenAt: raw.last_seen_at || null,
    rawCountries: Array.isArray(raw.countries) ? raw.countries : [],
    rawRealityAgeDays:
      typeof raw.reality?.age_days === "number" ? raw.reality.age_days : null,
  };
}
