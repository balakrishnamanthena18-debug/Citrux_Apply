/**
 * Global Job Discovery & Collection Engine — Arbeitnow Provider Adapter
 *
 * Official Free Multi-Industry Job Board API
 * Covers: Technology, Marketing, Sales, Healthcare, Finance, Operations, Customer Service.
 * API Endpoint: https://www.arbeitnow.com/api/job-board-api
 * Permitted Use: Open public API provided for job search engines and platforms.
 */

import { BaseJobProvider } from "./base";
import {
  normalizeCompanyName,
  normalizeJobTitle,
  detectWorkArrangement,
  inferIndustry,
  inferSeniority,
  parseLocation,
  extractSkills,
  extractExperience,
} from "../normalizer";
import { computeContentFingerprint } from "../deduplication";
import { assessJobQuality } from "../quality";
import { canonicalizeAtsUrl } from "@/lib/data-quality/normalizer";
import type {
  NormalizedDiscoveredJob,
  ProviderSearchParams,
  ProviderFetchResult,
  ProviderHealthReport,
} from "../types";

export class ArbeitnowAdapter extends BaseJobProvider {
  readonly id = "arbeitnow";
  readonly name = "Arbeitnow Global Board";
  readonly category = "OFFICIAL_API" as const;
  readonly defaultBaseUrl = "https://www.arbeitnow.com/api/job-board-api";
  readonly rateLimitPerMinute = 60;
  readonly rateLimitDaily = 5000;
  readonly attributionNotice = "Job listings sourced via Arbeitnow Open Job Board API";
  readonly permittedTermsUrl = "https://www.arbeitnow.com/api/job-board-api";
  readonly supportedFilters = ["keywords", "page"] as const;

  isConfigured(): boolean {
    return true; // Completely open public API without API keys
  }

  async checkHealth(): Promise<ProviderHealthReport> {
    const start = Date.now();
    try {
      const res = await this.safeFetch(`${this.defaultBaseUrl}?page=1`, {}, 1);
      const latency = Date.now() - start;
      return {
        providerId: this.id,
        isHealthy: res.ok,
        isConfigured: true,
        latencyMs: latency,
        statusMessage: res.ok ? "Arbeitnow API reachable" : `HTTP ${res.status}`,
        lastChecked: new Date(),
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        isHealthy: false,
        isConfigured: true,
        latencyMs: Date.now() - start,
        statusMessage: `Arbeitnow unreachable: ${err?.message}`,
        lastChecked: new Date(),
      };
    }
  }

  async fetchJobs(params: ProviderSearchParams): Promise<ProviderFetchResult> {
    const page = params.page || 1;
    const url = new URL(this.defaultBaseUrl);
    url.searchParams.set("page", String(page));

    try {
      const res = await this.safeFetch(url.toString(), { signal: params.signal }, 1);
      if (!res.ok) {
        return {
          jobs: [],
          totalAvailable: 0,
          hasMore: false,
          providerId: this.id,
          rawCount: 0,
        };
      }

      const json = await res.json();
      const rawList = Array.isArray(json.data) ? json.data : [];

      let filtered = rawList;
      if (params.keywords) {
        const q = params.keywords.toLowerCase();
        filtered = filtered.filter(
          (j: any) =>
            (j.title || "").toLowerCase().includes(q) ||
            (j.company_name || "").toLowerCase().includes(q) ||
            (j.description || "").toLowerCase().includes(q)
        );
      }

      const normalized = filtered.map((item: any) => this.normalizeRecord(item));

      // Derive catalog size from pagination: links.last contains the last page URL
      // e.g. https://www.arbeitnow.com/api/job-board-api?page=119 → 119 × 300 = 35,700 jobs
      let totalAvailable: number | undefined = undefined;
      const lastUrl: string | undefined = json.links?.last;
      if (lastUrl) {
        try {
          const lastPage = parseInt(new URL(lastUrl).searchParams.get("page") || "0", 10);
          const perPage = (json.meta?.per_page as number) || 300;
          if (lastPage > 0) totalAvailable = lastPage * perPage;
        } catch {
          // ignore URL parse errors
        }
      }

      return {
        jobs: normalized,
        totalAvailable,
        totalScope: "GLOBAL" as const,
        hasMore: !!json.links?.next,
        providerId: this.id,
        rawCount: rawList.length,
      };
    } catch {
      return {
        jobs: [],
        totalAvailable: 0,
        hasMore: false,
        providerId: this.id,
        rawCount: 0,
      };
    }
  }

  private normalizeRecord(raw: any): NormalizedDiscoveredJob {
    const rawUrl = raw.url || "";
    const ats = canonicalizeAtsUrl(rawUrl);
    const canonicalUrl = ats.canonicalUrl || rawUrl;

    const title = raw.title || "Untitled Position";
    const company = raw.company_name || "Unknown Employer";
    const location = raw.location || "";
    const description = raw.description || "";

    const normTitle = normalizeJobTitle(title);
    const normCompany = normalizeCompanyName(company);
    const parsedLoc = parseLocation(location);

    const workArrangement =
      raw.remote === true
        ? "REMOTE"
        : detectWorkArrangement(location, description, title);

    const industry = inferIndustry(title, description, raw.tags?.[0]);
    const seniority = inferSeniority(title);

    const quality = assessJobQuality({
      title,
      companyName: company,
      externalUrl: rawUrl,
      jobDescription: description,
      postedAt: raw.created_at ? new Date(raw.created_at * 1000) : null,
    });

    const contentFingerprint = computeContentFingerprint({
      companyName: normCompany,
      title: normTitle,
      canonicalUrl,
      location: parsedLoc.city || parsedLoc.country,
    });

    const extractedExp = extractExperience(`${title} ${description}`);

    return {
      providerId: this.id,
      externalId: String(raw.slug || raw.url || contentFingerprint),
      title,
      normalizedTitle: normTitle,
      companyName: company,
      normalizedCompany: normCompany,
      jobDescription: description,
      requiredSkills: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags : extractSkills(`${title} ${description}`),
      preferredSkills: [],
      industry,
      employmentType: "FULL_TIME",
      seniorityLevel: seniority,
      experienceMin: extractedExp.experienceMin,
      experienceMax: extractedExp.experienceMax,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "EUR",
      salaryPeriod: "YEARLY",
      country: parsedLoc.country || (raw.remote ? "REMOTE" : null),
      state: parsedLoc.state || null,
      city: parsedLoc.city || location,
      workArrangement,
      postedAt: raw.created_at ? new Date(raw.created_at * 1000) : null,
      closingDate: null,
      externalUrl: rawUrl,
      canonicalUrl,
      sourceAttribution: "Arbeitnow Open Jobs",
      verificationStatus: quality.verificationStatus,
      availabilityStatus: quality.availabilityStatus,
      contentFingerprint,
      duplicateGroupId: null,
      isDuplicate: false,
      qualityScore: quality.qualityScore,
      rawMetadata: {
        slug: raw.slug,
        job_types: raw.job_types,
      },
    };
  }
}
