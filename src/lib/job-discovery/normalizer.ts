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

/** Parse geographic location into components */
export function parseLocation(rawLoc?: string | null): {
  country?: string | null;
  state?: string | null;
  city?: string | null;
} {
  if (!rawLoc) return {};
  const cleaned = rawLoc.trim();

  // Pattern like: US-TN-Nashville or US-Kansas-Independence
  if (/^[A-Z]{2}-[A-Za-z\s]+-[A-Za-z\s]+/.test(cleaned)) {
    const parts = cleaned.split("-");
    return {
      country: parts[0]?.trim() || null,
      state: parts[1]?.trim() || null,
      city: parts[2]?.trim() || null,
    };
  }

  // Pattern like: Pittsford, New York, United States
  const parts = cleaned.split(",").map((p) => p.trim());
  if (parts.length === 3) {
    return {
      city: parts[0] || null,
      state: parts[1] || null,
      country: parts[2] || null,
    };
  } else if (parts.length === 2) {
    return {
      city: parts[0] || null,
      state: parts[1] || null,
    };
  }

  return { city: cleaned };
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
