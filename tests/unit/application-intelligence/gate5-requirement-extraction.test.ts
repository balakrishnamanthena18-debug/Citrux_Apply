import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ANALYSIS_PURPOSE,
  GATE5_EXTRACTION_AUDIT_ALIASES,
  JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
  JOB_REQUIREMENT_SCHEMA_VERSION,
  MockAIProvider,
  NullAIProvider,
  ProviderError,
  REQUIREMENT_EXTRACTION_PROMPT,
  assertAuthorizedExecutionChain,
  assertJobOnlyExtractionContext,
  assertSnapshotIntegrityForExtraction,
  buildExtractionSourceDataVersion,
  buildSnapshotSourceVersionId,
  deduplicateStructuredRequirements,
  hashJobDescriptionContent,
  mapExtractionOutputToStructuredRequirements,
  normalizeRequirementValue,
  postProcessExtractionOutput,
  requestJobRequirementExtraction,
  sanitizeIntelligenceAuditDetails,
} from "@/lib/application-intelligence";
import { JD_FIXTURES } from "./fixtures/jd-requirement-extraction";

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
const runCreate = vi.fn();
const requirementSetCreate = vi.fn();
const snapshotFindFirst = vi.fn();
const jobFindFirst = vi.fn();
const transaction = vi.fn();
const txQueryRaw = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    applicationIntelligenceRun: {
      update: (...args: unknown[]) => runUpdate(...args),
      updateMany: (...args: unknown[]) => runUpdateMany(...args),
      findUnique: (...args: unknown[]) => runFindUnique(...args),
      create: (...args: unknown[]) => runCreate(...args),
    },
    jobRequirementSet: {
      create: (...args: unknown[]) => requirementSetCreate(...args),
    },
    jobDescriptionSnapshot: {
      findFirst: (...args: unknown[]) => snapshotFindFirst(...args),
    },
    job: {
      findFirst: (...args: unknown[]) => jobFindFirst(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

import { checkAiGenerationRateLimit } from "@/lib/security/abuse-protection";
import { logSystemAuditEvent, logUserAuditEvent } from "@/lib/audit";
import { executeIntelligenceRunPipeline } from "@/lib/application-intelligence/pipeline";

const ROOT = process.cwd();
const orgId = "11111111-1111-4111-8111-111111111111";
const orgB = "99999999-9999-4999-8999-999999999999";
const candId = "22222222-2222-4222-8222-222222222222";
const candB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const appId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const snapId = "55555555-5555-4555-8555-555555555555";
const runId = "66666666-6666-4666-8666-666666666666";
const actorId = "77777777-7777-4777-8777-777777777777";
const setId = "88888888-8888-4888-8888-888888888888";

function snapshotFor(text: string) {
  const contentHash = hashJobDescriptionContent(text);
  return {
    id: snapId,
    jobId,
    organizationId: orgId,
    contentHash,
    sourceVersionId: buildSnapshotSourceVersionId(jobId, contentHash),
    sourceText: text,
  };
}

function extractionRun(overrides: Record<string, unknown> = {}) {
  const snap = snapshotFor(JD_FIXTURES.mixedClassifications);
  return {
    id: runId,
    organizationId: orgId,
    candidateId: null,
    applicationId: null,
    jobId,
    snapshotId: snapId,
    requirementSetId: null,
    requestedById: actorId,
    analysisPurpose: ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION,
    sourceDataVersion: buildExtractionSourceDataVersion({
      snapshotContentHash: snap.contentHash,
      promptVersion: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
      schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
      extractionVersion: "extract.v1",
    }),
    provider: "mock",
    model: "mock-model",
    promptVersion: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
    schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
    scoringVersion: "extract.v1",
    freshness: "CURRENT",
    attemptCount: 1,
    maxAttempts: 3,
    status: "RUNNING",
    validatedPayload: null,
    snapshot: snap,
    job: {
      id: jobId,
      organizationId: orgId,
      visibility: "GLOBAL",
      ownerCandidateId: null,
    },
    application: null,
    requirementSet: null,
    ...overrides,
  };
}

describe("Gate 5 — prompt + contract", () => {
  it("uses versioned extraction prompt outside business orchestration", () => {
    expect(REQUIREMENT_EXTRACTION_PROMPT.version).toBe(
      JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION
    );
    expect(REQUIREMENT_EXTRACTION_PROMPT.system).toMatch(/REQUIRED|PREFERRED/i);
    expect(REQUIREMENT_EXTRACTION_PROMPT.system).toMatch(/do not invent/i);
    const user = REQUIREMENT_EXTRACTION_PROMPT.buildUserPayload({
      snapshotId: snapId,
      sourceVersionId: "v",
      contentHash: "h",
      jdText: JD_FIXTURES.requiredSkills,
    });
    expect(user).toContain("JOB_REQUIREMENT_EXTRACTION");
    expect(user).not.toMatch(/candidateId|resume/i);
  });

  it("exposes Gate 5 audit aliases without credentials", () => {
    expect(GATE5_EXTRACTION_AUDIT_ALIASES.requested).toBe(
      "JOB_REQUIREMENT_EXTRACTION_REQUESTED"
    );
    expect(GATE5_EXTRACTION_AUDIT_ALIASES.completed).toBe(
      "JOB_REQUIREMENT_EXTRACTION_COMPLETED"
    );
    const cleaned = sanitizeIntelligenceAuditDetails({
      auditAlias: GATE5_EXTRACTION_AUDIT_ALIASES.started,
      apiKey: "x",
      authorization: "Bearer y",
    });
    expect(cleaned.apiKey).toBeUndefined();
    expect(cleaned.authorization).toBeUndefined();
  });
});

describe("Gate 5 — classification / normalize / dedupe / evidence", () => {
  it("classifies required vs preferred vs needs-review from provider output", () => {
    const text = JD_FIXTURES.mixedClassifications;
    const mapped = postProcessExtractionOutput({
      snapshotId: snapId,
      snapshotText: text,
      output: {
        kind: "requirements",
        requirements: [
          {
            category: "EXPERIENCE",
            value: "5 years of Python",
            importance: "REQUIRED",
            confidence: 0.95,
            sourceEvidence: "Must have 5 years of Python experience",
          },
          {
            category: "PREFERRED_SKILL",
            value: "AWS",
            importance: "PREFERRED",
            confidence: 0.9,
            sourceEvidence: "Preferred: experience with AWS",
          },
          {
            category: "PREFERRED_SKILL",
            value: "Python",
            importance: "PREFERRED",
            confidence: 0.7,
            sourceEvidence: "Python experience would be a plus",
          },
          {
            category: "WORK_AUTHORIZATION",
            value: "unclear authorization",
            importance: "NEEDS_REVIEW",
            confidence: null,
            sourceEvidence: "Work authorization requirements are unclear",
          },
          {
            category: "EDUCATION",
            value: "Bachelor's degree",
            importance: "UNKNOWN",
            confidence: 0.4,
            sourceEvidence: "Bachelor's degree preferred",
          },
        ],
      },
    });
    expect(mapped.some((r) => r.importance === "REQUIRED")).toBe(true);
    expect(mapped.some((r) => r.importance === "PREFERRED")).toBe(true);
    expect(mapped.some((r) => r.importance === "NEEDS_REVIEW")).toBe(true);
    expect(mapped.some((r) => r.importance === "UNKNOWN")).toBe(true);
  });

  it("normalizes with normalize.v1 aliases only", () => {
    expect(normalizeRequirementValue("React.js")).toBe("react");
    expect(normalizeRequirementValue("ReactJS")).toBe("react");
    expect(normalizeRequirementValue("Python programming")).toBe(
      "Python programming"
    );
  });

  it("deduplicates deterministically without LLM merge", () => {
    const text = JD_FIXTURES.duplicates;
    const mapped = mapExtractionOutputToStructuredRequirements({
      snapshotId: snapId,
      snapshotText: text,
      output: {
        kind: "requirements",
        requirements: [
          {
            category: "REQUIRED_SKILL",
            value: "Python",
            importance: "REQUIRED",
            confidence: 0.8,
            sourceEvidence: "Must have Python",
          },
          {
            category: "REQUIRED_SKILL",
            value: "Python",
            importance: "REQUIRED",
            confidence: 0.95,
            sourceEvidence: "Must have Python",
          },
          {
            category: "REQUIRED_SKILL",
            value: "Python programming",
            importance: "REQUIRED",
            confidence: 0.8,
            sourceEvidence: "Python programming experience required",
          },
          {
            category: "PREFERRED_SKILL",
            value: "React.js",
            importance: "PREFERRED",
            confidence: 0.8,
            sourceEvidence: "React.js and ReactJS preferred",
          },
          {
            category: "PREFERRED_SKILL",
            value: "ReactJS",
            importance: "PREFERRED",
            confidence: 0.7,
            sourceEvidence: "React.js and ReactJS preferred",
          },
        ],
      },
    });
    const deduped = deduplicateStructuredRequirements(mapped);
    // Exact Python duplicates collapse; Python programming remains distinct
    expect(
      deduped.filter((r) => r.normalizedValue.toLowerCase() === "python")
    ).toHaveLength(1);
    expect(
      deduped.some((r) => r.normalizedValue === "Python programming")
    ).toBe(true);
    // React.js / ReactJS → react under normalize.v1
    expect(
      deduped.filter(
        (r) =>
          r.normalizedValue === "react" && r.importance === "PREFERRED"
      )
    ).toHaveLength(1);
  });

  it("rejects invalid evidence and unsupported category", () => {
    expect(() =>
      postProcessExtractionOutput({
        snapshotId: snapId,
        snapshotText: JD_FIXTURES.requiredSkills,
        output: {
          kind: "requirements",
          requirements: [
            {
              category: "REQUIRED_SKILL",
              value: "InventedSkill",
              importance: "REQUIRED",
              confidence: 1,
              sourceEvidence: "This excerpt is not in the JD at all",
            },
          ],
        },
      })
    ).toThrow(/Evidence excerpt not found|SCHEMA_VALIDATION/i);

    try {
      postProcessExtractionOutput({
        snapshotId: snapId,
        snapshotText: JD_FIXTURES.requiredSkills,
        output: {
          kind: "requirements",
          requirements: [
            {
              category: "NOT_A_REAL_CATEGORY",
              value: "TypeScript",
              importance: "REQUIRED",
              confidence: 1,
              sourceEvidence: "TypeScript",
            },
          ],
        },
      });
      expect.fail("expected unsupported category to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("SCHEMA_VALIDATION_ERROR");
    }
  });

  it("allows empty requirements array", () => {
    const out = postProcessExtractionOutput({
      snapshotId: snapId,
      snapshotText: JD_FIXTURES.requiredSkills,
      output: { kind: "requirements", requirements: [] },
    });
    expect(out).toEqual([]);
  });

  it("covers representative JD fixtures without candidate PII", () => {
    for (const [key, text] of Object.entries(JD_FIXTURES)) {
      expect(text).not.toMatch(/ssn|passport|real candidate/i);
      if (key === "empty") {
        expect(text.trim()).toBe("");
        continue;
      }
      expect(text.length).toBeGreaterThan(0);
    }
    expect(JD_FIXTURES.large.length).toBeGreaterThan(10_000);
    expect(JD_FIXTURES.unicode).toMatch(/日本語|Café/);
  });
});

describe("Gate 5 — snapshot integrity + job-only context", () => {
  it("verifies snapshot binding and hash before AI", () => {
    const snap = snapshotFor(JD_FIXTURES.global);
    expect(() =>
      assertSnapshotIntegrityForExtraction({
        snapshot: snap,
        expectedJobId: jobId,
        expectedOrganizationId: orgId,
        expectedSnapshotId: snapId,
      })
    ).not.toThrow();

    expect(() =>
      assertSnapshotIntegrityForExtraction({
        snapshot: { ...snap, sourceText: "" },
        expectedJobId: jobId,
        expectedOrganizationId: orgId,
        expectedSnapshotId: snapId,
      })
    ).toThrow(/empty/i);

    expect(() =>
      assertSnapshotIntegrityForExtraction({
        snapshot: { ...snap, contentHash: "0".repeat(64) },
        expectedJobId: jobId,
        expectedOrganizationId: orgId,
        expectedSnapshotId: snapId,
      })
    ).toThrow(/hash is invalid/i);

    expect(() =>
      assertSnapshotIntegrityForExtraction({
        snapshot: { ...snap, organizationId: orgB },
        expectedJobId: jobId,
        expectedOrganizationId: orgId,
        expectedSnapshotId: snapId,
      })
    ).toThrow(/organizationId mismatch/i);
  });

  it("rejects candidate context leakage keys", () => {
    expect(() =>
      assertJobOnlyExtractionContext({
        jdText: "TypeScript",
        candidateId: candId,
      })
    ).toThrow(/candidate context/i);
    expect(() =>
      assertJobOnlyExtractionContext({
        jdText: "TypeScript",
        resume: "secret",
      })
    ).toThrow(/candidate context/i);
    expect(() =>
      assertJobOnlyExtractionContext({
        jdText: "TypeScript",
        snapshotId: snapId,
      })
    ).not.toThrow();
  });

  it("authorizes job-only chain and rejects cross-tenant / private misuse", () => {
    expect(() =>
      assertAuthorizedExecutionChain(extractionRun() as any)
    ).not.toThrow();

    expect(() =>
      assertAuthorizedExecutionChain(
        extractionRun({
          snapshot: {
            ...snapshotFor(JD_FIXTURES.global),
            organizationId: orgB,
          },
        }) as any
      )
    ).toThrow(/Cross-tenant snapshot/i);

    expect(() =>
      assertAuthorizedExecutionChain(
        extractionRun({
          candidateId: candId,
          applicationId: appId,
          application: {
            id: appId,
            organizationId: orgId,
            candidateId: candId,
            jobId,
          },
        }) as any
      )
    ).toThrow(/must not bind candidate/i);

    expect(() =>
      assertAuthorizedExecutionChain(
        extractionRun({
          job: {
            id: jobId,
            organizationId: orgId,
            visibility: "CANDIDATE_PRIVATE",
            ownerCandidateId: candId,
          },
        }) as any
      )
    ).not.toThrow(); // org-privileged worker may extract private job JD

    // Application-scoped private mismatch still denied
    expect(() =>
      assertAuthorizedExecutionChain(
        extractionRun({
          analysisPurpose: ANALYSIS_PURPOSE.APPLICATION_INTELLIGENCE,
          candidateId: candB,
          applicationId: appId,
          application: {
            id: appId,
            organizationId: orgId,
            candidateId: candB,
            jobId,
          },
          job: {
            id: jobId,
            organizationId: orgId,
            visibility: "CANDIDATE_PRIVATE",
            ownerCandidateId: candId,
          },
        }) as any
      )
    ).toThrow(/Private job/i);
  });
});

describe("Gate 5 — request idempotency", () => {
  it("creates extraction request pinned to snapshot and reuses idempotency key", async () => {
    const jd = JD_FIXTURES.global;
    const hash = hashJobDescriptionContent(jd);
    const tx = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: jobId,
          organizationId: orgId,
          jobDescription: jd,
          externalUrl: null,
          source: null,
          updatedAt: new Date(),
          visibility: "GLOBAL",
          ownerCandidateId: null,
        }),
      },
      jobDescriptionSnapshot: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: snapId,
          organizationId: orgId,
          jobId,
          contentHash: hash,
          sourceVersionId: buildSnapshotSourceVersionId(jobId, hash),
        }),
      },
      applicationIntelligenceRun: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: runId,
            status: "QUEUED",
            snapshotId: snapId,
          }),
        create: vi.fn().mockResolvedValue({ id: runId, snapshotId: snapId }),
      },
    } as any;

    const first = await requestJobRequirementExtraction(tx, {
      organizationId: orgId,
      jobId,
      requestedById: actorId,
      provider: "mock",
      model: "mock-model",
    });
    expect(first.created).toBe(true);
    expect(tx.applicationIntelligenceRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analysisPurpose: ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION,
          candidateId: null,
          applicationId: null,
          promptVersion: JOB_REQUIREMENT_EXTRACTION_PROMPT_VERSION,
          schemaVersion: JOB_REQUIREMENT_SCHEMA_VERSION,
        }),
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalled();

    const second = await requestJobRequirementExtraction(tx, {
      organizationId: orgId,
      jobId,
      requestedById: actorId,
      provider: "mock",
      model: "mock-model",
    });
    expect(second.created).toBe(false);
    expect(second.runId).toBe(runId);
  });

  it("refuses empty JD extraction request", async () => {
    const tx = {
      job: {
        findFirst: vi.fn().mockResolvedValue({
          id: jobId,
          organizationId: orgId,
          jobDescription: "",
          updatedAt: new Date(),
          visibility: "GLOBAL",
          ownerCandidateId: null,
        }),
      },
      jobDescriptionSnapshot: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    } as any;

    await expect(
      requestJobRequirementExtraction(tx, {
        organizationId: orgId,
        jobId,
        requestedById: actorId,
      })
    ).rejects.toThrow(/empty/i);
  });

  it("refuses cross-org job", async () => {
    const tx = {
      job: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    await expect(
      requestJobRequirementExtraction(tx, {
        organizationId: orgId,
        jobId,
        requestedById: actorId,
      })
    ).rejects.toThrow(/Job not found/i);
  });
});

describe("Gate 5 — pipeline execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkAiGenerationRateLimit as any).mockResolvedValue({
      allowed: true,
      remaining: 9,
    });
    transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        applicationIntelligenceRun: {
          findUnique: runFindUnique,
          update: runUpdate,
          updateMany: runUpdateMany,
        },
        jobDescriptionSnapshot: {
          findFirst: snapshotFindFirst,
        },
        jobRequirementSet: {
          create: requirementSetCreate,
        },
        $queryRaw: (...args: unknown[]) => txQueryRaw(...args),
      };
      return fn(tx);
    });
    runUpdateMany.mockResolvedValue({ count: 1 });
    txQueryRaw.mockResolvedValue([
      {
        id: runId,
        status: "RUNNING",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        attemptCount: 1,
        maxAttempts: 3,
      },
    ]);
  });

  it("extracts via extractRequirements (not analyzeJob) and persists requirement set", async () => {
    const provider = new MockAIProvider("valid_requirements");
    const extractSpy = vi.spyOn(provider, "extractRequirements");
    const analyzeSpy = vi.spyOn(provider, "analyzeJob");

    runFindUnique
      .mockResolvedValueOnce(extractionRun()) // load context
      .mockResolvedValueOnce({
        status: "RUNNING",
        validatedPayload: null,
        requirementSetId: null,
        analysisPurpose: ANALYSIS_PURPOSE.JOB_REQUIREMENT_EXTRACTION,
      }) // status check
      .mockResolvedValue({
        status: "RUNNING",
        validatedPayload: null,
        requirementSetId: null,
        requestedById: actorId,
      });

    snapshotFindFirst.mockResolvedValue(
      snapshotFor(JD_FIXTURES.mixedClassifications)
    );
    requirementSetCreate.mockResolvedValue({ id: setId });
    runUpdate.mockResolvedValue({});

    const result = await executeIntelligenceRunPipeline(runId, {
      provider,
      actorUserId: actorId,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.requirementSetId).toBe(setId);
    expect(extractSpy).toHaveBeenCalled();
    expect(analyzeSpy).not.toHaveBeenCalled();
    const scoped = extractSpy.mock.calls[0]?.[0]?.scopedContext ?? {};
    expect(scoped).not.toHaveProperty("candidateId");
    expect(scoped).not.toHaveProperty("resume");
    expect(String(scoped.jdText)).toContain("Python");
    expect(requirementSetCreate).toHaveBeenCalled();
    expect(logSystemAuditEvent).toHaveBeenCalled();
  });

  it("marks retryable provider failures as RETRY_PENDING", async () => {
    runFindUnique
      .mockResolvedValueOnce(extractionRun())
      .mockResolvedValueOnce({
        status: "RUNNING",
        validatedPayload: null,
        requirementSetId: null,
      });
    runUpdate.mockResolvedValue({});

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("timeout"),
      actorUserId: actorId,
    });
    expect(result.status).toBe("RETRY_PENDING");
    expect(result.errorCode).toBe("TIMEOUT");
  });

  it("terminals malformed provider responses without endless retry", async () => {
    runFindUnique
      .mockResolvedValueOnce(extractionRun())
      .mockResolvedValueOnce({
        status: "RUNNING",
        validatedPayload: null,
        requirementSetId: null,
      });
    runUpdate.mockResolvedValue({});

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("malformed"),
      actorUserId: actorId,
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("SCHEMA_VALIDATION_ERROR");
  });

  it("fails safely on invalid snapshot hash before provider call", async () => {
    const bad = extractionRun({
      snapshot: {
        ...snapshotFor(JD_FIXTURES.global),
        contentHash: "f".repeat(64),
      },
    });
    runFindUnique.mockResolvedValueOnce(bad);
    runUpdate.mockResolvedValue({});

    const provider = new MockAIProvider("valid_requirements");
    const spy = vi.spyOn(provider, "extractRequirements");
    const result = await executeIntelligenceRunPipeline(runId, {
      provider,
      actorUserId: actorId,
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("PERMANENT_CLIENT_ERROR");
    expect(spy).not.toHaveBeenCalled();
  });

  it("stale freshness stamps result without rebinding snapshot", async () => {
    const provider = new MockAIProvider("valid_requirements");
    runFindUnique
      .mockResolvedValueOnce(
        extractionRun({
          freshness: "STALE",
          snapshot: snapshotFor(JD_FIXTURES.mixedClassifications),
        })
      )
      .mockResolvedValueOnce({
        status: "RUNNING",
        validatedPayload: null,
        requirementSetId: null,
      })
      .mockResolvedValue({
        status: "RUNNING",
        requestedById: actorId,
      });
    snapshotFindFirst.mockResolvedValue(
      snapshotFor(JD_FIXTURES.mixedClassifications)
    );
    requirementSetCreate.mockResolvedValue({ id: setId });
    runUpdate.mockResolvedValue({});

    const result = await executeIntelligenceRunPipeline(runId, {
      provider,
      actorUserId: actorId,
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          freshness: "STALE",
          requirementSetId: setId,
        }),
      })
    );
  });

  it("NullAIProvider remains non-network for extraction", async () => {
    await expect(
      new NullAIProvider().extractRequirements({
        kind: "extract_requirements",
        organizationId: orgId,
        jobId,
        snapshotId: snapId,
        scopedContext: { jdText: JD_FIXTURES.global },
      })
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("rate limiting surfaces as retryable RATE_LIMITED", async () => {
    (checkAiGenerationRateLimit as any).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 30,
    });
    runFindUnique
      .mockResolvedValueOnce(extractionRun())
      .mockResolvedValueOnce({
        status: "RUNNING",
        validatedPayload: null,
        requirementSetId: null,
      });
    runUpdate.mockResolvedValue({});

    const result = await executeIntelligenceRunPipeline(runId, {
      provider: new MockAIProvider("valid_requirements"),
      actorUserId: actorId,
    });
    expect(result.status).toBe("RETRY_PENDING");
    expect(result.errorCode).toBe("RATE_LIMITED");
  });
});

describe("Gate 5 — schema discipline", () => {
  it("adds analysisPurpose and nullable candidate/application only", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("analysisPurpose");
    expect(schema).toMatch(/candidateId\s+String\?/);
    expect(schema).toMatch(/applicationId\s+String\?/);
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261004170000_phase2_gate5_requirement_extraction/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toContain("analysisPurpose");
    expect(mig).toContain('ALTER COLUMN "candidateId" DROP NOT NULL');
  });

  it("pipeline never imports NvidiaDeepSeekAdapter directly", () => {
    const pipeline = readFileSync(
      join(ROOT, "src/lib/application-intelligence/pipeline.ts"),
      "utf8"
    );
    const extraction = readFileSync(
      join(ROOT, "src/lib/application-intelligence/extraction.ts"),
      "utf8"
    );
    expect(pipeline).not.toMatch(/NvidiaDeepSeekAdapter/);
    expect(extraction).not.toMatch(/NvidiaDeepSeekAdapter/);
    expect(pipeline).toMatch(/extractRequirements/);
    expect(pipeline).not.toMatch(/analyzeCandidateFit/);
    // Gate 6 may persist overallScore on the alignment branch; Gate 5 extraction must not.
    expect(extraction).not.toMatch(/overallScore|AlignmentResult|ReadinessResult/);
  });
});
