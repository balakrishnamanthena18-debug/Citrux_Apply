/**
 * Phase 5C.6 — Job Match Invalidation Wiring.
 * Proves production mutation paths call set-based invalidation (not helper-only).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

vi.mock("@/lib/audit", () => ({
  logSystemAuditEvent: vi.fn().mockResolvedValue(undefined),
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  buildMatchSourceDataVersion,
  MATCHING_CONTRACT_VERSION,
} from "@/lib/job-matching";
import {
  invalidateCandidateJobMatchesForCandidate,
  invalidateCandidateJobMatchesForJob,
  JOB_MATCH_INVALIDATION_BATCH_SIZE,
} from "@/lib/job-matching/invalidation";
import type { MatchCandidateInput, MatchJobInput } from "@/lib/job-matching/types";

const ROOT = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const ORG = "11111111-1111-4111-8111-111111111111";
const CAND = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";
const MATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MATCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

function candidate(
  overrides: Partial<MatchCandidateInput> = {}
): MatchCandidateInput {
  return {
    candidateId: CAND,
    organizationId: ORG,
    updatedAt: "2026-10-01T00:00:00.000Z",
    city: "Austin",
    state: "TX",
    country: "US",
    totalYearsExperience: 5,
    workAuthorization: "US_CITIZEN",
    requiresSponsorship: false,
    remotePreference: "REMOTE_ONLY",
    targetLocations: ["Remote"],
    targetRoles: ["Engineer"],
    desiredSalaryMin: 120000,
    desiredSalaryMax: 180000,
    salaryCurrency: "USD",
    skills: [{ id: "s1", name: "TypeScript" }],
    experiences: [
      {
        id: "e1",
        jobTitle: "Engineer",
        companyName: "Acme",
        technologies: ["TypeScript"],
        startDate: "2020-01-01",
        endDate: null,
        isCurrent: true,
      },
    ],
    educations: [
      {
        id: "ed1",
        degree: "BS",
        fieldOfStudy: "CS",
        institution: "State U",
      },
    ],
    certifications: [
      { id: "c1", name: "AWS SAA", issuingAuthority: "Amazon" },
    ],
    projects: [{ id: "p1", technologies: ["React"] }],
    ...overrides,
  };
}

function job(overrides: Partial<MatchJobInput> = {}): MatchJobInput {
  return {
    jobId: JOB,
    organizationId: ORG,
    title: "Senior Engineer",
    companyName: "Acme",
    location: "Remote",
    isRemote: true,
    employmentType: "FULL_TIME",
    salaryMin: 140000,
    salaryMax: 180000,
    salaryCurrency: "USD",
    status: "OPEN",
    visibility: "GLOBAL",
    ownerCandidateId: null,
    ...overrides,
  };
}

describe("Phase 5C.6 — fingerprint correctness", () => {
  it("includes job title in sourceDataVersion", () => {
    const a = buildMatchSourceDataVersion({
      candidate: candidate(),
      job: job({ title: "Senior Engineer" }),
      requirementSet: null,
    });
    const b = buildMatchSourceDataVersion({
      candidate: candidate(),
      job: job({ title: "Staff Engineer" }),
      requirementSet: null,
    });
    expect(a).not.toBe(b);
  });

  it("includes experience content when ID is unchanged", () => {
    const a = buildMatchSourceDataVersion({
      candidate: candidate(),
      job: job(),
      requirementSet: null,
    });
    const b = buildMatchSourceDataVersion({
      candidate: candidate({
        experiences: [
          {
            id: "e1",
            jobTitle: "Principal Engineer",
            companyName: "Acme",
            technologies: ["TypeScript", "Go"],
            startDate: "2020-01-01",
            endDate: null,
            isCurrent: true,
          },
        ],
      }),
      job: job(),
      requirementSet: null,
    });
    expect(a).not.toBe(b);
  });

  it("includes education / certification / project content", () => {
    const base = buildMatchSourceDataVersion({
      candidate: candidate(),
      job: job(),
      requirementSet: null,
    });
    const edu = buildMatchSourceDataVersion({
      candidate: candidate({
        educations: [
          {
            id: "ed1",
            degree: "MS",
            fieldOfStudy: "CS",
            institution: "State U",
          },
        ],
      }),
      job: job(),
      requirementSet: null,
    });
    const cert = buildMatchSourceDataVersion({
      candidate: candidate({
        certifications: [
          { id: "c1", name: "CKA", issuingAuthority: "CNCF" },
        ],
      }),
      job: job(),
      requirementSet: null,
    });
    const proj = buildMatchSourceDataVersion({
      candidate: candidate({
        projects: [{ id: "p1", technologies: ["Rust"] }],
      }),
      job: job(),
      requirementSet: null,
    });
    expect(edu).not.toBe(base);
    expect(cert).not.toBe(base);
    expect(proj).not.toBe(base);
  });

  it("remains deterministic for same inputs", () => {
    const a = buildMatchSourceDataVersion({
      candidate: candidate(),
      job: job(),
      requirementSet: null,
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
    });
    const b = buildMatchSourceDataVersion({
      candidate: candidate(),
      job: job(),
      requirementSet: null,
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
    });
    expect(a).toBe(b);
  });
});

describe("Phase 5C.6 — set-based invalidation", () => {
  it("marks candidate-scope matches STALE via bounded SQL then requeues", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ id: MATCH_A }, { id: MATCH_B }])
      .mockResolvedValueOnce([]);
    const executeRaw = vi.fn().mockResolvedValue(2);
    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };

    const result = await invalidateCandidateJobMatchesForCandidate(tx as never, {
      organizationId: ORG,
      candidateId: CAND,
      reason: "CANDIDATE_TRUTH_CHANGED",
    });

    expect(result.markedStale).toBe(2);
    expect(result.batches).toBeGreaterThanOrEqual(1);
    expect(queryRaw).toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalled();
  });

  it("marks job-scope matches and is idempotent when none remain", async () => {
    const queryRaw = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([]);
    const executeRaw = vi.fn();
    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };

    const result = await invalidateCandidateJobMatchesForJob(tx as never, {
      organizationId: ORG,
      jobId: JOB,
      reason: "JOB_SOURCE_CHANGED",
    });
    expect(result.markedStale).toBe(0);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("batch size is bounded", () => {
    expect(JOB_MATCH_INVALIDATION_BATCH_SIZE).toBeLessThanOrEqual(100);
    expect(JOB_MATCH_INVALIDATION_BATCH_SIZE).toBeGreaterThan(0);
  });
});

describe("Phase 5C.6 — production mutation wiring (source forensics)", () => {
  it("candidate profile + career section actions call invalidation", () => {
    const src = read("src/lib/candidate/actions.ts");
    expect(src).toMatch(/invalidateCandidateJobMatchesForCandidate/);
    expect(src).toMatch(/updateCandidateProfileSelfAction/);
    expect(src).toMatch(/upsertCandidateExperienceAction/);
    expect(src).toMatch(/deleteCandidateExperienceAction/);
    expect(src).toMatch(/upsertCandidateEducationAction/);
    expect(src).toMatch(/deleteCandidateEducationAction/);
    expect(src).toMatch(/syncCandidateSkillsAction/);
    expect(src).toMatch(/upsertCandidateProjectAction/);
    expect(src).toMatch(/deleteCandidateProjectAction/);
    expect(src).toMatch(/upsertCandidateCertificationAction/);
    expect(src).toMatch(/deleteCandidateCertificationAction/);
    // Count call sites — each mutation path must invoke invalidation.
    const calls = src.match(/invalidateCandidateJobMatchesForCandidate/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(10);
  });

  it("job update + visibility share actions call job-scope invalidation", () => {
    const src = read("src/lib/application/actions.ts");
    expect(src).toMatch(/invalidateCandidateJobMatchesForJob/);
    expect(src).toMatch(/updateJobAction/);
    expect(src).toMatch(/shareJobToCatalogAction/);
    expect(src).toMatch(/JOB_SOURCE_CHANGED/);
    const calls = src.match(/invalidateCandidateJobMatchesForJob/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("JD snapshot + requirement set paths call job-scope invalidation", () => {
    const src = read("src/lib/application-intelligence/requirement-set.ts");
    expect(src).toMatch(/invalidateCandidateJobMatchesForJob/);
    expect(src).toMatch(/JD_SNAPSHOT_CHANGED/);
    expect(src).toMatch(/REQUIREMENT_SET_CHANGED/);
    expect(src).toMatch(/persistJobRequirementSet/);
    expect(src).toMatch(/syncJobDescriptionSnapshotAfterJobWrite/);
  });

  it("does not synchronously evaluate matching in mutation modules", () => {
    const candidate = read("src/lib/candidate/actions.ts");
    const jobs = read("src/lib/application/actions.ts");
    const req = read("src/lib/application-intelligence/requirement-set.ts");
    for (const src of [candidate, jobs, req]) {
      expect(src).not.toMatch(/evaluateCandidateJobMatch/);
      expect(src).not.toMatch(/processJobMatch/);
      expect(src).not.toMatch(/drainJobMatchWorker/);
    }
  });

  it("worker refuses to overwrite STALE with SUCCEEDED", () => {
    const worker = read("src/lib/job-matching/worker.ts");
    expect(worker).toMatch(/freshness:\s*\{\s*not:\s*"STALE"/);
    expect(worker).toMatch(/Decision fields intentionally omitted/);
    expect(worker).toMatch(/freshness = 'CURRENT'/);
  });

  it("invalidation SQL preserves decision fields by omission", () => {
    const src = read("src/lib/job-matching/invalidation.ts");
    // Comments may mention decision fields; SET clauses must not assign them.
    const setBlocks = src.match(/SET[\s\S]*?WHERE/g) ?? [];
    expect(setBlocks.length).toBeGreaterThan(0);
    for (const block of setBlocks) {
      expect(block).not.toMatch(/savedAt|dismissedAt|applicationRequestedAt|opportunityId/);
    }
    expect(src).toMatch(/JOB_MATCH_MARKED_STALE/);
    expect(src).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it("no schema/migration for 5C.6", () => {
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(migrations.some((m) => /phase5c6|invalidation/i.test(m))).toBe(
      false
    );
  });
});

describe("Phase 5C.6 — Save/Request gates remain CURRENT+SUCCEEDED", () => {
  it("actions still require current evaluation for Save/Request", () => {
    const src = read("src/lib/job-matching/actions.ts");
    expect(src).toMatch(/requireCurrentEvaluation:\s*true/);
    expect(src).toMatch(/saveCandidateJobMatchAction/);
    expect(src).toMatch(/requestCandidateJobApplicationAction/);
    expect(src).toMatch(/Please wait while this recommendation is updated/);
  });
});
