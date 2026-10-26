import { describe, it, expect } from "vitest";
import {
  computeContentFingerprint,
  evaluateDeduplication,
} from "@/lib/job-discovery/deduplication";
import type { NormalizedDiscoveredJob } from "@/lib/job-discovery/types";

describe("Job Discovery Deduplication", () => {
  const baseJob: NormalizedDiscoveredJob = {
    providerId: "freehire",
    externalId: "ext-101",
    title: "Senior Full Stack Engineer",
    normalizedTitle: "Senior Full Stack Engineer",
    companyName: "Acme Corp",
    normalizedCompany: "Acme",
    jobDescription: "Build modern web applications with React, TypeScript, and Node.js.",
    requiredSkills: ["React", "TypeScript", "Node.js"],
    preferredSkills: [],
    industry: "technology",
    employmentType: "FULL_TIME",
    seniorityLevel: "SENIOR",
    workArrangement: "REMOTE",
    externalUrl: "https://acme.taleo.net/careersection/jobdetail.ftl?job=999888&utm_source=freehire.me",
    canonicalUrl: "https://acme.taleo.net/careersection/jobdetail.ftl?job=999888",
    sourceAttribution: "Taleo via FreeHire",
    verificationStatus: "SOURCE_CONFIRMED",
    availabilityStatus: "OPEN",
    contentFingerprint: "fingerprint-101",
    qualityScore: 95,
  };

  it("generates deterministic SHA-256 content fingerprints", () => {
    const fp1 = computeContentFingerprint({
      companyName: "Acme Corp",
      title: "Senior Full Stack Engineer",
      canonicalUrl: "https://acme.taleo.net/job=999888",
    });

    const fp2 = computeContentFingerprint({
      companyName: "acme corp",
      title: "senior full stack engineer",
      canonicalUrl: "https://acme.taleo.net/job=999888",
    });

    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(32);
  });

  it("detects exact Provider + External ID collisions", () => {
    const existingIndex = {
      byCanonicalUrl: new Map<string, string>(),
      byFingerprint: new Map<string, string>(),
      byProviderExtId: new Set(["freehire::ext-101"]),
    };

    const res = evaluateDeduplication(baseJob, existingIndex);
    expect(res.isDuplicate).toBe(true);
    expect(res.duplicateReason).toBe("EXACT_PROVIDER_EXTERNAL_ID_COLLISION");
    expect(res.duplicateGroupId).toBeDefined();
  });

  it("detects cross-provider duplicates matching on exact ATS canonical URL", () => {
    const syndicatedJob: NormalizedDiscoveredJob = {
      ...baseJob,
      providerId: "arbeitnow",
      externalId: "arbeitnow-custom-slug",
      externalUrl: "https://acme.taleo.net/careersection/jobdetail.ftl?job=999888&ref=arbeitnow",
      canonicalUrl: "https://acme.taleo.net/careersection/jobdetail.ftl?job=999888",
    };

    const existingIndex = {
      byCanonicalUrl: new Map([
        ["https://acme.taleo.net/careersection/jobdetail.ftl?job=999888", "group-acme-999888"],
      ]),
      byFingerprint: new Map<string, string>(),
      byProviderExtId: new Set<string>(),
    };

    const res = evaluateDeduplication(syndicatedJob, existingIndex);
    expect(res.isDuplicate).toBe(true);
    expect(res.duplicateGroupId).toBe("group-acme-999888");
    expect(res.duplicateReason).toBe("EXACT_ATS_CANONICAL_URL_MATCH");
  });

  it("detects identical role + company content fingerprints", () => {
    const fp = computeContentFingerprint({
      companyName: baseJob.normalizedCompany,
      title: baseJob.normalizedTitle,
      canonicalUrl: baseJob.canonicalUrl,
    });

    const existingIndex = {
      byCanonicalUrl: new Map<string, string>(),
      byFingerprint: new Map([[fp, "group-fp-match"]]),
      byProviderExtId: new Set<string>(),
    };

    const res = evaluateDeduplication(baseJob, existingIndex);
    expect(res.isDuplicate).toBe(true);
    expect(res.duplicateGroupId).toBe("group-fp-match");
    expect(res.duplicateReason).toBe("IDENTICAL_ROLE_COMPANY_FINGERPRINT");
  });

  it("preserves distinct vacancies with different canonical URLs as unique", () => {
    const distinctJob: NormalizedDiscoveredJob = {
      ...baseJob,
      externalId: "ext-102",
      title: "Senior Full Stack Engineer (Observation Unit)",
      externalUrl: "https://acme.taleo.net/careersection/jobdetail.ftl?job=777666",
      canonicalUrl: "https://acme.taleo.net/careersection/jobdetail.ftl?job=777666",
    };

    const existingIndex = {
      byCanonicalUrl: new Map([
        ["https://acme.taleo.net/careersection/jobdetail.ftl?job=999888", "group-acme-999888"],
      ]),
      byFingerprint: new Map<string, string>(),
      byProviderExtId: new Set(["freehire::ext-101"]),
    };

    const res = evaluateDeduplication(distinctJob, existingIndex);
    expect(res.isDuplicate).toBe(false);
    expect(res.duplicateGroupId).toBeNull();
  });
});
