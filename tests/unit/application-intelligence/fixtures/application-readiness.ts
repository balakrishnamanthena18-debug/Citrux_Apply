/**
 * Synthetic Gate 7 readiness fixtures — no real candidate data.
 */
import { randomUUID } from "crypto";
import type { ReadinessInputView } from "@/lib/application-intelligence/readiness";
import type { AlignmentFitItem } from "@/lib/application-intelligence/alignment";

export const R7_ORG = "11111111-1111-4111-8111-111111111111";
export const R7_CAND = "22222222-2222-4222-8222-222222222222";
export const R7_APP = "33333333-3333-4333-8333-333333333333";
export const R7_JOB = "44444444-4444-4444-8444-444444444444";
export const R7_SNAP = "55555555-5555-4555-8555-555555555555";
export const R7_SET = "88888888-8888-4888-8888-888888888888";
export const R7_ALIGN = "a1111111-1111-4111-8111-111111111111";

export function fit(
  partial: Partial<AlignmentFitItem> &
    Pick<AlignmentFitItem, "category" | "requirementValue" | "importance" | "status">
): AlignmentFitItem {
  return {
    requirementId: partial.requirementId ?? randomUUID(),
    category: partial.category,
    requirementValue: partial.requirementValue,
    normalizedValue: partial.normalizedValue ?? partial.requirementValue,
    importance: partial.importance,
    status: partial.status,
    reason: partial.reason ?? `Fixture: ${partial.status}`,
    dimension: partial.dimension ?? "skills",
    candidateEvidence: partial.candidateEvidence ?? null,
    requirementEvidence: partial.requirementEvidence ?? {
      snapshotId: R7_SNAP,
      excerpt: partial.requirementValue,
    },
  };
}

export function baseReadinessInput(
  overrides: Partial<ReadinessInputView> = {}
): ReadinessInputView {
  return {
    organizationId: R7_ORG,
    candidateId: R7_CAND,
    applicationId: R7_APP,
    jobId: R7_JOB,
    applicationStatus: "READY",
    approvalStatus: "APPROVED",
    authorizationMode: "MANAGED",
    jobVisibility: "GLOBAL",
    jobOwnerCandidateId: null,
    alignment: {
      id: R7_ALIGN,
      runId: "66666666-6666-4666-8666-666666666666",
      freshness: "CURRENT",
      scoringVersion: "scoring.v1",
      overallScore: 90,
      snapshotId: R7_SNAP,
      requirementSetId: R7_SET,
      candidateFactVersion: "facts-v1",
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
          status: "MATCHED",
          dimension: "skills",
        }),
      ],
    },
    requirementSet: {
      id: R7_SET,
      snapshotId: R7_SNAP,
      freshness: "CURRENT",
    },
    material: {
      id: "m1111111-1111-4111-8111-111111111111",
      isCurrent: true,
      candidateDocumentId: "d1111111-1111-4111-8111-111111111111",
      documentVersion: 1,
      documentType: "RESUME",
      documentVersionNumber: 1,
      documentCandidateId: R7_CAND,
      screeningAnswers: { q1: "yes" },
    },
    qa: {
      id: "q1111111-1111-4111-8111-111111111111",
      decision: "PASS",
      verifiedCount: 9,
      criterionCount: 9,
    },
    ...overrides,
  };
}
