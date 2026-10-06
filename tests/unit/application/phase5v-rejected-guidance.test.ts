/**
 * Phase 5V — Application guidance truth for REJECTED (neutral terminal copy).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ApplicationStatus } from "@/generated/prisma";
import { ALLOWED_APPLICATION_TRANSITIONS } from "@/lib/application/constants";
import { deriveNextActionGuidance } from "@/lib/application/operations-guidance";
import {
  mapStatusResponsibility,
  resolveWaitingAttribution,
} from "@/lib/application/operations-waiting";
import {
  getCandidateActionRequirement,
  getCandidateStatusPresentation,
} from "@/lib/utils/status-presenter";
import { NEEDS_ATTENTION_STATUSES } from "@/lib/application/operations-types";

const ROOT = join(__dirname, "../../..");

const FALSE_CAUSAL = [
  /rejected by candidate/i,
  /during approval/i,
  /candidate declined/i,
  /employer rejected/i,
  /employer declined/i,
  /your team rejected/i,
  /not selected by employer/i,
  /role was closed/i,
];

describe("Phase 5V — REJECTED entry paths", () => {
  it("allows DISCOVERED → REJECTED", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS.DISCOVERED).toContain(
      ApplicationStatus.REJECTED
    );
  });

  it("allows QUALIFIED → REJECTED", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS.QUALIFIED).toContain(
      ApplicationStatus.REJECTED
    );
  });

  it("allows SUBMITTED → REJECTED", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS.SUBMITTED).toContain(
      ApplicationStatus.REJECTED
    );
  });

  it("REJECTED is terminal (no outbound transitions)", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS.REJECTED).toEqual([]);
  });

  it("AWAITING_APPROVAL cannot transition to REJECTED", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS.AWAITING_APPROVAL).not.toContain(
      ApplicationStatus.REJECTED
    );
    expect(ALLOWED_APPLICATION_TRANSITIONS.AWAITING_APPROVAL).toEqual(
      expect.arrayContaining([
        ApplicationStatus.READY,
        ApplicationStatus.PREPARING,
        ApplicationStatus.WITHDRAWN,
      ])
    );
  });

  it("no other statuses transition to REJECTED beyond DISCOVERED/QUALIFIED/SUBMITTED", () => {
    const sources = (
      Object.entries(ALLOWED_APPLICATION_TRANSITIONS) as Array<
        [ApplicationStatus, ApplicationStatus[]]
      >
    )
      .filter(([, next]) => next.includes(ApplicationStatus.REJECTED))
      .map(([from]) => from)
      .sort();
    expect(sources).toEqual(["DISCOVERED", "QUALIFIED", "SUBMITTED"]);
  });
});

describe("Phase 5V — approval denial is revision, not REJECTED", () => {
  it("candidate approval action maps denial to PREPARING (source forensics)", () => {
    const actions = readFileSync(
      join(ROOT, "src/lib/application/actions.ts"),
      "utf8"
    );
    expect(actions).toContain('approvalStatus: "REVISION_REQUESTED"');
    expect(actions).toContain("APPLICATION_APPROVAL_REJECTED");
    // Denial updates status to PREPARING (revision), never ApplicationStatus.REJECTED
    const denialIdx = actions.indexOf('approvalStatus: "REVISION_REQUESTED"');
    expect(denialIdx).toBeGreaterThan(-1);
    const window = actions.slice(Math.max(0, denialIdx - 400), denialIdx + 200);
    expect(window).toContain("ApplicationStatus.PREPARING");
    expect(window).not.toContain("ApplicationStatus.REJECTED");
  });

  it("candidate revision request path also returns to PREPARING", () => {
    const qa = readFileSync(join(ROOT, "src/lib/qa/actions.ts"), "utf8");
    expect(qa).toContain("candidateRequestRevisionAction");
    expect(qa).toContain("ApplicationStatus.PREPARING");
    expect(qa).toContain("ApplicationApprovalStatus.REVISION_REQUESTED");
    expect(qa).toContain("APPLICATION_REVISION_REQUESTED_BY_CANDIDATE");
  });
});

describe("Phase 5V — REJECTED guidance is neutral", () => {
  it("staff nextAction is neutral terminal wording", () => {
    const guidance = deriveNextActionGuidance("REJECTED");
    expect(guidance).toMatch(/rejected/i);
    expect(guidance).toMatch(/no longer active/i);
    for (const re of FALSE_CAUSAL) {
      expect(guidance, String(re)).not.toMatch(re);
    }
  });

  it("REJECTED guidance does not claim candidate approval rejection", () => {
    expect(deriveNextActionGuidance("REJECTED")).not.toMatch(
      /candidate during approval/i
    );
  });

  it("same neutral guidance regardless of conceptual entry path", () => {
    // Guidance is status-only (no fromStatus) — must stay path-agnostic
    const g = deriveNextActionGuidance("REJECTED");
    expect(g).toBe("Application was rejected and is no longer active.");
  });

  it("candidate presentation is terminal and causally neutral", () => {
    const pres = getCandidateStatusPresentation("REJECTED");
    expect(pres.isTerminal).toBe(true);
    expect(pres.label).toMatch(/rejected/i);
    for (const re of FALSE_CAUSAL) {
      expect(pres.description, String(re)).not.toMatch(re);
      expect(pres.label, String(re)).not.toMatch(re);
    }
    const action = getCandidateActionRequirement("REJECTED");
    expect(action.actionText).toBe("Application closed");
    expect(action.isActionRequired).toBe(false);
  });

  it("source files contain no prohibited REJECTED causal claims", () => {
    const guidance = readFileSync(
      join(ROOT, "src/lib/application/operations-guidance.ts"),
      "utf8"
    );
    const presenter = readFileSync(
      join(ROOT, "src/lib/utils/status-presenter.ts"),
      "utf8"
    );
    expect(guidance).not.toMatch(/rejected by candidate during approval/i);
    expect(presenter).not.toMatch(/not selected by employer/i);
    expect(presenter).not.toMatch(/Role was closed or candidate was not selected/i);
  });
});

describe("Phase 5V — 5T / 5O / 5R / NEEDS_ATTENTION regression", () => {
  it("REJECTED waiting attribution unchanged (NONE / TERMINAL)", () => {
    const mapped = mapStatusResponsibility("REJECTED");
    expect(mapped).toEqual({
      expectedActor: "NONE",
      waitingKind: "TERMINAL",
    });
    const waiting = resolveWaitingAttribution("REJECTED", new Date(), {
      statusHistoryEnteredAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(waiting.waitingForLabel).toBe("Terminal");
    expect(waiting.expectedActor).toBe("NONE");
  });

  it("does not invent stuck/SLA language", () => {
    const g = deriveNextActionGuidance("REJECTED");
    expect(g).not.toMatch(/stuck|overdue|sla|escalat/i);
  });

  it("NEEDS_ATTENTION frozen (REJECTED not added by age)", () => {
    expect([...NEEDS_ATTENTION_STATUSES]).not.toContain("REJECTED");
  });

  it("continuity/orphan queues still present in ops types", () => {
    const types = readFileSync(
      join(ROOT, "src/lib/application/operations-types.ts"),
      "utf8"
    );
    expect(types).toContain('"orphaned"');
    expect(types).toContain('"continuity"');
    expect(types).toContain("waitingKind");
    expect(types).not.toContain("waitingContext");
  });

  it("SCHEMA CHANGES = 0 for rejection taxonomy", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    expect(schema).not.toMatch(/enum Rejection(Source|Type|Actor|Reason)/);
    expect(schema).toContain("rejectionReason"); // existing optional free text — unchanged
  });
});
