import { z } from "zod";

export const JobEmploymentTypeEnum = z.enum([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "TEMPORARY",
]);

export const JobStatusEnum = z.enum([
  "OPEN",
  "CLOSED",
  "ARCHIVED",
]);

export const ApplicationStatusEnum = z.enum([
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
]);

export const ApplicationApprovalStatusEnum = z.enum([
  "PENDING",
  "APPROVED",
  "REVISION_REQUESTED",
]);

export const JobCreateSchema = z.object({
  title: z.string().trim().min(1, "Job title is required").max(255),
  companyName: z.string().trim().min(1, "Company name is required").max(255),
  jobDescription: z.string().trim().min(1, "Job description is required"),
  location: z.string().trim().max(255).optional().nullable(),
  isRemote: z.boolean().default(false),
  employmentType: JobEmploymentTypeEnum.default("FULL_TIME"),
  salaryMin: z.number().int().min(0).max(10000000).optional().nullable(),
  salaryMax: z.number().int().min(0).max(10000000).optional().nullable(),
  salaryCurrency: z.string().trim().min(3).max(10).default("USD"),
  source: z.string().trim().max(100).optional().nullable(),
  externalUrl: z.string().trim().url().max(1024).optional().nullable().or(z.literal("")),
  qualificationNotes: z.string().trim().max(5000).optional().nullable(),
});

export const JobUpdateSchema = z.object({
  jobId: z.string().uuid("Invalid job ID"),
  title: z.string().trim().min(1).max(255).optional(),
  companyName: z.string().trim().min(1).max(255).optional(),
  jobDescription: z.string().trim().min(1).optional(),
  location: z.string().trim().max(255).optional().nullable(),
  isRemote: z.boolean().optional(),
  employmentType: JobEmploymentTypeEnum.optional(),
  salaryMin: z.number().int().min(0).max(10000000).optional().nullable(),
  salaryMax: z.number().int().min(0).max(10000000).optional().nullable(),
  salaryCurrency: z.string().trim().min(3).max(10).optional(),
  source: z.string().trim().max(100).optional().nullable(),
  externalUrl: z.string().trim().url().max(1024).optional().nullable().or(z.literal("")),
  qualificationNotes: z.string().trim().max(5000).optional().nullable(),
  status: JobStatusEnum.optional(),
});

export const ApplicationCreateSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID"),
  jobId: z.string().uuid("Invalid job ID"),
  assignedEmployeeId: z.string().uuid("Invalid employee ID").optional().nullable(),
});

export const ApplicationMaterialSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  candidateDocumentId: z.string().uuid("Invalid document ID").optional().nullable(),
  documentVersion: z.number().int().min(1).optional().nullable(),
  coverLetterText: z.string().trim().max(10000).optional().nullable(),
  screeningAnswers: z.record(z.string(), z.any()).optional().nullable(),
  customNotes: z.string().trim().max(5000).optional().nullable(),
});

export const ApplicationStatusTransitionSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  targetStatus: ApplicationStatusEnum,
  reason: z.string().trim().max(2000).optional().nullable(),
});

export const ApplicationApprovalSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  approved: z.boolean(),
  feedbackNotes: z.string().trim().max(2000).optional().nullable(),
});

export const ApplicationSubmissionSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  externalReference: z.string().trim().max(255).optional().nullable(),
  externalUrl: z.string().trim().url().max(1024).optional().nullable().or(z.literal("")),
  confirmationEvidence: z.string().trim().min(1, "Submission confirmation evidence is required"),
  submissionNotes: z.string().trim().max(5000).optional().nullable(),
});

export const ApplicationSubmissionIssueSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  issueDescription: z.string().trim().min(1, "Issue description is required").max(5000),
});

export const SubmissionCorrectionApprovalSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  correctionNotes: z.string().trim().min(1, "Correction notes are required").max(5000),
});

export const ApplicationResubmissionSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  externalReference: z.string().trim().max(255).optional().nullable(),
  externalUrl: z.string().trim().url().max(1024).optional().nullable().or(z.literal("")),
  confirmationEvidence: z.string().trim().min(1, "Resubmission evidence is required"),
  submissionNotes: z.string().trim().max(5000).optional().nullable(),
});

export const ApplicationAssignSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  employeeId: z.string().uuid("Invalid employee ID").nullable(),
});

export const StartApplicationDeskSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID"),
  companyName: z.string().trim().min(1, "Company name is required").max(255),
  title: z.string().trim().min(1, "Job title is required").max(255),
  source: z.string().trim().min(1, "Source is required").max(100),
  externalUrl: z.string().trim().url().max(1024).optional().nullable().or(z.literal("")),
  location: z.string().trim().max(255).optional().nullable(),
  employmentType: JobEmploymentTypeEnum.default("FULL_TIME"),
  isRemote: z.boolean().default(false),
  salaryMin: z.number().int().min(0).max(10000000).optional().nullable(),
  salaryMax: z.number().int().min(0).max(10000000).optional().nullable(),
  salaryCurrency: z.string().trim().min(3).max(10).default("USD"),
  jobDescription: z.string().trim().optional().nullable(),
  internalNotes: z.string().trim().max(5000).optional().nullable(),
});

export type JobCreateInput = z.input<typeof JobCreateSchema>;
export type JobUpdateInput = z.input<typeof JobUpdateSchema>;
export type ApplicationCreateInput = z.input<typeof ApplicationCreateSchema>;
export type ApplicationMaterialInput = z.input<typeof ApplicationMaterialSchema>;
export type ApplicationStatusTransitionInput = z.input<typeof ApplicationStatusTransitionSchema>;
export type ApplicationApprovalInput = z.input<typeof ApplicationApprovalSchema>;
export type ApplicationSubmissionInput = z.input<typeof ApplicationSubmissionSchema>;
export type ApplicationSubmissionIssueInput = z.input<typeof ApplicationSubmissionIssueSchema>;
export type SubmissionCorrectionApprovalInput = z.input<typeof SubmissionCorrectionApprovalSchema>;
export type ApplicationResubmissionInput = z.input<typeof ApplicationResubmissionSchema>;
export type ApplicationAssignInput = z.input<typeof ApplicationAssignSchema>;
export type StartApplicationDeskInput = z.input<typeof StartApplicationDeskSchema>;

