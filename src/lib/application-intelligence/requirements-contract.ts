import { z } from "zod";
import {
  JOB_REQUIREMENT_NORMALIZATION_VERSION,
  JOB_REQUIREMENT_SCHEMA_VERSION,
} from "./constants";

/**
 * Gate 2 — structured job requirement contracts.
 * Requirements are advisory structured views of a JD snapshot.
 * They must NEVER mutate canonical Job rows.
 */

export const REQUIREMENT_CATEGORIES = [
  "REQUIRED_SKILL",
  "PREFERRED_SKILL",
  "EXPERIENCE",
  "EDUCATION",
  "CERTIFICATION",
  "LOCATION",
  "REMOTE_POLICY",
  "WORK_AUTHORIZATION",
  "SALARY",
  "EMPLOYMENT_TYPE",
  "SENIORITY",
  "RESPONSIBILITY",
  "TECHNOLOGY",
  "DOMAIN_KNOWLEDGE",
] as const;

export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

/** Required vs preferred. Ambiguous JD language → UNKNOWN / NEEDS_REVIEW. */
export const REQUIREMENT_IMPORTANCE = [
  "REQUIRED",
  "PREFERRED",
  "UNKNOWN",
  "NEEDS_REVIEW",
] as const;

export type RequirementImportance = (typeof REQUIREMENT_IMPORTANCE)[number];

export const REQUIREMENT_DERIVATION = [
  /** Copied from structured Job columns (location, salary, etc.). */
  "STRUCTURED_JOB_FIELD",
  /** Excerpted / asserted from snapshot JD text with evidence. */
  "SOURCE_JD",
  /** Produced by AI extraction pipeline (Gate 5+). Never becomes Job truth. */
  "AI_EXTRACTED",
] as const;

export type RequirementDerivation = (typeof REQUIREMENT_DERIVATION)[number];

export const RequirementEvidenceSchema = z
  .object({
    snapshotId: z.string().uuid(),
    excerpt: z.string().min(1).max(500),
    charStart: z.number().int().min(0).optional(),
    charEnd: z.number().int().min(0).optional(),
    field: z.string().max(64).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      val.charStart != null &&
      val.charEnd != null &&
      val.charEnd < val.charStart
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "charEnd must be >= charStart",
      });
    }
  });

export const StructuredRequirementSchema = z
  .object({
    id: z.string().uuid(),
    category: z.enum(REQUIREMENT_CATEGORIES),
    rawValue: z.string().min(1).max(300),
    normalizedValue: z.string().min(1).max(300),
    importance: z.enum(REQUIREMENT_IMPORTANCE),
    confidence: z.number().min(0).max(1).nullable(),
    derivation: z.enum(REQUIREMENT_DERIVATION),
    evidence: RequirementEvidenceSchema,
  })
  .strict();

export const JobRequirementSetPayloadSchema = z
  .object({
    schemaVersion: z.literal(JOB_REQUIREMENT_SCHEMA_VERSION),
    normalizationVersion: z.literal(JOB_REQUIREMENT_NORMALIZATION_VERSION),
    snapshotId: z.string().uuid(),
    requirements: z.array(StructuredRequirementSchema).max(300),
  })
  .strict()
  .superRefine((val, ctx) => {
    for (let i = 0; i < val.requirements.length; i++) {
      const req = val.requirements[i]!;
      if (req.evidence.snapshotId !== val.snapshotId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requirements", i, "evidence", "snapshotId"],
          message: "Requirement evidence must reference the parent snapshotId",
        });
      }
    }
  });

export type StructuredRequirement = z.infer<typeof StructuredRequirementSchema>;
export type JobRequirementSetPayload = z.infer<typeof JobRequirementSetPayloadSchema>;

/**
 * Deterministic normalize.v1 rules.
 * Only explicit aliases — no uncontrolled semantic guessing.
 */
const NORMALIZE_V1_ALIASES: Record<string, string> = {
  "react.js": "react",
  reactjs: "react",
  react: "react",
  "node.js": "node",
  nodejs: "node",
  node: "node",
  "next.js": "nextjs",
  nextjs: "nextjs",
  typescript: "typescript",
  ts: "typescript",
  javascript: "javascript",
  js: "javascript",
  postgres: "postgresql",
  postgresql: "postgresql",
  "psql": "postgresql",
};

export function normalizeRequirementValue(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  const key = trimmed.toLowerCase();
  return NORMALIZE_V1_ALIASES[key] ?? trimmed;
}

export function assertRequiredPreferredNotCollapsed(
  requirements: StructuredRequirement[]
): void {
  const hasRequired = requirements.some((r) => r.importance === "REQUIRED");
  const hasPreferred = requirements.some((r) => r.importance === "PREFERRED");
  if (hasRequired && hasPreferred) return;
  // Allowed to have only one class; forbidden is treating them as identical labels.
  for (const r of requirements) {
    if (r.category === "REQUIRED_SKILL" && r.importance === "PREFERRED") {
      throw new Error("REQUIRED_SKILL category cannot have PREFERRED importance");
    }
    if (r.category === "PREFERRED_SKILL" && r.importance === "REQUIRED") {
      throw new Error("PREFERRED_SKILL category cannot have REQUIRED importance");
    }
  }
}

export function validateRequirementEvidenceAgainstSnapshot(input: {
  snapshotId: string;
  snapshotText: string;
  requirement: StructuredRequirement;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (input.requirement.evidence.snapshotId !== input.snapshotId) {
    return {
      ok: false,
      code: "EVIDENCE_SNAPSHOT_MISMATCH",
      message: "Evidence snapshotId does not match requirement set snapshot",
    };
  }

  if (input.requirement.derivation === "STRUCTURED_JOB_FIELD") {
    return { ok: true };
  }

  const excerpt = input.requirement.evidence.excerpt.trim();
  if (!excerpt) {
    return {
      ok: false,
      code: "EVIDENCE_EMPTY",
      message: "Evidence excerpt is required",
    };
  }

  // Case-insensitive containment — does not invent evidence.
  if (!input.snapshotText.toLowerCase().includes(excerpt.toLowerCase())) {
    return {
      ok: false,
      code: "EVIDENCE_NOT_IN_SNAPSHOT",
      message: "Evidence excerpt not found in JD snapshot text",
    };
  }

  return { ok: true };
}

/**
 * Untrusted AI requirements output (Gate 5 pipeline input).
 * Gate 2 locks the schema; Null provider must not fabricate production rows.
 */
export const RequirementsExtractionOutputSchema = z
  .object({
    kind: z.literal("requirements"),
    requirements: z
      .array(
        z
          .object({
            category: z.enum(REQUIREMENT_CATEGORIES),
            value: z.string().min(1).max(300),
            importance: z.enum(REQUIREMENT_IMPORTANCE),
            confidence: z.number().min(0).max(1).nullable(),
            sourceEvidence: z.string().min(1).max(500),
          })
          .strict()
      )
      .max(300),
  })
  .strict();

export type RequirementsExtractionOutput = z.infer<
  typeof RequirementsExtractionOutputSchema
>;
