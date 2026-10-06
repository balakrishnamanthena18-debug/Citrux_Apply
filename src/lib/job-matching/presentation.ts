import {
  MATCH_CATEGORY_LABELS,
  type MatchCategory,
} from "./constants";
import type { MatchItemResult, MatchPresentation } from "./types";

/**
 * Builds candidate-facing explanation copy from evaluated items.
 * Preference language never claims qualification failure.
 */
export function buildMatchPresentation(input: {
  category: MatchCategory;
  items: MatchItemResult[];
  jobTitle: string;
}): MatchPresentation {
  const strengths: MatchPresentation["strengths"] = [];
  const thingsToCheck: MatchPresentation["thingsToCheck"] = [];
  const preferences: MatchPresentation["preferences"] = [];

  const matchedSkills = input.items.filter(
    (i) =>
      i.kind === "QUALIFICATION" &&
      i.dimension === "SKILLS" &&
      (i.outcome === "MATCH" || i.outcome === "PARTIAL")
  );

  for (const item of input.items) {
    if (item.kind === "QUALIFICATION") {
      if (item.outcome === "MATCH") {
        strengths.push({
          title: item.label,
          message: `Your profile supports “${item.label}”.`,
        });
      } else if (item.outcome === "PARTIAL") {
        thingsToCheck.push({
          title: item.label,
          message: `“${item.label}” appears only partially supported in your current profile.`,
        });
      } else if (item.outcome === "MISMATCH") {
        if (item.importance === "PREFERRED") {
          thingsToCheck.push({
            title: item.label,
            message: `${item.label} is preferred for this role, but we couldn't find it in your current profile.`,
          });
        } else if (item.importance === "REQUIRED") {
          thingsToCheck.push({
            title: item.label,
            message: `The role requires “${item.label}”, and it is not currently supported by your profile.`,
          });
        }
      } else if (item.outcome === "UNKNOWN" && item.importance === "REQUIRED") {
        thingsToCheck.push({
          title: item.label,
          message: `We don't have enough information to confirm “${item.label}”.`,
        });
      }
      continue;
    }

    // Preferences
    if (item.dimension === "REMOTE_PREFERENCE") {
      if (item.outcome === "MATCH") {
        preferences.push({
          title: "Work arrangement",
          message: "Work arrangement matches your preference.",
          tone: "ok",
        });
      } else if (item.outcome === "MISMATCH") {
        preferences.push({
          title: "Work arrangement",
          message: "Work arrangement may not match your preference.",
          tone: "warn",
        });
      } else if (item.outcome === "UNKNOWN") {
        preferences.push({
          title: "Work arrangement",
          message: "We don't have enough information about work arrangement fit.",
          tone: "info",
        });
      }
    } else if (item.dimension === "SALARY") {
      if (item.outcome === "MATCH") {
        preferences.push({
          title: "Compensation",
          message: "The listed salary appears compatible with your target.",
          tone: "ok",
        });
      } else if (item.outcome === "MISMATCH") {
        preferences.push({
          title: "Compensation",
          message: "The listed salary may be below your stated target.",
          tone: "warn",
        });
      } else if (item.outcome === "UNKNOWN") {
        preferences.push({
          title: "Compensation",
          message: "We don't have enough salary information to compare.",
          tone: "info",
        });
      }
    } else if (item.dimension === "LOCATION") {
      if (item.outcome === "MATCH") {
        preferences.push({
          title: "Location",
          message: "Location appears compatible with your preferences.",
          tone: "ok",
        });
      } else if (item.outcome === "MISMATCH") {
        preferences.push({
          title: "Location",
          message: "Location may not match your stated preferences.",
          tone: "warn",
        });
      } else if (item.outcome === "UNKNOWN") {
        preferences.push({
          title: "Location",
          message: "We don't have enough location information to compare.",
          tone: "info",
        });
      }
    }
  }

  const skillNames = matchedSkills.slice(0, 3).map((s) => s.label);
  let why: string;
  if (skillNames.length >= 2) {
    why = `Your experience with ${skillNames.slice(0, -1).join(", ")} and ${skillNames[skillNames.length - 1]} aligns with several important requirements for this role.`;
  } else if (skillNames.length === 1) {
    why = `Your experience with ${skillNames[0]} aligns with an important requirement for this role.`;
  } else if (strengths.length > 0) {
    why = `Based on the information available, aspects of your profile appear relevant to “${input.jobTitle}”.`;
  } else {
    why =
      "Based on the information available, this role needs a closer look before deciding.";
  }

  return {
    why,
    strengths: strengths.slice(0, 6),
    thingsToCheck: thingsToCheck.slice(0, 8),
    preferences,
    categoryLabel: MATCH_CATEGORY_LABELS[input.category],
  };
}
