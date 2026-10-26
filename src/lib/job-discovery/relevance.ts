/**
 * Global Job Discovery & Collection Engine — Relevance Scoring Engine
 *
 * Implements transparent, explainable relevance scoring across:
 * - Query title & keyword relevance (30%)
 * - Skills overlap (25%)
 * - Industry alignment (15%)
 * - Seniority compatibility (10%)
 * - Location & work arrangement preference (10%)
 * - Freshness & quality signals (10%)
 *
 * Never rejects candidates on protected traits. Explains every score point.
 */

import type {
  DiscoveredJobSearchResult,
  JobSearchFilters,
  RelevanceExplanation,
  NormalizedDiscoveredJob,
} from "./types";

export function calculateRelevance(
  job: {
    title: string;
    companyName: string;
    jobDescription: string;
    requiredSkills?: string[];
    preferredSkills?: string[];
    industry?: string | null;
    seniorityLevel?: string | null;
    workArrangement?: string;
    country?: string | null;
    city?: string | null;
    postedAt?: Date | string | null;
    qualityScore?: number;
  },
  filters: JobSearchFilters
): RelevanceExplanation {
  const reasons: string[] = [];

  // 1. Title & Keyword Score (max 30 pts)
  let titleScore = 15; // baseline
  const titleLower = job.title.toLowerCase();
  const descLower = (job.jobDescription || "").toLowerCase();

  if (filters.exactPhrase && filters.exactPhrase.trim()) {
    const epLower = filters.exactPhrase.toLowerCase().trim();
    if (titleLower.includes(epLower)) {
      titleScore = 30;
      reasons.push(`Exact phrase matched in title: "${filters.exactPhrase}"`);
    } else if (descLower.includes(epLower)) {
      titleScore = Math.max(titleScore, 24);
      reasons.push(`Exact phrase matched in job description: "${filters.exactPhrase}"`);
    }
  }

  if (filters.companyName && filters.companyName.trim()) {
    const compLower = filters.companyName.toLowerCase().trim();
    if (job.companyName.toLowerCase().includes(compLower)) {
      titleScore = Math.min(30, titleScore + 5);
      reasons.push(`Target employer match: "${job.companyName}"`);
    }
  }

  if (filters.query && filters.query.trim()) {
    const qWords = filters.query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !w.startsWith("-"));

    const titleMatches = qWords.filter((w) => titleLower.includes(w)).length;
    const descMatches = qWords.filter((w) => descLower.includes(w)).length;

    if (qWords.length > 0) {
      if (titleMatches === qWords.length) {
        titleScore = 30;
        reasons.push(`Exact title match for all keywords: "${filters.query}"`);
      } else if (titleMatches > 0) {
        titleScore = Math.min(30, Math.round((titleMatches / qWords.length) * 20) + 5);
        reasons.push(`Matches ${titleMatches}/${qWords.length} keywords in job title`);
      } else if (descMatches > 0) {
        titleScore = Math.min(30, Math.round((descMatches / qWords.length) * 10) + 2);
        reasons.push(`Keywords found in job description`);
      } else if (!filters.exactPhrase) {
        titleScore = 0;
      }
    }
  }

  // 2. Skills Overlap (max 25 pts)
  let skillsScore = 15;
  const jobSkills = new Set(
    [...(job.requiredSkills || []), ...(job.preferredSkills || [])].map((s) =>
      s.toLowerCase().trim()
    )
  );

  const targetReqSkills = filters.requiredSkills || filters.skills || [];
  if (targetReqSkills.length > 0) {
    const matched = targetReqSkills.filter((s) => jobSkills.has(s.toLowerCase().trim()));
    if (matched.length > 0) {
      const ratio = matched.length / targetReqSkills.length;
      skillsScore = Math.round(ratio * 25);
      reasons.push(
        `Matches ${matched.length} of ${targetReqSkills.length} required skills: ${matched.join(", ")}`
      );
    } else {
      skillsScore = 0;
    }
    if (filters.preferredSkills && filters.preferredSkills.length > 0) {
      const prefMatched = filters.preferredSkills.filter((s) => jobSkills.has(s.toLowerCase().trim()));
      if (prefMatched.length > 0) {
        skillsScore = Math.min(25, skillsScore + prefMatched.length * 2);
        reasons.push(`Preferred skills bonus: ${prefMatched.join(", ")}`);
      }
    }
  } else if (filters.query) {
    // If user provided a query, check if query words match any job skills
    const qLower = filters.query.toLowerCase();
    const matched = Array.from(jobSkills).filter((s) => qLower.includes(s));
    if (matched.length > 0) {
      skillsScore = Math.min(25, 10 + matched.length * 5);
      reasons.push(`Skills matched from search query: ${matched.join(", ")}`);
    } else {
      skillsScore = 5;
    }
  } else if (jobSkills.size > 0) {
    skillsScore = Math.min(15, 5 + jobSkills.size * 2);
  }

  // 3. Industry Alignment (max 15 pts)
  let industryScore = 10;
  if (filters.industries && filters.industries.length > 0) {
    const jobInd = (job.industry || "").toLowerCase();
    if (filters.industries.some((ind) => ind.toLowerCase() === jobInd)) {
      industryScore = 15;
      reasons.push(`Belongs to requested industry: ${job.industry}`);
    } else {
      industryScore = 0;
    }
  }

  // 4. Seniority Compatibility (max 10 pts)
  let seniorityScore = 10;
  if (filters.seniorityLevels && filters.seniorityLevels.length > 0) {
    const jobSen = (job.seniorityLevel || "").toUpperCase();
    if (filters.seniorityLevels.some((s) => s.toUpperCase() === jobSen)) {
      seniorityScore = 10;
      reasons.push(`Matches requested seniority level: ${job.seniorityLevel}`);
    } else {
      seniorityScore = 2;
    }
  }

  // 5. Location & Work Arrangement (max 10 pts)
  let locationScore = 10;
  if (filters.workArrangements && filters.workArrangements.length > 0) {
    if (filters.workArrangements.includes(job.workArrangement as any)) {
      locationScore = 10;
      reasons.push(`Work arrangement matches: ${job.workArrangement}`);
    } else {
      locationScore = 2;
    }
  }

  // 6. Freshness & Quality (max 10 pts)
  let freshnessScore = 8;
  if (job.postedAt) {
    const posted = new Date(job.postedAt);
    if (!isNaN(posted.getTime())) {
      const days = (Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24);
      if (days <= 3) {
        freshnessScore = 10;
        reasons.push("Posted recently (within 3 days)");
      } else if (days <= 14) {
        freshnessScore = 8;
      } else if (days <= 30) {
        freshnessScore = 6;
      } else {
        freshnessScore = 3;
      }
    }
  }

  const overallScore = Math.min(
    100,
    titleScore + skillsScore + industryScore + seniorityScore + locationScore + freshnessScore
  );

  return {
    overallScore,
    titleScore,
    skillsScore,
    industryScore,
    seniorityScore,
    locationScore,
    freshnessScore,
    reasons: reasons.slice(0, 4), // Concise explanations
  };
}
