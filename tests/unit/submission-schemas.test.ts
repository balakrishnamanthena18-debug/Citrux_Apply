import { describe, it, expect } from "vitest";
import {
  GenerateSubmissionEvidenceUploadUrlSchema,
  RecordApplicationSubmissionSchema,
  RecordSubmissionIssueSchema,
  ApproveSubmissionCorrectionSchema,
  StageApplicationResubmissionSchema,
  RecordApplicationResubmissionSchema,
  GetSubmissionEvidenceDownloadUrlSchema,
} from "@/lib/validation/submission.schemas";

describe("Phase 6 Submission Zod Validation Schemas (tests/unit/submission-schemas.test.ts)", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";

  describe("GenerateSubmissionEvidenceUploadUrlSchema", () => {
    it("accepts valid evidence upload payload", () => {
      const valid = {
        applicationId: validUuid,
        filename: "screenshot-confirmation.png",
        mimeType: "image/png",
        fileSizeBytes: 2 * 1024 * 1024,
      };
      const result = GenerateSubmissionEvidenceUploadUrlSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects invalid MIME types", () => {
      const invalid = {
        applicationId: validUuid,
        filename: "executable.exe",
        mimeType: "application/x-msdownload",
        fileSizeBytes: 1024,
      };
      const result = GenerateSubmissionEvidenceUploadUrlSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects files exceeding 10 MB limit", () => {
      const invalid = {
        applicationId: validUuid,
        filename: "huge-file.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 11 * 1024 * 1024,
      };
      const result = GenerateSubmissionEvidenceUploadUrlSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("RecordApplicationSubmissionSchema", () => {
    it("accepts valid submission payload with all fields", () => {
      const valid = {
        applicationId: validUuid,
        externalReference: "LEVER-REF-12345",
        externalUrl: "https://jobs.lever.co/company/job-123",
        confirmationEvidence: "Confirmation message received on screen.",
        storagePath: "tenants/org/applications/app/submissions/sub-file.png",
        submissionNotes: "Completed without captcha issues.",
      };
      const result = RecordApplicationSubmissionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("accepts minimal submission payload", () => {
      const valid = {
        applicationId: validUuid,
      };
      const result = RecordApplicationSubmissionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects invalid URL format", () => {
      const invalid = {
        applicationId: validUuid,
        externalUrl: "not-a-valid-url",
      };
      const result = RecordApplicationSubmissionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("RecordSubmissionIssueSchema", () => {
    it("accepts valid issue description of at least 5 characters", () => {
      const valid = {
        applicationId: validUuid,
        issueDescription: "Portal reported invalid phone format",
      };
      const result = RecordSubmissionIssueSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects issue descriptions shorter than 5 characters", () => {
      const invalid = {
        applicationId: validUuid,
        issueDescription: "err",
      };
      const result = RecordSubmissionIssueSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("ApproveSubmissionCorrectionSchema", () => {
    it("accepts valid correction notes of at least 5 characters", () => {
      const valid = {
        applicationId: validUuid,
        correctionNotes: "Updated candidate international dialing code in phone field.",
      };
      const result = ApproveSubmissionCorrectionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects correction notes shorter than 5 characters", () => {
      const invalid = {
        applicationId: validUuid,
        correctionNotes: "done",
      };
      const result = ApproveSubmissionCorrectionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("StageApplicationResubmissionSchema", () => {
    it("accepts valid application ID", () => {
      const valid = { applicationId: validUuid };
      const result = StageApplicationResubmissionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects non-uuid application ID", () => {
      const invalid = { applicationId: "invalid-uuid" };
      const result = StageApplicationResubmissionSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("RecordApplicationResubmissionSchema", () => {
    it("accepts valid resubmission payload", () => {
      const valid = {
        applicationId: validUuid,
        externalReference: "LEVER-REF-RESUB-001",
        externalUrl: "https://jobs.lever.co/company/job-123",
        confirmationEvidence: "Resubmitted successfully.",
      };
      const result = RecordApplicationResubmissionSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe("GetSubmissionEvidenceDownloadUrlSchema", () => {
    it("accepts valid submission ID", () => {
      const valid = { submissionId: validUuid };
      const result = GetSubmissionEvidenceDownloadUrlSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects invalid submission ID", () => {
      const invalid = { submissionId: "abc" };
      const result = GetSubmissionEvidenceDownloadUrlSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
