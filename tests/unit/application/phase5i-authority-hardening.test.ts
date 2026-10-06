/**
 * Phase 5I — Application Execution Authority & Ownership Hardening.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { QA_CRITERION_KEYS } from "@/lib/validation/qa.schemas";
import { evaluateAuthoritativeQaPass } from "@/lib/qa/authority";
import {
  assertSubmissionEvidence,
  hasSubmissionEvidence,
  SUBMISSION_EVIDENCE_REQUIRED_MESSAGE,
} from "@/lib/submission/evidence";
import {
  RecordApplicationSubmissionSchema,
  RecordApplicationResubmissionSchema,
} from "@/lib/validation/submission.schemas";
import { ValidationError } from "@/lib/errors";

const ROOT = join(__dirname, "../../..");
const APP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

function allCriteria(verified = true) {
  return QA_CRITERION_KEYS.map((criterionKey) => ({
    criterionKey,
    isVerified: verified,
  }));
}

describe("Phase 5I — QA authority (latest PASS)", () => {
  it("rejects missing QA review", () => {
    const result = evaluateAuthoritativeQaPass({ review: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/QA PASS is required/i);
  });

  it("rejects latest FAIL even if an older PASS existed conceptually", () => {
    const result = evaluateAuthoritativeQaPass({
      review: {
        id: "qa-fail",
        decision: "FAIL",
        createdAt: new Date("2026-10-06T12:00:00.000Z"),
        checklistItems: allCriteria(false),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/did not PASS/i);
  });

  it("rejects PASS with incomplete checklist", () => {
    const result = evaluateAuthoritativeQaPass({
      review: {
        id: "qa-partial",
        decision: "PASS",
        createdAt: new Date("2026-10-06T12:00:00.000Z"),
        checklistItems: allCriteria(true).slice(0, 8),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/incomplete/i);
  });

  it("rejects PASS when current material is newer than QA", () => {
    const qaAt = new Date("2026-10-06T10:00:00.000Z");
    const materialAt = new Date("2026-10-06T11:00:00.000Z");
    const result = evaluateAuthoritativeQaPass({
      review: {
        id: "qa-pass",
        decision: "PASS",
        createdAt: qaAt,
        checklistItems: allCriteria(true),
      },
      currentMaterialCreatedAt: materialAt,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/materials were updated/i);
  });

  it("accepts latest PASS with all 9 verified and material not newer", () => {
    const qaAt = new Date("2026-10-06T12:00:00.000Z");
    const result = evaluateAuthoritativeQaPass({
      review: {
        id: "qa-pass",
        decision: "PASS",
        createdAt: qaAt,
        checklistItems: allCriteria(true),
      },
      currentMaterialCreatedAt: new Date("2026-10-06T11:00:00.000Z"),
    });
    expect(result).toEqual({ ok: true, qaReviewId: "qa-pass" });
  });
});

describe("Phase 5I — submission evidence contract", () => {
  it("rejects empty and whitespace-only evidence", () => {
    expect(hasSubmissionEvidence({})).toBe(false);
    expect(hasSubmissionEvidence({ confirmationEvidence: "   ", storagePath: "" })).toBe(
      false
    );
    expect(() =>
      assertSubmissionEvidence({ confirmationEvidence: "  ", storagePath: null })
    ).toThrow(ValidationError);
    try {
      assertSubmissionEvidence({});
    } catch (err) {
      expect((err as Error).message).toBe(SUBMISSION_EVIDENCE_REQUIRED_MESSAGE);
    }
  });

  it("accepts confirmationEvidence OR storagePath", () => {
    expect(
      assertSubmissionEvidence({ confirmationEvidence: " portal ok ", storagePath: null })
    ).toEqual({ confirmationEvidence: "portal ok", storagePath: null });
    expect(
      assertSubmissionEvidence({
        confirmationEvidence: null,
        storagePath: " tenants/o/a/s/file.png ",
      })
    ).toEqual({
      confirmationEvidence: null,
      storagePath: "tenants/o/a/s/file.png",
    });
  });

  it("RecordApplicationSubmissionSchema rejects missing evidence", () => {
    expect(
      RecordApplicationSubmissionSchema.safeParse({ applicationId: APP_ID }).success
    ).toBe(false);
    expect(
      RecordApplicationSubmissionSchema.safeParse({
        applicationId: APP_ID,
        confirmationEvidence: "   ",
      }).success
    ).toBe(false);
    expect(
      RecordApplicationSubmissionSchema.safeParse({
        applicationId: APP_ID,
        confirmationEvidence: "Confirmed",
      }).success
    ).toBe(true);
    expect(
      RecordApplicationSubmissionSchema.safeParse({
        applicationId: APP_ID,
        storagePath: "tenants/o/a/s/x.pdf",
      }).success
    ).toBe(true);
  });

  it("RecordApplicationResubmissionSchema rejects missing evidence", () => {
    expect(
      RecordApplicationResubmissionSchema.safeParse({ applicationId: APP_ID }).success
    ).toBe(false);
  });
});

describe("Phase 5I — production wiring forensics", () => {
  it("generic transition and approval paths call assertAuthoritativeQaPass", () => {
    const actions = readFileSync(
      join(ROOT, "src/lib/application/actions.ts"),
      "utf8"
    );
    expect(actions).toMatch(/assertAuthoritativeQaPass/);
    expect(actions).toMatch(/REVIEW/);
    expect(actions).toMatch(/AWAITING_APPROVAL/);
    expect(actions).toMatch(/assignedEmployeeId: assigneeId/);

    const qaActions = readFileSync(join(ROOT, "src/lib/qa/actions.ts"), "utf8");
    expect(qaActions).toMatch(/assertAuthoritativeQaPass/);

    const submission = readFileSync(
      join(ROOT, "src/lib/submission/actions.ts"),
      "utf8"
    );
    expect(submission).toMatch(/assertSubmissionEvidence/);
  });

  it("does not add Phase 5I schema/migration", () => {
    const { readdirSync } = require("fs") as typeof import("fs");
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(
      migrations.some((m: string) => /phase5i|authority.?harden/i.test(m))
    ).toBe(false);
  });
});

describe("Phase 5I — transition action negative paths", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("blocks REVIEW → AWAITING_APPROVAL without QA PASS", async () => {
    vi.doMock("@/lib/auth/context", () => ({
      getAuthenticatedContext: vi.fn().mockResolvedValue({
        userId: "22222222-2222-4222-8222-222222222222",
        organizationId: "11111111-1111-4111-8111-111111111111",
        role: "EMPLOYEE",
        email: "staff@test.com",
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      }),
      requireEmployeeOrAdmin: vi.fn(),
      requireAdmin: vi.fn(),
    }));
    vi.doMock("@/lib/db/rls", () => ({
      withRlsContext: vi.fn(async (_uid: string, cb: (tx: unknown) => unknown) =>
        cb({
          application: {
            findUnique: vi.fn().mockResolvedValue({
              id: APP_ID,
              organizationId: "11111111-1111-4111-8111-111111111111",
              status: "REVIEW",
              approvalStatus: null,
              candidate: { userId: "c" },
            }),
            update: vi.fn(),
          },
          applicationStateHistory: { create: vi.fn() },
          applicationQaReview: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          applicationMaterial: { findFirst: vi.fn().mockResolvedValue(null) },
        })
      ),
    }));
    vi.doMock("@/lib/audit", () => ({ logUserAuditEvent: vi.fn() }));

    const { transitionApplicationStatusAction } = await import(
      "@/lib/application/actions"
    );
    const result = await transitionApplicationStatusAction({
      applicationId: APP_ID,
      targetStatus: "AWAITING_APPROVAL",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/QA PASS is required/i);
  });

  it("blocks AWAITING_APPROVAL → READY without QA PASS", async () => {
    vi.doMock("@/lib/auth/context", () => ({
      getAuthenticatedContext: vi.fn().mockResolvedValue({
        userId: "22222222-2222-4222-8222-222222222222",
        organizationId: "11111111-1111-4111-8111-111111111111",
        role: "EMPLOYEE",
        email: "staff@test.com",
        status: "ACTIVE",
        membershipStatus: "ACTIVE",
      }),
      requireEmployeeOrAdmin: vi.fn(),
      requireAdmin: vi.fn(),
    }));
    vi.doMock("@/lib/db/rls", () => ({
      withRlsContext: vi.fn(async (_uid: string, cb: (tx: unknown) => unknown) =>
        cb({
          application: {
            findUnique: vi.fn().mockResolvedValue({
              id: APP_ID,
              organizationId: "11111111-1111-4111-8111-111111111111",
              status: "AWAITING_APPROVAL",
              approvalStatus: "APPROVED",
              candidate: { userId: "c" },
            }),
            update: vi.fn(),
          },
          applicationStateHistory: { create: vi.fn() },
          applicationQaReview: {
            findFirst: vi.fn().mockResolvedValue({
              id: "qa1",
              decision: "FAIL",
              createdAt: new Date(),
              checklistItems: allCriteria(false),
            }),
          },
          applicationMaterial: { findFirst: vi.fn().mockResolvedValue(null) },
        })
      ),
    }));
    vi.doMock("@/lib/audit", () => ({ logUserAuditEvent: vi.fn() }));

    const { transitionApplicationStatusAction } = await import(
      "@/lib/application/actions"
    );
    const result = await transitionApplicationStatusAction({
      applicationId: APP_ID,
      targetStatus: "READY",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/did not PASS|QA/i);
  });
});
