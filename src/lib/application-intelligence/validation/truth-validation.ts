import type { AlignmentAIOutput, FitItemSchema } from "./ai-output.schemas";
import type { z } from "zod";
import { assertAiInferredNotCanonical } from "../provenance";

type FitItem = z.infer<typeof FitItemSchema>;

export type TruthValidationResult = {
  ok: boolean;
  errors: string[];
};

/**
 * Truth validation after Zod parse.
 * Enforces: UNKNOWN ≠ FALSE, MISSING ≠ FALSE without evidence,
 * AI_INFERRED cannot become canonical truth.
 */
export function validateAlignmentAgainstCandidateTruth(
  output: AlignmentAIOutput,
  knownEntityIds: Set<string>
): TruthValidationResult {
  const errors: string[] = [];

  for (const item of output.fitItems) {
    validateFitItem(item, knownEntityIds, errors);
  }

  for (const dim of output.dimensionScores) {
    if (dim.status === "UNKNOWN" && dim.score != null) {
      errors.push(`Dimension ${dim.dimension}: UNKNOWN cannot carry a numeric score`);
    }
    for (const ev of dim.evidence) {
      if (ev.provenance === "AI_INFERRED") {
        try {
          assertAiInferredNotCanonical(ev.provenance);
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      if (ev.entityId && !knownEntityIds.has(ev.entityId)) {
        errors.push(
          `Dimension ${dim.dimension}: evidence entityId ${ev.entityId} is not in authorized candidate truth set`
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateFitItem(
  item: FitItem,
  knownEntityIds: Set<string>,
  errors: string[]
): void {
  if (item.status === "UNKNOWN") {
    // Must not be treated as FALSE/MATCHED by callers.
    return;
  }

  if (item.status === "MISSING") {
    // MISSING means not found in candidate truth — not a false claim.
    const invented = item.evidence.some((e) => e.provenance === "AI_INFERRED" && e.entityId);
    if (invented) {
      errors.push(
        `Fit item "${item.label}": MISSING must not invent candidate entityIds via AI_INFERRED`
      );
    }
    return;
  }

  for (const ev of item.evidence) {
    if (ev.provenance === "AI_INFERRED") {
      errors.push(
        `Fit item "${item.label}": AI_INFERRED cannot be sole/canonical support for ${item.status}`
      );
    }
    if (ev.entityId && !knownEntityIds.has(ev.entityId)) {
      errors.push(
        `Fit item "${item.label}": unknown entityId ${ev.entityId} (possible fabrication)`
      );
    }
  }
}

export function unknownIsNotFalse(status: string): boolean {
  return status === "UNKNOWN";
}

export function missingIsNotFalse(status: string): boolean {
  return status === "MISSING";
}
