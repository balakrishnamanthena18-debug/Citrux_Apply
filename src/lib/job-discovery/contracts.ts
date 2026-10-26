/**
 * Global Job Discovery & Collection Engine — Validation Contracts
 *
 * Implements strict Zod validation for external search parameters,
 * administrative collection triggers, and provider configurations.
 */

import { z } from "zod";

export const JobWorkArrangementSchema = z.enum([
  "REMOTE",
  "HYBRID",
  "ONSITE",
  "UNSPECIFIED",
]);

export const JobEmploymentTypeSchema = z.enum([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "TEMPORARY",
]);

export const JobVerificationStatusSchema = z.enum([
  "NEWLY_DISCOVERED",
  "SOURCE_CONFIRMED",
  "NEEDS_VERIFICATION",
  "STALE",
  "CLOSED",
  "EXPIRED",
  "COLLECTION_FAILED",
]);

export const JobStatusSchema = z.enum(["OPEN", "CLOSED", "ARCHIVED"]);

/** Global search query validation */
export const JobSearchQuerySchema = z.object({
  query: z.string().max(200).optional(),
  exactPhrase: z.string().max(200).optional(),
  excludedKeywords: z.array(z.string().max(50)).max(20).optional(),
  companyName: z.string().max(100).optional(),
  skills: z.array(z.string().max(50)).max(20).optional(),
  requiredSkills: z.array(z.string().max(50)).max(20).optional(),
  preferredSkills: z.array(z.string().max(50)).max(20).optional(),
  industries: z.array(z.string().max(64)).max(20).optional(),
  countries: z.array(z.string().max(10)).max(20).optional(),
  states: z.array(z.string().max(100)).max(20).optional(),
  cities: z.array(z.string().max(100)).max(20).optional(),
  workArrangements: z.array(JobWorkArrangementSchema).optional(),
  seniorityLevels: z.array(z.string().max(32)).max(10).optional(),
  employmentTypes: z.array(JobEmploymentTypeSchema).optional(),
  experienceMin: z.number().nonnegative().optional(),
  experienceMax: z.number().nonnegative().optional(),
  salaryMin: z.number().nonnegative().optional(),
  salaryMax: z.number().nonnegative().optional(),
  salaryCurrency: z.string().max(10).optional(),
  salaryPeriod: z.string().max(20).optional(),
  visaSponsored: z.boolean().optional(),
  verificationStatuses: z.array(JobVerificationStatusSchema).optional(),
  availabilityStatuses: z.array(JobStatusSchema).optional(),
  providerIds: z.array(z.string().max(64)).max(20).optional(),
  postedWithinDays: z.number().int().positive().max(365).optional(),
  savedOnly: z.boolean().optional(),
  hideSaved: z.boolean().optional(),
  sortBy: z.enum(["relevance", "newest", "salary_desc", "quality"]).default("newest"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ValidatedJobSearchQuery = z.infer<typeof JobSearchQuerySchema>;

/** Administrative manual collection trigger payload */
export const CollectionTriggerSchema = z.object({
  providerId: z.string().max(64).optional(),
  keywords: z.string().max(200).optional(),
  country: z.string().max(10).optional(),
  industry: z.string().max(64).optional(),
  maxJobs: z.number().int().min(1).max(500).default(50),
});

export type ValidatedCollectionTrigger = z.infer<typeof CollectionTriggerSchema>;

/** Save / Bookmark Job Payload */
export const SaveJobSchema = z.object({
  discoveredJobId: z.string().uuid("Invalid discovered job ID"),
  notes: z.string().max(1000).optional(),
});

/** Promote / Import Discovered Job to Canonical Catalog */
export const PromoteToCatalogSchema = z.object({
  discoveredJobId: z.string().uuid("Invalid discovered job ID"),
  visibility: z.enum(["GLOBAL", "CANDIDATE_PRIVATE"]).default("GLOBAL"),
  ownerCandidateId: z.string().uuid().optional(),
  qualificationNotes: z.string().max(2000).optional(),
});

/** Provider configuration update */
export const ProviderConfigUpdateSchema = z.object({
  providerId: z.string().max(64),
  isEnabled: z.boolean().optional(),
  rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
  rateLimitDaily: z.number().int().min(10).max(100000).optional(),
});
