/**
 * Global Job Discovery & Collection Engine — Direct ATS Provider Adapter
 *
 * Connects directly to permitted public employer ATS feeds (Greenhouse & Lever)
 * without web scraping or bypassing authentication.
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

export class DirectAtsAdapter extends BaseJobProvider {
  readonly id = "direct_ats";
  readonly name = "Direct Employer ATS Feeds";
  readonly category = "DIRECT_ATS" as const;
  readonly defaultBaseUrl = "https://boards-api.greenhouse.io/v1/boards";
  readonly rateLimitPerMinute = 60;
  readonly rateLimitDaily = 10000;
  readonly attributionNotice = "Direct official employer ATS feeds via public Greenhouse & Lever APIs";
  readonly permittedTermsUrl = "https://developers.greenhouse.io/job-board.html";

  // Sample curated partner boards across technology, health, and finance
  private sampleBoards = [
    { token: "stripe", name: "Stripe", industry: "finance_banking" },
    { token: "gitlab", name: "GitLab", industry: "technology" },
  ];

  isConfigured(): boolean {
    return true; // Public employer boards are open APIs
  }

  async checkHealth(): Promise<ProviderHealthReport> {
    const start = Date.now();
    try {
      const res = await this.safeFetch(`${this.defaultBaseUrl}/gitlab/jobs`, {}, 1);
      const latency = Date.now() - start;
      return {
        providerId: this.id,
        isHealthy: res.ok,
        isConfigured: true,
        latencyMs: latency,
        statusMessage: res.ok ? "Direct ATS feeds operational" : `HTTP ${res.status}`,
        lastChecked: new Date(),
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        isHealthy: false,
        isConfigured: true,
        latencyMs: Date.now() - start,
        statusMessage: `Direct ATS unreachable: ${err?.message}`,
        lastChecked: new Date(),
      };
    }
  }

  async fetchJobs(params: ProviderSearchParams): Promise<ProviderFetchResult> {
    const results: NormalizedDiscoveredJob[] = [];

    for (const board of this.sampleBoards) {
      try {
        const res = await this.safeFetch(`${this.defaultBaseUrl}/${board.token}/jobs?content=true`, {}, 1);
        if (res.ok) {
          const json = await res.json();
          const jobs = Array.isArray(json.jobs) ? json.jobs : [];
          for (const raw of jobs.slice(0, 15)) {
            results.push(this.normalizeGreenhouseRecord(raw, board.name, board.industry));
          }
        }
      } catch {
        continue;
      }
    }

    let filtered = results;
    if (params.keywords) {
      const q = params.keywords.toLowerCase();
      filtered = filtered.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.companyName.toLowerCase().includes(q) ||
          j.jobDescription.toLowerCase().includes(q)
      );
    }

    return {
      jobs: filtered,
      totalAvailable: filtered.length,
      hasMore: false,
      providerId: this.id,
      rawCount: results.length,
    };
  }

  private normalizeGreenhouseRecord(raw: any, employer: string, defaultIndustry: string): NormalizedDiscoveredJob {
    const rawUrl = raw.absolute_url || "";
    const ats = canonicalizeAtsUrl(rawUrl);
    const canonicalUrl = ats.canonicalUrl || rawUrl;

    const title = raw.title || "Untitled Position";
    const location = raw.location?.name || "";
    const description = raw.content || "";

    const normTitle = normalizeJobTitle(title);
    const normCompany = normalizeCompanyName(employer);
    const parsedLoc = parseLocation(location);

    const workArrangement = detectWorkArrangement(location, description, title);
    const industry = inferIndustry(title, description, defaultIndustry);
    const seniority = inferSeniority(title);

    const quality = assessJobQuality({
      title,
      companyName: employer,
      externalUrl: rawUrl,
      jobDescription: description,
      postedAt: raw.updated_at,
    });

    const contentFingerprint = computeContentFingerprint({
      companyName: normCompany,
      title: normTitle,
      canonicalUrl,
      location: parsedLoc.city || parsedLoc.country,
    });

    return {
      providerId: this.id,
      externalId: String(raw.id || contentFingerprint),
      title,
      normalizedTitle: normTitle,
      companyName: employer,
      normalizedCompany: normCompany,
      jobDescription: description,
      requiredSkills: extractSkills(`${title} ${description}`),
      preferredSkills: [],
      industry,
      employmentType: "FULL_TIME",
      seniorityLevel: seniority,
      experienceMin: null,
      experienceMax: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "USD",
      salaryPeriod: "YEARLY",
      country: parsedLoc.country || (workArrangement === "REMOTE" ? "REMOTE" : null),
      state: parsedLoc.state || null,
      city: parsedLoc.city || location,
      workArrangement,
      postedAt: raw.updated_at ? new Date(raw.updated_at) : null,
      closingDate: null,
      externalUrl: rawUrl,
      canonicalUrl,
      sourceAttribution: `Official Career Board (${employer})`,
      verificationStatus: quality.verificationStatus,
      availabilityStatus: quality.availabilityStatus,
      contentFingerprint,
      duplicateGroupId: null,
      isDuplicate: false,
      qualityScore: quality.qualityScore,
      rawMetadata: {
        greenhouseId: raw.id,
        board: employer,
      },
    };
  }
}
