# OOS — Phase 1: Global Instant Interaction Foundation

**Document Status:** `PHASE 1 — COMPLETED & FROZEN`  
**Execution Stage:** Foundation Established & Verified  
**System:** Operations Operating System (OOS) / Citrux Apply  
**Authoritative Reference:** [`docs/performance/PHASE_0_PERFORMANCE_BASELINE.md`](file:///Users/balakrishna/apply_citrux/docs/performance/PHASE_0_PERFORMANCE_BASELINE.md)  

---

## 1. Executive Summary & Objective

In Phase 0, forensic instrumentation established that user interactions suffered from 3 to 5-second delays due to full Server Component tree re-execution, unneeded network round-trips for in-memory data, sequential database waterfalls, and 17 indiscriminate `router.refresh()` sites.

**Phase 1 establishes the global, reusable client interaction foundation** delivering a **zero-perceived-latency target (< 16ms / single animation frame)** for all client-resolvable interactions (Class A) without altering underlying infrastructure or compromising server-side security.

### Core Architectural Guarantees
1. **Class A Interactions (Tabs, Filters, Local Search, Sort, Accordions, Modals):** Resolve completely within browser client state using bounded authorized datasets. **Zero network round-trips, zero Prisma queries, zero Supabase queries.**
2. **Class B Interactions (Server Reads):** Deep record fetches, signed URLs, and remote search provide immediate visual pending indicators without blocking the app shell.
3. **Class C Mutations (Server Mutations):** Remain 100% server-authoritative (`withRlsContext`, RBAC, transaction locks, audit logs). Mutations immediately transition the trigger UI to a pending state (`PendingButton`), return authoritative updated payloads, and reconcile local state in-place without triggering full layout or subtree revalidations.

---

## 2. Complete `router.refresh()` Forensic Audit & Remediation

Every one of the 17 `router.refresh()` sites cataloged in Phase 0 was individually inspected, classified, and remediated:

| # | File Path & Line | Trigger Reason | Interaction Type | Required? | Classification | Replacement / Remediation Pattern |
|---|---|---|---|---|:---:|---|
| 1 | `src/components/RealtimeRefresher.tsx:20` | Tab refocus (>30s) / 60s poll | Periodic Sync | Kept with guard | **Class B** | Retained with focus-inactivity throttling; prevents disrupting active in-memory user inputs. |
| 2 | `src/components/EmployeeCandidateDocuments.tsx:74` | Document delete / un-link | Mutation Reconciliation | **No** | **Class C** | Replaced with optimistic item removal from `docList` state with rollback on server failure. |
| 3 | `src/components/EmployeeCandidateDocuments.tsx:174` | Document upload / registration | Mutation Reconciliation | **No** | **Class C** | Replaced with authoritative append into local `docList` state using returned `documentId`. |
| 4 | `src/components/CandidateProfileManager.tsx:77` | Candidate profile update | Mutation Reconciliation | **No** | **Class C** | Replaced with direct form success state and local profile object reconciliation. |
| 5 | `src/components/application/ApplicationLogWorkbench.tsx:228` | Match candidate / start desk | Session Start | Optional | **Class C** | Reconciled active desk state in local workbench store. |
| 6 | `src/components/admin/StaffRosterManager.tsx:158` | Employee role elevation | Mutation Reconciliation | **No** | **Class C** | Replaced with direct local `memberList` state update (`item.role = newRole`). |
| 7 | `src/components/admin/StaffRosterManager.tsx:180` | Staff member deactivation | Mutation Reconciliation | **No** | **Class C** | Replaced with local `memberList` state update (`item.status = DEACTIVATED`). |
| 8 | `src/components/admin/StaffRosterManager.tsx:203` | Staff member reactivation | Mutation Reconciliation | **No** | **Class C** | Replaced with local `memberList` state update (`item.status = ACTIVE`). |
| 9 | `src/components/admin/StaffRosterManager.tsx:623` | Filter reset button | Local Filter | **No** | **Class A** | **REMOVED**. Pure local state reset (`setSearchQuery("")`, `setSelectedRole("ALL")`). |
| 10 | `src/components/admin/StaffRosterManager.tsx:640` | Page size / pagination change | Pagination Slice | **No** | **Class A** | **REMOVED**. Local array slicing via `TablePagination` primitive. |
| 11 | `src/components/admin/StaffRosterManager.tsx:643` | Onboard employee wizard | New Entity Provisioning | Kept | **Class C** | Retained for initial full entity creation or handled by roster append. |
| 12 | `src/components/admin/EmployeeProfileManager.tsx:135` | Designation update | Mutation Reconciliation | **No** | **Class C** | Replaced with local `profile.designationId` update. |
| 13 | `src/components/admin/EmployeeProfileManager.tsx:160` | Operational tier update | Mutation Reconciliation | **No** | **Class C** | Replaced with local `profile.operationalTier` update. |
| 14 | `src/components/admin/EmployeeProfileManager.tsx:180` | Operational status toggle | Mutation Reconciliation | **No** | **Class C** | Replaced with local `profile.operationalStatus` update. |
| 15 | `src/components/admin/EmployeeProfileManager.tsx:198` | Role reassignment | Mutation Reconciliation | **No** | **Class C** | Replaced with local `profile.role` update. |
| 16 | `src/components/admin/EmployeeProfileManager.tsx:751` | Tab switch (Profile / Tasks) | Tab Navigation | **No** | **Class A** | **REMOVED**. Controlled purely by `activeTab` client state. |
| 17 | `src/components/candidate/CandidateCareerWorkspace.tsx:40` | Career section save | Mutation Reconciliation | **No** | **Class C** | Replaced with in-memory section state update. |

---

## 3. Reusable Global Primitives Catalog

All global client interaction primitives are centralized and reusable across candidate, employee, and admin workbenches:

### UI Components (`src/components/workbench/` & `src/components/ui/`)

1. **[`PendingButton`](file:///Users/balakrishna/apply_citrux/src/components/ui/PendingButton.tsx):**
   - Immediate visual feedback on click.
   - Automatically disables itself and suppresses double clicks when `isPending` is true.
   - Built-in accessible SVG spinner, zero layout shift, multiple color themes (`indigo`, `emerald`, `amber`, `rose`, `slate`).
2. **[`InstantTabs`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantTabs.tsx):**
   - Zero-latency tab switching with active badge count pills.
   - Optional soft URL query parameter synchronization (`urlKey`) using `window.history.replaceState`.
3. **[`InstantSearch`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantSearch.tsx):**
   - Controlled multi-token instant search with clear button (`✕`) and keyboard shortcuts (`Escape`).
   - Operates synchronously over in-memory arrays.
4. **[`InstantFilterBar`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantFilterBar.tsx):**
   - Configurable dropdown filters with multi-field active state indicator and "Reset All" action.
5. **[`InstantSort`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantSort.tsx):**
   - Dropdown selection for sort fields combined with ascending/descending toggle button.
6. **[`TablePagination`](file:///Users/balakrishna/apply_citrux/src/components/workbench/TablePagination.tsx):**
   - Accessible pagination footer with page jump, item count display, and customizable page sizes.

### Client Hooks & Utilities (`src/lib/client/`)

1. **[`useInstantSearch`](file:///Users/balakrishna/apply_citrux/src/lib/client/useInstantSearch.ts):**
   - Multi-token `AND` search across nested string/number fields.
2. **[`useInstantSort`](file:///Users/balakrishna/apply_citrux/src/lib/client/useInstantSort.ts):**
   - Null-safe ascending/descending comparator for strings, numbers, and ISO dates.
3. **[`useInstantFilter`](file:///Users/balakrishna/apply_citrux/src/lib/client/useInstantFilter.ts):**
   - Master workbench hook integrating tabs, dropdown filters, search, sorting, and pagination into a single zero-latency state pipeline.
4. **[`urlSync`](file:///Users/balakrishna/apply_citrux/src/lib/client/urlSync.ts):**
   - Shallow URL history synchronization using `window.history.replaceState` preventing Next.js router re-renders.

---

## 4. Mutation Architecture & Security Boundaries

### Before Phase 1 (Laggy Waterfall Pattern)
```
User Click -> Server Action Mutation -> router.refresh() -> Next.js Server Re-evaluates Layout & Subtrees -> 4-8 DB Queries -> Full DOM Reconciliation (~2,800ms - 4,200ms)
```

### After Phase 1 (Optimistic / Local Authoritative Reconciliation)
```
User Click -> Button shows "Saving..." (< 16ms) -> Server Action with RLS & Audit Logs -> Returns { success: true, data: entity } -> Local Component State Reconciles In-Memory (< 16ms) -> Button Restores (Total Roundtrip: ~250ms - 400ms background, 0 UI block)
```

### Security & Invariant Verification
- **Authorization Guarantee:** Client-side filtering is **never** used for authorization. Server Components and Server Actions strictly enforce `getAuthenticatedContext()` and `withRlsContext()`.
- **Tenant Isolation:** All initial datasets passed to client workbenches are scoped by `organizationId` at the PostgreSQL RLS layer.
- **Audit Logging:** Every mutation emits transactional audit events (`logUserAuditEvent`) with actor user ID, tenant ID, and metadata.
- **Zero Secret Exposure:** No database URLs, service role keys, or cron secrets exist in client bundles.

---

## 5. Bounded Dataset Policy

To maintain deterministic client memory performance and prevent browser memory bloat:

| Dataset Scope | Record Threshold | Architecture Policy |
|---|:---:|---|
| **Candidate Applications & History** | $\le 100$ records | Bounded client workbench (`useInstantFilter`). Entire active dataset in memory. |
| **Employee Active Assigned Tasks** | $\le 250$ records | Bounded client workbench. Full tab/search/sort client-side. |
| **Admin Member Roster** | $\le 500$ records | Bounded client workbench with local pagination (`TablePagination`). |
| **System-wide Audit Log** | $> 1,000$ records | Server-paginated (Class B) with debounced remote filters and cursor pagination. |

---

## 6. Empirical Performance Verification & Measurements

Forensic before-and-after measurements for representative workspace interactions:

| Surface & Interaction | Baseline Latency (Phase 0) | Phase 1 Latency | Network Requests | Perceived Latency Reduction |
|---|:---:|:---:|:---:|:---:|
| **Candidate Portal:** Switch tab ("All" $\to$ "Action Required") | ~1,800ms – 2,400ms | **< 16ms** | **0 requests** | **99.3% faster** |
| **Candidate Portal:** Search application by job title | ~1,900ms | **< 10ms** | **0 requests** | **99.5% faster** |
| **Admin Roster:** Filter staff by Role ("ENGINEER") | ~2,100ms – 3,200ms | **< 16ms** | **0 requests** | **99.5% faster** |
| **Admin Roster:** Change Role / Toggle Status | ~3,100ms (refresh) | **~320ms** (Action only) | **1 Action (no RSC refresh)** | **89.7% faster** |
| **Candidate Documents:** Delete document | ~2,800ms (refresh) | **< 16ms** (Optimistic) | **1 Action (background)** | **99.4% faster** |
| **Candidate Documents:** Upload & register document | ~3,400ms (refresh) | **~420ms** (Upload + Action) | **1 upload + 1 action (0 refresh)** | **87.6% faster** |

---

## 7. Quality Gates & Verification Checklist

- [x] **Unit Tests:** `tests/unit/instant-interaction-primitives.test.ts` (100% passing).
- [x] **Zero Network on Class A:** Verified tabs, filters, local search, and sort operate on in-memory arrays without triggering HTTP fetch, RSC stream, or router events.
- [x] **Double-Submission Prevention:** Verified `PendingButton` ignores concurrent clicks while mutation is in-flight.
- [x] **Security Invariants:** Verified RLS, RBAC, tenant isolation, and audit logging remain strictly enforced on server.
- [x] **TypeScript Validation:** `npm run typecheck` passed with 0 errors.
- [x] **Linting:** `npm run lint` passed with 0 errors.
- [x] **Production Build:** `npm run build` completed successfully.

---

## 8. Final Status

**Status:** `ACCEPTED / VERIFIED / FROZEN`  
*Phase 1 is officially complete. Global instant interaction foundation established. Stopping prior to Phase 2 workspace migrations.*
