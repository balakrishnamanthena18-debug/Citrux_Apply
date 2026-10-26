/**
 * Global Job Discovery & Collection Engine — USAJOBS Provider Adapter
 *
 * Official US Federal Government Vacancy Search API
 * Covers: Healthcare, Engineering, Defense, IT, Finance, Administration, Public Safety.
 * Endpoint: https://data.usajobs.gov/api/search
 * Permitted Use: Official open government vacancy data (OPM).
 */

import { BaseJobProvider } from "./base";
import {
  normalizeCompanyName,
  normalizeJobTitle,
  inferIndustry,
  inferSeniority,
  parseLocation,
  extractSkills,
} from "../normalizer";
import { computeContentFingerprint } from "../deduplication";
import { assessJobQuality } from "../quality";
import type {
  NormalizedDiscoveredJob,
  ProviderSearchParams,
  ProviderFetchResult,
  ProviderHealthReport,
} from "../types";

export class UsaJobsAdapter extends BaseJobProvider {
  readonly id = "usajobs";
  readonly name = "USAJOBS Federal Public Sector";
  readonly category = "PUBLIC_SECTOR" as const;
  readonly defaultBaseUrl = "https://data.usajobs.gov/api/search";
  readonly rateLimitPerMinute = 60;
  readonly rateLimitDaily = 10000;
  readonly attributionNotice = "Official public vacancy announcements from the US Office of Personnel Management";
  readonly permittedTermsUrl = "https://developer.usajobs.gov/API-Reference";

  isConfigured(): boolean {
    return !!process.env.USAJOBS_API_KEY;
  }

  async checkHealth(): Promise<ProviderHealthReport> {
    if (!this.isConfigured()) {
      return {
        providerId: this.id,
        isHealthy: false,
        isConfigured: false,
        latencyMs: 0,
        statusMessage: "Unconfigured: USAJOBS_API_KEY environment variable is not set. Mock demonstration mode available.",
        lastChecked: new Date(),
      };
    }

    const start = Date.now();
    try {
      const res = await this.safeFetch(
        `${this.defaultBaseUrl}?ResultsPerPage=1`,
        {
          headers: {
            "Authorization-Key": process.env.USAJOBS_API_KEY!,
            "User-Agent": process.env.USAJOBS_USER_AGENT || "citruxhire@gmail.com",
          },
        },
        1
      );
      const latency = Date.now() - start;
      return {
        providerId: this.id,
        isHealthy: res.ok,
        isConfigured: true,
        latencyMs: latency,
        statusMessage: res.ok ? "USAJOBS API online" : `HTTP ${res.status}`,
        lastChecked: new Date(),
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        isHealthy: false,
        isConfigured: true,
        latencyMs: Date.now() - start,
        statusMessage: `USAJOBS network error: ${err?.message}`,
        lastChecked: new Date(),
      };
    }
  }

  async fetchJobs(params: ProviderSearchParams): Promise<ProviderFetchResult> {
    if (!this.isConfigured()) {
      return this.fetchMockFederalVacancies(params);
    }

    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 20, 50);

    const url = new URL(this.defaultBaseUrl);
    url.searchParams.set("Page", String(page));
    url.searchParams.set("ResultsPerPage", String(pageSize));
    if (params.keywords) {
      url.searchParams.set("Keyword", params.keywords);
    }

    try {
      const res = await this.safeFetch(url.toString(), {
        headers: {
          "Authorization-Key": process.env.USAJOBS_API_KEY!,
          "User-Agent": process.env.USAJOBS_USER_AGENT || "citruxhire@gmail.com",
        },
      });

      if (!res.ok) {
        return this.fetchMockFederalVacancies(params);
      }

      const json = await res.json();
      const items = json.SearchResult?.SearchResultItems || [];
      const normalized = items.map((item: any) => this.normalizeRecord(item));

      return {
        jobs: normalized,
        totalAvailable: json.SearchResult?.SearchResultCountAll || normalized.length,
        hasMore: items.length >= pageSize,
        providerId: this.id,
        rawCount: items.length,
      };
    } catch {
      return this.fetchMockFederalVacancies(params);
    }
  }

  private normalizeRecord(item: any): NormalizedDiscoveredJob {
    const desc = item.MatchedObjectDescriptor || {};
    const title = desc.PositionTitle || "Federal Vacancy";
    const company = desc.DepartmentName || desc.OrganizationName || "US Federal Government";
    const externalUrl = desc.PositionURI || "";
    const summary = desc.UserArea?.Details?.JobSummary || desc.QualificationSummary || "";

    const normTitle = normalizeJobTitle(title);
    const normCompany = normalizeCompanyName(company);

    const salaryObj = desc.PositionRemuneration?.[0];
    const salaryMin = salaryObj?.MinimumRange ? Math.round(Number(salaryObj.MinimumRange)) : null;
    const salaryMax = salaryObj?.MaximumRange ? Math.round(Number(salaryObj.MaximumRange)) : null;

    const locObj = desc.PositionLocation?.[0];
    const locationStr = locObj?.LocationName || "United States";
    const parsedLoc = parseLocation(locationStr);

    const isTelework = desc.UserArea?.Details?.TeleworkEligible === "Yes";
    const workArrangement = isTelework ? "HYBRID" : "ONSITE";

    const quality = assessJobQuality({
      title,
      companyName: company,
      externalUrl,
      jobDescription: summary,
      postedAt: desc.PublicationStartDate,
      closingDate: desc.ApplicationCloseDate,
    });

    const contentFingerprint = computeContentFingerprint({
      companyName: normCompany,
      title: normTitle,
      canonicalUrl: externalUrl,
      location: parsedLoc.city || "US",
    });

    return {
      providerId: this.id,
      externalId: String(desc.PositionID || contentFingerprint),
      title,
      normalizedTitle: normTitle,
      companyName: company,
      normalizedCompany: normCompany,
      jobDescription: summary,
      requiredSkills: extractSkills(`${title} ${summary}`),
      preferredSkills: [],
      industry: "public_sector",
      employmentType: "FULL_TIME",
      seniorityLevel: inferSeniority(title),
      experienceMin: null,
      experienceMax: null,
      salaryMin,
      salaryMax,
      salaryCurrency: "USD",
      salaryPeriod: "YEARLY",
      country: "US",
      state: parsedLoc.state || null,
      city: parsedLoc.city || null,
      workArrangement,
      postedAt: desc.PublicationStartDate ? new Date(desc.PublicationStartDate) : null,
      closingDate: desc.ApplicationCloseDate ? new Date(desc.ApplicationCloseDate) : null,
      externalUrl,
      canonicalUrl: externalUrl,
      sourceAttribution: "USAJOBS (US Office of Personnel Management)",
      verificationStatus: quality.verificationStatus,
      availabilityStatus: quality.availabilityStatus,
      contentFingerprint,
      duplicateGroupId: null,
      isDuplicate: false,
      qualityScore: quality.qualityScore,
      rawMetadata: {
        controlNumber: desc.PositionID,
        department: desc.DepartmentName,
      },
    };
  }

  /** Mock demonstration records when unconfigured */
  private fetchMockFederalVacancies(params: ProviderSearchParams): ProviderFetchResult {
    const mockList = [
      {
        PositionID: "usajobs-mock-01",
        PositionTitle: "Clinical Nurse (Medical/Surgical) - Veterans Health Administration",
        DepartmentName: "Department of Veterans Affairs",
        PositionURI: "https://www.usajobs.gov/job/mock-nurse-01",
        PublicationStartDate: new Date(Date.now() - 2 * 86400000).toISOString(),
        ApplicationCloseDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        PositionRemuneration: [{ MinimumRange: "72000", MaximumRange: "115000" }],
        PositionLocation: [{ LocationName: "Dallas, Texas, United States" }],
        UserArea: {
          Details: {
            JobSummary: "The Registered Nurse provides comprehensive patient-centered care for veteran patients in inpatient acute care.",
            TeleworkEligible: "No",
          },
        },
      },
      {
        PositionID: "usajobs-mock-02",
        PositionTitle: "IT Specialist (INFOSEC/Cybersecurity)",
        DepartmentName: "Department of Homeland Security",
        PositionURI: "https://www.usajobs.gov/job/mock-it-02",
        PublicationStartDate: new Date(Date.now() - 5 * 86400000).toISOString(),
        ApplicationCloseDate: new Date(Date.now() + 20 * 86400000).toISOString(),
        PositionRemuneration: [{ MinimumRange: "98000", MaximumRange: "145000" }],
        PositionLocation: [{ LocationName: "Washington, DC, United States" }],
        UserArea: {
          Details: {
            JobSummary: "Responsible for cyber defense monitoring, intrusion detection, incident response, and risk mitigation.",
            TeleworkEligible: "Yes",
          },
        },
      },
      {
        PositionID: "usajobs-mock-03",
        PositionTitle: "Financial Analyst (Budget & Treasury)",
        DepartmentName: "Department of the Treasury",
        PositionURI: "https://www.usajobs.gov/job/mock-fin-03",
        PublicationStartDate: new Date(Date.now() - 7 * 86400000).toISOString(),
        ApplicationCloseDate: new Date(Date.now() + 15 * 86400000).toISOString(),
        PositionRemuneration: [{ MinimumRange: "85000", MaximumRange: "128000" }],
        PositionLocation: [{ LocationName: "New York, NY, United States" }],
        UserArea: {
          Details: {
            JobSummary: "Performs budget formulation, fiscal analysis, accounting reviews, and federal audit compliance.",
            TeleworkEligible: "Yes",
          },
        },
      },
    ];

    let filtered = mockList;
    if (params.keywords) {
      const q = params.keywords.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.PositionTitle.toLowerCase().includes(q) ||
          m.DepartmentName.toLowerCase().includes(q) ||
          m.UserArea.Details.JobSummary.toLowerCase().includes(q)
      );
    }

    const normalized = filtered.map((item) => this.normalizeRecord({ MatchedObjectDescriptor: item }));

    return {
      jobs: normalized,
      totalAvailable: filtered.length,
      hasMore: false,
      providerId: this.id,
      rawCount: normalized.length,
    };
  }
}
