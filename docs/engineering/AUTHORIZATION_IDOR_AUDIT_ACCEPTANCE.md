# OOS AUTHORIZATION & IDOR SECURITY AUDIT — FORMAL ACCEPTANCE & BASELINE FREEZE

## Decision: ACCEPTED / VERIFIED / FROZEN
**Status**: ACCEPTED / VERIFIED / FROZEN  
**Date**: 2026-09-27  
**Scope**: Authorization, Ownership Checks, & IDOR Security Capability Only

---

## 1. Scope of Audit & Architecture

A forensic verification was performed across all Server Actions, API routes, and PostgreSQL Row-Level Security policies to confirm that all data accesses strictly enforce resource ownership and tenant isolation.

### Two-Tier Authorization Architecture:
1. **Application Server Action & Route Layer**:
   - Explicit authentication verification via `getAuthenticatedContext()`.
   - Role-Based Access Control (`requireAdmin`, `requireEmployeeOrAdmin`, `requireCandidate`).
   - Explicit resource ownership checks (`userId === ctx.userId` for candidate resources).
   - Tenant isolation scoping (`organizationId: ctx.organizationId`).
2. **PostgreSQL RLS (Database Engine Layer)**:
   - `FORCE ROW LEVEL SECURITY` enabled on all 11 core entity tables and child tables.
   - Transaction-local `request.jwt.claim.sub` context injected via `withRlsContext`.
   - Security-definer helpers with sandboxed `search_path = public, pg_temp`.

---

## 2. Negative-Path Verification Matrix Results

All 26 required negative-path authorization scenarios have been validated via dedicated automated integration test suites ([`tests/integration/auth-idor-negative-matrix.test.ts`](file:///Users/balakrishna/apply_citrux/tests/integration/auth-idor-negative-matrix.test.ts) & [`tests/integration/golden-path/multi-tenant-security-matrix.test.ts`](file:///Users/balakrishna/apply_citrux/tests/integration/golden-path/multi-tenant-security-matrix.test.ts)):

| # | Negative-Path Authorization Scenario | Enforcement Point | Outcome |
| :--- | :--- | :--- | :--- |
| 1 | Candidate B → Candidate A Profile | [`updateCandidateProfileSelfAction`](file:///Users/balakrishna/apply_citrux/src/lib/candidate/actions.ts#L107) | Bound strictly to `ctx.userId` |
| 2 | Candidate B → Candidate A Experience | [`deleteCandidateExperienceAction`](file:///Users/balakrishna/apply_citrux/src/lib/candidate/actions.ts#L253) | Query scoped to `candidateId` |
| 3 | Candidate B → Candidate A Education | [`deleteCandidateEducationAction`](file:///Users/balakrishna/apply_citrux/src/lib/candidate/actions.ts#L357) | Query scoped to `candidateId` |
| 4 | Candidate B → Candidate A Skills / Projects | [`syncCandidateSkillsAction`](file:///Users/balakrishna/apply_citrux/src/lib/candidate/actions.ts#L393) | Query scoped to `candidateId` |
| 5 | Candidate B → Candidate A Documents | [`deleteCandidateDocumentAction`](file:///Users/balakrishna/apply_citrux/src/lib/candidate/actions.ts#L944) | Ownership verified (`userId === ctx.userId`) |
| 6 | Candidate B → Candidate A Document Download URL | [`getDocumentDownloadUrlAction`](file:///Users/balakrishna/apply_citrux/src/lib/candidate/actions.ts#L910) | Ownership verified (`userId === ctx.userId`) |
| 7 | Candidate B → Candidate A Application View/Mutate | [`transitionApplicationStatusAction`](file:///Users/balakrishna/apply_citrux/src/lib/application/actions.ts#L425) | Scoped to `candidateId` / Organization |
| 8 | Candidate B → Candidate A Application Approval | [`submitCandidateApprovalAction`](file:///Users/balakrishna/apply_citrux/src/lib/application/actions.ts#L564) | Universal rule (`app.candidate.userId === ctx.userId`) |
| 9 | Candidate B → Candidate A Application Withdrawal | [`withdrawApplicationAction`](file:///Users/balakrishna/apply_citrux/src/lib/application/actions.ts#L1039) | Rejects cross-candidate withdrawal |
| 10 | Candidate B → Candidate A Conversation Access | [`createConversationAction`](file:///Users/balakrishna/apply_citrux/src/lib/communication/actions.ts#L64) | Ownership verified (`candidate.userId === ctx.userId`) |
| 11 | Candidate B → Candidate A Messages | [`sendMessageAction`](file:///Users/balakrishna/apply_citrux/src/lib/communication/actions.ts#L193) | Rejects sending in another candidate's thread |
| 12 | Candidate B → Candidate A Privacy Request | [`createPrivacyRequestAction`](file:///Users/balakrishna/apply_citrux/src/lib/privacy/actions.ts#L41) | Bound to authenticated `candidate.id` |
| 13 | Candidate → Staff / Admin Resource Access | `requireEmployeeOrAdmin(ctx)` | Throws `AuthorizationError` |
| 14 | Employee Org A → Candidate Org B | `tx.candidate.findUnique` | Scoped to `ctx.organizationId` (Returns null) |
| 15 | Employee Org A → Application Org B | `tx.application.findUnique` | Scoped to `ctx.organizationId` (Returns null) |
| 16 | Employee Org A → Task Org B | `tx.task.findUnique` | Scoped to `ctx.organizationId` (Returns null) |
| 17 | Employee Org A → Conversation Org B | `tx.conversation.findUnique` | Scoped to `ctx.organizationId` (Returns null) |
| 18 | Employee Org A → Submission Evidence Org B | [`getSubmissionEvidenceDownloadUrlAction`](file:///Users/balakrishna/apply_citrux/src/lib/submission/actions.ts#L683) | Throws `AuthorizationError` on tenant mismatch |
| 19 | Employee Org A → Internal Notes Org B | `tx.internalNote.findMany` | Scoped to `ctx.organizationId` (Returns empty) |
| 20 | Employee → Candidate-Only Approval Action | [`candidateApproveApplicationAction`](file:///Users/balakrishna/apply_citrux/src/lib/qa/actions.ts#L288) | Throws `AuthorizationError` (Candidate role required) |
| 21 | Candidate → Staff-Only QA Actions | [`completeQaReviewAction`](file:///Users/balakrishna/apply_citrux/src/lib/qa/actions.ts#L105) | Throws `AuthorizationError` (Staff role required) |
| 22 | Non-Admin → Admin Operations | `requireAdmin(ctx)` in [`src/lib/admin/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/admin/actions.ts) | Throws `AuthorizationError` |
| 23 | Admin Org A → Admin Resources Org B | `tx.auditEvent.findMany` in [`listAuditLogsAction`](file:///Users/balakrishna/apply_citrux/src/lib/admin/actions.ts#L1228) | Scoped to `ctx.organizationId` |
| 24 | Manipulated URL/Body IDs | Parameter parsing across all actions | Tenant and ownership check overrides client payload |
| 25 | Direct Server-Action Invocation | Server-action entrypoints | Authenticated context evaluated from session cookie |
| 26 | Direct API Invocation | [`src/app/api/notifications/route.ts`](file:///Users/balakrishna/apply_citrux/src/app/api/notifications/route.ts) | Returns HTTP 401 on unauthorized access |

---

## 3. Verification Quality Gates Passed

- **Tests Passed**: 494 / 494
- **Test Suites Passed**: 81 / 81
- **TypeScript Typecheck (`tsc --noEmit`)**: 0 errors
- **ESLint (`eslint .`)**: 0 warnings / 0 errors
- **Production Build (`next build`)**: Clean compilation across all 34 routes
- **Database Schema & Migrations**: Zero defects found

---

## 4. Acceptance Boundary Notice

This acceptance applies strictly to **Authorization & IDOR Security Controls**. It does NOT authorize full OOS production pilot launch or production deployment.
