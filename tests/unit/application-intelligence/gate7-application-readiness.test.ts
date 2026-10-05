import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ANALYSIS_PURPOSE,
  GATE7_READINESS_AUDIT_ALIASES,
  INTELLIGENCE_READINESS_VERSION,
  MockAIProvider,
  READINESS_STATES,
  computeDeterministicReadiness,
  requestApplicationReadiness,
} from "@/lib/application-intelligence";
import {
  R7_ALIGN,
  R7_APP,
  R7_CAND,
  R7_JOB,
  R7_ORG,
  R7_SET,
  R7_SNAP,
  baseReadinessInput,
  fit,
} from "./fixtures/application-readiness";

vi.mock("@/lib/audit", () => ({
  logSystemAuditEvent: vi.fn().mockResolvedValue(undefined),
  logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), security: vi.fn() },
}));

const runUpdate = vi.fn();
const runUpdateMany = vi.fn();
const runFindUnique = vi.fn();
const readinessCreate = vi.fn();
const transaction = vi.fn();
const txQueryRaw = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    applicationIntelligenceRun: {
      update: (...a: unknown[]) => runUpdate(...a),
      updateMany: (...a: unknown[]) => runUpdateMany(...a),
      findUnique: (...a: unknown[]) => runFindUnique(...a),
    },
    application: { findFirst: vi.fn() },
    applicationAlignmentResult: { findFirst: vi.fn() },
    jobRequirementSet: { findFirst: vi.fn() },
    applicationReadinessResult: {
      create: (...a: unknown[]) => readinessCreate(...a),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

import { logUserAuditEvent } from "@/lib/audit";
import { executeIntelligenceRunPipeline } from "@/lib/application-intelligence/pipeline";
import { loadReadinessInputView } from "@/lib/application-intelligence/readiness";
import { prisma } from "@/lib/db/prisma";

const ROOT = process.cwd();
const runId = "66666666-6666-4666-8666-666666666666";
const actorId = "77777777-7777-4777-8777-777777777777";
const readinessId = "r1111111-1111-4111-8111-111111111111";

describe("Gate 7 — readiness.v1 contract", () => {
  it("reuses locked readiness states and version", () => {
    expect(READINESS_STATES).toEqual([
      "READY",
      "READY_WITH_WARNINGS",
      "REVIEW_REQUIRED",
      "BLOCKED",
      "UNKNOWN",
    ]);
    expect(INTELLIGENCE_READINESS_VERSION).toBe("readiness.v1");
    expect(GATE7_READINESS_AUDIT_ALIASES.requested).toBe("READINESS_REQUESTED");
  });
});

describe("Gate 7 — deterministic evaluation", () => {
  it("returns READY for fully satisfied inputs", () => {
    const a = computeDeterministicReadiness(baseReadinessInput());
    const b = computeDeterministicReadiness(baseReadinessInput());
    expect(a).toEqual(b);
    expect(a.readinessState).toBe("READY");
    expect(a.blockers).toHaveLength(0);
    expect(a.evidence.llmCalls).toBe(0);
    expect(a.readinessVersion).toBe("readiness.v1");
  });

  it("READY_WITH_WARNINGS for preferred gaps / partial required", () => {
    const preferred = computeDeterministicReadiness(
      baseReadinessInput({
        alignment: {
          ...baseReadinessInput().alignment,
          fitItems: [
            fit({
              category: "REQUIRED_SKILL",
              requirementValue: "TypeScript",
              importance: "REQUIRED",
              status: "MATCHED",
            }),
            fit({
              category: "PREFERRED_SKILL",
              requirementValue: "AWS",
              importance: "PREFERRED",
              status: "MISSING",
            }),
          ],
        },
      })
    );
    expect(preferred.readinessState).toBe("READY_WITH_WARNINGS");
    expect(preferred.warnings.some((w) => w.code === "PREFERRED_REQUIREMENT_GAP")).toBe(
      true
    );

    const partial = computeDeterministicReadiness(
      baseReadinessInput({
        alignment: {
          ...baseReadinessInput().alignment,
          fitItems: [
            fit({
              category: "EXPERIENCE",
              requirementValue: "10 years",
              importance: "REQUIRED",
              status: "PARTIAL",
              dimension: "experience",
            }),
          ],
        },
      })
    );
    expect(partial.readinessState).toBe("READY_WITH_WARNINGS");
    expect(
      partial.warnings.some((w) => w.code === "REQUIRED_REQUIREMENT_PARTIAL")
    ).toBe(true);
  });

  it("BLOCKED for required mismatch, missing resume, QA fail", () => {
    const mismatch = computeDeterministicReadiness(
      baseReadinessInput({
        alignment: {
          ...baseReadinessInput().alignment,
          fitItems: [
            fit({
              category: "REQUIRED_SKILL",
              requirementValue: "COBOL",
              importance: "REQUIRED",
              status: "MISSING",
            }),
          ],
        },
      })
    );
    expect(mismatch.readinessState).toBe("BLOCKED");
    expect(
      mismatch.blockers.some((b) => b.code === "REQUIRED_REQUIREMENT_MISMATCH")
    ).toBe(true);

    const noResume = computeDeterministicReadiness(
      baseReadinessInput({ material: null })
    );
    expect(noResume.readinessState).toBe("BLOCKED");
    expect(noResume.blockers.some((b) => b.code === "MISSING_RESUME")).toBe(true);

    const wrongVersion = computeDeterministicReadiness(
      baseReadinessInput({
        material: {
          ...baseReadinessInput().material!,
          documentVersion: 1,
          documentVersionNumber: 2,
        },
      })
    );
    expect(wrongVersion.blockers.some((b) => b.code === "WRONG_RESUME_VERSION")).toBe(
      true
    );

    const qaFail = computeDeterministicReadiness(
      baseReadinessInput({
        qa: { id: "q", decision: "FAIL", verifiedCount: 3, criterionCount: 9 },
      })
    );
    expect(qaFail.blockers.some((b) => b.code === "QA_FAILED")).toBe(true);
  });

  it("UNKNOWN for required unknown / stale alignment (not converted to MATCH)", () => {
    const unknownReq = computeDeterministicReadiness(
      baseReadinessInput({
        alignment: {
          ...baseReadinessInput().alignment,
          fitItems: [
            fit({
              category: "REQUIRED_SKILL",
              requirementValue: "Rust",
              importance: "REQUIRED",
              status: "UNKNOWN",
            }),
          ],
        },
      })
    );
    expect(unknownReq.readinessState).toBe("UNKNOWN");
    expect(
      unknownReq.unknowns.some((u) => u.code === "REQUIRED_REQUIREMENT_UNKNOWN")
    ).toBe(true);

    const stale = computeDeterministicReadiness(
      baseReadinessInput({
        alignment: {
          ...baseReadinessInput().alignment,
          freshness: "STALE",
          fitItems: [
            fit({
              category: "REQUIRED_SKILL",
              requirementValue: "TypeScript",
              importance: "REQUIRED",
              status: "MATCHED",
            }),
          ],
        },
      })
    );
    expect(stale.readinessState).toBe("UNKNOWN");
    expect(stale.unknowns.some((u) => u.code === "STALE_ALIGNMENT")).toBe(true);
  });

  it("REVIEW_REQUIRED for missing candidate approval modes", () => {
    const reviewMode = computeDeterministicReadiness(
      baseReadinessInput({
        authorizationMode: "REVIEW_REQUIRED",
        approvalStatus: "PENDING",
        applicationStatus: "AWAITING_APPROVAL",
      })
    );
    expect(reviewMode.readinessState).toBe("REVIEW_REQUIRED");
    expect(reviewMode.blockers.some((b) => b.code === "MISSING_APPROVAL")).toBe(
      true
    );
    expect(
      reviewMode.nextActions.some((a) => a.code === "REQUEST_CANDIDATE_APPROVAL")
    ).toBe(true);

    const managedAwaiting = computeDeterministicReadiness(
      baseReadinessInput({
        authorizationMode: "MANAGED",
        approvalStatus: "PENDING",
        applicationStatus: "AWAITING_APPROVAL",
      })
    );
    expect(managedAwaiting.readinessState).toBe("REVIEW_REQUIRED");

    const managedReady = computeDeterministicReadiness(
      baseReadinessInput({
        authorizationMode: "MANAGED",
        approvalStatus: "APPROVED",
        applicationStatus: "READY",
      })
    );
    expect(managedReady.readinessState).toBe("READY");
  });

  it("QA incomplete / pending and screening warnings", () => {
    const qaIncomplete = computeDeterministicReadiness(
      baseReadinessInput({
        applicationStatus: "AWAITING_APPROVAL",
        qa: { id: null, decision: null, verifiedCount: 0, criterionCount: 0 },
      })
    );
    expect(qaIncomplete.blockers.some((b) => b.code === "QA_INCOMPLETE")).toBe(
      true
    );

    const qaPending = computeDeterministicReadiness(
      baseReadinessInput({
        applicationStatus: "PREPARING",
        qa: { id: null, decision: null, verifiedCount: 0, criterionCount: 0 },
      })
    );
    expect(qaPending.warnings.some((w) => w.code === "QA_PENDING")).toBe(true);

    const screening = computeDeterministicReadiness(
      baseReadinessInput({
        applicationStatus: "READY",
        material: {
          ...baseReadinessInput().material!,
          screeningAnswers: {},
        },
      })
    );
    expect(
      screening.warnings.some((w) => w.code === "MISSING_SCREENING_ANSWERS")
    ).toBe(true);
  });

  it("protects terminal / submitted lifecycle without mutation", () => {
    const terminal = computeDeterministicReadiness(
      baseReadinessInput({ applicationStatus: "WITHDRAWN" })
    );
    expect(terminal.readinessState).toBe("UNKNOWN");
    expect(terminal.unknowns.some((u) => u.code === "APPLICATION_TERMINAL")).toBe(
      true
    );

    const submitted = computeDeterministicReadiness(
      baseReadinessInput({ applicationStatus: "SUBMITTED" })
    );
    expect(submitted.readinessState).toBe("BLOCKED");
    expect(submitted.blockers.some((b) => b.code === "ALREADY_SUBMITTED")).toBe(
      true
    );
  });

  it("emits deterministic explanations and next actions", () => {
    const result = computeDeterministicReadiness(
      baseReadinessInput({ material: null })
    );
    const blocker = result.blockers.find((b) => b.code === "MISSING_RESUME");
    expect(blocker?.message).toBeTruthy();
    expect(blocker?.why).toBeTruthy();
    expect(blocker?.resolveAction).toBe("ATTACH_RESUME");
    expect(result.nextActions.some((a) => a.code === "ATTACH_RESUME")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/probably|likely|appears/i);
  });

  it("rejects private-job misuse and requirement/alignment mismatch", () => {
    expect(() =>
      computeDeterministicReadiness(
        baseReadinessInput({
          jobVisibility: "CANDIDATE_PRIVATE",
          jobOwnerCandidateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        })
      )
    ).toThrow(/Private job/i);

    expect(() =>
      computeDeterministicReadiness(
        baseReadinessInput({
          requirementSet: {
            id: "99999999-9999-4999-8999-999999999999",
            snapshotId: R7_SNAP,
            freshness: "CURRENT",
          },
        })
      )
    ).toThrow(/requirement set/i);
  });

  it("does not treat preferred mismatch as blocker", () => {
    const result = computeDeterministicReadiness(
      baseReadinessInput({
        alignment: {
          ...baseReadinessInput().alignment,
          fitItems: [
            fit({
              category: "REQUIRED_SKILL",
              requirementValue: "TypeScript",
              importance: "REQUIRED",
              status: "MATCHED",
            }),
            fit({
              category: "PREFERRED_SKILL",
              requirementValue: "Kafka",
              importance: "PREFERRED",
              status: "MISSING",
            }),
          ],
        },
      })
    );
    expect(result.blockers).toHaveLength(0);
    expect(result.readinessState).toBe("READY_WITH_WARNINGS");
  });
});

describe("Gate 7 — request + pipeline (zero LLM)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests readiness only with CURRENT alignment for snapshot", async () => {
    const hash = "a".repeat(64);
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: R7_APP,
          status: "READY",
          approvalStatus: "APPROVED",
          job: {
            id: R7_JOB,
            organizationId: R7_ORG,
            jobDescription: "Must have TypeScript",
            updatedAt: new Date(),
            visibility: "GLOBAL",
            ownerCandidateId: null,
          },
          candidate: {
            applicationAuthorizationMode: "MANAGED",
            updatedAt: new Date(),
          },
          materials: [{ id: "m1", candidateDocumentId: "d1", documentVersion: 1 }],
          qaReviews: [{ id: "q1", decision: "PASS" }],
        }),
      },
      jobDescriptionSnapshot: {
        findUnique: vi.fn().mockResolvedValue({
          id: R7_SNAP,
          organizationId: R7_ORG,
          jobId: R7_JOB,
          contentHash: hash,
          sourceVersionId: `job:${R7_JOB}:jd:${hash.slice(0, 16)}`,
        }),
      },
      applicationAlignmentResult: {
        findFirst: vi.fn().mockResolvedValue({
          id: R7_ALIGN,
          runId,
          scoringVersion: "scoring.v1",
          evidence: {
            fitItems: [],
            requirementSetId: R7_SET,
            snapshotId: R7_SNAP,
            candidateFactVersion: "cf1",
          },
          run: { requirementSetId: R7_SET, snapshotId: R7_SNAP },
        }),
      },
      applicationIntelligenceRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: runId, snapshotId: R7_SNAP }),
      },
    } as any;

    const result = await requestApplicationReadiness(tx, {
      organizationId: R7_ORG,
      candidateId: R7_CAND,
      applicationId: R7_APP,
      jobId: R7_JOB,
      requestedById: actorId,
      candidateUpdatedAt: new Date(),
    });
    expect(result.created).toBe(true);
    expect(tx.applicationIntelligenceRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analysisPurpose: ANALYSIS_PURPOSE.APPLICATION_READINESS,
          scoringVersion: "readiness.v1",
          promptVersion: "deterministic.readiness.v1",
        }),
      })
    );
    expect(logUserAuditEvent).toHaveBeenCalled();
  });

  it("refuses readiness without CURRENT alignment", async () => {
    const tx = {
      application: {
        findFirst: vi.fn().mockResolvedValue({
          id: R7_APP,
          status: "READY",
          approvalStatus: "APPROVED",
          job: {
            id: R7_JOB,
            organizationId: R7_ORG,
            jobDescription: "JD",
            updatedAt: new Date(),
            visibility: "GLOBAL",
            ownerCandidateId: null,
          },
          candidate: { applicationAuthorizationMode: "MANAGED", updatedAt: new Date() },
          materials: [],
          qaReviews: [],
        }),
      },
      jobDescriptionSnapshot: {
        findUnique: vi.fn().mockResolvedValue({
          id: R7_SNAP,
          organizationId: R7_ORG,
          jobId: R7_JOB,
          contentHash: "b".repeat(64),
          sourceVersionId: `job:${R7_JOB}:jd:${"b".repeat(16)}`,
        }),
      },
      applicationAlignmentResult: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;

    await expect(
      requestApplicationReadiness(tx, {
        organizationId: R7_ORG,
        candidateId: R7_CAND,
        applicationId: R7_APP,
        jobId: R7_JOB,
        requestedById: actorId,
        candidateUpdatedAt: new Date(),
      })
    ).rejects.toThrow(/AlignmentResult/i);
  });

  it("pipeline readiness path never calls provider and persists result", async () => {
    const provider = new MockAIProvider("valid_alignment");
    const analyzeSpy = vi.spyOn(provider, "analyzeJob");
    const fitSpy = vi.spyOn(provider, "analyzeCandidateFit");
    const extractSpy = vi.spyOn(provider, "extractRequirements");

    const view = baseReadinessInput();

    runFindUnique
      .mockResolvedValueOnce({
        id: runId,
        organizationId: R7_ORG,
        candidateId: R7_CAND,
        applicationId: R7_APP,
        jobId: R7_JOB,
        snapshotId: R7_SNAP,
        requirementSetId: R7_SET,
        analysisPurpose: ANALYSIS_PURPOSE.APPLICATION_READINESS,
        sourceDataVersion: "snap:x|cand:y|mat:z",
        provider: "deterministic",
        model: "readiness.v1",
        promptVersion: "deterministic.readiness.v1",
        schemaVersion: "readiness-evidence.v1",
        scoringVersion: "readiness.v1",
        freshness: "CURRENT",
        attemptCount: 1,
        maxAttempts: 3,
        status: "RUNNING",
        snapshot: {
          id: R7_SNAP,
          jobId: R7_JOB,
          organizationId: R7_ORG,
          contentHash: "c".repeat(64),
          sourceVersionId: `job:${R7_JOB}:jd:${"c".repeat(16)}`,
          sourceText: "TypeScript",
        },
        job: {
          id: R7_JOB,
          organizationId: R7_ORG,
          visibility: "GLOBAL",
          ownerCandidateId: null,
        },
        application: {
          id: R7_APP,
          organizationId: R7_ORG,
          candidateId: R7_CAND,
          jobId: R7_JOB,
        },
        requirementSet: {
          id: R7_SET,
          snapshotId: R7_SNAP,
          jobId: R7_JOB,
          organizationId: R7_ORG,
          freshness: "CURRENT",
        },
      })
      .mockResolvedValueOnce({
        status: "RUNNING",
        validatedPayload: null,
        requirementSetId: R7_SET,
        alignmentResult: null,
        readinessResult: null,
      })
      .mockResolvedValue({
        status: "RUNNING",
        readinessResult: null,
      });

    vi.mocked(prisma.application.findFirst).mockResolvedValue({
      id: view.applicationId,
      status: view.applicationStatus,
      approvalStatus: view.approvalStatus,
      candidateId: view.candidateId,
      organizationId: view.organizationId,
      jobId: view.jobId,
      candidate: { applicationAuthorizationMode: view.authorizationMode },
      job: {
        visibility: view.jobVisibility,
        ownerCandidateId: view.jobOwnerCandidateId,
      },
      materials: [
        {
          id: view.material!.id,
          isCurrent: true,
          candidateDocumentId: view.material!.candidateDocumentId,
          documentVersion: view.material!.documentVersion,
          screeningAnswers: view.material!.screeningAnswers,
          candidateDocument: {
            id: view.material!.candidateDocumentId,
            candidateId: R7_CAND,
            documentType: "RESUME",
            versionNumber: 1,
          },
        },
      ],
      qaReviews: [
        {
          id: view.qa.id,
          decision: "PASS",
          checklistItems: Array.from({ length: 9 }, () => ({ isVerified: true })),
        },
      ],
    } as any);

    vi.mocked(prisma.applicationAlignmentResult.findFirst).mockResolvedValue({
      id: R7_ALIGN,
      runId,
      freshness: "CURRENT",
      scoringVersion: "scoring.v1",
      overallScore: 90,
      evidence: {
        schemaVersion: "alignment-evidence.v1",
        fitItems: view.alignment.fitItems,
        requirementSetId: R7_SET,
        snapshotId: R7_SNAP,
        candidateFactVersion: "cf1",
        scoringVersion: "scoring.v1",
        normalizationVersion: "normalize.v1",
      },
      run: { requirementSetId: R7_SET, snapshotId: R7_SNAP },
    } as any);

    vi.mocked(prisma.jobRequirementSet.findFirst).mockResolvedValue({
      id: R7_SET,
      snapshotId: R7_SNAP,
      freshness: "CURRENT",
    } as any);

    readinessCreate.mockResolvedValue({ id: readinessId });
    runUpdate.mockResolvedValue({});
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
    transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        applicationIntelligenceRun: {
          findUnique: runFindUnique,
          update: runUpdate,
          updateMany: runUpdateMany,
        },
        applicationReadinessResult: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: readinessCreate,
          update: vi.fn(),
        },
        $queryRaw: (...args: unknown[]) => txQueryRaw(...args),
      })
    );

    const result = await executeIntelligenceRunPipeline(runId, {
      provider,
      actorUserId: actorId,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.readinessResultId).toBe(readinessId);
    expect(result.readinessState).toBe("READY");
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(fitSpy).not.toHaveBeenCalled();
    expect(extractSpy).not.toHaveBeenCalled();
    expect(readinessCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          readinessState: "READY",
          applicationId: R7_APP,
          organizationId: R7_ORG,
        }),
      })
    );
  });
});

describe("Gate 7 — schema / scope discipline", () => {
  it("reuses ApplicationReadinessResult without speculative tables", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model ApplicationReadinessResult");
    expect(schema).toContain("readinessState");
    expect(schema).not.toMatch(/model ReadinessDashboard/);
    const readiness = readFileSync(
      join(ROOT, "src/lib/application-intelligence/readiness.ts"),
      "utf8"
    );
    const pipeline = readFileSync(
      join(ROOT, "src/lib/application-intelligence/pipeline.ts"),
      "utf8"
    );
    expect(readiness).not.toMatch(/NvidiaDeepSeekAdapter|openai|anthropic/i);
    expect(readiness).not.toMatch(/ApplicationStatus\.(READY|SUBMITTED)\s*=/);
    expect(pipeline).toMatch(/executeDeterministicReadinessBranch|APPLICATION_READINESS/);
    expect(pipeline).toMatch(/llmCalls: 0/);
  });

  it("keeps readiness RLS org-privileged insert", () => {
    const mig = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261004120000_phase2_intelligence_foundation/migration.sql"
      ),
      "utf8"
    );
    expect(mig).toContain("application_readiness_results");
    expect(mig).toMatch(/application_readiness_results_insert/i);
  });

  it("loadReadinessInputView is exported for targeted queries", () => {
    expect(typeof loadReadinessInputView).toBe("function");
  });
});
