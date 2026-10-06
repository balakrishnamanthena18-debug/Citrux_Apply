import { z } from "zod";

export const ApplicationOutcomeTypeEnum = z.enum([
  "EMPLOYER_REJECTION",
  "RECRUITER_CONTACT",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "OFFER_RECEIVED",
  "OTHER",
]);

export const CandidateReportableOutcomeTypeEnum = z.enum([
  "EMPLOYER_REJECTION",
  "RECRUITER_CONTACT",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "OFFER_RECEIVED",
]);

const occurredAtSchema = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null || v === "") return null;
    return v instanceof Date ? v : new Date(v);
  });

export const StaffCreateOutcomeSchema = z
  .object({
    applicationId: z.string().uuid(),
    outcomeType: ApplicationOutcomeTypeEnum,
    occurredAt: occurredAtSchema,
    notes: z.string().trim().max(4000).optional().nullable(),
    candidateVisible: z.boolean().optional(),
    evidenceText: z.string().trim().max(8000).optional().nullable(),
    evidenceStoragePath: z.string().trim().max(1024).optional().nullable(),
    evidenceShareable: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.outcomeType === "INTERVIEW_SCHEDULED" && !data.occurredAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INTERVIEW_SCHEDULED requires occurredAt (O6).",
        path: ["occurredAt"],
      });
    }
  });

export const CandidateReportOutcomeSchema = z
  .object({
    applicationId: z.string().uuid(),
    outcomeType: CandidateReportableOutcomeTypeEnum,
    occurredAt: occurredAtSchema,
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.outcomeType === "INTERVIEW_SCHEDULED" && !data.occurredAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INTERVIEW_SCHEDULED requires occurredAt (O6).",
        path: ["occurredAt"],
      });
    }
  });

export const VerifyOutcomeSchema = z.object({
  outcomeId: z.string().uuid(),
  notes: z.string().trim().max(4000).optional().nullable(),
  candidateVisible: z.boolean().optional(),
  evidenceText: z.string().trim().max(8000).optional().nullable(),
  evidenceStoragePath: z.string().trim().max(1024).optional().nullable(),
  evidenceShareable: z.boolean().optional(),
  occurredAt: occurredAtSchema,
});

export const VoidOutcomeSchema = z.object({
  outcomeId: z.string().uuid(),
  reason: z.string().trim().min(3).max(2000),
});

export const SupersedeOutcomeSchema = z
  .object({
    outcomeId: z.string().uuid(),
    outcomeType: ApplicationOutcomeTypeEnum,
    occurredAt: occurredAtSchema,
    notes: z.string().trim().max(4000).optional().nullable(),
    candidateVisible: z.boolean().optional(),
    evidenceText: z.string().trim().max(8000).optional().nullable(),
    evidenceStoragePath: z.string().trim().max(1024).optional().nullable(),
    evidenceShareable: z.boolean().optional(),
    reason: z.string().trim().min(3).max(2000),
  })
  .superRefine((data, ctx) => {
    if (data.outcomeType === "INTERVIEW_SCHEDULED" && !data.occurredAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INTERVIEW_SCHEDULED requires occurredAt (O6).",
        path: ["occurredAt"],
      });
    }
  });

export const GenerateOutcomeEvidenceUploadUrlSchema = z.object({
  applicationId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
});

export type StaffCreateOutcomeInput = z.infer<typeof StaffCreateOutcomeSchema>;
export type CandidateReportOutcomeInput = z.infer<
  typeof CandidateReportOutcomeSchema
>;
export type VerifyOutcomeInput = z.infer<typeof VerifyOutcomeSchema>;
export type VoidOutcomeInput = z.infer<typeof VoidOutcomeSchema>;
export type SupersedeOutcomeInput = z.infer<typeof SupersedeOutcomeSchema>;
