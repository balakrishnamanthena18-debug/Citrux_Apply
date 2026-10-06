/**
 * Phase 8C.4 — Interview Presentation & Deterministic Preparation Helpers
 * Human-readable mapping and deterministic brief builder.
 * Follows WCAG 2.1 AA contrast standards and avoids generic UI defaults.
 */

import {
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewFormat,
  InterviewRoundOutcome,
  InterviewSentiment,
} from "@/generated/prisma";
import type { PreparationBriefPayload } from "./types";

export interface StatusBadgePresentation {
  label: string;
  description: string;
  badgeClass: string;
  dotColor: string;
}

export const ROUND_STATUS_PRESENTATION: Record<InterviewRoundStatus, StatusBadgePresentation> = {
  ROUND_REQUESTED: {
    label: "Round requested",
    description: "Interview round has been requested; scheduling in progress.",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    dotColor: "bg-blue-500",
  },
  ROUND_SCHEDULED: {
    label: "Scheduled",
    description: "Date, time, and meeting details are confirmed.",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotColor: "bg-emerald-500",
  },
  ROUND_CANCELLED: {
    label: "Cancelled",
    description: "This interview round was cancelled.",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    dotColor: "bg-slate-400",
  },
  ROUND_COMPLETED: {
    label: "Completed",
    description: "Interview session took place; debrief pending.",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
    dotColor: "bg-indigo-500",
  },
  DEBRIEF_PENDING: {
    label: "Debrief pending",
    description: "Awaiting post-interview feedback notes and discussion.",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    dotColor: "bg-amber-500",
  },
  DEBRIEF_COMPLETED: {
    label: "Debrief recorded",
    description: "Post-interview evaluation and candidate feedback recorded.",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
    dotColor: "bg-teal-500",
  },
  ROUND_CONCLUDED: {
    label: "Concluded",
    description: "Round lifecycle concluded with recorded operational outcome.",
    badgeClass: "bg-purple-50 text-purple-800 border-purple-200",
    dotColor: "bg-purple-500",
  },
};

export const ROUND_TYPE_LABELS: Record<InterviewRoundType, string> = {
  RECRUITER_SCREEN: "Recruiter Screen",
  TECHNICAL_SCREEN: "Technical Screening",
  CODING_ASSESSMENT: "Coding Assessment / Live Coding",
  SYSTEM_DESIGN: "System Design Interview",
  HIRING_MANAGER: "Hiring Manager Interview",
  BEHAVIORAL_CULTURE: "Behavioral & Culture Fit",
  PANEL_PRESENTATION: "Panel / Presentation Session",
  EXECUTIVE_FINAL: "Executive / Final Leadership",
  ONSITE_FULL_LOOP: "Onsite Full Loop",
  OTHER: "Special / Custom Round",
};

export const FORMAT_LABELS: Record<InterviewFormat, { label: string; icon: string }> = {
  VIRTUAL: { label: "Virtual Video Call", icon: "💻" },
  PHONE: { label: "Phone Call", icon: "📞" },
  IN_PERSON: { label: "In-Person Onsite", icon: "🏢" },
  ASSESSMENT_TAKE_HOME: { label: "Take-Home Assessment", icon: "⏱️" },
};

export const OUTCOME_PRESENTATION: Record<InterviewRoundOutcome, { label: string; badgeClass: string }> = {
  ADVANCED_TO_NEXT_ROUND: {
    label: "Advanced to Next Round",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold",
  },
  OFFER_RECEIVED: {
    label: "Offer Received",
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-400 font-bold",
  },
  REJECTED_AFTER_ROUND: {
    label: "Not Moving Forward",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-300",
  },
  CANDIDATE_WITHDREW: {
    label: "Candidate Withdrew",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
  POSITION_CANCELLED: {
    label: "Position Frozen / Cancelled",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
  AWAITING_EMPLOYER_DECISION: {
    label: "Decision Pending",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-300",
  },
};

export const SENTIMENT_PRESENTATION: Record<InterviewSentiment, { label: string; emoji: string; badgeClass: string }> = {
  VERY_POSITIVE: { label: "Very Positive", emoji: "🟢", badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  POSITIVE: { label: "Positive", emoji: "🟩", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  NEUTRAL: { label: "Neutral / Mixed", emoji: "🟡", badgeClass: "bg-slate-50 text-slate-700 border-slate-200" },
  CONCERNED: { label: "Concerned / Challenging", emoji: "🟠", badgeClass: "bg-rose-50 text-rose-700 border-rose-200" },
  DIFFICULT: { label: "Difficult / Unfavorable", emoji: "🔴", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" },
};

export function formatInterviewDateTime(
  startTime?: Date | string | null,
  endTime?: Date | string | null,
  timezone?: string | null
): { dateStr: string; timeStr: string; timezoneStr: string } {
  if (!startTime) {
    return { dateStr: "To be scheduled", timeStr: "", timezoneStr: "" };
  }

  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime ? (endTime instanceof Date ? endTime : new Date(endTime)) : null;

  const tz = timezone || "UTC";

  try {
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const dateStr = dateFormatter.format(start);
    let timeStr = timeFormatter.format(start);

    if (end) {
      const endTimeStr = timeFormatter.format(end);
      timeStr = `${timeStr} – ${endTimeStr}`;
    }

    return {
      dateStr,
      timeStr,
      timezoneStr: tz,
    };
  } catch {
    return {
      dateStr: start.toLocaleDateString(),
      timeStr: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      timezoneStr: tz,
    };
  }
}

/**
 * Builds deterministic, factual candidate preparation brief based on Phase 8B specifications.
 * Zero synthetic AI generation; purely derives factual alignment from Candidate Evidence & Job Details.
 */
export function buildDeterministicPreparationBrief(params: {
  targetRole?: string;
  companyName?: string;
  roundType?: InterviewRoundType;
  skills?: string[];
  keyExperiences?: { company: string; title: string; highlights?: string[] }[];
}): PreparationBriefPayload {
  const { targetRole, companyName, roundType = "RECRUITER_SCREEN", skills = [], keyExperiences = [] } = params;

  const competencies: string[] = [];
  const projects: string[] = [];
  const talkingPoints: string[] = [];
  const formatGuidelines: string[] = [];

  // 1. Format Guidelines by Round Type
  switch (roundType) {
    case "RECRUITER_SCREEN":
      formatGuidelines.push(
        "Focus on 2-3 minute structured elevator pitch outlining core strengths and career progression.",
        "Clearly articulate alignment with the target role requirements and company domain.",
        "Be ready to discuss compensation expectations, notice period, and work authorization accurately."
      );
      break;
    case "TECHNICAL_SCREEN":
    case "CODING_ASSESSMENT":
    case "SYSTEM_DESIGN":
      formatGuidelines.push(
        "Clarify problem scope, constraints, and edge cases before diving into implementation.",
        "Communicate thought process aloud clearly and discuss trade-offs between alternative architectures.",
        "Walk through verification and test cases systematically."
      );
      break;
    case "HIRING_MANAGER":
    case "BEHAVIORAL_CULTURE":
    case "PANEL_PRESENTATION":
    case "EXECUTIVE_FINAL":
      formatGuidelines.push(
        "Structure behavioral answers using the STAR method (Situation, Task, Action, Result).",
        "Emphasize tangible business outcomes, cross-functional leadership, and conflict resolution.",
        "Prepare 3-4 thoughtful questions demonstrating deep interest in the team's roadmap and culture."
      );
      break;
    default:
      formatGuidelines.push(
        "Review key achievements and align them directly to role responsibilities.",
        "Be prepared to elaborate on technical decisions and impact from your most recent engagements."
      );
      break;
  }

  // 2. Derive key competencies from factual candidate skills
  if (skills.length > 0) {
    competencies.push(...skills.slice(0, 6));
  }

  // 3. Highlight verified experiences
  keyExperiences.slice(0, 3).forEach((exp) => {
    projects.push(`${exp.title} at ${exp.company}`);
    if (exp.highlights && exp.highlights.length > 0) {
      talkingPoints.push(...exp.highlights.slice(0, 2));
    }
  });

  return {
    targetRole,
    companyName,
    roundType,
    keyCompetenciesToEmphasize: competencies,
    highlightedProjects: projects,
    talkingPoints: talkingPoints.length > 0 ? talkingPoints : undefined,
    formatGuidelines,
    lastGeneratedAt: new Date().toISOString(),
  };
}
