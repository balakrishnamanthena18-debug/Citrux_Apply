/**
 * Phase 7C — Candidate Career Intelligence & Evidence Graph Types
 * Authoritative types implementing the frozen Phase 7B / 7B.1 Product Contract.
 */

export type FactAuthorityLevel = "VERIFIED" | "EVIDENCED" | "SELF_DECLARED";

export type CareerStrengthTier = "CORE" | "STRONG" | "EMERGING";

export type EvidenceSourceType =
  | "CANDIDATE_SKILL"
  | "EXPERIENCE"
  | "PROJECT"
  | "CERTIFICATION"
  | "DOCUMENT_EXTRACT"
  | "ATTESTATION";

export type CareerGapType = "DATA_GAP" | "EVIDENCE_GAP";

export type CareerRecency = "RECENT" | "NOT_RECENT" | "UNKNOWN";

export type TimelineEventType =
  | "EXPERIENCE"
  | "PROJECT"
  | "EDUCATION"
  | "CERTIFICATION";

export type CareerIntelligenceFreshness = "FRESH" | "STALE" | "UNKNOWN";

export interface CareerEvidenceSourceItem {
  sourceType: EvidenceSourceType;
  sourceId: string;
  sourceField: string;
  displayContext: string;
  recordedAt: string;
  isVerified: boolean;
  recency: CareerRecency;
}

export interface EvidencedSkillDTO {
  name: string;
  normalizedName: string;
  authorityLevel: FactAuthorityLevel;
  evidenceDepth: number;
  sources: CareerEvidenceSourceItem[];
  recency: CareerRecency;
  strengthTier: CareerStrengthTier;
}

export interface CareerStrengthItem {
  skillName: string;
  normalizedName: string;
  tier: CareerStrengthTier;
  evidenceDepth: number;
  rationale: string;
  recency: CareerRecency;
}

export interface CareerGapItem {
  type: CareerGapType;
  category: string;
  title: string;
  description: string;
  skillName?: string;
  recommendation: string;
}

export interface TimelineEventItem {
  id: string;
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent?: boolean;
  displayDate: string;
  details: string[];
  technologies: string[];
  sourceId: string;
}

export interface CareerSnapshotDTO {
  totalYearsExperience: number | null;
  headline: string | null;
  topStrengths: string[];
  verifiedSkillsCount: number;
  evidencedSkillsCount: number;
  selfDeclaredSkillsCount: number;
  totalEvidencedEntities: number;
}

export interface CareerDirectionDTO {
  targetRoles: string[];
  targetLocations: string[];
  remotePreference: string;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  salaryCurrency: string;
}

export interface OutcomesSummaryItem {
  outcomeType: string;
  recordedAt: string;
  candidateVisible: boolean;
}

export interface OutcomesSummaryDTO {
  totalOutcomes: number;
  interviewRequestsCount: number;
  offersCount: number;
  employerDeclinesCount: number;
  recentOutcomes: OutcomesSummaryItem[];
}

export interface CandidateCareerIntelligenceDTO {
  candidate: {
    id: string;
    fullName: string | null;
    email: string;
    headline: string | null;
    city: string | null;
    state: string | null;
    country: string;
    workAuthorization: string;
    verificationStatus: string;
  };
  careerSnapshot: CareerSnapshotDTO;
  skills: EvidencedSkillDTO[];
  experience: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    startDate: string;
    endDate: string | null;
    isCurrent: boolean;
    technologies: string[];
    achievements: string[];
  }>;
  projects: Array<{
    id: string;
    title: string;
    role: string | null;
    url: string | null;
    technologies: string[];
    highlights: string[];
    startDate: string | null;
    endDate: string | null;
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string;
    fieldOfStudy: string | null;
    graduationYear: number | null;
  }>;
  certifications: Array<{
    id: string;
    name: string;
    issuingAuthority: string;
    issueDate: string | null;
    expirationDate: string | null;
    doesNotExpire: boolean;
  }>;
  evidence: CareerEvidenceSourceItem[];
  strengths: CareerStrengthItem[];
  gaps: CareerGapItem[];
  timeline: TimelineEventItem[];
  careerDirection: CareerDirectionDTO;
  outcomesSummary: OutcomesSummaryDTO;
  freshness: {
    status: CareerIntelligenceFreshness;
    sourceDataVersion: string;
    computedAt: string;
  };
}
