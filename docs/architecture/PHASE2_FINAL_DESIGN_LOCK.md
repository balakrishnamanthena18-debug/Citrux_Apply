# PHASE 2 — FINAL DESIGN LOCK
# Application Intelligence

**Status:** DESIGN LOCKED  
**Phase 1:** APPROVED / ACCEPTED / FROZEN  
**Phase 2 Foundation:** COMPLETE  
**Phase 2 Feature Implementation:** HUMAN-AUTHORIZED / GATE-BY-GATE  
**Current gate:** Gate 4 (AI execution pipeline)

**Baselines (do not reopen):**
- `docs/architecture/PHASE2_FOUNDATION_CONTRACTS.md`
- Phase 2 Architecture Readiness Report
- Foundation code under `src/lib/application-intelligence/`

This document freezes the remaining decisions required before any feature implementation.

---

## 1. Architecture decisions (locked)

| # | Decision | Lock |
|---|----------|------|
| 1 | Async worker | DB-backed `QUEUED` runs drained by authenticated Vercel Cron/worker route |
| 2 | Visibility | Candidate-visible summary vs staff-only operational vs system-only metadata |
| 3 | First provider | DeepSeek-V4-Flash via NVIDIA NIM (experimental), behind `AIProvider` only |
| 4 | Credentials | Server env secrets only; never browser/DB/logs/audit |
| 5 | Resume binding | New bound resume materials require `DocumentType.RESUME` + exact version |
| 6 | Provenance shape | Side-table attestations (sparse); default without row = CANDIDATE_PROVIDED |
| 7 | Authority | Intelligence advisory only; QA/Approval/Submission unchanged |
| 8 | Scoring | Deterministic weighted dimensions; AI cannot set final score |
| 9 | Staleness | Explicit invalidation rules; no auto-recompute until worker exists |
| 10 | Scope | MUST/SHOULD/DO-NOT-BUILD lists below |
| 11 | Gate order | 14-gate sequence below |

---

## 2. Async execution decision

### Chosen primary mechanism

**Database-backed run queue + authenticated Vercel Cron/worker drain**

Mapped to evaluated options:
- **Not A alone** (cron without durable run rows is insufficient)
- **Not B alone** (request-held LLM execution is incompatible with serverless timeouts)
- **Not C** (no Bull/Inngest/worker SDK exists in repo)
- **Implements minimal D** using existing `ApplicationIntelligenceRun` + OOS cron pattern (`vercel.json`, `/api/cron/*`, `CRON_SECRET`)

### Why this fits OOS

| Criterion | Assessment |
|-----------|------------|
| Reliability | Durable `QUEUED/RUNNING/SUCCEEDED/FAILED` in Postgres |
| Retries | Re-queue FAILED → new or same idempotency policy; RUNNING lease timeout → FAILED/retry |
| Idempotency | `ApplicationIntelligenceRun.idempotencyKey` unique |
| Duplicate prevention | Unique key + snapshot/content hash identity |
| Timeout | Worker processes one/small batch per invocation; no SSR wait |
| Failure handling | `FAILED` + `errorCode`/`errorMessage` (sanitized) |
| Observability | Audit actions + run status timestamps |
| Complexity | Reuses existing cron auth; no new distributed queue product |
| Vercel | Matches `bom1` cron already used for rate-limit cleanup |
| Workload | Low Phase 2 volume (per-application analysis on demand) |

### Flow (locked)

```
User/Staff request
  → capture/reuse JobDescriptionSnapshot
  → create ApplicationIntelligenceRun (QUEUED)  [idempotent]
  → return { runId, status: QUEUED } immediately
  → UI polls/refreshes CURRENT results when available

Vercel Cron / privileged worker route (Bearer CRON_SECRET or org-privileged system caller)
  → select QUEUED runs (limit N, oldest first)
  → mark RUNNING (optimistic / where status=QUEUED)
  → execute pipeline (provider + Zod + truth + deterministic score)
  → persist Alignment/Readiness
  → SUCCEEDED or FAILED
  → audit event

Recompute request
  → mark prior CURRENT → STALE or RECOMPUTE_REQUIRED
  → create new QUEUED run (new identity or recompute key)
  → same worker drain
```

### Immediate return guarantee

- Request path **must not** call `AIProvider` methods.
- SSR/RSC render **must not** call `AIProvider` methods (`assertNotSsrAiExecution`).
- Detail page shows last CURRENT result or “analysis pending/unavailable”.

### Retry / stuck RUNNING

- If `RUNNING` longer than configured lease (implementation default: 5 minutes), worker may mark `FAILED` with `errorCode=LEASE_EXPIRED` and allow recompute.
- No silent double-success for the same idempotency key.

---

## 3. Visibility model

OOS `Role` enum is `CANDIDATE | EMPLOYEE | ADMIN`.  
Team Lead / Manager are **organizational designations within EMPLOYEE membership**, not separate Role values. They inherit **staff** visibility via existing org-privileged RLS, subject to existing task/governance scope at call sites.

### Classification

| Class | Meaning |
|-------|---------|
| CANDIDATE-VISIBLE | Safe, actionable, non-QA-internal summary |
| STAFF-ONLY | Operational detail for employees/admin (incl. TL/Manager designations) |
| INTERNAL-SYSTEM | Never rendered in product UI |

### Authorization matrix

| Data | Candidate | Employee / TL / Manager | Admin | System |
|------|-----------|-------------------------|-------|--------|
| Alignment overall score (deterministic) | ✅ | ✅ | ✅ | ✅ |
| Dimension scores (skills/experience/…) | ✅ | ✅ | ✅ | ✅ |
| Fit items MATCHED/PARTIAL/MISSING/UNKNOWN | ✅ | ✅ | ✅ | ✅ |
| Candidate-relevant evidence (own profile refs) | ✅ | ✅ | ✅ | ✅ |
| Readiness state + blockers/warnings (candidate-safe) | ✅ | ✅ | ✅ | ✅ |
| Recommended next action (candidate-safe) | ✅ | ✅ | ✅ | ✅ |
| QA criterion correlation / QA notes | ❌ | ✅ | ✅ | ✅ |
| Internal operational recommendations | ❌ | ✅ | ✅ | ✅ |
| Analysis metadata (provider, model, versions, timings) | ❌ | ✅ | ✅ | ✅ |
| Failure diagnostics / errorCode | ❌ | ✅ | ✅ | ✅ |
| Raw provider payload / prompts | ❌ | ❌ | ❌ | ✅ |
| Credentials / auth headers | ❌ | ❌ | ❌ | ❌ (never stored) |
| Cross-tenant / cross-candidate records | ❌ | ❌ | ❌ | ❌ |

### Candidate may see (exact)

1. Alignment summary (overall + dimensions) when `freshness=CURRENT` and `status=SUCCEEDED`
2. Strengths (MATCHED), gaps (PARTIAL/MISSING), UNKNOWN items labeled as unknown (never false)
3. Readiness explanation + candidate-safe blockers/warnings/next actions
4. Evidence that references **their own** candidate facts / materials
5. Pending/stale/unavailable status messaging

### Candidate must not see

- QA checklist attestations / reviewer notes
- Staff internal notes
- Raw prompts, raw model dumps, system diagnostics
- Other candidates’ data
- Provider credentials

### Staff may see

Everything candidate-visible **plus** QA correlation, internal evidence, analysis metadata, failure diagnostics, internal recommendations — still scoped by org + application authorization.

### RLS / isolation (locked)

Every intelligence row requires `organizationId`, `candidateId`, `applicationId`, `jobId` (as modeled).  
Select policies mirror application ownership / org privilege.  
AI context assembly uses `buildScopedAiContextGuard` — never unscoped “all candidates/jobs”.

---

## 4. Provider decision

### Chosen experimental first provider

**DeepSeek-V4-Flash via NVIDIA NIM**

| Item | Lock |
|------|------|
| Interface model id | `deepseek-ai/deepseek-v4.1-flash` (successor after NVIDIA 410 EOL of `deepseek-ai/deepseek-v4-flash`) |
| Transport | OpenAI-compatible chat completions at NVIDIA integrate API |
| Adapter location | `src/lib/application-intelligence/providers/nvidia-deepseek-adapter.ts` only |
| Domain imports | **Forbidden** — domain uses `AIProvider` / `AIService` only |
| Modalities for Phase 2 | **Text only** (JD + structured candidate facts). No image pipeline required |
| Structured output | Prompt JSON + Zod (`ApplicationIntelligenceAIOutputSchema`); do not rely on vendor `response_format` alone |
| Context | Scoped application context only; respect provider context limits; truncate deterministically |
| Rate limits | Existing `AI_GENERATION` bucket via `checkAiGenerationRateLimit` |
| Production posture | **Experimental** — not enterprise-mandatory; must degrade gracefully |
| Privacy | Send only authorized scoped fields; no secrets; no cross-candidate batching |

Evidence: NVIDIA NIM docs list DeepSeek-V4-Flash with text I/O and structured JSON capability claims.  
Gate 3 registers `NvidiaDeepSeekAdapter` behind `AIProvider` / `resolveConfiguredAIProvider`. Default `AIService` remains `NullAIProvider` until an explicit worker/feature gate resolves the configured adapter.

### Fallback when provider fails / unavailable

1. Run → `FAILED` with sanitized `errorCode` (`PROVIDER_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_INVALID_OUTPUT`, `TRUTH_VALIDATION_FAILED`)
2. **Deterministic path still available** where no LLM is required:
   - exact skill name intersection
   - structured field comparisons (location/remote/salary/work auth/preferences)
   - readiness rules over profile completeness + materials presence + existing status gates
3. UI shows “AI assist unavailable; showing deterministic analysis only” when a deterministic partial result is persisted, or “Analysis unavailable” if neither path produced CURRENT results
4. **Do not invent** AI-like narrative as fallback

---

## 5. Credential policy

| Rule | Lock |
|------|------|
| Storage | Server environment / secret manager only |
| Env names (reserved) | `NVIDIA_API_KEY` (required for adapter); optional `NVIDIA_API_BASE_URL` defaulting to NVIDIA integrate endpoint |
| `src/lib/env.ts` | Add server-only optional keys at implementation time — **never** `NEXT_PUBLIC_*` |
| Browser | Never exposed |
| Database | Never persisted |
| Logs / audit | Never included (`sanitizeIntelligenceAuditDetails`) |
| Code | Never hardcoded |
| Rotation | Ops rotates env secret; no schema change |

---

## 6. Resume material binding decision

### Lock

For **new or updated** application materials that bind a document as the application’s primary resume package:

1. `candidateDocumentId` **required** when staff marks/binds a resume material  
2. Linked `CandidateDocument.documentType` **must be `RESUME`**  
3. `ApplicationMaterial.documentVersion` **must equal** `CandidateDocument.versionNumber` at bind time  

Cover letters / transcripts / other docs may bind with their own `DocumentType` and are not forced to `RESUME`.

### Historical compatibility

- Existing rows with null `candidateDocumentId` remain valid (unbound)
- Existing mismatched version/type rows remain readable; **not** rewritten
- Soft validator already exists: `validateMaterialDocumentBinding`
- Enforcement applies on **future write paths only** (`updateApplicationMaterialAction` when feature auth lands)
- Optional non-destructive backfill: where FK present and version null → copy `versionNumber` (no type mutation)

### Sufficiency

`ApplicationMaterial → CandidateDocument + exact version` is the binding model.  
`DocumentType.RESUME` is an additional invariant for resume-role materials, not a replacement for version pinning.

---

## 7. Provenance decision

### Chosen shape: OPTION B — separate attestation / provenance table (sparse)

**Name (future implementation):** `candidate_fact_attestations` (or equivalent)

| Aspect | Why B |
|--------|-------|
| Queryability | Join when needed; default path needs no row |
| Auditability | Historical attestations without overwriting career rows |
| Schema complexity | Avoids N columns × M career tables |
| Granularity | entityType + entityId + field |
| Profile compatibility | Phase 1 career editors unchanged |
| Performance | Sparse; most facts use default |
| Migration | No mass rewrite of experience/skills/etc. |

### Semantic defaults (locked)

| Condition | Provenance |
|-----------|------------|
| Fact absent | `UNKNOWN` |
| Fact present, no attestation row | `CANDIDATE_PROVIDED` |
| Attestation says staff verified field | `VERIFIED` |
| Attestation says staff-entered | `EMPLOYEE_PROVIDED` |
| Intelligence-only annotation | `AI_INFERRED` (evidence only; **never** written to Candidate canonical tables) |

### Rejected for Phase 2 default

- **OPTION A** (columns on every career table): higher migration blast radius for Phase 1 freeze  
- **OPTION C** (extend profile `verificationStatus` only): insufficient field granularity; must not imply field VERIFIED  

Gate 1 adds `candidate_fact_attestations` / `CandidateFactAttestation`.  
Resolver `resolveCareerFactProvenance` accepts sparse attestation lookups.

---

## 8. Intelligence authority rules

Frozen invariant:

```
INTELLIGENCE = ADVISORY ANALYSIS
QA           = HUMAN VERIFICATION GATE
APPROVAL     = AUTHORIZED DECISION
SUBMISSION   = AUTHORITATIVE EXTERNAL ACTION
```

### AI / intelligence MUST NEVER

- change `Application.status`
- approve / reject candidate approval
- pass or fail QA
- submit or resubmit applications
- alter canonical Candidate facts
- alter work authorization / permissions / billing
- send candidate communications autonomously
- call forbidden legacy mutation paths (`PHASE2_MUTATION_GATEWAY.forbiddenLegacyPaths`)

### Mutation gateway (locked)

- QA/Approval: `src/lib/qa/actions.ts`
- Submission: `src/lib/submission/actions.ts`
- App transitions/materials/create: `src/lib/application/actions.ts` (non-legacy only)
- `INTELLIGENCE_MAY_CALL_MUTATION_GATEWAY = false`

QA vocabulary reuse: `QA_INTELLIGENCE_VOCABULARY_MAP` — no competing criterion enums.

---

## 9. Deterministic scoring contract

| Item | Lock |
|------|------|
| Version | `scoring.v1` (`INTELLIGENCE_SCORING_VERSION`) |
| Dimensions | skills 30, experience 25, education 10, location 10, workAuthorization 15, preferences 10 (sum 100) |
| Per-requirement labels | `MATCHED \| PARTIAL \| MISSING \| UNKNOWN` |
| Dimension status | `SCORED \| UNKNOWN \| NOT_APPLICABLE` |
| Normalization | Clamp dimension scores to 0–100 |
| UNKNOWN behavior | Excluded from weighted average; listed in `unknownDimensions` |
| All UNKNOWN | `overallScore = null` (never fabricate 0% or false) |
| Evidence | Every SCORED/MATCHED/PARTIAL item requires canonical provenance evidence |
| AI role | Semantic assist only (e.g. suggest mappings); **final score from `computeOverallScore` only** |
| Provider independence | Scoring module must not import adapters |

---

## 10. Staleness contract

### Freshness states

`CURRENT | STALE | RECOMPUTE_REQUIRED`

Presentable as current iff `freshness=CURRENT` AND run `status=SUCCEEDED`.

### Invalidation matrix

| Trigger | JobRequirementSet | AlignmentResult | ReadinessResult | Run freshness |
|---------|-------------------|-----------------|-----------------|---------------|
| New JD snapshot (hash change) | invalidate / new set required | RECOMPUTE_REQUIRED | RECOMPUTE_REQUIRED | RECOMPUTE_REQUIRED |
| Skills / experience / education / certifications / projects change | — | STALE | STALE | STALE |
| Work authorization / location / preferences / profile core change | — | STALE | STALE | STALE |
| Application material change | — | STALE (if materials used) | STALE | STALE |
| Manual invalidation | optional | RECOMPUTE_REQUIRED | RECOMPUTE_REQUIRED | RECOMPUTE_REQUIRED |

### Recompute policy

- Marking stale/recompute-required is allowed without LLM calls
- **Automatic recompute enqueue** is allowed only after the worker route exists and feature auth is granted
- Until then: mark freshness only; UI shows stale/pending

---

## 11. Phase 2 feature scope

### MUST HAVE

1. JD requirement extraction (pinned snapshot)
2. Deterministic candidate–job alignment
3. Explainability / evidence
4. Application readiness advisory
5. Application detail Intelligence UI (candidate + staff variants per visibility)
6. Async analysis execution (this lock’s worker)
7. Provider adapter (NVIDIA DeepSeek behind interface)
8. Structured Zod validation
9. Truth validation
10. Security / isolation / IDOR
11. Auditability
12. Stale / recompute behavior
13. Automated + browser regression tests

### SHOULD HAVE

- Material intelligence (resume/version used, gaps)
- Employee next-action intelligence
- Cached recomputation on invalidation
- DeepSeek experimental provider (first adapter)

### DO NOT BUILD

- ATS Resume Studio / resume rewriting
- Job marketplace / autonomous job matching
- Autonomous application submission
- Interview OS / Offers / Billing
- Career CRM / Career Copilot
- New candidate navigation destinations

---

## 12. Explicit exclusions

- No Phase 1 portal/nav/notification/realtime redesign
- No replacement of QA/approval/submission
- No field-level provenance mass migration in Phase 1 tables before attestation table lands
- No browser AI keys
- No synchronous LLM on page render

---

## 13. Implementation gate sequence

Each gate must PASS before the next begins:

1. Final schema/data contracts (attestation table + any env keys)  
2. JD snapshot + requirement infrastructure  
3. Provider abstraction + structured validation (adapter still gated)  
4. AI execution pipeline (worker + Null→NVIDIA adapter)  
5. Requirement extraction  
6. Deterministic alignment  
7. Readiness engine  
8. Evidence / explainability  
9. Application detail Intelligence UI  
10. Security / IDOR / isolation  
11. Performance / async verification  
12. Automated tests  
13. Browser verification  
14. Final acceptance  

**Do not start Gate 1 until human says: `AUTHORIZE PHASE 2 IMPLEMENTATION`.**

---

## 14. Security model

- Tenant: `organizationId` on all intelligence entities  
- Candidate isolation: application ownership / candidate user match  
- Staff: org-privileged membership (EMPLOYEE/ADMIN + existing designation governance)  
- AI context: scoped guard only  
- Rate limit: `AI_GENERATION`  
- No cross-tenant joins in prompts  
- Credentials policy §5  

---

## 15. Audit model

Use foundation `AuditAction` values:

- `JOB_DESCRIPTION_SNAPSHOT_CAPTURED`
- `APPLICATION_INTELLIGENCE_REQUESTED`
- `APPLICATION_INTELLIGENCE_STARTED`
- `APPLICATION_INTELLIGENCE_COMPLETED`
- `APPLICATION_INTELLIGENCE_FAILED`
- `APPLICATION_INTELLIGENCE_INVALIDATED`
- `APPLICATION_INTELLIGENCE_MARKED_STALE`
- `APPLICATION_INTELLIGENCE_RECOMPUTE_REQUESTED`

Details: run/application/job/snapshot ids, provider/model/versions, sanitized error codes — **never** secrets or raw prompts dumps in default audit.

---

## 16. Performance model

- Request path < typical action latency; no LLM  
- Worker batch size small (start N=1..5)  
- Cache CURRENT results; skip duplicate idempotent requests  
- Application detail SSR reads persisted results only  
- Respect existing performance freeze; measure before expanding worker concurrency  

---

## 17. Testing strategy

Unit: schemas, truth validation, scoring, provenance defaults, stale rules, gateway bans, null provider, material binding  

Integration / negative:
- Candidate A ↛ B intelligence  
- Tenant A ↛ B  
- AI cannot invent entity ids  
- AI cannot mutate status/QA/approval/submission/candidate truth  
- Idempotent requests  
- Stale not presented as current  
- Worker auth (CRON_SECRET)  

---

## 18. Browser verification requirements

When implementation is authorized:

**Candidate:** open application → Intelligence section → alignment/readiness/evidence → no fabricated facts → existing workflow still works → mobile 320/375/430  

**Candidate B:** own only; direct access to A denied  

**Employee:** staff fields visible; cannot cross tenant  

**Desktop + mobile;** hard reload + client navigation  

---

## 19. Remaining unresolved decisions

**NONE**

All architectural decisions required to authorize Phase 2 feature implementation are locked in this document.

---

## Consistency note

Foundation “Remaining decisions” are superseded by this Final Design Lock (`PHASE2_FOUNDATION_CONTRACTS.md` points here). Bound primary resume materials reject non-`RESUME` `documentType` on new writes only.

---

**FINAL STATUS**

PHASE 2 — DESIGN LOCKED  

PHASE 2 IMPLEMENTATION: HUMAN-AUTHORIZED / GATE-BY-GATE  

PHASE 1: APPROVED / ACCEPTED / FROZEN  

Gate progression requires each gate PASS before the next begins.
