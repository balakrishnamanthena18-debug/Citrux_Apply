/**
 * Geographic Validation Rules
 *
 * Distinguishes explicit foreign locations from misleading US place names
 * and upstream scraper metadata discrepancies.
 *
 * Rules:
 * - Do not infer that Indianapolis is in India (IN = Indiana).
 * - Do not infer that Minneapolis is in Mongolia (MN = Minnesota).
 * - Do not infer that Vancouver, Washington is in Canada (WA = Washington State).
 * - Report missing locations separately.
 * - Do not reject records on country-code mismatch alone.
 */

import type { GeographyFinding, NormalizedJobRecord } from "../types";

/** US 2-letter state abbreviations to state names. */
const US_STATE_CODES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga",
  "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
  "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
  "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
  "dc", "pr", "vi", "gu",
]);

/**
 * Validates the geography of a job record, returning a detailed assessment.
 */
export function validateGeography(record: NormalizedJobRecord): GeographyFinding {
  const rawLoc = record.rawLocation;
  const countries = record.rawCountries.map((c) => c.toLowerCase().trim());

  // 1. Missing Location Check
  if (!rawLoc || rawLoc.trim() === "" || rawLoc.trim().toLowerCase() === "null") {
    return {
      status: "missing_location",
      detectedCountry: null,
      rawLocation: rawLoc,
      rawCountryCodes: countries,
      isDiscrepancy: false,
      notes: "Location field is missing, null, or empty string.",
    };
  }

  const loc = rawLoc.toLowerCase().trim();

  // 2. Specific US Ambiguity Guards
  // Check "Vancouver, WA" vs "Vancouver, BC"
  if (loc.includes("vancouver")) {
    if (loc.includes("wa") || loc.includes("washington")) {
      return {
        status: "valid_us",
        detectedCountry: "USA",
        rawLocation: rawLoc,
        rawCountryCodes: countries,
        isDiscrepancy: false,
        notes: "Vancouver, Washington correctly identified as US domestic location.",
      };
    }
    if (loc.includes("bc") || loc.includes("british columbia") || loc.includes("canada")) {
      return {
        status: "explicit_foreign",
        detectedCountry: "Canada",
        rawLocation: rawLoc,
        rawCountryCodes: countries,
        isDiscrepancy: true,
        notes: "Explicit Canadian location: Vancouver, British Columbia, Canada.",
      };
    }
  }

  // Check "Indianapolis, IN" or "Indiana" (guard against India ISO code 'in')
  if (loc.includes("indianapolis") || loc.includes("indiana")) {
    const hasMisleadingIn = countries.includes("in");
    return {
      status: hasMisleadingIn ? "metadata_discrepancy" : "valid_us",
      detectedCountry: "USA",
      rawLocation: rawLoc,
      rawCountryCodes: countries,
      isDiscrepancy: hasMisleadingIn,
      notes: hasMisleadingIn
        ? "Indianapolis, Indiana correctly identified as US. Upstream scraper erroneously tagged ISO 'in' (India)."
        : "Indianapolis, Indiana correctly identified as US.",
    };
  }

  // Check "Minneapolis, MN" or "Minnesota" (guard against Mongolia ISO code 'mn')
  if (loc.includes("minneapolis") || loc.includes("minnesota")) {
    const hasMisleadingMn = countries.includes("mn");
    return {
      status: hasMisleadingMn ? "metadata_discrepancy" : "valid_us",
      detectedCountry: "USA",
      rawLocation: rawLoc,
      rawCountryCodes: countries,
      isDiscrepancy: hasMisleadingMn,
      notes: hasMisleadingMn
        ? "Minneapolis, Minnesota correctly identified as US. Upstream scraper erroneously tagged ISO 'mn' (Mongolia)."
        : "Minneapolis, Minnesota correctly identified as US.",
    };
  }

  // Check "Ontario, CA" (California) vs "Ontario, Canada"
  if (loc.includes("ontario")) {
    if (loc.includes("ca") || loc.includes("california")) {
      return {
        status: "valid_us",
        detectedCountry: "USA",
        rawLocation: rawLoc,
        rawCountryCodes: countries,
        isDiscrepancy: false,
        notes: "Ontario, California correctly identified as US domestic location.",
      };
    }
    if (loc.includes("canada") || loc.includes("toronto") || loc.includes("ottawa")) {
      return {
        status: "explicit_foreign",
        detectedCountry: "Canada",
        rawLocation: rawLoc,
        rawCountryCodes: countries,
        isDiscrepancy: true,
        notes: "Explicit Canadian location: Ontario, Canada.",
      };
    }
  }

  // 3. Explicit Foreign Locations Check
  // Check for explicit mention of non-US countries or provinces
  const explicitCanadianPatterns = [
    /\bcanada\b/i,
    /\btoronto\b/i,
    /\bmontreal\b/i,
    /\bquebec\b/i,
    /\balberta\b/i,
    /\bcalgary\b/i,
    /\bedmonton\b/i,
    /\bottawa\b/i,
    /\bhalifax\b/i,
    /\bwinnipeg\b/i,
  ];

  for (const pattern of explicitCanadianPatterns) {
    if (pattern.test(loc) || pattern.test(record.rawTitle)) {
      return {
        status: "explicit_foreign",
        detectedCountry: "Canada",
        rawLocation: rawLoc,
        rawCountryCodes: countries,
        isDiscrepancy: true,
        notes: `Explicit foreign location/title detected matching pattern: ${pattern.source}`,
      };
    }
  }

  const explicitOtherForeignPatterns: [RegExp, string][] = [
    [/\bunited kingdom\b/i, "United Kingdom"],
    [/\blondon,\s*(?:uk|england)\b/i, "United Kingdom"],
    [/\bgermany\b/i, "Germany"],
    [/\bfrance\b/i, "France"],
    [/\baustralia\b/i, "Australia"],
    [/\bmexico\b/i, "Mexico"],
    [/\bbrazil\b/i, "Brazil"],
    [/\b(mumbai|bangalore|bengaluru|delhi|hyderabad|chennai),\s*india\b/i, "India"],
  ];

  for (const [pattern, country] of explicitOtherForeignPatterns) {
    if (pattern.test(loc)) {
      return {
        status: "explicit_foreign",
        detectedCountry: country,
        rawLocation: rawLoc,
        rawCountryCodes: countries,
        isDiscrepancy: true,
        notes: `Explicit foreign location detected: ${country}.`,
      };
    }
  }

  // 4. Check for state abbreviation pattern e.g. "Dallas, TX", "Miami, FL", "Boston, MA"
  const stateMatch = loc.match(/(?:,\s*|\s+)([a-z]{2})(?:\s+|$|\b)/);
  if (stateMatch?.[1] && US_STATE_CODES.has(stateMatch[1])) {
    const matchedState = stateMatch[1];
    // Check if scraper tagged non-us country code matching the state abbreviation
    const foreignCodes = countries.filter((c) => c !== "us");
    if (foreignCodes.length > 0 && foreignCodes.includes(matchedState)) {
      return {
        status: "metadata_discrepancy",
        detectedCountry: "USA",
        rawLocation: rawLoc,
        rawCountryCodes: countries,
        isDiscrepancy: true,
        notes: `US state '${matchedState.toUpperCase()}' was misconstrued by upstream scraper as country code '${matchedState}'. Location is valid US.`,
      };
    }

    return {
      status: "valid_us",
      detectedCountry: "USA",
      rawLocation: rawLoc,
      rawCountryCodes: countries,
      isDiscrepancy: false,
      notes: `Verified US location with state code '${matchedState.toUpperCase()}'.`,
    };
  }

  // If countries contains 'us', treat as valid US unless contradicted
  if (countries.includes("us")) {
    return {
      status: "valid_us",
      detectedCountry: "USA",
      rawLocation: rawLoc,
      rawCountryCodes: countries,
      isDiscrepancy: false,
      notes: "US location tag present without contradictory foreign geographic indicators.",
    };
  }

  // 5. Inconclusive / Ambiguous
  return {
    status: "ambiguous",
    detectedCountry: null,
    rawLocation: rawLoc,
    rawCountryCodes: countries,
    isDiscrepancy: false,
    notes: "Geographic location text could not be deterministically confirmed as US or foreign.",
  };
}
