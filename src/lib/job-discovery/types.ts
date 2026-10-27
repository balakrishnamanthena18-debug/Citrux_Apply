/**
 * Global Job Discovery & Collection Engine — Domain Types & Interfaces
 *
 * Provides normalized domain types, provider contracts, search filter interfaces,
 * and relevance scoring structures.
 */

import {
  JobEmploymentType,
  JobVerificationStatus,
  JobWorkArrangement,
  CollectionRunStatus,
  CollectionTriggerType,
  JobStatus,
} from "@/generated/prisma";

export {
  JobEmploymentType,
  JobVerificationStatus,
  JobWorkArrangement,
  CollectionRunStatus,
  CollectionTriggerType,
  JobStatus,
};

/** Industry taxonomy */
export type JobIndustry =
  | "technology"
  | "it_support"
  | "cybersecurity"
  | "cloud_enterprise"
  | "data_ai"
  | "finance_banking"
  | "healthcare"
  | "sales_marketing"
  | "hr_admin"
  | "manufacturing_engineering"
  | "education_research"
  | "public_sector"
  | "retail_logistics"
  | "hospitality"
  | "other";

/** Seniority levels */
export type JobSeniority =
  | "INTERN"
  | "ENTRY"
  | "MID"
  | "SENIOR"
  | "LEAD"
  | "DIRECTOR"
  | "EXECUTIVE";

/** Normalized job record produced by provider adapters */
export interface NormalizedDiscoveredJob {
  providerId: string;
  externalId: string;
  title: string;
  normalizedTitle: string;
  companyName: string;
  normalizedCompany: string;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  industry?: JobIndustry | string | null;
  employmentType: JobEmploymentType;
  seniorityLevel?: JobSeniority | string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: "YEARLY" | "MONTHLY" | "HOURLY" | null;
  country?: string | null; // ISO 2-letter or standard name
  state?: string | null;
  city?: string | null;
  allCities?: string[];
  workArrangement: JobWorkArrangement;
  postedAt?: Date | string | null;
  closingDate?: Date | string | null;
  externalUrl: string;
  canonicalUrl: string;
  sourceAttribution: string;
  verificationStatus: JobVerificationStatus;
  availabilityStatus: JobStatus;
  contentFingerprint: string;
  duplicateGroupId?: string | null;
  isDuplicate?: boolean;
  duplicateReason?: string | null;
  qualityScore: number;
  rawMetadata?: Record<string, unknown> | null;
}

/** Provider category */
export type ProviderCategory =
  | "AGGREGATOR"
  | "DIRECT_ATS"
  | "OFFICIAL_API"
  | "PUBLIC_SECTOR";

/** Search criteria passed to provider adapters */
export interface ProviderSearchParams {
  keywords?: string;
  role?: string;
  skills?: string[];
  country?: string;
  city?: string;
  workArrangement?: JobWorkArrangement;
  employmentType?: JobEmploymentType;
  seniority?: JobSeniority | string;
  industry?: string;
  page?: number;
  pageSize?: number;
  cursor?: string;
  signal?: AbortSignal;
}

/** Normalized batch result returned by provider adapters */
export interface ProviderFetchResult {
  jobs: NormalizedDiscoveredJob[];
  totalAvailable?: number;
  hasMore: boolean;
  nextCursor?: string;
  providerId: string;
  rateLimitRemaining?: number;
  rateLimitResetSeconds?: number;
  rawCount: number;
  ignoredParams?: Array<{ param: string; did_you_mean?: string }>;
  appliedFilters?: Record<string, string | number | boolean>;
  totalScope?: "CITY" | "STATE" | "COUNTRY" | "GLOBAL";
}

/** Provider health & availability report */
export interface ProviderHealthReport {
  providerId: string;
  isHealthy: boolean;
  isConfigured: boolean;
  latencyMs: number;
  statusMessage: string;
  lastChecked: Date;
  details?: Record<string, unknown>;
}

/** Provider adapter interface */
export interface JobProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly category: ProviderCategory;
  readonly defaultBaseUrl: string;
  readonly rateLimitPerMinute: number;
  readonly rateLimitDaily: number;
  readonly attributionNotice: string;
  readonly permittedTermsUrl?: string;

  isConfigured(): boolean;
  fetchJobs(params: ProviderSearchParams): Promise<ProviderFetchResult>;
  checkHealth(): Promise<ProviderHealthReport>;
}

/** Global Job Search Filters for UI & Server Actions */
export interface JobSearchFilters {
  query?: string;
  exactPhrase?: string;
  excludedKeywords?: string[];
  companyName?: string;
  skills?: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  industries?: string[];
  countries?: string[];
  states?: string[];
  cities?: string[];
  workArrangements?: JobWorkArrangement[];
  seniorityLevels?: string[];
  employmentTypes?: JobEmploymentType[];
  experienceMin?: number;
  experienceMax?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: "HOURLY" | "MONTHLY" | "YEARLY" | string;
  postedWithinDays?: number;
  visaSponsored?: boolean;
  verificationStatuses?: JobVerificationStatus[];
  availabilityStatuses?: JobStatus[];
  providerIds?: string[];
  savedOnly?: boolean;
  hideSaved?: boolean;
  sortBy?: "relevance" | "newest" | "salary_desc" | "quality";
  page?: number;
  pageSize?: number;
  correlationId?: string;
  clientSubmittedAtMs?: number;
}

/** Relevance breakdown explanation */
export interface RelevanceExplanation {
  overallScore: number; // 0 - 100
  titleScore: number;
  skillsScore: number;
  industryScore: number;
  seniorityScore: number;
  locationScore: number;
  freshnessScore: number;
  reasons: string[];
  scoringVersion?: string;
  aiEvidence?: {
    matchExplanation: string;
    matchedSkills: string[];
    missingSkills: string[];
    locationCompatibility: string;
    confidence: number;
    aiAssisted: boolean;
  };
}

/** Search result item returned to UI */
export interface DiscoveredJobSearchResult {
  id: string;
  providerId: string;
  externalId: string;
  title: string;
  companyName: string;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  industry: string | null;
  employmentType: JobEmploymentType;
  seniorityLevel: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  allCities?: string[];
  workArrangement: JobWorkArrangement;
  postedAt: Date | string | null;
  closingDate: Date | string | null;
  lastSeenAt: Date | string;
  firstCollectedAt: Date | string;
  lastCheckedAt: Date | string;
  externalUrl: string;
  canonicalUrl: string;
  sourceAttribution: string;
  verificationStatus: JobVerificationStatus;
  availabilityStatus: JobStatus;
  qualityScore: number;
  isDuplicate: boolean;
  duplicateGroupId: string | null;
  promotedToJobId: string | null;
  isSaved?: boolean;
  relevance?: RelevanceExplanation;
}

/** Provider live execution status reporting */
export interface LiveProviderExecutionStatus {
  providerId: string;
  providerName: string;
  status: "SUCCESS" | "FAILED" | "TIMEOUT" | "UNCONFIGURED";
  latencyMs: number;
  count: number;
  totalReported?: number;
  hasMore?: boolean;
  error?: string;
  ignoredParams?: Array<{ param: string; did_you_mean?: string }>;
  appliedFilters?: Record<string, string | number | boolean>;
  totalScope?: "CITY" | "STATE" | "COUNTRY" | "GLOBAL";
}

/** Paginated Search Response */
export interface PaginatedJobSearchResponse {
  jobs: DiscoveredJobSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  estimatedTotal?: number;
  providerReportedTotal?: number;
  totalScope?: "CITY" | "STATE" | "COUNTRY" | "GLOBAL";
  returnedBatchCount?: number;
  verifiedMatchingCount?: number;
  isExactTotal: boolean;
  isLive?: boolean;
  searchDurationMs?: number;
  providerStatuses?: LiveProviderExecutionStatus[];
  rawProviderCounts?: Record<string, number>;
  uniqueCount: number;
  interpretedPlan?: {
    intentSummary: string;
    role?: string;
    city?: string;
    state?: string;
    country?: string;
    workArrangement?: string;
    salaryMin?: number;
    salaryCurrency?: string;
    isAiInterpreted: boolean;
  };
  appliedFiltersSummary?: {
    providerSide: string[];
    inMemory: string[];
  };
  filterCounts?: {
    industries: Record<string, number>;
    countries: Record<string, number>;
    workArrangements: Record<string, number>;
    verificationStatuses: Record<string, number>;
    providers: Record<string, number>;
  };
  trace?: SearchTraceData;
}

/** Non-sensitive end-to-end search trace checkpoints */
export type SearchTraceCheckpointName =
  | "BROWSER_SUBMISSION"
  | "API_ENTRY"
  | "QUERY_INTERPRETATION_COMPLETED"
  | "PROVIDER_STARTED"
  | "PROVIDER_COMPLETED"
  | "AGGREGATION_RANKING_COMPLETED"
  | "API_RESPONSE_COMPLETED"
  | "BROWSER_RESPONSE_RECEIVED"
  | "FIRST_USABLE_RENDER";

export interface SearchTraceCheckpoint {
  checkpoint: SearchTraceCheckpointName;
  timestampMs: number;
  providerId?: string;
  details?: Record<string, unknown>;
}

export interface SearchTraceData {
  correlationId: string;
  clientSubmittedAtMs?: number;
  apiEntryMs?: number;
  apiCompletedAtMs?: number;
  browserReceivedAtMs?: number;
  firstRenderedAtMs?: number;
  serverDurationMs?: number;
  browserToResultMs?: number;
  checkpoints: SearchTraceCheckpoint[];
}

/** Collection run trigger options */
export interface CollectionTriggerOptions {
  providerId?: string; // If unspecified, run all enabled
  keywords?: string;
  country?: string;
  industry?: string;
  maxJobs?: number;
  triggerType?: CollectionTriggerType;
}

/** Execution summary returned by collection runner */
export interface CollectionExecutionSummary {
  runId: string;
  providerId: string;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  jobsDiscovered: number;
  jobsUpdated: number;
  duplicatesDetected: number;
  failedCount: number;
  durationMs: number;
  errorMessage?: string | null;
}

/** Summary metrics for Collection Engine Admin */
export interface CollectionEngineMetrics {
  totalDiscoveredJobs: number;
  activeJobs: number;
  verifiedJobs: number;
  staleJobs: number;
  duplicateJobs: number;
  providersTotal: number;
  providersActive: number;
  lastCollectionRun?: {
    id: string;
    providerId: string;
    startedAt: Date | string;
    status: CollectionRunStatus;
    jobsDiscovered: number;
    jobsUpdated: number;
    duplicatesDetected: number;
    durationMs: number;
  } | null;
  sourceBreakdown: Record<string, number>;
  industryBreakdown: Record<string, number>;
}
