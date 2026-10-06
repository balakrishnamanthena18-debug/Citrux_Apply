import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { normalizeRequirementValue } from "@/lib/application-intelligence/requirements-contract";
import {
  MATCHING_CONTRACT_VERSION,
  buildCurrentMatchIdentityKey,
  categorizeMatch,
  countMatchCounters,
  evaluateCandidateJobMatch,
  toCandidateSafeMatchPayload,
  buildMatchSourceDataVersion,
  type MatchCandidateInput,
  type MatchJobInput,
  type MatchItemResult,
  type MatchStructuredRequirement,
} from "@/lib/job-matching";

const ORG = "11111111-1111-4111-8111-111111111111";
const CAND = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const JOB = "44444444-4444-4444-8444-444444444444";
const SNAP = "55555555-5555-4555-8555-555555555555";
const SET = "88888888-8888-4888-8888-888888888888";

function req(
  partial: Omit<MatchStructuredRequirement, "normalizedValue"> & {
    normalizedValue?: string;
  }
): MatchStructuredRequirement {
  return {
    ...partial,
    normalizedValue:
      partial.normalizedValue ?? normalizeRequirementValue(partial.rawValue),
  };
}

function candidate(
  overrides: Partial<MatchCandidateInput> = {}
): MatchCandidateInput {
  return {
    candidateId: CAND,
    organizationId: ORG,
    updatedAt: "2026-01-01T00:00:00.000Z",
    city: "Austin",
    state: "TX",
    country: "US",
    totalYearsExperience: 6,
    workAuthorization: "CITIZEN",
    requiresSponsorship: false,
    remotePreference: "FLEXIBLE",
    targetLocations: ["Austin, TX", "Remote - US"],
    targetRoles: ["Software Engineer"],
    desiredSalaryMin: 120000,
    desiredSalaryMax: 160000,
    salaryCurrency: "USD",
    skills: [
      { id: randomUUID(), name: "TypeScript" },
      { id: randomUUID(), name: "React" },
      { id: randomUUID(), name: "PostgreSQL" },
    ],
    experiences: [
      {
        id: randomUUID(),
        jobTitle: "Software Engineer",
        companyName: "Acme",
        startDate: "2020-01-01",
        endDate: null,
        isCurrent: true,
        technologies: ["TypeScript", "Node.js"],
      },
    ],
    educations: [
      {
        id: randomUUID(),
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        institution: "State University",
      },
    ],
    certifications: [
      {
        id: randomUUID(),
        name: "AWS Solutions Architect",
        issuingAuthority: "Amazon",
      },
    ],
    projects: [{ id: randomUUID(), technologies: ["GraphQL"] }],
    ...overrides,
  };
}

function job(overrides: Partial<MatchJobInput> = {}): MatchJobInput {
  return {
    jobId: JOB,
    organizationId: ORG,
    title: "Platform Engineer",
    companyName: "Gate13 Systems",
    location: "Remote - US",
    isRemote: true,
    employmentType: "FULL_TIME",
    salaryMin: 130000,
    salaryMax: 170000,
    salaryCurrency: "USD",
    status: "OPEN",
    visibility: "GLOBAL",
    ownerCandidateId: null,
    ...overrides,
  };
}

function requirementSet(
  requirements: MatchStructuredRequirement[],
  freshness: "CURRENT" | "STALE" = "CURRENT"
) {
  return {
    requirementSetId: SET,
    snapshotId: SNAP,
    contentHash: "abc123",
    schemaVersion: "job-requirements.v1",
    normalizationVersion: "normalize.v1",
    extractionVersion: "extract.v1",
    freshness,
    requirements,
  };
}

describe("Phase 5 — matching.v1 contract", () => {
  describe("identity", () => {
    it("defines one CURRENT feed identity per org+candidate+job", () => {
      expect(
        buildCurrentMatchIdentityKey({
          organizationId: ORG,
          candidateId: CAND,
          jobId: JOB,
        })
      ).toBe(`${ORG}:${CAND}:${JOB}`);
    });

    it("sourceDataVersion changes do not change feed identity key", () => {
      const id = buildCurrentMatchIdentityKey({
        organizationId: ORG,
        candidateId: CAND,
        jobId: JOB,
      });
      const v1 = buildMatchSourceDataVersion({
        candidate: candidate(),
        job: job(),
        requirementSet: null,
      });
      const v2 = buildMatchSourceDataVersion({
        candidate: candidate({ desiredSalaryMin: 200000 }),
        job: job(),
        requirementSet: null,
      });
      expect(v1).not.toBe(v2);
      expect(id).toBe(
        buildCurrentMatchIdentityKey({
          organizationId: ORG,
          candidateId: CAND,
          jobId: JOB,
        })
      );
    });
  });

  describe("category rules", () => {
    it("maps STRONG_MATCH for multiple required skill matches", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "React",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.matchingContractVersion).toBe(MATCHING_CONTRACT_VERSION);
      expect(result.category).toBe("STRONG_MATCH");
      expect(result.presentation.categoryLabel).toBe("Strong match");
    });

    it("does not LOW_MATCH solely for missing preferred skill", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "React",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "PREFERRED_SKILL",
            rawValue: "Rust",
            importance: "PREFERRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.category).toBe("STRONG_MATCH");
      expect(
        result.presentation.thingsToCheck.some((t) =>
          /Rust|preferred/i.test(t.message)
        )
      ).toBe(true);
    });

    it("marks LOW_MATCH for multiple required mismatches", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate({ skills: [], experiences: [], projects: [] }),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "Cobol",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "Fortran",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.category).toBe("LOW_MATCH");
    });

    it("marks NEEDS_REVIEW when required outcome is UNKNOWN", () => {
      const items: MatchItemResult[] = [
        {
          dimension: "EXPERIENCE",
          kind: "QUALIFICATION",
          importance: "REQUIRED",
          requirementId: "r1",
          label: "5+ years",
          outcome: "UNKNOWN",
          rationale: "missing years",
          evidence: null,
        },
      ];
      const counters = countMatchCounters(items);
      expect(
        categorizeMatch({
          counters,
          hasUsableRequirementSet: true,
          hasStructuredPreferenceSignal: true,
        })
      ).toBe("NEEDS_REVIEW");
    });

    it("marks NEEDS_REVIEW when no requirement set", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job(),
        requirementSet: null,
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.category).toBe("NEEDS_REVIEW");
    });

    it("marks POSSIBLE_MATCH when one required mismatches but others match", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "Cobol",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.category).toBe("POSSIBLE_MATCH");
    });
  });

  describe("UNKNOWN rules", () => {
    it("UNKNOWN is neither MATCH nor MISMATCH for missing salary on both sides handled as UNKNOWN", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate({
          desiredSalaryMin: null,
          desiredSalaryMax: null,
        }),
        job: job({ salaryMin: null, salaryMax: null }),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "React",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      const salary = result.items.find((i) => i.dimension === "SALARY");
      expect(salary?.outcome).toBe("UNKNOWN");
      expect(result.category).toBe("STRONG_MATCH");
    });
  });

  describe("preference vs qualification", () => {
    it("salary below target is preference MISMATCH, not qualification failure", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate({ desiredSalaryMin: 200000 }),
        job: job({ salaryMin: 100000, salaryMax: 110000 }),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "React",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.category).toBe("STRONG_MATCH");
      expect(result.counters.prefMismatch).toBeGreaterThanOrEqual(1);
      expect(
        result.presentation.preferences.some((p) =>
          /below your stated target/i.test(p.message)
        )
      ).toBe(true);
      expect(
        result.presentation.thingsToCheck.some((t) =>
          /not qualified/i.test(t.message)
        )
      ).toBe(false);
    });

    it("remote-only candidate vs onsite job is preference language", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate({ remotePreference: "REMOTE_ONLY" }),
        job: job({ isRemote: false, location: "Austin, TX" }),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "React",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.category).toBe("STRONG_MATCH");
      expect(
        result.presentation.preferences.some((p) =>
          /may not match your preference/i.test(p.message)
        )
      ).toBe(true);
    });

    it("EMPLOYMENT_TYPE preference is NOT_APPLICABLE in v1", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job(),
        requirementSet: null,
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      const emp = result.items.find((i) => i.dimension === "EMPLOYMENT_TYPE");
      expect(emp?.outcome).toBe("NOT_APPLICABLE");
    });
  });

  describe("security pure gates", () => {
    it("denies cross-tenant evaluation", () => {
      expect(() =>
        evaluateCandidateJobMatch({
          candidate: candidate(),
          job: job({ organizationId: OTHER }),
          requirementSet: null,
        })
      ).toThrow(/CROSS_TENANT_MATCH_DENIED/);
    });

    it("denies private job owned by another candidate", () => {
      expect(() =>
        evaluateCandidateJobMatch({
          candidate: candidate(),
          job: job({
            visibility: "CANDIDATE_PRIVATE",
            ownerCandidateId: OTHER,
          }),
          requirementSet: null,
        })
      ).toThrow(/PRIVATE_JOB_MATCH_DENIED/);
    });

    it("allows private job for owning candidate", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job({
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: CAND,
        }),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "React",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.category).toBe("STRONG_MATCH");
    });
  });

  describe("candidate-safe payload", () => {
    it("does not expose raw requirement dumps or internal rationale keys as requirement JSON", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "React",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      const safe = toCandidateSafeMatchPayload(result);
      const json = JSON.stringify(safe);
      expect(json).not.toContain("job-requirements.v1");
      expect(json).not.toContain("normalizationVersion");
      expect(json).not.toContain("AI_EXTRACTED");
      expect(safe.presentation.why.length).toBeGreaterThan(10);
      expect(safe.categoryLabel).toBe("Strong match");
      expect(safe.job).toEqual(result.jobSafe);
    });

    it("never invents a numerical percentage score", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "React",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      const json = JSON.stringify(toCandidateSafeMatchPayload(result));
      expect(json).not.toMatch(/\d+%/);
      expect(json).not.toContain("overallScore");
      expect(json).not.toContain("scoring.v1");
    });
  });

  describe("education / certifications / experience", () => {
    it("matches education and certification when present", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate(),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "EDUCATION",
            rawValue: "Computer Science",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "CERTIFICATION",
            rawValue: "AWS Solutions Architect",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(result.category).toBe("STRONG_MATCH");
    });

    it("matches years-of-experience requirements", () => {
      const result = evaluateCandidateJobMatch({
        candidate: candidate({ totalYearsExperience: 6 }),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: randomUUID(),
            category: "EXPERIENCE",
            rawValue: "5+ years professional software engineering",
            importance: "REQUIRED",
          }),
          req({
            id: randomUUID(),
            category: "REQUIRED_SKILL",
            rawValue: "TypeScript",
            importance: "REQUIRED",
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      });
      expect(["STRONG_MATCH", "GOOD_MATCH"]).toContain(result.category);
    });
  });

  describe("reproducibility", () => {
    it("is deterministic for identical inputs", () => {
      const input = {
        candidate: candidate(),
        job: job(),
        requirementSet: requirementSet([
          req({
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            category: "REQUIRED_SKILL" as const,
            rawValue: "TypeScript",
            importance: "REQUIRED" as const,
          }),
          req({
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            category: "REQUIRED_SKILL" as const,
            rawValue: "React",
            importance: "REQUIRED" as const,
          }),
        ]),
        asOf: new Date("2026-01-15T00:00:00.000Z"),
      };
      const a = evaluateCandidateJobMatch(input);
      const b = evaluateCandidateJobMatch(input);
      expect(a.category).toBe(b.category);
      expect(a.sourceDataVersion).toBe(b.sourceDataVersion);
      expect(a.presentation.why).toBe(b.presentation.why);
      expect(a.counters).toEqual(b.counters);
    });
  });
});
