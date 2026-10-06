import type {
  ApplicationOutcomeProvenance,
  ApplicationOutcomeType,
  ApplicationStatus,
  Role,
} from "@/generated/prisma";

export type OutcomeDateRangePreset =
  | "7d"
  | "30d"
  | "90d"
  | "ytd"
  | "all"
  | "custom";

export interface OutcomeReportingFilters {
  dateRange?: OutcomeDateRangePreset;
  startDate?: string | null;
  endDate?: string | null;
  outcomeType?: ApplicationOutcomeType | "ALL" | "CANDIDATE_REPORTED_ONLY";
  employeeId?: string | null;
  teamKey?: string | null;
  companyName?: string | null;
  limitRecent?: number;
}

export interface OutcomeMetricsSummaryDTO {
  submittedApplicationsCount: number;
  activeApplicationsCount: number;
  closedApplicationsCount: number;
  awaitingOutcomeCount: number;
  recruiterContactsCount: number;
  interviewRequestsCount: number;
  interviewsScheduledCount: number;
  offersReceivedCount: number;
  employerRejectionsCount: number;
  candidateReportedCount: number;
  staffVerifiedCount: number;
}

export interface OutcomeConversionRatesDTO {
  recruiterContactRate: number;
  interviewRequestRate: number;
  interviewScheduledRate: number;
  interviewConversionRate: number;
  offerRate: number;
  employerRejectionRate: number;
}

export interface OutcomeTimingDTO {
  avgDaysToFirstOutcome: number | null;
  avgDaysToRecruiterContact: number | null;
  avgDaysToInterviewRequest: number | null;
  avgDaysToInterviewScheduled: number | null;
  avgDaysToOffer: number | null;
  avgDaysToEmployerRejection: number | null;
  hasRecordedTimingFallback: boolean;
}

export interface OutcomeRecentItemDTO {
  id: string;
  applicationId: string;
  outcomeType: ApplicationOutcomeType;
  outcomeLabel: string;
  provenance: ApplicationOutcomeProvenance;
  provenanceLabel: string;
  recordedAt: string;
  occurredAt: string | null;
  isRecordedFallback: boolean;
  candidateName: string;
  candidateEmail: string;
  companyName: string;
  jobTitle: string;
  ownerName: string;
  ownerEmployeeId: string | null;
  teamKey: string | null;
  hasEvidence: boolean;
  applicationStatus: ApplicationStatus;
}

export interface OutcomeAttributionItemDTO {
  dimensionKey: string;
  dimensionLabel: string;
  submittedCount: number;
  interviewsCount: number;
  offersCount: number;
  rejectionsCount: number;
  awaitingCount: number;
  conversionRate: number;
}

export interface OutcomeReportingResponseDTO {
  roleScope: Role;
  metrics: OutcomeMetricsSummaryDTO;
  conversion: OutcomeConversionRatesDTO;
  timing: OutcomeTimingDTO;
  recentOutcomes: OutcomeRecentItemDTO[];
  employeeBreakdown?: OutcomeAttributionItemDTO[];
  teamBreakdown?: OutcomeAttributionItemDTO[];
  managerBreakdown?: OutcomeAttributionItemDTO[];
  employerBreakdown?: OutcomeAttributionItemDTO[];
  availableFilters: {
    employees: { id: string; name: string }[];
    teams: { key: string; name: string }[];
    employers: string[];
  };
}

export interface OutcomeDetailDTO {
  id: string;
  applicationId: string;
  outcomeType: ApplicationOutcomeType;
  outcomeLabel: string;
  provenance: ApplicationOutcomeProvenance;
  provenanceLabel: string;
  recordedAt: string;
  occurredAt: string | null;
  isRecordedFallback: boolean;
  notes: string | null;
  hasEvidence: boolean;
  evidenceShareable: boolean;
  correctionState: string;
  candidateName: string;
  candidateEmail: string;
  companyName: string;
  jobTitle: string;
  applicationStatus: ApplicationStatus;
  ownerName: string;
  actorName: string;
}
