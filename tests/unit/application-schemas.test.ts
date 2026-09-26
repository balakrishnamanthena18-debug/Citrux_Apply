import { describe, it, expect } from "vitest";
import {
  JobCreateSchema,
  JobUpdateSchema,
  ApplicationCreateSchema,
  ApplicationMaterialSchema,
  ApplicationStatusTransitionSchema,
  ApplicationApprovalSchema,
  ApplicationSubmissionSchema,
  ApplicationSubmissionIssueSchema,
  SubmissionCorrectionApprovalSchema,
  ApplicationResubmissionSchema,
  ApplicationStatusEnum,
  JobStatusEnum,
} from "@/lib/validation/application.schemas";

describe("Phase 3 Application Validation Schemas (tests/unit/application-schemas.test.ts)", () => {
  const validUUID = "123e4567-e89b-12d3-a456-426614174000";
  const validUUID2 = "223e4567-e89b-12d3-a456-426614174000";

  it("1. Validates JobCreateSchema required fields and defaults", () => {
    const valid = JobCreateSchema.safeParse({
      title: "Senior Software Engineer",
      companyName: "Stripe",
      jobDescription: "Build distributed payment infrastructure...",
      location: "San Francisco, CA",
      isRemote: true,
      salaryMin: 180000,
      salaryMax: 240000,
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.employmentType).toBe("FULL_TIME");
      expect(valid.data.salaryCurrency).toBe("USD");
      expect(valid.data.isRemote).toBe(true);
    }

    const invalid = JobCreateSchema.safeParse({
      title: "",
      companyName: "Stripe",
      jobDescription: "",
    });
    expect(invalid.success).toBe(false);
  });

  it("2. Validates JobStatusEnum allows exactly OPEN, CLOSED, ARCHIVED (no PAUSED)", () => {
    expect(JobStatusEnum.options).toEqual(["OPEN", "CLOSED", "ARCHIVED"]);
    expect(JobStatusEnum.safeParse("OPEN").success).toBe(true);
    expect(JobStatusEnum.safeParse("CLOSED").success).toBe(true);
    expect(JobStatusEnum.safeParse("ARCHIVED").success).toBe(true);
    expect(JobStatusEnum.safeParse("PAUSED").success).toBe(false);
  });

  it("3. Validates ApplicationStatusEnum contains exactly the 14 V1 PRD states", () => {
    const expectedStates = [
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
      "REJECTED",
      "WITHDRAWN",
      "FAILED",
    ];
    expect(ApplicationStatusEnum.options).toEqual(expectedStates);
  });

  it("4. Validates ApplicationCreateSchema requires UUID candidateId and jobId", () => {
    const valid = ApplicationCreateSchema.safeParse({
      candidateId: validUUID,
      jobId: validUUID2,
    });
    expect(valid.success).toBe(true);

    const invalid = ApplicationCreateSchema.safeParse({
      candidateId: "not-a-uuid",
      jobId: validUUID2,
    });
    expect(invalid.success).toBe(false);
  });

  it("5. Validates ApplicationApprovalSchema boolean flag and notes", () => {
    const approved = ApplicationApprovalSchema.safeParse({
      applicationId: validUUID,
      approved: true,
      feedbackNotes: "Looks great, proceed with submission.",
    });
    expect(approved.success).toBe(true);

    const rejected = ApplicationApprovalSchema.safeParse({
      applicationId: validUUID,
      approved: false,
      feedbackNotes: "Please emphasize AWS experience more.",
    });
    expect(rejected.success).toBe(true);
  });

  it("6. Validates ApplicationSubmissionSchema requires confirmation evidence", () => {
    const valid = ApplicationSubmissionSchema.safeParse({
      applicationId: validUUID,
      externalReference: "LEVER-APP-9988",
      confirmationEvidence: "Thank you for applying to Stripe! Application ID: 9988",
      submissionNotes: "Submitted via official Lever portal.",
    });
    expect(valid.success).toBe(true);

    const missingEvidence = ApplicationSubmissionSchema.safeParse({
      applicationId: validUUID,
      confirmationEvidence: "",
    });
    expect(missingEvidence.success).toBe(false);
  });

  it("7. Validates ApplicationSubmissionIssueSchema and SubmissionCorrectionApprovalSchema", () => {
    const issue = ApplicationSubmissionIssueSchema.safeParse({
      applicationId: validUUID,
      issueDescription: "Portal rejected resume file format.",
    });
    expect(issue.success).toBe(true);

    const correction = SubmissionCorrectionApprovalSchema.safeParse({
      applicationId: validUUID,
      correctionNotes: "Re-exported resume as standard PDF/A.",
    });
    expect(correction.success).toBe(true);
  });
});
