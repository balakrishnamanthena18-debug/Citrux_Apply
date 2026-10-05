import crypto from "crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma";
import { AuditAction } from "@/generated/prisma";
import { logUserAuditEvent } from "@/lib/audit";
import {
  ANALYSIS_PURPOSE,
  FIT_STATUSES,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
  JOB_REQUIREMENT_SCHEMA_VERSION,
  NULL_MODEL_ID,
  NULL_PROVIDER_ID,
  type FitStatus,
} from "./constants";
import {
  GATE6_ALIGNMENT_AUDIT_ALIASES,
  sanitizeIntelligenceAuditDetails,
} from "./audit-contract";
import {
  isCanonicalCandidateTruth,
  resolveCareerFactProvenance,
  type FactProvenanceValue,
} from "./provenance";
import {
  normalizeRequirementValue,
  type RequirementCategory,
  type RequirementImportance,
  type StructuredRequirement,
} from "./requirements-contract";
import {
  computeOverallScore,
  scoreDimensionFromFitStatuses,
  type AlignmentScoreBreakdown,
  type ScoringDimension,
} from "./scoring-contract";
import { assertIntelligenceScopeComplete } from "./security";
import { captureJobDescriptionSnapshot } from "./jd-snapshot";
import { buildSourceDataVersion } from "./stale";
import { ProviderError } from "./providers/errors";
import { requirementSetIsUsableForSnapshot } from "./requirement-set";

export const ALIGNMENT_EVIDENCE_SCHEMA_VERSION = "alignment-evidence.v1";

export type AlignmentCandidateSkill = {
  id: string;
  name: string;
};

export type AlignmentCandidateExperience = {
  id: string;
  jobTitle: string;
  companyName: string;
  startDate: Date | string;
  endDate: Date | string | null;
  isCurrent: boolean;
  technologies: string[];
};

export type AlignmentCandidateEducation = {
  id: string;
  degree: string;
  fieldOfStudy: string | null;
  institution: string;
};

export type AlignmentCandidateCertification = {
  id: string;
  name: string;
  issuingAuthority: string;
};

export type AlignmentCandidateFactView = {
  candidateId: string;
  organizationId: string;
  updatedAt: Date | string;
  city: string | null;
  state: string | null;
  country: string;
  totalYearsExperience: number | null;
  workAuthorization: string;
  requiresSponsorship: boolean;
  remotePreference: string;
  targetLocations: string[];
  targetRoles: string[];
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  salaryCurrency: string;
  skills: AlignmentCandidateSkill[];
  experiences: AlignmentCandidateExperience[];
  educations: AlignmentCandidateEducation[];
  certifications: AlignmentCandidateCertification[];
  projects: Array<{ id: string; technologies: string[] }>;
  /** Sparse attestation map: `${entityType}:${entityId}:${field??"*"}` → provenance */
  attestations?: Record<string, FactProvenanceValue>;
};

export type AlignmentJobContext = {
  jobId: string;
  organizationId: string;
  location: string | null;
  isRemote: boolean;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  visibility: "GLOBAL" | "CANDIDATE_PRIVATE";
  ownerCandidateId: string | null;
};

export type AlignmentFitItem = {
  requirementId: string;
  category: RequirementCategory;
  requirementValue: string;
  normalizedValue: string;
  importance: RequirementImportance;
  status: FitStatus;
  reason: string;
  dimension: ScoringDimension;
  candidateEvidence: {
    entityType: string;
    entityId: string | null;
    field: string | null;
    provenance: FactProvenanceValue;
    summary: string;
  } | null;
  requirementEvidence: {
    snapshotId: string;
    excerpt: string;
  };
  /** Gate 8 explainability — attached at evidence persist boundary. */
  ruleId?: string;
  explanation?: string;
};

export type DeterministicAlignmentResult = {
  scoringVersion: string;
  normalizationVersion: string;
  requirementSetId: string;
  snapshotId: string;
  candidateFactVersion: string;
  fitItems: AlignmentFitItem[];
  breakdown: AlignmentScoreBreakdown;
  overallScore: number | null;
};

export type AlignmentEvidencePayload = {
  schemaVersion: typeof ALIGNMENT_EVIDENCE_SCHEMA_VERSION;
  fitItems: AlignmentFitItem[];
  requirementSetId: string;
  snapshotId: string;
  normalizationVersion: string;
  candidateFactVersion: string;
  scoringVersion: string;
  /** Gate 8 explainability metadata (optional for historical rows). */
  explainabilityVersion?: string;
  versions?: Record<string, string>;
};

const SKILL_CATEGORIES: RequirementCategory[] = [
  "REQUIRED_SKILL",
  "PREFERRED_SKILL",
  "TECHNOLOGY",
  "DOMAIN_KNOWLEDGE",
];
const EXPERIENCE_CATEGORIES: RequirementCategory[] = [
  "EXPERIENCE",
  "SENIORITY",
];
const EDUCATION_CATEGORIES: RequirementCategory[] = [
  "EDUCATION",
  "CERTIFICATION",
];
const LOCATION_CATEGORIES: RequirementCategory[] = [
  "LOCATION",
  "REMOTE_POLICY",
];
const WORK_AUTH_CATEGORIES: RequirementCategory[] = ["WORK_AUTHORIZATION"];
const PREFERENCE_CATEGORIES: RequirementCategory[] = [
  "SALARY",
  "EMPLOYMENT_TYPE",
];

function dimensionForCategory(category: RequirementCategory): ScoringDimension {
  if (SKILL_CATEGORIES.includes(category)) return "skills";
  if (EXPERIENCE_CATEGORIES.includes(category)) return "experience";
  if (EDUCATION_CATEGORIES.includes(category)) return "education";
  if (LOCATION_CATEGORIES.includes(category)) return "location";
  if (WORK_AUTH_CATEGORIES.includes(category)) return "workAuthorization";
  if (PREFERENCE_CATEGORIES.includes(category)) return "preferences";
  // RESPONSIBILITY and others → preferences advisory bucket
  return "preferences";
}

export function buildCandidateFactVersion(candidate: {
  updatedAt: Date | string;
  skills: Array<{ id: string; name: string }>;
  experiences: Array<{ id: string }>;
  educations: Array<{ id: string }>;
  certifications: Array<{ id: string }>;
}): string {
  const updated =
    candidate.updatedAt instanceof Date
      ? candidate.updatedAt.toISOString()
      : String(candidate.updatedAt);
  const material = [
    updated,
    candidate.skills.map((s) => s.id).sort().join(","),
    candidate.experiences.map((e) => e.id).sort().join(","),
    candidate.educations.map((e) => e.id).sort().join(","),
    candidate.certifications.map((c) => c.id).sort().join(","),
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 32);
}

function attestationKey(
  entityType: string,
  entityId: string | null | undefined,
  field?: string | null
): string {
  return `${entityType}:${entityId ?? "*"}:${field ?? "*"}`;
}

function resolveFact(
  candidate: AlignmentCandidateFactView,
  entityType: Parameters<typeof resolveCareerFactProvenance>[0]["entityType"],
  entityId: string | null,
  field: string | null,
  valuePresent: boolean
) {
  const key = attestationKey(entityType, entityId, field);
  const att = candidate.attestations?.[key];
  return resolveCareerFactProvenance({
    entityType,
    entityId,
    field,
    valuePresent,
    attestation: att ? { provenance: att } : null,
  });
}

/** Merge overlapping employment intervals; asOf pins current roles (no wall-clock drift). */
export function computeMergedExperienceYears(
  experiences: AlignmentCandidateExperience[],
  asOf: Date
): number {
  if (experiences.length === 0) return 0;
  const intervals = experiences
    .map((exp) => {
      const start = new Date(exp.startDate).getTime();
      const end = exp.isCurrent || !exp.endDate
        ? asOf.getTime()
        : new Date(exp.endDate).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return null;
      }
      return { start, end };
    })
    .filter((x): x is { start: number; end: number } => x != null)
    .sort((a, b) => a.start - b.start);

  if (intervals.length === 0) return 0;

  const merged: Array<{ start: number; end: number }> = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (!last || iv.start > last.end) {
      merged.push({ ...iv });
    } else {
      last.end = Math.max(last.end, iv.end);
    }
  }

  const ms = merged.reduce((a, iv) => a + (iv.end - iv.start), 0);
  return Math.round((ms / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10;
}

function parseRequiredYears(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function collectNormalizedSkills(candidate: AlignmentCandidateFactView): Array<{
  normalized: string;
  raw: string;
  entityType: "CandidateSkill" | "CandidateExperience" | "CandidateProject";
  entityId: string;
}> {
  const out: Array<{
    normalized: string;
    raw: string;
    entityType: "CandidateSkill" | "CandidateExperience" | "CandidateProject";
    entityId: string;
  }> = [];
  for (const s of candidate.skills) {
    out.push({
      normalized: normalizeRequirementValue(s.name).toLowerCase(),
      raw: s.name,
      entityType: "CandidateSkill",
      entityId: s.id,
    });
  }
  for (const exp of candidate.experiences) {
    for (const t of exp.technologies) {
      out.push({
        normalized: normalizeRequirementValue(t).toLowerCase(),
        raw: t,
        entityType: "CandidateExperience",
        entityId: exp.id,
      });
    }
  }
  for (const p of candidate.projects) {
    for (const t of p.technologies) {
      out.push({
        normalized: normalizeRequirementValue(t).toLowerCase(),
        raw: t,
        entityType: "CandidateProject",
        entityId: p.id,
      });
    }
  }
  return out;
}

function alignSkill(
  req: StructuredRequirement,
  candidate: AlignmentCandidateFactView
): Omit<AlignmentFitItem, "dimension"> {
  const skills = collectNormalizedSkills(candidate);
  const target = req.normalizedValue.toLowerCase();
  const hit = skills.find((s) => s.normalized === target);

  if (hit) {
    const fact = resolveFact(
      candidate,
      hit.entityType,
      hit.entityId,
      hit.entityType === "CandidateSkill" ? "name" : "technologies",
      true
    );
    if (!isCanonicalCandidateTruth(fact.provenance)) {
      return baseFit(req, "UNKNOWN", "Skill evidence is not canonical candidate truth", null);
    }
    return baseFit(
      req,
      "MATCHED",
      `Normalized skill "${req.normalizedValue}" matches candidate skill "${hit.raw}".`,
      {
        entityType: fact.entityType,
        entityId: fact.entityId ?? null,
        field: fact.field ?? null,
        provenance: fact.provenance,
        summary: hit.raw,
      }
    );
  }

  if (skills.length === 0) {
    return baseFit(
      req,
      "UNKNOWN",
      "No verified candidate skill evidence is available for comparison.",
      null
    );
  }

  return baseFit(
    req,
    "MISSING",
    `Required skill "${req.rawValue}" was not found among normalized candidate skills.`,
    null
  );
}

function alignExperience(
  req: StructuredRequirement,
  candidate: AlignmentCandidateFactView,
  asOf: Date
): Omit<AlignmentFitItem, "dimension"> {
  const requiredYears = parseRequiredYears(req.rawValue);
  const merged = computeMergedExperienceYears(candidate.experiences, asOf);
  const declared =
    candidate.totalYearsExperience != null
      ? Number(candidate.totalYearsExperience)
      : null;
  const years =
    declared != null && Number.isFinite(declared)
      ? Math.max(declared, merged)
      : merged;

  if (requiredYears == null) {
    // Non-numeric experience/seniority wording
    if (candidate.experiences.length === 0 && declared == null) {
      return baseFit(
        req,
        "UNKNOWN",
        "Experience requirement is non-numeric and no candidate employment evidence exists.",
        null
      );
    }
    const exp = candidate.experiences[0];
    if (!exp) {
      return baseFit(
        req,
        "UNKNOWN",
        "Cannot evaluate ambiguous experience requirement without structured employment history.",
        null
      );
    }
    const fact = resolveFact(candidate, "CandidateExperience", exp.id, "jobTitle", true);
    return baseFit(
      req,
      "PARTIAL",
      `Ambiguous experience requirement "${req.rawValue}"; candidate has structured employment but years threshold is not established.`,
      {
        entityType: fact.entityType,
        entityId: fact.entityId ?? null,
        field: "jobTitle",
        provenance: fact.provenance,
        summary: `${exp.jobTitle} at ${exp.companyName}`,
      }
    );
  }

  if (candidate.experiences.length === 0 && declared == null) {
    return baseFit(
      req,
      "UNKNOWN",
      "No structured employment history or total years experience to evaluate years requirement.",
      null
    );
  }

  const evidenceExp = candidate.experiences[0] ?? null;
  const fact = resolveFact(
    candidate,
    evidenceExp ? "CandidateExperience" : "Candidate",
    evidenceExp?.id ?? candidate.candidateId,
    evidenceExp ? "startDate" : "totalYearsExperience",
    true
  );

  if (years >= requiredYears) {
    return baseFit(
      req,
      "MATCHED",
      `Candidate has ${years} years experience; requirement is ${requiredYears}+ years.`,
      {
        entityType: fact.entityType,
        entityId: fact.entityId ?? null,
        field: fact.field ?? null,
        provenance: fact.provenance,
        summary: `${years} years (merged, asOf-pinned)`,
      }
    );
  }
  if (years >= requiredYears * 0.6) {
    return baseFit(
      req,
      "PARTIAL",
      `Candidate has ${years} years experience; requirement threshold is ${requiredYears} years.`,
      {
        entityType: fact.entityType,
        entityId: fact.entityId ?? null,
        field: fact.field ?? null,
        provenance: fact.provenance,
        summary: `${years} years (below ${requiredYears})`,
      }
    );
  }
  return baseFit(
    req,
    "MISSING",
    `Candidate has ${years} years experience; requirement threshold is ${requiredYears} years.`,
    {
      entityType: fact.entityType,
      entityId: fact.entityId ?? null,
      field: fact.field ?? null,
      provenance: fact.provenance,
      summary: `${years} years (insufficient)`,
    }
  );
}

function educationLevel(text: string): number {
  const t = text.toLowerCase();
  if (/(ph\.?d|doctorate)/.test(t)) return 4;
  if (/(master|m\.?s\.?|mba|m\.?eng)/.test(t)) return 3;
  if (/(bachelor|b\.?s\.?|b\.?a\.?|undergraduate)/.test(t)) return 2;
  if (/(associate|diploma)/.test(t)) return 1;
  return 0;
}

function alignEducation(
  req: StructuredRequirement,
  candidate: AlignmentCandidateFactView
): Omit<AlignmentFitItem, "dimension"> {
  if (req.category === "CERTIFICATION") {
    return alignCertification(req, candidate);
  }
  if (candidate.educations.length === 0) {
    return baseFit(
      req,
      "UNKNOWN",
      "No candidate education records available for comparison.",
      null
    );
  }
  const requiredLevel = educationLevel(req.rawValue);
  let best = 0;
  let bestEdu = candidate.educations[0]!;
  for (const edu of candidate.educations) {
    const level = educationLevel(`${edu.degree} ${edu.fieldOfStudy ?? ""}`);
    if (level > best) {
      best = level;
      bestEdu = edu;
    }
  }
  const fact = resolveFact(candidate, "CandidateEducation", bestEdu.id, "degree", true);
  if (requiredLevel === 0) {
    return baseFit(
      req,
      "PARTIAL",
      `Education requirement "${req.rawValue}" is ambiguous; candidate has ${bestEdu.degree}.`,
      {
        entityType: fact.entityType,
        entityId: bestEdu.id,
        field: "degree",
        provenance: fact.provenance,
        summary: bestEdu.degree,
      }
    );
  }
  if (best >= requiredLevel) {
    return baseFit(
      req,
      "MATCHED",
      `Candidate degree "${bestEdu.degree}" meets education requirement.`,
      {
        entityType: fact.entityType,
        entityId: bestEdu.id,
        field: "degree",
        provenance: fact.provenance,
        summary: bestEdu.degree,
      }
    );
  }
  return baseFit(
    req,
    "MISSING",
    `Candidate highest education "${bestEdu.degree}" does not meet "${req.rawValue}".`,
    {
      entityType: fact.entityType,
      entityId: bestEdu.id,
      field: "degree",
      provenance: fact.provenance,
      summary: bestEdu.degree,
    }
  );
}

function alignCertification(
  req: StructuredRequirement,
  candidate: AlignmentCandidateFactView
): Omit<AlignmentFitItem, "dimension"> {
  if (candidate.certifications.length === 0) {
    return baseFit(
      req,
      "UNKNOWN",
      "No candidate certification records available for comparison.",
      null
    );
  }
  const target = req.normalizedValue.toLowerCase();
  const hit = candidate.certifications.find((c) => {
    const name = normalizeRequirementValue(c.name).toLowerCase();
    return name === target || name.includes(target) || target.includes(name);
  });
  if (hit) {
    const fact = resolveFact(candidate, "CandidateCertification", hit.id, "name", true);
    return baseFit(
      req,
      "MATCHED",
      `Candidate certification "${hit.name}" matches requirement.`,
      {
        entityType: fact.entityType,
        entityId: hit.id,
        field: "name",
        provenance: fact.provenance,
        summary: hit.name,
      }
    );
  }
  return baseFit(
    req,
    "MISSING",
    `No candidate certification matches "${req.rawValue}".`,
    null
  );
}

function alignLocation(
  req: StructuredRequirement,
  candidate: AlignmentCandidateFactView,
  job: AlignmentJobContext
): Omit<AlignmentFitItem, "dimension"> {
  if (req.category === "REMOTE_POLICY" || /remote/i.test(req.rawValue)) {
    if (job.isRemote) {
      if (
        candidate.remotePreference === "REMOTE_ONLY" ||
        candidate.remotePreference === "FLEXIBLE" ||
        candidate.remotePreference === "HYBRID"
      ) {
        const fact = resolveFact(
          candidate,
          "Candidate",
          candidate.candidateId,
          "remotePreference",
          true
        );
        return baseFit(
          req,
          "MATCHED",
          `Remote job aligns with candidate remotePreference=${candidate.remotePreference}.`,
          {
            entityType: fact.entityType,
            entityId: candidate.candidateId,
            field: "remotePreference",
            provenance: fact.provenance,
            summary: candidate.remotePreference,
          }
        );
      }
      if (candidate.remotePreference === "ONSITE") {
        return baseFit(
          req,
          "MISSING",
          "Job is remote but candidate remotePreference is ONSITE.",
          {
            entityType: "Candidate",
            entityId: candidate.candidateId,
            field: "remotePreference",
            provenance: "CANDIDATE_PROVIDED",
            summary: candidate.remotePreference,
          }
        );
      }
    }
  }

  const jobLoc = (job.location ?? req.rawValue).toLowerCase();
  const candidateLocs = [
    candidate.city,
    candidate.state,
    candidate.country,
    ...candidate.targetLocations,
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());

  if (candidateLocs.length === 0 && !candidate.remotePreference) {
    return baseFit(
      req,
      "UNKNOWN",
      "Candidate location and preferences are unknown.",
      null
    );
  }

  const overlap = candidateLocs.some(
    (loc) => jobLoc.includes(loc) || loc.includes(jobLoc.split(",")[0] ?? "")
  );
  if (overlap || (job.isRemote && candidate.remotePreference !== "ONSITE")) {
    return baseFit(
      req,
      "MATCHED",
      `Candidate location/preferences compatible with job location "${job.location ?? req.rawValue}".`,
      {
        entityType: "Candidate",
        entityId: candidate.candidateId,
        field: candidate.city ? "city" : "targetLocations",
        provenance: "CANDIDATE_PROVIDED",
        summary: candidateLocs.join(", ") || candidate.remotePreference,
      }
    );
  }

  if (!candidate.city && candidate.targetLocations.length === 0) {
    return baseFit(
      req,
      "UNKNOWN",
      "Insufficient candidate location data to evaluate geographic requirement.",
      null
    );
  }

  return baseFit(
    req,
    "MISSING",
    `Candidate locations do not match job location "${job.location ?? req.rawValue}".`,
    {
      entityType: "Candidate",
      entityId: candidate.candidateId,
      field: "city",
      provenance: "CANDIDATE_PROVIDED",
      summary: candidateLocs.join(", "),
    }
  );
}

function alignWorkAuthorization(
  req: StructuredRequirement,
  candidate: AlignmentCandidateFactView
): Omit<AlignmentFitItem, "dimension"> {
  const text = req.rawValue.toLowerCase();
  const status = candidate.workAuthorization;
  const fact = resolveFact(
    candidate,
    "WorkAuthorization",
    candidate.candidateId,
    "workAuthorization",
    Boolean(status)
  );

  if (!status) {
    return baseFit(
      req,
      "UNKNOWN",
      "Candidate work authorization is not available.",
      null
    );
  }

  // Only deterministic keyword rules — no citizenship inference beyond stored enum.
  if (/sponsor/i.test(text)) {
    if (candidate.requiresSponsorship) {
      return baseFit(
        req,
        "MISSING",
        "Requirement mentions sponsorship constraints; candidate requiresSponsorship=true.",
        {
          entityType: fact.entityType,
          entityId: candidate.candidateId,
          field: "requiresSponsorship",
          provenance: fact.provenance,
          summary: "requiresSponsorship=true",
        }
      );
    }
    return baseFit(
      req,
      "MATCHED",
      "Candidate does not require sponsorship.",
      {
        entityType: fact.entityType,
        entityId: candidate.candidateId,
        field: "requiresSponsorship",
        provenance: fact.provenance,
        summary: "requiresSponsorship=false",
      }
    );
  }

  if (/authorized to work|work authorization|eligible to work/i.test(text)) {
    if (
      status === "CITIZEN" ||
      status === "PERMANENT_RESIDENT" ||
      status === "WORK_VISA"
    ) {
      return baseFit(
        req,
        "MATCHED",
        `Candidate workAuthorization=${status} satisfies authorized-to-work wording.`,
        {
          entityType: fact.entityType,
          entityId: candidate.candidateId,
          field: "workAuthorization",
          provenance: fact.provenance,
          summary: status,
        }
      );
    }
    if (status === "REQUIRES_SPONSORSHIP" || status === "STUDENT_VISA") {
      return baseFit(
        req,
        "MISSING",
        `Candidate workAuthorization=${status} does not clearly satisfy authorized-to-work wording.`,
        {
          entityType: fact.entityType,
          entityId: candidate.candidateId,
          field: "workAuthorization",
          provenance: fact.provenance,
          summary: status,
        }
      );
    }
    return baseFit(
      req,
      "UNKNOWN",
      `Candidate workAuthorization=${status} cannot be deterministically mapped to requirement wording.`,
      {
        entityType: fact.entityType,
        entityId: candidate.candidateId,
        field: "workAuthorization",
        provenance: fact.provenance,
        summary: status,
      }
    );
  }

  return baseFit(
    req,
    "UNKNOWN",
    "Work authorization requirement wording is ambiguous; not converting to MATCH or MISSING.",
    {
      entityType: fact.entityType,
      entityId: candidate.candidateId,
      field: "workAuthorization",
      provenance: fact.provenance,
      summary: status,
    }
  );
}

function alignSalary(
  req: StructuredRequirement,
  candidate: AlignmentCandidateFactView,
  job: AlignmentJobContext
): Omit<AlignmentFitItem, "dimension"> {
  const candMin = candidate.desiredSalaryMin;
  const candMax = candidate.desiredSalaryMax;
  const jobMin = job.salaryMin;
  const jobMax = job.salaryMax;

  if (candMin == null && candMax == null) {
    return baseFit(
      req,
      "UNKNOWN",
      "Candidate salary expectations are not available.",
      null
    );
  }
  if (jobMin == null && jobMax == null) {
    // Requirement may encode salary in text only — still unknown without structured job range
    return baseFit(
      req,
      "UNKNOWN",
      "Job structured salary range is not available for deterministic comparison.",
      null
    );
  }

  const cMin = candMin ?? 0;
  const cMax = candMax ?? Number.MAX_SAFE_INTEGER;
  const jMin = jobMin ?? 0;
  const jMax = jobMax ?? Number.MAX_SAFE_INTEGER;
  const overlaps = cMin <= jMax && jMin <= cMax;

  if (overlaps) {
    return baseFit(
      req,
      "MATCHED",
      `Candidate salary expectations overlap job range ${jMin}-${jMax}.`,
      {
        entityType: "Candidate",
        entityId: candidate.candidateId,
        field: "desiredSalaryMin",
        provenance: "CANDIDATE_PROVIDED",
        summary: `${cMin}-${cMax} ${candidate.salaryCurrency}`,
      }
    );
  }
  return baseFit(
    req,
    "MISSING",
    `Candidate salary expectations ${cMin}-${cMax} do not overlap job range ${jMin}-${jMax}.`,
    {
      entityType: "Candidate",
      entityId: candidate.candidateId,
      field: "desiredSalaryMin",
      provenance: "CANDIDATE_PROVIDED",
      summary: `${cMin}-${cMax} ${candidate.salaryCurrency}`,
    }
  );
}

function alignEmploymentType(
  req: StructuredRequirement,
  job: AlignmentJobContext
): Omit<AlignmentFitItem, "dimension"> {
  const reqNorm = normalizeRequirementValue(req.rawValue).toLowerCase();
  const jobNorm = job.employmentType.toLowerCase();
  if (reqNorm.includes(jobNorm) || jobNorm.includes(reqNorm.replace(/\s+/g, "_"))) {
    return baseFit(
      req,
      "MATCHED",
      `Job employmentType ${job.employmentType} matches requirement.`,
      {
        entityType: "Unknown",
        entityId: null,
        field: "employmentType",
        provenance: "CANDIDATE_PROVIDED",
        summary: job.employmentType,
      }
    );
  }
  return baseFit(
    req,
    "PARTIAL",
    `Employment type requirement "${req.rawValue}" vs job ${job.employmentType}.`,
    null
  );
}

function baseFit(
  req: StructuredRequirement,
  status: FitStatus,
  reason: string,
  candidateEvidence: AlignmentFitItem["candidateEvidence"]
): Omit<AlignmentFitItem, "dimension"> {
  if (!(FIT_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid fit status ${status}`);
  }
  return {
    requirementId: req.id,
    category: req.category,
    requirementValue: req.rawValue,
    normalizedValue: req.normalizedValue,
    importance: req.importance,
    status,
    reason,
    candidateEvidence,
    requirementEvidence: {
      snapshotId: req.evidence.snapshotId,
      excerpt: req.evidence.excerpt,
    },
  };
}

function alignRequirement(
  req: StructuredRequirement,
  candidate: AlignmentCandidateFactView,
  job: AlignmentJobContext,
  asOf: Date
): AlignmentFitItem {
  const dimension = dimensionForCategory(req.category);
  let core: Omit<AlignmentFitItem, "dimension">;

  if (SKILL_CATEGORIES.includes(req.category)) {
    core = alignSkill(req, candidate);
  } else if (EXPERIENCE_CATEGORIES.includes(req.category)) {
    core = alignExperience(req, candidate, asOf);
  } else if (req.category === "EDUCATION" || req.category === "CERTIFICATION") {
    core = alignEducation(req, candidate);
  } else if (LOCATION_CATEGORIES.includes(req.category)) {
    core = alignLocation(req, candidate, job);
  } else if (WORK_AUTH_CATEGORIES.includes(req.category)) {
    core = alignWorkAuthorization(req, candidate);
  } else if (req.category === "SALARY") {
    core = alignSalary(req, candidate, job);
  } else if (req.category === "EMPLOYMENT_TYPE") {
    core = alignEmploymentType(req, job);
  } else {
    core = baseFit(
      req,
      "UNKNOWN",
      `No deterministic rule for category ${req.category}; leaving UNKNOWN.`,
      null
    );
  }

  // Importance UNKNOWN/NEEDS_REVIEW: preserve uncertainty — do not promote to MATCHED certainty.
  if (
    (req.importance === "UNKNOWN" || req.importance === "NEEDS_REVIEW") &&
    core.status === "MATCHED"
  ) {
    core = {
      ...core,
      status: "PARTIAL",
      reason: `${core.reason} Requirement importance is ${req.importance}; not treating as definitive MATCHED.`,
    };
  }

  return { ...core, dimension };
}

/**
 * Pure deterministic alignment. No LLM. No I/O.
 * Identical inputs → identical outputs (asOf must be pinned by caller).
 */
export function computeDeterministicAlignment(input: {
  requirements: StructuredRequirement[];
  requirementSetId: string;
  snapshotId: string;
  candidate: AlignmentCandidateFactView;
  job: AlignmentJobContext;
  /** Pin "now" for current employment — use run.createdAt, never wall clock at read time. */
  asOf: Date;
}): DeterministicAlignmentResult {
  if (input.job.organizationId !== input.candidate.organizationId) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Cross-tenant alignment rejected",
      { retryable: false }
    );
  }
  if (
    input.job.visibility === "CANDIDATE_PRIVATE" &&
    input.job.ownerCandidateId !== input.candidate.candidateId
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Private job alignment denied for this candidate",
      { retryable: false }
    );
  }

  for (const req of input.requirements) {
    if (req.evidence.snapshotId !== input.snapshotId) {
      throw new ProviderError(
        "PERMANENT_CLIENT_ERROR",
        "Requirement evidence snapshot does not match alignment snapshot",
        { retryable: false }
      );
    }
  }

  const fitItems = input.requirements
    .map((req) => alignRequirement(req, input.candidate, input.job, input.asOf))
    .sort((a, b) => a.requirementId.localeCompare(b.requirementId));

  const dimensions = (
    [
      "skills",
      "experience",
      "education",
      "location",
      "workAuthorization",
      "preferences",
    ] as ScoringDimension[]
  ).map((dimension) => {
    const items = fitItems.filter((f) => f.dimension === dimension);
    const scored = scoreDimensionFromFitStatuses(items);
    return {
      dimension,
      score: scored.score,
      status: scored.status,
    };
  });

  const breakdown = computeOverallScore(dimensions);
  // Attach evidence ids into breakdown dimensions
  const withEvidence: AlignmentScoreBreakdown = {
    ...breakdown,
    dimensions: breakdown.dimensions.map((d) => ({
      ...d,
      evidenceIds: fitItems
        .filter((f) => f.dimension === d.dimension && f.status !== "UNKNOWN")
        .map((f) => f.requirementId),
    })),
  };

  return {
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
    normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
    requirementSetId: input.requirementSetId,
    snapshotId: input.snapshotId,
    candidateFactVersion: buildCandidateFactVersion(input.candidate),
    fitItems,
    breakdown: withEvidence,
    overallScore: withEvidence.overallScore,
  };
}

export function buildAlignmentEvidencePayload(
  result: DeterministicAlignmentResult
): AlignmentEvidencePayload {
  // Lazy import avoided — enrich at call site via evidence-contract to keep
  // alignment decision engine free of explainability coupling when testing pure scores.
  return {
    schemaVersion: ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
    fitItems: result.fitItems,
    requirementSetId: result.requirementSetId,
    snapshotId: result.snapshotId,
    normalizationVersion: result.normalizationVersion,
    candidateFactVersion: result.candidateFactVersion,
    scoringVersion: result.scoringVersion,
  };
}

export type RequestAlignmentInput = {
  organizationId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  requestedById: string;
  candidateUpdatedAt: Date | string;
  materialsFingerprint?: string;
  provider?: string;
  model?: string;
};

function buildAlignmentIdempotencyKey(parts: {
  applicationId: string;
  snapshotContentHash: string;
  requirementSetId: string;
  candidateFactVersion: string;
  scoringVersion: string;
  normalizationVersion: string;
}): string {
  const material = [
    ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
    parts.applicationId,
    parts.snapshotContentHash,
    parts.requirementSetId,
    parts.candidateFactVersion,
    parts.scoringVersion,
    parts.normalizationVersion,
  ].join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 64);
}

/**
 * Queue a deterministic alignment run. Does NOT call LLM. Does NOT score here.
 */
export async function requestCandidateJobAlignment(
  tx: Prisma.TransactionClient,
  input: RequestAlignmentInput
): Promise<{
  runId: string;
  snapshotId: string;
  requirementSetId: string;
  created: boolean;
  status: "QUEUED" | "RUNNING" | "RETRY_PENDING" | "SUCCEEDED" | "FAILED";
}> {
  assertIntelligenceScopeComplete({
    organizationId: input.organizationId,
    candidateId: input.candidateId,
    applicationId: input.applicationId,
    jobId: input.jobId,
  });

  const application = await tx.application.findFirst({
    where: {
      id: input.applicationId,
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
    },
    select: { id: true },
  });
  if (!application) {
    throw new Error("Application scope mismatch for alignment request");
  }

  const job = await tx.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: {
      id: true,
      organizationId: true,
      jobDescription: true,
      externalUrl: true,
      source: true,
      updatedAt: true,
      visibility: true,
      ownerCandidateId: true,
    },
  });
  if (!job) {
    throw new Error("Job not found for alignment request");
  }
  if (
    job.visibility === "CANDIDATE_PRIVATE" &&
    job.ownerCandidateId !== input.candidateId
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Private job alignment denied for this candidate",
      { retryable: false }
    );
  }

  const snapshot = await captureJobDescriptionSnapshot(
    tx,
    job,
    input.requestedById
  );

  const requirementSet = await tx.jobRequirementSet.findFirst({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      freshness: "CURRENT",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      snapshotId: true,
      freshness: true,
      schemaVersion: true,
    },
  });

  if (
    !requirementSet ||
    !requirementSetIsUsableForSnapshot({
      requirementSetSnapshotId: requirementSet.snapshotId,
      analysisSnapshotId: snapshot.id,
      freshness: requirementSet.freshness,
    })
  ) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "CURRENT JobRequirementSet for this snapshot is required before alignment",
      { retryable: false }
    );
  }

  const candidate = await tx.candidate.findFirst({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      updatedAt: true,
      skills: { select: { id: true, name: true } },
      experiences: { select: { id: true } },
      educations: { select: { id: true } },
      certifications: { select: { id: true } },
    },
  });
  if (!candidate) {
    throw new Error("Candidate not found for alignment request");
  }

  const candidateFactVersion = buildCandidateFactVersion({
    updatedAt: candidate.updatedAt,
    skills: candidate.skills,
    experiences: candidate.experiences,
    educations: candidate.educations,
    certifications: candidate.certifications,
  });

  const sourceDataVersion = buildSourceDataVersion({
    snapshotContentHash: snapshot.contentHash,
    candidateUpdatedAt: input.candidateUpdatedAt,
    materialsFingerprint:
      input.materialsFingerprint ?? `facts:${candidateFactVersion}`,
  });

  const idempotencyKey = buildAlignmentIdempotencyKey({
    applicationId: input.applicationId,
    snapshotContentHash: snapshot.contentHash,
    requirementSetId: requirementSet.id,
    candidateFactVersion,
    scoringVersion: INTELLIGENCE_SCORING_VERSION,
    normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
  });

  const existing = await tx.applicationIntelligenceRun.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      status: true,
      snapshotId: true,
      requirementSetId: true,
    },
  });
  if (existing) {
    return {
      runId: existing.id,
      snapshotId: existing.snapshotId,
      requirementSetId: existing.requirementSetId ?? requirementSet.id,
      created: false,
      status: existing.status,
    };
  }

  const provider = input.provider ?? NULL_PROVIDER_ID;
  const model = input.model ?? NULL_MODEL_ID;

  const run = await tx.applicationIntelligenceRun.create({
    data: {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      requirementSetId: requirementSet.id,
      requestedById: input.requestedById,
      analysisPurpose: ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
      status: "QUEUED",
      freshness: "CURRENT",
      validationStatus: "PENDING",
      provider,
      model,
      promptVersion: "deterministic.alignment.v1",
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      idempotencyKey,
      sourceDataVersion,
    },
    select: { id: true, snapshotId: true, requirementSetId: true },
  });

  await logUserAuditEvent({
    userId: input.requestedById,
    organizationId: input.organizationId,
    action: AuditAction.APPLICATION_INTELLIGENCE_REQUESTED,
    entityType: "ApplicationIntelligenceRun",
    entityId: run.id,
    details: sanitizeIntelligenceAuditDetails({
      auditAlias: GATE6_ALIGNMENT_AUDIT_ALIASES.requested,
      analysisPurpose: ANALYSIS_PURPOSE.CANDIDATE_JOB_ALIGNMENT,
      applicationId: input.applicationId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      snapshotId: snapshot.id,
      requirementSetId: requirementSet.id,
      runId: run.id,
      scoringVersion: INTELLIGENCE_SCORING_VERSION,
      normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
      candidateFactVersion,
    }),
    tx,
  });

  return {
    runId: run.id,
    snapshotId: run.snapshotId,
    requirementSetId: run.requirementSetId ?? requirementSet.id,
    created: true,
    status: "QUEUED",
  };
}

/**
 * Load scoped candidate fact view for alignment (targeted queries only).
 */
export async function loadAlignmentCandidateFacts(
  db: Prisma.TransactionClient | PrismaClient,
  input: { organizationId: string; candidateId: string }
): Promise<AlignmentCandidateFactView> {
  const candidate = await db.candidate.findFirst({
    where: {
      id: input.candidateId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      updatedAt: true,
      city: true,
      state: true,
      country: true,
      totalYearsExperience: true,
      workAuthorization: true,
      requiresSponsorship: true,
      remotePreference: true,
      targetLocations: true,
      targetRoles: true,
      desiredSalaryMin: true,
      desiredSalaryMax: true,
      salaryCurrency: true,
      skills: { select: { id: true, name: true } },
      experiences: {
        select: {
          id: true,
          jobTitle: true,
          companyName: true,
          startDate: true,
          endDate: true,
          isCurrent: true,
          technologies: true,
        },
        orderBy: { orderIndex: "asc" },
      },
      educations: {
        select: {
          id: true,
          degree: true,
          fieldOfStudy: true,
          institution: true,
        },
        orderBy: { orderIndex: "asc" },
      },
      certifications: {
        select: { id: true, name: true, issuingAuthority: true },
      },
      projects: { select: { id: true, technologies: true } },
      factAttestations: {
        select: {
          entityType: true,
          entityId: true,
          field: true,
          provenance: true,
        },
      },
    },
  });

  if (!candidate) {
    throw new ProviderError(
      "PERMANENT_CLIENT_ERROR",
      "Candidate not found for alignment",
      { retryable: false }
    );
  }

  const attestations: Record<string, FactProvenanceValue> = {};
  for (const a of candidate.factAttestations) {
    attestations[
      attestationKey(a.entityType, a.entityId, a.field)
    ] = a.provenance as FactProvenanceValue;
  }

  return {
    candidateId: candidate.id,
    organizationId: candidate.organizationId,
    updatedAt: candidate.updatedAt,
    city: candidate.city,
    state: candidate.state,
    country: candidate.country,
    totalYearsExperience:
      candidate.totalYearsExperience != null
        ? Number(candidate.totalYearsExperience)
        : null,
    workAuthorization: candidate.workAuthorization,
    requiresSponsorship: candidate.requiresSponsorship,
    remotePreference: candidate.remotePreference,
    targetLocations: candidate.targetLocations,
    targetRoles: candidate.targetRoles,
    desiredSalaryMin: candidate.desiredSalaryMin,
    desiredSalaryMax: candidate.desiredSalaryMax,
    salaryCurrency: candidate.salaryCurrency,
    skills: candidate.skills,
    experiences: candidate.experiences,
    educations: candidate.educations,
    certifications: candidate.certifications,
    projects: candidate.projects,
    attestations,
  };
}

export async function persistApplicationAlignmentResult(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    applicationId: string;
    runId: string;
    freshness: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
    result: DeterministicAlignmentResult;
    actorUserId?: string | null;
  }
): Promise<{ id: string }> {
  // Gate 8: attach ruleIds/explanations at persist boundary (no decision changes).
  const { enrichAlignmentEvidencePayload } = await import("./evidence-contract");
  const evidence = enrichAlignmentEvidencePayload(
    buildAlignmentEvidencePayload(input.result)
  );
  const existing = await tx.applicationAlignmentResult.findUnique({
    where: { runId: input.runId },
    select: { id: true },
  });

  if (existing) {
    const updated = await tx.applicationAlignmentResult.update({
      where: { id: existing.id },
      data: {
        freshness: input.freshness,
        scoringVersion: input.result.scoringVersion,
        overallScore: input.result.overallScore,
        dimensionScores: input.result.breakdown as object,
        evidence: evidence as object,
      },
      select: { id: true },
    });
    return updated;
  }

  const created = await tx.applicationAlignmentResult.create({
    data: {
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      runId: input.runId,
      freshness: input.freshness,
      scoringVersion: input.result.scoringVersion,
      overallScore: input.result.overallScore,
      dimensionScores: input.result.breakdown as object,
      evidence: evidence as object,
    },
    select: { id: true },
  });

  return created;
}
