/**
 * Phase 5T — Actor-Attributed Waiting & Responsibility Labels.
 * No SLA, stuck, thresholds, or NEEDS_ATTENTION expansion.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { ApplicationStatus } from "@/generated/prisma";
import {
  assertNextActionConsistentWithWaiting,
  mapStatusResponsibility,
  resolveWaitingAttribution,
} from "@/lib/application/operations-waiting";
import { NEEDS_ATTENTION_STATUSES } from "@/lib/application/operations-types";
import { deriveNextActionGuidance } from "@/lib/application/operations-guidance";

const ROOT = join(__dirname, "../../..");
const NOW = new Date("2026-10-06T12:00:00.000Z");

const ALL_STATUSES: ApplicationStatus[] = [
  "DISCOVERED",
  "QUALIFIED",
  "PREPARING",
  "REVIEW",
  "AWAITING_APPROVAL",
  "READY",
  "SUBMITTED",
  "SUBMISSION_ISSUE",
  "REVIEW_REQUIRED",
  "CORRECTION_APPROVED",
  "RESUBMISSION",
  "FAILED",
  "REJECTED",
  "WITHDRAWN",
];

const EXPECTED_MAP: Record<
  ApplicationStatus,
  { expectedActor: string; waitingKind: string }
> = {
  DISCOVERED: { expectedActor: "EMPLOYEE", waitingKind: "EMPLOYEE_ACTION" },
  QUALIFIED: { expectedActor: "EMPLOYEE", waitingKind: "EMPLOYEE_ACTION" },
  PREPARING: { expectedActor: "EMPLOYEE", waitingKind: "EMPLOYEE_ACTION" },
  REVIEW: { expectedActor: "EMPLOYEE", waitingKind: "QA_REVIEW" },
  AWAITING_APPROVAL: {
    expectedActor: "CANDIDATE",
    waitingKind: "CANDIDATE_RESPONSE",
  },
  READY: { expectedActor: "EMPLOYEE", waitingKind: "EMPLOYEE_ACTION" },
  SUBMITTED: { expectedActor: "EXTERNAL", waitingKind: "EXTERNAL_OUTCOME" },
  SUBMISSION_ISSUE: { expectedActor: "EMPLOYEE", waitingKind: "EMPLOYEE_ACTION" },
  REVIEW_REQUIRED: { expectedActor: "EMPLOYEE", waitingKind: "EMPLOYEE_ACTION" },
  CORRECTION_APPROVED: {
    expectedActor: "EMPLOYEE",
    waitingKind: "EMPLOYEE_ACTION",
  },
  RESUBMISSION: { expectedActor: "EMPLOYEE", waitingKind: "EMPLOYEE_ACTION" },
  FAILED: { expectedActor: "NONE", waitingKind: "TERMINAL" },
  REJECTED: { expectedActor: "NONE", waitingKind: "TERMINAL" },
  WITHDRAWN: { expectedActor: "NONE", waitingKind: "TERMINAL" },
};

describe("Phase 5T — status → actor / waitingKind map", () => {
  it.each(ALL_STATUSES)("%s maps correctly", (status) => {
    const mapped = mapStatusResponsibility(status);
    expect(mapped).toEqual(EXPECTED_MAP[status]);
  });

  it("does not invent STUCK / OVERDUE / SLA waiting kinds", () => {
    const kinds = new Set(
      ALL_STATUSES.map((s) => mapStatusResponsibility(s).waitingKind)
    );
    expect(kinds.has("STUCK" as never)).toBe(false);
    expect(kinds.has("OVERDUE" as never)).toBe(false);
    expect(kinds.has("SLA_BREACH" as never)).toBe(false);
    expect(kinds.has("ESCALATED" as never)).toBe(false);
  });
});

describe("Phase 5T — waitingSince / age", () => {
  it("uses status-history entry for normal lifecycle waiting", () => {
    const entered = new Date("2026-10-03T12:00:00.000Z");
    const w = resolveWaitingAttribution("READY", NOW, {
      statusHistoryEnteredAt: entered,
      approvalRequestedAt: null,
    });
    expect(w.expectedActor).toBe("EMPLOYEE");
    expect(w.waitingKind).toBe("EMPLOYEE_ACTION");
    expect(w.waitingForLabel).toBe("Employee action");
    expect(w.waitingSince).toBe(entered.toISOString());
    expect(w.waitingAgeKind).toBe("AGE");
    expect(w.waitingAgeLabel).toBe("3 days");
  });

  it("AGE_UNAVAILABLE when history missing", () => {
    const w = resolveWaitingAttribution("PREPARING", NOW, {
      statusHistoryEnteredAt: null,
    });
    expect(w.waitingAgeKind).toBe("AGE_UNAVAILABLE");
    expect(w.waitingSince).toBeNull();
    expect(w.waitingAgeLabel).toBe("AGE_UNAVAILABLE");
    expect(w.waitingKind).toBe("EMPLOYEE_ACTION");
  });

  it("does not fabricate age from mismatch (null history)", () => {
    const w = resolveWaitingAttribution("SUBMITTED", NOW, {
      statusHistoryEnteredAt: null,
      approvalRequestedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    // approvalRequestedAt only applies to AWAITING_APPROVAL
    expect(w.waitingAgeKind).toBe("AGE_UNAVAILABLE");
    expect(w.waitingKind).toBe("EXTERNAL_OUTCOME");
  });

  it("AWAITING_APPROVAL prefers approvalRequestedAt", () => {
    const approvalAt = new Date("2026-10-03T12:00:00.000Z");
    const historyAt = new Date("2026-10-05T12:00:00.000Z");
    const w = resolveWaitingAttribution("AWAITING_APPROVAL", NOW, {
      statusHistoryEnteredAt: historyAt,
      approvalRequestedAt: approvalAt,
    });
    expect(w.expectedActor).toBe("CANDIDATE");
    expect(w.waitingKind).toBe("CANDIDATE_RESPONSE");
    expect(w.waitingForLabel).toBe("Candidate");
    expect(w.waitingSince).toBe(approvalAt.toISOString());
    expect(w.waitingAgeLabel).toBe("3 days");
  });

  it("AWAITING_APPROVAL without approvalRequestedAt falls back to history", () => {
    const historyAt = new Date("2026-10-04T12:00:00.000Z");
    const w = resolveWaitingAttribution("AWAITING_APPROVAL", NOW, {
      statusHistoryEnteredAt: historyAt,
      approvalRequestedAt: null,
    });
    expect(w.waitingSince).toBe(historyAt.toISOString());
    expect(w.waitingAgeLabel).toBe("2 days");
  });

  it("AWAITING_APPROVAL with neither timestamp is AGE_UNAVAILABLE", () => {
    const w = resolveWaitingAttribution("AWAITING_APPROVAL", NOW, {
      statusHistoryEnteredAt: null,
      approvalRequestedAt: null,
    });
    expect(w.waitingAgeKind).toBe("AGE_UNAVAILABLE");
    expect(w.waitingKind).toBe("CANDIDATE_RESPONSE");
  });

  it("SUBMITTED old → EXTERNAL_OUTCOME, never stuck language", () => {
    const entered = new Date("2026-09-22T12:00:00.000Z");
    const w = resolveWaitingAttribution("SUBMITTED", NOW, {
      statusHistoryEnteredAt: entered,
    });
    expect(w.waitingKind).toBe("EXTERNAL_OUTCOME");
    expect(w.waitingForLabel).toBe("External outcome");
    expect(w.waitingAgeLabel).toBe("14 days");
    expect(w.waitingAgeLabel.toLowerCase()).not.toMatch(/stuck|overdue|sla|late/);
  });

  it("READY old → EMPLOYEE_ACTION, never stuck language", () => {
    const entered = new Date("2026-09-26T12:00:00.000Z");
    const w = resolveWaitingAttribution("READY", NOW, {
      statusHistoryEnteredAt: entered,
    });
    expect(w.waitingKind).toBe("EMPLOYEE_ACTION");
    expect(w.waitingAgeLabel).toBe("10 days");
    expect(w.waitingAgeLabel.toLowerCase()).not.toMatch(/stuck|overdue|sla|late/);
  });

  it("terminal states → TERMINAL / NONE", () => {
    for (const status of ["FAILED", "REJECTED", "WITHDRAWN"] as const) {
      const w = resolveWaitingAttribution(status, NOW, {
        statusHistoryEnteredAt: new Date("2026-10-01T00:00:00.000Z"),
      });
      expect(w.expectedActor).toBe("NONE");
      expect(w.waitingKind).toBe("TERMINAL");
      expect(w.waitingForLabel).toBe("Terminal");
    }
  });
});

describe("Phase 5T — next-action consistency", () => {
  it.each(ALL_STATUSES)("%s nextAction consistent with waitingKind", (status) => {
    const { ok, nextAction, waitingKind } =
      assertNextActionConsistentWithWaiting(status);
    expect(ok, `${status}: ${waitingKind} vs "${nextAction}"`).toBe(true);
    expect(deriveNextActionGuidance(status).length).toBeGreaterThan(0);
  });
});

describe("Phase 5T — NEEDS_ATTENTION remains frozen", () => {
  it("does not expand NEEDS_ATTENTION by age or waitingKind", () => {
    expect([...NEEDS_ATTENTION_STATUSES]).toEqual([
      "AWAITING_APPROVAL",
      "SUBMISSION_ISSUE",
      "REVIEW_REQUIRED",
      "CORRECTION_APPROVED",
      "RESUBMISSION",
      "FAILED",
    ]);
    // READY / SUBMITTED / PREPARING stay out regardless of age
    expect([...NEEDS_ATTENTION_STATUSES]).not.toContain("READY");
    expect([...NEEDS_ATTENTION_STATUSES]).not.toContain("SUBMITTED");
    expect([...NEEDS_ATTENTION_STATUSES]).not.toContain("PREPARING");
    expect([...NEEDS_ATTENTION_STATUSES]).not.toContain("REVIEW");
  });

  it("waiting module does not implement stuck/SLA/escalation logic", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/application/operations-waiting.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\bisStuck\b/);
    expect(src).not.toMatch(/\bstuckSince\b/);
    expect(src).not.toMatch(/\bstuckReason\b/);
    expect(src).not.toMatch(/escalateApplication|createEscalation|SLA_BREACH/);
    expect(src).not.toMatch(/\bOVERDUE\b/);
    // Explicitly forbids thresholds in product code
    expect(src).not.toMatch(/24\s*\*\s*60\s*\*\s*60|48\s*\*\s*HOUR|7\s*\*\s*DAY/);
  });
});

describe("Phase 5T — schema / UI / security surfaces", () => {
  it("SCHEMA CHANGES = 0 (no WaitingKind / ExpectedActor prisma enum)", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).not.toMatch(/enum WaitingKind/);
    expect(schema).not.toMatch(/enum ExpectedActor/);
    expect(schema).not.toMatch(/waitingSince/);
    expect(schema).not.toMatch(/isStuck/);
    const migrations = readdirSync(join(ROOT, "prisma/migrations"));
    expect(migrations.some((m) => /phase5t|waiting_kind|expected_actor/i.test(m))).toBe(
      false
    );
  });

  it("ops console exposes Waiting For without stuck wording", () => {
    const workbench = readFileSync(
      join(ROOT, "src/components/application/EmployeeApplicationsWorkbench.tsx"),
      "utf8"
    );
    expect(workbench).toContain("Waiting For");
    expect(workbench).toContain("waitingForLabel");
    expect(workbench).not.toMatch(/Stuck for/i);
    expect(workbench).not.toMatch(/SLA breach/i);
    expect(workbench).not.toMatch(/overdue/i);
  });

  it("staff detail exposes Waiting For / Waiting Since", () => {
    const detail = readFileSync(
      join(ROOT, "src/app/(dashboard)/employee/applications/[id]/page.tsx"),
      "utf8"
    );
    expect(detail).toContain("resolveWaitingAttribution");
    expect(detail).toContain("Waiting For");
    expect(detail).toContain("Waiting Since");
    expect(detail).not.toMatch(/Stuck for/i);
  });

  it("candidate application detail does not import staff waiting attribution", () => {
    const candidateDetail = readFileSync(
      join(ROOT, "src/app/(dashboard)/candidate/applications/[id]/page.tsx"),
      "utf8"
    );
    expect(candidateDetail).not.toContain("operations-waiting");
    expect(candidateDetail).not.toContain("waitingForLabel");
    expect(candidateDetail).not.toContain("expectedActor");
  });

  it("ops read model loads approvalRequestedAt and derives waiting without N+1 age queries", () => {
    const read = readFileSync(
      join(ROOT, "src/lib/application/operations-read.ts"),
      "utf8"
    );
    expect(read).toContain("approvalRequestedAt: true");
    expect(read).toContain("resolveWaitingAttribution");
    expect(read).toContain("assertClientScopeIgnored");
    // Still batched history load
    expect(read).toContain("attachAgesFromHistoryBatch");
    expect(read).toContain("applicationId: { in: ids }");
  });

  it("forged client scope identifiers remain ignored by contract", () => {
    const read = readFileSync(
      join(ROOT, "src/lib/application/operations-read.ts"),
      "utf8"
    );
    expect(read).toMatch(/never accepted|never reads these keys/i);
    expect(read).toContain("assertClientScopeIgnored");
  });

  it("5O orphan queue and 5R continuity queue remain in operational queues", () => {
    const types = readFileSync(
      join(ROOT, "src/lib/application/operations-types.ts"),
      "utf8"
    );
    expect(types).toContain('"orphaned"');
    expect(types).toContain('"continuity"');
    expect(types).toContain("ownerInactive");
    expect(types).toContain("continuityOutsideScope");
    expect(types).toContain("expectedActor");
    expect(types).toContain("waitingKind");
  });
});
