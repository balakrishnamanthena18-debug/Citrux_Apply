# Phase 2 Application Intelligence — Handoff Package

**Status:** COMPLETE / ACCEPTED / FROZEN (Gate 14)  
**Baseline:** 1036/1036 tests; typecheck/lint/build PASS; LLM Calls 0 (deterministic suite)

---

## 1. Architecture summary

Application Intelligence is an **advisory** analysis subsystem:

JD text → immutable `JobDescriptionSnapshot` → `JobRequirementSet` (extraction) →  
`ApplicationIntelligenceRun` (async worker) → deterministic `ApplicationAlignmentResult` +  
`ApplicationReadinessResult` → Application Detail UI projection.

Domain code path: `src/lib/application-intelligence/`  
UI: `src/components/application-intelligence/`  
Cron: `GET/POST /api/cron/intelligence-worker` (Bearer `CRON_SECRET`)

Default provider: **NullAIProvider** (no network). NVIDIA NIM activates only when  
`NVIDIA_API_KEY` is present and the worker resolves `resolveConfiguredAIProvider()`.

## 2. Data model summary

| Model | Role |
|---|---|
| `JobDescriptionSnapshot` | Immutable JD capture + content hash |
| `JobRequirementSet` | Structured requirements bound to snapshot |
| `ApplicationIntelligenceRun` | Async work unit (lease, attempts, purpose) |
| `ApplicationAlignmentResult` | Deterministic fit + evidence |
| `ApplicationReadinessResult` | Advisory readiness + blockers/warnings |
| `CandidateFactAttestation` | Sparse provenance (default without row = CANDIDATE_PROVIDED); **write UX deferred** |

All intelligence tables are org-scoped and protected with **FORCE RLS** (Gate 10).

## 3. Intelligence lifecycle

`QUEUED` → claim (`FOR UPDATE SKIP LOCKED`) → `RUNNING` (lease) → validate → persist →  
`SUCCEEDED` | `RETRY_PENDING` | `FAILED`

- Batch size: 3  
- Reclaim batch: 20  
- Lease: 5 minutes  
- Max attempts: 3 (default)  
- Cron schedule: `*/5 * * * *` (`vercel.json`)

Stale/recompute: source mutation marks results `STALE` / `RECOMPUTE_REQUIRED`; historical rows remain.

## 4. Security model

- Tenant / candidate / application isolation via RLS + FORCE RLS  
- IDOR / child-ID access denied (Gate 10 + Gate 13 live checks)  
- Provider credentials server-only (never `NEXT_PUBLIC_*`)  
- Cron requires `CRON_SECRET`  
- Candidate/staff visibility contracts; no credentials in payloads  

## 5. Application lifecycle authority

| Decision | Authority | Intelligence |
|---|---|---|
| Candidate facts | Candidate truth | READ_ONLY |
| Requirements | Requirement system | OWN_ARTIFACT |
| Fit / readiness | Intelligence engines | ADVISORY |
| QA | QA system | FORBIDDEN as authority |
| Approval | Approval system | FORBIDDEN as authority |
| Submission | Submission workflow | FORBIDDEN |
| Application state | State Mutation Gateway | FORBIDDEN |

Lock: `assertIntelligenceLifecycleAuthorityLock()` + advisory disclaimer in UI.

## 6. Worker / cron operation

1. Reclaim expired `RUNNING` leases  
2. Requeue `RETRY_PENDING`  
3. Claim bounded `QUEUED` batch  
4. Execute pipeline per run  

Ops scripts: `npm run test:gate13`, `scripts/gate13-*.ts`.

## 7. Production configuration

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | YES | Pooled + migrate |
| `CRON_SECRET` | YES | Cron auth |
| `OPERATING_ORGANIZATION_ID` | YES | Tenant |
| Supabase URL/keys | YES | Auth + RLS context |
| `NVIDIA_API_KEY` | OPTIONAL | Enables live extraction provider |
| `NVIDIA_API_BASE_URL` | OPTIONAL | Defaults to NVIDIA NIM |

## 8. Known findings (non-blocking)

1. Architecture docs still mention older gate progress (refresh later).  
2. Gate 13 E2E can leave golden app non-CURRENT after JD V2 unless restore helper runs.  
3. Live QA/approval/submission authority proof used persisted tables (not cookie server actions).  
4. Fact-attestation staff write UX deferred (schema + read path exist).  
5. Mock extraction may surface sparse preferred/unknown sets.  

## 9. Production prerequisites

1. Deploy all Phase 2 migrations through `20261005093000_phase2_gate13_source_data_version_width`.  
2. Confirm FORCE RLS migration applied in the target environment.  
3. Configure `CRON_SECRET` and verify cron hits `/api/cron/intelligence-worker`.  
4. Leave `NVIDIA_API_KEY` unset until intentional production AI activation.  
5. Monitoring/alerting on worker drain failures and FAILED runs.  
6. Backup/restore drill for intelligence tables.  
7. Operational ownership for queue health and stale/recompute.  

## 10. Rollback / recovery

- Migrations are additive/widen-only (non-destructive).  
- Rollback of FORCE RLS is a security regression — avoid.  
- `sourceDataVersion` widen is forward-compatible.  
- Stuck `RUNNING`: reclaim path recovers on next cron.  
- Bad provider: NullAIProvider / mock for extraction; alignment/readiness remain deterministic.

## 11. Test baseline

- `npm test` → 1036 PASS  
- Gates 1–13 unit suites under `tests/unit/application-intelligence/`  
- Live: `npm run test:gate13` (opt-in DB)

## 12. Frozen contracts

JD snapshot, provenance, data/security/audit/async contracts, provider abstraction,  
structured output, scoring.v1, extraction, alignment, readiness, evidence/explainability.v1,  
material binding, stale/recompute, worker/retry/cron, Application Detail UI, lifecycle authority.

## 13. Explicitly deferred

ATS resume rewriting, job matching/discovery, autonomous submission, interview OS,  
offers, billing, CRM, Career Copilot, outcome analytics, marketplace, fact-attestation write UX.

---

Future changes require a **new authorized phase/gate**.
