import { describe, expect, it, vi } from "vitest";
import {
  canonicalizeAtsUrl,
  detectDuplicates,
  escapeCsvCell,
  evaluateAiReviewOffline,
  evaluateFreshness,
  exportAllFindingsToCsv,
  exportDuplicatesToCsv,
  exportGeographyToCsv,
  exportReportToJson,
  normalizeRecord,
  runJobInventoryAudit,
  validateGeography,
  type FreeHireRawJobRecord,
  type NormalizedJobRecord,
} from "@/lib/data-quality";

describe("OOS Data Quality & Intelligence — Unit Tests (Phase 1)", () => {
  describe("1. ATS Requisition Identifiers & Tracking Parameter Handling", () => {
    it("preserves Taleo requisition query parameter 'job' while stripping tracking params", () => {
      const raw =
        "https://mtstatejobs.taleo.net/careersection/exm/jobdetail.ftl?job=26142658&lang=en&utm_source=freehire.me&utm_medium=feed";
      const result = canonicalizeAtsUrl(raw);

      expect(result.provider).toBe("taleo");
      expect(result.requisitionId).toBe("26142658");
      expect(result.canonicalUrl).toBe(
        "https://mtstatejobs.taleo.net/careersection/exm/jobdetail.ftl?job=26142658"
      );
      expect(result.trackingParametersRemoved).toContain("lang");
      expect(result.trackingParametersRemoved).toContain("utm_source");
      expect(result.trackingParametersRemoved).toContain("utm_medium");
      expect(result.canonicalUrl).not.toContain("utm_source");
      expect(result.canonicalUrl).not.toContain("lang=en");
    });

    it("preserves UKG Pro opportunityId parameter while stripping tracking params", () => {
      const raw =
        "https://recruiting.ultipro.com/ejd1000ejd/JobBoard/7b7398f9-75c8-476c-a554-911bb210290e/OpportunityDetail?opportunityId=75313c70-6874-4f64-8b78-6537701c3641&utm_source=freehire.me&ref=partner";
      const result = canonicalizeAtsUrl(raw);

      expect(result.provider).toBe("ukg_pro");
      expect(result.requisitionId).toBe("75313c70-6874-4f64-8b78-6537701c3641");
      expect(result.canonicalUrl).toContain(
        "opportunityId=75313c70-6874-4f64-8b78-6537701c3641"
      );
      expect(result.canonicalUrl).not.toContain("utm_source");
      expect(result.canonicalUrl).not.toContain("ref=partner");
    });

    it("preserves UKG Ready ShowJob parameter", () => {
      const raw =
        "https://secure4.saashr.com/ta/6158223.careers?ShowJob=12345678&utm_source=freehire.me";
      const result = canonicalizeAtsUrl(raw);

      expect(result.provider).toBe("ukg_ready");
      expect(result.requisitionId).toBe("12345678");
      expect(result.canonicalUrl).toContain("ShowJob=12345678");
    });

    it("preserves Greenhouse gh_jid parameter and path IDs", () => {
      const rawQuery =
        "https://boards.greenhouse.io/embed/job_app?for=company&gh_jid=998877&utm_campaign=winter";
      const resultQuery = canonicalizeAtsUrl(rawQuery);
      expect(resultQuery.provider).toBe("greenhouse");
      expect(resultQuery.requisitionId).toBe("998877");
      expect(resultQuery.canonicalUrl).toContain("gh_jid=998877");
      expect(resultQuery.canonicalUrl).not.toContain("utm_campaign");

      const rawPath = "https://boards.greenhouse.io/company/jobs/554433/";
      const resultPath = canonicalizeAtsUrl(rawPath);
      expect(resultPath.requisitionId).toBe("554433");
      expect(resultPath.canonicalUrl).toBe("https://boards.greenhouse.io/company/jobs/554433");
    });

    it("preserves Lever posting UUIDs", () => {
      const raw =
        "https://jobs.lever.co/givinghhc/46b75d9d-79a9-487d-a88a-44d4c5568e83?utm_source=freehire.me";
      const result = canonicalizeAtsUrl(raw);
      expect(result.provider).toBe("lever");
      expect(result.requisitionId).toBe("46b75d9d-79a9-487d-a88a-44d4c5568e83");
      expect(result.canonicalUrl).toBe(
        "https://jobs.lever.co/givinghhc/46b75d9d-79a9-487d-a88a-44d4c5568e83"
      );
    });

    it("preserves SmartRecruiters numeric job requisition IDs", () => {
      const raw =
        "https://jobs.smartrecruiters.com/MunsonHealthcare1/3743990016270416-registered-nurse?src=aggregator";
      const result = canonicalizeAtsUrl(raw);
      expect(result.provider).toBe("smartrecruiters");
      expect(result.requisitionId).toBe("3743990016270416");
      expect(result.canonicalUrl).toBe(
        "https://jobs.smartrecruiters.com/MunsonHealthcare1/3743990016270416-registered-nurse"
      );
    });

    it("preserves Workday requisition IDs in path", () => {
      const raw =
        "https://company.myworkdayjobs.com/en-US/Careers/job/Boston-MA/Software-Engineer_R12345?utm_medium=cpc";
      const result = canonicalizeAtsUrl(raw);
      expect(result.provider).toBe("workday");
      expect(result.requisitionId).toBe("Software-Engineer_R12345");
      expect(result.canonicalUrl).not.toContain("utm_medium");
    });

    it("preserves Pinpoint posting UUIDs", () => {
      const raw =
        "https://company.pinpointhq.com/postings/75313c70-6874-4f64-8b78-6537701c3641?source=freehire";
      const result = canonicalizeAtsUrl(raw);
      expect(result.provider).toBe("pinpoint");
      expect(result.requisitionId).toBe("75313c70-6874-4f64-8b78-6537701c3641");
    });

    it("preserves Breezy HR posting identifiers", () => {
      const raw =
        "https://o-keefe-media-group.breezy.hr/p/29cfc7184bbd-it-manager?utm_source=freehire.me";
      const result = canonicalizeAtsUrl(raw);
      expect(result.provider).toBe("breezy");
      expect(result.requisitionId).toBe("29cfc7184bbd");
    });
  });

  describe("2. Duplicate Candidate Rules & No False Merging", () => {
    it("identifies high-confidence duplicate candidates on exact ATS canonical URL", () => {
      const raw1: FreeHireRawJobRecord = {
        public_slug: "rn-job-1",
        url: "https://tenet.taleo.net/careersection/10000/jobdetail.ftl?job=2606001613&lang=en&utm_source=freehire.me",
        title: "Registered Nurse",
        company: "Tenet Healthcare",
        location: "Dallas, TX",
      };
      const raw2: FreeHireRawJobRecord = {
        public_slug: "rn-job-2",
        url: "https://tenet.taleo.net/careersection/10000/jobdetail.ftl?job=2606001613&utm_source=other",
        title: "Registered Nurse",
        company: "Tenet Healthcare",
        location: "Dallas, TX",
      };

      const norm1 = normalizeRecord(raw1, 0);
      const norm2 = normalizeRecord(raw2, 1);

      const duplicates = detectDuplicates([norm1, norm2]);

      const dup1 = duplicates.get(norm1.recordId)!;
      const dup2 = duplicates.get(norm2.recordId)!;

      expect(dup1.isDuplicateCandidate).toBe(true);
      expect(dup2.isDuplicateCandidate).toBe(true);
      expect(dup1.duplicateGroupId).toBe(dup2.duplicateGroupId);
      expect(dup1.reasonCode).toBe("EXACT_ATS_CANONICAL_URL");
      expect(dup1.confidence).toBe("high");
      expect(dup1.candidateCountInGroup).toBe(2);
      expect(dup1.candidateIdsInGroup).toContain(norm1.recordId);
      expect(dup1.candidateIdsInGroup).toContain(norm2.recordId);
    });

    it("DOES NOT falsely merge distinct vacancies with same title, company, and location (e.g. clinical nursing units)", () => {
      // Real case from FreeHire dataset: Halton Healthcare hiring Registered Nurses across different units
      const rawOncology: FreeHireRawJobRecord = {
        public_slug: "hh-rn-oncology",
        url: "https://jobs.smartrecruiters.com/HaltonHealthcare1/3743990016270456-registered-nurse?utm_source=freehire.me",
        title: "Registered Nurse",
        company: "Halton Healthcare",
        location: "Oakville, Ontario, Canada",
      };
      const rawCardiac: FreeHireRawJobRecord = {
        public_slug: "hh-rn-cardiac",
        url: "https://jobs.smartrecruiters.com/HaltonHealthcare1/3743990016270488-registered-nurse?utm_source=freehire.me",
        title: "Registered Nurse",
        company: "Halton Healthcare",
        location: "Oakville, Ontario, Canada",
      };

      const norm1 = normalizeRecord(rawOncology, 0);
      const norm2 = normalizeRecord(rawCardiac, 1);

      const duplicates = detectDuplicates([norm1, norm2]);

      const finding1 = duplicates.get(norm1.recordId)!;
      const finding2 = duplicates.get(norm2.recordId)!;

      // MUST NOT be marked as duplicate candidates!
      expect(finding1.isDuplicateCandidate).toBe(false);
      expect(finding2.isDuplicateCandidate).toBe(false);
      expect(finding1.confidence).toBe("distinct");
      expect(finding2.confidence).toBe("distinct");
      expect(finding1.reasonCode).toBe("SIMILAR_ROLE_DISTINCT_REQUISITION");
      expect(finding1.evidence).toContain("distinct ATS requisition identity");
    });

    it("preserves completely unique postings with UNIQUE_RECORD reason code", () => {
      const raw: FreeHireRawJobRecord = {
        public_slug: "unique-job",
        url: "https://company.taleo.net/jobdetail.ftl?job=9999",
        title: "Solo Lead Engineer",
        company: "Unique Org",
        location: "Denver, CO",
      };
      const norm = normalizeRecord(raw, 0);
      const duplicates = detectDuplicates([norm]);
      const finding = duplicates.get(norm.recordId)!;

      expect(finding.isDuplicateCandidate).toBe(false);
      expect(finding.duplicateGroupId).toBeNull();
      expect(finding.reasonCode).toBe("UNIQUE_RECORD");
      expect(finding.confidence).toBe("distinct");
    });
  });

  describe("3. Geographic Validation & Misleading Place Names", () => {
    it("distinguishes Indianapolis, IN as valid US and flags scraper ISO 'in' (India) as metadata discrepancy", () => {
      const record: NormalizedJobRecord = {
        recordId: "rec-in-1",
        publicSlug: "job-indy",
        source: "taleo",
        externalId: "ext-1",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "generic",
          requisitionId: null,
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: false,
        },
        rawTitle: "Accountant",
        normalizedTitle: "accountant",
        rawCompany: "Acme",
        normalizedCompany: "acme",
        rawLocation: "Indianapolis, IN",
        normalizedLocation: "indianapolis, in",
        descriptionSnippet: "Office in downtown Indianapolis.",
        postedAt: null,
        createdAt: null,
        updatedAt: null,
        lastSeenAt: null,
        rawCountries: ["in", "us"], // Scraper error: tagged India because of 'IN'
        rawRealityAgeDays: 0,
      };

      const geo = validateGeography(record);

      expect(geo.status).toBe("metadata_discrepancy");
      expect(geo.detectedCountry).toBe("USA");
      expect(geo.isDiscrepancy).toBe(true);
      expect(geo.notes).toContain("Indianapolis, Indiana correctly identified as US");
      expect(geo.notes).toContain("erroneously tagged ISO 'in'");
    });

    it("distinguishes Minneapolis, MN as valid US and flags scraper ISO 'mn' (Mongolia) as metadata discrepancy", () => {
      const record: NormalizedJobRecord = {
        recordId: "rec-mn-1",
        publicSlug: "job-mpls",
        source: "taleo",
        externalId: "ext-2",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "generic",
          requisitionId: null,
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: false,
        },
        rawTitle: "Nurse Practitioner",
        normalizedTitle: "nurse practitioner",
        rawCompany: "HCMC",
        normalizedCompany: "hcmc",
        rawLocation: "Minneapolis, MN",
        normalizedLocation: "minneapolis, mn",
        descriptionSnippet: "Hospital in Minneapolis.",
        postedAt: null,
        createdAt: null,
        updatedAt: null,
        lastSeenAt: null,
        rawCountries: ["mn", "us"], // Scraper error: tagged Mongolia because of 'MN'
        rawRealityAgeDays: 0,
      };

      const geo = validateGeography(record);

      expect(geo.status).toBe("metadata_discrepancy");
      expect(geo.detectedCountry).toBe("USA");
      expect(geo.notes).toContain("Minneapolis, Minnesota correctly identified as US");
    });

    it("distinguishes Vancouver, Washington from Vancouver, British Columbia (Canada)", () => {
      const waRecord: NormalizedJobRecord = {
        recordId: "rec-van-wa",
        publicSlug: "job-van-wa",
        source: "generic",
        externalId: "ext-wa",
        rawUrl: "https://example.com/job1",
        canonicalUrl: "https://example.com/job1",
        ats: {
          provider: "generic",
          requisitionId: null,
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job1",
          isAtsUrl: false,
        },
        rawTitle: "Civil Engineer",
        normalizedTitle: "civil engineer",
        rawCompany: "State DOT",
        normalizedCompany: "state dot",
        rawLocation: "Vancouver, WA",
        normalizedLocation: "vancouver, wa",
        descriptionSnippet: "",
        postedAt: null,
        createdAt: null,
        updatedAt: null,
        lastSeenAt: null,
        rawCountries: ["us"],
        rawRealityAgeDays: 0,
      };

      const bcRecord: NormalizedJobRecord = {
        ...waRecord,
        recordId: "rec-van-bc",
        rawLocation: "Vancouver, BC, Canada",
        normalizedLocation: "vancouver, bc, canada",
      };

      const geoWa = validateGeography(waRecord);
      expect(geoWa.status).toBe("valid_us");
      expect(geoWa.detectedCountry).toBe("USA");

      const geoBc = validateGeography(bcRecord);
      expect(geoBc.status).toBe("explicit_foreign");
      expect(geoBc.detectedCountry).toBe("Canada");
    });

    it("flags explicit Canadian locations like MicroHabitat | Canada as explicit_foreign", () => {
      const record: NormalizedJobRecord = {
        recordId: "rec-can-1",
        publicSlug: "job-microhabitat",
        source: "generic",
        externalId: "ext-can",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "generic",
          requisitionId: null,
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: false,
        },
        rawTitle: "Urban Farmer - MicroHabitat | Canada",
        normalizedTitle: "urban farmer - microhabitat | canada",
        rawCompany: "MicroHabitat",
        normalizedCompany: "microhabitat",
        rawLocation: "Montreal, Quebec, Canada",
        normalizedLocation: "montreal, quebec, canada",
        descriptionSnippet: "Position located in Montreal, Canada.",
        postedAt: null,
        createdAt: null,
        updatedAt: null,
        lastSeenAt: null,
        rawCountries: ["ca"],
        rawRealityAgeDays: 0,
      };

      const geo = validateGeography(record);
      expect(geo.status).toBe("explicit_foreign");
      expect(geo.detectedCountry).toBe("Canada");
    });

    it("reports missing location separately without crashing", () => {
      const record: NormalizedJobRecord = {
        recordId: "rec-missing-loc",
        publicSlug: "job-no-loc",
        source: "generic",
        externalId: "ext-missing",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "generic",
          requisitionId: null,
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: false,
        },
        rawTitle: "Remote Specialist",
        normalizedTitle: "remote specialist",
        rawCompany: "Cloud Org",
        normalizedCompany: "cloud org",
        rawLocation: null,
        normalizedLocation: "",
        descriptionSnippet: "",
        postedAt: null,
        createdAt: null,
        updatedAt: null,
        lastSeenAt: null,
        rawCountries: ["us"],
        rawRealityAgeDays: 0,
      };

      const geo = validateGeography(record);
      expect(geo.status).toBe("missing_location");
      expect(geo.detectedCountry).toBeNull();
      expect(geo.notes).toContain("missing, null, or empty");
    });

    it("does not automatically reject a record based on a country-code mismatch alone", () => {
      const record: NormalizedJobRecord = {
        recordId: "rec-state-code",
        publicSlug: "job-pa",
        source: "generic",
        externalId: "ext-pa",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "generic",
          requisitionId: null,
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: false,
        },
        rawTitle: "Nurse",
        normalizedTitle: "nurse",
        rawCompany: "Temple Health",
        normalizedCompany: "temple health",
        rawLocation: "Philadelphia, PA",
        normalizedLocation: "philadelphia, pa",
        descriptionSnippet: "Philadelphia hospital.",
        postedAt: null,
        createdAt: null,
        updatedAt: null,
        lastSeenAt: null,
        rawCountries: ["pa", "us"], // Scraper tagged Panama 'pa'
        rawRealityAgeDays: 0,
      };

      const geo = validateGeography(record);
      // Must NOT be rejected as foreign; identified as valid US with scraper discrepancy
      expect(geo.status).toBe("metadata_discrepancy");
      expect(geo.detectedCountry).toBe("USA");
      expect(geo.notes).toContain("US state 'PA' was misconstrued by upstream scraper");
    });
  });

  describe("4. Freshness Signals, Ingestion Timestamps & Closure Checks", () => {
    it("identifies identical posted_at, created_at, updated_at as ingestion batch evidence", () => {
      const batchTime = "2026-10-20T17:57:08Z";
      const record: NormalizedJobRecord = {
        recordId: "rec-fresh-1",
        publicSlug: "job-batch",
        source: "taleo",
        externalId: "ext-fresh",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "taleo",
          requisitionId: "123",
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: true,
        },
        rawTitle: "Software Engineer",
        normalizedTitle: "software engineer",
        rawCompany: "Tech Corp",
        normalizedCompany: "tech corp",
        rawLocation: "Austin, TX",
        normalizedLocation: "austin, tx",
        descriptionSnippet: "Join our backend team.",
        postedAt: batchTime,
        createdAt: batchTime,
        updatedAt: batchTime,
        lastSeenAt: batchTime,
        rawCountries: ["us"],
        rawRealityAgeDays: 0,
      };

      const freshness = evaluateFreshness(record);

      expect(freshness.suspectedIngestionBatch).toBe(true);
      expect(freshness.status).toBe("unknown");
      expect(freshness.notes).toContain("identical batch ingestion timestamps");
    });

    it("detects explicit closure phrases in page text or description snippet", () => {
      const record: NormalizedJobRecord = {
        recordId: "rec-closed-1",
        publicSlug: "job-closed",
        source: "taleo",
        externalId: "ext-closed",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "taleo",
          requisitionId: "123",
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: true,
        },
        rawTitle: "Software Engineer",
        normalizedTitle: "software engineer",
        rawCompany: "Tech Corp",
        normalizedCompany: "tech corp",
        rawLocation: "Austin, TX",
        normalizedLocation: "austin, tx",
        descriptionSnippet: "Thank you for your interest. This position has been filled.",
        postedAt: "2026-10-20T17:57:08Z",
        createdAt: "2026-10-20T17:57:08Z",
        updatedAt: "2026-10-20T17:57:08Z",
        lastSeenAt: "2026-10-20T17:57:08Z",
        rawCountries: ["us"],
        rawRealityAgeDays: 0,
      };

      const freshness = evaluateFreshness(record);

      expect(freshness.status).toBe("closure_detected");
      expect(freshness.closureSignals).toContain("position has been filled");
      expect(freshness.notes).toContain("Explicit closure language detected");
    });

    it("verifies HTTP 200 is NOT treated as proof of active vacancy when closure language is present", () => {
      const record: NormalizedJobRecord = {
        recordId: "rec-http200-closed",
        publicSlug: "job-http200",
        source: "taleo",
        externalId: "ext-http200",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "taleo",
          requisitionId: "123",
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: true,
        },
        rawTitle: "Analyst",
        normalizedTitle: "analyst",
        rawCompany: "Corp",
        normalizedCompany: "corp",
        rawLocation: "Chicago, IL",
        normalizedLocation: "chicago, il",
        descriptionSnippet: "Standard job description.",
        postedAt: "2026-10-20T17:57:08Z",
        createdAt: "2026-10-20T17:57:08Z",
        updatedAt: "2026-10-20T17:57:08Z",
        lastSeenAt: "2026-10-20T17:57:08Z",
        rawCountries: ["us"],
        rawRealityAgeDays: 0,
      };

      // Server returned HTTP 200, but page body contains "job is no longer available"
      const liveHtml = "<html><body><h1>Notice</h1><p>This job is no longer available.</p></body></html>";
      const freshness = evaluateFreshness(record, liveHtml, 200);

      expect(freshness.status).toBe("closure_detected");
      expect(freshness.closureSignals).toContain("job is no longer available");
      expect(freshness.notes).toContain("HTTP status 200 does not negate closure");
    });

    it("marks inaccessible or timed-out HTTP responses as unknown (never assumed closed)", () => {
      const record: NormalizedJobRecord = {
        recordId: "rec-500",
        publicSlug: "job-500",
        source: "taleo",
        externalId: "ext-500",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "taleo",
          requisitionId: "123",
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: true,
        },
        rawTitle: "Analyst",
        normalizedTitle: "analyst",
        rawCompany: "Corp",
        normalizedCompany: "corp",
        rawLocation: "Chicago, IL",
        normalizedLocation: "chicago, il",
        descriptionSnippet: "",
        postedAt: null,
        createdAt: null,
        updatedAt: null,
        lastSeenAt: null,
        rawCountries: ["us"],
        rawRealityAgeDays: 0,
      };

      const freshness = evaluateFreshness(record, null, 503);
      expect(freshness.status).toBe("unknown");
      expect(freshness.notes).toContain("classified as unknown (not assumed closed without explicit signal)");
    });
  });

  describe("5. Offline AI Policy Verification", () => {
    it("performs review evaluation strictly offline with zero network calls and no API key required", () => {
      // Mock global fetch to spy if any network call is attempted
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const record: NormalizedJobRecord = {
        recordId: "rec-ai-offline",
        publicSlug: "job-offline",
        source: "taleo",
        externalId: "ext-ai",
        rawUrl: "https://example.com/job",
        canonicalUrl: "https://example.com/job",
        ats: {
          provider: "generic",
          requisitionId: null,
          trackingParametersRemoved: [],
          canonicalUrl: "https://example.com/job",
          isAtsUrl: false,
        },
        rawTitle: "Manager",
        normalizedTitle: "manager",
        rawCompany: "Biz",
        normalizedCompany: "biz",
        rawLocation: "Boston, MA",
        normalizedLocation: "boston, ma",
        descriptionSnippet: "",
        postedAt: null,
        createdAt: null,
        updatedAt: null,
        lastSeenAt: null,
        rawCountries: ["us"],
        rawRealityAgeDays: 0,
      };

      const dupFinding = {
        duplicateGroupId: "cluster-1",
        isDuplicateCandidate: false,
        confidence: "distinct" as const,
        reasonCode: "SIMILAR_ROLE_DISTINCT_REQUISITION" as const,
        evidence: "Distinct requisition",
        candidateIdsInGroup: [record.recordId],
        candidateCountInGroup: 1,
      };

      const geoFinding = {
        status: "valid_us" as const,
        detectedCountry: "USA",
        rawLocation: "Boston, MA",
        rawCountryCodes: ["us"],
        isDiscrepancy: false,
        notes: "Valid US",
      };

      const aiReview = evaluateAiReviewOffline(record, dupFinding, geoFinding);

      // Verify zero network invocations
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(aiReview.used).toBe(false);
      expect(aiReview.status).toBe("needs_review");
      expect(aiReview.reason).toContain("Offline policy");

      fetchSpy.mockRestore();
    });
  });

  describe("6. Master Selection Invariant & DUPLICATE_MASTER_POLICY=none", () => {
    it("never designates a master record, primary flag, or deletion candidate in duplicate groups", () => {
      const records: FreeHireRawJobRecord[] = [
        {
          public_slug: "job-dup-a",
          url: "https://scripps.taleo.net/careersection/2m/jobdetail.ftl?job=262005937&lang=en",
          title: "Medical Assistant",
          company: "Scripps Health",
          location: "San Diego, CA",
        },
        {
          public_slug: "job-dup-b",
          url: "https://scripps.taleo.net/careersection/2m/jobdetail.ftl?job=262005937&utm_source=freehire.me",
          title: "Medical Assistant",
          company: "Scripps Health",
          location: "San Diego, CA",
        },
      ];

      const report = runJobInventoryAudit(records);

      expect(report.summary.duplicatePolicy).toBe("none");
      expect(report.summary.duplicates.totalDuplicateCandidateRecords).toBe(2);
      expect(report.summary.duplicates.exactAtsUrlGroups).toBe(1);

      for (const finding of report.findings) {
        // Assert no master properties exist
        expect(finding).not.toHaveProperty("isMaster");
        expect(finding).not.toHaveProperty("isPrimary");
        expect(finding).not.toHaveProperty("deleteCandidate");
        expect(finding.duplicate.candidateCountInGroup).toBe(2);
        expect(finding.duplicate.candidateIdsInGroup).toHaveLength(2);
      }
    });
  });

  describe("7. JSON and CSV Exporting & Empty Input Handling", () => {
    it("handles completely empty input gracefully across runner and exporters", () => {
      const report = runJobInventoryAudit([]);

      expect(report.summary.totalRecordsAudited).toBe(0);
      expect(report.findings).toHaveLength(0);

      const jsonStr = exportReportToJson(report);
      expect(jsonStr).toContain('"totalRecordsAudited": 0');

      const dupCsv = exportDuplicatesToCsv(report.findings);
      expect(dupCsv).toContain("duplicate_group_id");

      const geoCsv = exportGeographyToCsv(report.findings);
      expect(geoCsv).toContain("record_id");

      const allCsv = exportAllFindingsToCsv(report.findings);
      expect(allCsv).toContain("record_id");
    });

    it("escapes CSV cells containing commas, quotes, and newlines safely (RFC 4180)", () => {
      expect(escapeCsvCell('Hello "World"')).toBe('"Hello ""World"""');
      expect(escapeCsvCell("Austin, TX")).toBe('"Austin, TX"');
      expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
      expect(escapeCsvCell(12345)).toBe("12345");
      expect(escapeCsvCell(null)).toBe("");
    });
  });
});
