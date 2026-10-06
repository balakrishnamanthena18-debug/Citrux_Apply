import { z } from "zod";
import { hasSubmissionEvidence } from "@/lib/submission/evidence";

export const GenerateSubmissionEvidenceUploadUrlSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  filename: z.string().min(1, "Filename is required").max(255),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"], {
    errorMap: () => ({ message: "Allowed file types are PNG, JPEG, WebP, and PDF" }),
  }),
  fileSizeBytes: z
    .number()
    .int()
    .positive("File size must be positive")
    .max(10 * 1024 * 1024, "File size cannot exceed 10 MB"),
});

const submissionEvidenceRefine = (
  data: { confirmationEvidence?: string | null; storagePath?: string | null },
  ctx: z.RefinementCtx
) => {
  if (!hasSubmissionEvidence(data)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Add submission evidence or confirmation before recording submission.",
      path: ["confirmationEvidence"],
    });
  }
};

export const RecordApplicationSubmissionSchema = z
  .object({
    applicationId: z.string().uuid("Invalid application ID"),
    externalReference: z.string().max(255).optional().nullable(),
    externalUrl: z.string().url("Invalid external URL").max(1024).optional().nullable().or(z.literal("")),
    confirmationEvidence: z.string().max(5000).optional().nullable(),
    storagePath: z.string().max(1024).optional().nullable(),
    submissionNotes: z.string().max(5000).optional().nullable(),
  })
  .superRefine(submissionEvidenceRefine);

export const RecordSubmissionIssueSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  issueDescription: z.string().min(5, "Issue description must be at least 5 characters").max(5000),
});

export const ApproveSubmissionCorrectionSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  correctionNotes: z.string().min(5, "Correction notes must be at least 5 characters").max(5000),
});

export const StageApplicationResubmissionSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
});

export const RecordApplicationResubmissionSchema = z
  .object({
    applicationId: z.string().uuid("Invalid application ID"),
    externalReference: z.string().max(255).optional().nullable(),
    externalUrl: z.string().url("Invalid external URL").max(1024).optional().nullable().or(z.literal("")),
    confirmationEvidence: z.string().max(5000).optional().nullable(),
    storagePath: z.string().max(1024).optional().nullable(),
    submissionNotes: z.string().max(5000).optional().nullable(),
  })
  .superRefine(submissionEvidenceRefine);

export const GetSubmissionEvidenceDownloadUrlSchema = z.object({
  submissionId: z.string().uuid("Invalid submission ID"),
});

export type GenerateSubmissionEvidenceUploadUrlInput = z.infer<typeof GenerateSubmissionEvidenceUploadUrlSchema>;
export type RecordApplicationSubmissionInput = z.infer<typeof RecordApplicationSubmissionSchema>;
export type RecordSubmissionIssueInput = z.infer<typeof RecordSubmissionIssueSchema>;
export type ApproveSubmissionCorrectionInput = z.infer<typeof ApproveSubmissionCorrectionSchema>;
export type StageApplicationResubmissionInput = z.infer<typeof StageApplicationResubmissionSchema>;
export type RecordApplicationResubmissionInput = z.infer<typeof RecordApplicationResubmissionSchema>;
export type GetSubmissionEvidenceDownloadUrlInput = z.infer<typeof GetSubmissionEvidenceDownloadUrlSchema>;
