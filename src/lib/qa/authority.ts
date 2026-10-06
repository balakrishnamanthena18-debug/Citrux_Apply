/**
 * Phase 5I — Authoritative QA gate for Application lifecycle transitions.
 *
 * Latest ApplicationQaReview (by createdAt DESC) must be PASS with all 9
 * criteria verified, and must not predate a newer current ApplicationMaterial.
 */

import type { Prisma } from "@/generated/prisma";
import { QaDecision } from "@/generated/prisma";
import { ValidationError } from "@/lib/errors";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";

export type AuthoritativeQaPassResult = {
  qaReviewId: string;
  reviewedAt: Date;
};

/**
 * Assert the latest org-scoped QA review for this Application is an authoritative PASS.
 * Throws ValidationError with a human-readable operational reason on failure.
 */
export async function assertAuthoritativeQaPass(
  tx: Prisma.TransactionClient,
  input: { applicationId: string; organizationId: string }
): Promise<AuthoritativeQaPassResult> {
  const latest = await tx.applicationQaReview.findFirst({
    where: {
      applicationId: input.applicationId,
      organizationId: input.organizationId,
    },
    orderBy: { createdAt: "desc" },
    include: {
      checklistItems: {
        select: { criterionKey: true, isVerified: true },
      },
    },
  });

  if (!latest) {
    throw new ValidationError(
      "Authoritative QA PASS is required before this transition. Complete the 9-criterion QA review first."
    );
  }

  if (latest.decision !== QaDecision.PASS) {
    throw new ValidationError(
      "Latest QA review did not PASS. Re-run QA and verify all 9 criteria before continuing."
    );
  }

  const verifiedKeys = new Set(
    latest.checklistItems
      .filter((item) => item.isVerified)
      .map((item) => item.criterionKey)
  );

  const missing = QA_CRITERION_KEYS.filter((key) => !verifiedKeys.has(key));
  if (missing.length > 0) {
    throw new ValidationError(
      "Latest QA PASS is incomplete. All 9 criteria must be verified before this transition."
    );
  }

  // Material created after QA invalidates that PASS for readiness/approval gates.
  const currentMaterial = await tx.applicationMaterial.findFirst({
    where: { applicationId: input.applicationId, isCurrent: true },
    select: { createdAt: true },
  });
  if (currentMaterial && currentMaterial.createdAt > latest.createdAt) {
    throw new ValidationError(
      "Application materials were updated after the latest QA PASS. Re-run QA before continuing."
    );
  }

  return { qaReviewId: latest.id, reviewedAt: latest.createdAt };
}

/** Pure helper for unit tests — evaluates a loaded review + optional material timestamp. */
export function evaluateAuthoritativeQaPass(input: {
  review: {
    id: string;
    decision: string;
    createdAt: Date;
    checklistItems: Array<{ criterionKey: string; isVerified: boolean }>;
  } | null;
  currentMaterialCreatedAt?: Date | null;
}): { ok: true; qaReviewId: string } | { ok: false; reason: string } {
  if (!input.review) {
    return {
      ok: false,
      reason:
        "Authoritative QA PASS is required before this transition. Complete the 9-criterion QA review first.",
    };
  }
  if (input.review.decision !== "PASS") {
    return {
      ok: false,
      reason:
        "Latest QA review did not PASS. Re-run QA and verify all 9 criteria before continuing.",
    };
  }
  const verifiedKeys = new Set(
    input.review.checklistItems
      .filter((item) => item.isVerified)
      .map((item) => item.criterionKey)
  );
  if (QA_CRITERION_KEYS.some((key) => !verifiedKeys.has(key))) {
    return {
      ok: false,
      reason:
        "Latest QA PASS is incomplete. All 9 criteria must be verified before this transition.",
    };
  }
  if (
    input.currentMaterialCreatedAt &&
    input.currentMaterialCreatedAt > input.review.createdAt
  ) {
    return {
      ok: false,
      reason:
        "Application materials were updated after the latest QA PASS. Re-run QA before continuing.",
    };
  }
  return { ok: true, qaReviewId: input.review.id };
}
