# PHASE 7E.1 — CANDIDATE 360 COMPOSITION SERVICE REPORT

## Executive Summary
Phase 7E.1 implements the **read-only Candidate 360 composition service** in strict compliance with the frozen Phase 7D / 7D.1 Product Contract. The service (`getCandidate360`) functions as a pure server-side projection uniting candidate profile facts, Phase 7C career intelligence, Phase 4 resume review summaries, Phase 2 application readiness indicators, Phase 5 job matching summaries, and Phase 6 outcome histories into a single, bounded, type-safe DTO.

The implementation contains zero schema changes, zero database migrations, zero AI/LLM dependencies, and zero UI changes.

---

## Existing Services Reused
1. **Candidate Profile & Facts:** Authoritative Prisma models (`Candidate`, `CandidateExperience`, `CandidateSkill`, `CandidateProject`, `CandidateEducation`, `CandidateCertification`).
2. **Career Intelligence (Phase 7C):** `getCandidateCareerIntelligence(candidateId, ctx)` from `@/lib/career`.
3. **Resume Intelligence (Phase 4):** Default `CandidateDocument` and latest `ResumeReview` rows (ATS readability & overall summary).
4. **Application Intelligence (Phase 2):** Recent `Application` and `ApplicationReadinessResult` records.
5. **Job Matching (Phase 5):** Active `CandidateJobMatch` and `Job` records.
6. **Outcome Ledger (Phase 6):** `career.outcomesSummary` derived from `ApplicationOutcomeEvent`.

---

## Composition Architecture
- **Location:** [`src/lib/candidate-360/`](file:///Users/balakrishna/apply_citrux/src/lib/candidate-360/)
- **Modules:**
  - [`src/lib/candidate-360/types.ts`](file:///Users/balakrishna/apply_citrux/src/lib/candidate-360/types.ts) — Composition DTO types for Candidate 360 overview, resume, application readiness, matching, and staff metrics.
  - [`src/lib/candidate-360/service.ts`](file:///Users/balakrishna/apply_citrux/src/lib/candidate-360/service.ts) — Pure read-only composer executing parallel bounded queries via `withRlsContext`.
  - [`src/lib/candidate-360/index.ts`](file:///Users/balakrishna/apply_citrux/src/lib/candidate-360/index.ts) — Public module exports.

---

## Authorization
- Derived strictly from `AuthenticatedContext` (`ctx.userId`, `ctx.organizationId`, `ctx.role`).
- Client-supplied identifiers are never accepted as authority.
- **Candidate (`Role.CANDIDATE`):** Access restricted strictly to own record (`candidate.userId === ctx.userId`).
- **Staff (`Role.EMPLOYEE`, `Role.ADMIN`):** Scoped to candidates within the caller's active organization (`candidate.organizationId === ctx.organizationId`).
- Cross-tenant lookups fail closed with `NotFoundError`.

---

## Candidate DTO
Returns a clean, bounded [`Candidate360DTO`](file:///Users/balakrishna/apply_citrux/src/lib/candidate-360/types.ts) containing:
- `candidate`: High-level identity, headline, work authorization, location.
- `career`: Full Phase 7C career intelligence (core strengths, evidence hub, chronological timeline, actionable gaps, career direction).
- `resume`: Concise ATS readability label and findings count.
- `applications`: Recent applications with readiness states.
- `matching`: Relevant match count and saved opportunities.
- `outcomes`: Safe historical milestone timeline.
- `freshness`: Fingerprint version and computation timestamp.

---

## Staff DTO
Includes all candidate sections plus:
- `staffContext`: Operational metrics (`internalNotesCount`, `activeTasksCount`, `attestationsCount`).
- Populated exclusively for authorized staff (`EMPLOYEE`, `ADMIN`).

---

## Career Intelligence
Delegates 100% of capability evidence, multi-source independence, strength classification (`CORE`, `STRONG`, `EMERGING`), recency analysis, and gap derivation to the authoritative Phase 7C service.

---

## Resume Intelligence
Summarizes default resume ATS readability, overall representation status, and findings count. Never exposes raw extracted text or internal parser debug payloads.

---

## Application Intelligence
Summarizes readiness states (`READY_FOR_MANAGED`, `READY_FOR_CANDIDATE_APPROVAL`, `BLOCKED`, `WARNING`), blocker counts, and warning counts for recent applications.

---

## Job Matching
Summarizes active matches (`STRONG_MATCH`, `GOOD_MATCH`), saved opportunities, and candidate-requested opportunities. Internal scoring weights and ranking mechanics are excluded.

---

## Outcome Summary
Summarizes historical post-submission events (`INTERVIEW_REQUESTED`, `OFFER_RECEIVED`, `EMPLOYER_REJECTION`). Strictly isolated from skill evidence.

---

## Freshness
Reuses authoritative `sourceDataVersion` SHA-256 fingerprint from Phase 7C. Candidate 360 does not fabricate separate freshness states.

---

## Conflict Handling
Canonical candidate profile truth remains authoritative. Contradictions with advisory extracts or match signals are surfaced in evidence breakdown notes without silent record mutations.

---

## Redaction
- Raw extracted resume text (`CandidateDocumentExtract.extractedText`) is never included in the payload.
- Internal staff notes, task assignments, and security IDs are completely excluded from candidate-facing payloads.

---

## Performance
- Selective projections: Only required columns are fetched from the database.
- Parallel execution: Supporting domain queries execute concurrently via `Promise.all`.
- Target execution latency: $<100\text{ms}$.

---

## Read-Only Verification
- Zero `create`, `update`, `delete`, `transition`, `assignment`, or `mutation` operations exist in the service.
- Verified by automated unit tests.

---

## Tests
- **Suite:** [`tests/unit/candidate-360/phase7e1-candidate-360.test.ts`](file:///Users/balakrishna/apply_citrux/tests/unit/candidate-360/phase7e1-candidate-360.test.ts)
- **Status:** 9/9 unit tests passing covering candidate access, cross-tenant denial, staff context, subsystem delegation, outcome isolation, redaction, and read-only behavior.

---

## Phase 2–6 Regression
- Core unit and integration test suites for Phases 2 through 6 pass without regressions.

---

## Phase 7C Regression
- Phase 7C test suite (`tests/unit/career/phase7c-career-intelligence.test.ts`): 22/22 tests passing.

---

## Typecheck
- `npm run typecheck`: Passed (Exit code 0).

---

## Lint
- `npm run lint`: Passed (Exit code 0).

---

## Build
- `npm run build`: Passed (Exit code 0, optimized production build).

---

## Schema Changes
`Schema Changes: NONE`

---

## Migration Changes
`Migration Changes: NONE`

---

## UI Changes
`UI Changes: NONE`

---

## Known Findings
- None. The composition service strictly implements the Phase 7D / 7D.1 contract.

---

## Final Decision
**COMPLETE — READY FOR 7E.2 UI**
