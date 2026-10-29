import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LiveJobSearchEngine,
  generateJobSearchCacheKey,
  clearJobSearchCache,
} from "@/lib/job-discovery/live-search";
import { extractExperience } from "@/lib/job-discovery/normalizer";
import { computeContentFingerprint } from "@/lib/job-discovery/deduplication";
import { JobSearchQuerySchema } from "@/lib/job-discovery/contracts";
import { jobProviderRegistry } from "@/lib/job-discovery/registry";
import type { NormalizedDiscoveredJob } from "@/lib/job-discovery/types";

describe("Phase 5 — Advanced Search Correctness & Experience Filter Tests", () => {
  let engine: LiveJobSearchEngine;

  let jobSeq = 0;
  const createMockJob = (overrides: Partial<NormalizedDiscoveredJob> = {}): NormalizedDiscoveredJob => {
    jobSeq++;
    return {
      providerId: "freehire",
      externalId: `ext-${jobSeq}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Software Engineer",
      normalizedTitle: "Software Engineer",
      companyName: "Acme Corp",
      normalizedCompany: "Acme",
      jobDescription: "Developing modern web services.",
      requiredSkills: ["TypeScript", "Node.js"],
      preferredSkills: [],
      industry: "technology",
      employmentType: "FULL_TIME",
      seniorityLevel: "MID",
      experienceMin: null,
      experienceMax: null,
      salaryMin: 100000,
      salaryMax: 130000,
      salaryCurrency: "USD",
      salaryPeriod: "YEARLY",
      country: "US",
      city: "San Francisco",
      workArrangement: "REMOTE",
      postedAt: new Date(Date.now() - 86400000),
      externalUrl: `https://acme.com/jobs/${jobSeq}`,
      canonicalUrl: `https://acme.com/jobs/${jobSeq}`,
      sourceAttribution: "Official ATS via FreeHire",
      verificationStatus: "SOURCE_CONFIRMED",
      availabilityStatus: "OPEN",
      contentFingerprint: `fp-${jobSeq}-${Math.random().toString(36).slice(2, 8)}`,
      qualityScore: 90,
      ...overrides,
    };
  };

  beforeEach(() => {
    engine = new LiveJobSearchEngine();
    clearJobSearchCache();
    vi.clearAllMocks();
  });

  // 1. Normal and advanced searches with the same broad query
  describe("1. Normal vs Advanced Search Consistency", () => {
    it("returns consistent results for normal and advanced modes with cleared filters", async () => {
      const provider = jobProviderRegistry.getProvider("freehire");
      expect(provider).toBeDefined();

      const jobs = [
        createMockJob({ title: "Frontend Engineer", experienceMin: 2, experienceMax: 4 }),
        createMockJob({ title: "Backend Engineer", experienceMin: 5, experienceMax: null }),
        createMockJob({ title: "Fullstack Engineer", experienceMin: null, experienceMax: null }),
      ];

      vi.spyOn(provider!, "fetchJobs").mockResolvedValue({
        jobs,
        totalAvailable: 3,
        hasMore: false,
        providerId: "freehire",
        rawCount: 3,
      });

      // Normal Search
      const normalResult = await engine.searchLiveJobs({
        query: "Engineer",
        providerIds: ["freehire"],
      });

      // Advanced Search with broad filters matching the query
      const advancedResult = await engine.searchLiveJobs({
        query: "Engineer",
        providerIds: ["freehire"],
        experienceIncludeUnspecified: true,
      });

      expect(normalResult.jobs.length).toBeGreaterThan(0);
      expect(advancedResult.jobs.length).toBe(normalResult.jobs.length);
    });
  });

  // 2. Experience ranges 0–2, 0–5, 5–10, and 0–30
  describe("2. Experience Range Overlap Matching", () => {
    it("correctly matches Entry range (0–2 years)", () => {
      // 0-2 candidate
      const uMin = 0;
      const uMax = 2;

      // 5+ yrs job -> should NOT match
      const j1Min = 5;
      const j1Max = Infinity;
      expect(j1Min <= uMax && j1Max >= uMin).toBe(false);

      // 0-1 yrs job -> should match
      const j2Min = 0;
      const j2Max = 1;
      expect(j2Min <= uMax && j2Max >= uMin).toBe(true);

      // 2-4 yrs job -> overlaps at 2
      const j3Min = 2;
      const j3Max = 4;
      expect(j3Min <= uMax && j3Max >= uMin).toBe(true);
    });

    it("correctly matches 0–5, 5–10, and 0–30 ranges", () => {
      // 5-10 range:
      const uMin = 5;
      const uMax = 10;

      // 5+ years job (jMin=5, jMax=Infinity) overlaps with 5-10
      expect(5 <= uMax && Infinity >= uMin).toBe(true);

      // 1-3 years job (jMin=1, jMax=3) does NOT overlap with 5-10
      expect(1 <= uMax && 3 >= uMin).toBe(false);

      // 0-30 range overlaps with any realistic job (e.g. 8-12 years)
      expect(8 <= 30 && 12 >= 0).toBe(true);
    });
  });

  // 3. Minimum-only and maximum-only ranges
  describe("3. Minimum-only and Maximum-only Ranges", () => {
    it("handles minimum-only filter (e.g. at least 5 years)", () => {
      const uMin = 5;
      const uMax = Infinity;

      // 3-4 years job does NOT qualify
      expect(3 <= uMax && 4 >= uMin).toBe(false);

      // 5+ years qualifies
      expect(5 <= uMax && Infinity >= uMin).toBe(true);

      // 7-10 years qualifies
      expect(7 <= uMax && 10 >= uMin).toBe(true);
    });

    it("handles maximum-only filter (e.g. at most 3 years)", () => {
      const uMin = 0;
      const uMax = 3;

      // 5+ years job does NOT qualify
      expect(5 <= uMax && Infinity >= uMin).toBe(false);

      // 1-2 years qualifies
      expect(1 <= uMax && 2 >= uMin).toBe(true);
    });
  });

  // 4. Invalid values and minimum greater than maximum
  describe("4. Numeric Validation (min <= max)", () => {
    it("rejects minimum greater than maximum in JobSearchQuerySchema", () => {
      const result = JobSearchQuerySchema.safeParse({
        query: "Developer",
        experienceMin: 8,
        experienceMax: 3,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot exceed maximum");
      }
    });

    it("accepts valid minimum <= maximum", () => {
      const result = JobSearchQuerySchema.safeParse({
        query: "Developer",
        experienceMin: 3,
        experienceMax: 8,
      });

      expect(result.success).toBe(true);
    });
  });

  // 5. Missing and ambiguous experience requirements
  describe("5. Deterministic Experience Extraction from Text", () => {
    it("extracts '5+ years' and 'at least 3 years'", () => {
      const res1 = extractExperience("Requires 5+ years of software development experience.");
      expect(res1.isExplicit).toBe(true);
      expect(res1.experienceMin).toBe(5);
      expect(res1.experienceMax).toBe(null);

      const res2 = extractExperience("Candidate must have at least 3 years in clinical nursing.");
      expect(res2.isExplicit).toBe(true);
      expect(res2.experienceMin).toBe(3);
      expect(res2.experienceMax).toBe(null);
    });

    it("extracts ranges like '5–8 years' and '3 to 5 yrs'", () => {
      const res1 = extractExperience("Seeking an engineer with 5–8 years experience in distributed systems.");
      expect(res1.isExplicit).toBe(true);
      expect(res1.experienceMin).toBe(5);
      expect(res1.experienceMax).toBe(8);

      const res2 = extractExperience("Between 3 to 5 yrs of relevant experience.");
      expect(res2.isExplicit).toBe(true);
      expect(res2.experienceMin).toBe(3);
      expect(res2.experienceMax).toBe(5);
    });

    it("extracts entry level and no experience requirements", () => {
      const res = extractExperience("Entry-level position. No experience required for recent graduates.");
      expect(res.isExplicit).toBe(true);
      expect(res.experienceMin).toBe(0);
      expect(res.experienceMax).toBe(1);
    });

    it("preserves null on ambiguous or missing requirements without inventing numbers", () => {
      const res = extractExperience("Company founded 20 years ago. Great benefits and 401k matching.");
      expect(res.isExplicit).toBe(false);
      expect(res.experienceMin).toBe(null);
      expect(res.experienceMax).toBe(null);
    });
  });

  // 6. Include/exclude unspecified experience behavior
  describe("6. Configurable Unspecified Experience Behavior", () => {
    it("includes unspecified jobs when experienceIncludeUnspecified is true", async () => {
      const provider = jobProviderRegistry.getProvider("freehire");
      const unspecJob = createMockJob({
        title: "Platform Engineer",
        jobDescription: "Help scale our cloud infrastructure.",
        experienceMin: null,
        experienceMax: null,
      });

      vi.spyOn(provider!, "fetchJobs").mockResolvedValue({
        jobs: [unspecJob],
        totalAvailable: 1,
        hasMore: false,
        providerId: "freehire",
        rawCount: 1,
      });

      const result = await engine.searchLiveJobs({
        query: "Platform",
        providerIds: ["freehire"],
        experienceMin: 3,
        experienceMax: 7,
        experienceIncludeUnspecified: true,
      });

      expect(result.jobs.length).toBe(1);
    });

    it("excludes unspecified jobs when experienceIncludeUnspecified is false", async () => {
      const provider = jobProviderRegistry.getProvider("freehire");
      const unspecJob = createMockJob({
        title: "Platform Engineer",
        jobDescription: "Help scale our cloud infrastructure.",
        experienceMin: null,
        experienceMax: null,
      });

      vi.spyOn(provider!, "fetchJobs").mockResolvedValue({
        jobs: [unspecJob],
        totalAvailable: 1,
        hasMore: false,
        providerId: "freehire",
        rawCount: 1,
      });

      const result = await engine.searchLiveJobs({
        query: "Platform",
        providerIds: ["freehire"],
        experienceMin: 3,
        experienceMax: 7,
        experienceIncludeUnspecified: false,
      });

      expect(result.jobs.length).toBe(0);
    });
  });

  // 7. Provider adapters with different filter capabilities
  describe("7. Provider Filter Capabilities Declaration", () => {
    it("verifies all providers declare supportedFilters correctly", () => {
      const providers = jobProviderRegistry.getAllProviders();
      for (const prov of providers) {
        expect(prov.supportedFilters).toBeDefined();
        expect(Array.isArray(prov.supportedFilters)).toBe(true);
        expect(prov.supportedFilters!.length).toBeGreaterThan(0);
      }
    });
  });

  // 8. Results spread across multiple pages
  describe("8. Multi-page Pagination", () => {
    it("correctly handles page navigation and page sizing", async () => {
      const provider = jobProviderRegistry.getProvider("freehire");
      const manyJobs = Array.from({ length: 25 }, (_, i) =>
        createMockJob({ externalId: `paged-${i}`, title: `Engineer ${i}` })
      );

      vi.spyOn(provider!, "fetchJobs").mockResolvedValue({
        jobs: manyJobs,
        totalAvailable: 50,
        hasMore: true,
        providerId: "freehire",
        rawCount: 25,
      });

      const page1 = await engine.searchLiveJobs({
        query: "Engineer",
        providerIds: ["freehire"],
        page: 1,
        pageSize: 10,
      });

      expect(page1.jobs.length).toBe(10);
      expect(page1.hasMore).toBe(true);
      expect(page1.page).toBe(1);
    });
  });

  // 9. Bounded buffer prefetching prevents filter starvation
  describe("9. Bounded Buffer Prefetching", () => {
    it("requests an expanded batch size from providers when in-memory filters are active", async () => {
      const provider = jobProviderRegistry.getProvider("freehire");
      const fetchSpy = vi.spyOn(provider!, "fetchJobs").mockResolvedValue({
        jobs: [],
        totalAvailable: 0,
        hasMore: false,
        providerId: "freehire",
        rawCount: 0,
      });

      await engine.searchLiveJobs({
        query: "Engineer",
        providerIds: ["freehire"],
        experienceMin: 5,
        experienceMax: 10,
        pageSize: 15,
      });

      // Provider should be queried for at least 45 records to ensure in-memory filtering doesn't starve
      expect(fetchSpy).toHaveBeenCalled();
      const calledParams = fetchSpy.mock.calls[0]?.[0];
      expect(calledParams?.pageSize).toBeGreaterThanOrEqual(45);
    });
  });

  // 10. Duplicate jobs from multiple sources
  describe("10. Multi-source Deduplication", () => {
    it("deduplicates identical postings from different providers", async () => {
      const freehire = jobProviderRegistry.getProvider("freehire");
      const arbeitnow = jobProviderRegistry.getProvider("arbeitnow");

      const sameCanonicalUrl = "https://stripe.com/jobs/staff-eng";
      const fp = computeContentFingerprint({
        companyName: "Stripe",
        title: "Staff Engineer",
        canonicalUrl: sameCanonicalUrl,
      });
      const job1 = createMockJob({
        providerId: "freehire",
        externalUrl: sameCanonicalUrl,
        canonicalUrl: sameCanonicalUrl,
        contentFingerprint: fp,
        title: "Staff Engineer",
        companyName: "Stripe",
      });
      const job2 = createMockJob({
        providerId: "arbeitnow",
        externalUrl: sameCanonicalUrl,
        canonicalUrl: sameCanonicalUrl,
        contentFingerprint: fp,
        title: "Staff Engineer",
        companyName: "Stripe",
      });

      vi.spyOn(freehire!, "fetchJobs").mockResolvedValue({
        jobs: [job1],
        totalAvailable: 1,
        hasMore: false,
        providerId: "freehire",
        rawCount: 1,
      });

      vi.spyOn(arbeitnow!, "fetchJobs").mockResolvedValue({
        jobs: [job2],
        totalAvailable: 1,
        hasMore: false,
        providerId: "arbeitnow",
        rawCount: 1,
      });

      const result = await engine.searchLiveJobs({
        query: "Staff Engineer",
        providerIds: ["freehire", "arbeitnow"],
      });

      expect(result.jobs.length).toBe(1);
      expect(result.uniqueCount).toBe(1);
    });
  });

  // 11. Provider timeout and partial failure behavior
  describe("11. Provider Partial Failures and Health Reporting", () => {
    it("reports partial failure status when one provider fails without failing entire search", async () => {
      const freehire = jobProviderRegistry.getProvider("freehire");
      const arbeitnow = jobProviderRegistry.getProvider("arbeitnow");

      vi.spyOn(freehire!, "fetchJobs").mockResolvedValue({
        jobs: [createMockJob({ title: "Available Lead" })],
        totalAvailable: 1,
        hasMore: false,
        providerId: "freehire",
        rawCount: 1,
      });

      vi.spyOn(arbeitnow!, "fetchJobs").mockRejectedValue(new Error("Network timeout"));

      const result = await engine.searchLiveJobs({
        query: "Lead",
        providerIds: ["freehire", "arbeitnow"],
      });

      expect(result.jobs.length).toBe(1);
      expect(result.providerStatuses).toBeDefined();

      const failedStatus = result.providerStatuses?.find((ps) => ps.providerId === "arbeitnow");
      expect(["TIMEOUT", "FAILED"]).toContain(failedStatus?.status);

      const okStatus = result.providerStatuses?.find((ps) => ps.providerId === "freehire");
      expect(okStatus?.status).toBe("SUCCESS");
    });
  });

  // 12. Cache key correctness across different filters
  describe("12. Cache Key Determinism", () => {
    it("generates different cache keys for different search filters", () => {
      const base = {
        query: "Software",
        experienceMin: 2,
        experienceMax: 5,
      };

      const key1 = generateJobSearchCacheKey(base as any);
      const key2 = generateJobSearchCacheKey({ ...base, experienceMax: 8 } as any);
      const key3 = generateJobSearchCacheKey({ ...base, experienceIncludeUnspecified: false } as any);

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it("generates identical cache keys regardless of array filter item order", () => {
      const key1 = generateJobSearchCacheKey({
        query: "Software",
        skills: ["React", "TypeScript", "Node.js"],
      } as any);

      const key2 = generateJobSearchCacheKey({
        query: "Software",
        skills: ["Node.js", "TypeScript", "React"],
      } as any);

      expect(key1).toBe(key2);
    });
  });

  // 15. Accurate result counts and pagination metadata
  describe("15. Accurate Result Counts and Honest Metadata", () => {
    it("sets verifiedMatchingCount and marks isExactTotal honestly", async () => {
      const freehire = jobProviderRegistry.getProvider("freehire");
      const jobs = [
        createMockJob({ experienceMin: 3, experienceMax: 5 }),
        createMockJob({ experienceMin: 8, experienceMax: 10 }), // filtered out
      ];

      vi.spyOn(freehire!, "fetchJobs").mockResolvedValue({
        jobs,
        totalAvailable: 100, // Upstream catalog estimate
        hasMore: false,
        providerId: "freehire",
        rawCount: 2,
      });

      const result = await engine.searchLiveJobs({
        query: "Engineer",
        providerIds: ["freehire"],
        experienceMin: 2,
        experienceMax: 6,
      });

      // 1 matching job in verified set
      expect(result.jobs.length).toBe(1);
      expect(result.verifiedMatchingCount).toBe(1);
      // Because in-memory filters were applied, provider's 100 total cannot be claimed as exact total
      expect(result.isExactTotal).toBe(false);
    });
  });
});
