/**
 * Global Job Discovery & Collection Engine — Provider Adapter Registry
 *
 * Central registry managing provider adapters, connection lifecycles,
 * health status reporting, and database synchronization.
 */

import { FreeHireAdapter } from "./providers/freehire";
import { ArbeitnowAdapter } from "./providers/arbeitnow";
import { JobicyAdapter } from "./providers/jobicy";
import { UsaJobsAdapter } from "./providers/usajobs";
import { DirectAtsAdapter } from "./providers/direct-ats";
import type { JobProviderAdapter, ProviderHealthReport } from "./types";
import { prisma } from "@/lib/db/prisma";

export class JobProviderRegistry {
  private static instance: JobProviderRegistry;
  private providers = new Map<string, JobProviderAdapter>();

  private constructor() {
    this.register(new FreeHireAdapter());
    this.register(new ArbeitnowAdapter());
    this.register(new JobicyAdapter());
    this.register(new UsaJobsAdapter());
    this.register(new DirectAtsAdapter());
  }

  public static getInstance(): JobProviderRegistry {
    if (!JobProviderRegistry.instance) {
      JobProviderRegistry.instance = new JobProviderRegistry();
    }
    return JobProviderRegistry.instance;
  }

  public register(provider: JobProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): JobProviderAdapter | null {
    return this.providers.get(id) ?? null;
  }

  public getAllProviders(): JobProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  /** Run health checks across all registered providers */
  public async checkAllHealth(): Promise<ProviderHealthReport[]> {
    const checks = Array.from(this.providers.values()).map((p) => p.checkHealth());
    return Promise.all(checks);
  }

  /** Synchronizes provider metadata into job_provider_configs table */
  public async syncProviderConfigs(): Promise<void> {
    for (const provider of this.providers.values()) {
      await prisma.jobProviderConfig.upsert({
        where: { providerId: provider.id },
        update: {
          name: provider.name,
          category: provider.category,
          baseUrl: provider.defaultBaseUrl,
          isConfigured: provider.isConfigured(),
          rateLimitPerMinute: provider.rateLimitPerMinute,
          rateLimitDaily: provider.rateLimitDaily,
          documentation: {
            attributionNotice: provider.attributionNotice,
            termsUrl: provider.permittedTermsUrl,
          },
        },
        create: {
          providerId: provider.id,
          name: provider.name,
          category: provider.category,
          baseUrl: provider.defaultBaseUrl,
          isEnabled: true,
          isConfigured: provider.isConfigured(),
          rateLimitPerMinute: provider.rateLimitPerMinute,
          rateLimitDaily: provider.rateLimitDaily,
          statusMessage: "Initialized",
          documentation: {
            attributionNotice: provider.attributionNotice,
            termsUrl: provider.permittedTermsUrl,
          },
        },
      });
    }
  }
}

export const jobProviderRegistry = JobProviderRegistry.getInstance();
