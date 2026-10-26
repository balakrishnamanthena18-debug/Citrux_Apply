/**
 * Global Job Discovery & Collection Engine — Live Search Engine (Zero-Bulk-Storage)
 *
 * Discovers live job listings directly from configured external providers on-demand
 * when a user performs a search. Results are retrieved, normalized, deduplicated,
 * filtered, and relevance-scored strictly in request memory.
 *
 * NO bulk records are written to the database during live searches.
 * Jobs are only persisted if explicitly saved/bookmarked or promoted to the catalog.
 */

import { prisma } from "@/lib/db/prisma";
import { jobProviderRegistry } from "./registry";
import { evaluateDeduplication } from "./deduplication";
import { calculateRelevance } from "./relevance";
import { JobSearchQuerySchema } from "./contracts";
import type {
  JobSearchFilters,
  PaginatedJobSearchResponse,
  DiscoveredJobSearchResult,
  NormalizedDiscoveredJob,
  LiveProviderExecutionStatus,
  JobProviderAdapter,
  ProviderSearchParams,
} from "./types";
import { logger } from "@/lib/logger";

const PROVIDER_TIMEOUT_MS = 8000;

export class LiveJobSearchEngine {
  /**
   * Performs a live multi-provider search across permitted external sources in memory.
   */
  async searchLiveJobs(
    rawFilters: JobSearchFilters,
    userId?: string
  ): Promise<PaginatedJobSearchResponse> {
    const validated = JobSearchQuerySchema.parse(rawFilters);
    const page = validated.page || 1;
    const pageSize = validated.pageSize || 20;

    // 1. If savedOnly is active, serve exclusively from the user's saved jobs table
    if (validated.savedOnly) {
      return this.fetchSavedJobsOnly(validated, userId);
    }

    // 2. Identify target providers
    const registered = jobProviderRegistry.getAllProviders();
    let targetProviders: JobProviderAdapter[] = [];

    if (validated.providerIds && validated.providerIds.length > 0) {
      targetProviders = registered.filter((p) =>
        validated.providerIds!.includes(p.id)
      );
    } else {
      // Default: query all enabled/configured providers
      targetProviders = registered.filter((p) => p.isConfigured());
    }

    if (targetProviders.length === 0) {
      return {
        jobs: [],
        total: 0,
        page,
        pageSize,
        totalPages: 1,
        hasMore: false,
        isExactTotal: true,
        isLive: true,
        providerStatuses: [],
        rawProviderCounts: {},
        uniqueCount: 0,
        appliedFiltersSummary: {
          providerSide: [],
          inMemory: [],
        },
      };
    }

    // 3. Parse Advanced Tokens (Quotes for exact phrase, -term for negative keywords)
    let cleanQuery = validated.query?.trim() || "";
    let exactPhrase = validated.exactPhrase?.trim() || "";
    const excludedKeywords: string[] = validated.excludedKeywords
      ? [...validated.excludedKeywords]
      : [];

    if (cleanQuery.includes('"') && !exactPhrase) {
      const quoteMatch = cleanQuery.match(/"([^"]+)"/);
      if (quoteMatch && quoteMatch[1]) {
        exactPhrase = quoteMatch[1].trim();
        cleanQuery = cleanQuery.replace(/"[^"]+"/, " ").trim();
      }
    }

    const negMatches = cleanQuery.match(/(?:^|\s)-(?:\w+)|(?:^|\s)NOT\s+(\w+)/gi);
    if (negMatches) {
      for (const nm of negMatches) {
        const cleaned = nm.replace(/^-|\s-|NOT\s+/i, "").trim().toLowerCase();
        if (cleaned && !excludedKeywords.includes(cleaned)) {
          excludedKeywords.push(cleaned);
        }
        cleanQuery = cleanQuery.replace(nm, " ").trim();
      }
    }
    cleanQuery = cleanQuery.replace(/\s+/g, " ").trim();

    // 4. Map search criteria to provider search params & record filter locations
    const providerSideFilters: string[] = [];
    const inMemoryFilters: string[] = [];

    if (cleanQuery) providerSideFilters.push(`Keywords: "${cleanQuery}"`);
    if (validated.countries && validated.countries.length === 1) {
      providerSideFilters.push(`Country: ${validated.countries[0]}`);
    }
    if (validated.workArrangements && validated.workArrangements.length === 1) {
      providerSideFilters.push(`Work Mode: ${validated.workArrangements[0]}`);
    }

    if (exactPhrase) inMemoryFilters.push(`Exact Phrase: "${exactPhrase}"`);
    if (excludedKeywords.length > 0) {
      inMemoryFilters.push(`Excluded: -${excludedKeywords.join(", -")}`);
    }
    if (validated.companyName) {
      inMemoryFilters.push(`Company: "${validated.companyName}"`);
    }
    if (validated.requiredSkills && validated.requiredSkills.length > 0) {
      inMemoryFilters.push(`Required Skills: ${validated.requiredSkills.join(", ")}`);
    }
    if (validated.preferredSkills && validated.preferredSkills.length > 0) {
      inMemoryFilters.push(`Preferred Skills: ${validated.preferredSkills.join(", ")}`);
    }
    if (validated.industries && validated.industries.length > 0) {
      inMemoryFilters.push(`Industries: ${validated.industries.join(", ")}`);
    }
    if (validated.seniorityLevels && validated.seniorityLevels.length > 0) {
      inMemoryFilters.push(`Seniority: ${validated.seniorityLevels.join(", ")}`);
    }
    if (validated.employmentTypes && validated.employmentTypes.length > 0) {
      inMemoryFilters.push(`Employment Types: ${validated.employmentTypes.join(", ")}`);
    }
    if (validated.experienceMin !== undefined || validated.experienceMax !== undefined) {
      inMemoryFilters.push(
        `Experience: ${validated.experienceMin ?? 0}-${validated.experienceMax ?? "any"} yrs`
      );
    }
    if (validated.salaryMin !== undefined || validated.salaryMax !== undefined) {
      inMemoryFilters.push(
        `Salary: ${validated.salaryMin ?? 0}-${validated.salaryMax ?? "any"} ${validated.salaryCurrency || "USD"}`
      );
    }
    if (validated.postedWithinDays) {
      inMemoryFilters.push(`Posted: Within ${validated.postedWithinDays} days`);
    }
    if (validated.visaSponsored) {
      inMemoryFilters.push("Visa Sponsorship: Yes");
    }
    if (validated.hideSaved) {
      inMemoryFilters.push("Hide Saved Leads: Yes");
    }

    const providerSearchParams: ProviderSearchParams = {
      keywords: cleanQuery || exactPhrase || undefined,
      country:
        validated.countries && validated.countries.length === 1
          ? validated.countries[0]
          : undefined,
      workArrangement:
        validated.workArrangements && validated.workArrangements.length === 1
          ? validated.workArrangements[0]
          : undefined,
      seniority:
        validated.seniorityLevels && validated.seniorityLevels.length === 1
          ? validated.seniorityLevels[0]
          : undefined,
      industry:
        validated.industries && validated.industries.length === 1
          ? validated.industries[0]
          : undefined,
      page,
      pageSize: Math.max(pageSize, 25), // Request a sufficient window for in-memory deduplication & filtering
    };

    // 5. Query configured providers in parallel with bounded timeouts
    const providerStatuses: LiveProviderExecutionStatus[] = [];
    const providerResults: NormalizedDiscoveredJob[][] = [];
    const rawProviderCounts: Record<string, number> = {};
    let combinedTotal = 0;
    let anyProviderHasMore = false;

    const queryPromises = targetProviders.map(async (provider) => {
      const start = Date.now();
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${PROVIDER_TIMEOUT_MS}ms`)),
            PROVIDER_TIMEOUT_MS
          )
        );

        const fetchPromise = provider.fetchJobs(providerSearchParams);
        const result = await Promise.race([fetchPromise, timeoutPromise]);
        const latencyMs = Date.now() - start;

        rawProviderCounts[provider.id] = result.jobs.length;
        if (result.hasMore) {
          anyProviderHasMore = true;
        }

        providerStatuses.push({
          providerId: provider.id,
          providerName: provider.name,
          status: "SUCCESS",
          latencyMs,
          count: result.jobs.length,
          totalReported: result.totalAvailable,
          hasMore: result.hasMore,
        });

        if (result.totalAvailable && result.totalAvailable > combinedTotal) {
          combinedTotal = result.totalAvailable;
        }

        return result.jobs;
      } catch (err: any) {
        const latencyMs = Date.now() - start;
        const isTimeout = /timeout/i.test(err?.message || "");

        logger.warn(
          `[LiveSearch] Provider ${provider.id} failed during live search`,
          { error: err?.message, latencyMs }
        );

        rawProviderCounts[provider.id] = 0;
        providerStatuses.push({
          providerId: provider.id,
          providerName: provider.name,
          status: isTimeout ? "TIMEOUT" : "FAILED",
          latencyMs,
          count: 0,
          hasMore: false,
          error: isTimeout ? "Request timed out after 8000ms" : "Upstream provider error",
        });

        return [] as NormalizedDiscoveredJob[];
      }
    });

    const settled = await Promise.all(queryPromises);
    for (const batch of settled) {
      if (batch.length > 0) {
        providerResults.push(batch);
      }
    }

    // 6. In-Memory Multi-Tier Deduplication
    const existingIndex = {
      byCanonicalUrl: new Map<string, string>(),
      byFingerprint: new Map<string, string>(),
      byProviderExtId: new Set<string>(),
    };

    const deduplicatedJobs: NormalizedDiscoveredJob[] = [];

    for (const batch of providerResults) {
      for (const job of batch) {
        const dedupe = evaluateDeduplication(job, existingIndex);

        if (dedupe.isDuplicate) {
          continue;
        }

        existingIndex.byProviderExtId.add(
          `${job.providerId}::${job.externalId}`
        );
        if (dedupe.canonicalUrl) {
          existingIndex.byCanonicalUrl.set(
            dedupe.canonicalUrl,
            dedupe.duplicateGroupId || job.externalId
          );
        }
        if (dedupe.fingerprint) {
          existingIndex.byFingerprint.set(
            dedupe.fingerprint,
            dedupe.duplicateGroupId || job.externalId
          );
        }

        deduplicatedJobs.push({
          ...job,
          canonicalUrl: dedupe.canonicalUrl,
          contentFingerprint: dedupe.fingerprint,
          duplicateGroupId: dedupe.duplicateGroupId,
          isDuplicate: false,
        });
      }
    }

    // 7. In-Memory Post-Filtering (Full advanced search capabilities)
    const nowMs = Date.now();
    const filteredJobs = deduplicatedJobs.filter((job) => {
      const titleLower = job.title.toLowerCase();
      const descLower = (job.jobDescription || "").toLowerCase();
      const companyLower = (job.companyName || "").toLowerCase();

      // Exact phrase match
      if (exactPhrase) {
        const epLower = exactPhrase.toLowerCase();
        if (!titleLower.includes(epLower) && !descLower.includes(epLower)) {
          return false;
        }
      }

      // Excluded keywords match
      if (excludedKeywords.length > 0) {
        const hasExcluded = excludedKeywords.some(
          (ex) => titleLower.includes(ex) || descLower.includes(ex)
        );
        if (hasExcluded) return false;
      }

      // Keyword query match (must match at least one keyword in title, description, or company)
      if (cleanQuery) {
        const qWords = cleanQuery
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2);
        if (qWords.length > 0) {
          const matchesKeyword = qWords.some(
            (w) => titleLower.includes(w) || descLower.includes(w) || companyLower.includes(w)
          );
          if (!matchesKeyword) return false;
        }
      }

      // Company / employer filter
      if (validated.companyName) {
        const comp = validated.companyName.toLowerCase().trim();
        if (!companyLower.includes(comp)) return false;
      }

      // Required skills filter (all specified must be present in job skills or description)
      const targetReqSkills = validated.requiredSkills || validated.skills || [];
      if (targetReqSkills.length > 0) {
        const jobSkillsSet = new Set(
          [...(job.requiredSkills || []), ...(job.preferredSkills || [])].map((s) =>
            s.toLowerCase().trim()
          )
        );
        const hasAllReq = targetReqSkills.every((s) => {
          const sLower = s.toLowerCase().trim();
          return jobSkillsSet.has(sLower) || descLower.includes(sLower);
        });
        if (!hasAllReq) return false;
      }

      // Industry filter
      if (validated.industries && validated.industries.length > 0) {
        const jobInd = (job.industry || "").toLowerCase();
        const matchesInd = validated.industries.some(
          (ind) => ind.toLowerCase() === jobInd
        );
        if (!matchesInd) return false;
      }

      // Country filter
      if (validated.countries && validated.countries.length > 0) {
        const jobCountry = (job.country || "").toUpperCase();
        const matchesCountry = validated.countries.some((c) => {
          const upperC = c.toUpperCase();
          if (upperC === "REMOTE") return job.workArrangement === "REMOTE";
          return jobCountry === upperC;
        });
        if (!matchesCountry) return false;
      }

      // State / Region filter
      if (validated.states && validated.states.length > 0) {
        const jobState = (job.state || "").toLowerCase();
        const matchesState = validated.states.some((st) =>
          jobState.includes(st.toLowerCase())
        );
        if (!matchesState) return false;
      }

      // City filter
      if (validated.cities && validated.cities.length > 0) {
        const jobCity = (job.city || "").toLowerCase();
        const matchesCity = validated.cities.some((ct) =>
          jobCity.includes(ct.toLowerCase())
        );
        if (!matchesCity) return false;
      }

      // Work arrangement filter
      if (
        validated.workArrangements &&
        validated.workArrangements.length > 0 &&
        !validated.workArrangements.includes(job.workArrangement as any)
      ) {
        return false;
      }

      // Seniority filter
      if (validated.seniorityLevels && validated.seniorityLevels.length > 0) {
        const jobSen = (job.seniorityLevel || "").toUpperCase();
        const matchesSen = validated.seniorityLevels.some(
          (s) => s.toUpperCase() === jobSen
        );
        if (!matchesSen) return false;
      }

      // Employment type filter
      if (
        validated.employmentTypes &&
        validated.employmentTypes.length > 0 &&
        !validated.employmentTypes.includes(job.employmentType as any)
      ) {
        return false;
      }

      // Experience min/max filter
      if (validated.experienceMin !== undefined && job.experienceMin !== null && job.experienceMin !== undefined) {
        if (job.experienceMin < validated.experienceMin) return false;
      }
      if (validated.experienceMax !== undefined && job.experienceMax !== null && job.experienceMax !== undefined) {
        if (job.experienceMax > validated.experienceMax) return false;
      }

      // Salary filter with normalized yearly conversion
      if (validated.salaryMin !== undefined || validated.salaryMax !== undefined) {
        let jobYearlyMin = job.salaryMin || 0;
        let jobYearlyMax = job.salaryMax || job.salaryMin || 0;

        if (job.salaryPeriod === "HOURLY") {
          jobYearlyMin *= 2080;
          jobYearlyMax *= 2080;
        } else if (job.salaryPeriod === "MONTHLY") {
          jobYearlyMin *= 12;
          jobYearlyMax *= 12;
        }

        if (validated.salaryMin !== undefined && jobYearlyMax < validated.salaryMin) {
          return false;
        }
        if (validated.salaryMax !== undefined && jobYearlyMin > validated.salaryMax) {
          return false;
        }
      }

      // Posting recency filter
      if (validated.postedWithinDays && job.postedAt) {
        const postedMs = new Date(job.postedAt).getTime();
        if (!isNaN(postedMs)) {
          const maxAgeMs = validated.postedWithinDays * 24 * 60 * 60 * 1000;
          if (nowMs - postedMs > maxAgeMs) return false;
        }
      }

      // Visa Sponsorship filter
      if (validated.visaSponsored) {
        const hasVisa =
          descLower.includes("visa") ||
          descLower.includes("h-1b") ||
          descLower.includes("h1b") ||
          descLower.includes("sponsorship available") ||
          descLower.includes("willing to sponsor");
        if (!hasVisa) return false;
      }

      // Verification status filter
      if (
        validated.verificationStatuses &&
        validated.verificationStatuses.length > 0 &&
        !validated.verificationStatuses.includes(job.verificationStatus as any)
      ) {
        return false;
      }

      return true;
    });

    // 8. Relevance Scoring (Explainable & Factual)
    const scoredJobs = filteredJobs.map((job) => {
      const relevance = calculateRelevance(job, {
        ...validated,
        exactPhrase,
        companyName: validated.companyName,
        requiredSkills: validated.requiredSkills,
        preferredSkills: validated.preferredSkills,
      });
      return { job, relevance };
    });

    // 9. Sorting
    if (validated.sortBy === "newest") {
      scoredJobs.sort((a, b) => {
        const tA = a.job.postedAt ? new Date(a.job.postedAt).getTime() : 0;
        const tB = b.job.postedAt ? new Date(b.job.postedAt).getTime() : 0;
        return tB - tA;
      });
    } else if (validated.sortBy === "quality") {
      scoredJobs.sort((a, b) => b.job.qualityScore - a.job.qualityScore);
    } else if (validated.sortBy === "salary_desc") {
      scoredJobs.sort((a, b) => {
        const salA = a.job.salaryMax || a.job.salaryMin || 0;
        const salB = b.job.salaryMax || b.job.salaryMin || 0;
        return salB - salA;
      });
    } else {
      // Relevance sorting
      scoredJobs.sort((a, b) => b.relevance.overallScore - a.relevance.overallScore);
    }

    // 10. Hydrate Saved Status for authenticated user
    const userSavedCanonicalUrls = new Set<string>();
    const userSavedExtIds = new Set<string>();
    const userSavedDbMap = new Map<string, string>();

    if (userId) {
      try {
        const userSaves = await prisma.savedJob.findMany({
          where: { userId },
          select: {
            discoveredJobId: true,
            discoveredJob: {
              select: {
                id: true,
                canonicalUrl: true,
                externalId: true,
                providerId: true,
              },
            },
          },
        });

        for (const s of userSaves) {
          if (s.discoveredJob) {
            userSavedCanonicalUrls.add(s.discoveredJob.canonicalUrl);
            userSavedExtIds.add(
              `${s.discoveredJob.providerId}:${s.discoveredJob.externalId}`
            );
            userSavedDbMap.set(s.discoveredJob.canonicalUrl, s.discoveredJobId);
            userSavedDbMap.set(
              `${s.discoveredJob.providerId}:${s.discoveredJob.externalId}`,
              s.discoveredJobId
            );
          }
        }
      } catch (err) {
        logger.warn("[LiveSearch] Could not hydrate user saved status", {
          error: (err as any)?.message,
        });
      }
    }

    // Map to DiscoveredJobSearchResult
    let uiResults: DiscoveredJobSearchResult[] = scoredJobs.map(({ job, relevance }) => {
      const isSaved =
        userSavedCanonicalUrls.has(job.canonicalUrl) ||
        userSavedExtIds.has(`${job.providerId}:${job.externalId}`);
      const persistedId =
        userSavedDbMap.get(job.canonicalUrl) ||
        userSavedDbMap.get(`${job.providerId}:${job.externalId}`);

      return {
        id: persistedId || `live_${job.providerId}_${job.externalId}`,
        providerId: job.providerId,
        externalId: job.externalId,
        title: job.title,
        companyName: job.companyName,
        jobDescription: job.jobDescription,
        requiredSkills: job.requiredSkills || [],
        preferredSkills: job.preferredSkills || [],
        industry: job.industry || null,
        employmentType: job.employmentType,
        seniorityLevel: job.seniorityLevel || null,
        experienceMin: job.experienceMin ?? null,
        experienceMax: job.experienceMax ?? null,
        salaryMin: job.salaryMin || null,
        salaryMax: job.salaryMax || null,
        salaryCurrency: job.salaryCurrency || "USD",
        salaryPeriod: job.salaryPeriod || "YEARLY",
        country: job.country || null,
        state: job.state || null,
        city: job.city || null,
        workArrangement: job.workArrangement,
        postedAt: job.postedAt || null,
        closingDate: job.closingDate || null,
        lastSeenAt: new Date(),
        firstCollectedAt: new Date(),
        lastCheckedAt: new Date(),
        externalUrl: job.externalUrl,
        canonicalUrl: job.canonicalUrl,
        sourceAttribution: job.sourceAttribution,
        verificationStatus: job.verificationStatus,
        availabilityStatus: job.availabilityStatus,
        qualityScore: job.qualityScore,
        isDuplicate: false,
        duplicateGroupId: job.duplicateGroupId || null,
        promotedToJobId: null,
        isSaved,
        relevance,
      };
    });

    // Optional filter: hide previously saved jobs
    if (validated.hideSaved) {
      uiResults = uiResults.filter((j) => !j.isSaved);
    }

    // 11. Accurate Pagination Calculation (Fixes the "Page 1 of 428717" bug)
    // External providers were already queried for page `page`.
    // We take the bounded slice for this page:
    const pagedResults = uiResults.slice(0, pageSize);
    const hasMore = uiResults.length > pageSize || anyProviderHasMore;

    // Report estimated upstream totals accurately without fabricating exact local counts
    const estimatedTotal = combinedTotal > 0 ? combinedTotal : undefined;
    const isExactTotal = false;

    // Calculate realistic page count (bound max page count to prevent unpageable 400k pages)
    let totalPages = 1;
    if (estimatedTotal && estimatedTotal > 0) {
      totalPages = Math.min(Math.ceil(estimatedTotal / pageSize), 100);
    } else {
      totalPages = hasMore ? page + 1 : page;
    }

    return {
      jobs: pagedResults,
      total: pagedResults.length,
      page,
      pageSize,
      totalPages,
      hasMore,
      estimatedTotal,
      isExactTotal,
      isLive: true,
      providerStatuses,
      rawProviderCounts,
      uniqueCount: deduplicatedJobs.length,
      appliedFiltersSummary: {
        providerSide: providerSideFilters,
        inMemory: inMemoryFilters,
      },
    };
  }

  /**
   * Serves saved jobs directly from the persistent database when savedOnly filter is active
   */
  private async fetchSavedJobsOnly(
    filters: JobSearchFilters,
    userId?: string
  ): Promise<PaginatedJobSearchResponse> {
    if (!userId) {
      return {
        jobs: [],
        total: 0,
        page: filters.page || 1,
        pageSize: filters.pageSize || 20,
        totalPages: 1,
        hasMore: false,
        isExactTotal: true,
        isLive: true,
        providerStatuses: [],
        rawProviderCounts: {},
        uniqueCount: 0,
        appliedFiltersSummary: {
          providerSide: [],
          inMemory: ["Saved Leads Only"],
        },
      };
    }

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const savedRecords = await prisma.savedJob.findMany({
      where: { userId },
      include: {
        discoveredJob: true,
      },
      orderBy: { savedAt: "desc" },
    });

    const mappedJobs: DiscoveredJobSearchResult[] = savedRecords
      .filter((s) => s.discoveredJob !== null)
      .map((s) => {
        const j = s.discoveredJob!;
        const relevance = calculateRelevance(
          {
            title: j.title,
            companyName: j.companyName,
            jobDescription: j.jobDescription,
            requiredSkills: j.requiredSkills,
            preferredSkills: j.preferredSkills,
            industry: j.industry,
            seniorityLevel: j.seniorityLevel,
            workArrangement: j.workArrangement,
            country: j.country,
            city: j.city,
            postedAt: j.postedAt,
            qualityScore: j.qualityScore,
          },
          filters
        );

        return {
          id: j.id,
          providerId: j.providerId,
          externalId: j.externalId,
          title: j.title,
          companyName: j.companyName,
          jobDescription: j.jobDescription,
          requiredSkills: j.requiredSkills,
          preferredSkills: j.preferredSkills,
          industry: j.industry,
          employmentType: j.employmentType,
          seniorityLevel: j.seniorityLevel,
          experienceMin: j.experienceMin,
          experienceMax: j.experienceMax,
          salaryMin: j.salaryMin,
          salaryMax: j.salaryMax,
          salaryCurrency: j.salaryCurrency,
          salaryPeriod: j.salaryPeriod,
          country: j.country,
          state: j.state,
          city: j.city,
          workArrangement: j.workArrangement,
          postedAt: j.postedAt,
          closingDate: j.closingDate,
          lastSeenAt: j.lastSeenAt,
          firstCollectedAt: j.firstCollectedAt,
          lastCheckedAt: j.lastCheckedAt,
          externalUrl: j.externalUrl,
          canonicalUrl: j.canonicalUrl,
          sourceAttribution: j.sourceAttribution,
          verificationStatus: j.verificationStatus,
          availabilityStatus: j.availabilityStatus,
          qualityScore: j.qualityScore,
          isDuplicate: j.isDuplicate,
          duplicateGroupId: j.duplicateGroupId,
          promotedToJobId: j.promotedToJobId,
          isSaved: true,
          relevance,
        };
      });

    // Apply in-memory query filter if present
    let filtered = mappedJobs;
    if (filters.query && filters.query.trim()) {
      const q = filters.query.toLowerCase().trim();
      filtered = filtered.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.companyName.toLowerCase().includes(q) ||
          j.jobDescription.toLowerCase().includes(q)
      );
    }

    const startIndex = (page - 1) * pageSize;
    const paged = filtered.slice(startIndex, startIndex + pageSize);

    return {
      jobs: paged,
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.ceil(filtered.length / pageSize) || 1,
      hasMore: startIndex + pageSize < filtered.length,
      isExactTotal: true,
      isLive: true,
      providerStatuses: [
        {
          providerId: "saved_jobs",
          providerName: "My Saved Job Leads",
          status: "SUCCESS",
          latencyMs: 5,
          count: filtered.length,
          totalReported: filtered.length,
          hasMore: false,
        },
      ],
      rawProviderCounts: {
        saved_jobs: filtered.length,
      },
      uniqueCount: filtered.length,
      appliedFiltersSummary: {
        providerSide: [],
        inMemory: ["Saved Leads Only"],
      },
    };
  }
}

export const liveJobSearchEngine = new LiveJobSearchEngine();
