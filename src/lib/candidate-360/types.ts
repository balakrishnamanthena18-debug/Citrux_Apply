/**
 * Phase 7E.1 — Candidate 360 Composition Types
 * Strictly implements Phase 7D / 7D.1 Product Contract.
 */

import type {
  CandidateCareerIntelligenceDTO,
  OutcomesSummaryDTO,
} from "@/lib/career/types";

export interface Candidate360OverviewDTO {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  headline: string | null;
  location: string | null;
  workAuthorization: string;
  requiresSponsorship: boolean;
  verificationStatus: string;
  assignedSpecialist: {
    id: string;
    name: string;
    email: string;
  } | null;
  totalYearsExperience: number | null;
  applicationAuthMode: string;
}

export interface ResumeIntelligenceSummaryDTO {
  hasResume: boolean;
  status: "NOT_STARTED" | "QUEUED" | "ANALYZING" | "READY" | "STALE" | "FAILED";
  overallLabel: string | null;
  atsLabel: string | null;
  atsSummary: string | null;
  findingsCount: number;
  documentTitle: string | null;
  reviewedAt: string | null;
}

export interface ApplicationIntelligenceSummaryItem {
  id: string;
  jobTitle: string;
  companyName: string;
  status: string;
  readinessState: string | null;
  blockersCount: number;
  warningsCount: number;
  createdAt: string;
}

export interface ApplicationIntelligenceSummaryDTO {
  totalApplications: number;
  readyCount: number;
  blockedCount: number;
  warningCount: number;
  recentApplications: ApplicationIntelligenceSummaryItem[];
}

export interface JobMatchingSummaryItem {
  jobId: string;
  jobTitle: string;
  companyName: string;
  location: string | null;
  isRemote: boolean;
  matchCategory: string;
  isSaved: boolean;
  isRequested: boolean;
}

export interface JobMatchingSummaryDTO {
  totalRelevantMatches: number;
  strongMatchCount: number;
  goodMatchCount: number;
  savedOpportunitiesCount: number;
  requestedOpportunitiesCount: number;
  topMatches: JobMatchingSummaryItem[];
}

export interface StaffOperationalContextDTO {
  internalNotesCount: number;
  activeTasksCount: number;
  attestationsCount: number;
}

export interface Candidate360DTO {
  candidate: Candidate360OverviewDTO;
  career: CandidateCareerIntelligenceDTO;
  resume: ResumeIntelligenceSummaryDTO;
  applications: ApplicationIntelligenceSummaryDTO;
  matching: JobMatchingSummaryDTO;
  outcomes: OutcomesSummaryDTO;
  staffContext?: StaffOperationalContextDTO;
  freshness: {
    careerVersion: string;
    computedAt: string;
  };
}
