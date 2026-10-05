import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  assertValidRunTransition,
  canTransitionRunStatus,
  ASYNC_EXECUTION_CONTRACT,
  assertNotSsrAiExecution,
  assertAuthorizedExecutionChain,
  evaluateExecutionFreshness,
  MockAIProvider,
  NullAIProvider,
  ProviderError,
  sanitizeIntelligenceAuditDetails,
  INTELLIGENCE_AUDIT_ACTIONS,
} from "@/lib/application-intelligence";

vi.mock("@/lib/security/abuse-protection", () => ({
  checkAiGenerationRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 9,
  }),
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

const runUpdate = vi.fn();
const runUpdateMany = vi.fn();
const runFindUnique = vi.fn();
const runFindMany = vi.fn();
const queryRaw = vi.fn();
const executeRaw = vi.fn();
const transaction = vi.fn();
const txQueryRaw = vi.fn();

function lockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    status: "RUNNING",
    leaseExpiresAt: new Date(Date.now() + 60_000),
    attemptCount: 1,
    maxAttempts: 3,
    ...overrides,
  };
}

function mockPersistTx() {
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      applicationIntelligenceRun: {
        findUnique: runFindUnique,
        update: runUpdate,
        updateMany: runUpdateMany,
      },
      $queryRaw: (...args: unknown[]) => txQueryRaw(...args),
    })
  );
  txQueryRaw.mockResolvedValue([lockRow()]);
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    applicationIntelligenceRun: {
      update: (...args: unknown[]) => runUpdate(...args),
      updateMany: (...args: unknown[]) => runUpdateMany(...args),
      findUnique: (...args: unknown[]) => runFindUnique(...args),
      findMany: (...args: unknown[]) => runFindMany(...args),
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

import { checkAiGenerationRateLimit } from "@/lib/security/abuse-protection";
import { logSystemAuditEvent } from "@/lib/audit";
import {
  claimQueuedIntelligenceRuns,
  reclaimExpiredLeases,
  requeueRetryPendingRuns,
} from "@/lib/application-intelligence/run-claim";
import { executeIntelligenceRunPipeline } from "@/lib/application-intelligence/pipeline";
import { drainIntelligenceWorker } from "@/lib/application-intelligence/worker";
import { GET as intelligenceWorkerGET } from "@/app/api/cron/intelligence-worker/route";
import { NextRequest } from "next/server";

const ROOT = process.cwd();
const orgId = "11111111-1111-4111-8111-111111111111";
const candId = "22222222-2222-4222-8222-222222222222";
const appId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const snapId = "55555555-5555-4555-8555-555555555555";
const runId = "66666666-6666-4666-8666-666666666666";

function baseRun(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    organizationId: orgId,
    candidateId: candId,
    applicationId: appId,
    jobId,
    snapshotId: snapId,
    requirementSetId: null,
    analysisPurpose: "APPLICATION_INTELLIGENCE",
    sourceDataVersion: "snap:abc|cand:1|mat:m",
    provider: "mock",
    model: "mock-model",
    promptVersion: "provider.boundary.v1",
    schemaVersion: "ai-output.v1",
    scoringVersion: "scoring.v1",
    freshness: "CURRENT",
    attemptCount: 1,
    maxAttempts: 3,
    status: "RUNNING",
    validatedPayload: null,
    snapshot: {
      id: snapId,
      jobId,
      organizationId: orgId,
      contentHash: "a".repeat(64),
      sourceVersionId: `job:${jobId}:jd:aaaaaaaaaaaaaaaa`,
      sourceText: "Required skills: TypeScript and React",
    },
    job: {
      id: jobId,
      organizationId: orgId,
      visibility: "GLOBAL",
      ownerCandidateId: null,
    },
    application: {
      id: appId,
      organizationId: orgId,
      candidateId: candId,
      jobId,
    },
    requirementSet: null,
    ...overrides,
  };
}

describe("Gate 4 — state machine", () => {
  it("allows only valid transitions", () => {
    expect(() => assertValidRunTransition("QUEUED", "RUNNING")).not.toThrow();
    expect(() => assertValidRunTransition("RUNNING", "SUCCEEDED")).not.toThrow();
    expect(() => assertValidRunTransition("RUNNING", "FAILED")).not.toThrow();
    expect(() =>
      assertValidRunTransition("RUNNING", "RETRY_PENDING")
    ).not.toThrow();
    expect(() => assertValidRunTransition("RETRY_PENDING", "QUEUED")).not.toThrow();
    expect(canTransitionRunStatus("QUEUED", "SUCCEEDED")).toBe(false);
    expect(canTransitionRunStatus("SUCCEEDED", "RUNNING")).toBe(false);
    expect(ASYNC_EXECUTION_CONTRACT.allowedStatuses).toContain("RETRY_PENDING");
  });

  it("forbids SSR AI execution", () => {
    expect(() => assertNotSsrAiExecution(true)).toThrow(/SSR/i);
  });
});

describe("Gate 4 — isolation / execution context", () => {
  it("rejects cross-tenant and mismatched chains", () => {
    expect(() =>
      assertAuthorizedExecutionChain(
        baseRun({
          application: {
            id: appId,
            organizationId: "99999999-9999-4999-8999-999999999999",
            candidateId: candId,
            jobId,
          },
        }) as any
      )
    ).toThrow(/Cross-tenant application/i);

    expect(() =>
      assertAuthorizedExecutionChain(
        baseRun({
          application: {
            id: appId,
            organizationId: orgId,
            candidateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            jobId,
          },
        }) as any
      )
    ).toThrow(/candidate mismatch/i);

    expect(() =>
      assertAuthorizedExecutionChain(
        baseRun({
          job: {
            id: jobId,
            organizationId: orgId,
            visibility: "CANDIDATE_PRIVATE",
            ownerCandidateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
        }) as any
      )
    ).toThrow(/Private job/i);
  });

  it("evaluates stale freshness without inventing policy", () => {
    expect(
      evaluateExecutionFreshness({
        runFreshness: "CURRENT",
        requirementSetFreshness: "STALE",
      })
    ).toBe("STALE");
    expect(
      evaluateExecutionFreshness({
        runFreshness: "RECOMPUTE_REQUIRED",
      })
    ).toBe("RECOMPUTE_REQUIRED");
  });
});

describe("Gate 4 — claim + lease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkAiGenerationRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
    });
  });

  it("claims queued runs via SKIP LOCKED raw SQL", async () => {
    queryRaw.mockResolvedValue([
      {
        id: runId,
        organizationId: orgId,
        status: "RUNNING",
        attemptCount: 1,
      },
    ]);
    const claimed = await claimQueuedIntelligenceRuns(1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe("RUNNING");
    expect(queryRaw).toHaveBeenCalled();
  });

  it("requeues retry-pending and reclaims expired leases atomically", async () => {
    executeRaw.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    expect(await requeueRetryPendingRuns(3)).toBe(2);
    const n = await reclaimExpiredLeases(new Date());
    expect(n).toBe(2);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(runFindMany).not.toHaveBeenCalled();
    expect(runUpdate).not.toHaveBeenCalled();
  });
});

describe("Gate 4 — pipeline execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkAiGenerationRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
    });
    mockPersistTx();
    runUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("completes RUNNING → SUCCEEDED with validatedPayload (no alignment scoring)", async () => {
    runUpdate.mockResolvedValue({});
    runFindUnique.mockReset();
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("valid_alignment"),
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(txQueryRaw).toHaveBeenCalled();
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SUCCEEDED",
          validationStatus: "PASSED",
          validatedPayload: expect.objectContaining({ kind: "alignment" }),
        }),
      })
    );
    expect(logSystemAuditEvent).toHaveBeenCalled();
  });

  it("marks schema validation failure as FAILED (non-retryable)", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });
    runUpdateMany.mockResolvedValue({ count: 1 });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("malformed"),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("SCHEMA_VALIDATION_ERROR");
    expect(runUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "RUNNING" }),
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });

  it("marks truth validation failure as FAILED", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });
    runUpdateMany.mockResolvedValue({ count: 1 });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("truth_fail"),
      knownEntityIds: new Set(),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("TRUTH_VALIDATION_ERROR");
  });

  it("schedules RETRY_PENDING on transient timeout", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun({ attemptCount: 1, maxAttempts: 3 }))
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });
    runUpdateMany.mockResolvedValue({ count: 1 });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("timeout"),
    });
    expect(result.status).toBe("RETRY_PENDING");
    expect(result.errorCode).toBe("TIMEOUT");
    expect(runUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RETRY_PENDING" }),
      })
    );
  });

  it("fails permanently when NullAIProvider is used", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });
    runUpdateMany.mockResolvedValue({ count: 1 });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new NullAIProvider(),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("CONFIGURATION_REQUIRED");
  });

  it("is idempotent when already SUCCEEDED with payload", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({
        status: "SUCCEEDED",
        validatedPayload: { kind: "alignment" },
      });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("valid_alignment"),
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(runUpdate).not.toHaveBeenCalled();
  });

  it("respects rate limiting", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });
    runUpdateMany.mockResolvedValue({ count: 1 });
    vi.mocked(checkAiGenerationRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 10,
    });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("valid_alignment"),
    });
    expect(result.status).toBe("RETRY_PENDING");
    expect(result.errorCode).toBe("RATE_LIMITED");
  });
});

describe("Gate 4 — worker + cron security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeRaw.mockResolvedValue(0);
    runFindMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    runUpdateMany.mockResolvedValue({ count: 1 });
    mockPersistTx();
  });

  it("drain worker claims then executes with injected provider", async () => {
    queryRaw.mockResolvedValue([
      { id: runId, organizationId: orgId, status: "RUNNING", attemptCount: 1 },
    ]);
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });
    runUpdate.mockResolvedValue({});

    const result = await drainIntelligenceWorker({
      provider: new MockAIProvider("valid_alignment"),
      batchSize: 1,
    });
    expect(result.claimed).toBe(1);
    expect(result.succeeded).toBe(1);
  });

  it("cron route rejects missing/invalid CRON_SECRET", async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secure-cron-secret-12345";
    const unauthorized = await intelligenceWorkerGET(
      new NextRequest("http://localhost/api/cron/intelligence-worker")
    );
    expect(unauthorized.status).toBe(401);

    const bad = await intelligenceWorkerGET(
      new NextRequest("http://localhost/api/cron/intelligence-worker", {
        headers: { authorization: "Bearer wrong-secret-value-xxxxx" },
      })
    );
    expect(bad.status).toBe(401);

    queryRaw.mockResolvedValue([]);
    const ok = await intelligenceWorkerGET(
      new NextRequest("http://localhost/api/cron/intelligence-worker", {
        headers: { authorization: "Bearer test-secure-cron-secret-12345" },
      })
    );
    expect(ok.status).toBe(200);
    process.env.CRON_SECRET = prev;
  });

  it("strips secrets from audit details", () => {
    const cleaned = sanitizeIntelligenceAuditDetails({
      runId,
      apiKey: "secret",
      authorization: "Bearer x",
      provider: "mock",
    });
    expect(cleaned.apiKey).toBeUndefined();
    expect(cleaned.authorization).toBeUndefined();
    expect(INTELLIGENCE_AUDIT_ACTIONS.aiAnalysisStarted).toBe(
      "APPLICATION_INTELLIGENCE_STARTED"
    );
  });
});

describe("Gate 4 — schema + scope", () => {
  it("adds RETRY_PENDING and execution fields", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("RETRY_PENDING");
    expect(schema).toContain("validatedPayload");
    expect(schema).toContain("leaseExpiresAt");
    expect(schema).toContain("attemptCount");
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261004160000_phase2_gate4_execution_pipeline/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toContain("RETRY_PENDING");
    expect(mig).toContain("validatedPayload");
  });

  it("does not import Nvidia adapter in worker/pipeline domain modules", () => {
    const worker = readFileSync(
      join(ROOT, "src/lib/application-intelligence/worker.ts"),
      "utf8"
    );
    const pipeline = readFileSync(
      join(ROOT, "src/lib/application-intelligence/pipeline.ts"),
      "utf8"
    );
    expect(worker).not.toMatch(/NvidiaDeepSeekAdapter/);
    expect(pipeline).not.toMatch(/NvidiaDeepSeekAdapter/);
    expect(pipeline).toMatch(/resolveConfiguredAIProvider|AIProvider/);
  });

  it("MockAIProvider is deterministic and ProviderError-typed", async () => {
    const mock = new MockAIProvider("timeout");
    await expect(
      mock.analyzeJob({
        kind: "analyze_job",
        organizationId: orgId,
        jobId,
        snapshotId: snapId,
        scopedContext: {},
      })
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
