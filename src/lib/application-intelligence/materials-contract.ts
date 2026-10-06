/**
 * Resume / material version binding contract.
 *
 * Current state:
 * - ApplicationMaterial.candidateDocumentId is optional
 * - ApplicationMaterial.documentVersion is optional and not FK-constrained
 *   to CandidateDocument.versionNumber
 * - DocumentType.RESUME is not enforced on the linked document
 *
 * Target state (future authorized migration — not executed here):
 * - When candidateDocumentId is set, documentVersion MUST equal
 *   CandidateDocument.versionNumber at bind time
 * - Prefer requiring RESUME type for primary resume materials
 * - Historical rows remain readable; no silent rewrite
 *
 * Backward compatibility:
 * - Null candidateDocumentId rows stay valid
 * - Validation applies on new/updated material writes only
 */

export type MaterialBindingInput = {
  candidateDocumentId?: string | null;
  documentVersion?: number | null;
  documentType?: string | null;
  documentVersionNumber?: number | null;
};

export type MaterialBindingResult =
  | { ok: true; mode: "unbound" | "bound" }
  | { ok: false; code: string; message: string };

/**
 * Soft validation helper for write paths.
 * Phase 4A write path derives documentVersion server-side from CandidateDocument
 * and ignores browser-supplied version values.
 */
export function validateMaterialDocumentBinding(
  input: MaterialBindingInput
): MaterialBindingResult {
  if (!input.candidateDocumentId) {
    return { ok: true, mode: "unbound" };
  }

  if (
    input.documentVersion == null ||
    input.documentVersionNumber == null ||
    input.documentVersion !== input.documentVersionNumber
  ) {
    return {
      ok: false,
      code: "MATERIAL_VERSION_MISMATCH",
      message:
        "ApplicationMaterial.documentVersion must match CandidateDocument.versionNumber when a document is bound",
    };
  }

  // Final Design Lock: bound resume materials must be DocumentType.RESUME.
  // Callers binding a primary resume package must pass documentType=RESUME.
  if (input.documentType != null && input.documentType !== "RESUME") {
    return {
      ok: false,
      code: "MATERIAL_NOT_RESUME",
      message:
        "Primary resume ApplicationMaterial must reference CandidateDocument with DocumentType.RESUME",
    };
  }

  return { ok: true, mode: "bound" };
}

export const MATERIAL_BINDING_MIGRATION = {
  currentState:
    "Phase 4A write path loads CandidateDocument server-side, requires RESUME, and persists documentVersion from CandidateDocument.versionNumber",
  targetState:
    "New bound primary resume materials require DocumentType.RESUME + matching documentVersion (server-derived)",
  strategy:
    "Validate on new writes only; ignore browser documentVersion; never rewrite historical package semantics",
  backwardCompatibility:
    "Unbound materials remain valid; existing applications continue to load",
} as const;
