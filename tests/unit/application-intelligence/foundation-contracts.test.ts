import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  hashJobDescriptionContent,
  buildSnapshotSourceVersionId,
} from "@/lib/application-intelligence/jd-snapshot";
import {
  resolveCareerFactProvenance,
  assertAiInferredNotCanonical,
  isCanonicalCandidateTruth,
} from "@/lib/application-intelligence/provenance";
import {
  assertScoringWeightsValid,
  computeOverallScore,
  SCORING_WEIGHTS,
} from "@/lib/application-intelligence/scoring-contract";
import {
  AlignmentAIOutputSchema,
  FitItemSchema,
} from "@/lib/application-intelligence/validation/ai-output.schemas";
import {
  validateAlignmentAgainstCandidateTruth,
  unknownIsNotFalse,
  missingIsNotFalse,
} from "@/lib/application-intelligence/validation/truth-validation";
import { NullAIProvider } from "@/lib/application-intelligence/providers/null-provider";
import {
  PHASE2_MUTATION_GATEWAY,
  isForbiddenLegacyMutationPath,
  INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY,
} from "@/lib/application-intelligence/mutation-gateway";
import {
  validateMaterialDocumentBinding,
  MATERIAL_BINDING_MIGRATION,
} from "@/lib/application-intelligence/materials-contract";
import {
  freshnessAfterTrigger,
  isPresentableAsCurrent,
  buildSourceDataVersion,
} from "@/lib/application-intelligence/stale";
import {
  assertNotSsrAiExecution,
  canStartRun,
} from "@/lib/application-intelligence/async-contract";
import {
  buildScopedAiContextGuard,
  rejectsCrossCandidate,
  rejectsCrossTenant,
  canViewCandidateVisibleIntelligence,
} from "@/lib/application-intelligence/security";
import {
  sanitizeIntelligenceAuditDetails,
  INTELLIGENCE_AUDIT_ACTIONS,
} from "@/lib/application-intelligence/audit-contract";
import {
  intelligenceMayApproveApplication,
  intelligenceMayCompleteQa,
  intelligenceMayMutateApplicationStatus,
  intelligenceMaySubmitApplication,
  QA_INTELLIGENCE_VOCABULARY_MAP,
} from "@/lib/application-intelligence/qa-alignment";

const ROOT = process.cwd();

describe("Phase 2 foundation — JD snapshot", () => {
  it("hashes JD content deterministically", () => {
    const a = hashJobDescriptionContent("  Hello\r\nWorld  ");
    const b = hashJobDescriptionContent("Hello\nWorld");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("builds stable source version ids", () => {
    const hash = hashJobDescriptionContent("JD");
    expect(buildSnapshotSourceVersionId("job-1", hash)).toContain("job:job-1:jd:");
  });
});

describe("Phase 2 foundation — provenance", () => {
  it("does not promote profile verification to field VERIFIED by default", () => {
    const ref = resolveCareerFactProvenance({
      entityType: "CandidateSkill",
      entityId: "00000000-0000-4000-8000-000000000001",
      field: "name",
      valuePresent: true,
    });
    expect(ref.provenance).toBe("CANDIDATE_PROVIDED");
    expect(ref.fieldVerified).toBe(false);
  });

  it("keeps missing facts UNKNOWN", () => {
    const ref = resolveCareerFactProvenance({
      entityType: "CandidateCertification",
      valuePresent: false,
    });
    expect(ref.provenance).toBe("UNKNOWN");
  });

  it("rejects AI_INFERRED as canonical truth", () => {
    expect(isCanonicalCandidateTruth("AI_INFERRED")).toBe(false);
    expect(() => assertAiInferredNotCanonical("AI_INFERRED")).toThrow(/canonical/i);
  });
});

describe("Phase 2 foundation — structured AI output + truth", () => {
  it("rejects MATCHED without canonical evidence", () => {
    const parsed = FitItemSchema.safeParse({
      label: "React",
      category: "REQUIRED_SKILLS",
      status: "MATCHED",
      evidence: [
        {
          entityType: "CandidateSkill",
          entityId: "00000000-0000-4000-8000-000000000001",
          provenance: "AI_INFERRED",
          summary: "model guessed",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts MATCHED with candidate-provided evidence", () => {
    const parsed = FitItemSchema.safeParse({
      label: "React",
      category: "REQUIRED_SKILLS",
      status: "MATCHED",
      evidence: [
        {
          entityType: "CandidateSkill",
          entityId: "00000000-0000-4000-8000-000000000001",
          provenance: "CANDIDATE_PROVIDED",
          summary: "Candidate skill React",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects fabricated entity ids in truth validation", () => {
    const output = AlignmentAIOutputSchema.parse({
      kind: "alignment",
      fitItems: [
        {
          label: "Secret skill",
          category: "REQUIRED_SKILLS",
          status: "MATCHED",
          evidence: [
            {
              entityType: "CandidateSkill",
              entityId: "00000000-0000-4000-8000-000000000099",
              provenance: "CANDIDATE_PROVIDED",
              summary: "invented",
            },
          ],
        },
      ],
      dimensionScores: [],
    });
    const known = new Set(["00000000-0000-4000-8000-000000000001"]);
    const result = validateAlignmentAgainstCandidateTruth(output, known);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /unknown entityId|fabrication/i.test(e))).toBe(
      true
    );
  });

  it("treats UNKNOWN and MISSING as not FALSE", () => {
    expect(unknownIsNotFalse("UNKNOWN")).toBe(true);
    expect(missingIsNotFalse("MISSING")).toBe(true);
  });

  it("rejects inventedCandidateFact-style extra keys on fit items", () => {
    const parsed = FitItemSchema.safeParse({
      label: "React",
      category: "REQUIRED_SKILLS",
      status: "UNKNOWN",
      evidence: [],
      inventedEmploymentHistory: [{ company: "FakeCorp" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("Phase 2 foundation — scoring contract", () => {
  it("keeps weights summing to 100", () => {
    assertScoringWeightsValid();
    expect(Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("returns null overall when all dimensions UNKNOWN", () => {
    const result = computeOverallScore(
      Object.keys(SCORING_WEIGHTS).map((dimension) => ({
        dimension: dimension as keyof typeof SCORING_WEIGHTS,
        score: null,
        status: "UNKNOWN" as const,
      }))
    );
    expect(result.overallScore).toBeNull();
    expect(result.unknownDimensions.length).toBeGreaterThan(0);
  });

  it("computes deterministic weighted overall from scored dims", () => {
    const result = computeOverallScore([
      { dimension: "skills", score: 100, status: "SCORED" },
      { dimension: "experience", score: 80, status: "SCORED" },
      { dimension: "education", score: 100, status: "SCORED" },
      { dimension: "location", score: 100, status: "SCORED" },
      { dimension: "workAuthorization", score: 100, status: "SCORED" },
      { dimension: "preferences", score: 70, status: "SCORED" },
    ]);
    expect(result.overallScore).toBe(
      Math.round(
        (100 * 30 + 80 * 25 + 100 * 10 + 100 * 10 + 100 * 15 + 70 * 10) / 100
      )
    );
  });
});

describe("Phase 2 foundation — provider abstraction", () => {
  it("NullAIProvider refuses all execution (0 network)", async () => {
    const provider = new NullAIProvider();
    await expect(
      provider.analyzeJob({
        kind: "analyze_job",
        organizationId: "00000000-0000-4000-8000-000000000010",
        jobId: "00000000-0000-4000-8000-000000000011",
        snapshotId: "00000000-0000-4000-8000-000000000012",
        scopedContext: {},
      })
    ).rejects.toThrow(/refuses AI execution|CONFIGURATION_REQUIRED|not authorized/i);
  });

  it("does not import vendor SDKs in intelligence foundation", () => {
    const root = join(ROOT, "src/lib/application-intelligence");
    // Domain interface + null provider must stay vendor-free. Adapter registration
    // is local (./nvidia-deepseek-adapter) and must not pull npm vendor SDKs.
    const files = [
      "providers/null-provider.ts",
      "providers/interface.ts",
      "providers/service.ts",
      "providers/nvidia-deepseek-adapter.ts",
    ];
    for (const f of files) {
      const src = readFileSync(join(root, f), "utf8");
      expect(src).not.toMatch(
        /from\s+["']openai["']|from\s+["']@anthropic-ai|from\s+["']@anthropic["']/i
      );
      expect(src).not.toMatch(
        /require\(["']openai["']\)|require\(["']@anthropic/
      );
    }
  });
});

describe("Phase 2 foundation — mutation gateway + QA authority", () => {
  it("forbids intelligence from calling mutation gateway", () => {
    expect(INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY).toBe(false);
    expect(intelligenceMayMutateApplicationStatus()).toBe(false);
    expect(intelligenceMayCompleteQa()).toBe(false);
    expect(intelligenceMayApproveApplication()).toBe(false);
    expect(intelligenceMaySubmitApplication()).toBe(false);
  });

  it("lists legacy approval/submission paths as forbidden", () => {
    expect(
      isForbiddenLegacyMutationPath(
        "src/lib/application/actions.ts#recordApplicationSubmissionAction"
      )
    ).toBe(true);
    expect(PHASE2_MUTATION_GATEWAY.approval.module).toContain("qa/actions");
    expect(PHASE2_MUTATION_GATEWAY.submission.module).toContain("submission/actions");
  });

  it("maps QA criteria without inventing competing keys", () => {
    expect(QA_INTELLIGENCE_VOCABULARY_MAP.CANDIDATE_JOB_ALIGNMENT.authority).toMatch(
      /QA/
    );
    expect(Object.keys(QA_INTELLIGENCE_VOCABULARY_MAP)).toHaveLength(9);
  });
});

describe("Phase 2 foundation — materials / stale / async / security / audit", () => {
  it("validates material version binding without rewriting history", () => {
    expect(validateMaterialDocumentBinding({}).ok).toBe(true);
    expect(
      validateMaterialDocumentBinding({
        candidateDocumentId: "00000000-0000-4000-8000-000000000001",
        documentVersion: 1,
        documentVersionNumber: 2,
      }).ok
    ).toBe(false);
    expect(
      validateMaterialDocumentBinding({
        candidateDocumentId: "00000000-0000-4000-8000-000000000001",
        documentVersion: 1,
        documentVersionNumber: 1,
        documentType: "RESUME",
      }).ok
    ).toBe(true);
    expect(
      validateMaterialDocumentBinding({
        candidateDocumentId: "00000000-0000-4000-8000-000000000001",
        documentVersion: 1,
        documentVersionNumber: 1,
        documentType: "COVER_LETTER",
      }).ok
    ).toBe(false);
    expect(MATERIAL_BINDING_MIGRATION.backwardCompatibility).toMatch(/remain valid/i);
  });

  it("marks JD change as RECOMPUTE_REQUIRED and blocks stale-as-current", () => {
    expect(freshnessAfterTrigger("JD_SNAPSHOT_CHANGED")).toBe("RECOMPUTE_REQUIRED");
    expect(isPresentableAsCurrent("STALE", "SUCCEEDED")).toBe(false);
    expect(isPresentableAsCurrent("CURRENT", "SUCCEEDED")).toBe(true);
    expect(
      buildSourceDataVersion({
        snapshotContentHash: "abc",
        candidateUpdatedAt: "2026-10-04T00:00:00.000Z",
        materialsFingerprint: "m1",
      })
    ).toContain("snap:");
  });

  it("forbids SSR AI execution and only starts QUEUED runs", () => {
    expect(() => assertNotSsrAiExecution(true)).toThrow(/SSR/i);
    expect(canStartRun("QUEUED")).toBe(true);
    expect(canStartRun("RUNNING")).toBe(false);
  });

  it("enforces tenant/candidate isolation helpers", () => {
    const scope = {
      organizationId: "00000000-0000-4000-8000-000000000010",
      candidateId: "00000000-0000-4000-8000-000000000011",
      applicationId: "00000000-0000-4000-8000-000000000012",
      jobId: "00000000-0000-4000-8000-000000000013",
    };
    expect(buildScopedAiContextGuard(scope).forbidUnscopedQueries).toBe(true);
    expect(rejectsCrossTenant("org-a", "org-b")).toBe(true);
    expect(rejectsCrossCandidate("cand-a", "cand-b")).toBe(true);
    expect(
      canViewCandidateVisibleIntelligence({
        role: "CANDIDATE",
        viewerUserId: "u1",
        candidateUserId: "u2",
        sameOrganization: true,
      })
    ).toBe(false);
  });

  it("strips secrets from audit details and exposes audit action constants", () => {
    const cleaned = sanitizeIntelligenceAuditDetails({
      runId: "r1",
      apiKey: "secret",
      providerCredential: "x",
      authorization: "Bearer x",
    });
    expect(cleaned.runId).toBe("r1");
    expect(cleaned.apiKey).toBeUndefined();
    expect(INTELLIGENCE_AUDIT_ACTIONS.requested).toBe(
      "APPLICATION_INTELLIGENCE_REQUESTED"
    );
  });
});

describe("Phase 2 foundation — schema presence", () => {
  it("persists intelligence foundation models in prisma schema", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model JobDescriptionSnapshot");
    expect(schema).toContain("model ApplicationIntelligenceRun");
    expect(schema).toContain("model ApplicationAlignmentResult");
    expect(schema).toContain("model ApplicationReadinessResult");
    expect(schema).toContain("model JobRequirementSet");
    expect(schema).toContain("model CandidateFactAttestation");
    expect(schema).toContain("enum FactProvenance");
  });
});
