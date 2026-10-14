# Interview OS — Create Round Runtime Error Investigation & Fix Report

## 1. Root Cause

When submitting the "Request / Create Interview Round" form on an application without an existing interview record, the UI client calls Server Action `createInterviewAction({ applicationId })` to lazily provision the parent `Interview` container before calling `createRoundAction`.

Inside `InterviewService.createInterview`:
```typescript
const existing = await tx.interview.findUnique({
  where: {
    applicationId: input.applicationId,
  },
});
```

The runtime error:
```
TypeError: Cannot read properties of undefined (reading 'findUnique')
```
occurred because `tx.interview` evaluated to `undefined` at runtime.

The underlying root cause was **in-memory Prisma Client singleton staleness in development mode**:
1. The Next.js Turbopack development server (`next-server` PID 41320) had been running continuously in memory since before the Phase 8 Interview Operating System models were added and generated into `src/generated/prisma`.
2. In `src/lib/db/prisma.ts`, `globalForPrisma.prisma` cached the in-memory `PrismaClient` instance on `globalThis`. When hot-module reloading updated UI and service files, `globalThis.prisma` retained the initial client instance created before `model Interview` was compiled.
3. Because that stale client instance lacked the `interview`, `interviewRound`, and `interviewDebrief` delegates in its runtime delegate dictionary, any interactive transaction spawned by `withRlsContext` via `prisma.$transaction` inherited the stale transaction client `tx`, where `tx.interview` was `undefined`.
4. Previous commits attempted to defensively mask this in page views using `tx.interview ? await tx.interview.findUnique(...) : null` (in `employee/applications/[id]/page.tsx` and `candidate/applications/[id]/page.tsx`) and `if (!tx.interview) return [];` (in `interviews/page.tsx`). While these defensive ternaries allowed the application details page to render without crashing, clicking "Create Round" invoked `createInterviewAction` -> `InterviewService.createInterview`, where line 143 called `await tx.interview.findUnique(...)` directly without the defensive check, immediately throwing the unhandled `TypeError`.

---

## 2. Exact Failing Line

- **File**: `src/lib/interview/interview-service.ts`
- **Line**: `143`
- **Expression**: `const existing = await tx.interview.findUnique({`
- **Object that was undefined**: `tx.interview`
- **Expected object**: `Prisma.InterviewDelegate<ExtArgs, { omit: OmitOpts }>`
- **Prisma model/delegate involved**: Model `Interview` (`@@map("interviews")`) accessed via delegate `tx.interview`
- **Why it was undefined**: The transaction client `tx` was spawned from a stale `PrismaClient` singleton cached on `globalThis` that was instantiated prior to Phase 8 schema compilation and lacked the `interview` delegate.

---

## 3. Prisma Model / Delegate Identified

| Attribute | Authoritative Value |
|---|---|
| Prisma Model Name | `Interview` (`model Interview`) |
| Secondary Models | `InterviewRound` (`model InterviewRound`), `InterviewDebrief` (`model InterviewDebrief`) |
| Database Tables | `interviews`, `interview_rounds`, `interview_debriefs` |
| Exact Prisma Delegate | `prisma.interview` (singular, camelCase) |
| Round Delegate | `prisma.interviewRound` (singular, camelCase) |
| Debrief Delegate | `prisma.interviewDebrief` (singular, camelCase) |
| Generated Client Export | `src/generated/prisma/models/Interview.ts` -> `InterviewDelegate` |

---

## 4. Why It Was Undefined

1. **Process Lifecycle**: The long-running `next-server` worker was initialized on Tuesday 3:00 PM (`Tue03PM`). Phase 8 migration and model generation occurred subsequently at 8:38 PM (`4fbdfbe`).
2. **Global Singleton Caching**: `src/lib/db/prisma.ts` evaluated `createPrismaClient()` once and assigned `globalForPrisma.prisma = client`. The `createPrismaClient()` function had an early return `if (globalForPrisma.prisma) return globalForPrisma.prisma;` without validating whether delegates matching the generated schema were present.
3. **Defensive Suppression Masking**: When the developer originally saw page crashes during Phase 8 development, defensive conditionals (`tx.interview ? ... : null` and `if (!tx.interview) return []`) were added to the RSC pages. This masked the stale delegate from breaking page loads, leaving the authoritative mutation pathway in `interview-service.ts` exposed to failure upon actual round submission.

---

## 5. Fix Applied

### A. Self-Healing Prisma Singleton & Dynamic Delegate Proxy (`src/lib/db/prisma.ts`)
Updated `src/lib/db/prisma.ts` so that:
1. `getPrismaClient()` proactively inspects `globalForPrisma.prisma`. If the cached client is missing modern schema delegates (specifically `!("interview" in globalForPrisma.prisma)`), it invalidates the stale instance (`globalForPrisma.prisma = undefined`) and reconstructs a fresh `PrismaClient` with the pg driver adapter.
2. `export const prisma` is exported via a dynamic `Proxy` forwarding all delegate and transaction accesses to `getPrismaClient()`. This ensures that even across Hot Module Replacement or long-lived dev processes, delegates are guaranteed to exist.

### B. Removal of Defensive Ternary Suppressions
Purged all non-authoritative defensive checks that were suppressing errors rather than solving root causes:
1. `src/app/(dashboard)/employee/applications/[id]/page.tsx`:
   - Removed `const dbInterview = tx.interview ? await tx.interview.findUnique(...) : null;`
   - Replaced with direct, authoritative `const dbInterview = await tx.interview.findUnique(...);`
2. `src/app/(dashboard)/candidate/applications/[id]/page.tsx`:
   - Removed `const dbInterview = tx.interview ? await tx.interview.findUnique(...) : null;`
   - Replaced with direct, authoritative `const dbInterview = await tx.interview.findUnique(...);`
3. `src/app/(dashboard)/employee/interviews/page.tsx`:
   - Removed `if (!tx.interview) return [];`
   - Direct authoritative query `await tx.interview.findMany(...)`
4. `src/app/(dashboard)/candidate/interviews/page.tsx`:
   - Removed `if (!candidate || !tx.interview) return [];` -> `if (!candidate) return [];`

### C. Server Process Refresh
Terminated the stale PID 41320 process and booted a clean Turbopack dev server instance, ensuring in-memory modules match on-disk generated artifacts.

---

## 6. Database / Schema Parity Verification

Verified parity across all layers:
- **`prisma/schema.prisma`**:
  - `model Interview` -> mapped to `interviews` (Lines 1919-1939)
  - `model InterviewRound` -> mapped to `interview_rounds` (Lines 1941-1985)
  - `model InterviewDebrief` -> mapped to `interview_debriefs` (Lines 1987-2008)
- **Migrations**: `prisma/migrations/20261006180000_phase8c1_interview_operating_system/migration.sql` creates tables with indexes, RLS constraints, and foreign keys.
- **PostgreSQL Database**:
  - `SELECT table_name FROM information_schema.tables WHERE table_name IN ('interviews', 'interview_rounds', 'interview_debriefs');` -> Confirmed all 3 tables exist in public schema.
- **Generated Client**: `src/generated/prisma/models.ts` exports `Interview`, `InterviewRound`, `InterviewDebrief`.
- **Runtime Client Delegates**: Confirmed `'interview' in prisma === true` and `'interviewRound' in prisma === true`.

---

## 7. Focused Regression Test

Created `tests/integration/interview-create-round-regression.test.ts` covering:
1. **Delegate Parity Check**: Proves `prisma.interview.findUnique`, `prisma.interview.create`, `prisma.interviewRound.create`, and `prisma.interviewDebrief.upsert` are defined and callable.
2. **Self-Healing Resilience**: Proves `getPrismaClient()` recreates a valid client if an in-memory client lacks delegates.
3. **Execution Failure Matrix**:
   - Rejection of non-existent application (`NotFoundError`)
   - Rejection of candidate impersonation / unauthorized actor (`AuthorizationError`)
   - Rejection of cross-tenant application mutation
4. **Authoritative Golden Path**:
   - `createInterview` container lookup/creation
   - `createRound` with exact modal fields (Recruiter Screen, Recruiter Screening Call, Virtual, Asia/Calcutta, panel `[{ fullName: 'test', roleOrTitle: 'test' }]`)
   - Persistence verification with matching query to `page.tsx`
   - Audit trail emission (`INTERVIEW_ROUND_CREATED`)
   - Initial lifecycle verification (`ROUND_REQUESTED`)

Result: `6/6 passed (100% green)`.

---

## 8. Verification Results

### Live Execution Path Verification
Executed the exact creation flow on application `5e97e2e1-5499-4adc-b2ba-58f806c1e5f6`:
1. `InterviewService.createInterview`: Resolved container `f1eb374a-3e42-4283-8ada-cb2bc1b86448`.
2. `InterviewService.createRound`: Successfully created `InterviewRound` `a8dd2e2e-2245-4b27-a564-981d2ce29d99`:
   - Round Title: `Recruiter Screening Call`
   - Round Type: `RECRUITER_SCREEN`
   - Status: `ROUND_REQUESTED`
   - Timezone: `Asia/Calcutta`
   - Format: `VIRTUAL`
3. Audit Log: Verified event `INTERVIEW_ROUND_CREATED` on `InterviewRound:a8dd2e2e-2245-4b27-a564-981d2ce29d99`.
4. RSC Application View: `tx.interview.findUnique` executed with zero runtime errors, correctly loading the interview and round hierarchy.
5. Server HTTP Status: Verified Next.js route responding with clean status codes.

---

## 9. Security & Authorization Verification

All frozen security contracts were preserved:
1. **Tenant Isolation**: Cross-tenant requests fail immediately with `NotFoundError` / `AuthorizationError`.
2. **Role Boundaries**: Candidates cannot create interview records for other candidates. Only staff (`EMPLOYEE` / `ADMIN`) or owner candidates can access interview containers.
3. **Internal Staff Notes Redaction**: Candidate view models continue to strictly redact `internalStaffNotes` and `staffAssessmentNotes`.
4. **Server Authority**: Browser client controls zero tenant IDs, actor IDs, or application ownership metadata; all parameters are authoritatively derived from `getAuthenticatedContext()`.

---

## 10. Complete Regression Results

- **`npm run typecheck`**: `tsc --noEmit` -> **0 errors**
- **`npm run lint`**: `eslint .` -> **0 errors, 0 warnings**
- **Interview OS Test Suites**:
  - `tests/unit/interview/phase8c1-interview-persistence.test.ts` (12 tests) -> **PASS**
  - `tests/unit/interview/phase8c2-interview-service.test.ts` (20 tests) -> **PASS**
  - `tests/unit/interview/phase8c3-interview-security.test.ts` (16 tests) -> **PASS**
  - `tests/unit/interview/phase8c4-interview-portal.test.ts` (16 tests) -> **PASS**
  - `tests/e2e/interview/phase8c5-interview-e2e.test.ts` (9 tests) -> **PASS**
  - `tests/integration/interview-create-round-regression.test.ts` (6 tests) -> **PASS**
  - **Total Interview OS Tests: 79 passed (79)**
- **OOS Cross-Domain Regression Suites**:
  - `tests/integration/phase10h-wcos-golden-path.test.ts` (15 tests) -> **PASS**
  - `tests/integration/phase9f-opos-cross-domain-golden-path.test.ts` (9 tests) -> **PASS**
  - **Total Cross-Domain Tests: 24 passed (24)**

============================================================
CREATE ROUND STATUS: FIXED / VERIFIED

INTERVIEW OS ARCHITECTURE: PRESERVED

OOS FROZEN DOMAIN CONTRACTS: PRESERVED
============================================================
