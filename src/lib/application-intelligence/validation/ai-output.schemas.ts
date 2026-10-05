import { z } from "zod";
import { FIT_STATUSES, READINESS_STATES } from "../constants";
import { FACT_PROVENANCE } from "../provenance";
import { SCORING_DIMENSIONS } from "../scoring-contract";
import { RequirementsExtractionOutputSchema } from "../requirements-contract";

/**
 * Untrusted AI output contracts.
 * Flow: AI → Zod → Truth validation → Business rules → Persist
 */

export const FitStatusSchema = z.enum(FIT_STATUSES);
export const FactProvenanceSchema = z.enum(FACT_PROVENANCE);

export const EvidenceRefSchema = z.object({
  entityType: z.string().min(1).max(64),
  entityId: z.string().uuid().optional().nullable(),
  field: z.string().max(128).optional().nullable(),
  provenance: FactProvenanceSchema,
  summary: z.string().max(500),
});

/**
 * Forbidden: AI inventing candidate employment/skills/etc. as new facts.
 * Claims must reference existing entity IDs when asserting MATCHED/PARTIAL,
 * or use UNKNOWN/MISSING without inventing entityIds.
 */
export const FitItemSchema = z
  .object({
    label: z.string().min(1).max(200),
    category: z.string().min(1).max(64),
    status: FitStatusSchema,
    confidence: z.number().min(0).max(1).optional(),
    evidence: z.array(EvidenceRefSchema).default([]),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.status === "MATCHED" || val.status === "PARTIAL") {
      const hasCanonicalEvidence = val.evidence.some(
        (e) =>
          e.provenance === "VERIFIED" ||
          e.provenance === "CANDIDATE_PROVIDED" ||
          e.provenance === "EMPLOYEE_PROVIDED"
      );
      if (!hasCanonicalEvidence) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "MATCHED/PARTIAL requires evidence with canonical provenance (not AI_INFERRED alone)",
        });
      }
    }
  });

export const DimensionScoreOutputSchema = z.object({
  dimension: z.enum(SCORING_DIMENSIONS),
  score: z.number().min(0).max(100).nullable(),
  status: z.enum(["SCORED", "UNKNOWN", "NOT_APPLICABLE"]),
  evidence: z.array(EvidenceRefSchema).default([]),
});

export const AlignmentAIOutputSchema = z.object({
  kind: z.literal("alignment"),
  fitItems: z.array(FitItemSchema).max(200),
  dimensionScores: z.array(DimensionScoreOutputSchema).max(20),
  narrative: z.string().max(2000).optional(),
});

export const ReadinessAIOutputSchema = z.object({
  kind: z.literal("readiness"),
  readinessState: z.enum(READINESS_STATES),
  blockers: z.array(z.string().max(300)).max(50),
  warnings: z.array(z.string().max(300)).max(50),
  nextActions: z.array(z.string().max(300)).max(50),
  evidence: z.array(EvidenceRefSchema).default([]),
});

/** Gate 2 locked requirements extraction schema (importance enum, not boolean). */
export const RequirementsAIOutputSchema = RequirementsExtractionOutputSchema;

/** Reject payloads that try to inject fabricated candidate biographies. */
export const ForbiddenFabricationSchema = z
  .object({
    inventedEmploymentHistory: z.never().optional(),
    inventedSkills: z.never().optional(),
    inventedCertifications: z.never().optional(),
    inventedEducation: z.never().optional(),
    inventedAchievements: z.never().optional(),
  })
  .strict();

export const ApplicationIntelligenceAIOutputSchema = z.union([
  AlignmentAIOutputSchema,
  ReadinessAIOutputSchema,
  RequirementsAIOutputSchema,
]);

export type AlignmentAIOutput = z.infer<typeof AlignmentAIOutputSchema>;
export type ReadinessAIOutput = z.infer<typeof ReadinessAIOutputSchema>;
export type RequirementsAIOutput = z.infer<typeof RequirementsAIOutputSchema>;
