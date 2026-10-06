import type { MatchCategory } from "./constants";
import type { MatchCategoryCounters, MatchItemResult } from "./types";

/**
 * matching.v1 category rules — deterministic, no weights, no percentages.
 * Preference mismatches never alone produce LOW_MATCH.
 */
export function countMatchCounters(items: MatchItemResult[]): MatchCategoryCounters {
  const counters: MatchCategoryCounters = {
    rMatch: 0,
    rPartial: 0,
    rMismatch: 0,
    rUnknown: 0,
    pMatch: 0,
    pMismatch: 0,
    prefMismatch: 0,
  };

  for (const item of items) {
    if (item.outcome === "NOT_APPLICABLE") continue;

    if (item.kind === "PREFERENCE") {
      if (item.outcome === "MISMATCH") counters.prefMismatch += 1;
      continue;
    }

    const isRequired = item.importance === "REQUIRED";
    const isPreferred = item.importance === "PREFERRED";

    if (isRequired) {
      if (item.outcome === "MATCH") counters.rMatch += 1;
      else if (item.outcome === "PARTIAL") counters.rPartial += 1;
      else if (item.outcome === "MISMATCH") counters.rMismatch += 1;
      else if (item.outcome === "UNKNOWN") counters.rUnknown += 1;
      continue;
    }

    if (isPreferred) {
      if (item.outcome === "MATCH") counters.pMatch += 1;
      else if (item.outcome === "MISMATCH") counters.pMismatch += 1;
      // preferred UNKNOWN does not demote
    }
    // STRUCTURED / UNKNOWN importance on qualification: treat UNKNOWN outcome
    // as required-unknown only when importance was elevated to REQUIRED by caller.
  }

  return counters;
}

export function categorizeMatch(input: {
  counters: MatchCategoryCounters;
  hasUsableRequirementSet: boolean;
  hasStructuredPreferenceSignal: boolean;
}): MatchCategory {
  const c = input.counters;

  if (!input.hasUsableRequirementSet && !input.hasStructuredPreferenceSignal) {
    return "NEEDS_REVIEW";
  }

  // LOW_MATCH
  if (c.rMismatch >= 2 || (c.rMismatch >= 1 && c.rMatch === 0)) {
    return "LOW_MATCH";
  }

  // No requirement set → cannot claim strong qualification alignment
  if (!input.hasUsableRequirementSet) {
    return "NEEDS_REVIEW";
  }

  // Material required unknowns → NEEDS_REVIEW
  if (c.rUnknown >= 1) {
    return "NEEDS_REVIEW";
  }

  const requiredTotal = c.rMatch + c.rPartial + c.rMismatch + c.rUnknown;

  // STRONG_MATCH
  if (c.rMismatch === 0 && c.rPartial === 0 && c.rUnknown === 0 && c.rMatch >= 1) {
    if (c.rMatch >= 2 || requiredTotal === 1) {
      return "STRONG_MATCH";
    }
    if (requiredTotal === c.rMatch) {
      return "STRONG_MATCH";
    }
  }

  // GOOD_MATCH
  if (
    c.rMismatch === 0 &&
    c.rUnknown === 0 &&
    c.rMatch >= 1 &&
    c.rPartial <= 2
  ) {
    return "GOOD_MATCH";
  }

  // POSSIBLE_MATCH
  if (c.rMatch >= 1 && (c.rMismatch === 1 || c.rPartial >= 1)) {
    return "POSSIBLE_MATCH";
  }

  return "NEEDS_REVIEW";
}
