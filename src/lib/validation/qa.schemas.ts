import { z } from "zod";

export const QA_CRITERION_KEYS = [
  "CANDIDATE_JOB_ALIGNMENT",
  "RESUME_ACCURACY",
  "JOB_REQUIREMENTS_MATCH",
  "SALARY_ALIGNMENT",
  "LOCATION_AUTHORIZATION",
  "WORK_AUTHORIZATION",
  "SCREENING_ANSWERS",
  "APPLICATION_COMPLETENESS",
  "CANDIDATE_CONSENT_ACTIVE",
] as const;

export const QaCriterionKeySchema = z.enum(QA_CRITERION_KEYS);

export const QaChecklistItemInputSchema = z.object({
  criterionKey: QaCriterionKeySchema,
  isVerified: z.boolean(),
});

export const CompleteQaReviewSchema = z
  .object({
    applicationId: z.string().uuid("Invalid application ID"),
    decision: z.enum(["PASS", "FAIL"]),
    notes: z.string().max(5000, "Notes cannot exceed 5000 characters").optional().nullable(),
    checklistItems: z
      .array(QaChecklistItemInputSchema)
      .length(9, "Exactly 9 QA criteria must be evaluated")
      .refine((items) => {
        const keys = new Set(items.map((i) => i.criterionKey));
        return keys.size === 9 && QA_CRITERION_KEYS.every((k) => keys.has(k));
      }, "Every authoritative QA criterion key must appear exactly once"),
  })
  .refine(
    (data) => {
      if (data.decision === "FAIL") {
        return typeof data.notes === "string" && data.notes.trim().length > 0;
      }
      return true;
    },
    {
      message: "Mandatory failure/rework notes must be provided when QA decision is FAIL",
      path: ["notes"],
    }
  );

export const CandidateApproveApplicationSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
});

export const CandidateRequestRevisionSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  revisionNotes: z
    .string()
    .min(5, "Please provide details on requested revisions (min 5 characters)")
    .max(2000, "Revision notes cannot exceed 2000 characters"),
});

export type QaChecklistItemInput = z.infer<typeof QaChecklistItemInputSchema>;
export type CompleteQaReviewInput = z.infer<typeof CompleteQaReviewSchema>;
export type CandidateApproveApplicationInput = z.infer<typeof CandidateApproveApplicationSchema>;
export type CandidateRequestRevisionInput = z.infer<typeof CandidateRequestRevisionSchema>;
