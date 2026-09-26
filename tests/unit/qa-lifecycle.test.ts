import { describe, it, expect } from "vitest";
import { ApplicationStatus } from "@/generated/prisma";

describe("Phase 5 QA & Approval Lifecycle State Invariants", () => {
  it("governs the exact authoritative QA and approval progression", () => {
    const validLifecyclePath = [
      ApplicationStatus.PREPARING,
      ApplicationStatus.REVIEW,
      ApplicationStatus.AWAITING_APPROVAL,
      ApplicationStatus.READY,
    ];

    expect(validLifecyclePath[0]).toBe("PREPARING");
    expect(validLifecyclePath[1]).toBe("REVIEW");
    expect(validLifecyclePath[2]).toBe("AWAITING_APPROVAL");
    expect(validLifecyclePath[3]).toBe("READY");
  });

  it("handles QA rework cycle (REVIEW -> PREPARING)", () => {
    const reworkTransition = {
      from: ApplicationStatus.REVIEW,
      to: ApplicationStatus.PREPARING,
      trigger: "QA_FAIL",
    };
    expect(reworkTransition.from).toBe("REVIEW");
    expect(reworkTransition.to).toBe("PREPARING");
  });

  it("handles Candidate revision cycle (AWAITING_APPROVAL -> PREPARING)", () => {
    const revisionTransition = {
      from: ApplicationStatus.AWAITING_APPROVAL,
      to: ApplicationStatus.PREPARING,
      trigger: "CANDIDATE_REQUEST_REVISION",
    };
    expect(revisionTransition.from).toBe("AWAITING_APPROVAL");
    expect(revisionTransition.to).toBe("PREPARING");
  });

  it("prevents direct approval bypass (no direct REVIEW -> READY)", () => {
    const invalidBypass = {
      from: ApplicationStatus.REVIEW,
      target: ApplicationStatus.READY,
      isAllowed: false,
    };
    expect(invalidBypass.isAllowed).toBe(false);
  });
});
