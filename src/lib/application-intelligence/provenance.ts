/**
 * Candidate fact provenance contract for Application Intelligence.
 *
 * Design Lock Option B: sparse side-table `candidate_fact_attestations`.
 * Default without a row: CANDIDATE_PROVIDED when the fact exists.
 *
 * IMPORTANT:
 * - Profile-level Candidate.verificationStatus MUST NOT be treated as
 *   field-level VERIFIED for skills/experience/etc.
 * - AI_INFERRED must never become canonical Candidate truth automatically.
 * - AI_INFERRED must never be stored in candidate_fact_attestations.
 * - Missing facts remain UNKNOWN.
 */

export const FACT_PROVENANCE = [
  "VERIFIED",
  "CANDIDATE_PROVIDED",
  "EMPLOYEE_PROVIDED",
  "AI_INFERRED",
  "UNKNOWN",
] as const;

export type FactProvenanceValue = (typeof FACT_PROVENANCE)[number];

/** Provenance values allowed on CandidateFactAttestation rows. */
export const ATTESTATION_ALLOWED_PROVENANCE = [
  "VERIFIED",
  "CANDIDATE_PROVIDED",
  "EMPLOYEE_PROVIDED",
  "UNKNOWN",
] as const;

export type AttestationProvenanceValue =
  (typeof ATTESTATION_ALLOWED_PROVENANCE)[number];

export type FactEntityType =
  | "Candidate"
  | "CandidateExperience"
  | "CandidateEducation"
  | "CandidateSkill"
  | "CandidateProject"
  | "CandidateCertification"
  | "CandidateDocument"
  | "CandidatePreference"
  | "WorkAuthorization"
  | "Unknown";

export type FactReference = {
  entityType: FactEntityType;
  entityId?: string | null;
  field?: string | null;
  provenance: FactProvenanceValue;
  /** True only when a dedicated field-level verification record exists. */
  fieldVerified: boolean;
};

export type FactAttestationLookup = {
  provenance: FactProvenanceValue;
};

export function isAttestationProvenanceAllowed(
  provenance: FactProvenanceValue
): provenance is AttestationProvenanceValue {
  return (ATTESTATION_ALLOWED_PROVENANCE as readonly string[]).includes(
    provenance
  );
}

/**
 * Resolve provenance for a career fact used in intelligence evidence.
 *
 * Precedence:
 * 1. value absent → UNKNOWN
 * 2. explicit AI_INFERRED (evidence annotation only; never canonical store)
 * 3. attestation row (sparse side-table), ignoring illegal AI_INFERRED rows
 * 4. other explicit override (e.g. document uploadedBy staff)
 * 5. default CANDIDATE_PROVIDED
 *
 * Never promotes profile verificationStatus to field VERIFIED.
 */
export function resolveCareerFactProvenance(input: {
  entityType: FactEntityType;
  entityId?: string | null;
  field?: string | null;
  /** Explicit override when uploader/role is known (e.g. document uploadedBy staff). */
  explicit?: FactProvenanceValue | null;
  /** Sparse attestation from candidate_fact_attestations when present. */
  attestation?: FactAttestationLookup | null;
  /** Presence of a value in canonical store. */
  valuePresent: boolean;
}): FactReference {
  if (!input.valuePresent) {
    return {
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      field: input.field ?? null,
      provenance: "UNKNOWN",
      fieldVerified: false,
    };
  }

  if (input.explicit === "AI_INFERRED") {
    // AI may annotate evidence references but never become canonical store truth.
    return {
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      field: input.field ?? null,
      provenance: "AI_INFERRED",
      fieldVerified: false,
    };
  }

  if (
    input.attestation &&
    isAttestationProvenanceAllowed(input.attestation.provenance)
  ) {
    return {
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      field: input.field ?? null,
      provenance: input.attestation.provenance,
      fieldVerified: input.attestation.provenance === "VERIFIED",
    };
  }

  if (input.explicit && input.explicit !== "UNKNOWN") {
    return {
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      field: input.field ?? null,
      provenance: input.explicit,
      fieldVerified: input.explicit === "VERIFIED",
    };
  }

  return {
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    field: input.field ?? null,
    provenance: "CANDIDATE_PROVIDED",
    fieldVerified: false,
  };
}

export function isCanonicalCandidateTruth(provenance: FactProvenanceValue): boolean {
  return (
    provenance === "VERIFIED" ||
    provenance === "CANDIDATE_PROVIDED" ||
    provenance === "EMPLOYEE_PROVIDED"
  );
}

export function assertAiInferredNotCanonical(provenance: FactProvenanceValue): void {
  if (provenance === "AI_INFERRED") {
    throw new Error(
      "AI_INFERRED facts must not be persisted as canonical Candidate truth"
    );
  }
}

export function assertAttestationNotAiInferred(
  provenance: FactProvenanceValue
): void {
  if (provenance === "AI_INFERRED") {
    throw new Error(
      "AI_INFERRED must not be stored on candidate_fact_attestations"
    );
  }
}
