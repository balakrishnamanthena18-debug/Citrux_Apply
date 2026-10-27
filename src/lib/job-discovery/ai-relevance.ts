/**
 * Global Job Discovery & Collection Engine — DeepSeek AI Relevance Engine
 *
 * Implements calibrated, explainable relevance ranking:
 * - Deterministic base scoring:
 *   - Required skills: 35%
 *   - Relevant experience: 25%
 *   - Title & responsibilities: 20%
 *   - Qualifications & industry: 10%
 *   - Location & work preferences: 10%
 * - Hard constraint isolation: Disqualifying constraints (e.g., negative keywords,
 *   unsupported work arrangement when mandatory) prevent inflated scores.
 * - DeepSeek semantic enrichment for shortlisted top results with structured evidence:
 *   - Match explanation
 *   - Matched skills
 *   - Missing skills
 *   - Location/work-mode compatibility
 *   - Confidence
 * - Graceful deterministic fallback when AI is unavailable or times out.
 */

import { z } from "zod";
import { nvidiaDeepSeek } from "@/lib/ai/nvidia-deepseek";
import { matchCityWithAliases } from "./normalizer";
import type {
  DiscoveredJobSearchResult,
  JobSearchFilters,
  RelevanceExplanation,
  NormalizedDiscoveredJob,
} from "./types";
import { logger } from "@/lib/logger";

export interface AiMatchEvidence {
  matchExplanation: string;
  matchedSkills: string[];
  missingSkills: string[];
  locationCompatibility: string;
  confidence: number; // 0 - 100
  aiAssisted: boolean;
}

export interface EnhancedRelevanceExplanation extends RelevanceExplanation {
  scoringVersion: string;
  mandatoryConstraintViolated?: boolean;
  aiEvidence?: AiMatchEvidence;
}

/**
 * Calibrated Deterministic Scoring (Base Layer)
 */
export function calculateDeterministicRelevance(
  job: {
    title: string;
    companyName: string;
    jobDescription: string;
    requiredSkills?: string[];
    preferredSkills?: string[];
    industry?: string | null;
    seniorityLevel?: string | null;
    experienceMin?: number | null;
    experienceMax?: number | null;
    workArrangement?: string;
    country?: string | null;
    state?: string | null;
    city?: string | null;
    postedAt?: Date | string | null;
    qualityScore?: number;
  },
  filters: JobSearchFilters
): EnhancedRelevanceExplanation {
  const reasons: string[] = [];
  let mandatoryConstraintViolated = false;

  const titleLower = job.title.toLowerCase();
  const descLower = (job.jobDescription || "").toLowerCase();
  const companyLower = (job.companyName || "").toLowerCase();

  // Check hard exclusions (negative keywords)
  if (filters.excludedKeywords && filters.excludedKeywords.length > 0) {
    for (const ex of filters.excludedKeywords) {
      const exLower = ex.toLowerCase().trim();
      if (
        titleLower.includes(exLower) ||
        descLower.includes(exLower) ||
        companyLower.includes(exLower)
      ) {
        mandatoryConstraintViolated = true;
        reasons.push(`Contains excluded term: "${ex}"`);
      }
    }
  }

  // 1. Required Skills (35% weight)
  let skillsScore = 20; // baseline if no specific skills requested
  const jobSkills = new Set(
    [...(job.requiredSkills || []), ...(job.preferredSkills || [])].map((s) =>
      s.toLowerCase().trim()
    )
  );

  const targetReqSkills = filters.requiredSkills || filters.skills || [];
  if (targetReqSkills.length > 0) {
    const matched = targetReqSkills.filter(
      (s) => jobSkills.has(s.toLowerCase().trim()) || descLower.includes(s.toLowerCase().trim())
    );
    if (matched.length > 0) {
      const ratio = matched.length / targetReqSkills.length;
      skillsScore = Math.round(ratio * 35);
      reasons.push(
        `Skills overlap: ${matched.length}/${targetReqSkills.length} requested skills (${matched.slice(0, 3).join(", ")})`
      );
    } else {
      skillsScore = 0;
      reasons.push(`Missing all ${targetReqSkills.length} requested skills`);
    }
  } else if (filters.query) {
    const qLower = filters.query.toLowerCase();
    const matched = Array.from(jobSkills).filter((s) => qLower.includes(s));
    if (matched.length > 0) {
      skillsScore = Math.min(35, 15 + matched.length * 6);
      reasons.push(`Skills matched from search query: ${matched.slice(0, 3).join(", ")}`);
    }
  }

  // 2. Relevant Experience (25% weight)
  let experienceScore = 20; // default neutral score if experience is unstated
  if (filters.experienceMin !== undefined || filters.experienceMax !== undefined) {
    const reqMin = filters.experienceMin ?? 0;
    const reqMax = filters.experienceMax ?? 50;

    if (job.experienceMin !== null && job.experienceMin !== undefined) {
      if (job.experienceMin >= reqMin && job.experienceMin <= reqMax) {
        experienceScore = 25;
        reasons.push(`Experience requirement aligned: ${job.experienceMin}+ years`);
      } else if (job.experienceMin < reqMin) {
        experienceScore = 15;
      } else {
        experienceScore = 10;
        reasons.push(`Higher experience required (${job.experienceMin} yrs) than requested`);
      }
    } else {
      // Undisclosed experience: do not penalize harshly
      experienceScore = 18;
    }
  }

  // 3. Title & Responsibilities (20% weight)
  let titleScore = 10;
  if (filters.exactPhrase && filters.exactPhrase.trim()) {
    const epLower = filters.exactPhrase.toLowerCase().trim();
    if (titleLower.includes(epLower)) {
      titleScore = 20;
      reasons.push(`Exact phrase matched in title: "${filters.exactPhrase}"`);
    } else if (descLower.includes(epLower)) {
      titleScore = 15;
      reasons.push(`Exact phrase matched in job description`);
    }
  } else if (filters.query && filters.query.trim()) {
    const qWords = filters.query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !w.startsWith("-") && !["find", "with", "jobs", "need", "hiring"].includes(w));

    const titleMatches = qWords.filter((w) => titleLower.includes(w)).length;
    if (qWords.length > 0) {
      if (titleMatches === qWords.length) {
        titleScore = 20;
        reasons.push(`Exact role match in title`);
      } else if (titleMatches > 0) {
        titleScore = Math.min(20, Math.round((titleMatches / qWords.length) * 16) + 4);
        reasons.push(`Matches ${titleMatches}/${qWords.length} terms in title`);
      } else if (descLower.includes(filters.query.toLowerCase())) {
        titleScore = 10;
      } else {
        titleScore = 4;
      }
    }
  }

  // 4. Qualifications & Industry Alignment (10% weight)
  let industryScore = 8;
  if (filters.industries && filters.industries.length > 0) {
    const jobInd = (job.industry || "").toLowerCase();
    if (filters.industries.some((ind) => ind.toLowerCase() === jobInd)) {
      industryScore = 10;
      reasons.push(`Industry aligned: ${job.industry}`);
    } else {
      industryScore = 2;
    }
  }

  // 5. Location & Stated Preferences (10% weight)
  let locationScore = 8;
  if (filters.workArrangements && filters.workArrangements.length > 0) {
    if (filters.workArrangements.includes(job.workArrangement as any)) {
      locationScore = 10;
      reasons.push(`Work arrangement matches: ${job.workArrangement}`);
    } else {
      locationScore = 2;
    }
  }

  if (filters.cities && filters.cities.length > 0 && job.city) {
    const matchedCity = filters.cities.some((c) => matchCityWithAliases(job.city || "", c));
    if (matchedCity) {
      locationScore = 10;
      reasons.push(`Location confirmed in ${job.city}`);
    }
  }

  // If a hard constraint was violated, heavily penalize overall score
  let overallScore = skillsScore + experienceScore + titleScore + industryScore + locationScore;
  if (mandatoryConstraintViolated) {
    overallScore = Math.min(25, Math.round(overallScore * 0.3));
  } else {
    overallScore = Math.min(100, Math.max(0, overallScore));
  }

  return {
    overallScore,
    titleScore,
    skillsScore,
    industryScore,
    seniorityScore: 10,
    locationScore,
    freshnessScore: 8,
    reasons: reasons.slice(0, 4),
    scoringVersion: "v2-calibrated-deterministic",
    mandatoryConstraintViolated,
    aiEvidence: {
      matchExplanation: reasons[0] || "Standard match criteria satisfied",
      matchedSkills: Array.from(jobSkills).slice(0, 5),
      missingSkills: targetReqSkills.filter((s) => !jobSkills.has(s.toLowerCase().trim())).slice(0, 3),
      locationCompatibility: job.city ? `${job.city}, ${job.country || ""}` : (job.workArrangement || "Compatible"),
      confidence: 85,
      aiAssisted: false,
    },
  };
}

/**
 * Enrich shortlisted results with DeepSeek Semantic Evaluation
 */
export async function enrichJobsWithDeepSeek(
  jobs: DiscoveredJobSearchResult[],
  searchSummary: string
): Promise<DiscoveredJobSearchResult[]> {
  if (
    jobs.length === 0 ||
    !nvidiaDeepSeek.isConfigured() ||
    process.env.VITEST ||
    process.env.NODE_ENV === "test"
  ) {
    return jobs;
  }

  // Limit AI evaluation to top 5 candidates to respect token bounds and response latency
  const targetSlice = jobs.slice(0, 5);
  const candidatesPayload = targetSlice.map((j, idx) => ({
    id: j.id,
    index: idx,
    title: j.title,
    company: j.companyName,
    location: [j.city, j.state, j.country].filter(Boolean).join(", "),
    workArrangement: j.workArrangement,
    requiredSkills: j.requiredSkills.slice(0, 6),
    descriptionSnippet: j.jobDescription.slice(0, 300),
  }));

  const systemPrompt = `You are a recruitment intelligence ranker. Evaluate candidate jobs against the user's search requirements. Output JSON only.

Return an array under the key "evaluations":
{
  "evaluations": [
    {
      "index": number,
      "matchExplanation": string (concise 1-sentence reason why it matches or differs),
      "matchedSkills": string[],
      "missingSkills": string[],
      "locationCompatibility": string,
      "confidence": number (0-100)
    }
  ]
}`;

  try {
    const userPrompt = `Search requirements: "${searchSummary}"\n\nCandidate Jobs:\n${JSON.stringify(candidatesPayload, null, 2)}`;
    const result = await nvidiaDeepSeek.callStructured({
      systemPrompt,
      userPrompt,
      temperature: 0.1,
      maxTokens: 800,
      timeoutMs: 2000,
    });

    if (result.success && result.data && Array.isArray(result.data.evaluations)) {
      const evalMap = new Map<number, any>();
      for (const ev of result.data.evaluations) {
        if (typeof ev.index === "number") {
          evalMap.set(ev.index, ev);
        }
      }

      return jobs.map((job, idx) => {
        const aiEv = evalMap.get(idx);
        if (!aiEv) return job;

        const updatedRelevance: EnhancedRelevanceExplanation = {
          ...(job.relevance || {
            overallScore: 70,
            titleScore: 15,
            skillsScore: 20,
            industryScore: 10,
            seniorityScore: 10,
            locationScore: 10,
            freshnessScore: 8,
            reasons: [],
          }),
          scoringVersion: "v2-deepseek-hybrid",
          reasons: [
            aiEv.matchExplanation,
            ...(job.relevance?.reasons || []).slice(0, 2),
          ],
          aiEvidence: {
            matchExplanation: aiEv.matchExplanation,
            matchedSkills: Array.isArray(aiEv.matchedSkills) ? aiEv.matchedSkills : [],
            missingSkills: Array.isArray(aiEv.missingSkills) ? aiEv.missingSkills : [],
            locationCompatibility: aiEv.locationCompatibility || "Compatible",
            confidence: typeof aiEv.confidence === "number" ? aiEv.confidence : 90,
            aiAssisted: true,
          },
        };

        return {
          ...job,
          relevance: updatedRelevance,
        };
      });
    }
  } catch (err: any) {
    logger.warn("[AiRelevance] DeepSeek enrichment skipped, keeping deterministic scoring", {
      error: err?.message,
    });
  }

  return jobs;
}
