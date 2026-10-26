/**
 * Global Job Discovery & Collection Engine — Collection Runner
 *
 * Coordinates manual and scheduled collection workflows:
 * - Overlap prevention & concurrency guard
 * - Rate limit budgets & safe execution boundaries
 * - Deduplication against existing repository index
 * - Comprehensive collection run history & audit logging
 */

import { prisma } from "@/lib/db/prisma";
import { jobProviderRegistry } from "./registry";
import { evaluateDeduplication } from "./deduplication";
import { logger } from "@/lib/logger";
import type {
  CollectionTriggerOptions,
  CollectionExecutionSummary,
  NormalizedDiscoveredJob,
  JobProviderAdapter,
} from "./types";

export type { CollectionExecutionSummary };

export class JobCollectionRunner {
  /**
   * Executes a collection run for a specific provider or across all enabled providers
   */
  public async executeCollection(
    options: CollectionTriggerOptions = {},
    userId?: string
  ): Promise<CollectionExecutionSummary[]> {
    await jobProviderRegistry.syncProviderConfigs();

    // Prevent concurrent overlapping runs
    const activeRun = await prisma.jobCollectionRun.findFirst({
      where: {
        status: "RUNNING",
        startedAt: {
          // If stuck for more than 10 minutes, treat as dead
          gt: new Date(Date.now() - 10 * 60 * 1000),
        },
      },
    });

    if (activeRun) {
      throw new Error(
        `Another collection run (${activeRun.id}) is currently in progress for provider ${activeRun.providerId}.`
      );
    }

    // Determine target providers
    let targetProviders: JobProviderAdapter[] = [];
    if (options.providerId) {
      const p = jobProviderRegistry.getProvider(options.providerId);
      if (!p) {
        throw new Error(`Provider not found: ${options.providerId}`);
      }
      targetProviders = [p];
    } else {
      // Get all enabled providers from DB
      const configs = await prisma.jobProviderConfig.findMany({
        where: { isEnabled: true },
      });
      const enabledIds = new Set(configs.map((c) => c.providerId));
      targetProviders = jobProviderRegistry
        .getAllProviders()
        .filter((p) => enabledIds.has(p.id));
    }

    const summaries: CollectionExecutionSummary[] = [];

    for (const provider of targetProviders) {
      const summary = await this.runSingleProviderCollection(provider, options, userId);
      summaries.push(summary);
    }

    return summaries;
  }

  private async runSingleProviderCollection(
    provider: JobProviderAdapter,
    options: CollectionTriggerOptions,
    userId?: string
  ): Promise<CollectionExecutionSummary> {
    const startTime = Date.now();

    // Create CollectionRun record
    const run = await prisma.jobCollectionRun.create({
      data: {
        providerId: provider.id,
        status: "RUNNING",
        triggerType: options.triggerType || "MANUAL",
        triggeredById: userId || null,
        queryFilters: {
          keywords: options.keywords,
          country: options.country,
          industry: options.industry,
          maxJobs: options.maxJobs,
        },
      },
    });

    let jobsDiscovered = 0;
    let jobsUpdated = 0;
    let duplicatesDetected = 0;
    let failedCount = 0;
    let errorMessage: string | null = null;
    let finalStatus: "COMPLETED" | "FAILED" | "PARTIAL" = "COMPLETED";

    try {
      // 1. Fetch raw batch from provider adapter
      const result = await provider.fetchJobs({
        keywords: options.keywords,
        country: options.country,
        industry: options.industry,
        pageSize: Math.min(options.maxJobs || 50, 100),
      });

      // 2. Load existing keys for deduplication
      const existingJobs = await prisma.discoveredJob.findMany({
        select: {
          id: true,
          providerId: true,
          externalId: true,
          canonicalUrl: true,
          contentFingerprint: true,
          duplicateGroupId: true,
        },
        take: 5000,
      });

      const existingIndex = {
        byCanonicalUrl: new Map<string, string>(),
        byFingerprint: new Map<string, string>(),
        byProviderExtId: new Set<string>(),
      };

      for (const ej of existingJobs) {
        existingIndex.byProviderExtId.add(`${ej.providerId}::${ej.externalId}`);
        if (ej.canonicalUrl) {
          existingIndex.byCanonicalUrl.set(
            ej.canonicalUrl,
            ej.duplicateGroupId || `dup-${ej.id}`
          );
        }
        if (ej.contentFingerprint) {
          existingIndex.byFingerprint.set(
            ej.contentFingerprint,
            ej.duplicateGroupId || `dup-${ej.id}`
          );
        }
      }

      // 3. Process each discovered job
      for (const job of result.jobs) {
        try {
          const dedupe = evaluateDeduplication(job, existingIndex);

          // Check if already in DB
          const existing = await prisma.discoveredJob.findUnique({
            where: {
              providerId_externalId: {
                providerId: job.providerId,
                externalId: job.externalId,
              },
            },
          });

          if (existing) {
            // Update last seen
            await prisma.discoveredJob.update({
              where: { id: existing.id },
              data: {
                lastSeenAt: new Date(),
                lastCheckedAt: new Date(),
                closingDate: job.closingDate ? new Date(job.closingDate) : existing.closingDate,
                availabilityStatus: job.availabilityStatus,
                verificationStatus:
                  existing.verificationStatus === "SOURCE_CONFIRMED"
                    ? "SOURCE_CONFIRMED"
                    : job.verificationStatus,
              },
            });
            jobsUpdated++;
          } else {
            const safeTitle = (job.title || "Untitled Position").slice(0, 255);
            const safeNormTitle = (job.normalizedTitle || safeTitle).slice(0, 255);
            const safeCompany = (job.companyName || "Unknown Employer").slice(0, 255);
            const safeNormCompany = (job.normalizedCompany || safeCompany).slice(0, 255);

            const inserted = await prisma.discoveredJob.create({
              data: {
                providerId: job.providerId.slice(0, 64),
                externalId: job.externalId.slice(0, 255),
                title: safeTitle,
                normalizedTitle: safeNormTitle,
                companyName: safeCompany,
                normalizedCompany: safeNormCompany,
                jobDescription: job.jobDescription,
                requiredSkills: job.requiredSkills,
                preferredSkills: job.preferredSkills,
                industry: job.industry ? job.industry.slice(0, 64) : null,
                employmentType: job.employmentType,
                seniorityLevel: job.seniorityLevel ? job.seniorityLevel.slice(0, 32) : null,
                experienceMin: job.experienceMin,
                experienceMax: job.experienceMax,
                salaryMin: job.salaryMin,
                salaryMax: job.salaryMax,
                salaryCurrency: (job.salaryCurrency || "USD").slice(0, 10),
                salaryPeriod: (job.salaryPeriod || "YEARLY").slice(0, 20),
                country: job.country ? job.country.slice(0, 10) : null,
                state: job.state ? job.state.slice(0, 100) : null,
                city: job.city ? job.city.slice(0, 100) : null,
                workArrangement: job.workArrangement,
                postedAt: job.postedAt ? new Date(job.postedAt) : null,
                closingDate: job.closingDate ? new Date(job.closingDate) : null,
                externalUrl: job.externalUrl.slice(0, 2048),
                canonicalUrl: dedupe.canonicalUrl.slice(0, 2048),
                sourceAttribution: (job.sourceAttribution || "External Source").slice(0, 255),
                verificationStatus: job.verificationStatus,
                availabilityStatus: job.availabilityStatus,
                contentFingerprint: dedupe.fingerprint.slice(0, 64),
                duplicateGroupId: dedupe.duplicateGroupId ? dedupe.duplicateGroupId.slice(0, 64) : null,
                isDuplicate: dedupe.isDuplicate,
                duplicateReason: dedupe.duplicateReason ? dedupe.duplicateReason.slice(0, 255) : null,
                qualityScore: job.qualityScore,
                rawMetadata: (job.rawMetadata as any) || undefined,
              },
            });

            // Update in-memory index for subsequent items in same batch
            existingIndex.byProviderExtId.add(`${job.providerId}::${job.externalId}`);
            if (dedupe.canonicalUrl) {
              existingIndex.byCanonicalUrl.set(
                dedupe.canonicalUrl,
                dedupe.duplicateGroupId || `dup-${inserted.id}`
              );
            }
            if (dedupe.fingerprint) {
              existingIndex.byFingerprint.set(
                dedupe.fingerprint,
                dedupe.duplicateGroupId || `dup-${inserted.id}`
              );
            }

            jobsDiscovered++;
            if (dedupe.isDuplicate) {
              duplicatesDetected++;
            }
          }
        } catch (err: any) {
          failedCount++;
          logger.warn(`Failed to process job ${job.externalId} from ${provider.id}`, {
            error: err?.message,
          });
        }
      }

      // Update provider config stats
      await prisma.jobProviderConfig.update({
        where: { providerId: provider.id },
        data: {
          lastRunAt: new Date(),
          lastSuccessAt: new Date(),
          consecutiveFailures: 0,
          statusMessage: `Success: ${jobsDiscovered} discovered, ${jobsUpdated} updated`,
        },
      });
    } catch (err: any) {
      finalStatus = "FAILED";
      errorMessage = err?.message || "Unknown error during collection";

      await prisma.jobProviderConfig.update({
        where: { providerId: provider.id },
        data: {
          lastRunAt: new Date(),
          consecutiveFailures: { increment: 1 },
          statusMessage: `Failed: ${errorMessage}`,
        },
      });
    }

    const durationMs = Date.now() - startTime;

    // Finalize run record
    await prisma.jobCollectionRun.update({
      where: { id: run.id },
      data: {
        status: finalStatus,
        jobsDiscovered,
        jobsUpdated,
        duplicatesDetected,
        failedCount,
        durationMs,
        errorMessage,
        completedAt: new Date(),
      },
    });

    return {
      runId: run.id,
      providerId: provider.id,
      status: finalStatus,
      jobsDiscovered,
      jobsUpdated,
      duplicatesDetected,
      failedCount,
      durationMs,
      errorMessage,
    };
  }
}

export const jobCollectionRunner = new JobCollectionRunner();
