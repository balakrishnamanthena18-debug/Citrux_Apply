import { normalizeRequirementValue } from "@/lib/application-intelligence/requirements-contract";
import {
  MATCHING_CONTRACT_VERSION,
  type MatchOutcome,
  type QualificationDimension,
} from "./constants";
import { categorizeMatch, countMatchCounters } from "./category";
import { buildMatchSourceDataVersion } from "./freshness";
import { buildMatchPresentation } from "./presentation";
import type {
  MatchCandidateInput,
  MatchEvaluationResult,
  MatchItemResult,
  MatchJobInput,
  MatchRequirementSetInput,
  MatchStructuredRequirement,
} from "./types";

function norm(s: string): string {
  return normalizeRequirementValue(s).toLowerCase();
}

function collectSkills(candidate: MatchCandidateInput): Array<{
  normalized: string;
  raw: string;
  entityType: string;
  entityId: string;
  field: string;
}> {
  const out: Array<{
    normalized: string;
    raw: string;
    entityType: string;
    entityId: string;
    field: string;
  }> = [];
  for (const s of candidate.skills) {
    out.push({
      normalized: norm(s.name),
      raw: s.name,
      entityType: "CandidateSkill",
      entityId: s.id,
      field: "name",
    });
  }
  for (const exp of candidate.experiences) {
    for (const t of exp.technologies) {
      out.push({
        normalized: norm(t),
        raw: t,
        entityType: "CandidateExperience",
        entityId: exp.id,
        field: "technologies",
      });
    }
  }
  for (const p of candidate.projects) {
    for (const t of p.technologies) {
      out.push({
        normalized: norm(t),
        raw: t,
        entityType: "CandidateProject",
        entityId: p.id,
        field: "technologies",
      });
    }
  }
  return out;
}

function parseRequiredYears(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function qualificationDimension(
  category: MatchStructuredRequirement["category"]
): QualificationDimension | null {
  if (
    category === "REQUIRED_SKILL" ||
    category === "PREFERRED_SKILL" ||
    category === "TECHNOLOGY"
  ) {
    return "SKILLS";
  }
  if (
    category === "EXPERIENCE" ||
    category === "SENIORITY" ||
    category === "RESPONSIBILITY" ||
    category === "DOMAIN_KNOWLEDGE"
  ) {
    return "EXPERIENCE";
  }
  if (category === "EDUCATION") return "EDUCATION";
  if (category === "CERTIFICATION") return "CERTIFICATIONS";
  if (category === "WORK_AUTHORIZATION") return "WORK_AUTHORIZATION";
  return null;
}

function isPreferenceRequirement(
  category: MatchStructuredRequirement["category"]
): boolean {
  return (
    category === "LOCATION" ||
    category === "REMOTE_POLICY" ||
    category === "SALARY" ||
    category === "EMPLOYMENT_TYPE"
  );
}

function evaluateSkill(
  req: MatchStructuredRequirement,
  candidate: MatchCandidateInput
): Omit<MatchItemResult, "dimension" | "kind"> {
  const skills = collectSkills(candidate);
  const target = req.normalizedValue.toLowerCase();
  const hit = skills.find((s) => s.normalized === target);
  if (!hit) {
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "MISMATCH",
      rationale: `Skill "${req.rawValue}" not found in candidate truth.`,
      evidence: null,
    };
  }
  return {
    importance: req.importance,
    requirementId: req.id,
    label: req.rawValue,
    outcome: "MATCH",
    rationale: `Skill "${req.rawValue}" matches candidate "${hit.raw}".`,
    evidence: {
      dimension: "SKILLS",
      requirementId: req.id,
      entityType: hit.entityType,
      entityId: hit.entityId,
      field: hit.field,
      outcome: "MATCH",
    },
  };
}

function evaluateExperience(
  req: MatchStructuredRequirement,
  candidate: MatchCandidateInput
): Omit<MatchItemResult, "dimension" | "kind"> {
  const yearsNeeded = parseRequiredYears(req.rawValue);
  const yearsHave = candidate.totalYearsExperience;

  if (yearsNeeded != null) {
    if (yearsHave == null) {
      return {
        importance: req.importance,
        requirementId: req.id,
        label: req.rawValue,
        outcome: "UNKNOWN",
        rationale: "Years of experience not available on candidate profile.",
        evidence: null,
      };
    }
    if (yearsHave >= yearsNeeded) {
      return {
        importance: req.importance,
        requirementId: req.id,
        label: req.rawValue,
        outcome: "MATCH",
        rationale: `Candidate has ${yearsHave} years; requirement asks for ${yearsNeeded}.`,
        evidence: {
          dimension: "EXPERIENCE",
          requirementId: req.id,
          entityType: "Candidate",
          entityId: candidate.candidateId,
          field: "totalYearsExperience",
          outcome: "MATCH",
        },
      };
    }
    if (yearsHave >= yearsNeeded * 0.75) {
      return {
        importance: req.importance,
        requirementId: req.id,
        label: req.rawValue,
        outcome: "PARTIAL",
        rationale: `Candidate has ${yearsHave} years; requirement asks for ${yearsNeeded}.`,
        evidence: {
          dimension: "EXPERIENCE",
          requirementId: req.id,
          entityType: "Candidate",
          entityId: candidate.candidateId,
          field: "totalYearsExperience",
          outcome: "PARTIAL",
        },
      };
    }
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "MISMATCH",
      rationale: `Candidate has ${yearsHave} years; requirement asks for ${yearsNeeded}.`,
      evidence: null,
    };
  }

  // Textual experience / domain / responsibility: look for technology or title overlap
  const needle = norm(req.normalizedValue);
  const skillHit = collectSkills(candidate).find(
    (s) => s.normalized.includes(needle) || needle.includes(s.normalized)
  );
  if (skillHit) {
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "PARTIAL",
      rationale: `Experience-related requirement "${req.rawValue}" partially supported by "${skillHit.raw}".`,
      evidence: {
        dimension: "EXPERIENCE",
        requirementId: req.id,
        entityType: skillHit.entityType,
        entityId: skillHit.entityId,
        field: skillHit.field,
        outcome: "PARTIAL",
      },
    };
  }

  const titleHit = candidate.experiences.find((e) =>
    norm(e.jobTitle).includes(needle) || needle.includes(norm(e.jobTitle))
  );
  if (titleHit) {
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "PARTIAL",
      rationale: `Experience title "${titleHit.jobTitle}" partially supports "${req.rawValue}".`,
      evidence: {
        dimension: "EXPERIENCE",
        requirementId: req.id,
        entityType: "CandidateExperience",
        entityId: titleHit.id,
        field: "jobTitle",
        outcome: "PARTIAL",
      },
    };
  }

  return {
    importance: req.importance,
    requirementId: req.id,
    label: req.rawValue,
    outcome: "UNKNOWN",
    rationale: `Could not deterministically verify experience requirement "${req.rawValue}".`,
    evidence: null,
  };
}

function evaluateEducation(
  req: MatchStructuredRequirement,
  candidate: MatchCandidateInput
): Omit<MatchItemResult, "dimension" | "kind"> {
  if (candidate.educations.length === 0) {
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "UNKNOWN",
      rationale: "No education records on candidate profile.",
      evidence: null,
    };
  }
  const needle = norm(req.normalizedValue);
  const hit = candidate.educations.find((e) => {
    const blob = norm(
      [e.degree, e.fieldOfStudy, e.institution].filter(Boolean).join(" ")
    );
    return blob.includes(needle) || needle.includes(blob);
  });
  if (hit) {
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "MATCH",
      rationale: `Education record supports "${req.rawValue}".`,
      evidence: {
        dimension: "EDUCATION",
        requirementId: req.id,
        entityType: "CandidateEducation",
        entityId: hit.id,
        field: "degree",
        outcome: "MATCH",
      },
    };
  }
  return {
    importance: req.importance,
    requirementId: req.id,
    label: req.rawValue,
    outcome: "MISMATCH",
    rationale: `Education requirement "${req.rawValue}" not clearly supported.`,
    evidence: null,
  };
}

function evaluateCertification(
  req: MatchStructuredRequirement,
  candidate: MatchCandidateInput
): Omit<MatchItemResult, "dimension" | "kind"> {
  if (candidate.certifications.length === 0) {
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "UNKNOWN",
      rationale: "No certifications on candidate profile.",
      evidence: null,
    };
  }
  const needle = norm(req.normalizedValue);
  const hit = candidate.certifications.find((c) => {
    const blob = norm([c.name, c.issuingAuthority].filter(Boolean).join(" "));
    return blob.includes(needle) || needle.includes(norm(c.name));
  });
  if (hit) {
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "MATCH",
      rationale: `Certification "${hit.name}" supports "${req.rawValue}".`,
      evidence: {
        dimension: "CERTIFICATIONS",
        requirementId: req.id,
        entityType: "CandidateCertification",
        entityId: hit.id,
        field: "name",
        outcome: "MATCH",
      },
    };
  }
  return {
    importance: req.importance,
    requirementId: req.id,
    label: req.rawValue,
    outcome: "MISMATCH",
    rationale: `Certification "${req.rawValue}" not found in profile.`,
    evidence: null,
  };
}

function evaluateWorkAuthorization(
  req: MatchStructuredRequirement,
  candidate: MatchCandidateInput
): Omit<MatchItemResult, "dimension" | "kind"> {
  const text = `${req.rawValue} ${req.normalizedValue}`.toLowerCase();
  const needsSponsorship =
    /sponsor/i.test(text) || /visa/i.test(text) || /authorization/i.test(text);

  if (!needsSponsorship && !/citizen|permanent|eligible|work auth/i.test(text)) {
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "UNKNOWN",
      rationale: "Work authorization requirement wording is ambiguous.",
      evidence: null,
    };
  }

  if (/no sponsorship|without sponsorship|must be authorized|citizen|permanent resident/i.test(text)) {
    if (
      candidate.workAuthorization === "CITIZEN" ||
      candidate.workAuthorization === "PERMANENT_RESIDENT"
    ) {
      return {
        importance: req.importance,
        requirementId: req.id,
        label: req.rawValue,
        outcome: "MATCH",
        rationale: "Candidate work authorization aligns with role constraints.",
        evidence: {
          dimension: "WORK_AUTHORIZATION",
          requirementId: req.id,
          entityType: "Candidate",
          entityId: candidate.candidateId,
          field: "workAuthorization",
          outcome: "MATCH",
        },
      };
    }
    if (candidate.requiresSponsorship) {
      return {
        importance: req.importance,
        requirementId: req.id,
        label: req.rawValue,
        outcome: "MISMATCH",
        rationale: "Role appears to disallow sponsorship; candidate requires sponsorship.",
        evidence: null,
      };
    }
    return {
      importance: req.importance,
      requirementId: req.id,
      label: req.rawValue,
      outcome: "UNKNOWN",
      rationale: "Could not fully verify work authorization against this wording.",
      evidence: null,
    };
  }

  return {
    importance: req.importance,
    requirementId: req.id,
    label: req.rawValue,
    outcome: "UNKNOWN",
    rationale: "Work authorization requirement needs review.",
    evidence: null,
  };
}

function evaluateRemotePreference(
  candidate: MatchCandidateInput,
  job: MatchJobInput
): MatchItemResult {
  const pref = candidate.remotePreference;
  let outcome: MatchOutcome = "UNKNOWN";
  let rationale = "Remote preference comparison incomplete.";

  if (job.isRemote) {
    if (pref === "ONSITE") {
      outcome = "MISMATCH";
      rationale = "Job is remote; candidate prefers onsite.";
    } else {
      outcome = "MATCH";
      rationale = `Remote job aligns with remotePreference=${pref}.`;
    }
  } else {
    if (pref === "REMOTE_ONLY") {
      outcome = "MISMATCH";
      rationale = "Job is not remote; candidate prefers remote only.";
    } else if (pref === "FLEXIBLE" || pref === "HYBRID" || pref === "ONSITE") {
      outcome = "MATCH";
      rationale = `Non-remote job is compatible with remotePreference=${pref}.`;
    }
  }

  return {
    dimension: "REMOTE_PREFERENCE",
    kind: "PREFERENCE",
    importance: "STRUCTURED",
    requirementId: null,
    label: "Work arrangement",
    outcome,
    rationale,
    evidence: {
      dimension: "REMOTE_PREFERENCE",
      requirementId: null,
      entityType: "Candidate",
      entityId: candidate.candidateId,
      field: "remotePreference",
      outcome,
    },
  };
}

function evaluateSalaryPreference(
  candidate: MatchCandidateInput,
  job: MatchJobInput
): MatchItemResult {
  const cMin = candidate.desiredSalaryMin;
  const cMax = candidate.desiredSalaryMax;
  const jMin = job.salaryMin;
  const jMax = job.salaryMax;

  if (cMin == null && cMax == null) {
    return {
      dimension: "SALARY",
      kind: "PREFERENCE",
      importance: "STRUCTURED",
      requirementId: null,
      label: "Compensation",
      outcome: "UNKNOWN",
      rationale: "Candidate salary expectations are not available.",
      evidence: null,
    };
  }
  if (jMin == null && jMax == null) {
    return {
      dimension: "SALARY",
      kind: "PREFERENCE",
      importance: "STRUCTURED",
      requirementId: null,
      label: "Compensation",
      outcome: "UNKNOWN",
      rationale: "Job structured salary range is not available.",
      evidence: null,
    };
  }

  const candMin = cMin ?? 0;
  const candMax = cMax ?? Number.MAX_SAFE_INTEGER;
  const jobMinV = jMin ?? 0;
  const jobMaxV = jMax ?? Number.MAX_SAFE_INTEGER;
  const overlaps = candMin <= jobMaxV && jobMinV <= candMax;

  // Preference mismatch: job max below candidate minimum target
  if (cMin != null && jMax != null && jMax < cMin) {
    return {
      dimension: "SALARY",
      kind: "PREFERENCE",
      importance: "STRUCTURED",
      requirementId: null,
      label: "Compensation",
      outcome: "MISMATCH",
      rationale: `Job salary max ${jMax} is below candidate target min ${cMin}.`,
      evidence: {
        dimension: "SALARY",
        requirementId: null,
        entityType: "Candidate",
        entityId: candidate.candidateId,
        field: "desiredSalaryMin",
        outcome: "MISMATCH",
      },
    };
  }

  return {
    dimension: "SALARY",
    kind: "PREFERENCE",
    importance: "STRUCTURED",
    requirementId: null,
    label: "Compensation",
    outcome: overlaps ? "MATCH" : "MISMATCH",
    rationale: overlaps
      ? "Candidate salary expectations overlap the listed job range."
      : "Candidate salary expectations do not overlap the listed job range.",
    evidence: {
      dimension: "SALARY",
      requirementId: null,
      entityType: "Candidate",
      entityId: candidate.candidateId,
      field: "desiredSalaryMin",
      outcome: overlaps ? "MATCH" : "MISMATCH",
    },
  };
}

function evaluateLocationPreference(
  candidate: MatchCandidateInput,
  job: MatchJobInput
): MatchItemResult {
  if (!job.location || !job.location.trim()) {
    return {
      dimension: "LOCATION",
      kind: "PREFERENCE",
      importance: "STRUCTURED",
      requirementId: null,
      label: "Location",
      outcome: "UNKNOWN",
      rationale: "Job location is not specified.",
      evidence: null,
    };
  }
  if (!candidate.targetLocations.length) {
    return {
      dimension: "LOCATION",
      kind: "PREFERENCE",
      importance: "STRUCTURED",
      requirementId: null,
      label: "Location",
      outcome: "UNKNOWN",
      rationale: "Candidate has no target locations set.",
      evidence: null,
    };
  }

  const jobLoc = norm(job.location);
  const hit = candidate.targetLocations.some((t) => {
    const n = norm(t);
    return jobLoc.includes(n) || n.includes(jobLoc);
  });

  // Remote jobs: treat targetLocations containing "remote" as match signal
  if (job.isRemote) {
    const remoteWanted = candidate.targetLocations.some((t) =>
      /remote/i.test(t)
    );
    if (remoteWanted || hit) {
      return {
        dimension: "LOCATION",
        kind: "PREFERENCE",
        importance: "STRUCTURED",
        requirementId: null,
        label: "Location",
        outcome: "MATCH",
        rationale: "Remote job aligns with candidate location preferences.",
        evidence: {
          dimension: "LOCATION",
          requirementId: null,
          entityType: "Candidate",
          entityId: candidate.candidateId,
          field: "targetLocations",
          outcome: "MATCH",
        },
      };
    }
  }

  return {
    dimension: "LOCATION",
    kind: "PREFERENCE",
    importance: "STRUCTURED",
    requirementId: null,
    label: "Location",
    outcome: hit ? "MATCH" : "MISMATCH",
    rationale: hit
      ? "Job location overlaps candidate target locations."
      : "Job location may not match stated location preferences.",
    evidence: {
      dimension: "LOCATION",
      requirementId: null,
      entityType: "Candidate",
      entityId: candidate.candidateId,
      field: "targetLocations",
      outcome: hit ? "MATCH" : "MISMATCH",
    },
  };
}

function evaluateEmploymentTypePreference(): MatchItemResult {
  // v1: no candidate employment-type preference field → NOT_APPLICABLE
  return {
    dimension: "EMPLOYMENT_TYPE",
    kind: "PREFERENCE",
    importance: "STRUCTURED",
    requirementId: null,
    label: "Employment type",
    outcome: "NOT_APPLICABLE",
    rationale:
      "Candidate employment-type preference is not structured in v1.",
    evidence: null,
  };
}

function evaluateRequirement(
  req: MatchStructuredRequirement,
  candidate: MatchCandidateInput
): MatchItemResult | null {
  if (isPreferenceRequirement(req.category)) {
    // Preference dimensions are evaluated from structured Job fields in v1
    // to avoid double-counting ambiguous JD preference requirements.
    return null;
  }

  const dim = qualificationDimension(req.category);
  if (!dim) return null;

  // Importance UNKNOWN / NEEDS_REVIEW on qualification → evaluate but force UNKNOWN outcome path for required counting:
  // We still compute evidence; if importance isn't REQUIRED/PREFERRED, treat as preferred informational.
  let importance = req.importance;
  if (importance === "UNKNOWN" || importance === "NEEDS_REVIEW") {
    importance = "PREFERRED";
  }

  let core: Omit<MatchItemResult, "dimension" | "kind">;
  if (dim === "SKILLS") core = evaluateSkill(req, candidate);
  else if (dim === "EXPERIENCE") core = evaluateExperience(req, candidate);
  else if (dim === "EDUCATION") core = evaluateEducation(req, candidate);
  else if (dim === "CERTIFICATIONS") core = evaluateCertification(req, candidate);
  else core = evaluateWorkAuthorization(req, candidate);

  return {
    dimension: dim,
    kind: "QUALIFICATION",
    ...core,
    importance,
  };
}

/**
 * Pure matching.v1 evaluation.
 * Does not persist, does not create Application/Opportunity, does not call LLM.
 */
export function evaluateCandidateJobMatch(input: {
  candidate: MatchCandidateInput;
  job: MatchJobInput;
  requirementSet: MatchRequirementSetInput;
  asOf?: Date;
}): MatchEvaluationResult {
  if (input.candidate.organizationId !== input.job.organizationId) {
    throw new Error("CROSS_TENANT_MATCH_DENIED");
  }
  if (
    input.job.visibility === "CANDIDATE_PRIVATE" &&
    input.job.ownerCandidateId !== input.candidate.candidateId
  ) {
    throw new Error("PRIVATE_JOB_MATCH_DENIED");
  }

  const items: MatchItemResult[] = [];
  const usableSet =
    input.requirementSet != null &&
    input.requirementSet.freshness === "CURRENT" &&
    Array.isArray(input.requirementSet.requirements);

  if (usableSet && input.requirementSet) {
    for (const req of input.requirementSet.requirements) {
      const item = evaluateRequirement(req, input.candidate);
      if (item) items.push(item);
    }
  }

  // Structured preference dimensions (always when job is evaluable)
  items.push(evaluateRemotePreference(input.candidate, input.job));
  items.push(evaluateSalaryPreference(input.candidate, input.job));
  items.push(evaluateLocationPreference(input.candidate, input.job));
  items.push(evaluateEmploymentTypePreference());

  const hasStructuredPreferenceSignal =
    input.job.salaryMin != null ||
    input.job.salaryMax != null ||
    Boolean(input.job.location) ||
    true; // remotePreference always comparable via isRemote

  const counters = countMatchCounters(items);
  const category = categorizeMatch({
    counters,
    hasUsableRequirementSet: Boolean(usableSet),
    hasStructuredPreferenceSignal,
  });

  const evaluatedAt = (input.asOf ?? new Date()).toISOString();
  const sourceDataVersion = buildMatchSourceDataVersion({
    candidate: input.candidate,
    job: input.job,
    requirementSet: input.requirementSet,
  });

  const presentation = buildMatchPresentation({
    category,
    items,
    jobTitle: input.job.title,
  });

  return {
    matchingContractVersion: MATCHING_CONTRACT_VERSION,
    category,
    items,
    counters,
    presentation,
    sourceDataVersion,
    evaluatedAt,
    jobSafe: {
      jobId: input.job.jobId,
      title: input.job.title,
      companyName: input.job.companyName,
      location: input.job.location,
      isRemote: input.job.isRemote,
      employmentType: input.job.employmentType,
      salaryMin: input.job.salaryMin,
      salaryMax: input.job.salaryMax,
      salaryCurrency: input.job.salaryCurrency,
    },
  };
}

/** Candidate-safe scrubber for API payloads — never includes raw requirements. */
export function toCandidateSafeMatchPayload(result: MatchEvaluationResult): {
  matchingContractVersion: string;
  category: string;
  categoryLabel: string;
  presentation: MatchEvaluationResult["presentation"];
  evaluatedAt: string;
  job: MatchEvaluationResult["jobSafe"];
  /** High-level dimension outcomes only — no requirement dumps. */
  qualificationOutcomes: Array<{
    dimension: string;
    outcome: MatchOutcome;
    label: string;
  }>;
  preferenceOutcomes: Array<{
    dimension: string;
    outcome: MatchOutcome;
    label: string;
  }>;
} {
  return {
    matchingContractVersion: result.matchingContractVersion,
    category: result.category,
    categoryLabel: result.presentation.categoryLabel,
    presentation: result.presentation,
    evaluatedAt: result.evaluatedAt,
    job: result.jobSafe,
    qualificationOutcomes: result.items
      .filter((i) => i.kind === "QUALIFICATION" && i.outcome !== "NOT_APPLICABLE")
      .map((i) => ({
        dimension: i.dimension,
        outcome: i.outcome,
        label: i.label,
      })),
    preferenceOutcomes: result.items
      .filter((i) => i.kind === "PREFERENCE" && i.outcome !== "NOT_APPLICABLE")
      .map((i) => ({
        dimension: i.dimension,
        outcome: i.outcome,
        label: i.label,
      })),
  };
}
