import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ALIGNMENT_EVIDENCE_SCHEMA_VERSION,
  ALIGNMENT_RULE_IDS,
  EXPLAINABILITY_CONTRACT_VERSION,
  GATE8_EVIDENCE_AUDIT_ALIASES,
  READINESS_RULE_IDS,
  assertEvidenceAccessScope,
  assertNoProbabilisticExplanationLanguage,
  buildAlignmentExplanation,
  buildReadinessExplanation,
  enrichAlignmentEvidencePayload,
  enrichAlignmentFitItem,
  enrichReadinessResult,
  explainFromPersistedAlignmentEvidence,
  explainFromPersistedReadinessResult,
  resolveAlignmentRuleId,
  resolveReadinessRuleId,
  validateAlignmentEvidenceIntegrity,
  validateJobRequirementEvidence,
  validateReadinessEvidenceIntegrity,
  computeDeterministicAlignment,
  computeDeterministicReadiness,
  buildAlignmentEvidencePayload,
} from "@/lib/application-intelligence";
import {
  ALIGNMENT_REQUIREMENT_SETS,
  G6_AS_OF,
  G6_SET,
  G6_SNAP,
  baseCandidate,
  baseJob,
  req,
} from "./fixtures/candidate-job-alignment";
import {
  baseReadinessInput,
  fit,
  R7_ALIGN,
  R7_SET,
  R7_SNAP,
} from "./fixtures/application-readiness";

const ROOT = process.cwd();

describe("Gate 8 — rule IDs + versions", () => {
  it("exposes stable alignment and readiness rule identifiers", () => {
    expect(ALIGNMENT_RULE_IDS.SKILL_EXACT).toBe("ALIGN.SKILL.EXACT");
    expect(ALIGNMENT_RULE_IDS.EXPERIENCE_THRESHOLD).toBe(
      "ALIGN.EXPERIENCE.THRESHOLD"
    );
    expect(READINESS_RULE_IDS.MISSING_APPROVAL).toBe(
      "READINESS.MISSING_APPROVAL"
    );
    expect(READINESS_RULE_IDS.REQUIRED_UNKNOWN).toBe(
      "READINESS.UNKNOWN_REQUIRED_FACT"
    );
    expect(EXPLAINABILITY_CONTRACT_VERSION).toBe("explainability.v1");
    expect(GATE8_EVIDENCE_AUDIT_ALIASES.created).toBe("EVIDENCE_CREATED");
  });

  it("maps categories and readiness codes to rule IDs", () => {
    expect(
      resolveAlignmentRuleId({
        category: "REQUIRED_SKILL",
        status: "MATCHED",
        reason: "match",
      })
    ).toBe(ALIGNMENT_RULE_IDS.SKILL_EXACT);
    expect(
      resolveAlignmentRuleId({
        category: "EXPERIENCE",
        status: "PARTIAL",
        reason: "5 years threshold",
      })
    ).toBe(ALIGNMENT_RULE_IDS.EXPERIENCE_THRESHOLD);
    expect(resolveReadinessRuleId("QA_FAILED")).toBe(
      READINESS_RULE_IDS.QA_FAILED
    );
    expect(resolveReadinessRuleId("MISSING_RESUME")).toBe(
      READINESS_RULE_IDS.MISSING_RESUME
    );
  });
});

describe("Gate 8 — deterministic explanations", () => {
  it("explains MATCH / PARTIAL / MISSING / UNKNOWN without probabilistic language", () => {
    const matched = enrichAlignmentFitItem({
      requirementId: "11111111-1111-4111-8111-111111111111",
      category: "REQUIRED_SKILL",
      requirementValue: "Python",
      normalizedValue: "Python",
      importance: "REQUIRED",
      status: "MATCHED",
      reason: "Normalized skill matches candidate skill.",
      dimension: "skills",
      candidateEvidence: {
        entityType: "CandidateSkill",
        entityId: "22222222-2222-4222-8222-222222222222",
        field: "name",
        provenance: "VERIFIED",
        summary: "Python",
      },
      requirementEvidence: { snapshotId: G6_SNAP, excerpt: "Python" },
    });
    expect(matched.ruleId).toBe(ALIGNMENT_RULE_IDS.SKILL_EXACT);
    expect(matched.explanation).toMatch(/MATCHED/);
    expect(matched.explanation).toMatch(/VERIFIED/);
    assertNoProbabilisticExplanationLanguage(matched.explanation);

    const unknown = buildAlignmentExplanation({
      status: "UNKNOWN",
      requirementValue: "AWS certification",
      importance: "REQUIRED",
      reason: "No certification records available.",
      candidateEvidence: null,
      ruleId: ALIGNMENT_RULE_IDS.CERTIFICATION_EXACT,
    });
    expect(unknown).toMatch(/UNKNOWN/);
    expect(unknown).toMatch(/not treated as MATCH or MISSING/);
    expect(unknown).not.toMatch(/probably|likely/i);

    const missing = buildAlignmentExplanation({
      status: "MISSING",
      requirementValue: "Bachelor's degree",
      importance: "REQUIRED",
      reason: "Associate degree does not meet bachelor requirement.",
      candidateEvidence: {
        entityType: "CandidateEducation",
        entityId: "33333333-3333-4333-8333-333333333333",
        field: "degree",
        provenance: "CANDIDATE_PROVIDED",
        summary: "Associate degree",
      },
      ruleId: ALIGNMENT_RULE_IDS.EDUCATION_DEGREE,
    });
    expect(missing).toMatch(/MISSING \(deterministic mismatch/);
    assertNoProbabilisticExplanationLanguage(missing);
  });

  it("explains readiness blockers with rule + resolution", () => {
    const text = buildReadinessExplanation({
      code: "MISSING_APPROVAL",
      severity: "BLOCKER",
      message: "Candidate approval is required.",
      why: "REVIEW_REQUIRED mode remains review-dependent.",
      evidence: { approvalStatus: "PENDING" },
      resolveAction: "REQUEST_CANDIDATE_APPROVAL",
    });
    expect(text).toMatch(/READINESS\.MISSING_APPROVAL/);
    expect(text).toMatch(/REQUEST_CANDIDATE_APPROVAL/);
    assertNoProbabilisticExplanationLanguage(text);
  });

  it("enriches Gate 6 alignment evidence without changing scores", () => {
    const alignment = computeDeterministicAlignment({
      requirements: ALIGNMENT_REQUIREMENT_SETS.perfectMatch,
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    const rawScore = alignment.overallScore;
    const enriched = enrichAlignmentEvidencePayload(
      buildAlignmentEvidencePayload(alignment)
    );
    expect(enriched.explainabilityVersion).toBe("explainability.v1");
    expect(enriched.versions.scoringVersion).toBe("scoring.v1");
    expect(enriched.fitItems.every((f) => f.ruleId && f.explanation)).toBe(
      true
    );
    expect(alignment.overallScore).toBe(rawScore);
    expect(enriched.fitItems.map((f) => f.status)).toEqual(
      alignment.fitItems.map((f) => f.status)
    );
  });

  it("enriches Gate 7 readiness evidence without changing state", () => {
    const readiness = computeDeterministicReadiness(baseReadinessInput());
    const enriched = enrichReadinessResult(readiness);
    expect(enriched.readinessState).toBe(readiness.readinessState);
    expect(enriched.issues.every((i) => i.ruleId && i.explanation)).toBe(true);
  });
});

describe("Gate 8 — evidence integrity", () => {
  it("validates requirement excerpt against snapshot", () => {
    const requirement = req({
      category: "REQUIRED_SKILL",
      rawValue: "TypeScript",
      importance: "REQUIRED",
      excerpt: "TypeScript",
    });
    expect(
      validateJobRequirementEvidence({
        snapshotId: G6_SNAP,
        snapshotText: "Must have TypeScript experience.",
        requirement,
      }).ok
    ).toBe(true);

    expect(
      validateJobRequirementEvidence({
        snapshotId: G6_SNAP,
        snapshotText: "Must have TypeScript experience.",
        requirement: {
          ...requirement,
          evidence: {
            snapshotId: G6_SNAP,
            excerpt: "Invented citation not in JD",
          },
        },
      }).ok
    ).toBe(false);
  });

  it("rejects wrong snapshot / requirement set / non-canonical MATCHED", () => {
    const alignment = computeDeterministicAlignment({
      requirements: [
        req({
          category: "REQUIRED_SKILL",
          rawValue: "TypeScript",
          importance: "REQUIRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    const payload = buildAlignmentEvidencePayload(alignment);

    expect(
      validateAlignmentEvidenceIntegrity({
        organizationId: baseCandidate().organizationId,
        candidateId: baseCandidate().candidateId,
        jobId: baseJob().jobId,
        applicationId: "33333333-3333-4333-8333-333333333333",
        snapshotId: G6_SNAP,
        requirementSetId: G6_SET,
        evidence: payload,
      }).ok
    ).toBe(true);

    expect(
      validateAlignmentEvidenceIntegrity({
        organizationId: baseCandidate().organizationId,
        candidateId: baseCandidate().candidateId,
        jobId: baseJob().jobId,
        applicationId: "33333333-3333-4333-8333-333333333333",
        snapshotId: "99999999-9999-4999-8999-999999999999",
        requirementSetId: G6_SET,
        evidence: payload,
      }).ok
    ).toBe(false);

    const poisoned = {
      ...payload,
      fitItems: payload.fitItems.map((f) => ({
        ...f,
        status: "MATCHED" as const,
        candidateEvidence: f.candidateEvidence
          ? { ...f.candidateEvidence, provenance: "AI_INFERRED" as const }
          : {
              entityType: "CandidateSkill",
              entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              field: "name",
              provenance: "AI_INFERRED" as const,
              summary: "x",
            },
      })),
    };
    expect(
      validateAlignmentEvidenceIntegrity({
        organizationId: baseCandidate().organizationId,
        candidateId: baseCandidate().candidateId,
        jobId: baseJob().jobId,
        applicationId: "33333333-3333-4333-8333-333333333333",
        snapshotId: G6_SNAP,
        requirementSetId: G6_SET,
        evidence: poisoned,
      }).ok
    ).toBe(false);
  });

  it("validates readiness evidence binding", () => {
    const base = baseReadinessInput();
    const readiness = computeDeterministicReadiness(base);
    expect(
      validateReadinessEvidenceIntegrity({
        organizationId: base.organizationId,
        candidateId: base.candidateId,
        applicationId: base.applicationId,
        jobId: base.jobId,
        alignmentResultId: R7_ALIGN,
        requirementSetId: R7_SET,
        snapshotId: R7_SNAP,
        result: readiness,
      }).ok
    ).toBe(true);

    expect(
      validateReadinessEvidenceIntegrity({
        organizationId: baseReadinessInput().organizationId,
        candidateId: baseReadinessInput().candidateId,
        applicationId: baseReadinessInput().applicationId,
        jobId: baseReadinessInput().jobId,
        alignmentResultId: "99999999-9999-4999-8999-999999999999",
        requirementSetId: R7_SET,
        snapshotId: R7_SNAP,
        result: readiness,
      }).ok
    ).toBe(false);
  });
});

describe("Gate 8 — security + historical reproducibility", () => {
  it("denies cross-tenant and cross-candidate evidence access", () => {
    expect(() =>
      assertEvidenceAccessScope({
        viewerOrganizationId: "11111111-1111-4111-8111-111111111111",
        recordOrganizationId: "99999999-9999-4999-8999-999999999999",
        role: "EMPLOYEE",
      })
    ).toThrow(/Cross-tenant/i);

    expect(() =>
      assertEvidenceAccessScope({
        viewerOrganizationId: "11111111-1111-4111-8111-111111111111",
        recordOrganizationId: "11111111-1111-4111-8111-111111111111",
        viewerCandidateId: "22222222-2222-4222-8222-222222222222",
        recordCandidateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "CANDIDATE",
      })
    ).toThrow(/Cross-candidate/i);

    expect(() =>
      assertEvidenceAccessScope({
        viewerOrganizationId: "11111111-1111-4111-8111-111111111111",
        recordOrganizationId: "11111111-1111-4111-8111-111111111111",
        viewerCandidateId: "22222222-2222-4222-8222-222222222222",
        recordCandidateId: "22222222-2222-4222-8222-222222222222",
        role: "CANDIDATE",
        jobVisibility: "CANDIDATE_PRIVATE",
        jobOwnerCandidateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })
    ).toThrow(/Private job/i);
  });

  it("explains historical persisted evidence after source mutation", () => {
    const alignment = computeDeterministicAlignment({
      requirements: [
        req({
          category: "REQUIRED_SKILL",
          rawValue: "TypeScript",
          importance: "REQUIRED",
        }),
      ],
      requirementSetId: G6_SET,
      snapshotId: G6_SNAP,
      candidate: baseCandidate(),
      job: baseJob(),
      asOf: G6_AS_OF,
    });
    const persisted = buildAlignmentEvidencePayload(alignment);

    // Mutate "live" candidate facts — historical explanation must use persisted payload.
    const mutatedCandidate = baseCandidate({
      skills: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Rust" }],
    });
    expect(mutatedCandidate.skills[0]?.name).toBe("Rust");

    const historical = explainFromPersistedAlignmentEvidence(persisted);
    expect(historical[0]?.status).toBe(persisted.fitItems[0]?.status);
    expect(historical[0]?.snapshotId).toBe(G6_SNAP);
    expect(historical[0]?.scoringVersion).toBe("scoring.v1");
    expect(historical[0]?.explanation).toMatch(/TypeScript|MATCHED|MISSING|UNKNOWN/);

    const readiness = computeDeterministicReadiness(
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
          ],
        },
      })
    );
    const histReady = explainFromPersistedReadinessResult(readiness);
    expect(histReady.readinessState).toBe(readiness.readinessState);
    expect(histReady.readinessVersion).toBe("readiness.v1");
  });
});

describe("Gate 8 — scope discipline", () => {
  it("does not add Evidence table or change scoring/readiness weights", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).not.toMatch(/model Evidence\b/);
    expect(schema).toContain("ApplicationAlignmentResult");
    expect(schema).toContain("ApplicationReadinessResult");

    const evidence = readFileSync(
      join(ROOT, "src/lib/application-intelligence/evidence-contract.ts"),
      "utf8"
    );
    expect(evidence).not.toMatch(/NvidiaDeepSeekAdapter|openai|anthropic/i);
    expect(evidence).toContain("ALIGNMENT_EVIDENCE_SCHEMA_VERSION");
    expect(ALIGNMENT_EVIDENCE_SCHEMA_VERSION).toBe("alignment-evidence.v1");
    expect(evidence).not.toMatch(/SCORING_WEIGHTS\s*=/);
  });

  it("pipeline validates evidence and never imports Nvidia adapter", () => {
    const pipeline = readFileSync(
      join(ROOT, "src/lib/application-intelligence/pipeline.ts"),
      "utf8"
    );
    expect(pipeline).toMatch(/validateAlignmentEvidenceIntegrity/);
    expect(pipeline).toMatch(/validateReadinessEvidenceIntegrity/);
    expect(pipeline).not.toMatch(/NvidiaDeepSeekAdapter/);
  });
});
