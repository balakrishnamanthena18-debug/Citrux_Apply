/**
 * Phase 2 Gate 1 — final schema / data-contract checklist.
 * Verifies foundation + Gate 1 additions against PHASE2_FINAL_DESIGN_LOCK.md.
 * No feature execution (no extraction, alignment, readiness, UI, AI calls).
 */

import {
  EXPERIMENTAL_MODEL_ID,
  EXPERIMENTAL_PROVIDER_BASE_URL_ENV_KEY,
  EXPERIMENTAL_PROVIDER_ENV_KEY,
  EXPERIMENTAL_PROVIDER_ID,
  INTELLIGENCE_SCORING_VERSION,
  NULL_PROVIDER_ID,
} from "./constants";
import { SCORING_WEIGHTS } from "./scoring-contract";
import { INTELLIGENCE_AUDIT_ACTIONS } from "./audit-contract";
import { INTELLIGENCE_VISIBILITY_MATRIX } from "./visibility-contract";
import { ATTESTATION_ALLOWED_PROVENANCE } from "./provenance";
import { INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY } from "./mutation-gateway";

export const GATE1_REQUIRED_MODELS = [
  "JobDescriptionSnapshot",
  "JobRequirementSet",
  "ApplicationIntelligenceRun",
  "ApplicationAlignmentResult",
  "ApplicationReadinessResult",
  "CandidateFactAttestation",
] as const;

export const GATE1_REQUIRED_ENUMS = [
  "FactProvenance",
  "IntelligenceRunStatus",
  "IntelligenceResultFreshness",
  "IntelligenceValidationStatus",
] as const;

export const GATE1_ASYNC_MECHANISM = {
  primary: "db_queued_runs_plus_vercel_cron_worker",
  runStatuses: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"] as const,
  freshness: ["CURRENT", "STALE", "RECOMPUTE_REQUIRED"] as const,
  ssrAiForbidden: true,
  requestPathMustNotCallProvider: true,
} as const;

export const GATE1_PROVIDER_LOCK = {
  experimentalProviderId: EXPERIMENTAL_PROVIDER_ID,
  experimentalModelId: EXPERIMENTAL_MODEL_ID,
  nullProviderId: NULL_PROVIDER_ID,
  credentialEnvKey: EXPERIMENTAL_PROVIDER_ENV_KEY,
  baseUrlEnvKey: EXPERIMENTAL_PROVIDER_BASE_URL_ENV_KEY,
  neverNextPublic: true,
  neverPersistCredentials: true,
  domainMustNotImportVendorSdk: true,
} as const;

export const GATE1_PROVENANCE_LOCK = {
  shape: "candidate_fact_attestations",
  defaultWithoutRow: "CANDIDATE_PROVIDED",
  missingFact: "UNKNOWN",
  attestationNeverAiInferred: true,
  allowedAttestationProvenance: ATTESTATION_ALLOWED_PROVENANCE,
} as const;

export const GATE1_AUTHORITY_LOCK = {
  intelligenceAdvisoryOnly: true,
  mayCallMutationGateway: INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY,
  mayMutateApplicationStatus: false,
  mayCompleteQa: false,
  mayApprove: false,
  maySubmit: false,
} as const;

export function assertGate1ScoringLock(): void {
  if (INTELLIGENCE_SCORING_VERSION !== "scoring.v1") {
    throw new Error("Gate 1: scoring version must be scoring.v1");
  }
  const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`Gate 1: scoring weights must sum to 100, got ${sum}`);
  }
}

export function assertGate1VisibilityLock(): void {
  if (INTELLIGENCE_VISIBILITY_MATRIX.rawProviderPayload !== "INTERNAL_SYSTEM") {
    throw new Error("Gate 1: raw provider payload must be INTERNAL_SYSTEM");
  }
  if (INTELLIGENCE_VISIBILITY_MATRIX.qaNotes !== "STAFF_ONLY") {
    throw new Error("Gate 1: QA notes must be STAFF_ONLY");
  }
  if (INTELLIGENCE_VISIBILITY_MATRIX.alignmentOverallScore !== "CANDIDATE_VISIBLE") {
    throw new Error("Gate 1: alignment score must be CANDIDATE_VISIBLE");
  }
}

export function assertGate1AuditActionsPresent(): void {
  const required = [
    "JOB_DESCRIPTION_SNAPSHOT_CAPTURED",
    "JOB_REQUIREMENT_SET_CREATED",
    "JOB_REQUIREMENT_SET_INVALIDATED",
    "APPLICATION_INTELLIGENCE_REQUESTED",
    "APPLICATION_INTELLIGENCE_STARTED",
    "APPLICATION_INTELLIGENCE_COMPLETED",
    "APPLICATION_INTELLIGENCE_FAILED",
    "APPLICATION_INTELLIGENCE_INVALIDATED",
    "APPLICATION_INTELLIGENCE_MARKED_STALE",
    "APPLICATION_INTELLIGENCE_RECOMPUTE_REQUESTED",
  ];
  const values = Object.values(INTELLIGENCE_AUDIT_ACTIONS);
  for (const action of required) {
    if (!values.includes(action as (typeof values)[number])) {
      throw new Error(`Gate 1: missing audit action ${action}`);
    }
  }
}

export function assertGate1DataContracts(): void {
  assertGate1ScoringLock();
  assertGate1VisibilityLock();
  assertGate1AuditActionsPresent();
  if (GATE1_AUTHORITY_LOCK.mayCallMutationGateway) {
    throw new Error("Gate 1: intelligence must not call mutation gateway");
  }
  if (!GATE1_PROVENANCE_LOCK.attestationNeverAiInferred) {
    throw new Error("Gate 1: attestations must forbid AI_INFERRED");
  }
}
