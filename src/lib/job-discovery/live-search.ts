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
import { calculateDeterministicRelevance, enrichJobsWithDeepSeek } from "./ai-relevance";
import { interpretJobSearchQuery, type InterpretedSearchPlan } from "./query-interpreter";
import { matchCityWithAliases, CITY_ALIASES } from "./normalizer";
import { JobSearchQuerySchema } from "./contracts";
import type {
  JobSearchFilters,
  PaginatedJobSearchResponse,
  DiscoveredJobSearchResult,
  NormalizedDiscoveredJob,
  LiveProviderExecutionStatus,
  JobProviderAdapter,
  ProviderSearchParams,
  SearchTraceData,
  SearchTraceCheckpoint,
} from "./types";
import { logger } from "@/lib/logger";

const PROVIDER_TIMEOUT_MS = 5000;

/** Set of recognized location words for distinguishing location tokens from skill/role keywords */
const KNOWN_LOCATION_WORDS = new Set([
  ...Object.keys(CITY_ALIASES),
  ...Object.values(CITY_ALIASES).flat(),
  "karnataka", "telangana", "maharashtra", "delhi", "haryana", "tamil", "nadu",
  "california", "texas", "washington", "florida", "illinois", "york",
  "india", "usa", "us", "uk", "germany", "canada", "remote"
]);

function isLocationWord(word: string): boolean {
  return KNOWN_LOCATION_WORDS.has(word.toLowerCase().trim());
}

export class LiveJobSearchEngine {
  /**
   * Performs a live multi-provider search across permitted external sources in memory.
   */
  async searchLiveJobs(
    rawFilters: JobSearchFilters,
    userId?: string,
    traceContext?: {
      apiEntryMs?: number;
      correlationId?: string;
      clientSubmittedAtMs?: number;
    }
  ): Promise<PaginatedJobSearchResponse> {
    const searchStartMs = Date.now();
    const correlationId =
      traceContext?.correlationId ||
      rawFilters.correlationId ||
      `srch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const checkpoints: SearchTraceCheckpoint[] = [];

    const clientSubmittedAtMs =
      traceContext?.clientSubmittedAtMs || rawFilters.clientSubmittedAtMs;
    if (clientSubmittedAtMs) {
      checkpoints.push({
        checkpoint: "BROWSER_SUBMISSION",
        timestampMs: clientSubmittedAtMs,
      });
    }

    const apiEntryMs = traceContext?.apiEntryMs || searchStartMs;
    checkpoints.push({
      checkpoint: "API_ENTRY",
      timestampMs: apiEntryMs,
    });

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
        trace: {
          correlationId,
          clientSubmittedAtMs,
          apiEntryMs,
          serverDurationMs: Date.now() - apiEntryMs,
          checkpoints,
        },
      };
    }

    // 3. Interpret query using DeepSeek Query Interpreter (with immediate deterministic fallback)
    const interpretedPlan = await interpretJobSearchQuery(validated.query || "");

    checkpoints.push({
      checkpoint: "QUERY_INTERPRETATION_COMPLETED",
      timestampMs: Date.now(),
      details: {
        isAiInterpreted: interpretedPlan.isAiInterpreted,
        role: interpretedPlan.role,
        city: interpretedPlan.city,
      },
    });

    // Effective search terms: use extracted role if query had location/salary expressions embedded
    let cleanQuery = interpretedPlan.role || validated.query?.trim() || "";
    let exactPhrase = validated.exactPhrase?.trim() || "";
    const excludedKeywords: string[] = Array.from(
      new Set([
        ...(validated.excludedKeywords || []),
        ...interpretedPlan.excludedKeywords,
      ])
    );

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

    // Determine effective location & arrangements (UI selections override interpreted defaults)
    const effectiveCountries =
      validated.countries && validated.countries.length > 0 && validated.countries[0] !== "ALL"
        ? validated.countries
        : interpretedPlan.country
        ? [interpretedPlan.country]
        : undefined;

    const effectiveCities =
      validated.cities && validated.cities.length > 0
        ? validated.cities
        : interpretedPlan.city
        ? [interpretedPlan.city]
        : undefined;

    const effectiveStates =
      validated.states && validated.states.length > 0
        ? validated.states
        : interpretedPlan.state
        ? [interpretedPlan.state]
        : undefined;

    const effectiveWorkArrangements =
      validated.workArrangements && validated.workArrangements.length > 0
        ? validated.workArrangements
        : interpretedPlan.workArrangement
        ? [interpretedPlan.workArrangement]
        : undefined;

    const effectiveSeniority =
      validated.seniorityLevels && validated.seniorityLevels.length > 0
        ? validated.seniorityLevels
        : interpretedPlan.seniority
        ? [interpretedPlan.seniority]
        : undefined;

    // 4. Map search criteria to provider search params & record filter locations
    const providerSideFilters: string[] = [];
    const inMemoryFilters: string[] = [];

    if (cleanQuery) providerSideFilters.push(`Keywords: "${cleanQuery}"`);
    if (effectiveCountries && effectiveCountries.length === 1) {
      providerSideFilters.push(`Country: ${effectiveCountries[0]}`);
    }
    if (effectiveCities && effectiveCities.length === 1) {
      providerSideFilters.push(`City: ${effectiveCities[0]}`);
    }
    if (effectiveWorkArrangements && effectiveWorkArrangements.length === 1) {
      providerSideFilters.push(`Work Mode: ${effectiveWorkArrangements[0]}`);
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
        effectiveCountries && effectiveCountries.length === 1
          ? effectiveCountries[0]
          : undefined,
      city:
        effectiveCities && effectiveCities.length === 1 && effectiveCities[0]
          ? effectiveCities[0].split(",")[0]?.trim()
          : undefined,
      workArrangement:
        effectiveWorkArrangements && effectiveWorkArrangements.length === 1
          ? effectiveWorkArrangements[0]
          : undefined,
      seniority:
        effectiveSeniority && effectiveSeniority.length === 1
          ? effectiveSeniority[0]
          : undefined,
      industry:
        validated.industries && validated.industries.length === 1
          ? validated.industries[0]
          : undefined,
      page,
      pageSize,
    };

    // 5. Query configured providers in parallel with bounded timeouts
    const providerStatuses: LiveProviderExecutionStatus[] = [];
    const providerResults: NormalizedDiscoveredJob[][] = [];
    const rawProviderCounts: Record<string, number> = {};
    let combinedTotal = 0;
    let anyProviderHasMore = false;

    const queryPromises = targetProviders.map(async (provider) => {
      const start = Date.now();
      checkpoints.push({
        checkpoint: "PROVIDER_STARTED",
        timestampMs: start,
        providerId: provider.id,
      });

      const abortController = new AbortController();
      let timer: NodeJS.Timeout | null = setTimeout(() => {
        abortController.abort();
      }, PROVIDER_TIMEOUT_MS);

      try {
        const fetchPromise = provider.fetchJobs({
          ...providerSearchParams,
          signal: abortController.signal,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          if (abortController.signal.aborted) {
            reject(new Error(`Timeout after ${PROVIDER_TIMEOUT_MS}ms`));
          } else {
            abortController.signal.addEventListener(
              "abort",
              () => reject(new Error(`Timeout after ${PROVIDER_TIMEOUT_MS}ms`)),
              { once: true }
            );
          }
        });

        const result = await Promise.race([fetchPromise, timeoutPromise]);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        const latencyMs = Date.now() - start;

        checkpoints.push({
          checkpoint: "PROVIDER_COMPLETED",
          timestampMs: Date.now(),
          providerId: provider.id,
          details: {
            status: "SUCCESS",
            latencyMs,
            count: result.jobs.length,
          },
        });

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
          ignoredParams: result.ignoredParams,
          appliedFilters: result.appliedFilters,
          totalScope: result.totalScope,
        });

        if (result.totalAvailable && result.totalAvailable > combinedTotal) {
          combinedTotal = result.totalAvailable;
        }

        return result.jobs;
      } catch (err: any) {
        const latencyMs = Date.now() - start;
        const isTimeout = /timeout/i.test(err?.message || "");

        checkpoints.push({
          checkpoint: "PROVIDER_COMPLETED",
          timestampMs: Date.now(),
          providerId: provider.id,
          details: {
            status: isTimeout ? "TIMEOUT" : "FAILED",
            latencyMs,
            error: isTimeout ? `Request timed out after ${PROVIDER_TIMEOUT_MS}ms` : "Upstream provider error",
          },
        });

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
          error: isTimeout ? `Request timed out after ${PROVIDER_TIMEOUT_MS}ms` : "Upstream provider error",
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

      // Keyword query match
      if (cleanQuery) {
        // Strip punctuation from query words so commas, hyphens, etc. don't break token matching
        const qWords = cleanQuery
          .toLowerCase()
          .replace(/[^\w\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2);

        if (qWords.length > 0) {
          const matchesKeyword = qWords.some((w) => {
            // Match title or company
            if (titleLower.includes(w) || companyLower.includes(w)) {
              return true;
            }

            // Match location fields using normalized data and aliases
            if (
              (job.city && matchCityWithAliases(job.city, w)) ||
              (job.state && job.state.toLowerCase().includes(w)) ||
              (job.country && job.country.toLowerCase().includes(w))
            ) {
              return true;
            }

            // Only allow matching in job description for non-location tokens.
            // This prevents false positives where a job in another city merely mentions "Bengaluru" in passing.
            if (!isLocationWord(w) && descLower.includes(w)) {
              return true;
            }

            return false;
          });

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
      const targetCountries =
        validated.countries && validated.countries.length > 0
          ? validated.countries
          : effectiveCountries || [];

      if (targetCountries.length > 0 && targetCountries[0] !== "ALL") {
        const jobCountry = (job.country || "").toUpperCase().trim();
        const matchesCountry = targetCountries.some((c) => {
          const upperC = c.toUpperCase().trim();
          if (upperC === "REMOTE") return job.workArrangement === "REMOTE";
          if (jobCountry === upperC) return true;
          if ((upperC === "US" || upperC === "USA") && (jobCountry === "US" || jobCountry === "USA" || jobCountry === "UNITED STATES")) return true;
          if ((upperC === "IN" || upperC === "IND") && (jobCountry === "IN" || jobCountry === "INDIA")) return true;
          return false;
        });
        if (!matchesCountry) return false;
      }

      // State / Region filter
      const targetStates =
        validated.states && validated.states.length > 0
          ? validated.states
          : effectiveStates || [];

      if (targetStates.length > 0) {
        const jobState = (job.state || "").toLowerCase().trim();
        const matchesState = targetStates.some((st) => {
          const stLower = st.toLowerCase().trim();
          return (
            jobState === stLower ||
            (jobState.length > 0 && (jobState.includes(stLower) || stLower.includes(jobState)))
          );
        });
        if (!matchesState) return false;
      }

      // City filter (matches structured location data, accounting for aliases, multi-location postings, and title locations)
      const targetCities =
        validated.cities && validated.cities.length > 0
          ? validated.cities
          : effectiveCities || [];

      if (targetCities.length > 0) {
        const candidateCities = [job.city, ...(job.allCities || [])].filter(Boolean) as string[];
        const matchesCity = targetCities.some((ct) => {
          const ctClean = ct.split(",")[0]?.trim() || ct.trim();
          return (
            candidateCities.some((c) => matchCityWithAliases(c, ctClean) || matchCityWithAliases(c, ct)) ||
            matchCityWithAliases(job.title, ctClean)
          );
        });
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

    // 8. Relevance Scoring (Calibrated Hybrid Model)
    const scoredJobs = filteredJobs.map((job) => {
      const relevance = calculateDeterministicRelevance(job, {
        ...validated,
        exactPhrase,
        companyName: validated.companyName,
        requiredSkills: validated.requiredSkills || interpretedPlan.requiredSkills,
        preferredSkills: validated.preferredSkills || interpretedPlan.preferredSkills,
        workArrangements: effectiveWorkArrangements,
        cities: effectiveCities,
        states: effectiveStates,
        countries: effectiveCountries,
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
        allCities: job.allCities || (job.city ? [job.city] : []),
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

    checkpoints.push({
      checkpoint: "AGGREGATION_RANKING_COMPLETED",
      timestampMs: Date.now(),
      details: {
        deduplicatedCount: deduplicatedJobs.length,
        verifiedMatchingCount: uiResults.length,
      },
    });

    // 11. Accurate Pagination Calculation & Semantic Enrichment
    const pagedResults = uiResults.slice(0, pageSize);
    let enrichedResults = pagedResults;
    if (interpretedPlan.isAiInterpreted) {
      enrichedResults = await enrichJobsWithDeepSeek(
        pagedResults,
        interpretedPlan.intentSummary
      );
    }

    const isCitySearch = Boolean(effectiveCities && effectiveCities.length > 0);
    const isCountrySearch = Boolean(effectiveCountries && effectiveCountries.length > 0 && !isCitySearch);

    let authoritativeTotal: number | undefined = undefined;
    let totalScope: "CITY" | "STATE" | "COUNTRY" | "GLOBAL" = isCitySearch
      ? "CITY"
      : isCountrySearch
      ? "COUNTRY"
      : "GLOBAL";

    if (isCitySearch) {
      // For city queries, only take totals from providers that verified and applied the city filter
      const cityStatus = providerStatuses.find(
        (ps) => ps.status === "SUCCESS" && typeof ps.totalReported === "number" && ps.totalScope === "CITY"
      );
      if (cityStatus) {
        authoritativeTotal = cityStatus.totalReported;
        totalScope = "CITY";
      }
    } else if (isCountrySearch) {
      // For country queries, only take totals from providers that applied the country filter
      const countryStatus = providerStatuses.find(
        (ps) => ps.status === "SUCCESS" && typeof ps.totalReported === "number" && (ps.totalScope === "COUNTRY" || ps.totalScope === "STATE")
      );
      if (countryStatus) {
        authoritativeTotal = countryStatus.totalReported;
        totalScope = countryStatus.totalScope || "COUNTRY";
      }
    } else {
      // Global query: take the reported total across providers (global scope)
      const globalStatus = providerStatuses.find(
        (ps) => ps.status === "SUCCESS" && typeof ps.totalReported === "number" && (ps.totalScope === "GLOBAL" || !ps.totalScope)
      );
      if (globalStatus) {
        authoritativeTotal = globalStatus.totalReported;
        totalScope = "GLOBAL";
      }
    }

    const estimatedTotal = authoritativeTotal;
    const isExactTotal = false;

    // hasMore logic: more matching in memory OR providers report more upstream within bounds
    const hasMoreInMemory = uiResults.length > pageSize;
    const hasMoreUpstream = anyProviderHasMore && (authoritativeTotal ? (page * pageSize < authoritativeTotal) : true);
    const hasMore = hasMoreInMemory || hasMoreUpstream;

    // Calculate realistic page count (bound max page count to prevent unpageable 400k pages)
    let totalPages = 1;
    if (estimatedTotal && estimatedTotal > 0) {
      totalPages = Math.max(Math.ceil(estimatedTotal / pageSize), hasMore ? page + 1 : page);
      totalPages = Math.min(totalPages, 50);
    } else {
      totalPages = hasMore ? page + 1 : page;
    }

    const response: PaginatedJobSearchResponse = {
      jobs: enrichedResults,
      total: enrichedResults.length,
      page,
      pageSize,
      totalPages,
      hasMore,
      estimatedTotal,
      providerReportedTotal: authoritativeTotal,
      totalScope,
      returnedBatchCount: deduplicatedJobs.length,
      verifiedMatchingCount: uiResults.length,
      isExactTotal,
      isLive: true,
      searchDurationMs: Date.now() - searchStartMs,
      providerStatuses,
      rawProviderCounts,
      uniqueCount: deduplicatedJobs.length,
      interpretedPlan: {
        intentSummary: interpretedPlan.intentSummary,
        role: interpretedPlan.role,
        city: interpretedPlan.city,
        state: interpretedPlan.state,
        country: interpretedPlan.country,
        workArrangement: interpretedPlan.workArrangement,
        salaryMin: interpretedPlan.salaryMin,
        salaryCurrency: interpretedPlan.salaryCurrency,
        isAiInterpreted: interpretedPlan.isAiInterpreted,
      },
      appliedFiltersSummary: {
        providerSide: providerSideFilters,
        inMemory: inMemoryFilters,
      },
      trace: {
        correlationId,
        clientSubmittedAtMs,
        apiEntryMs,
        serverDurationMs: Date.now() - apiEntryMs,
        checkpoints,
      },
    };

    logger.info("[LiveSearch] Completed live job search", {
      durationMs: Date.now() - searchStartMs,
      jobsFound: uiResults.length,
      page,
      hasMore,
    });

    return response;
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
