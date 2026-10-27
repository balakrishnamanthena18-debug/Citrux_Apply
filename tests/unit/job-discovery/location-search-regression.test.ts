import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveJobSearchEngine } from "@/lib/job-discovery/live-search";
import { matchCityWithAliases, CITY_ALIASES, parseLocation } from "@/lib/job-discovery/normalizer";
import { jobProviderRegistry } from "@/lib/job-discovery/registry";
import type { NormalizedDiscoveredJob, JobProviderAdapter, ProviderFetchResult } from "@/lib/job-discovery/types";

describe("Global Job Discovery — Location Search & Accurate Counts Regression", () => {
  describe("City Aliases and Location Matching", () => {
    it("matches Bengaluru and Bangalore aliases interchangeably", () => {
      expect(matchCityWithAliases("Bengaluru", "bangalore")).toBe(true);
      expect(matchCityWithAliases("Bangalore", "bengaluru")).toBe(true);
      expect(matchCityWithAliases("Bangalore Urban", "bengaluru")).toBe(true);
      expect(matchCityWithAliases("Bengaluru, Karnataka", "bangalore")).toBe(true);
    });

    it("matches other Indian tech hub aliases correctly", () => {
      expect(matchCityWithAliases("Gurgaon", "gurugram")).toBe(true);
      expect(matchCityWithAliases("Gurugram", "gurgaon")).toBe(true);
      expect(matchCityWithAliases("Mumbai", "bombay")).toBe(true);
      expect(matchCityWithAliases("Bombay", "mumbai")).toBe(true);
      expect(matchCityWithAliases("Secunderabad", "hyderabad")).toBe(true);
      expect(matchCityWithAliases("Madras", "chennai")).toBe(true);
      expect(matchCityWithAliases("Kolkata", "calcutta")).toBe(true);
    });

    it("matches US metro aliases correctly", () => {
      expect(matchCityWithAliases("San Francisco", "sf")).toBe(true);
      expect(matchCityWithAliases("New York City", "nyc")).toBe(true);
      expect(matchCityWithAliases("New York", "new york city")).toBe(true);
    });

    it("parses 3-part hyphenated locations and comma-separated locations", () => {
      const loc1 = parseLocation("India-Telangana-Hyderabad");
      expect(loc1.country).toBe("India");
      expect(loc1.state).toBe("Telangana");
      expect(loc1.city).toBe("Hyderabad");

      const loc2 = parseLocation("US-CA-San Francisco");
      expect(loc2.country).toBe("US");
      expect(loc2.state).toBe("CA");
      expect(loc2.city).toBe("San Francisco");

      const loc3 = parseLocation("Bengaluru, India");
      expect(loc3.city).toBe("Bengaluru");
      expect(loc3.country).toBe("India");
    });
  });

  describe("In-Memory Keyword & Location Filtering", () => {
    const mockJobs: NormalizedDiscoveredJob[] = [
      {
        providerId: "mock_provider",
        externalId: "job-1",
        title: "Senior Software Engineer",
        normalizedTitle: "senior software engineer",
        companyName: "Google",
        normalizedCompany: "google",
        jobDescription: "Build distributed cloud services with Go and Kubernetes.",
        requiredSkills: ["Go", "Kubernetes"],
        preferredSkills: [],
        employmentType: "FULL_TIME",
        workArrangement: "ONSITE",
        city: "Bengaluru",
        state: "Karnataka",
        country: "India",
        externalUrl: "https://example.com/job-1",
        canonicalUrl: "https://example.com/job-1",
        sourceAttribution: "Mock",
        verificationStatus: "SOURCE_CONFIRMED",
        availabilityStatus: "OPEN",
        contentFingerprint: "fp1",
        qualityScore: 90,
      },
      {
        providerId: "mock_provider",
        externalId: "job-2",
        title: "Frontend Engineer",
        normalizedTitle: "frontend engineer",
        companyName: "Toast",
        normalizedCompany: "toast",
        jobDescription: "Develop modern React web interfaces.",
        requiredSkills: ["React", "TypeScript"],
        preferredSkills: [],
        employmentType: "FULL_TIME",
        workArrangement: "HYBRID",
        city: "Bangalore",
        state: "Karnataka",
        country: "IN",
        externalUrl: "https://example.com/job-2",
        canonicalUrl: "https://example.com/job-2",
        sourceAttribution: "Mock",
        verificationStatus: "SOURCE_CONFIRMED",
        availabilityStatus: "OPEN",
        contentFingerprint: "fp2",
        qualityScore: 88,
      },
      {
        // False positive trap: Located in London, but description happens to mention Bengaluru
        providerId: "mock_provider",
        externalId: "job-3",
        title: "DevOps Engineer",
        normalizedTitle: "devops engineer",
        companyName: "Global FinTech",
        normalizedCompany: "global fintech",
        jobDescription: "Based in London UK. You will collaborate occasionally with teams in Bengaluru.",
        requiredSkills: ["AWS", "Terraform"],
        preferredSkills: [],
        employmentType: "FULL_TIME",
        workArrangement: "ONSITE",
        city: "London",
        state: "Greater London",
        country: "UK",
        externalUrl: "https://example.com/job-3",
        canonicalUrl: "https://example.com/job-3",
        sourceAttribution: "Mock",
        verificationStatus: "SOURCE_CONFIRMED",
        availabilityStatus: "OPEN",
        contentFingerprint: "fp3",
        qualityScore: 85,
      },
    ];

    let mockAdapter: JobProviderAdapter;

    beforeEach(() => {
      mockAdapter = {
        id: "mock_provider",
        name: "Mock Provider Adapter",
        category: "OFFICIAL_API",
        defaultBaseUrl: "https://example.com",
        rateLimitPerMinute: 60,
        rateLimitDaily: 1000,
        attributionNotice: "Mock",
        permittedTermsUrl: "https://example.com/terms",
        isConfigured: () => true,
        checkHealth: async () => ({
          providerId: "mock_provider",
          isHealthy: true,
          isConfigured: true,
          latencyMs: 10,
          statusMessage: "Healthy",
          lastChecked: new Date(),
        }),
        fetchJobs: async (): Promise<ProviderFetchResult> => ({
          jobs: mockJobs,
          totalAvailable: undefined, // Honest: provider does not supply aggregate search counts
          hasMore: false,
          providerId: "mock_provider",
          rawCount: mockJobs.length,
        }),
      };

      vi.spyOn(jobProviderRegistry, "getAllProviders").mockReturnValue([mockAdapter]);
    });

    it("matches Bengaluru location query including Bangalore alias without false positive London job", async () => {
      const engine = new LiveJobSearchEngine();
      const res = await engine.searchLiveJobs({
        query: "Bengaluru, Karnataka",
        page: 1,
        pageSize: 10,
      });

      // job-1 (Bengaluru) and job-2 (Bangalore alias) must be returned
      expect(res.jobs.some((j) => j.externalId === "job-1")).toBe(true);
      expect(res.jobs.some((j) => j.externalId === "job-2")).toBe(true);

      // job-3 (London) mentions Bengaluru in description, but is located in London -> must be excluded!
      expect(res.jobs.some((j) => j.externalId === "job-3")).toBe(false);
      expect(res.jobs.length).toBe(2);
    });

    it("applies structured city filter using aliases and rejects description-only matches", async () => {
      const engine = new LiveJobSearchEngine();
      const res = await engine.searchLiveJobs({
        cities: ["Bengaluru"],
        page: 1,
        pageSize: 10,
      });

      // job-1 (Bengaluru) and job-2 (Bangalore) match
      expect(res.jobs.some((j) => j.externalId === "job-1")).toBe(true);
      expect(res.jobs.some((j) => j.externalId === "job-2")).toBe(true);
      // job-3 (London) does NOT match city filter
      expect(res.jobs.some((j) => j.externalId === "job-3")).toBe(false);
      expect(res.jobs.length).toBe(2);
    });

    it("reports honest totals without fabricating ~15,044+ or aggregate index estimates", async () => {
      const engine = new LiveJobSearchEngine();
      const res = await engine.searchLiveJobs({
        query: "Bengaluru, Karnataka",
        page: 1,
        pageSize: 10,
      });

      expect(res.estimatedTotal).toBeUndefined();
      expect(res.isExactTotal).toBe(false);
      expect(res.totalPages).toBe(1);
      expect(res.hasMore).toBe(false);
      expect(res.uniqueCount).toBe(3); // 3 raw jobs fetched in memory session
      expect(res.jobs.length).toBe(2); // 2 matched
    });
  });

  describe("Provider Pagination Independence", () => {
    it("advances provider offsets sequentially with page numbers", async () => {
      const recordedParams: any[] = [];
      const mockPagingAdapter: JobProviderAdapter = {
        id: "mock_paging",
        name: "Mock Paging Adapter",
        category: "OFFICIAL_API",
        defaultBaseUrl: "https://example.com",
        rateLimitPerMinute: 60,
        rateLimitDaily: 1000,
        attributionNotice: "Mock",
        permittedTermsUrl: "https://example.com/terms",
        isConfigured: () => true,
        checkHealth: async () => ({
          providerId: "mock_paging",
          isHealthy: true,
          isConfigured: true,
          latencyMs: 10,
          statusMessage: "Healthy",
          lastChecked: new Date(),
        }),
        fetchJobs: async (params): Promise<ProviderFetchResult> => {
          recordedParams.push({ ...params });
          return {
            jobs: [],
            totalAvailable: undefined,
            hasMore: true,
            providerId: "mock_paging",
            rawCount: 0,
          };
        },
      };

      vi.spyOn(jobProviderRegistry, "getAllProviders").mockReturnValue([mockPagingAdapter]);

      const engine = new LiveJobSearchEngine();
      await engine.searchLiveJobs({ query: "Engineer", page: 1, pageSize: 20 });
      await engine.searchLiveJobs({ query: "Engineer", page: 2, pageSize: 20 });

      expect(recordedParams.length).toBe(2);
      expect(recordedParams[0].page).toBe(1);
      expect(recordedParams[0].pageSize).toBe(20);
      expect(recordedParams[1].page).toBe(2);
      expect(recordedParams[1].pageSize).toBe(20);
    });

    it("handles provider failure gracefully without throwing unhandled exceptions", async () => {
      const failingAdapter: JobProviderAdapter = {
        id: "failing_provider",
        name: "Failing Adapter",
        category: "OFFICIAL_API",
        defaultBaseUrl: "https://example.com",
        rateLimitPerMinute: 60,
        rateLimitDaily: 1000,
        attributionNotice: "Mock",
        permittedTermsUrl: "https://example.com/terms",
        isConfigured: () => true,
        checkHealth: async () => ({
          providerId: "failing_provider",
          isHealthy: false,
          isConfigured: true,
          latencyMs: 10,
          statusMessage: "Down",
          lastChecked: new Date(),
        }),
        fetchJobs: async (): Promise<ProviderFetchResult> => {
          throw new Error("503 Service Unavailable");
        },
      };

      vi.spyOn(jobProviderRegistry, "getAllProviders").mockReturnValue([failingAdapter]);

      const engine = new LiveJobSearchEngine();
      const res = await engine.searchLiveJobs({ query: "Engineer", page: 1, pageSize: 20 });

      expect(res.jobs).toEqual([]);
      expect(res.providerStatuses?.[0]?.status).toBe("FAILED");
      expect(res.providerStatuses?.[0]?.count).toBe(0);
    });
  });

  describe("Multi-Location ATS Postings and Evidence-Based Verification", () => {
    it("preserves multi-work locations and matches each city without losing other cities", () => {
      const parsed = parseLocation("Chennai; Bengaluru");
      expect(parsed.city).toBe("Chennai");
      expect(parsed.allCities).toEqual(["Chennai", "Bengaluru"]);

      const parsedUs = parseLocation("Austin, TX; San Francisco, CA");
      expect(parsedUs.allCities).toContain("Austin");
      expect(parsedUs.allCities).toContain("San Francisco");
    });

    it("matches multi-location jobs for both Bengaluru and Chennai without false matches for Hyderabad", async () => {
      const multiLocJob: NormalizedDiscoveredJob = {
        providerId: "mock_multi",
        externalId: "multi-1",
        title: "Senior Staff Engineer",
        normalizedTitle: "senior staff engineer",
        companyName: "Light & Wonder",
        normalizedCompany: "light and wonder",
        jobDescription: "Gaming systems architecture across engineering hubs.",
        requiredSkills: ["C++", "Architecture"],
        preferredSkills: [],
        employmentType: "FULL_TIME",
        workArrangement: "ONSITE",
        city: "Chennai",
        allCities: ["Chennai", "Bengaluru"],
        state: "Tamil Nadu",
        country: "IN",
        externalUrl: "https://example.com/multi-1",
        canonicalUrl: "https://example.com/multi-1",
        sourceAttribution: "Mock",
        verificationStatus: "SOURCE_CONFIRMED",
        availabilityStatus: "OPEN",
        contentFingerprint: "fp-multi",
        qualityScore: 92,
      };

      const mockAdapter: JobProviderAdapter = {
        id: "mock_multi",
        name: "Mock Multi Provider",
        category: "OFFICIAL_API",
        defaultBaseUrl: "https://example.com",
        rateLimitPerMinute: 60,
        rateLimitDaily: 1000,
        attributionNotice: "Mock",
        permittedTermsUrl: "https://example.com/terms",
        isConfigured: () => true,
        checkHealth: async () => ({
          providerId: "mock_multi",
          isHealthy: true,
          isConfigured: true,
          latencyMs: 5,
          statusMessage: "Healthy",
          lastChecked: new Date(),
        }),
        fetchJobs: async (): Promise<ProviderFetchResult> => ({
          jobs: [multiLocJob],
          totalAvailable: 1,
          hasMore: false,
          providerId: "mock_multi",
          rawCount: 1,
        }),
      };

      vi.spyOn(jobProviderRegistry, "getAllProviders").mockReturnValue([mockAdapter]);
      const engine = new LiveJobSearchEngine();

      // Search Bengaluru -> Should match via allCities
      const resBengaluru = await engine.searchLiveJobs({ cities: ["Bengaluru"] });
      expect(resBengaluru.jobs.length).toBe(1);
      expect(resBengaluru.jobs[0]?.externalId).toBe("multi-1");

      // Search Chennai -> Should match via primary city / allCities
      const resChennai = await engine.searchLiveJobs({ cities: ["Chennai"] });
      expect(resChennai.jobs.length).toBe(1);
      expect(resChennai.jobs[0]?.externalId).toBe("multi-1");

      // Search Hyderabad -> Must NOT match
      const resHyd = await engine.searchLiveJobs({ cities: ["Hyderabad"] });
      expect(resHyd.jobs.length).toBe(0);
    });

    it("does not invent a city when location is unevidenced", () => {
      const emptyLoc = parseLocation(null);
      expect(emptyLoc.city).toBeUndefined();
      expect(emptyLoc.allCities).toBeUndefined();

      const genericLoc = parseLocation("Remote");
      expect(genericLoc.city).toBe("Remote");
      expect(genericLoc.country).toBeUndefined();
    });
  });

  describe("Separate Count Concepts & Pagination Boundaries", () => {
    it("reports distinct providerReportedTotal, returnedBatchCount, verifiedMatchingCount, and hasMore", async () => {
      const batchOfJobs: NormalizedDiscoveredJob[] = [
        {
          providerId: "mock_counts",
          externalId: "count-1",
          title: "Staff Platform Engineer",
          normalizedTitle: "staff platform engineer",
          companyName: "Acme",
          normalizedCompany: "acme",
          jobDescription: "Platform tools",
          requiredSkills: ["Go"],
          preferredSkills: [],
          employmentType: "FULL_TIME",
          workArrangement: "ONSITE",
          city: "Bengaluru",
          allCities: ["Bengaluru"],
          country: "IN",
          externalUrl: "https://example.com/c1",
          canonicalUrl: "https://example.com/c1",
          sourceAttribution: "Mock",
          verificationStatus: "SOURCE_CONFIRMED",
          availabilityStatus: "OPEN",
          contentFingerprint: "fp-c1",
          qualityScore: 90,
        },
        {
          providerId: "mock_counts",
          externalId: "count-2",
          title: "Platform Engineer",
          normalizedTitle: "platform engineer",
          companyName: "Beta Corp",
          normalizedCompany: "beta corp",
          jobDescription: "Infrastructure tools in London",
          requiredSkills: ["AWS"],
          preferredSkills: [],
          employmentType: "FULL_TIME",
          workArrangement: "ONSITE",
          city: "London", // Not Bengaluru -> will be filtered out by verified location check
          allCities: ["London"],
          country: "UK",
          externalUrl: "https://example.com/c2",
          canonicalUrl: "https://example.com/c2",
          sourceAttribution: "Mock",
          verificationStatus: "SOURCE_CONFIRMED",
          availabilityStatus: "OPEN",
          contentFingerprint: "fp-c2",
          qualityScore: 88,
        },
      ];

      const mockCountAdapter: JobProviderAdapter = {
        id: "mock_counts",
        name: "Mock Count Adapter",
        category: "OFFICIAL_API",
        defaultBaseUrl: "https://example.com",
        rateLimitPerMinute: 60,
        rateLimitDaily: 1000,
        attributionNotice: "Mock",
        permittedTermsUrl: "https://example.com/terms",
        isConfigured: () => true,
        checkHealth: async () => ({
          providerId: "mock_counts",
          isHealthy: true,
          isConfigured: true,
          latencyMs: 5,
          statusMessage: "Healthy",
          lastChecked: new Date(),
        }),
        fetchJobs: async (): Promise<ProviderFetchResult> => ({
          jobs: batchOfJobs,
          totalAvailable: 8690, // Upstream provider-reported total
          hasMore: true,
          providerId: "mock_counts",
          rawCount: 2,
          totalScope: "CITY",
        }),
      };

      vi.spyOn(jobProviderRegistry, "getAllProviders").mockReturnValue([mockCountAdapter]);
      const engine = new LiveJobSearchEngine();

      const res = await engine.searchLiveJobs({
        cities: ["Bengaluru"],
        page: 1,
        pageSize: 10,
      });

      // 1. providerReportedTotal: Upstream reported matching query capacity
      expect(res.providerReportedTotal).toBe(8690);
      expect(res.totalScope).toBe("CITY");

      // 2. returnedBatchCount: Total records delivered by provider before verification filtering
      expect(res.returnedBatchCount).toBe(2);

      // 3. verifiedMatchingCount: Jobs in batch passing verified location & filter criteria
      expect(res.verifiedMatchingCount).toBe(1);
      expect(res.jobs.length).toBe(1);
      expect(res.jobs[0]?.externalId).toBe("count-1");

      // 4. hasMore: Supported pagination indicates more records exist upstream
      expect(res.hasMore).toBe(true);
    });
  });

  describe("FreeHire Adapter Contract & Parameter Accuracy", () => {
    it("omits countries when cities is provided to avoid OR-widening according to FreeHire API contract", async () => {
      const { FreeHireAdapter } = await import("@/lib/job-discovery/providers/freehire");
      const adapter = new FreeHireAdapter();

      let requestedUrl = "";
      vi.spyOn(adapter as any, "safeFetch").mockImplementation(async (...args: any[]) => {
        requestedUrl = args[0] as string;
        return {
          ok: true,
          json: async () => ({
            data: [],
            meta: { total: 0, ignored_params: [] },
          }),
        };
      });

      await adapter.fetchJobs({
        city: "Bengaluru",
        country: "IN",
        keywords: "Software Engineer",
      });

      const parsedUrl = new URL(requestedUrl);
      // Contract requirement: cities filter sent as 'cities'
      expect(parsedUrl.searchParams.get("cities")).toBe("Bengaluru");
      // Contract requirement: countries MUST NOT be combined with cities (which would trigger OR-expansion)
      expect(parsedUrl.searchParams.get("countries")).toBeNull();
      // Keywords passed as 'q'
      expect(parsedUrl.searchParams.get("q")).toBe("Software Engineer");
    });

    it("sends countries parameter when search is country-only without city", async () => {
      const { FreeHireAdapter } = await import("@/lib/job-discovery/providers/freehire");
      const adapter = new FreeHireAdapter();

      let requestedUrl = "";
      vi.spyOn(adapter as any, "safeFetch").mockImplementation(async (...args: any[]) => {
        requestedUrl = args[0] as string;
        return {
          ok: true,
          json: async () => ({
            data: [],
            meta: { total: 0, ignored_params: [] },
          }),
        };
      });

      await adapter.fetchJobs({
        country: "IN",
        keywords: "Software Engineer",
      });

      const parsedUrl = new URL(requestedUrl);
      expect(parsedUrl.searchParams.get("countries")).toBe("in");
      expect(parsedUrl.searchParams.get("cities")).toBeNull();
      expect(parsedUrl.searchParams.get("q")).toBe("Software Engineer");
    });

    it("detects and handles upstream meta.ignored_params", async () => {
      const { FreeHireAdapter } = await import("@/lib/job-discovery/providers/freehire");
      const adapter = new FreeHireAdapter();

      vi.spyOn(adapter as any, "safeFetch").mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({
            data: [],
            meta: {
              total: 100,
              ignored_params: [{ param: "unknown_filter", did_you_mean: "q" }],
            },
          }),
        };
      });

      const res = await adapter.fetchJobs({ city: "Bengaluru" });
      expect(res.ignoredParams).toEqual([{ param: "unknown_filter", did_you_mean: "q" }]);
      expect(res.appliedFilters?.["cities"]).toBe("Bengaluru");
    });
  });
});

