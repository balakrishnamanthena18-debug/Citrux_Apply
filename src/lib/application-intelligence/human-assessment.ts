/**
 * Presentation-only human language layer for Application Assessment.
 * Does NOT change persisted enums, scoring, readiness, or evidence contracts.
 */

import type { FitStatus, ReadinessState } from "./constants";
import type {
  ApplicationIntelligenceViewModel,
  IntelligenceFitItemView,
  IntelligenceIssueView,
  IntelligenceNextActionView,
  IntelligenceUiPhase,
} from "./presentation";

export const CANDIDATE_ASSESSMENT_HEADING = "Application Assessment";
export const CANDIDATE_ASSESSMENT_SUBTITLE =
  "How well your profile matches this job";

export const CANDIDATE_ADVISORY_DISCLAIMER =
  "Your assessment is a guide, not an approval decision. Your application still goes through the normal review, approval, and submission process.";

export const STAFF_ADVISORY_DISCLAIMER =
  "Your assessment is a guide, not an approval decision. Your application still goes through the normal review, approval, and submission process. Staff: treat fit and readiness as decision support — QA, approval, and submission remain separate authorities.";

/** Technical enums remain internal; these are display-only. */
export function humanReadinessLabel(
  state: ReadinessState | string | null | undefined
): string {
  switch (state) {
    case "READY":
      return "Strong match";
    case "READY_WITH_WARNINGS":
      return "Good match, with a few things to review";
    case "REVIEW_REQUIRED":
      return "Review needed before submitting";
    case "BLOCKED":
      return "Some important requirements need attention";
    case "UNKNOWN":
      return "We don't have enough information to assess this yet";
    default:
      return "Assessment unavailable";
  }
}

export function humanFitStatusLabel(status: FitStatus | string): string {
  switch (status) {
    case "MATCHED":
      return "You meet this requirement";
    case "PARTIAL":
      return "You partially meet this requirement";
    case "MISSING":
      return "We couldn't find this requirement in your profile";
    case "UNKNOWN":
      return "We couldn't determine this from the available information";
    default:
      return "Status unavailable";
  }
}

export function humanImportanceLabel(
  importance: IntelligenceFitItemView["importance"]
): string {
  switch (importance) {
    case "REQUIRED":
      return "Important for this role";
    case "PREFERRED":
      return "Optional";
    case "NEEDS_REVIEW":
      return "Needs review";
    default:
      return "Listed on the job";
  }
}

export function humanFreshnessLabel(phase: IntelligenceUiPhase): string {
  switch (phase) {
    case "CURRENT":
      return "Assessment current";
    case "STALE":
      return "Your assessment may be out of date";
    case "PENDING":
      return "Assessment in progress";
    case "FAILED":
      return "Assessment incomplete";
    default:
      return "Not assessed yet";
  }
}

export function humanPhaseMessaging(phase: IntelligenceUiPhase): {
  title: string;
  body: string;
} {
  switch (phase) {
    case "NOT_AVAILABLE":
      return {
        title: "Your application hasn't been assessed yet",
        body: "We don't have enough information to provide a match assessment for this application yet. This does not mean that you are a poor match.",
      };
    case "PENDING":
      return {
        title: "We're reviewing your profile against the job requirements",
        body: "Your assessment will appear here when it's ready.",
      };
    case "FAILED":
      return {
        title: "We couldn't complete the assessment right now",
        body: "Your application itself is not affected.",
      };
    case "STALE":
      return {
        title: "Your assessment may be out of date",
        body: "This assessment was created using an earlier version of your profile or the job description. An updated assessment may be needed. Your assessment is a guide, not an approval decision.",
      };
    case "CURRENT":
      return {
        title: CANDIDATE_ASSESSMENT_HEADING,
        body: "Your assessment is a guide, not an approval decision. Your application still goes through the normal review, approval, and submission process.",
      };
  }
}

function shortenRequirementTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 72) return trimmed;
  return `${trimmed.slice(0, 69).trimEnd()}…`;
}

function strengthLabel(item: IntelligenceFitItemView): string {
  const title = shortenRequirementTitle(item.requirementValue);
  if (item.candidateEvidenceSummary) {
    return title;
  }
  return title;
}

export function humanFitExplanation(item: IntelligenceFitItemView): string {
  const title = shortenRequirementTitle(item.requirementValue);
  const optional = item.importance === "PREFERRED";

  if (item.status === "MATCHED") {
    if (item.candidateEvidenceSummary) {
      return `Your profile shows relevant experience for ${title} (${item.candidateEvidenceSummary}).`;
    }
    return `Your profile appears to meet the ${title} requirement.`;
  }

  if (item.status === "PARTIAL") {
    const base = item.candidateEvidenceSummary
      ? `We found related information (${item.candidateEvidenceSummary}), but it may not fully cover ${title}.`
      : `You partially meet the ${title} requirement based on the information currently available.`;
    return optional
      ? `${base} This is listed as optional for this role.`
      : base;
  }

  if (item.status === "MISSING") {
    if (optional) {
      return `${title} is preferred for this role, but we couldn't find it in your current profile. This is an optional requirement, so it does not automatically prevent you from applying.`;
    }
    return `We couldn't find ${title} in your current profile.`;
  }

  // UNKNOWN
  if (optional) {
    return `We couldn't determine ${title} from the available information. This is listed as optional for this role.`;
  }
  return `We couldn't determine ${title} from the available information.`;
}

/** Body copy under an already-shown issue title (message). */
export function humanIssueExplanation(issue: IntelligenceIssueView): string {
  const why = issue.why?.trim() ?? "";
  const message = issue.message?.trim() ?? "";
  const explanation = issue.explanation?.trim() ?? "";
  // Prefer calm human copy; skip persisted explanations that embed rule/version jargon.
  const explanationLooksTechnical =
    /\[WARNING\]|\[BLOCKER\]|Rule:|READINESS\.|Resolution:/i.test(explanation);

  if (why && why !== message) return why;
  if (explanation && !explanationLooksTechnical && explanation !== message) {
    return explanation;
  }
  if (why) return why;
  return "Additional review is recommended.";
}

export function humanRecommendation(
  actions: IntelligenceNextActionView[]
): string | null {
  if (actions.length === 0) return null;
  const primary = actions[0]!.label.trim();
  // Soften engineering-ish labels without inventing new actions.
  const softened = primary
    .replace(/^Review preferred gaps before submit$/i, "Review optional gaps before you submit")
    .replace(/^Complete QA review$/i, "Complete the quality review step when it is available")
    .replace(/^Request candidate approval$/i, "Complete candidate approval when you are ready");
  return softened;
}

export function buildAssessmentSummary(view: ApplicationIntelligenceViewModel): {
  matchHeadline: string;
  summaryParagraph: string;
  whatThisMeans: string;
} {
  const readinessLabel = humanReadinessLabel(view.readinessState);
  const matchedRequired = view.fitItems.filter(
    (f) => f.importance === "REQUIRED" && f.status === "MATCHED"
  ).length;
  const reviewCount =
    view.fitItems.filter(
      (f) => f.status === "PARTIAL" || f.status === "MISSING"
    ).length + view.blockers.length;

  let summaryParagraph: string;
  switch (view.readinessState) {
    case "READY":
      summaryParagraph =
        "Your profile appears to be a strong match for this role based on the information currently available.";
      break;
    case "READY_WITH_WARNINGS":
      summaryParagraph =
        "You meet most of the key requirements for this role. We found a few areas worth reviewing before you submit.";
      break;
    case "REVIEW_REQUIRED":
      summaryParagraph =
        "Your profile shows relevant experience, but a few important areas should be reviewed before you submit.";
      break;
    case "BLOCKED":
      summaryParagraph =
        "Some important requirements need attention before this application can proceed.";
      break;
    case "UNKNOWN":
      summaryParagraph =
        "We don't have enough information yet to assess how well your profile matches this job.";
      break;
    default:
      summaryParagraph =
        "Your match assessment is based on the information currently available.";
  }

  let whatThisMeans: string;
  if (view.readinessState === "BLOCKED") {
    whatThisMeans =
      "There are important items to resolve before this application can move forward. Your assessment is a guide — it does not approve or submit the application.";
  } else if (reviewCount === 0 && matchedRequired > 0) {
    whatThisMeans =
      "You meet the important requirements we could check for this role. You can continue with this application through the normal review process.";
  } else if (view.readinessState === "READY_WITH_WARNINGS" || reviewCount > 0) {
    whatThisMeans = `You meet most of the important requirements for this role. There ${
      reviewCount === 1 ? "is one area" : `are ${reviewCount} areas`
    } worth reviewing before you submit.`;
  } else {
    whatThisMeans =
      "Use this assessment as a guide while you prepare your application. It does not replace the normal review, approval, and submission steps.";
  }

  return {
    matchHeadline: readinessLabel,
    summaryParagraph,
    whatThisMeans,
  };
}

export type AssessmentFindingsLine = {
  kind: "matched" | "partial" | "missing" | "unknown";
  text: string;
};

export function buildWhatWeFoundLines(
  view: ApplicationIntelligenceViewModel
): AssessmentFindingsLine[] {
  const lines: AssessmentFindingsLine[] = [];
  const { matched, partial, missing, unknown } = view.counts;
  if (matched > 0) {
    lines.push({
      kind: "matched",
      text:
        matched === 1
          ? "1 important area matches your experience"
          : `${matched} important areas match your experience`,
    });
  }
  if (partial > 0) {
    lines.push({
      kind: "partial",
      text:
        partial === 1
          ? "1 area is partially covered"
          : `${partial} areas are partially covered`,
    });
  }
  if (missing > 0) {
    lines.push({
      kind: "missing",
      text:
        missing === 1
          ? "1 area is not currently shown in your profile"
          : `${missing} areas are not currently shown in your profile`,
    });
  }
  if (unknown > 0) {
    lines.push({
      kind: "unknown",
      text:
        unknown === 1
          ? "1 area could not be determined from the available information"
          : `${unknown} areas could not be determined from the available information`,
    });
  }
  return lines;
}

export function selectStrengthItems(
  fitItems: IntelligenceFitItemView[],
  limit = 5
): IntelligenceFitItemView[] {
  return fitItems
    .filter((f) => f.status === "MATCHED")
    .sort((a, b) => {
      const rank = (i: IntelligenceFitItemView) =>
        i.importance === "REQUIRED" ? 0 : i.importance === "PREFERRED" ? 1 : 2;
      return rank(a) - rank(b);
    })
    .slice(0, limit);
}

export function selectReviewItems(
  fitItems: IntelligenceFitItemView[]
): IntelligenceFitItemView[] {
  return fitItems.filter(
    (f) =>
      f.status === "PARTIAL" ||
      f.status === "MISSING" ||
      f.status === "UNKNOWN"
  );
}

export function strengthDisplayLabel(item: IntelligenceFitItemView): string {
  return strengthLabel(item);
}

/** Candidate primary UI must not surface these engineering terms. */
export const CANDIDATE_PRIMARY_JARGON = [
  "persisted",
  "scoring contract",
  "scoring.v1",
  "alignment result",
  "requirement set",
  "source version",
  "analysis payload",
  "intelligence run",
  "evidence payload",
  "READY_WITH_WARNINGS",
  "NOT_AVAILABLE",
  "RECOMPUTE_REQUIRED",
] as const;

export function candidatePrimaryHtmlHasJargon(html: string): boolean {
  const primary = html.split(/Assessment details|View detailed assessment/i)[0] ?? html;
  const lower = primary.toLowerCase();
  return CANDIDATE_PRIMARY_JARGON.some((term) => lower.includes(term.toLowerCase()));
}
