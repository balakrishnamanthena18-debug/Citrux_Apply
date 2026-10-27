/**
 * Global Job Discovery & Collection Engine — Data Normalizer
 *
 * Normalizes varied external job representations into standardized OOS domain models.
 * Preserves source provenance without fabricating missing data.
 */

import { canonicalizeAtsUrl } from "@/lib/data-quality/normalizer";
import {
  JobEmploymentType,
  JobVerificationStatus,
  JobWorkArrangement,
  JobStatus,
  type JobIndustry,
  type JobSeniority,
} from "./types";

/** Industry classification keyword rules */
const INDUSTRY_RULES: Array<{ industry: JobIndustry; patterns: RegExp[] }> = [
  {
    industry: "healthcare",
    patterns: [
      /\b(nurse|nursing|hospital|clinic|patient|medical|physician|rn|lpn|pharmacy|hematology|oncology|healthcare|health care|dental|therapist|clinical)\b/i,
    ],
  },
  {
    industry: "finance_banking",
    patterns: [
      /\b(finance|financial|accountant|accounting|banking|banker|audit|auditor|payroll|tax|wealth|credit|underwriter|actuary|treasury|investment)\b/i,
    ],
  },
  {
    industry: "data_ai",
    patterns: [
      /\b(data engineer|data scientist|machine learning|ai engineer|deep learning|nlp|llm|computer vision|data analyst|analytics|business intelligence|bi developer|big data)\b/i,
    ],
  },
  {
    industry: "cybersecurity",
    patterns: [
      /\b(cybersecurity|security engineer|infosec|soc analyst|penetration test|vulnerability|cryptograph|siem|cissp|cism)\b/i,
    ],
  },
  {
    industry: "cloud_enterprise",
    patterns: [
      /\b(devops|sre|cloud engineer|aws|azure|gcp|kubernetes|terraform|sysadmin|systems administrator|sap|salesforce|workday|erp consultant|servicenow)\b/i,
    ],
  },
  {
    industry: "it_support",
    patterns: [
      /\b(it support|help desk|helpdesk|service desk|desktop support|field technician|technical support|system support|it specialist)\b/i,
    ],
  },
  {
    industry: "technology",
    patterns: [
      /\b(software|frontend|front-end|backend|back-end|full stack|fullstack|developer|ios|android|react|node|python|java|golang|rust|c\+\+|typescript|web developer|qa engineer|sdet)\b/i,
    ],
  },
  {
    industry: "sales_marketing",
    patterns: [
      /\b(sales|account executive|business development|bdr|sdr|marketing|growth|seo|sem|content writer|copywriter|brand manager|public relations|pr specialist)\b/i,
    ],
  },
  {
    industry: "hr_admin",
    patterns: [
      /\b(human resources|hr manager|hr generalist|talent acquisition|recruiter|recruitment|people operations|office manager|administrative assistant|executive assistant)\b/i,
    ],
  },
  {
    industry: "manufacturing_engineering",
    patterns: [
      /\b(mechanical engineer|electrical engineer|civil engineer|process engineer|manufacturing|machinist|welder|technician|assembly|fabrication|plant manager|quality assurance engineer)\b/i,
    ],
  },
  {
    industry: "hospitality",
    patterns: [
      /\b(hotel|restaurant|chef|cook|barista|bartender|front desk agent|concierge|housekeeping|guest service|culinary|food and beverage|f&b)\b/i,
    ],
  },
  {
    industry: "retail_logistics",
    patterns: [
      /\b(retail|store associate|cashier|warehouse|forklift|shipping|receiving|logistics|supply chain|inventory|merchandiser|package handler)\b/i,
    ],
  },
  {
    industry: "public_sector",
    patterns: [
      /\b(public sector|government|federal|municipal|civil service|state agency|defense|military|public safety|usajobs)\b/i,
    ],
  },
  {
    industry: "education_research",
    patterns: [
      /\b(teacher|professor|adjunct|instructor|tutor|curriculum|academic|researcher|postdoc|fellow|faculty|education)\b/i,
    ],
  },
];

/** Seniority detection rules */
const SENIORITY_RULES: Array<{ seniority: JobSeniority; patterns: RegExp[] }> = [
  {
    seniority: "EXECUTIVE",
    patterns: [
      /\b(chief|cxo|ceo|cto|cfo|coo|cmo|cro|cio|ciso|vp|vice president|partner|president|avp)\b/i,
    ],
  },
  {
    seniority: "DIRECTOR",
    patterns: [/\b(director|head of|senior director|managing director)\b/i],
  },
  {
    seniority: "LEAD",
    patterns: [
      /\b(lead|team lead|tech lead|architect|principal|staff engineer|manager|supervisor)\b/i,
    ],
  },
  {
    seniority: "SENIOR",
    patterns: [/\b(senior|sr\.|sr|iii|level 3|tier 3)\b/i],
  },
  {
    seniority: "MID",
    patterns: [/\b(mid|intermediate|ii|level 2|specialist)\b/i],
  },
  {
    seniority: "ENTRY",
    patterns: [
      /\b(entry|junior|jr\.|jr|associate|i|level 1|graduate|trainee)\b/i,
    ],
  },
  {
    seniority: "INTERN",
    patterns: [/\b(intern|internship|co-op|fellowship)\b/i],
  },
];

/** Clean company name by stripping legal entities and ATS subdomain paths */
export function normalizeCompanyName(company: string): string {
  if (!company) return "Unknown Employer";
  let cleaned = company.trim();

  // If company looks like a domain or subdomain e.g. "textron.taleo.net/tabbu" or "jobs.lever.co/givinghhc"
  if (cleaned.includes(".taleo.net") || cleaned.includes(".ultipro.com") || cleaned.includes(".lever.co") || cleaned.includes(".greenhouse.io")) {
    const parts = cleaned.split("/");
    const domain = parts[0] || "";
    const namePart = domain.split(".")[0];
    if (namePart && namePart.length > 2) {
      cleaned = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }
  }

  // Strip corporate suffixes
  cleaned = cleaned.replace(
    /\b(inc|llc|corp|corporation|co|ltd|limited|pvt|private)\b\.?/gi,
    ""
  );

  // Clean trailing punctuation and whitespace
  cleaned = cleaned.replace(/[-.,\s]+$/, "").trim();
  return cleaned || company.trim();
}

/** Clean title from ATS clutter and tags */
export function normalizeJobTitle(title: string): string {
  if (!title) return "Untitled Position";
  let cleaned = title.trim();

  // Remove hashtags and emojis
  cleaned = cleaned.replace(/#\w+/g, "");
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");

  // Remove internal shift notes or req id trailing parentheses if strictly noise
  cleaned = cleaned.replace(/\s*\(req[#\s\d-]+\)/i, "");

  // Clean multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned || title.trim();
}

/** Detect work arrangement from text signals */
export function detectWorkArrangement(
  location?: string | null,
  description?: string | null,
  title?: string | null
): JobWorkArrangement {
  const combined = `${location || ""} ${description || ""} ${title || ""}`.toLowerCase();

  if (/\b(remote|work from home|wfh|telecommute|anywhere)\b/.test(combined)) {
    if (/\b(hybrid|partially remote|flex remote)\b/.test(combined)) {
      return "HYBRID";
    }
    return "REMOTE";
  }

  if (/\b(hybrid|flexible office|in-office \/ remote)\b/.test(combined)) {
    return "HYBRID";
  }

  if (/\b(on-site|onsite|in-office|in person|at hospital|at facility|at plant)\b/.test(combined)) {
    return "ONSITE";
  }

  return "UNSPECIFIED";
}

/** Infer industry category from title and description */
export function inferIndustry(
  title: string,
  description?: string | null,
  explicitCategory?: string | null
): JobIndustry {
  // If explicit category matches known industry, return normalized
  if (explicitCategory) {
    const norm = explicitCategory.toLowerCase().trim();
    for (const rule of INDUSTRY_RULES) {
      if (rule.industry === norm || norm.includes(rule.industry)) {
        return rule.industry;
      }
    }
  }

  const textToScan = `${title} ${(description || "").slice(0, 500)}`;

  for (const rule of INDUSTRY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(textToScan)) {
        return rule.industry;
      }
    }
  }

  return "other";
}

/** Infer seniority level from title */
export function inferSeniority(title: string): JobSeniority | null {
  for (const rule of SENIORITY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(title)) {
        return rule.seniority;
      }
    }
  }
  return null;
}

/** Normalize employment type */
export function normalizeEmploymentType(raw?: string | null): JobEmploymentType {
  if (!raw) return "FULL_TIME";
  const s = raw.toLowerCase().trim();
  if (s.includes("part") || s === "pt") return "PART_TIME";
  if (s.includes("contract") || s.includes("temp") || s.includes("freelance") || s.includes("c2c")) return "CONTRACT";
  if (s.includes("intern") || s.includes("coop") || s.includes("co-op")) return "INTERNSHIP";
  return "FULL_TIME";
}

/** Known city aliases and historic / alternate spellings */
export const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ["bangalore", "bengaluru", "bangalore urban", "bengaluru urban"],
  bangalore: ["bengaluru", "bangalore", "bengaluru urban", "bangalore urban"],
  gurugram: ["gurgaon", "gurugram"],
  gurgaon: ["gurugram", "gurgaon"],
  mumbai: ["bombay", "mumbai"],
  bombay: ["mumbai", "bombay"],
  kolkata: ["calcutta", "kolkata"],
  calcutta: ["kolkata", "calcutta"],
  chennai: ["madras", "chennai"],
  madras: ["chennai", "madras"],
  hyderabad: ["hyderabad", "secunderabad"],
  secunderabad: ["hyderabad", "secunderabad"],
  "san francisco": ["sf", "san francisco", "bay area"],
  sf: ["san francisco", "sf", "bay area"],
  "new york": ["nyc", "new york city", "new york", "manhattan", "brooklyn"],
  "new york city": ["nyc", "new york city", "new york", "manhattan", "brooklyn"],
  nyc: ["nyc", "new york city", "new york", "manhattan", "brooklyn"],
  washington: ["washington dc", "washington d.c.", "washington", "dc"],
};

/** Match city name accounting for aliases and partial matches */
export function matchCityWithAliases(target: string, queryCity: string): boolean {
  if (!target || !queryCity) return false;
  const tLower = target.toLowerCase().trim();
  const qLower = queryCity.toLowerCase().trim();

  if (tLower === qLower || tLower.includes(qLower) || qLower.includes(tLower)) {
    return true;
  }

  // Check alias equivalence groups
  for (const group of Object.values(CITY_ALIASES)) {
    const hasTarget = group.some((g) => tLower === g || tLower.includes(g) || g.includes(tLower));
    const hasQuery = group.some((g) => qLower === g || qLower.includes(g) || g.includes(qLower));
    if (hasTarget && hasQuery) return true;
  }

  return false;
}

/** Known country names mapping to standard country strings */
const KNOWN_COUNTRIES = new Set([
  "india", "in",
  "united states", "usa", "us",
  "united kingdom", "uk", "gb",
  "germany", "de", "deutschland",
  "canada", "ca",
  "australia", "au",
  "france", "fr",
  "netherlands", "nl",
  "ireland", "ie",
  "singapore", "sg",
  "japan", "jp",
  "brazil", "br",
]);

/** 2-letter postal abbreviations for US states and territories */
export const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
]);

/** Indian states mapping (including 2-letter postal codes) */
export const INDIAN_STATES: Record<string, string> = {
  karnataka: "Karnataka",
  ka: "Karnataka",
  telangana: "Telangana",
  ts: "Telangana",
  tg: "Telangana",
  maharashtra: "Maharashtra",
  mh: "Maharashtra",
  "tamil nadu": "Tamil Nadu",
  tamilnadu: "Tamil Nadu",
  tn: "Tamil Nadu",
  delhi: "Delhi",
  dl: "Delhi",
  "uttar pradesh": "Uttar Pradesh",
  up: "Uttar Pradesh",
  haryana: "Haryana",
  hr: "Haryana",
  gujarat: "Gujarat",
  gj: "Gujarat",
  "west bengal": "West Bengal",
  wb: "West Bengal",
  kerala: "Kerala",
  kl: "Kerala",
  rajasthan: "Rajasthan",
  rj: "Rajasthan",
  punjab: "Punjab",
  pb: "Punjab",
  "andhra pradesh": "Andhra Pradesh",
  ap: "Andhra Pradesh",
  "madhya pradesh": "Madhya Pradesh",
  mp: "Madhya Pradesh",
  bihar: "Bihar",
  odisha: "Odisha",
};

/** Well-known tech hubs and their canonical country & state */
export const KNOWN_CITY_LOCATIONS: Record<
  string,
  { city: string; state?: string; country: string }
> = {
  bengaluru: { city: "Bengaluru", state: "Karnataka", country: "IN" },
  bangalore: { city: "Bengaluru", state: "Karnataka", country: "IN" },
  hyderabad: { city: "Hyderabad", state: "Telangana", country: "IN" },
  secunderabad: { city: "Hyderabad", state: "Telangana", country: "IN" },
  mumbai: { city: "Mumbai", state: "Maharashtra", country: "IN" },
  bombay: { city: "Mumbai", state: "Maharashtra", country: "IN" },
  pune: { city: "Pune", state: "Maharashtra", country: "IN" },
  chennai: { city: "Chennai", state: "Tamil Nadu", country: "IN" },
  madras: { city: "Chennai", state: "Tamil Nadu", country: "IN" },
  delhi: { city: "Delhi", state: "Delhi", country: "IN" },
  "new delhi": { city: "New Delhi", state: "Delhi", country: "IN" },
  gurugram: { city: "Gurugram", state: "Haryana", country: "IN" },
  gurgaon: { city: "Gurugram", state: "Haryana", country: "IN" },
  noida: { city: "Noida", state: "Uttar Pradesh", country: "IN" },
  kolkata: { city: "Kolkata", state: "West Bengal", country: "IN" },
  calcutta: { city: "Kolkata", state: "West Bengal", country: "IN" },
  ahmedabad: { city: "Ahmedabad", state: "Gujarat", country: "IN" },
  kochi: { city: "Kochi", state: "Kerala", country: "IN" },
  cochin: { city: "Kochi", state: "Kerala", country: "IN" },
  austin: { city: "Austin", state: "TX", country: "US" },
  seattle: { city: "Seattle", state: "WA", country: "US" },
  "san francisco": { city: "San Francisco", state: "CA", country: "US" },
  "new york": { city: "New York", state: "NY", country: "US" },
  chicago: { city: "Chicago", state: "IL", country: "US" },
  boston: { city: "Boston", state: "MA", country: "US" },
  london: { city: "London", country: "GB" },
  berlin: { city: "Berlin", country: "DE" },
  toronto: { city: "Toronto", state: "ON", country: "CA" },
  singapore: { city: "Singapore", country: "SG" },
};

/** Expand city string to its recognized aliases */
export function expandLocationAliases(cityName: string): string[] {
  if (!cityName) return [];
  const clean = cityName.toLowerCase().trim();
  const directAliases = CITY_ALIASES[clean];
  if (directAliases) {
    return Array.from(new Set([clean, ...directAliases]));
  }
  return [clean];
}

/** Parse a single geographic location segment into components */
export function parseSingleLocation(rawLoc?: string | null): {
  country?: string | null;
  state?: string | null;
  city?: string | null;
} {
  if (!rawLoc) return {};
  const cleaned = rawLoc.replace(/\s+/g, " ").trim();
  const lowerCleaned = cleaned.toLowerCase();

  // Direct lookup for well-known tech hubs
  if (KNOWN_CITY_LOCATIONS[lowerCleaned]) {
    const hub = KNOWN_CITY_LOCATIONS[lowerCleaned];
    return {
      city: hub.city,
      state: hub.state || null,
      country: hub.country,
    };
  }

  // Direct lookup for Indian states
  if (INDIAN_STATES[lowerCleaned]) {
    return {
      state: INDIAN_STATES[lowerCleaned],
      country: "IN",
    };
  }

  // Pattern like: US-TN-Nashville or India-Telangana-Hyderabad or US-CA-San Francisco
  if (/^[A-Za-z\s]+-[A-Za-z\s\d]+-[A-Za-z\s\d]+/.test(cleaned)) {
    const parts = cleaned.split("-");
    return {
      country: parts[0]?.trim() || null,
      state: parts[1]?.trim() || null,
      city: parts[2]?.trim() || null,
    };
  }

  // Pattern like: India- Bengaluru or US - Austin
  if (/^[A-Za-z\s]+-\s*[A-Za-z\s]+$/.test(cleaned)) {
    const parts = cleaned.split("-").map((p) => p.trim());
    if (parts[0] && KNOWN_COUNTRIES.has(parts[0].toLowerCase())) {
      return {
        country: parts[0],
        city: parts[1] || null,
      };
    }
  }

  // Pattern like: Pittsford, New York, United States
  const parts = cleaned.split(",").map((p) => p.trim());
  if (parts.length >= 3) {
    const p1Lower = parts[1]?.toLowerCase() || "";
    const resolvedState = INDIAN_STATES[p1Lower] || parts[1];
    return {
      city: parts[0] || null,
      state: resolvedState || null,
      country: parts[2] || null,
    };
  } else if (parts.length === 2 && parts[1]) {
    const p1Upper = parts[1].toUpperCase();
    const p1Lower = parts[1].toLowerCase();

    // Check Indian state in 2nd position (e.g., "Bengaluru, Karnataka" or "Hyderabad, Telangana")
    if (INDIAN_STATES[p1Lower]) {
      return {
        city: parts[0] || null,
        state: INDIAN_STATES[p1Lower],
        country: "IN",
      };
    }

    // In US job feeds: "Lafayette, IN" is Indiana, USA (not India); "Berkeley, CA" is California, USA (not Canada)
    if (US_STATE_CODES.has(p1Upper)) {
      return {
        city: parts[0] || null,
        state: parts[1] || null,
        country: "US",
      };
    }
    if (KNOWN_COUNTRIES.has(p1Lower)) {
      return {
        city: parts[0] || null,
        country: parts[1] || null,
      };
    }
    return {
      city: parts[0] || null,
      state: parts[1] || null,
    };
  }

  return { city: cleaned };
}

/**
 * Parse geographic location into components, properly handling postings with
 * multiple work locations (e.g. "Chennai; Bengaluru" or "Austin, TX; San Francisco, CA")
 */
export function parseLocation(rawLoc?: string | null): {
  country?: string | null;
  state?: string | null;
  city?: string | null;
  allCities?: string[];
} {
  if (!rawLoc) return {};

  // Check if multiple locations are delimited by semicolon or pipe or slash
  const segments = rawLoc
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    const single = parseSingleLocation(rawLoc);
    return {
      ...single,
      allCities: single.city ? [single.city] : [],
    };
  }

  // Parse each location segment
  const parsedSegments = segments.map((seg) => parseSingleLocation(seg));
  const validCities: string[] = [];
  let primaryCountry: string | null = null;
  let primaryState: string | null = null;

  for (const seg of parsedSegments) {
    if (seg.city && !validCities.includes(seg.city)) {
      validCities.push(seg.city);
    }
    if (!primaryCountry && seg.country) {
      primaryCountry = seg.country;
    }
    if (!primaryState && seg.state) {
      primaryState = seg.state;
    }
  }

  const primary = parsedSegments[0] || {};

  return {
    city: primary.city || (validCities.length > 0 ? validCities.join("; ") : null),
    state: primary.state || primaryState || null,
    country: primary.country || primaryCountry || null,
    allCities: validCities,
  };
}

/** Extract common technology / domain skills */
export function extractSkills(text: string): string[] {
  const commonSkills = [
    "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Python", "Java", "C++", "C#", "Go",
    "Rust", "SQL", "PostgreSQL", "MongoDB", "Redis", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
    "Git", "CI/CD", "Linux", "REST", "GraphQL", "Agile", "Scrum", "Tailwind CSS",
    "SAP", "Salesforce", "ServiceNow", "Cybersecurity", "DevOps", "Machine Learning", "AI",
    "PowerBI", "Tableau", "Excel", "Data Analysis", "Accounting", "Financial Analysis",
    "Customer Service", "Project Management", "Healthcare", "Patient Care", "Nursing", "Clinical"
  ];

  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const skill of commonSkills) {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(lower)) {
      found.push(skill);
    }
  }
  return found;
}
