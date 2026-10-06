/**
 * Phase 5B.2 — candidate-facing category presentation helpers.
 * Uses frozen matching.v1 labels. No numerical scores.
 */

import type { CandidateJobFeedCategory } from "@/lib/job-matching";

export type CategoryVisual = {
  label: string;
  shortHint: string;
  badgeClass: string;
  accentClass: string;
};

const CATEGORY_VISUALS: Record<CandidateJobFeedCategory, CategoryVisual> = {
  STRONG_MATCH: {
    label: "STRONG MATCH",
    shortHint: "Good fit for your background.",
    badgeClass:
      "border-[#BBF7D0] bg-[#ECFDF5] text-[#065F46]",
    accentClass: "text-[#047857]",
  },
  GOOD_MATCH: {
    label: "GOOD MATCH",
    shortHint: "Solid alignment with your profile.",
    badgeClass:
      "border-[#A7F3D0] bg-[#F0FDF4] text-[#166534]",
    accentClass: "text-[#15803D]",
  },
  POSSIBLE_MATCH: {
    label: "POSSIBLE MATCH",
    shortHint: "Worth a closer look.",
    badgeClass:
      "border-[#E2E8F0] bg-[#F8FAFC] text-[#334155]",
    accentClass: "text-[#475569]",
  },
  NEEDS_REVIEW: {
    label: "NEEDS REVIEW",
    shortHint: "Review carefully before deciding.",
    badgeClass:
      "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]",
    accentClass: "text-[#B45309]",
  },
};

export function getCategoryVisual(
  category: CandidateJobFeedCategory
): CategoryVisual {
  return CATEGORY_VISUALS[category];
}

export function formatEmploymentType(value: string): string {
  switch (value) {
    case "FULL_TIME":
      return "Full-time";
    case "PART_TIME":
      return "Part-time";
    case "CONTRACT":
      return "Contract";
    case "INTERNSHIP":
      return "Internship";
    case "TEMPORARY":
      return "Temporary";
    default:
      return value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function emptyReasonCopy(
  reason: "NO_RECOMMENDATIONS" | "PREPARING" | "ALL_DISMISSED" | undefined,
  filter?: "SAVED" | "REQUESTED" | null
): { title: string; body: string } {
  if (filter === "SAVED") {
    return {
      title: "No saved jobs yet",
      body: "Save a recommendation to keep it handy while you decide.",
    };
  }
  if (filter === "REQUESTED") {
    return {
      title: "No requested jobs yet",
      body: "When you request an application, those opportunities appear here as queued for your team.",
    };
  }
  if (reason === "PREPARING") {
    return {
      title: "Your job recommendations are being prepared",
      body: "We're reviewing roles against your experience, skills and preferences. Check back shortly.",
    };
  }
  if (reason === "ALL_DISMISSED") {
    return {
      title: "You've cleared your current recommendations",
      body: "New recommendations will appear here when available.",
    };
  }
  return {
    title: "No job recommendations yet",
    body: "When roles match your profile, they'll show up here with a clear explanation of why they may fit.",
  };
}

/** Human labels for scrubbed qualification dimensions (detail only). */
export function qualificationDimensionLabel(dimension: string): string {
  switch (dimension) {
    case "SKILLS":
      return "Skills";
    case "EXPERIENCE":
      return "Experience";
    case "EDUCATION":
      return "Education";
    case "CERTIFICATIONS":
      return "Certifications";
    case "WORK_AUTHORIZATION":
      return "Work authorization";
    default:
      return dimension.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}
