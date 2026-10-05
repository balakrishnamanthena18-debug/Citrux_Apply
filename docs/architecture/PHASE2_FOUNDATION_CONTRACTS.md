# Phase 2 — Foundation Contracts

STATUS: Foundation complete. Design locked.  
Phase 1 remains APPROVED / ACCEPTED / FROZEN.  
Phase 2 feature implementation is HUMAN-AUTHORIZED / GATE-BY-GATE.  
Gate 1 adds `candidate_fact_attestations` + optional NVIDIA env keys.

## Authority boundaries

| Layer | Meaning |
|-------|---------|
| INTELLIGENCE | Advisory analysis only |
| QA | Human verification gate (`QaCriterionKey`) |
| APPROVAL | Candidate / authorized decision (`src/lib/qa/actions.ts`) |
| SUBMISSION | Authoritative external action (`src/lib/submission/actions.ts`) |

AI must never replace QA, approve applications, submit applications, or mutate `Application.status`.

Vocabulary map: `src/lib/application-intelligence/qa-alignment.ts`.

## Gate 1 — JD Snapshot

- Model: `JobDescriptionSnapshot` (immutable; RLS denies UPDATE/DELETE)
- Capture: `captureJobDescriptionSnapshot` + content hash idempotency
- Analyses must pin `snapshotId`, never live `Job.jobDescription` alone

## Implementation Gate 2 — Requirement infrastructure

- `requirements-contract.ts` + `requirement-set.ts`
- Job create/update/lead syncs immutable JD snapshot
- New snapshot invalidates prior CURRENT requirement sets (`RECOMPUTE_REQUIRED`)
- Extraction schema locked; NullAIProvider only — no NVIDIA/DeepSeek runtime

## Gate 2 — Candidate provenance (migration contract)

**Current state (Gate 1):** Sparse side-table `candidate_fact_attestations` (`CandidateFactAttestation`).  
Career child tables remain unchanged (no mass provenance columns).  
Default without attestation row: `CANDIDATE_PROVIDED` when the fact exists.

**Semantic states:** `VERIFIED | CANDIDATE_PROVIDED | EMPLOYEE_PROVIDED | AI_INFERRED | UNKNOWN`

**Rules locked now:**
- Profile verification ≠ field-level VERIFIED
- AI_INFERRED never becomes canonical Candidate truth
- AI_INFERRED must not be stored on `candidate_fact_attestations` (DB CHECK + contract)
- Missing facts remain UNKNOWN
- Resolver: `resolveCareerFactProvenance` (supports attestation lookup)

**Not done in Gate 1:**
1. Staff UX for writing attestations
2. Bulk backfill of historical rows (unnecessary — default applies)
3. Phase 1 profile UX changes

## Gate 3 — Intelligence persistence

Models: `ApplicationIntelligenceRun`, `ApplicationAlignmentResult`, `ApplicationReadinessResult`, `JobRequirementSet`

Run lifecycle: `QUEUED → RUNNING → SUCCEEDED | FAILED`  
Freshness: `CURRENT | STALE | RECOMPUTE_REQUIRED`

## Gate 4–5 — Provider + structured output

- Interface: `AIProvider` / `AIService` / `NullAIProvider` (no network)
- Zod: `src/lib/application-intelligence/validation/ai-output.schemas.ts`
- Truth: `validateAlignmentAgainstCandidateTruth`

## Gate 6 — Deterministic scoring

`SCORING_WEIGHTS` + `computeOverallScore` — provider-independent. UNKNOWN dims excluded; all-UNKNOWN → `overallScore: null`.

## Gate 8 — Material binding

Soft validator `validateMaterialDocumentBinding`. Historical rows untouched. Future write-path enforcement only.

## Gate 9 — Mutation gateway

Phase 2 workers must use:
- Approval/QA: `src/lib/qa/actions.ts`
- Submission: `src/lib/submission/actions.ts`
- App transitions/materials: `src/lib/application/actions.ts` (non-legacy)

Forbidden legacy paths listed in `mutation-gateway.ts`.

## Gate 10–11 — Async / stale

Runs created as `QUEUED`. SSR AI forbidden. Stale triggers in `stale.ts`.

## Implementation Gate 4 — Execution pipeline

- Atomic claim via `FOR UPDATE SKIP LOCKED`
- States: `QUEUED | RUNNING | RETRY_PENDING | SUCCEEDED | FAILED`
- Worker: `/api/cron/intelligence-worker` (Bearer `CRON_SECRET`)
- Persists `validatedPayload` on the run only — no alignment/readiness scoring yet

## Gate 12–13 — Security / audit

Scope: `organizationId + candidateId + applicationId + jobId`.  
Audit actions added to `AuditAction`. No credentials in logs.

## Gate 14 — Test strategy (future negative paths)

- Candidate A ↛ Candidate B intelligence
- Tenant A ↛ Tenant B intelligence
- AI output cannot invent candidate entities
- AI cannot mutate Candidate / Application.status / QA / approval / submission
- Idempotent run requests
- Stale results not presentable as CURRENT

## Remaining decisions before feature authorization

**RESOLVED** — see `docs/architecture/PHASE2_FINAL_DESIGN_LOCK.md`.

That document freezes async worker, visibility, provider/credentials, resume binding, provenance shape, scoring, staleness, scope, and gate order.

Phase 2 proceeds gate-by-gate only after each gate PASS. Gate 2+ not started from Gate 1.
