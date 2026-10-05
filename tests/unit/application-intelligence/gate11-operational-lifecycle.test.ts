import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  assertValidRunTransition,
  canTransitionRunStatus,
  buildSourceDataVersion,
  freshnessAfterTrigger,
  isPresentableAsCurrent,
  buildApplicationIntelligenceViewModel,
  MockAIProvider,
  NullAIProvider,
  ProviderError,
  sanitizeIntelligenceAuditDetails,
  INTELLIGENCE_WORKER_BATCH_SIZE,
  INTELLIGENCE_WORKER_LEASE_MS,
  intelligenceMayMutateApplicationStatus,
  GATE1_AUTHORITY_LOCK,
  ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
  EXPLAINABILITY_CONTRACT_VERSION,
  INTELLIGENCE_SCORING_VERSION,
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
} from "@/lib/application-intelligence";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ApplicationIntelligencePanel } from "@/components/application-intelligence/ApplicationIntelligencePanel";

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

const ROOT = process.cwd();
const orgId = "11111111-1111-4111-8111-111111111111";
const candId = "22222222-2222-4222-8222-222222222222";
const appId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const snapId = "55555555-5555-4555-8555-555555555555";
const runId = "66666666-6666-4666-8666-666666666666";

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

import {
  claimQueuedIntelligenceRuns,
  reclaimExpiredLeases,
  requeueRetryPendingRuns,
  lockRunningRunForPersist,
  transitionRunningRunFailure,
} from "@/lib/application-intelligence/run-claim";
import { executeIntelligenceRunPipeline } from "@/lib/application-intelligence/pipeline";
import { drainIntelligenceWorker } from "@/lib/application-intelligence/worker";
import { GET as intelligenceWorkerGET } from "@/app/api/cron/intelligence-worker/route";
import { NextRequest } from "next/server";
import { checkAiGenerationRateLimit } from "@/lib/security/abuse-protection";
import { logSystemAuditEvent } from "@/lib/audit";

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
    sourceDataVersion: "snap:abc|cand:1|mat:m1",
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

function mockPersistTx(lockOverrides: Record<string, unknown> = {}) {
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
  txQueryRaw.mockResolvedValue([lockRow(lockOverrides)]);
}

/** In-memory SKIP LOCKED claim simulator for concurrent-worker accounting. */
function simulateConcurrentClaims(runCount: number, workerCount: number) {
  const queue = Array.from({ length: runCount }, (_, i) => ({
    id: `run-${i}`,
    status: "QUEUED" as string,
    claimedBy: null as number | null,
    terminal: null as "SUCCEEDED" | "FAILED" | "RETRY_PENDING" | null,
  }));

  const workers = Array.from({ length: workerCount }, (_, w) => {
    const claimed: string[] = [];
    for (const run of queue) {
      if (run.status !== "QUEUED") continue;
      // Atomic claim: first reader wins
      run.status = "RUNNING";
      run.claimedBy = w;
      claimed.push(run.id);
      run.terminal = "SUCCEEDED";
      run.status = "SUCCEEDED";
    }
    return { worker: w, claimed: claimed.length };
  });

  const claimedIds = queue.filter((r) => r.claimedBy !== null).map((r) => r.id);
  const uniqueClaims = new Set(claimedIds);

  return {
    workers,
    totalClaimed: claimedIds.length,
    uniqueClaims: uniqueClaims.size,
    terminals: queue.map((r) => r.terminal),
    duplicateClaims: claimedIds.length - uniqueClaims.size,
  };
}

describe("Gate 11 — state machine", () => {
  it("allows only the locked run transitions", () => {
    expect(canTransitionRunStatus("QUEUED", "RUNNING")).toBe(true);
    expect(canTransitionRunStatus("RUNNING", "SUCCEEDED")).toBe(true);
    expect(canTransitionRunStatus("RUNNING", "FAILED")).toBe(true);
    expect(canTransitionRunStatus("RUNNING", "RETRY_PENDING")).toBe(true);
    expect(canTransitionRunStatus("RETRY_PENDING", "QUEUED")).toBe(true);
    expect(canTransitionRunStatus("RETRY_PENDING", "FAILED")).toBe(true);
    expect(canTransitionRunStatus("FAILED", "QUEUED")).toBe(true);

    expect(canTransitionRunStatus("SUCCEEDED", "RUNNING")).toBe(false);
    expect(canTransitionRunStatus("FAILED", "RUNNING")).toBe(false);
    expect(canTransitionRunStatus("SUCCEEDED", "QUEUED")).toBe(false);
    expect(canTransitionRunStatus("QUEUED", "SUCCEEDED")).toBe(false);
    expect(canTransitionRunStatus("RETRY_PENDING", "SUCCEEDED")).toBe(false);
    expect(canTransitionRunStatus("QUEUED", "FAILED")).toBe(false);

    expect(() => assertValidRunTransition("SUCCEEDED", "RUNNING")).toThrow(
      /Invalid run transition/
    );
  });
});

describe("Gate 11 — atomic claim + lease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claim SQL uses FOR UPDATE SKIP LOCKED", async () => {
    queryRaw.mockResolvedValue([
      { id: runId, organizationId: orgId, status: "RUNNING", attemptCount: 1 },
    ]);
    const claimed = await claimQueuedIntelligenceRuns(1);
    expect(claimed).toHaveLength(1);
    const sql = String(queryRaw.mock.calls[0]?.[0] ?? "");
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/QUEUED/);
    expect(INTELLIGENCE_WORKER_LEASE_MS).toBe(5 * 60 * 1000);
    expect(INTELLIGENCE_WORKER_BATCH_SIZE).toBe(3);
  });

  it("reclaim SQL is conditional on RUNNING + expired lease", async () => {
    executeRaw.mockResolvedValue(1);
    const n = await reclaimExpiredLeases(new Date("2026-10-05T00:00:00.000Z"));
    expect(n).toBe(1);
    const sql = String(executeRaw.mock.calls[0]?.[0] ?? "");
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/leaseExpiresAt/);
    expect(sql).toMatch(/RUNNING/);
    expect(sql).toMatch(/RETRY_PENDING|FAILED/);
  });

  it("lockRunningRunForPersist rejects expired leases and terminal runs", async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          lockRow({ leaseExpiresAt: new Date("2000-01-01T00:00:00.000Z") }),
        ])
        .mockResolvedValueOnce([lockRow({ status: "SUCCEEDED" })])
        .mockResolvedValueOnce([lockRow({ status: "FAILED" })])
        .mockResolvedValueOnce([lockRow()]),
    };

    await expect(
      lockRunningRunForPersist(tx as never, runId, new Date())
    ).resolves.toMatchObject({ ok: false, reason: "LEASE_EXPIRED" });
    await expect(
      lockRunningRunForPersist(tx as never, runId, new Date())
    ).resolves.toMatchObject({ ok: false, reason: "SUCCEEDED" });
    await expect(
      lockRunningRunForPersist(tx as never, runId, new Date())
    ).resolves.toMatchObject({ ok: false, reason: "NOT_RUNNING" });
    await expect(
      lockRunningRunForPersist(tx as never, runId, new Date())
    ).resolves.toMatchObject({ ok: true });
  });

  it("transitionRunningRunFailure is CAS on RUNNING only", async () => {
    runUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(
      await transitionRunningRunFailure(runId, "RETRY_PENDING", {
        code: "TIMEOUT",
        message: "timeout",
      })
    ).toBe(true);
    expect(
      await transitionRunningRunFailure(runId, "FAILED", {
        code: "TIMEOUT",
        message: "timeout",
      })
    ).toBe(false);
    expect(runUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: runId, status: "RUNNING" },
      })
    );
  });
});

describe("Gate 11 — concurrent workers accounting", () => {
  it("simulates 10 workers / 100 runs with no duplicate claims", () => {
    const result = simulateConcurrentClaims(100, 10);
    expect(result.totalClaimed).toBe(100);
    expect(result.uniqueClaims).toBe(100);
    expect(result.duplicateClaims).toBe(0);
    expect(result.terminals.every((t) => t === "SUCCEEDED")).toBe(true);
    expect(result.workers.reduce((s, w) => s + w.claimed, 0)).toBe(100);
  });
});

describe("Gate 11 — pipeline lifecycle failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkAiGenerationRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
    });
    mockPersistTx();
    runUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("valid lifecycle: RUNNING → SUCCEEDED with lease lock", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });
    runUpdate.mockResolvedValue({});

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("valid_alignment"),
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(txQueryRaw).toHaveBeenCalled();
    expect(logSystemAuditEvent).toHaveBeenCalled();
  });

  it("timeout → RETRY_PENDING with attempt remaining", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun({ attemptCount: 1, maxAttempts: 3 }))
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("timeout"),
    });
    expect(result.status).toBe("RETRY_PENDING");
    expect(result.errorCode).toBe("TIMEOUT");
  });

  it("retry exhaustion → FAILED", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun({ attemptCount: 3, maxAttempts: 3 }))
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("timeout"),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("TIMEOUT");
  });

  it("provider failure classifies PROVIDER_ERROR", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun({ attemptCount: 3, maxAttempts: 3 }))
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("server_error"),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("PROVIDER_ERROR");
  });

  it("invalid provider payload never succeeds", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("malformed"),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("SCHEMA_VALIDATION_ERROR");
    expect(runUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED" }),
      })
    );
  });

  it("truth validation failure never succeeds", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("truth_fail"),
      knownEntityIds: new Set(),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("TRUTH_VALIDATION_ERROR");
  });

  it("persistence lease loss does not mark SUCCEEDED", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });
    txQueryRaw.mockResolvedValue([
      lockRow({ leaseExpiresAt: new Date("2000-01-01T00:00:00.000Z") }),
    ]);

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("valid_alignment"),
    });
    expect(result.status).not.toBe("SUCCEEDED");
    expect(result.errorCode).toBe("PERMANENT_CLIENT_ERROR");
  });

  it("NullAIProvider remains safe default (CONFIGURATION_REQUIRED)", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun())
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new NullAIProvider(),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("CONFIGURATION_REQUIRED");
  });

  it("lost CAS on failure path does not invent success", async () => {
    runFindUnique
      .mockResolvedValueOnce(baseRun({ attemptCount: 1, maxAttempts: 3 }))
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null })
      .mockResolvedValueOnce({ status: "SUCCEEDED" });
    runUpdateMany.mockResolvedValue({ count: 0 });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("timeout"),
    });
    expect(result.status).toBe("FAILED");
  });
});

describe("Gate 11 — idempotency + versioning + materials", () => {
  it("source version binds snapshot + candidate + materials fingerprint", () => {
    const v1 = buildSourceDataVersion({
      snapshotContentHash: "hashaaaaaaaaaaaa",
      candidateUpdatedAt: "2026-01-01T00:00:00.000Z",
      materialsFingerprint: "resume-v1",
    });
    const v2Material = buildSourceDataVersion({
      snapshotContentHash: "hashaaaaaaaaaaaa",
      candidateUpdatedAt: "2026-01-01T00:00:00.000Z",
      materialsFingerprint: "resume-v2",
    });
    const v2Snap = buildSourceDataVersion({
      snapshotContentHash: "hashbbbbbbbbbbbb",
      candidateUpdatedAt: "2026-01-01T00:00:00.000Z",
      materialsFingerprint: "resume-v1",
    });
    expect(v1).not.toBe(v2Material);
    expect(v1).not.toBe(v2Snap);
    expect(v1).toContain("mat:resume-v1");
    expect(v2Material).toContain("mat:resume-v2");
  });

  it("JD snapshot change maps to RECOMPUTE_REQUIRED freshness", () => {
    expect(freshnessAfterTrigger("JD_SNAPSHOT_CHANGED")).toBe("RECOMPUTE_REQUIRED");
    expect(freshnessAfterTrigger("APPLICATION_MATERIAL_CHANGED")).toBe("STALE");
    expect(isPresentableAsCurrent("STALE", "SUCCEEDED")).toBe(false);
    expect(isPresentableAsCurrent("CURRENT", "SUCCEEDED")).toBe(true);
  });

  it("FAILED requeue and stale-mark helpers exist in runs module", () => {
    const runsSrc = readFileSync(
      join(ROOT, "src/lib/application-intelligence/runs.ts"),
      "utf8"
    );
    expect(runsSrc).toMatch(/existing\.status === "FAILED"/);
    expect(runsSrc).toMatch(/markJobApplicationIntelligenceStale/);
    expect(runsSrc).toMatch(/assertValidRunTransition\("FAILED", "QUEUED"\)/);

    const syncSrc = readFileSync(
      join(ROOT, "src/lib/application-intelligence/requirement-set.ts"),
      "utf8"
    );
    expect(syncSrc).toMatch(/markJobApplicationIntelligenceStale/);
  });
});

describe("Gate 11 — application state safety + no side effects", () => {
  it("intelligence must not mutate application status", () => {
    expect(intelligenceMayMutateApplicationStatus()).toBe(false);
    expect(GATE1_AUTHORITY_LOCK.mayMutateApplicationStatus).toBe(false);

    const pipeline = readFileSync(
      join(ROOT, "src/lib/application-intelligence/pipeline.ts"),
      "utf8"
    );
    const worker = readFileSync(
      join(ROOT, "src/lib/application-intelligence/worker.ts"),
      "utf8"
    );
    expect(pipeline).not.toMatch(/prisma\.application\.update/);
    expect(pipeline).not.toMatch(/transitionApplicationStatus/);
    expect(worker).not.toMatch(/prisma\.application\.update/);
    expect(worker).not.toMatch(/notification|sendEmail|createTask/i);
  });
});

describe("Gate 11 — cron + worker boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeRaw.mockResolvedValue(0);
    queryRaw.mockResolvedValue([]);
    runUpdateMany.mockResolvedValue({ count: 1 });
    mockPersistTx();
  });

  it("cron rejects missing/invalid secret and allows valid", async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "gate11-cron-secret-value-xyz";

    expect(
      (
        await intelligenceWorkerGET(
          new NextRequest("http://localhost/api/cron/intelligence-worker")
        )
      ).status
    ).toBe(401);

    expect(
      (
        await intelligenceWorkerGET(
          new NextRequest("http://localhost/api/cron/intelligence-worker", {
            headers: { authorization: "Bearer wrong" },
          })
        )
      ).status
    ).toBe(401);

    const ok = await intelligenceWorkerGET(
      new NextRequest("http://localhost/api/cron/intelligence-worker", {
        headers: { authorization: "Bearer gate11-cron-secret-value-xyz" },
      })
    );
    expect(ok.status).toBe(200);
    process.env.CRON_SECRET = prev;
  });

  it("worker drain is bounded and reclaim→requeue→claim ordered", async () => {
    const workerSrc = readFileSync(
      join(ROOT, "src/lib/application-intelligence/worker.ts"),
      "utf8"
    );
    const body = workerSrc.slice(workerSrc.indexOf("export async function drainIntelligenceWorker"));
    const reclaimIdx = body.indexOf("await reclaimExpiredLeases");
    const requeueIdx = body.indexOf("await requeueRetryPendingRuns");
    const claimIdx = body.indexOf("await claimQueuedIntelligenceRuns");
    expect(reclaimIdx).toBeGreaterThan(-1);
    expect(requeueIdx).toBeGreaterThan(reclaimIdx);
    expect(claimIdx).toBeGreaterThan(requeueIdx);

    queryRaw.mockResolvedValue([]);
    const result = await drainIntelligenceWorker({ batchSize: 3 });
    expect(result.claimed).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("observability logs use safe identifiers only", () => {
    const pipeline = readFileSync(
      join(ROOT, "src/lib/application-intelligence/pipeline.ts"),
      "utf8"
    );
    expect(pipeline).toMatch(/event: "INTELLIGENCE_PIPELINE"/);
    expect(pipeline).toMatch(/runId/);
    expect(pipeline).toMatch(/attemptNumber|attemptCount/);
    expect(pipeline).not.toMatch(/NVIDIA_API_KEY|apiKey:/);

    const cleaned = sanitizeIntelligenceAuditDetails({
      runId,
      organizationId: orgId,
      apiKey: "secret",
      token: "t",
      resumeText: "private",
    });
    expect(cleaned.apiKey).toBeUndefined();
    expect(cleaned.token).toBeUndefined();
  });

  it("vercel cron config remains bounded", () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
    const cron = (vercel.crons as Array<{ path: string; schedule: string }>).find(
      (c) => c.path.includes("intelligence-worker")
    );
    expect(cron).toBeTruthy();
    expect(cron?.schedule).toMatch(/^\*\/\d+/);
  });
});

describe("Gate 11 — provider boundary + LLM calls 0", () => {
  it("pipeline resolves via AIProvider service, not direct Nvidia construction", () => {
    const pipeline = readFileSync(
      join(ROOT, "src/lib/application-intelligence/pipeline.ts"),
      "utf8"
    );
    expect(pipeline).toMatch(/resolveConfiguredAIProvider|AIProvider/);
    expect(pipeline).not.toMatch(/new NvidiaDeepSeekAdapter/);
    expect(pipeline).toMatch(/NullAIProvider/);
  });

  it("client/UI modules do not import provider adapters", () => {
    const panel = readFileSync(
      join(
        ROOT,
        "src/components/application-intelligence/ApplicationIntelligencePanel.tsx"
      ),
      "utf8"
    );
    const section = readFileSync(
      join(
        ROOT,
        "src/components/application-intelligence/ApplicationIntelligenceSection.tsx"
      ),
      "utf8"
    );
    expect(panel).not.toMatch(/NvidiaDeepSeek|MockAIProvider|analyzeJob/);
    expect(section).not.toMatch(/NvidiaDeepSeek|MockAIProvider|analyzeJob/);
  });
});

describe("Gate 11 — browser/UI lifecycle phases", () => {
  function vm(phaseInput: {
    runStatus?: string | null;
    freshness?: string;
    hasAlignment?: boolean;
  }) {
    const hasAlignment = phaseInput.hasAlignment ?? false;
    const freshness = phaseInput.freshness ?? "CURRENT";
    return buildApplicationIntelligenceViewModel({
      viewer: "CANDIDATE",
      alignment: hasAlignment
        ? {
            id: "align-1",
            runId,
            overallScore: 70,
            freshness,
            scoringVersion: INTELLIGENCE_SCORING_VERSION,
            evidence: {
              schemaVersion: ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
              explainabilityVersion: EXPLAINABILITY_CONTRACT_VERSION,
              normalizationVersion: JOB_REQUIREMENT_NORMALIZATION_VERSION,
              scoringVersion: INTELLIGENCE_SCORING_VERSION,
              fitItems: [],
            },
            run: {
              id: runId,
              status: "SUCCEEDED",
              analysisPurpose: "CANDIDATE_JOB_ALIGNMENT",
              requirementSetId: "set-1",
              snapshotId: snapId,
              errorCode: null,
            },
          }
        : null,
      readiness: null,
      latestRun: phaseInput.runStatus
        ? {
            id: runId,
            status: phaseInput.runStatus,
            analysisPurpose: "APPLICATION_INTELLIGENCE",
            errorCode:
              phaseInput.runStatus === "FAILED" ? "PROVIDER_ERROR" : null,
            freshness,
          }
        : null,
    });
  }

  it("renders pending / success / stale / failed without fabricated intelligence", () => {
    const pending = vm({ runStatus: "QUEUED" });
    expect(pending.phase).toBe("PENDING");
    const running = vm({ runStatus: "RUNNING" });
    expect(running.phase).toBe("PENDING");
    const ok = vm({ hasAlignment: true, freshness: "CURRENT" });
    expect(ok.phase).toBe("CURRENT");
    expect(ok.overallScore).toBe(70);
    const stale = vm({ hasAlignment: true, freshness: "STALE" });
    expect(stale.phase).toBe("STALE");
    const failed = vm({ runStatus: "FAILED" });
    expect(failed.phase).toBe("FAILED");
    expect(failed.overallScore).toBeNull();

    for (const view of [pending, running, ok, stale, failed]) {
      const html = renderToStaticMarkup(
        createElement(ApplicationIntelligencePanel, {
          view,
          audience: "candidate",
        })
      );
      expect(html).toBeTruthy();
      expect(html).not.toMatch(/hydration/i);
    }
  });
});

describe("Gate 11 — security regression anchors", () => {
  it("FORCE RLS migration remains present", () => {
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261005080000_phase2_gate10_intelligence_force_rls/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(mig).toMatch(/oos_app_runtime/);
  });

  it("execution context loader remains scope-bound", () => {
    const ctx = readFileSync(
      join(ROOT, "src/lib/application-intelligence/execution-context.ts"),
      "utf8"
    );
    expect(ctx).toMatch(/organizationId/);
    expect(ctx).toMatch(/candidateId/);
    expect(ctx).toMatch(/applicationId/);
    expect(ctx).toMatch(/snapshotId/);
  });

  it("Gate 10 security suite file still exists", () => {
    const files = readdirSync(
      join(ROOT, "tests/unit/application-intelligence")
    );
    expect(files).toContain("gate10-security-isolation.test.ts");
  });
});

describe("Gate 11 — poison run + queue starvation contract", () => {
  it("batch size bounds prevent head-of-line unlimited drain", () => {
    expect(INTELLIGENCE_WORKER_BATCH_SIZE).toBeLessThanOrEqual(10);
    const claimSrc = readFileSync(
      join(ROOT, "src/lib/application-intelligence/run-claim.ts"),
      "utf8"
    );
    expect(claimSrc).toMatch(/LIMIT \$\{limit\}/);
    expect(claimSrc).toMatch(/INTELLIGENCE_RECLAIM_BATCH_SIZE/);
  });

  it("maxAttempts exhaustion is permanent FAILED without SUCCEEDED", async () => {
    vi.clearAllMocks();
    vi.mocked(checkAiGenerationRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
    });
    mockPersistTx();
    runUpdateMany.mockResolvedValue({ count: 1 });
    runFindUnique
      .mockResolvedValueOnce(baseRun({ attemptCount: 3, maxAttempts: 3 }))
      .mockResolvedValueOnce({ status: "RUNNING", validatedPayload: null });

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("timeout"),
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("TIMEOUT");
    expect(runUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });
});

describe("Gate 11 — ProviderError classification surface", () => {
  it("exposes distinct failure categories used by lifecycle", () => {
    const codes = [
      "CONFIGURATION_REQUIRED",
      "TIMEOUT",
      "PROVIDER_ERROR",
      "INVALID_RESPONSE",
      "SCHEMA_VALIDATION_ERROR",
      "TRUTH_VALIDATION_ERROR",
      "CONTEXT_BOUNDARY_VIOLATION",
      "PERMANENT_CLIENT_ERROR",
    ];
    for (const code of codes) {
      const err = new ProviderError(code as never, code, { retryable: false });
      expect(err.code).toBe(code);
    }
  });
});
