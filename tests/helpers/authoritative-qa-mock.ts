/**
 * Shared mock fragments for Phase 5I authoritative QA PASS checks.
 */
import { QaDecision } from "@/generated/prisma";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";
import { vi } from "vitest";

export function mockAuthoritativeQaPassReview(
  overrides: { createdAt?: Date; decision?: QaDecision } = {}
) {
  return {
    id: "qa-pass-mock",
    decision: overrides.decision ?? QaDecision.PASS,
    createdAt: overrides.createdAt ?? new Date("2026-10-01T12:00:00.000Z"),
    checklistItems: QA_CRITERION_KEYS.map((criterionKey) => ({
      criterionKey,
      isVerified: true,
    })),
  };
}

/** Spread into a Prisma tx mock used by withRlsContext. */
export function authoritativeQaTxMocks() {
  return {
    applicationQaReview: {
      findFirst: vi.fn().mockResolvedValue(mockAuthoritativeQaPassReview()),
    },
    applicationMaterial: {
      findFirst: vi.fn().mockResolvedValue({
        createdAt: new Date("2026-09-30T12:00:00.000Z"),
      }),
    },
  };
}
