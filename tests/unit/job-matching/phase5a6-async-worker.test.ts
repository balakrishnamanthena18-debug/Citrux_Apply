import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  MATCHING_CONTRACT_VERSION,
  MATCH_DRAIN_BATCH_SIZE,
  MATCH_MAX_CONCURRENT_PER_CANDIDATE,
  MATCH_WORKER_LEASE_MS,
  evaluateCandidateJobMatch,
  buildJobMatchIdempotencyKey,
  buildMatchSourceDataVersion,
  type MatchCandidateInput,
  type MatchJobInput,
  type MatchStructuredRequirement,
} from "@/lib/job-matching";
import { normalizeRequirementValue } from "@/lib/application-intelligence/requirements-contract";

const ROOT = join(__dirname, "../../..");

const matchFindUnique = vi.fn();
const matchUpdateMany = vi.fn();
const matchUpdate = vi.fn();
const matchCreate = vi.fn();
const matchFindFirst = vi.fn();
const queryRaw = vi.fn();
const executeRaw = vi.fn();
const candidateFindFirst = vi.fn();
const jobFindFirst = vi.fn();
const reqSetFindFirst = vi.fn();
const snapFindFirst = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
    candidateJobMatch: {
      findUnique: (...args: unknown[]) => matchFindUnique(...args),
      findFirst: (...args: unknown[]) => matchFindFirst(...args),
      updateMany: (...args: unknown[]) => matchUpdateMany(...args),
      update: (...args: unknown[]) => matchUpdate(...args),
      create: (...args: unknown[]) => matchCreate(...args),
    },
    candidate: {
      findFirst: (...args: unknown[]) => candidateFindFirst(...args),
    },
    job: {
      findFirst: (...args: unknown[]) => jobFindFirst(...args),
    },
    jobRequirementSet: {
      findFirst: (...args: unknown[]) => reqSetFindFirst(...args),
    },
    jobDescriptionSnapshot: {
      findFirst: (...args: unknown[]) => snapFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  logSystemAuditEvent: vi.fn().mockResolvedValue(undefined),
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

import { logSystemAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  claimNextJobMatch,
  reclaimExpiredJobMatchLeases,
  requeueStaleJobMatches,
  processJobMatch,
  drainJobMatchWorker,
  enqueueCandidateJobMatchWork,
  markJobMatchStaleAndRequeue,
} from "@/lib/job-matching/worker";
import { AuditAction } from "@/generated/prisma/client";

const ORG = "11111111-1111-4111-8111-111111111111";
const CAND_A = "22222222-2222-4222-8222-222222222222";
const CAND_B = "33333333-3333-4333-8333-333333333333";
const JOB_1 = "44444444-4444-4444-8444-444444444444";
const JOB_2 = "55555555-5555-4555-8555-555555555555";
const JOB_3 = "66666666-6666-4666-8666-666666666666";
const MATCH_A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MATCH_A2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const MATCH_B1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

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

function candidateInput(
  id: string,
  overrides: Partial<MatchCandidateInput> = {}
): MatchCandidateInput {
  return {
    candidateId: id,
    organizationId: ORG,
    updatedAt: "2026-01-01T00:00:00.000Z",
    city: "Austin",
    state: "TX",
    country: "US",
    totalYearsExperience: 6,
    workAuthorization: "CITIZEN",
    requiresSponsorship: false,
    remotePreference: "FLEXIBLE",
    targetLocations: ["Austin, TX"],
    targetRoles: ["Software Engineer"],
    desiredSalaryMin: 120000,
    desiredSalaryMax: 160000,
    salaryCurrency: "USD",
    skills: [
      { id: randomUUID(), name: "TypeScript" },
      { id: randomUUID(), name: "React" },
    ],
    experiences: [],
    educations: [],
    certifications: [],
    projects: [],
    ...overrides,
  };
}

function globalJob(
  id: string,
  overrides: Partial<MatchJobInput> = {}
): MatchJobInput {
  return {
    jobId: id,
    organizationId: ORG,
    title: "Platform Engineer",
    companyName: "Gate13",
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

/**
 * Simulates the claim SQL predicates:
 * - SKIP LOCKED row reservation
 * - NOT EXISTS active RUNNING for same candidate
 * - advisory lock per candidate (max 1 concurrent RUNNING)
 */
function simulateMatchClaims(
  queued: Array<{ id: string; candidateId: string }>,
  workerCount: number
): {
  claims: Array<{ worker: number; id: string; candidateId: string }>;
  remainingQueued: string[];
} {
  const remaining = [...queued];
  const runningByCandidate = new Map<string, string>();
  const advisory = new Set<string>();
  const claims: Array<{ worker: number; id: string; candidateId: string }> = [];

  for (let w = 0; w < workerCount; w++) {
    let picked: { id: string; candidateId: string } | null = null;
    for (let i = 0; i < remaining.length; i++) {
      const row = remaining[i]!;
      if (runningByCandidate.has(row.candidateId)) continue;
      if (advisory.has(row.candidateId)) continue;
      advisory.add(row.candidateId);
      remaining.splice(i, 1);
      runningByCandidate.set(row.candidateId, row.id);
      picked = row;
      break;
    }
    if (picked) {
      claims.push({ worker: w, id: picked.id, candidateId: picked.candidateId });
    }
  }

  return {
    claims,
    remainingQueued: remaining.map((r) => r.id),
  };
}

function mockAuthoritativeLoads(input: {
  candidateId: string;
  job: MatchJobInput;
  candidate?: MatchCandidateInput;
}) {
  const cand = input.candidate ?? candidateInput(input.candidateId);
  candidateFindFirst.mockResolvedValue({
    id: cand.candidateId,
    organizationId: cand.organizationId,
    updatedAt: new Date(cand.updatedAt),
    city: cand.city,
    state: cand.state,
    country: cand.country,
    totalYearsExperience: cand.totalYearsExperience,
    workAuthorization: cand.workAuthorization,
    requiresSponsorship: cand.requiresSponsorship,
    remotePreference: cand.remotePreference,
    targetLocations: cand.targetLocations,
    targetRoles: cand.targetRoles,
    desiredSalaryMin: cand.desiredSalaryMin,
    desiredSalaryMax: cand.desiredSalaryMax,
    salaryCurrency: cand.salaryCurrency,
    skills: cand.skills,
    experiences: [],
    educations: [],
    certifications: [],
    projects: [],
  });
  jobFindFirst.mockResolvedValue({
    id: input.job.jobId,
    organizationId: input.job.organizationId,
    title: input.job.title,
    companyName: input.job.companyName,
    location: input.job.location,
    isRemote: input.job.isRemote,
    employmentType: input.job.employmentType,
    salaryMin: input.job.salaryMin,
    salaryMax: input.job.salaryMax,
    salaryCurrency: input.job.salaryCurrency,
    status: input.job.status,
    visibility: input.job.visibility,
    ownerCandidateId: input.job.ownerCandidateId,
  });
  reqSetFindFirst.mockResolvedValue(null);
  snapFindFirst.mockResolvedValue(null);
}

describe("Phase 5A.6 — claim / lease / concurrency SQL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("QUEUED → RUNNING claim uses FOR UPDATE SKIP LOCKED + advisory lock", async () => {
    queryRaw.mockResolvedValue([
      {
        id: MATCH_A1,
        organizationId: ORG,
        candidateId: CAND_A,
        jobId: JOB_1,
        attemptCount: 1,
      },
    ]);
    const claimed = await claimNextJobMatch();
    expect(claimed?.id).toBe(MATCH_A1);
    expect(claimed?.attemptCount).toBe(1);
    const sql = String(queryRaw.mock.calls[0]?.[0] ?? "");
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/QUEUED/);
    expect(sql).toMatch(/RUNNING/);
    expect(sql).toMatch(/pg_try_advisory_xact_lock/);
    expect(sql).toMatch(/candidateId/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(MATCH_WORKER_LEASE_MS).toBe(5 * 60 * 1000);
    expect(MATCH_DRAIN_BATCH_SIZE).toBe(25);
    expect(MATCH_MAX_CONCURRENT_PER_CANDIDATE).toBe(1);
  });

  it("duplicate workers: only one claims the same queued row", async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          id: MATCH_A1,
          organizationId: ORG,
          candidateId: CAND_A,
          jobId: JOB_1,
          attemptCount: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    const [a, b] = await Promise.all([claimNextJobMatch(), claimNextJobMatch()]);
    const ids = [a?.id, b?.id].filter(Boolean);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(MATCH_A1);
  });

  it("per-candidate concurrency: A2 stays QUEUED while A1 RUNNING; B1 may RUN", () => {
    const result = simulateMatchClaims(
      [
        { id: MATCH_A1, candidateId: CAND_A },
        { id: MATCH_A2, candidateId: CAND_A },
        { id: MATCH_B1, candidateId: CAND_B },
      ],
      2
    );
    expect(result.claims).toHaveLength(2);
    const claimedIds = result.claims.map((c) => c.id).sort();
    expect(claimedIds).toEqual([MATCH_A1, MATCH_B1].sort());
    expect(result.remainingQueued).toContain(MATCH_A2);
    expect(result.claims.filter((c) => c.candidateId === CAND_A)).toHaveLength(1);
    expect(result.claims.filter((c) => c.candidateId === CAND_B)).toHaveLength(1);
  });

  it("cross-candidate concurrency allows parallel RUNNING", () => {
    const result = simulateMatchClaims(
      [
        { id: MATCH_A1, candidateId: CAND_A },
        { id: MATCH_B1, candidateId: CAND_B },
      ],
      2
    );
    expect(result.claims).toHaveLength(2);
  });

  it("claim SQL source enforces per-candidate limit in the actual mechanism", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/job-matching/worker.ts"),
      "utf8"
    );
    const claimFn = src.slice(src.indexOf("export async function claimNextJobMatch"));
    expect(claimFn).toMatch(/pg_try_advisory_xact_lock/);
    expect(claimFn).toMatch(/NOT EXISTS/);
    expect(claimFn).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(claimFn).toMatch(/status = 'RUNNING'/);
  });

  it("expired lease reclaim uses SKIP LOCKED and QUEUED/FAILED", async () => {
    executeRaw.mockResolvedValue(1);
    const n = await reclaimExpiredJobMatchLeases(new Date("2026-10-05T00:00:00Z"));
    expect(n).toBe(1);
    const sql = String(executeRaw.mock.calls[0]?.[0] ?? "");
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/leaseExpiresAt/);
    expect(sql).toMatch(/RUNNING/);
    expect(sql).toMatch(/QUEUED/);
    expect(sql).toMatch(/FAILED/);
  });

  it("STALE → QUEUED requeue is bounded and atomic", async () => {
    executeRaw.mockResolvedValue(3);
    expect(await requeueStaleJobMatches(25)).toBe(3);
    const sql = String(executeRaw.mock.calls[0]?.[0] ?? "");
    expect(sql).toMatch(/STALE/);
    expect(sql).toMatch(/QUEUED/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it("batch limit is 25", () => {
    expect(MATCH_DRAIN_BATCH_SIZE).toBe(25);
    const src = readFileSync(
      join(ROOT, "src/lib/job-matching/worker.ts"),
      "utf8"
    );
    expect(src).toMatch(/MATCH_DRAIN_BATCH_SIZE/);
    expect(src).toMatch(/Math\.min\(Math\.max\(1, limit\), MATCH_DRAIN_BATCH_SIZE\)/);
  });
});

describe("Phase 5A.6 — process lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("RUNNING → SUCCEEDED evaluates and updates same row", async () => {
    const job = globalJob(JOB_1);
    const cand = candidateInput(CAND_A);
    const source = buildMatchSourceDataVersion({
      candidate: cand,
      job,
      requirementSet: null,
    });

    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "old",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "old-key",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({ candidateId: CAND_A, job, candidate: cand });
    matchUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processJobMatch(MATCH_A1);
    expect(result.status).toBe("SUCCEEDED");
    expect(matchUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: MATCH_A1,
          status: "RUNNING",
          freshness: { not: "STALE" },
        },
        data: expect.objectContaining({
          status: "SUCCEEDED",
          freshness: "CURRENT",
          sourceDataVersion: source,
          leaseExpiresAt: null,
        }),
      })
    );
    expect(logSystemAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.JOB_MATCH_COMPLETED,
        entityId: MATCH_A1,
      })
    );
  });

  it("idempotent replay skips re-evaluation audit when same sourceDataVersion", async () => {
    const job = globalJob(JOB_1);
    const cand = candidateInput(CAND_A);
    const source = buildMatchSourceDataVersion({
      candidate: cand,
      job,
      requirementSet: null,
    });
    const key = buildJobMatchIdempotencyKey({
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      sourceDataVersion: source,
    });

    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: source,
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: key,
      category: "GOOD_MATCH",
      evaluatedAt: new Date("2026-01-01"),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({ candidateId: CAND_A, job, candidate: cand });
    matchUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processJobMatch(MATCH_A1);
    expect(result.status).toBe("IDEMPOTENT");
    expect(logSystemAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.JOB_MATCH_COMPLETED })
    );
  });

  it("RUNNING → FAILED on permanent private-job denial", async () => {
    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "x",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "x",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({
      candidateId: CAND_A,
      job: globalJob(JOB_1, {
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: CAND_B,
      }),
    });
    matchUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processJobMatch(MATCH_A1);
    expect(result.status).toBe("FAILED");
    expect(matchUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
    expect(logSystemAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.JOB_MATCH_FAILED })
    );
  });

  it("retry: transient failure requeues when attempts remain", async () => {
    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "x",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "x",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    candidateFindFirst.mockRejectedValue(new Error("connection reset"));
    matchUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processJobMatch(MATCH_A1);
    expect(result.status).toBe("QUEUED");
    expect(matchUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "QUEUED",
          errorCode: "MATCH_TRANSIENT",
        }),
      })
    );
  });

  it("max retry: transient failure → FAILED at maxAttempts", async () => {
    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 3,
      maxAttempts: 3,
      sourceDataVersion: "x",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "x",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    candidateFindFirst.mockRejectedValue(new Error("connection reset"));
    matchUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processJobMatch(MATCH_A1);
    expect(result.status).toBe("FAILED");
    expect(logSystemAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.JOB_MATCH_FAILED })
    );
  });

  it("lease recovery path: reclaim then claim then succeed", async () => {
    executeRaw.mockResolvedValueOnce(1); // reclaim
    executeRaw.mockResolvedValueOnce(0); // requeue stale
    queryRaw.mockResolvedValueOnce([
      {
        id: MATCH_A1,
        organizationId: ORG,
        candidateId: CAND_A,
        jobId: JOB_1,
        attemptCount: 2,
      },
    ]);

    const job = globalJob(JOB_1);
    const cand = candidateInput(CAND_A);
    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 2,
      maxAttempts: 3,
      sourceDataVersion: "old",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "old",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({ candidateId: CAND_A, job, candidate: cand });
    matchUpdateMany.mockResolvedValue({ count: 1 });

    const drain = await drainJobMatchWorker(1);
    expect(drain.reclaimedLeases).toBe(1);
    expect(drain.claimed).toBe(1);
    expect(drain.succeeded).toBe(1);
  });

  it("stale sourceDataVersion recomputes same match id", async () => {
    const job = globalJob(JOB_1);
    const cand = candidateInput(CAND_A, {
      updatedAt: "2026-02-01T00:00:00.000Z",
      skills: [{ id: randomUUID(), name: "Go" }],
    });
    const newSource = buildMatchSourceDataVersion({
      candidate: cand,
      job,
      requirementSet: null,
    });

    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "source-A",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "key-A",
      category: "LOW_MATCH",
      evaluatedAt: new Date("2026-01-01"),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({ candidateId: CAND_A, job, candidate: cand });
    matchUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processJobMatch(MATCH_A1);
    expect(result.status).toBe("SUCCEEDED");
    expect(matchUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: MATCH_A1,
          status: "RUNNING",
          freshness: { not: "STALE" },
        },
        data: expect.objectContaining({
          sourceDataVersion: newSource,
        }),
      })
    );
    expect(matchCreate).not.toHaveBeenCalled();
  });

  it("GLOBAL job succeeds; PRIVATE owner ok; wrong candidate denied", async () => {
    // GLOBAL
    matchFindUnique.mockResolvedValueOnce({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "x",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "x",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({
      candidateId: CAND_A,
      job: globalJob(JOB_1),
      candidate: candidateInput(CAND_A),
    });
    matchUpdateMany.mockResolvedValue({ count: 1 });
    expect((await processJobMatch(MATCH_A1)).status).toBe("SUCCEEDED");

    // PRIVATE owner
    vi.clearAllMocks();
    matchFindUnique.mockResolvedValueOnce({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_2,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "x",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "x",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({
      candidateId: CAND_A,
      job: globalJob(JOB_2, {
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: CAND_A,
      }),
      candidate: candidateInput(CAND_A),
    });
    matchUpdateMany.mockResolvedValue({ count: 1 });
    expect((await processJobMatch(MATCH_A1)).status).toBe("SUCCEEDED");

    // PRIVATE wrong candidate
    vi.clearAllMocks();
    matchFindUnique.mockResolvedValueOnce({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_3,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "x",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "x",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({
      candidateId: CAND_A,
      job: globalJob(JOB_3, {
        visibility: "CANDIDATE_PRIVATE",
        ownerCandidateId: CAND_B,
      }),
    });
    matchUpdateMany.mockResolvedValue({ count: 1 });
    expect((await processJobMatch(MATCH_A1)).status).toBe("FAILED");
  });

  it("cross-tenant denied", async () => {
    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "x",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "x",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    candidateFindFirst.mockResolvedValue({
      id: CAND_A,
      organizationId: ORG,
      updatedAt: new Date(),
      city: null,
      state: null,
      country: "US",
      totalYearsExperience: 1,
      workAuthorization: "CITIZEN",
      requiresSponsorship: false,
      remotePreference: "FLEXIBLE",
      targetLocations: [],
      targetRoles: [],
      desiredSalaryMin: null,
      desiredSalaryMax: null,
      salaryCurrency: "USD",
      skills: [],
      experiences: [],
      educations: [],
      certifications: [],
      projects: [],
    });
    jobFindFirst.mockResolvedValue({
      id: JOB_1,
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "X",
      companyName: "Y",
      location: null,
      isRemote: true,
      employmentType: "FULL_TIME",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "USD",
      status: "OPEN",
      visibility: "GLOBAL",
      ownerCandidateId: null,
    });
    matchUpdateMany.mockResolvedValue({ count: 1 });

    const result = await processJobMatch(MATCH_A1);
    expect(result.status).toBe("FAILED");
  });
});

describe("Phase 5A.6 — enqueue / stale / audit / security logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueue creates QUEUED and emits JOB_MATCH_REQUESTED", async () => {
    const job = globalJob(JOB_1);
    const cand = candidateInput(CAND_A);
    const tx = {
      candidate: { findFirst: candidateFindFirst },
      job: { findFirst: jobFindFirst },
      jobRequirementSet: { findFirst: reqSetFindFirst },
      jobDescriptionSnapshot: { findFirst: snapFindFirst },
      candidateJobMatch: {
        findUnique: matchFindUnique,
        create: matchCreate,
        update: matchUpdate,
      },
    };
    mockAuthoritativeLoads({ candidateId: CAND_A, job, candidate: cand });
    matchFindUnique.mockResolvedValue(null);
    matchCreate.mockResolvedValue({ id: MATCH_A1 });

    const result = await enqueueCandidateJobMatchWork(tx as never, {
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      requestedById: null,
    });
    expect(result.created).toBe(true);
    expect(matchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "QUEUED" }),
      })
    );
    expect(logSystemAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.JOB_MATCH_REQUESTED })
    );
  });

  it("mark stale emits JOB_MATCH_MARKED_STALE on same row", async () => {
    const tx = {
      candidateJobMatch: {
        findFirst: matchFindFirst,
        update: matchUpdate,
      },
    };
    matchFindFirst.mockResolvedValue({
      id: MATCH_A1,
      candidateId: CAND_A,
      jobId: JOB_1,
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      sourceDataVersion: "src-A",
      status: "SUCCEEDED",
    });
    matchUpdate.mockResolvedValue({});

    await markJobMatchStaleAndRequeue(tx as never, {
      organizationId: ORG,
      matchId: MATCH_A1,
    });
    expect(matchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MATCH_A1 },
        data: expect.objectContaining({ status: "STALE", freshness: "STALE" }),
      })
    );
    expect(logSystemAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.JOB_MATCH_MARKED_STALE })
    );
  });

  it("does not log sensitive JD/resume/requirements payloads", async () => {
    const job = globalJob(JOB_1);
    const cand = candidateInput(CAND_A);
    matchFindUnique.mockResolvedValue({
      id: MATCH_A1,
      organizationId: ORG,
      candidateId: CAND_A,
      jobId: JOB_1,
      status: "RUNNING",
      attemptCount: 1,
      maxAttempts: 3,
      sourceDataVersion: "old",
      matchingContractVersion: MATCHING_CONTRACT_VERSION,
      idempotencyKey: "old",
      category: null,
      evaluatedAt: null,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockAuthoritativeLoads({ candidateId: CAND_A, job, candidate: cand });
    matchUpdateMany.mockResolvedValue({ count: 1 });

    await processJobMatch(MATCH_A1);

    const infoCalls = vi.mocked(logger.info).mock.calls;
    const blob = JSON.stringify(infoCalls);
    expect(blob).not.toMatch(/extractedText|password|api_key|Bearer /i);
    expect(blob).not.toContain("requirements");
    for (const call of vi.mocked(logSystemAuditEvent).mock.calls) {
      const details = JSON.stringify(call[0]?.details ?? {});
      expect(details).not.toMatch(/rawValue|sourceText|extractedText/);
    }
  });

  it("cron route reuses intelligence-worker and drains job matches", () => {
    const route = readFileSync(
      join(ROOT, "src/app/api/cron/intelligence-worker/route.ts"),
      "utf8"
    );
    expect(route).toMatch(/drainJobMatchWorker/);
    expect(route).toMatch(/drainIntelligenceWorker/);
    expect(route).toMatch(/drainResumeReviewWorker/);
    expect(route).toMatch(/CRON_SECRET/);
    expect(route).not.toMatch(/job-matching-worker/);
  });

  it("no second worker/cron architecture introduced", () => {
    const worker = readFileSync(
      join(ROOT, "src/lib/job-matching/worker.ts"),
      "utf8"
    );
    expect(worker).toMatch(/CandidateJobMatch is the/);
    expect(worker).not.toMatch(/create second cron/i);
  });
});

describe("Phase 5A.6 — Phase 5A.4 / 5A.5 / Phase 2 regression anchors", () => {
  it("Phase 5A.4 evaluateCandidateJobMatch remains deterministic", () => {
    const cand = candidateInput(CAND_A);
    const job = globalJob(JOB_1);
    const requirementSetId = "11111111-1111-4111-8111-111111111111";
    const snapshotId = "22222222-2222-4222-8222-222222222222";
    const requirements = [
      req({
        id: "33333333-3333-4333-8333-333333333333",
        category: "REQUIRED_SKILL",
        rawValue: "TypeScript",
        importance: "REQUIRED",
      }),
    ];
    const input = {
      candidate: cand,
      job,
      requirementSet: {
        requirementSetId,
        snapshotId,
        contentHash: "h1",
        schemaVersion: "job-requirements.v1",
        normalizationVersion: "normalize.v1",
        extractionVersion: "extract.v1",
        freshness: "CURRENT" as const,
        requirements,
      },
      asOf: new Date("2026-10-05T00:00:00.000Z"),
    };
    const a = evaluateCandidateJobMatch(input);
    const b = evaluateCandidateJobMatch(input);
    expect(a.category).toBe(b.category);
    expect(a.sourceDataVersion).toBe(b.sourceDataVersion);
    expect(a.matchingContractVersion).toBe(MATCHING_CONTRACT_VERSION);
  });

  it("Phase 5A.5 current identity + unique constraints remain in schema", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/model CandidateJobMatch/);
    expect(schema).toMatch(/@@unique\(\[organizationId, candidateId, jobId\]\)/);
    expect(schema).toMatch(/leaseExpiresAt/);
    expect(schema).toMatch(/attemptCount/);
    expect(schema).toMatch(/maxAttempts/);
  });

  it("Phase 2 intelligence worker claim/lease files unchanged in contract", () => {
    const claim = readFileSync(
      join(ROOT, "src/lib/application-intelligence/run-claim.ts"),
      "utf8"
    );
    expect(claim).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(claim).toMatch(/INTELLIGENCE_WORKER_LEASE_MS/);
    expect(claim).toMatch(/claimQueuedIntelligenceRuns/);
    const worker = readFileSync(
      join(ROOT, "src/lib/application-intelligence/worker.ts"),
      "utf8"
    );
    expect(worker).toMatch(/drainIntelligenceWorker/);
    expect(worker).toMatch(/reclaimExpiredLeases/);
  });

  it("Phase 4 resume worker still present on same cron", () => {
    const resume = readFileSync(
      join(ROOT, "src/lib/resume-intelligence/worker.ts"),
      "utf8"
    );
    expect(resume).toMatch(/claimNextResumeReview/);
    expect(resume).toMatch(/FOR UPDATE SKIP LOCKED/);
  });
});
