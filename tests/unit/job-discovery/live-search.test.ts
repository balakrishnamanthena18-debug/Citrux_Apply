import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveJobSearchEngine } from "@/lib/job-discovery/live-search";
import { prisma } from "@/lib/db/prisma";
import { jobProviderRegistry } from "@/lib/job-discovery/registry";
import type { NormalizedDiscoveredJob } from "@/lib/job-discovery/types";

describe("Live Job Search Engine (Zero-Bulk-Storage)", () => {
  let engine: LiveJobSearchEngine;

  const mockLiveJob1: NormalizedDiscoveredJob = {
    providerId: "freehire",
    externalId: "ext-live-001",
    title: "Senior Full Stack React Developer",
    normalizedTitle: "Senior Full Stack React Developer",
    companyName: "Stripe",
    normalizedCompany: "Stripe",
    jobDescription: "Build modern fintech applications with React, TypeScript, and Node.js.",
    requiredSkills: ["React", "TypeScript", "Node.js"],
    preferredSkills: ["GraphQL"],
    industry: "finance_banking",
    employmentType: "FULL_TIME",
    seniorityLevel: "SENIOR",
    workArrangement: "REMOTE",
    country: "US",
    city: "San Francisco",
    postedAt: new Date(Date.now() - 86400000),
    externalUrl: "https://stripe.com/jobs/001?utm_source=freehire.me",
    canonicalUrl: "https://stripe.com/jobs/001",
    sourceAttribution: "Greenhouse via FreeHire",
    verificationStatus: "SOURCE_CONFIRMED",
    availabilityStatus: "OPEN",
    contentFingerprint: "fingerprint-stripe-001",
    qualityScore: 95,
  };

  const mockLiveJob2: NormalizedDiscoveredJob = {
    providerId: "arbeitnow",
    externalId: "ext-live-002",
    title: "Registered Nurse - Intensive Care",
    normalizedTitle: "Registered Nurse",
    companyName: "Mayo Clinic",
    normalizedCompany: "Mayo Clinic",
    jobDescription: "Provide critical nursing care in an ICU facility.",
    requiredSkills: ["BLS", "ACLS", "ICU Nursing"],
    preferredSkills: [],
    industry: "healthcare",
    employmentType: "FULL_TIME",
    seniorityLevel: "MID",
    workArrangement: "ONSITE",
    country: "US",
    city: "Rochester",
    postedAt: new Date(Date.now() - 2 * 86400000),
    externalUrl: "https://jobs.mayoclinic.org/job/002",
    canonicalUrl: "https://jobs.mayoclinic.org/job/002",
    sourceAttribution: "Arbeitnow Open Board",
    verificationStatus: "SOURCE_CONFIRMED",
    availabilityStatus: "OPEN",
    contentFingerprint: "fingerprint-mayo-002",
    qualityScore: 90,
  };

  beforeEach(() => {
    engine = new LiveJobSearchEngine();
    vi.clearAllMocks();
  });

  it("retrieves live results in memory without creating bulk discovered_jobs records", async () => {
    const freehireProvider = jobProviderRegistry.getProvider("freehire");
    expect(freehireProvider).toBeDefined();

    // Mock fetchJobs on freehire provider
    const fetchSpy = vi.spyOn(freehireProvider!, "fetchJobs").mockResolvedValueOnce({
      jobs: [mockLiveJob1],
      totalAvailable: 1,
      hasMore: false,
      providerId: "freehire",
      rawCount: 1,
    });

    const initialDbCount = await prisma.discoveredJob.count();

    const response = await engine.searchLiveJobs({
      query: "React Developer",
      providerIds: ["freehire"],
      page: 1,
      pageSize: 10,
    });

    // Proves live search was executed
    expect(fetchSpy).toHaveBeenCalled();
    expect(response.isLive).toBe(true);
    expect(response.jobs.length).toBe(1);
    expect(response.jobs[0]?.title).toBe("Senior Full Stack React Developer");
    expect(response.jobs[0]?.sourceAttribution).toContain("FreeHire");

    // Proves NO bulk insertion occurred in discovered_jobs table!
    const finalDbCount = await prisma.discoveredJob.count();
    expect(finalDbCount).toBe(initialDbCount);
  });

  it("merges results across multiple providers and handles partial provider failure gracefully", async () => {
    const freehire = jobProviderRegistry.getProvider("freehire")!;
    const arbeitnow = jobProviderRegistry.getProvider("arbeitnow")!;

    vi.spyOn(freehire, "fetchJobs").mockResolvedValueOnce({
      jobs: [mockLiveJob1],
      totalAvailable: 1,
      hasMore: false,
      providerId: "freehire",
      rawCount: 1,
    });

    // Simulate timeout / network outage on Arbeitnow
    vi.spyOn(arbeitnow, "fetchJobs").mockRejectedValueOnce(new Error("Network timeout after 8000ms"));

    const response = await engine.searchLiveJobs({
      providerIds: ["freehire", "arbeitnow"],
    });

    // Live search succeeds with partial results rather than crashing
    expect(response.jobs.length).toBe(1);
    expect(response.jobs[0]?.companyName).toBe("Stripe");

    // Provider statuses accurately reflect the health of each source
    expect(response.providerStatuses?.length).toBe(2);
    const fhStatus = response.providerStatuses?.find((s) => s.providerId === "freehire");
    const anStatus = response.providerStatuses?.find((s) => s.providerId === "arbeitnow");

    expect(fhStatus?.status).toBe("SUCCESS");
    expect(fhStatus?.count).toBe(1);
    expect(anStatus?.status).toBe("TIMEOUT");
    expect(anStatus?.count).toBe(0);
  });

  it("deduplicates syndicated jobs across providers in memory", async () => {
    const freehire = jobProviderRegistry.getProvider("freehire")!;
    const arbeitnow = jobProviderRegistry.getProvider("arbeitnow")!;

    const duplicateSyndicatedJob: NormalizedDiscoveredJob = {
      ...mockLiveJob1,
      providerId: "arbeitnow",
      externalId: "arbeitnow-syn-999",
      externalUrl: "https://stripe.com/jobs/001?utm_source=arbeitnow",
      canonicalUrl: "https://stripe.com/jobs/001", // Exact canonical ATS match
    };

    vi.spyOn(freehire, "fetchJobs").mockResolvedValueOnce({
      jobs: [mockLiveJob1],
      hasMore: false,
      providerId: "freehire",
      rawCount: 1,
    });

    vi.spyOn(arbeitnow, "fetchJobs").mockResolvedValueOnce({
      jobs: [duplicateSyndicatedJob],
      hasMore: false,
      providerId: "arbeitnow",
      rawCount: 1,
    });

    const response = await engine.searchLiveJobs({
      providerIds: ["freehire", "arbeitnow"],
    });

    // Deduplicated in memory to 1 unique vacancy
    expect(response.jobs.length).toBe(1);
    expect(response.jobs[0]?.canonicalUrl).toBe("https://stripe.com/jobs/001");
  });

  it("applies in-memory industry, country, and remote filters accurately", async () => {
    const freehire = jobProviderRegistry.getProvider("freehire")!;

    vi.spyOn(freehire, "fetchJobs").mockResolvedValueOnce({
      jobs: [mockLiveJob1, mockLiveJob2],
      hasMore: false,
      providerId: "freehire",
      rawCount: 2,
    });

    // Filter by healthcare only
    const resHealthcare = await engine.searchLiveJobs({
      providerIds: ["freehire"],
      industries: ["healthcare"],
    });
    expect(resHealthcare.jobs.length).toBe(1);
    expect(resHealthcare.jobs[0]?.companyName).toBe("Mayo Clinic");

    vi.spyOn(freehire, "fetchJobs").mockResolvedValueOnce({
      jobs: [mockLiveJob1, mockLiveJob2],
      hasMore: false,
      providerId: "freehire",
      rawCount: 2,
    });

    // Filter by REMOTE only
    const resRemote = await engine.searchLiveJobs({
      providerIds: ["freehire"],
      workArrangements: ["REMOTE"],
    });
    expect(resRemote.jobs.length).toBe(1);
    expect(resRemote.jobs[0]?.companyName).toBe("Stripe");
  });

  it("does not leak secrets or API keys in response structures", async () => {
    const freehire = jobProviderRegistry.getProvider("freehire")!;
    vi.spyOn(freehire, "fetchJobs").mockResolvedValueOnce({
      jobs: [mockLiveJob1],
      hasMore: false,
      providerId: "freehire",
      rawCount: 1,
    });

    const response = await engine.searchLiveJobs({
      providerIds: ["freehire"],
    });
    const jsonString = JSON.stringify(response);

    expect(jsonString).not.toContain("fhk_");
    expect(jsonString).not.toContain("FREEHIRE_API_KEY");
    expect(jsonString).not.toContain("SECRET");
  });

  it("accurately handles pagination, unknown/estimated totals, and avoids double-offsetting", async () => {
    const freehire = jobProviderRegistry.getProvider("freehire")!;
    // Simulate FreeHire reporting 6,430,755 total in its entire DB
    vi.spyOn(freehire, "fetchJobs").mockResolvedValueOnce({
      jobs: [mockLiveJob1, mockLiveJob2],
      totalAvailable: 6430755,
      hasMore: true,
      providerId: "freehire",
      rawCount: 2,
    });

    const response = await engine.searchLiveJobs({
      page: 2,
      pageSize: 2,
      providerIds: ["freehire"],
    });

    // Does NOT fabricate 428,717 pages!
    expect(response.totalPages).toBeLessThanOrEqual(100);
    expect(response.hasMore).toBe(true);
    expect(response.isExactTotal).toBe(false);
    expect(response.estimatedTotal).toBe(6430755);
    expect(response.rawProviderCounts?.freehire).toBe(2);
    expect(response.uniqueCount).toBe(2);
    // Page 2 returns the items from the provider without being wiped out by double-offset
    expect(response.jobs.length).toBe(2);
  });

  it("applies advanced filters: exactPhrase, excludedKeywords, company, and tokenization", async () => {
    const freehire = jobProviderRegistry.getProvider("freehire")!;

    vi.spyOn(freehire, "fetchJobs").mockResolvedValue({
      jobs: [mockLiveJob1, mockLiveJob2],
      hasMore: false,
      providerId: "freehire",
      rawCount: 2,
    });

    // 1. Exact phrase filter
    const resExact = await engine.searchLiveJobs({
      exactPhrase: "Intensive Care",
      providerIds: ["freehire"],
    });
    expect(resExact.jobs.length).toBe(1);
    expect(resExact.jobs[0]?.companyName).toBe("Mayo Clinic");

    // 2. Excluded keywords filter
    const resExcluded = await engine.searchLiveJobs({
      excludedKeywords: ["fintech", "stripe"],
      providerIds: ["freehire"],
    });
    expect(resExcluded.jobs.length).toBe(1);
    expect(resExcluded.jobs[0]?.companyName).toBe("Mayo Clinic");

    // 3. Negative keyword tokenization from main query (e.g. "React -fintech")
    const resTokenized = await engine.searchLiveJobs({
      query: "React -fintech",
      providerIds: ["freehire"],
    });
    // mockLiveJob1 contains "fintech" in description, so it gets excluded!
    expect(resTokenized.jobs.length).toBe(0);

    // 4. Company filter
    const resCompany = await engine.searchLiveJobs({
      companyName: "Stripe",
      providerIds: ["freehire"],
    });
    expect(resCompany.jobs.length).toBe(1);
    expect(resCompany.jobs[0]?.companyName).toBe("Stripe");
  });

  it("applies required skills and seniority filters accurately", async () => {
    const freehire = jobProviderRegistry.getProvider("freehire")!;

    vi.spyOn(freehire, "fetchJobs").mockResolvedValue({
      jobs: [mockLiveJob1, mockLiveJob2],
      hasMore: false,
      providerId: "freehire",
      rawCount: 2,
    });

    // Required skills
    const resSkills = await engine.searchLiveJobs({
      requiredSkills: ["BLS", "ACLS"],
      providerIds: ["freehire"],
    });
    expect(resSkills.jobs.length).toBe(1);
    expect(resSkills.jobs[0]?.companyName).toBe("Mayo Clinic");

    // Seniority
    const resSeniority = await engine.searchLiveJobs({
      seniorityLevels: ["SENIOR"],
      providerIds: ["freehire"],
    });
    expect(resSeniority.jobs.length).toBe(1);
    expect(resSeniority.jobs[0]?.companyName).toBe("Stripe");
  });
});

