/**
 * Global Job Discovery & Collection Engine — Jobicy Provider Adapter
 *
 * Official Free Remote Jobs API
 * Covers: Engineering, Sales, Marketing, Customer Support, Finance, Management, Design.
 * API Endpoint: https://jobicy.com/api/v2/remote-jobs
 * Permitted Use: Free public API with source attribution.
 */

import { BaseJobProvider } from "./base";
import {
  normalizeCompanyName,
  normalizeJobTitle,
  inferIndustry,
  inferSeniority,
  normalizeEmploymentType,
  extractSkills,
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

export class JobicyAdapter extends BaseJobProvider {
  readonly id = "jobicy";
  readonly name = "Jobicy Remote Careers";
  readonly category = "AGGREGATOR" as const;
  readonly defaultBaseUrl = "https://jobicy.com/api/v2/remote-jobs";
  readonly rateLimitPerMinute = 30;
  readonly rateLimitDaily = 2000;
  readonly attributionNotice = "Remote job listings sourced from Jobicy Public API";
  readonly permittedTermsUrl = "https://jobicy.com/jobs-rss-feed";

  isConfigured(): boolean {
    return true; // Free public API
  }

  async checkHealth(): Promise<ProviderHealthReport> {
    const start = Date.now();
    try {
      const res = await this.safeFetch(`${this.defaultBaseUrl}?count=1`, {}, 1);
      const latency = Date.now() - start;
      return {
        providerId: this.id,
        isHealthy: res.ok,
        isConfigured: true,
        latencyMs: latency,
        statusMessage: res.ok ? "Jobicy API reachable" : `HTTP ${res.status}`,
        lastChecked: new Date(),
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        isHealthy: false,
        isConfigured: true,
        latencyMs: Date.now() - start,
        statusMessage: `Jobicy unreachable: ${err?.message}`,
        lastChecked: new Date(),
      };
    }
  }

  async fetchJobs(params: ProviderSearchParams): Promise<ProviderFetchResult> {
    const count = Math.min(params.pageSize || 20, 50);
    const url = new URL(this.defaultBaseUrl);
    url.searchParams.set("count", String(count));
    if (params.country) {
      url.searchParams.set("geo", params.country.toLowerCase());
    }
    if (params.industry) {
      url.searchParams.set("industry", params.industry.toLowerCase());
    }

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
      const rawList = Array.isArray(json.jobs) ? json.jobs : [];

      let filtered = rawList;
      if (params.keywords) {
        const q = params.keywords.toLowerCase();
        filtered = filtered.filter(
          (j: any) =>
            (j.jobTitle || "").toLowerCase().includes(q) ||
            (j.companyName || "").toLowerCase().includes(q) ||
            (j.jobDescription || "").toLowerCase().includes(q)
        );
      }

      const normalized = filtered.map((item: any) => this.normalizeRecord(item));

      return {
        jobs: normalized,
        // Jobicy does not return server-side query search match totals
        totalAvailable: undefined,
        hasMore: false, // Jobicy provides snapshot feeds
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

    const title = raw.jobTitle || "Untitled Remote Role";
    const company = raw.companyName || "Unknown Employer";
    const description = raw.jobDescription || "";

    const normTitle = normalizeJobTitle(title);
    const normCompany = normalizeCompanyName(company);

    const industry = inferIndustry(title, description, raw.jobIndustry);
    const seniority = inferSeniority(title) || (raw.jobLevel ? (raw.jobLevel.toUpperCase() as any) : null);
    const employmentType = normalizeEmploymentType(raw.jobType);

    const salaryMin = raw.annualSalaryMin ? Number(raw.annualSalaryMin) : null;
    const salaryMax = raw.annualSalaryMax ? Number(raw.annualSalaryMax) : null;

    const quality = assessJobQuality({
      title,
      companyName: company,
      externalUrl: rawUrl,
      jobDescription: description,
      postedAt: raw.pubDate,
    });

    const contentFingerprint = computeContentFingerprint({
      companyName: normCompany,
      title: normTitle,
      canonicalUrl,
      location: raw.jobGeo || "Remote",
    });

    return {
      providerId: this.id,
      externalId: String(raw.id || raw.url || contentFingerprint),
      title,
      normalizedTitle: normTitle,
      companyName: company,
      normalizedCompany: normCompany,
      jobDescription: description,
      requiredSkills: extractSkills(`${title} ${description}`),
      preferredSkills: [],
      industry,
      employmentType,
      seniorityLevel: seniority,
      experienceMin: null,
      experienceMax: null,
      salaryMin,
      salaryMax,
      salaryCurrency: raw.salaryCurrency || "USD",
      salaryPeriod: "YEARLY",
      country: raw.jobGeo && raw.jobGeo !== "Anywhere" ? raw.jobGeo : "REMOTE",
      state: null,
      city: null,
      workArrangement: "REMOTE",
      postedAt: raw.pubDate ? new Date(raw.pubDate) : null,
      closingDate: null,
      externalUrl: rawUrl,
      canonicalUrl,
      sourceAttribution: "Jobicy Remote Feed",
      verificationStatus: quality.verificationStatus,
      availabilityStatus: quality.availabilityStatus,
      contentFingerprint,
      duplicateGroupId: null,
      isDuplicate: false,
      qualityScore: quality.qualityScore,
      rawMetadata: {
        jobGeo: raw.jobGeo,
        jobIndustry: raw.jobIndustry,
      },
    };
  }
}
