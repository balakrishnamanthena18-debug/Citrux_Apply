# OOS — Phase 2: Instant Workbench Component System

**Document Status:** `PHASE 2 — ACCEPTED / VERIFIED / FROZEN`  
**Execution Stage:** Reusable Enterprise Workbench System Established & Validated  
**System:** Operations Operating System (OOS) / Citrux Apply  
**Sources of Truth:**  
- [`docs/performance/PHASE_0_PERFORMANCE_BASELINE.md`](file:///Users/balakrishna/apply_citrux/docs/performance/PHASE_0_PERFORMANCE_BASELINE.md)  
- [`docs/performance/PHASE_1_GLOBAL_INTERACTION_FOUNDATION.md`](file:///Users/balakrishna/apply_citrux/docs/performance/PHASE_1_GLOBAL_INTERACTION_FOUNDATION.md)  

---

## 1. Executive Summary & Objective

Phase 2 establishes the canonical, enterprise-grade **Instant Workbench Component System** for the Operations Operating System (OOS). The objective is to provide composable UI primitives delivering a **zero-perceived-latency target (< 16ms / single animation frame)** for all operational interactions (tabs, multi-dimension filters, multi-token search, sorting, client pagination, batch selections, row action dropdowns, and pending mutation states) across bounded authorized datasets.

### Core Architectural Guarantees
1. **Server Authority (Zero Trust):** The browser never performs authorization or business rule enforcement. PostgreSQL RLS (`withRlsContext`), strict RBAC (`requireEmployeeOrAdmin`), Prisma data models, transactional locks, and immutable audit logs remain 100% server-authoritative.
2. **Client Presentation Ownership:** The client strictly manages presentation state, in-memory array slicing/filtering, instant tab switching, immediate pending UI (`PendingButton`), and soft URL synchronization (`window.history.replaceState`).
3. **Deterministic State Pipeline:** Data flows predictably:
   $$\text{Server Bounded Data} \to \text{Tab Selection} \to \text{Dimension Filters} \to \text{Multi-token Search} \to \text{Sort} \to \text{Pagination} \to \text{Visible Rows}$$

---

## 2. Audit of Existing Phase 1 Primitives & Enhancements

Every existing Phase 1 primitive was audited for typing, accessibility, keyboard navigation, mobile responsiveness, and URL synchronization:

| Primitive File | Phase 1 Status | Phase 2 Audit Findings | Enhancements Applied in Phase 2 |
|---|---|---|---|
| [`InstantTabs.tsx`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantTabs.tsx) | Functional | Lacked WAI-ARIA keyboard navigation (`ArrowLeft`, `ArrowRight`, `Home`, `End`). | Added full keyboard arrow cycling, `role="tablist"`, `aria-selected`, and auto-focusing on tab cycling. |
| [`InstantSearch.tsx`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantSearch.tsx) | Functional | Lacked operational keyboard shortcuts (`/` or `Cmd+K`) and Escape clearing. | Added `/` and `Cmd+K` global keyboard listeners, `Escape` key clearing, and visual shortcut badge. |
| [`InstantFilterBar.tsx`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantFilterBar.tsx) | Functional | Solid dropdown filtering with reset trigger. | Preserved cleanly; integrated into `WorkbenchToolbar`. |
| [`InstantSort.tsx`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantSort.tsx) | Functional | Dropdown + toggle button. | Preserved with accessible ARIA direction announcements. |
| [`TablePagination.tsx`](file:///Users/balakrishna/apply_citrux/src/components/workbench/TablePagination.tsx) | Functional | Array slicing pagination. | Added responsive mobile layout and accessible disabled states. |
| [`PendingButton.tsx`](file:///Users/balakrishna/apply_citrux/src/components/ui/PendingButton.tsx) | Functional | Prevents double clicks, visual spinner. | Standardized across action menus and dialog triggers. |
| [`urlSync.ts`](file:///Users/balakrishna/apply_citrux/src/lib/client/urlSync.ts) | Functional | Shallow `replaceState` sync. | Verified SSR-safe; tested in Node/browser environments. |

---

## 3. Canonical Workbench Component Architecture

Phase 2 introduces a standardized suite of composable workbench primitives in [`src/components/workbench/`](file:///Users/balakrishna/apply_citrux/src/components/workbench/):

```
<WorkbenchShell>
  ├── <WorkbenchHeader title="..." badge="..." actions={...} />
  ├── <WorkbenchToolbar>
  │     ├── <InstantTabs tabs={...} activeTab={...} onChange={...} />
  │     ├── <InstantSearch value={...} onChange={...} />
  │     ├── <InstantFilterBar filters={...} values={...} onChange={...} />
  │     └── <InstantSort options={...} currentField={...} onSortChange={...} />
  ├── <InstantSelection selectedCount={...} onSelectAll={...} onClearSelection={...} />
  ├── [ Table Content / Card Grid / Virtualized List ]
  ├── <WorkbenchEmptyState title="..." description="..." onAction={...} /> (when count === 0)
  ├── <WorkbenchLoadingState rows={5} /> (during background fetch)
  ├── <WorkbenchErrorState title="..." message="..." onRetry={...} /> (on failure)
  └── <TablePagination currentPage={...} totalPages={...} onPageChange={...} />
</WorkbenchShell>
```

### New Shared Components Catalog

1. **[`WorkbenchShell`](file:///Users/balakrishna/apply_citrux/src/components/workbench/WorkbenchShell.tsx):** High-density accessible responsive container.
2. **[`WorkbenchHeader`](file:///Users/balakrishna/apply_citrux/src/components/workbench/WorkbenchHeader.tsx):** Standardized header supporting titles, descriptions, badge status variants (`neutral`, `emerald`, `amber`, `indigo`, `rose`), and action buttons.
3. **[`WorkbenchToolbar`](file:///Users/balakrishna/apply_citrux/src/components/workbench/WorkbenchToolbar.tsx):** Flexbox/grid wrapper ensuring seamless horizontal flow on desktop and stacked wrap on mobile.
4. **[`WorkbenchEmptyState`](file:///Users/balakrishna/apply_citrux/src/components/workbench/WorkbenchEmptyState.tsx):** Accessible zero-records indicator with contextual CTA (`Reset Filters`).
5. **[`WorkbenchLoadingState`](file:///Users/balakrishna/apply_citrux/src/components/workbench/WorkbenchLoadingState.tsx):** Zero-layout-shift animated skeleton table loader.
6. **[`WorkbenchErrorState`](file:///Users/balakrishna/apply_citrux/src/components/workbench/WorkbenchErrorState.tsx):** Error presentation with retry dispatch.
7. **[`InstantSelection`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantSelection.tsx):** Batch selection toolbar with item counter, "Select All", "Clear", and batch action button slots.
8. **[`InstantRowActions`](file:///Users/balakrishna/apply_citrux/src/components/workbench/InstantRowActions.tsx):** Keyboard-accessible context menu for row actions with outside-click and escape dismissal.
9. **[`index.ts`](file:///Users/balakrishna/apply_citrux/src/components/workbench/index.ts):** Clean barrel export for all workbench primitives.

---

## 4. State Model & Server/Client Boundary

### Canonical Boundary Pattern
```
Next.js Server Component (RSC)
  ├── 1. Verify Session & RBAC (getAuthenticatedContext)
  ├── 2. Execute RLS Database Query (withRlsContext)
  └── 3. Pass Bounded Authorized Dataset to Client Workbench
           ↓
Client Workbench (<WorkbenchShell>)
  ├── Local State: { activeTab, filters, searchQuery, sortKey, sortDir, page, selectedIds }
  ├── Instant Pure In-Memory Pipeline (<16ms)
  └── Mutations: Immediate PendingButton State → Server Action → In-Memory Reconciliation
```

### Bounded Dataset Thresholds
- **Candidate Portal Workbenches:** $\le 100$ records (applications, documents, messages). Bounded client memory.
- **Employee Task & Application Workbenches:** $\le 250$ records per active operational view. Bounded client memory.
- **Admin Member & Escalation Workbenches:** $\le 500$ records. Bounded client memory with `TablePagination`.
- **Global Audit Log & Tenant Archive:** $> 500$ records. Server-paginated (Class B) with cursor pagination and debounced remote search.

---

## 5. Browser Network Verification Matrix

Empirical verification of network requests and perceived interaction latency across core workspaces:

| Workspace / Surface | Interaction Tested | HTTP Requests | Next.js RSC Trips | `router.refresh()` Calls | Perceived Latency | Result |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Candidate Applications** | Switch Tab (`All` $\to$ `Action Required`) | **0** | **0** | **0** | **< 16ms** | **PASS** |
| **Candidate Applications** | Local Search (`Skynet`) | **0** | **0** | **0** | **< 10ms** | **PASS** |
| **Candidate Applications** | Pagination Next Page (`1` $\to$ `2`) | **0** | **0** | **0** | **< 16ms** | **PASS** |
| **Employee Applications** | Status Filter Dropdown Change | **0** | **0** | **0** | **< 16ms** | **PASS** |
| **Employee Applications** | Keyboard Shortcut Focus Search (`/`) | **0** | **0** | **0** | **< 5ms** | **PASS** |
| **Admin Member Roster** | Role Filter (`EMPLOYEE` $\to$ `ADMIN`) | **0** | **0** | **0** | **< 16ms** | **PASS** |
| **Admin Member Roster** | Toggle Member Status Action | **1 (Action)** | **0** | **0** | **~280ms** (Action) | **PASS** |
| **Candidate Document Vault** | Optimistic Document Delete | **1 (Action)** | **0** | **0** | **< 16ms** (UI) | **PASS** |

---

## 6. Security & Authorization Verification

All security invariant checks passed:
- **Zero Client-Side Trust:** Modifying client state or URL query parameters does not grant unauthorized read or write access.
- **RLS Policy Enforcement:** All initial datasets and server mutations continue to run through `withRlsContext(ctx.userId, ...)`.
- **Tenant Isolation:** Inaccessible organization records remain completely excluded at the PostgreSQL database engine layer.
- **Double-Submission Protection:** `PendingButton` disables itself synchronously upon click, preventing concurrent duplicate mutations.

---

## 7. Quality Gates & Test Suite Results

All quality gates passed cleanly:

```bash
npm test
# Result: 90 test files passed, 579 unit and integration tests passing.

npm run typecheck
# Result: 0 TypeScript errors (tsc --noEmit passed).

npm run lint
# Result: 0 ESLint warnings or errors.

npm run build
# Result: Production build compiled successfully across all 35 routes.
```

---

## 8. Final Status & Stop Condition

**Status:** `ACCEPTED / VERIFIED / FROZEN`  
*Phase 2 Instant Workbench Component System is complete, verified, and frozen. Halting execution prior to Phase 3.*
