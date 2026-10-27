"use server";

/**
 * Global Job Discovery & Collection Engine — Server Actions
 *
 * Implements authoritative server actions for job search, bookmarking,
 * promotion to the canonical OOS catalog, and admin collection controls.
 */

import { getAuthenticatedContext, requireAdmin, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { prisma } from "@/lib/db/prisma";
import { jobCollectionRunner } from "./runner";
import { jobProviderRegistry } from "./registry";
import { liveJobSearchEngine } from "./live-search";
import { calculateRelevance } from "./relevance";
import {
  JobSearchQuerySchema,
  CollectionTriggerSchema,
  SaveJobSchema,
  PromoteToCatalogSchema,
  ProviderConfigUpdateSchema,
  JobAutocompleteQuerySchema,
} from "./contracts";
import { jobDiscoveryAutocompleteEngine, type AutocompleteSuggestion } from "./autocomplete";
import type {
  JobSearchFilters,
  PaginatedJobSearchResponse,
  DiscoveredJobSearchResult,
  CollectionExecutionSummary,
  CollectionEngineMetrics,
} from "./types";
import { AuditAction } from "@/generated/prisma";

export async function searchDiscoveredJobsAction(
  rawFilters: JobSearchFilters
): Promise<{ success: boolean; data?: PaginatedJobSearchResponse; error?: string }> {
  const apiEntryMs = Date.now();
  try {
    const ctx = await getAuthenticatedContext();
    const validated = JobSearchQuerySchema.parse(rawFilters);

    // Execute live multi-provider search in request memory (Zero-Bulk-Storage)
    const result = await liveJobSearchEngine.searchLiveJobs(validated, ctx.userId, {
      apiEntryMs,
      correlationId: validated.correlationId,
      clientSubmittedAtMs: validated.clientSubmittedAtMs,
    });

    const apiCompletedAtMs = Date.now();
    if (result.trace) {
      result.trace.apiCompletedAtMs = apiCompletedAtMs;
      result.trace.serverDurationMs = apiCompletedAtMs - apiEntryMs;
      result.trace.checkpoints.push({
        checkpoint: "API_RESPONSE_COMPLETED",
        timestampMs: apiCompletedAtMs,
      });
    }

    return {
      success: true,
      data: result,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Search failed" };
  }
}

/** Save / Bookmark a Discovered Job (Persists single job record on-demand if live) */
export async function saveDiscoveredJobAction(
  param:
    | string
    | {
        jobId?: string;
        jobData?: Partial<DiscoveredJobSearchResult>;
        notes?: string;
      },
  notesParam?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthenticatedContext();

    let targetJobId: string | undefined;
    let notes: string | undefined = notesParam;
    let jobData: Partial<DiscoveredJobSearchResult> | undefined;

    if (typeof param === "string") {
      targetJobId = param;
    } else if (param && typeof param === "object") {
      targetJobId = param.jobId;
      jobData = param.jobData;
      notes = param.notes || notesParam;
    }

    // If jobData is provided, ensure this single job exists in discovered_jobs
    if (jobData && jobData.providerId && jobData.externalId) {
      const existing = await prisma.discoveredJob.findFirst({
        where: {
          OR: [
            { providerId: jobData.providerId, externalId: jobData.externalId },
            ...(jobData.canonicalUrl ? [{ canonicalUrl: jobData.canonicalUrl }] : []),
          ],
        },
      });

      if (existing) {
        targetJobId = existing.id;
      } else {
        const safeTitle = (jobData.title || "Untitled Position").slice(0, 255);
        const safeCompany = (jobData.companyName || "Unknown Employer").slice(0, 255);

        const singleRecord = await prisma.discoveredJob.create({
          data: {
            providerId: jobData.providerId.slice(0, 64),
            externalId: jobData.externalId.slice(0, 255),
            title: safeTitle,
            normalizedTitle: safeTitle,
            companyName: safeCompany,
            normalizedCompany: safeCompany,
            jobDescription: jobData.jobDescription || "",
            requiredSkills: jobData.requiredSkills || [],
            preferredSkills: jobData.preferredSkills || [],
            industry: jobData.industry ? jobData.industry.slice(0, 64) : null,
            employmentType: (jobData.employmentType as any) || "FULL_TIME",
            seniorityLevel: jobData.seniorityLevel ? jobData.seniorityLevel.slice(0, 32) : null,
            experienceMin: jobData.experienceMin || null,
            experienceMax: jobData.experienceMax || null,
            salaryMin: jobData.salaryMin || null,
            salaryMax: jobData.salaryMax || null,
            salaryCurrency: (jobData.salaryCurrency || "USD").slice(0, 10),
            salaryPeriod: (jobData.salaryPeriod || "YEARLY").slice(0, 20),
            country: jobData.country ? jobData.country.slice(0, 10) : null,
            state: jobData.state ? jobData.state.slice(0, 100) : null,
            city: jobData.city ? jobData.city.slice(0, 100) : null,
            workArrangement: (jobData.workArrangement as any) || "UNSPECIFIED",
            postedAt: jobData.postedAt ? new Date(jobData.postedAt) : null,
            closingDate: jobData.closingDate ? new Date(jobData.closingDate) : null,
            externalUrl: (jobData.externalUrl || "").slice(0, 2048),
            canonicalUrl: (jobData.canonicalUrl || jobData.externalUrl || "").slice(0, 2048),
            sourceAttribution: (jobData.sourceAttribution || "External Source").slice(0, 255),
            verificationStatus: (jobData.verificationStatus as any) || "SOURCE_CONFIRMED",
            availabilityStatus: (jobData.availabilityStatus as any) || "OPEN",
            contentFingerprint: Buffer.from(`${safeTitle}:${safeCompany}`).toString("hex").slice(0, 64),
            qualityScore: jobData.qualityScore || 100,
          },
        });
        targetJobId = singleRecord.id;
      }
    }

    if (!targetJobId) {
      return { success: false, error: "Target job could not be identified." };
    }

    // Upsert into saved_jobs
    await prisma.savedJob.upsert({
      where: {
        userId_discoveredJobId: {
          userId: ctx.userId,
          discoveredJobId: targetJobId,
        },
      },
      update: { notes },
      create: {
        userId: ctx.userId,
        discoveredJobId: targetJobId,
        notes,
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to save job" };
  }
}

/** Unsave / Remove Bookmark */
export async function unsaveDiscoveredJobAction(
  jobIdOrCanonicalUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthenticatedContext();
    await prisma.savedJob.deleteMany({
      where: {
        userId: ctx.userId,
        OR: [
          { discoveredJobId: jobIdOrCanonicalUrl },
          {
            discoveredJob: {
              OR: [
                { canonicalUrl: jobIdOrCanonicalUrl },
                { externalUrl: jobIdOrCanonicalUrl },
              ],
            },
          },
        ],
      },
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to remove saved job" };
  }
}

/** Promote Discovered Job to Canonical OOS Catalog Job (Supports Live & Persisted Jobs) */
export async function promoteDiscoveredJobToCatalogAction(params: {
  discoveredJobId?: string;
  jobData?: Partial<DiscoveredJobSearchResult>;
  visibility?: "GLOBAL" | "CANDIDATE_PRIVATE";
  ownerCandidateId?: string;
  qualificationNotes?: string;
}): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    let targetJobId = params.discoveredJobId;
    let title = params.jobData?.title || "";
    let companyName = params.jobData?.companyName || "";
    let jobDescription = params.jobData?.jobDescription || "";
    let location = params.jobData?.city || params.jobData?.country || "Remote";
    let isRemote = params.jobData?.workArrangement === "REMOTE";
    let employmentType = (params.jobData?.employmentType as any) || "FULL_TIME";
    let salaryMin = params.jobData?.salaryMin;
    let salaryMax = params.jobData?.salaryMax;
    let salaryCurrency = params.jobData?.salaryCurrency || "USD";
    let source = params.jobData?.sourceAttribution || "Live Discovery Provider";
    let externalUrl = params.jobData?.externalUrl || "";

    if (targetJobId && targetJobId.length === 36 && !targetJobId.startsWith("live_")) {
      const discovered = await prisma.discoveredJob.findUnique({
        where: { id: targetJobId },
      });
      if (discovered) {
        title = discovered.title;
        companyName = discovered.companyName;
        jobDescription = discovered.jobDescription;
        location = discovered.city || discovered.country || "Remote";
        isRemote = discovered.workArrangement === "REMOTE";
        employmentType = discovered.employmentType;
        salaryMin = discovered.salaryMin;
        salaryMax = discovered.salaryMax;
        salaryCurrency = discovered.salaryCurrency || "USD";
        source = discovered.sourceAttribution;
        externalUrl = discovered.externalUrl;
      }
    } else if (params.jobData && params.jobData.providerId && params.jobData.externalId) {
      // Ensure single discoveredJob record exists so it can be linked
      const safeTitle = (params.jobData.title || "Untitled Position").slice(0, 255);
      const safeCompany = (params.jobData.companyName || "Unknown Employer").slice(0, 255);

      const single = await prisma.discoveredJob.upsert({
        where: {
          providerId_externalId: {
            providerId: params.jobData.providerId.slice(0, 64),
            externalId: params.jobData.externalId.slice(0, 255),
          },
        },
        update: {},
        create: {
          providerId: params.jobData.providerId.slice(0, 64),
          externalId: params.jobData.externalId.slice(0, 255),
          title: safeTitle,
          normalizedTitle: safeTitle,
          companyName: safeCompany,
          normalizedCompany: safeCompany,
          jobDescription: params.jobData.jobDescription || "",
          requiredSkills: params.jobData.requiredSkills || [],
          preferredSkills: params.jobData.preferredSkills || [],
          industry: params.jobData.industry ? params.jobData.industry.slice(0, 64) : null,
          employmentType: (params.jobData.employmentType as any) || "FULL_TIME",
          seniorityLevel: params.jobData.seniorityLevel ? params.jobData.seniorityLevel.slice(0, 32) : null,
          experienceMin: params.jobData.experienceMin || null,
          experienceMax: params.jobData.experienceMax || null,
          salaryMin: params.jobData.salaryMin || null,
          salaryMax: params.jobData.salaryMax || null,
          salaryCurrency: (params.jobData.salaryCurrency || "USD").slice(0, 10),
          salaryPeriod: (params.jobData.salaryPeriod || "YEARLY").slice(0, 20),
          country: params.jobData.country ? params.jobData.country.slice(0, 10) : null,
          state: params.jobData.state ? params.jobData.state.slice(0, 100) : null,
          city: params.jobData.city ? params.jobData.city.slice(0, 100) : null,
          workArrangement: (params.jobData.workArrangement as any) || "UNSPECIFIED",
          postedAt: params.jobData.postedAt ? new Date(params.jobData.postedAt) : null,
          closingDate: params.jobData.closingDate ? new Date(params.jobData.closingDate) : null,
          externalUrl: (params.jobData.externalUrl || "").slice(0, 2048),
          canonicalUrl: (params.jobData.canonicalUrl || params.jobData.externalUrl || "").slice(0, 2048),
          sourceAttribution: (params.jobData.sourceAttribution || "External Source").slice(0, 255),
          verificationStatus: (params.jobData.verificationStatus as any) || "SOURCE_CONFIRMED",
          availabilityStatus: (params.jobData.availabilityStatus as any) || "OPEN",
          contentFingerprint: Buffer.from(`${safeTitle}:${safeCompany}`).toString("hex").slice(0, 64),
          qualityScore: params.jobData.qualityScore || 100,
        },
      });
      targetJobId = single.id;
    }

    if (!title || !companyName) {
      return { success: false, error: "Missing required job details for catalog promotion." };
    }

    // Create canonical Job within RLS context
    const createdJob = await withRlsContext(ctx.userId, async (tx) => {
      const job = await tx.job.create({
        data: {
          organizationId: ctx.organizationId,
          title,
          companyName,
          jobDescription,
          location,
          isRemote,
          employmentType,
          salaryMin,
          salaryMax,
          salaryCurrency,
          source,
          externalUrl,
          qualificationNotes: params.qualificationNotes || null,
          status: "OPEN",
          visibility: params.visibility || "GLOBAL",
          ownerCandidateId:
            params.visibility === "CANDIDATE_PRIVATE"
              ? params.ownerCandidateId || null
              : null,
          createdById: ctx.userId,
        },
      });

      if (targetJobId && targetJobId.length === 36 && !targetJobId.startsWith("live_")) {
        await tx.discoveredJob.update({
          where: { id: targetJobId },
          data: { promotedToJobId: job.id },
        });
      }

      await tx.auditEvent.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          actorType: "USER",
          action: AuditAction.JOB_DISCOVERED_PROMOTED_TO_CATALOG,
          entityType: "Job",
          entityId: job.id,
          details: {
            discoveredJobId: targetJobId,
            visibility: params.visibility || "GLOBAL",
            ownerCandidateId: params.ownerCandidateId,
            jobTitle: title,
            companyName,
          },
        },
      });

      return job;
    });

    return { success: true, jobId: createdJob.id };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to promote job to catalog" };
  }
}

/** Admin: Trigger Collection Run */
export async function triggerJobCollectionAction(
  options: {
    providerId?: string;
    keywords?: string;
    country?: string;
    industry?: string;
    maxJobs?: number;
  } = {}
): Promise<{ success: boolean; summaries?: CollectionExecutionSummary[]; error?: string }> {
  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const validated = CollectionTriggerSchema.parse(options);
    const summaries = await jobCollectionRunner.executeCollection(
      {
        ...validated,
        triggerType: "MANUAL",
      },
      ctx.userId
    );

    // Audit log
    await prisma.auditEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        actorType: "USER",
        action: AuditAction.JOB_DISCOVERY_COLLECTION_TRIGGERED,
        entityType: "JobCollectionRun",
        entityId: summaries[0]?.runId || ctx.userId,
        details: {
          providerId: validated.providerId || "ALL",
          discoveredCount: summaries.reduce((acc, s) => acc + s.jobsDiscovered, 0),
        },
      },
    });

    return { success: true, summaries };
  } catch (err: any) {
    return { success: false, error: err?.message || "Collection execution failed" };
  }
}

/** Admin: Get Collection Engine Dashboard Metrics & Provider Registry */
export async function getCollectionAdminDataAction(): Promise<{
  success: boolean;
  metrics?: CollectionEngineMetrics;
  providers?: any[];
  recentRuns?: any[];
  error?: string;
}> {
  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    await jobProviderRegistry.syncProviderConfigs();

    const [
      totalDiscoveredJobs,
      activeJobs,
      verifiedJobs,
      staleJobs,
      duplicateJobs,
      providers,
      recentRuns,
      lastRun,
    ] = await Promise.all([
      prisma.discoveredJob.count(),
      prisma.discoveredJob.count({ where: { availabilityStatus: "OPEN" } }),
      prisma.discoveredJob.count({ where: { verificationStatus: "SOURCE_CONFIRMED" } }),
      prisma.discoveredJob.count({ where: { verificationStatus: "STALE" } }),
      prisma.discoveredJob.count({ where: { isDuplicate: true } }),
      prisma.jobProviderConfig.findMany({ orderBy: { providerId: "asc" } }),
      prisma.jobCollectionRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
        include: {
          triggeredBy: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.jobCollectionRun.findFirst({
        orderBy: { startedAt: "desc" },
      }),
    ]);

    const metrics: CollectionEngineMetrics = {
      totalDiscoveredJobs,
      activeJobs,
      verifiedJobs,
      staleJobs,
      duplicateJobs,
      providersTotal: providers.length,
      providersActive: providers.filter((p) => p.isEnabled).length,
      lastCollectionRun: lastRun,
      sourceBreakdown: {},
      industryBreakdown: {},
    };

    return {
      success: true,
      metrics,
      providers,
      recentRuns,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to load admin metrics" };
  }
}

/** Admin: Update Provider Configuration */
export async function updateProviderConfigAction(params: {
  providerId: string;
  isEnabled?: boolean;
  rateLimitPerMinute?: number;
  rateLimitDaily?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const validated = ProviderConfigUpdateSchema.parse(params);

    await prisma.jobProviderConfig.update({
      where: { providerId: validated.providerId },
      data: {
        isEnabled: validated.isEnabled,
        rateLimitPerMinute: validated.rateLimitPerMinute,
        rateLimitDaily: validated.rateLimitDaily,
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update provider" };
  }
}

/** Location-Aware Autocomplete Suggestions */
export async function getJobAutocompleteSuggestionsAction(params: {
  query?: string;
  type?: "all" | "main" | "state" | "city" | "title" | "skill" | "employer" | "location";
  country?: string;
  state?: string;
  limit?: number;
}): Promise<{ success: boolean; data?: AutocompleteSuggestion[]; error?: string; unauthorized?: boolean }> {
  try {
    const ctx = await getAuthenticatedContext();
    requireEmployeeOrAdmin(ctx);

    const validated = JobAutocompleteQuerySchema.parse(params);
    const suggestions = await jobDiscoveryAutocompleteEngine.searchAutocomplete(validated);
    return { success: true, data: suggestions };
  } catch (err: any) {
    if (err?.name === "AuthenticationError" || err?.name === "AuthorizationError") {
      return { success: false, error: "Unauthorized access", unauthorized: true };
    }
    return { success: false, error: err?.message || "Autocomplete lookup failed" };
  }
}
