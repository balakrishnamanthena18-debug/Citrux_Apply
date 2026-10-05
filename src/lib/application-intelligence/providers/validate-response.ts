import { ApplicationIntelligenceAIOutputSchema } from "../validation/ai-output.schemas";
import { validateAlignmentAgainstCandidateTruth } from "../validation/truth-validation";
import { RequirementsExtractionOutputSchema } from "../requirements-contract";
import { ProviderError } from "./errors";
import type { StructuredAIProviderResponse } from "./types";

export type ValidatedProviderOutput =
  | {
      kind: "alignment" | "readiness" | "requirements";
      data: unknown;
      providerId: string;
      modelId: string;
      requestId?: string | null;
    };

/**
 * Zod validation of untrusted provider payload.
 * Never persists. Never mutates candidate truth.
 */
export function validateProviderStructuredOutput(
  response: StructuredAIProviderResponse
): ValidatedProviderOutput {
  const parsed = ApplicationIntelligenceAIOutputSchema.safeParse(
    response.payload
  );
  if (!parsed.success) {
    // Also accept requirements schema directly (same union member).
    const req = RequirementsExtractionOutputSchema.safeParse(response.payload);
    if (!req.success) {
      throw new ProviderError(
        "SCHEMA_VALIDATION_ERROR",
        "AI output failed schema validation",
        {
          retryable: false,
          requestId: response.requestId,
          details: {
            issues: parsed.error.issues.slice(0, 5).map((i) => i.message),
          },
        }
      );
    }
    return {
      kind: "requirements",
      data: req.data,
      providerId: response.providerId,
      modelId: response.modelId,
      requestId: response.requestId,
    };
  }

  return {
    kind: parsed.data.kind,
    data: parsed.data,
    providerId: response.providerId,
    modelId: response.modelId,
    requestId: response.requestId,
  };
}

/**
 * Truth validation after Zod. Rejects fabricated candidate entity references.
 */
export function truthValidateProviderOutput(
  validated: ValidatedProviderOutput,
  knownEntityIds: Set<string>
): ValidatedProviderOutput {
  if (validated.kind === "alignment") {
    const result = validateAlignmentAgainstCandidateTruth(
      validated.data as Parameters<
        typeof validateAlignmentAgainstCandidateTruth
      >[0],
      knownEntityIds
    );
    if (!result.ok) {
      throw new ProviderError(
        "TRUTH_VALIDATION_ERROR",
        "AI output failed truth validation",
        {
          retryable: false,
          requestId: validated.requestId,
          details: { errors: result.errors.slice(0, 10) },
        }
      );
    }
  }

  // Requirements / readiness: entity fabrication checked at later gates;
  // Gate 3 ensures schema + alignment truth path is enforced.
  return validated;
}

/**
 * Full untrusted pipeline: structured parse → Zod → truth.
 * AI → Database is forbidden; callers persist only after business rules.
 */
export function validateUntrustedProviderResponse(
  response: StructuredAIProviderResponse,
  knownEntityIds: Set<string> = new Set()
): ValidatedProviderOutput {
  const structured = validateProviderStructuredOutput(response);
  return truthValidateProviderOutput(structured, knownEntityIds);
}
