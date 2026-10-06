import type {
  MatchCategory,
  MatchDimension,
  MatchOutcome,
  PreferenceDimension,
  QualificationDimension,
} from "./constants";

/**
 * Pure matching.v1 inputs — no Application id, no Phase 2 result types.
 */

export type MatchRequirementImportance =
  | "REQUIRED"
  | "PREFERRED"
  | "UNKNOWN"
  | "NEEDS_REVIEW";

export type MatchRequirementCategory =
  | "REQUIRED_SKILL"
  | "PREFERRED_SKILL"
  | "EXPERIENCE"
  | "EDUCATION"
  | "CERTIFICATION"
  | "LOCATION"
  | "REMOTE_POLICY"
  | "WORK_AUTHORIZATION"
  | "SALARY"
  | "EMPLOYMENT_TYPE"
  | "SENIORITY"
  | "RESPONSIBILITY"
  | "TECHNOLOGY"
  | "DOMAIN_KNOWLEDGE";

export type MatchStructuredRequirement = {
  id: string;
  category: MatchRequirementCategory;
  rawValue: string;
  normalizedValue: string;
  importance: MatchRequirementImportance;
};

export type MatchCandidateSkill = { id: string; name: string };
export type MatchCandidateExperience = {
  id: string;
  jobTitle: string;
  companyName: string;
  technologies: string[];
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
};
export type MatchCandidateEducation = {
  id: string;
  degree: string | null;
  fieldOfStudy: string | null;
  institution: string;
};
export type MatchCandidateCertification = {
  id: string;
  name: string;
  issuingAuthority: string | null;
};
export type MatchCandidateProject = {
  id: string;
  technologies: string[];
};

export type MatchCandidateInput = {
  candidateId: string;
  organizationId: string;
  updatedAt: string;
  city: string | null;
  state: string | null;
  country: string | null;
  totalYearsExperience: number | null;
  workAuthorization: string;
  requiresSponsorship: boolean;
  remotePreference: "REMOTE_ONLY" | "HYBRID" | "ONSITE" | "FLEXIBLE";
  targetLocations: string[];
  targetRoles: string[];
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  salaryCurrency: string;
  skills: MatchCandidateSkill[];
  experiences: MatchCandidateExperience[];
  educations: MatchCandidateEducation[];
  certifications: MatchCandidateCertification[];
  projects: MatchCandidateProject[];
};

export type MatchJobInput = {
  jobId: string;
  organizationId: string;
  title: string;
  companyName: string;
  location: string | null;
  isRemote: boolean;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  status: "OPEN" | "CLOSED" | "ARCHIVED";
  visibility: "GLOBAL" | "CANDIDATE_PRIVATE";
  ownerCandidateId: string | null;
};

export type MatchRequirementSetInput = {
  requirementSetId: string;
  snapshotId: string;
  contentHash: string;
  schemaVersion: string;
  normalizationVersion: string;
  extractionVersion: string;
  freshness: "CURRENT" | "STALE" | "RECOMPUTE_REQUIRED";
  requirements: MatchStructuredRequirement[];
} | null;

export type MatchEvidenceRef = {
  dimension: MatchDimension;
  requirementId: string | null;
  entityType: string | null;
  entityId: string | null;
  field: string | null;
  outcome: MatchOutcome;
};

export type MatchItemResult = {
  dimension: MatchDimension;
  kind: "QUALIFICATION" | "PREFERENCE";
  importance: MatchRequirementImportance | "STRUCTURED";
  requirementId: string | null;
  label: string;
  outcome: MatchOutcome;
  /** Internal rationale — never sent raw to clients without presentation mapping. */
  rationale: string;
  evidence: MatchEvidenceRef | null;
};

export type MatchCategoryCounters = {
  rMatch: number;
  rPartial: number;
  rMismatch: number;
  rUnknown: number;
  pMatch: number;
  pMismatch: number;
  prefMismatch: number;
};

export type MatchPresentation = {
  why: string;
  strengths: Array<{ title: string; message: string }>;
  thingsToCheck: Array<{ title: string; message: string }>;
  preferences: Array<{ title: string; message: string; tone: "ok" | "warn" | "info" }>;
  categoryLabel: string;
};

export type MatchEvaluationResult = {
  matchingContractVersion: "matching.v1";
  category: MatchCategory;
  items: MatchItemResult[];
  counters: MatchCategoryCounters;
  presentation: MatchPresentation;
  sourceDataVersion: string;
  evaluatedAt: string;
  /** Candidate-safe job fields only — for persistence/presentation helpers. */
  jobSafe: {
    jobId: string;
    title: string;
    companyName: string;
    location: string | null;
    isRemote: boolean;
    employmentType: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
  };
};

export type QualificationDimensionResult = {
  dimension: QualificationDimension;
  outcomes: MatchOutcome[];
};

export type PreferenceDimensionResult = {
  dimension: PreferenceDimension;
  outcomes: MatchOutcome[];
};
