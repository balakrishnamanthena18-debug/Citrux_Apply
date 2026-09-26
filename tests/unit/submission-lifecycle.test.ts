import { describe, it, expect } from "vitest";
import { ALLOWED_APPLICATION_TRANSITIONS } from "@/lib/application/constants";
import { ApplicationStatus } from "@/generated/prisma";

describe("Phase 6 Submission Lifecycle State Machine Invariants (tests/unit/submission-lifecycle.test.ts)", () => {
  it("allows READY to transition to SUBMITTED and WITHDRAWN", () => {
    const transitions = ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.READY];
    expect(transitions).toContain(ApplicationStatus.SUBMITTED);
    expect(transitions).toContain(ApplicationStatus.WITHDRAWN);
  });

  it("allows SUBMITTED to transition to SUBMISSION_ISSUE and REJECTED", () => {
    const transitions = ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED];
    expect(transitions).toContain(ApplicationStatus.SUBMISSION_ISSUE);
    expect(transitions).toContain(ApplicationStatus.REJECTED);
  });

  it("allows SUBMISSION_ISSUE to transition to REVIEW_REQUIRED and FAILED", () => {
    const transitions = ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMISSION_ISSUE];
    expect(transitions).toContain(ApplicationStatus.REVIEW_REQUIRED);
    expect(transitions).toContain(ApplicationStatus.FAILED);
  });

  it("allows REVIEW_REQUIRED to transition to CORRECTION_APPROVED and FAILED", () => {
    const transitions = ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.REVIEW_REQUIRED];
    expect(transitions).toContain(ApplicationStatus.CORRECTION_APPROVED);
    expect(transitions).toContain(ApplicationStatus.FAILED);
  });

  it("allows CORRECTION_APPROVED to transition to RESUBMISSION", () => {
    const transitions = ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.CORRECTION_APPROVED];
    expect(transitions).toContain(ApplicationStatus.RESUBMISSION);
  });

  it("allows RESUBMISSION to transition to SUBMITTED and FAILED", () => {
    const transitions = ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.RESUBMISSION];
    expect(transitions).toContain(ApplicationStatus.SUBMITTED);
    expect(transitions).toContain(ApplicationStatus.FAILED);
  });

  it("prohibits skipping correction states (e.g. SUBMISSION_ISSUE -> SUBMITTED)", () => {
    const transitions = ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMISSION_ISSUE];
    expect(transitions).not.toContain(ApplicationStatus.SUBMITTED);
    expect(transitions).not.toContain(ApplicationStatus.READY);
  });

  it("prohibits candidate direct bypass from REVIEW to READY without AWAITING_APPROVAL", () => {
    const transitions = ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.REVIEW];
    expect(transitions).not.toContain(ApplicationStatus.READY);
    expect(transitions).toContain(ApplicationStatus.AWAITING_APPROVAL);
  });
});
