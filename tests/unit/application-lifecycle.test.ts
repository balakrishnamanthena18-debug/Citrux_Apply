import { describe, it, expect } from "vitest";
import { ALLOWED_APPLICATION_TRANSITIONS } from "@/lib/application/constants";
import { ApplicationStatus } from "@/generated/prisma";

describe("Application Lifecycle State Machine (tests/unit/application-lifecycle.test.ts)", () => {
  it("1. Verifies exactly 14 application states exist in state machine graph", () => {
    const states = Object.keys(ALLOWED_APPLICATION_TRANSITIONS);
    expect(states).toHaveLength(14);
  });

  it("2. Verifies terminal states (REJECTED, WITHDRAWN, FAILED) have zero outgoing transitions", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.REJECTED]).toEqual([]);
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.WITHDRAWN]).toEqual([]);
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.FAILED]).toEqual([]);
  });

  it("3. Verifies Universal Candidate Approval path (REVIEW -> AWAITING_APPROVAL -> READY)", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.REVIEW]).toContain(ApplicationStatus.AWAITING_APPROVAL);
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.AWAITING_APPROVAL]).toContain(ApplicationStatus.READY);
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.AWAITING_APPROVAL]).toContain(ApplicationStatus.PREPARING);
  });

  it("4. Verifies Submission Correction Cycle (SUBMITTED -> SUBMISSION_ISSUE -> REVIEW_REQUIRED -> CORRECTION_APPROVED -> RESUBMISSION -> SUBMITTED)", () => {
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).toContain(ApplicationStatus.SUBMISSION_ISSUE);
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMISSION_ISSUE]).toContain(ApplicationStatus.REVIEW_REQUIRED);
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.REVIEW_REQUIRED]).toContain(ApplicationStatus.CORRECTION_APPROVED);
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.CORRECTION_APPROVED]).toContain(ApplicationStatus.RESUBMISSION);
    expect(ALLOWED_APPLICATION_TRANSITIONS[ApplicationStatus.RESUBMISSION]).toContain(ApplicationStatus.SUBMITTED);
  });

  it("5. Verifies all pre-submission active states allow WITHDRAWN", () => {
    const preSubmissionStates: ApplicationStatus[] = [
      ApplicationStatus.DISCOVERED,
      ApplicationStatus.QUALIFIED,
      ApplicationStatus.PREPARING,
      ApplicationStatus.REVIEW,
      ApplicationStatus.AWAITING_APPROVAL,
      ApplicationStatus.READY,
    ];

    for (const state of preSubmissionStates) {
      expect(ALLOWED_APPLICATION_TRANSITIONS[state]).toContain(ApplicationStatus.WITHDRAWN);
    }
  });
});
