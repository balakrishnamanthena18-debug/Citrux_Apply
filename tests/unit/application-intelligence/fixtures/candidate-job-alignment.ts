/**
 * Synthetic Gate 6 alignment fixtures — no real candidate data.
 */
import { randomUUID } from "crypto";
import type {
  AlignmentCandidateFactView,
  AlignmentJobContext,
} from "@/lib/application-intelligence/alignment";
import type { StructuredRequirement } from "@/lib/application-intelligence/requirements-contract";
import { normalizeRequirementValue } from "@/lib/application-intelligence/requirements-contract";

export const G6_ORG = "11111111-1111-4111-8111-111111111111";
export const G6_CAND = "22222222-2222-4222-8222-222222222222";
export const G6_JOB = "44444444-4444-4444-8444-444444444444";
export const G6_SNAP = "55555555-5555-4555-8555-555555555555";
export const G6_SET = "88888888-8888-4888-8888-888888888888";
export const G6_AS_OF = new Date("2026-01-15T00:00:00.000Z");

export function req(
  partial: Omit<StructuredRequirement, "id" | "normalizedValue" | "derivation" | "evidence" | "confidence"> & {
    id?: string;
    confidence?: number | null;
    excerpt?: string;
  }
): StructuredRequirement {
  return {
    id: partial.id ?? randomUUID(),
    category: partial.category,
    rawValue: partial.rawValue,
    normalizedValue: normalizeRequirementValue(partial.rawValue),
    importance: partial.importance,
    confidence: partial.confidence ?? 0.9,
    derivation: "AI_EXTRACTED",
    evidence: {
      snapshotId: G6_SNAP,
      excerpt: partial.excerpt ?? partial.rawValue,
    },
  };
}

export function baseCandidate(
  overrides: Partial<AlignmentCandidateFactView> = {}
): AlignmentCandidateFactView {
  return {
    candidateId: G6_CAND,
    organizationId: G6_ORG,
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
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "TypeScript" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "React.js" },
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Python" },
    ],
    experiences: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
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
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        institution: "State University",
      },
    ],
    certifications: [
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        name: "AWS Solutions Architect",
        issuingAuthority: "Amazon",
      },
    ],
    projects: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        technologies: ["GraphQL"],
      },
    ],
    attestations: {},
    ...overrides,
  };
}

export function baseJob(
  overrides: Partial<AlignmentJobContext> = {}
): AlignmentJobContext {
  return {
    jobId: G6_JOB,
    organizationId: G6_ORG,
    location: "Austin, TX",
    isRemote: true,
    employmentType: "FULL_TIME",
    salaryMin: 130000,
    salaryMax: 170000,
    salaryCurrency: "USD",
    visibility: "GLOBAL",
    ownerCandidateId: null,
    ...overrides,
  };
}

export const ALIGNMENT_REQUIREMENT_SETS = {
  perfectMatch: [
    req({
      category: "REQUIRED_SKILL",
      rawValue: "TypeScript",
      importance: "REQUIRED",
    }),
    req({
      category: "REQUIRED_SKILL",
      rawValue: "React",
      importance: "REQUIRED",
    }),
    req({
      category: "EXPERIENCE",
      rawValue: "5 years of software experience",
      importance: "REQUIRED",
      excerpt: "5 years of software experience",
    }),
    req({
      category: "EDUCATION",
      rawValue: "Bachelor's degree",
      importance: "REQUIRED",
    }),
    req({
      category: "CERTIFICATION",
      rawValue: "AWS Solutions Architect",
      importance: "PREFERRED",
    }),
    req({
      category: "LOCATION",
      rawValue: "Austin, TX",
      importance: "REQUIRED",
    }),
    req({
      category: "REMOTE_POLICY",
      rawValue: "remote",
      importance: "REQUIRED",
    }),
    req({
      category: "WORK_AUTHORIZATION",
      rawValue: "Must be authorized to work in the United States",
      importance: "REQUIRED",
    }),
    req({
      category: "SALARY",
      rawValue: "130000-170000 USD",
      importance: "UNKNOWN",
    }),
    req({
      category: "EMPLOYMENT_TYPE",
      rawValue: "FULL_TIME",
      importance: "REQUIRED",
    }),
  ],
  mixedRequiredPreferred: [
    req({
      category: "REQUIRED_SKILL",
      rawValue: "Python",
      importance: "REQUIRED",
    }),
    req({
      category: "PREFERRED_SKILL",
      rawValue: "AWS",
      importance: "PREFERRED",
    }),
    req({
      category: "EXPERIENCE",
      rawValue: "5 years of Python experience",
      importance: "REQUIRED",
      excerpt: "5 years of Python experience",
    }),
  ],
  allUnknown: [
    req({
      category: "REQUIRED_SKILL",
      rawValue: "COBOL",
      importance: "REQUIRED",
    }),
  ],
  experiencePartial: [
    req({
      category: "EXPERIENCE",
      rawValue: "10 years of Python experience",
      importance: "REQUIRED",
      excerpt: "10 years of Python experience",
    }),
  ],
  duplicateSkills: [
    req({
      category: "REQUIRED_SKILL",
      rawValue: "React.js",
      importance: "REQUIRED",
    }),
    req({
      category: "REQUIRED_SKILL",
      rawValue: "ReactJS",
      importance: "REQUIRED",
    }),
  ],
};
