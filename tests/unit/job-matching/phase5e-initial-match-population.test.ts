/**
 * Phase 5E — Initial Match Population (Job ↔ Candidate fan-out).
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

const enqueueMock = vi.fn();
vi.mock("@/lib/job-matching/worker", () => ({
  enqueueCandidateJobMatchWork: (...args: unknown[]) => enqueueMock(...args),
}));

import {
  populateJobMatchWorkForJob,
  populateJobMatchWorkForCandidate,
  isCandidateMatchPopulationEligible,
  JOB_MATCH_POPULATION_BATCH_SIZE,
  JOB_MATCH_POPULATION_MAX_BATCHES,
} from "@/lib/job-matching/population";

const ROOT = join(__dirname, "../../..");
const ORG = "11111111-1111-4111-8111-111111111111";
const JOB = "33333333-3333-4333-8333-333333333333";
const CAND_A = "22222222-2222-4222-8222-222222222222";
const CAND_B = "22222222-2222-4222-8222-222222222223";
const MATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 5E — eligibility", () => {
  it("ACTIVE candidates are population-eligible; others are not", () => {
    expect(isCandidateMatchPopulationEligible("ACTIVE")).toBe(true);
    expect(isCandidateMatchPopulationEligible("ONBOARDING")).toBe(false);
    expect(isCandidateMatchPopulationEligible("INACTIVE")).toBe(false);
    expect(isCandidateMatchPopulationEligible("ARCHIVED")).toBe(false);
  });

  it("batch limits are bounded", () => {
    expect(JOB_MATCH_POPULATION_BATCH_SIZE).toBeGreaterThan(0);
    expect(JOB_MATCH_POPULATION_BATCH_SIZE).toBeLessThanOrEqual(25);
    expect(JOB_MATCH_POPULATION_MAX_BATCHES).toBeGreaterThan(0);
    expect(
      JOB_MATCH_POPULATION_BATCH_SIZE * JOB_MATCH_POPULATION_MAX_BATCHES
    ).toBeLessThanOrEqual(1000);
  });
});

describe("Phase 5E — GLOBAL job population", () => {
  beforeEach(() => {
    enqueueMock.mockReset();
    enqueueMock.mockResolvedValue({
      matchId: MATCH_A,
      created: true,
      reusedQueued: false,
    });
  });

  it("enqueues ACTIVE candidates missing a match for OPEN GLOBAL job", async () => {
    const tx = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: JOB,
          organizationId: ORG,
          status: "OPEN",
          visibility: "GLOBAL",
          ownerCandidateId: null,
        }),
      },
      candidate: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: CAND_A }, { id: CAND_B }])
          .mockResolvedValueOnce([]),
      },
      candidateJobMatch: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const result = await populateJobMatchWorkForJob(tx as never, {
      organizationId: ORG,
      jobId: JOB,
      reason: "GLOBAL_JOB_CREATED",
    });

    expect(result.enqueued).toBe(2);
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    expect(enqueueMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: ORG,
        candidateId: CAND_A,
        jobId: JOB,
        emitAudit: false,
      })
    );
  });

  it("skips CLOSED jobs", async () => {
    const tx = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: JOB,
          organizationId: ORG,
          status: "CLOSED",
          visibility: "GLOBAL",
          ownerCandidateId: null,
        }),
      },
      candidate: { findMany: vi.fn() },
      candidateJobMatch: { findUnique: vi.fn() },
    };

    const result = await populateJobMatchWorkForJob(tx as never, {
      organizationId: ORG,
      jobId: JOB,
      reason: "GLOBAL_JOB_OPENED",
    });
    expect(result.enqueued).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(tx.candidate.findMany).not.toHaveBeenCalled();
  });

  it("does not enqueue when match already exists (dismissed/saved preserved)", async () => {
    const tx = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: JOB,
          organizationId: ORG,
          status: "OPEN",
          visibility: "GLOBAL",
          ownerCandidateId: null,
        }),
      },
      candidate: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: CAND_A }])
          .mockResolvedValueOnce([]),
      },
      candidateJobMatch: {
        findUnique: vi.fn().mockResolvedValue({ id: MATCH_A }),
      },
    };

    const result = await populateJobMatchWorkForJob(tx as never, {
      organizationId: ORG,
      jobId: JOB,
      reason: "GLOBAL_JOB_CREATED",
    });

    expect(result.enqueued).toBe(0);
    expect(result.skippedExisting).toBe(1);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("private job enqueues owner only", async () => {
    const tx = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: JOB,
          organizationId: ORG,
          status: "OPEN",
          visibility: "CANDIDATE_PRIVATE",
          ownerCandidateId: CAND_A,
        }),
      },
      candidate: {
        findFirst: vi.fn().mockResolvedValue({ id: CAND_A }),
        findMany: vi.fn(),
      },
      candidateJobMatch: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const result = await populateJobMatchWorkForJob(tx as never, {
      organizationId: ORG,
      jobId: JOB,
      reason: "PRIVATE_JOB_CREATED",
    });

    expect(result.enqueued).toBe(1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ candidateId: CAND_A, jobId: JOB })
    );
    expect(tx.candidate.findMany).not.toHaveBeenCalled();
  });
});

describe("Phase 5E — candidate readiness population", () => {
  beforeEach(() => {
    enqueueMock.mockReset();
    enqueueMock.mockResolvedValue({
      matchId: MATCH_A,
      created: true,
      reusedQueued: false,
    });
  });

  it("enqueues missing OPEN GLOBAL jobs for ACTIVE candidate", async () => {
    const tx = {
      candidate: {
        findFirst: vi.fn().mockResolvedValue({ id: CAND_A, status: "ACTIVE" }),
      },
      job: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: JOB }])
          .mockResolvedValueOnce([]),
      },
      candidateJobMatch: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const result = await populateJobMatchWorkForCandidate(tx as never, {
      organizationId: ORG,
      candidateId: CAND_A,
      reason: "CANDIDATE_BECAME_ACTIVE",
    });

    expect(result.enqueued).toBe(1);
    expect(enqueueMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ candidateId: CAND_A, jobId: JOB })
    );
  });

  it("no-ops for ONBOARDING candidate", async () => {
    const tx = {
      candidate: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: CAND_A, status: "ONBOARDING" }),
      },
      job: { findMany: vi.fn() },
      candidateJobMatch: { findUnique: vi.fn() },
    };

    const result = await populateJobMatchWorkForCandidate(tx as never, {
      organizationId: ORG,
      candidateId: CAND_A,
      reason: "CANDIDATE_BECAME_ACTIVE",
    });
    expect(result.enqueued).toBe(0);
    expect(tx.job.findMany).not.toHaveBeenCalled();
  });
});

describe("Phase 5E — production wiring forensics", () => {
  it("createJobAction / lead / share / reopen call population", () => {
    const src = read("src/lib/application/actions.ts");
    expect(src).toMatch(/populateJobMatchWorkForJob/);
    expect(src).toMatch(/GLOBAL_JOB_CREATED/);
    expect(src).toMatch(/PRIVATE_JOB_CREATED/);
    expect(src).toMatch(/GLOBAL_JOB_SHARED_TO_CATALOG/);
    expect(src).toMatch(/GLOBAL_JOB_OPENED/);
    expect(src).toMatch(/becameOpen/);
    const calls = src.match(/populateJobMatchWorkForJob/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("candidate ACTIVE transition calls population", () => {
    const src = read("src/lib/candidate/actions.ts");
    expect(src).toMatch(/populateJobMatchWorkForCandidate/);
    expect(src).toMatch(/CANDIDATE_BECAME_ACTIVE/);
    expect(src).toMatch(/updateCandidateStatusAction/);
  });

  it("mutation modules do not synchronously evaluate matching", () => {
    for (const rel of [
      "src/lib/job-matching/population.ts",
      "src/lib/application/actions.ts",
      "src/lib/candidate/actions.ts",
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/evaluateCandidateJobMatch/);
      expect(src).not.toMatch(/processJobMatch/);
      expect(src).not.toMatch(/drainJobMatchWorker/);
    }
  });

  it("population skips existing rows (no decision reset)", () => {
    const src = read("src/lib/job-matching/population.ts");
    expect(src).toMatch(/enqueueIfAbsent/);
    expect(src).not.toMatch(/savedAt/);
    expect(src).not.toMatch(/dismissedAt/);
    expect(src).not.toMatch(/applicationRequestedAt/);
    expect(src).not.toMatch(/opportunityId/);
  });

  it("no schema/migration for 5E", () => {
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(migrations.some((m) => /phase5e|population/i.test(m))).toBe(false);
  });
});
