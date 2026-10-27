/**
 * Global Job Discovery & Collection Engine — DeepSeek Query Interpreter
 *
 * Transforms natural-language search queries into a validated, structured search plan.
 *
 * Example:
 * "Find senior software engineering jobs in Bengaluru, hybrid, paying at least ₹15 LPA"
 * -> role: "Software Engineer", seniority: "SENIOR", city: "Bengaluru", state: "Karnataka",
 *    country: "IN", workArrangement: "HYBRID", salaryMin: 1500000, salaryCurrency: "INR",
 *    salaryPeriod: "YEARLY"
 *
 * Includes robust deterministic fallback that extracts location, seniority, work mode,
 * and salary without AI when DeepSeek is offline or times out.
 */

import { z } from "zod";
import { nvidiaDeepSeek } from "@/lib/ai/nvidia-deepseek";
import {
  parseLocation,
  INDIAN_STATES,
  KNOWN_CITY_LOCATIONS,
  extractSkills,
} from "./normalizer";
import type {
  JobSeniority,
  JobWorkArrangement,
  JobEmploymentType,
  ProviderSearchParams,
} from "./types";
import { logger } from "@/lib/logger";

export interface InterpretedSearchPlan {
  originalQuery: string;
  role?: string;
  titleSynonyms: string[];
  skills: string[];
  companyName?: string;
  city?: string;
  state?: string;
  country?: string; // ISO 2-letter: "IN", "US", "GB", etc.
  workArrangement?: JobWorkArrangement;
  seniority?: JobSeniority;
  employmentType?: JobEmploymentType;
  experienceMin?: number;
  experienceMax?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: "YEARLY" | "MONTHLY" | "HOURLY";
  requiredSkills: string[];
  preferredSkills: string[];
  excludedKeywords: string[];
  intentSummary: string;
  confidence: number;
  isAiInterpreted: boolean;
}

const AiPlanSchema = z.object({
  role: z.string().optional().nullable(),
  titleSynonyms: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  companyName: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  workArrangement: z.enum(["REMOTE", "HYBRID", "ONSITE", "UNSPECIFIED"]).optional().nullable(),
  seniority: z.enum(["INTERN", "ENTRY", "MID", "SENIOR", "LEAD", "DIRECTOR", "EXECUTIVE"]).optional().nullable(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY"]).optional().nullable(),
  experienceMin: z.number().optional().nullable(),
  experienceMax: z.number().optional().nullable(),
  salaryMin: z.number().optional().nullable(),
  salaryMax: z.number().optional().nullable(),
  salaryCurrency: z.string().optional().nullable(),
  salaryPeriod: z.enum(["YEARLY", "MONTHLY", "HOURLY"]).optional().nullable(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  excludedKeywords: z.array(z.string()).optional(),
  intentSummary: z.string().optional(),
});

/**
 * Deterministic Query Parser (Fast, 0ms, zero-dependency fallback)
 */
export function interpretQueryDeterministic(rawQuery: string): InterpretedSearchPlan {
  const q = rawQuery.trim();
  if (!q) {
    return {
      originalQuery: "",
      titleSynonyms: [],
      skills: [],
      requiredSkills: [],
      preferredSkills: [],
      excludedKeywords: [],
      intentSummary: "All open opportunities",
      confidence: 100,
      isAiInterpreted: false,
    };
  }

  let working = q;
  const excludedKeywords: string[] = [];

  // Extract negative keywords (-term)
  const negMatches = working.match(/(?:^|\s)-(?:\w+)|(?:^|\s)NOT\s+(\w+)/gi);
  if (negMatches) {
    for (const m of negMatches) {
      const term = m.replace(/^-|\s-|NOT\s+/i, "").trim().toLowerCase();
      if (term) excludedKeywords.push(term);
      working = working.replace(m, " ");
    }
  }

  // Work arrangement detection
  let workArrangement: JobWorkArrangement | undefined;
  if (/\b(remote|work from home|wfh)\b/i.test(working)) {
    workArrangement = "REMOTE";
    working = working.replace(/\b(remote|work from home|wfh)\b/gi, " ");
  } else if (/\b(hybrid)\b/i.test(working)) {
    workArrangement = "HYBRID";
    working = working.replace(/\b(hybrid)\b/gi, " ");
  } else if (/\b(onsite|on-site|in-office)\b/i.test(working)) {
    workArrangement = "ONSITE";
    working = working.replace(/\b(onsite|on-site|in-office)\b/gi, " ");
  }

  // Seniority detection
  let seniority: JobSeniority | undefined;
  if (/\b(senior|sr\.?|lead|staff|principal)\b/i.test(working)) {
    seniority = "SENIOR";
  } else if (/\b(junior|jr\.?|entry level|associate)\b/i.test(working)) {
    seniority = "ENTRY";
  } else if (/\b(intern|internship|co-op)\b/i.test(working)) {
    seniority = "INTERN";
  } else if (/\b(director|vp|head of)\b/i.test(working)) {
    seniority = "DIRECTOR";
  }

  // Salary detection (e.g. 15 LPA, 20L, $150k, 120000)
  let salaryMin: number | undefined;
  let salaryCurrency = "USD";
  let salaryPeriod: "YEARLY" | "MONTHLY" | "HOURLY" = "YEARLY";

  const lpaMatch = working.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|l)\b/i);
  if (lpaMatch && lpaMatch[1]) {
    const val = parseFloat(lpaMatch[1]);
    salaryMin = Math.round(val * 100000);
    salaryCurrency = "INR";
    working = working.replace(lpaMatch[0], " ");
  } else {
    const usdMatch = working.match(/\$(\d+)(?:k|\s*000)\b/i);
    if (usdMatch && usdMatch[1]) {
      salaryMin = parseInt(usdMatch[1], 10) * 1000;
      salaryCurrency = "USD";
      working = working.replace(usdMatch[0], " ");
    }
  }

  // Clean common search filler words
  working = working.replace(/\b(find|looking for|need|search for|preferably|paying|at least|minimum|min)\b/gi, " ");
  working = working.replace(/\s+/g, " ").trim();

  // Location detection: check city / state patterns
  let detectedCity: string | undefined;
  let detectedState: string | undefined;
  let detectedCountry: string | undefined;

  // Direct check against known city hubs (e.g. Bengaluru, Bangalore, Hyderabad, Pune, Austin, Seattle)
  const lowerWorking = ` ${working.toLowerCase()} `;
  for (const [cityKey, loc] of Object.entries(KNOWN_CITY_LOCATIONS)) {
    const reg = new RegExp(`(?:\\bin\\s+)?\\b${cityKey}\\b`, "i");
    if (reg.test(working)) {
      detectedCity = loc.city;
      if (!detectedState && loc.state) detectedState = loc.state;
      if (!detectedCountry && loc.country) detectedCountry = loc.country;
      working = working.replace(reg, " ").trim();
      break;
    }
  }

  // Check Indian states (e.g. Karnataka, Telangana, Maharashtra)
  for (const [stateKey, stateVal] of Object.entries(INDIAN_STATES)) {
    const reg = new RegExp(`(?:\\bin\\s+)?\\b${stateKey}\\b`, "i");
    if (reg.test(working)) {
      if (!detectedState) detectedState = stateVal;
      if (!detectedCountry) detectedCountry = "IN";
      working = working.replace(reg, " ").trim();
      break;
    }
  }

  // If still not detected, parse any remaining location patterns
  if (!detectedCity && !detectedCountry) {
    const inLocMatch = working.match(/\bin\s+([A-Za-z\s,]+)$/i);
    if (inLocMatch && inLocMatch[1]) {
      const locStr = inLocMatch[1].trim();
      const parsed = parseLocation(locStr);
      if (parsed.city || parsed.country || parsed.state) {
        detectedCity = parsed.city || undefined;
        detectedState = parsed.state || undefined;
        detectedCountry = parsed.country || undefined;
        working = working.replace(inLocMatch[0], " ").trim();
      }
    }
  }

  // Remaining words are treated as role / keywords
  let roleKeywords = working
    .replace(/\b(jobs?|openings?|roles?|positions?)\b/gi, "")
    .replace(/[,\-₹$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // If role is purely 1-2 punctuation chars, nullify it
  if (!/[a-zA-Z]{2,}/.test(roleKeywords)) {
    roleKeywords = "";
  }

  const skills = extractSkills(q);
  const titleSynonyms: string[] = [];
  if (roleKeywords) {
    titleSynonyms.push(roleKeywords);
    if (roleKeywords.toLowerCase().includes("software engineer")) {
      titleSynonyms.push("Software Developer", "Full Stack Engineer", "Backend Developer");
    }
  }

  // Construct readable intent summary
  const summaryParts: string[] = [];
  if (seniority) summaryParts.push(seniority);
  if (roleKeywords) summaryParts.push(roleKeywords);
  else if (skills.length > 0) summaryParts.push(skills.join(", "));
  else summaryParts.push("Opportunities");

  if (detectedCity || detectedCountry) {
    summaryParts.push(`in ${[detectedCity, detectedState, detectedCountry].filter(Boolean).join(", ")}`);
  }
  if (workArrangement) summaryParts.push(`(${workArrangement})`);
  if (salaryMin) {
    if (salaryCurrency === "INR") {
      summaryParts.push(`₹${(salaryMin / 100000).toFixed(0)} LPA+`);
    } else {
      summaryParts.push(`$${(salaryMin / 1000).toFixed(0)}k+`);
    }
  }

  return {
    originalQuery: q,
    role: roleKeywords || undefined,
    titleSynonyms,
    skills,
    city: detectedCity,
    state: detectedState,
    country: detectedCountry,
    workArrangement,
    seniority,
    salaryMin,
    salaryCurrency,
    salaryPeriod,
    requiredSkills: skills,
    preferredSkills: [],
    excludedKeywords,
    intentSummary: summaryParts.join(" "),
    confidence: 85,
    isAiInterpreted: false,
  };
}

/**
 * DeepSeek AI Query Understanding with Automatic Deterministic Fallback
 */
export async function interpretJobSearchQuery(rawQuery: string): Promise<InterpretedSearchPlan> {
  const fallback = interpretQueryDeterministic(rawQuery);
  const q = rawQuery.trim();

  // If query is very short, running in unit tests, AI is unconfigured,
  // or deterministic fallback already has high confidence (e.g. direct city/role),
  // return deterministic plan immediately to prevent unnecessary network latency.
  if (
    !q ||
    q.length < 5 ||
    fallback.confidence >= 80 ||
    !nvidiaDeepSeek.isConfigured() ||
    process.env.VITEST ||
    process.env.NODE_ENV === "test"
  ) {
    return fallback;
  }

  const systemPrompt = `You are an expert recruitment search parser. Analyze the user's natural language job search query and extract structured search parameters into JSON.

Schema requirements:
- "role": Canonical job title (e.g. "Software Engineer") or null
- "titleSynonyms": array of 2-4 equivalent job titles (e.g. ["Software Developer", "Full Stack Engineer"])
- "skills": array of technical/professional skills mentioned
- "companyName": employer name if explicitly targeted, else null
- "city": city name (e.g. "Bengaluru", "Hyderabad", "Austin") or null
- "state": state or province name or null
- "country": 2-letter ISO country code ("IN", "US", "GB", "DE", "CA", etc.) or null
- "workArrangement": "REMOTE" | "HYBRID" | "ONSITE" | null
- "seniority": "INTERN" | "ENTRY" | "MID" | "SENIOR" | "LEAD" | "DIRECTOR" | "EXECUTIVE" | null
- "employmentType": "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | null
- "experienceMin": minimum years of experience as a number or null
- "salaryMin": minimum salary converted to a single integer number or null (Note: 1 LPA = 100000 INR; $100k = 100000 USD)
- "salaryCurrency": "INR" | "USD" | "EUR" | "GBP" | null
- "salaryPeriod": "YEARLY" | "MONTHLY" | "HOURLY" | null
- "requiredSkills": skills that are explicitly mandatory
- "preferredSkills": skills that are optional/preferred
- "excludedKeywords": terms that should be excluded
- "intentSummary": concise 1-sentence summary of the interpreted search

Rules:
1. Do not invent requirements that are not in the query.
2. If location is mentioned (e.g., "Bengaluru", "Hyderabad"), populate city, state ("Karnataka", "Telangana"), and country ("IN").
3. If salary is in LPA (Lakhs Per Annum), currency is "INR" and period is "YEARLY".
4. Output ONLY the JSON object.`;

  try {
    const aiResult = await nvidiaDeepSeek.callStructured(
      {
        systemPrompt,
        userPrompt: q,
        temperature: 0.1,
        maxTokens: 800,
        timeoutMs: 1800,
      },
      (parsed) => AiPlanSchema.parse(parsed)
    );

    if (aiResult.success && aiResult.data) {
      const d = aiResult.data;

      // Post-normalize location to ensure absolute consistency with our normalizer
      let city = d.city || fallback.city;
      let state = d.state || fallback.state;
      let country = d.country ? d.country.toUpperCase() : fallback.country;

      if (city && !country) {
        const parsedLoc = parseLocation(city);
        if (parsedLoc.country) country = parsedLoc.country;
        if (parsedLoc.state && !state) state = parsedLoc.state;
      }

      // Ensure city alias consistency (e.g., Bangalore -> Bengaluru)
      if (city && city.toLowerCase() === "bangalore") {
        city = "Bengaluru";
      }

      return {
        originalQuery: q,
        role: d.role || fallback.role,
        titleSynonyms: d.titleSynonyms && d.titleSynonyms.length > 0 ? d.titleSynonyms : fallback.titleSynonyms,
        skills: Array.from(new Set([...(d.skills || []), ...fallback.skills])),
        companyName: d.companyName || undefined,
        city: city || undefined,
        state: state || undefined,
        country: country || undefined,
        workArrangement: (d.workArrangement as any) || fallback.workArrangement,
        seniority: (d.seniority as any) || fallback.seniority,
        employmentType: (d.employmentType as any) || fallback.employmentType,
        experienceMin: typeof d.experienceMin === "number" ? d.experienceMin : fallback.experienceMin,
        experienceMax: typeof d.experienceMax === "number" ? d.experienceMax : fallback.experienceMax,
        salaryMin: typeof d.salaryMin === "number" ? d.salaryMin : fallback.salaryMin,
        salaryMax: typeof d.salaryMax === "number" ? d.salaryMax : fallback.salaryMax,
        salaryCurrency: d.salaryCurrency || fallback.salaryCurrency,
        salaryPeriod: d.salaryPeriod || fallback.salaryPeriod,
        requiredSkills: d.requiredSkills || fallback.requiredSkills,
        preferredSkills: d.preferredSkills || fallback.preferredSkills,
        excludedKeywords: Array.from(new Set([...(d.excludedKeywords || []), ...fallback.excludedKeywords])),
        intentSummary: d.intentSummary || fallback.intentSummary,
        confidence: 95,
        isAiInterpreted: true,
      };
    }
  } catch (err: any) {
    logger.warn("[DeepSeekQueryInterpreter] AI parsing failed, falling back to deterministic parser", {
      error: err?.message,
    });
  }

  return fallback;
}
