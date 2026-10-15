# PHASE 01 — CRM PERMISSION MATRIX & SECURITY ARCHITECTURE

> **Document Status:** RECONCILED SPECIFICATION / PENDING HUMAN ACCEPTANCE  
> **Document Version:** 1.11.0  
> **Classification:** Security Engineering, RBAC & Multi-Tenant Data Governance  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Date:** 2026-10-15  
> **Parent Specification:** [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md)  
> **Reconciliation Reports:** [`docs/crm/phase-01.1-reconciliation-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.1-reconciliation-report.md), [`docs/crm/phase-01.2-final-gate-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.2-final-gate-report.md), [`docs/crm/phase-01.3-final-security-challenge.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.3-final-security-challenge.md), [`docs/crm/phase-01.4-final-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.4-final-consistency-report.md), [`docs/crm/phase-01.5-final-adversarial-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.5-final-adversarial-consistency-report.md), [`docs/crm/phase-01.6-final-safety-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.6-final-safety-corrections-report.md), [`docs/crm/phase-01.7-adversarial-verification-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.7-adversarial-verification-report.md), [`docs/crm/phase-01.8-final-adversarial-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.8-final-adversarial-corrections-report.md), [`docs/crm/phase-01.9-final-transaction-safety-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.9-final-transaction-safety-report.md), [`docs/crm/phase-01.10-final-recovery-and-governance-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.10-final-recovery-and-governance-audit.md), [`docs/crm/phase-01.11-final-safety-and-traceability-review.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.11-final-safety-and-traceability-review.md)  

---

## 1. Security Architecture Principles

1. **Server-Side Enforcement Absolute:** UI conditional rendering provides usability; server actions and database constraints provide security. No client-supplied role, permission claim, organization ID, owner ID, or team ID is trusted.
2. **Default-Deny Evaluation:** Any unrecognized permission key, missing authorization context, or ungranted role authorization strictly defaults to denial (`AuthorizationError`).
3. **Strict Multi-Tenant Isolation with Defense-in-Depth:**
   - PostgreSQL `FORCE ROW LEVEL SECURITY` is applied to every CRM table, isolating connection sessions using `request.jwt.claim.sub`.
   - Application queries under Prisma explicitly include `organizationId: ctx.organizationId` as a secondary defense layer. We explicitly recognize that `FORCE RLS` protects database connection roles subject to RLS, but does not substitute for application-level query scoping when connecting via superuser or bypass poolers.
4. **Complete Candidate Role Denial:** The `Role.CANDIDATE` role is completely blocked from reading, searching, writing, or querying any CRM table. Candidates have zero visibility into sales leads, pipeline stages, activity logs, or sales metrics.
5. **Designations as Governed Taxonomies, Not Unrestricted Security Grants:** Staff specializations (e.g. "Sales Specialist", "Admissions Advisor") are recorded via `Designation` on `Membership`. However, raw string matching on designations alone is not an unrestricted security grant. Permissions are checked against cryptographic user context (`AuthenticatedContext`), active membership status, and explicit scope rules.

---

## 2. Granular CRM Permission Taxonomy & Scope

The CRM domain introduces eight explicit permissions:

| Permission Key | Description | Tenant Scope | Team / Self Scope |
|---|---|---|---|
| `crm:lead:read` | View lead directory, search leads, inspect lead dossier, and view activity timeline. | All active staff in tenant. | Unrestricted for staff. Candidates denied. |
| `crm:lead:write` | Create manual lead, edit contact details, update preferences, add qualification notes. | Admin or active sales staff in tenant. | Non-sales staff can only create initial inquiry; mutations restricted to assigned owner or sales staff. |
| `crm:lead:assign` | Assign, reassign, or claim ownership of a lead. | Admin can assign any lead across tenant. | Team Leads can assign leads within their verified team (`Membership.team`). Sales reps can only claim unassigned leads or reassign leads they own. |
| `crm:lead:stage_transition` | Advance or regress lead through sales stages (`NEW` $\rightarrow$ `QUALIFIED` $\rightarrow$ `LOST` / `DISQUALIFIED`). | Admin (tenant-wide). | Assigned lead owner or Team Lead of the owner's team. Other staff cannot transition stages. |
| `crm:activity:create` | Log sales calls, discovery notes, qualification interviews, and schedule follow-ups. | Admin or active sales staff in tenant. | Assigned lead owner, Team Lead of the owner's team, or designated sales staff on unassigned leads. Other delivery staff denied. |
| `crm:lead:convert` | Execute multi-domain conversion saga of `QUALIFIED` lead into Candidate and CBOS CustomerAccount. | Admin (tenant-wide). | Senior Admissions Advisors / Sales Specialists holding verified conversion authority. Other staff denied. |
| `crm:report:read` | Access pipeline metrics, stage velocity, conversion rates, and export CRM CSV reports. | Admin (tenant-wide reports & raw exports). | Team Leads see team-aggregated metrics. Sales reps see self-performance metrics only. |
| `crm:admin:configure` | Manage public intake API tokens, auto-assignment rules, honeypot settings, and reopen disqualified leads. | Admin only. | Zero employee access. |

---

## 3. Role & Designation Mapping Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              ROLE & PERMISSION MATRIX                                  │
├──────────────────────────┬──────────────┬──────────────┬──────────────┬────────────────┤
│ Permission               │ Role.ADMIN   │ Role.EMPLOYEE│ Role.EMPLOYEE│ Role.CANDIDATE │
│                          │              │ (Sales/Admit)│ (Other Staff)│                │
├──────────────────────────┼──────────────┼──────────────┼──────────────┼────────────────┤
│ crm:lead:read            │      ✅      │      ✅      │      ✅      │       ❌       │
│ crm:lead:write           │      ✅      │      ✅      │      ⚠️*     │       ❌       │
│ crm:lead:assign          │      ✅      │      ✅      │       ❌     │       ❌       │
│ crm:lead:stage_transition│      ✅      │      ✅      │       ❌     │       ❌       │
│ crm:activity:create      │      ✅      │      ✅      │       ❌**   │       ❌       │
│ crm:lead:convert         │      ✅      │      ✅      │       ❌     │       ❌       │
│ crm:report:read          │      ✅      │      ✅      │       ❌     │       ❌       │
│ crm:admin:configure      │      ✅      │      ❌      │       ❌     │       ❌       │
└──────────────────────────┴──────────────┴──────────────┴──────────────┴────────────────┘
* Note: Non-sales staff may submit an inbound intake form, but subsequent pipeline management is restricted to sales staff.
** Note: Delivery specialists (coaches, resume writers) do not manage sales activity timelines.
```

### 3.1 Staff Designation Classification
To distinguish sales specialists from delivery specialists (resume writers, QA reviewers, interview coaches) without introducing database enum migrations:
- **Sales & Admissions Designations:**  
  `Designation.code` or `Designation.name` matching:
  - `"SALES_SPECIALIST"` / `"Sales Specialist"`
  - `"ADMISSIONS_ADVISOR"` / `"Admissions Advisor"`
  - `"INTAKE_COORDINATOR"` / `"Intake Coordinator"`
  - `"ACCOUNT_EXECUTIVE"` / `"Account Executive"`
- **Team Lead Authority:**  
  Any `Role.EMPLOYEE` with `Membership.isTeamLead = true` inherits `crm:lead:assign` and `crm:report:read` scoped to leads owned by members of their designated team.
- **Admin Supremacy:**  
  `Role.ADMIN` possesses all CRM permissions unconditionally within their tenant. Admin authority is strictly tenant-scoped (`where: { organizationId: ctx.organizationId }`).

---

## 4. Server-Side Guard Implementation Contract (Default-Deny)

Every CRM server action must enforce authorization using an exhaustive default-deny evaluator. **No caller-supplied ownership or team identifiers are trusted; all entity relationships and scopes must be loaded server-side from PostgreSQL.**

```typescript
// Illustrative Server Action Guard Pattern (Production implementation loads target entities server-side)
import { getAuthenticatedContext } from "@/lib/auth/context";
import { Role } from "@/generated/prisma";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export type CrmPermission =
  | "crm:lead:read"
  | "crm:lead:write"
  | "crm:lead:assign"
  | "crm:lead:stage_transition"
  | "crm:activity:create"
  | "crm:lead:convert"
  | "crm:report:read"
  | "crm:admin:configure";

export interface PermissionContextOptions {
  targetLeadId?: string;       // Verified UUID loaded server-side
  targetAssigneeId?: string;   // For assignment/claim evaluation
}

export async function requireCrmPermission(
  ctx: AuthenticatedContext,
  permission: CrmPermission,
  options?: PermissionContextOptions
): Promise<void> {
  // 1. Strictly block Candidates across all CRM operations
  if (ctx.role === Role.CANDIDATE) {
    throw new AuthorizationError("Candidates are not permitted to access CRM");
  }

  // 2. Resolve target lead server-side if targetLeadId is provided (Tenant Scoped)
  let targetLead: {
    id: string;
    organizationId: string;
    assignedStaffId: string | null;
    assignedStaffTeam: string | null;
  } | null = null;

  if (options?.targetLeadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: options.targetLeadId, organizationId: ctx.organizationId },
      select: {
        id: true,
        organizationId: true,
        assignedStaffId: true,
        assignedStaff: { select: { team: true } }
      }
    });

    if (!lead) {
      throw new NotFoundError("Lead not found or access denied across tenant");
    }

    targetLead = {
      id: lead.id,
      organizationId: lead.organizationId,
      assignedStaffId: lead.assignedStaffId,
      assignedStaffTeam: lead.assignedStaff?.team ?? null
    };
  }

  // 3. Admins hold tenant-wide authority (strictly within their verified tenant)
  if (ctx.role === Role.ADMIN) {
    if (targetLead && targetLead.organizationId !== ctx.organizationId) {
      throw new AuthorizationError("Cross-tenant administrative access is prohibited");
    }
    return;
  }

  // 4. Evaluate Employee permissions via exhaustive switch (Default-Deny)
  if (ctx.role === Role.EMPLOYEE) {
    switch (permission) {
      case "crm:lead:read":
        return; // Permitted for any active staff member within tenant

      case "crm:lead:write":
        if (await isSalesStaff(ctx) || (targetLead && targetLead.assignedStaffId === ctx.userId)) {
          return;
        }
        throw new AuthorizationError("Modifying lead requires sales authority or assigned ownership");

      case "crm:lead:assign":
        if (!targetLead) {
          throw new AuthorizationError("Target lead context required for assignment evaluation");
        }
        if (!options?.targetAssigneeId) {
          throw new AuthorizationError("Proposed assignee ID is required for assignment");
        }

        // Server-Side Assignee Validation (Active Membership, Tenant Match, Ownership Eligibility)
        const assigneeMembership = await prisma.membership.findFirst({
          where: {
            userId: options.targetAssigneeId,
            organizationId: ctx.organizationId,
            status: "ACTIVE"
          },
          include: { designation: true }
        });

        if (!assigneeMembership) {
          throw new AuthorizationError("Proposed assignee is missing, inactive, or belongs to another tenant");
        }

        if (!isEligibleCrmOwner(assigneeMembership)) {
          throw new AuthorizationError("Proposed assignee designation is not eligible for CRM lead ownership");
        }

        // Sales Staff: Can ONLY claim unassigned leads for themselves OR reassign leads they currently own
        if (await isSalesStaff(ctx)) {
          if (targetLead.assignedStaffId === null && options.targetAssigneeId === ctx.userId) {
            return; // Claiming unassigned lead
          }
          if (targetLead.assignedStaffId === ctx.userId) {
            return; // Reassigning lead currently owned by caller to an eligible sales peer
          }
          throw new AuthorizationError("Sales staff may only claim unassigned leads or reassign leads they own");
        }

        // Team Leads: Authority strictly validates against the DESTINATION assignee's verified team
        if (await isTeamLeadForTeam(ctx, assigneeMembership.team)) {
          // Team lead can assign unassigned leads or leads within their team to members of their team
          if (targetLead.assignedStaffId === null || await isTeamLeadForTeam(ctx, targetLead.assignedStaffTeam)) {
            return;
          }
          throw new AuthorizationError("Team Leads cannot reassign leads currently owned by another team");
        }
        throw new AuthorizationError("Lead assignment requires Team Lead authority over the destination team or authorized Sales ownership");

      case "crm:lead:stage_transition":
        if (!targetLead) {
          throw new AuthorizationError("Target lead context required for stage transition");
        }
        if (targetLead.assignedStaffId === ctx.userId || await isTeamLeadForTeam(ctx, targetLead.assignedStaffTeam)) {
          return;
        }
        throw new AuthorizationError("Stage transition requires assigned owner or Team Lead authority");

      case "crm:activity:create":
        // Permitted if caller is assigned owner, Team Lead of owner's team, or sales staff on unassigned lead
        if (targetLead) {
          if (targetLead.assignedStaffId === ctx.userId) return;
          if (await isTeamLeadForTeam(ctx, targetLead.assignedStaffTeam)) return;
          if (targetLead.assignedStaffId === null && await isSalesStaff(ctx)) return;
          throw new AuthorizationError("Logging activities requires lead ownership, sales triage, or team authority");
        }
        if (await isSalesStaff(ctx)) return;
        throw new AuthorizationError("Activity creation requires sales authority");

      case "crm:lead:convert":
        if (await isAuthorizedAdmissionsStaff(ctx)) {
          return;
        }
        throw new AuthorizationError("Conversion requires authorized Admissions authority");

      case "crm:report:read":
        if (await isTeamLead(ctx) || await isSalesStaff(ctx)) {
          return;
        }
        throw new AuthorizationError("Report access requires Team Lead or Sales authority");

      case "crm:admin:configure":
      default:
        // Default-Deny unrecognized or admin-only permissions
        throw new AuthorizationError(`Permission denied for ${permission}`);
    }
  }

  // Ultimate fallback
  throw new AuthorizationError("Unauthorized CRM access");
}
```

### 4.1 Assignment Concurrency Protocol & Mutation-Time Invariant Proof

#### Limitation of Prior-Assignee-Only Checks:
A simple conditional update on `WHERE assigned_staff_id IS NOT DISTINCT FROM $expectedPreviousAssigneeId` only protects against changes to the *target lead's prior assignee*. It does **not** protect against concurrent mutations occurring to:
1. The **caller's active membership status and authority** (e.g. manager revoked, demoted, or deactivated mid-flight).
2. The **proposed assignee's active status** (e.g. employee deactivated or terminated mid-flight).
3. The **proposed assignee's team membership** (e.g. sales rep transferred to an engineering or non-sales team between authorization check and mutation).
4. The **proposed assignee's CRM ownership eligibility** (e.g. designation demoted or altered).

#### Deterministic Lock Acquisition Order & Lock Inventory:
To eliminate deadlocks between concurrent assignment, reassignment, and administrative membership transactions, all locks must be acquired in a strict, deterministic global hierarchy:

| Step | Table | Row(s) Locked | Lock Mode | Syntax / Rationale |
|---|---|---|---|---|
| **Lock 1** | `"memberships"` (Caller) | 1 row (`user_id = ctx.userId AND organization_id = ctx.organizationId`) | Shared (`FOR SHARE OF m`) | Prevents caller deactivation or role alteration mid-flight. Outer join to `"designations"` cannot lock nullable side in PostgreSQL. |
| **Lock 1b** | `"designations"` (Caller) | 1 row (`id = caller.designation_id`), if caller is non-admin and has designation | Shared (`FOR SHARE`) | Prevents concurrent alteration of caller CRM eligibility catalog record mid-flight. |
| **Lock 2** | `"leads"` (Target) | 1 row (`id = leadId AND organization_id = ctx.organizationId`) | Exclusive (`FOR UPDATE`) | Prevents concurrent reassignment, stage transition, or conversion of the target lead. |
| **Lock 3** | `"memberships"` (Dest) | 1 row (`user_id = newAssigneeId AND organization_id = ctx.organizationId`) | Shared (`FOR SHARE OF m`) | Prevents destination assignee deactivation or team reassignment mid-flight. Re-entrant/shared if caller is self-claiming. |
| **Lock 3b** | `"designations"` (Dest) | 1 row (`id = destination.designation_id`) via inner join | Shared (`FOR SHARE OF d`) | Prevents destination designation demotion or CRM eligibility revocation mid-flight. |

*(Batch Rule: If multiple rows within the same table are locked across batch operations, they MUST be locked in primary key UUID ascending order `ORDER BY id ASC` to guarantee global deadlock freedom).*

> [!CRITICAL]
> **PostgreSQL Nullable Join Locking Rule:**  
> In PostgreSQL, executing `FOR SHARE` or `FOR UPDATE` on a query containing an outer join without an `OF` clause raises:  
> `ERROR: FOR SHARE cannot be applied to the nullable side of an outer join`  
> PostgreSQL strictly forbids row-locking tuples on the nullable side of an outer join because the referenced tuple may not exist (producing synthesized NULLs). Step 1 MUST specify `FOR SHARE OF m` to lock only the non-nullable `"memberships"` relation. To lock the caller's designation record against concurrent catalog modifications, a separate shared lock query on `"designations"` is executed when `m.designation_id` is non-null.

> [!NOTE]
> **Concurrency Invariant Limits & Global Lock Ordering Adherence:**  
> 1. **Lock Conflict Mechanics:** A shared lock (`FOR SHARE`) prevents concurrent transactions from mutating (`UPDATE`, `DELETE`, or acquiring `FOR UPDATE` / `FOR NO KEY UPDATE`) the locked rows until the holding transaction terminates. It does NOT block concurrent read queries (`SELECT` or other `FOR SHARE`). A row is NOT protected against concurrent modification unless the conflicting transaction is explicitly required to acquire a conflicting lock on that exact row (e.g. administrative deactivation of an employee MUST execute `UPDATE "memberships"` or `SELECT ... FOR UPDATE`).  
> 2. **Global Lock Hierarchy Scope:** Deadlock freedom is guaranteed **only if all transactions across the entire application adhere strictly to the identical global order**: `"memberships"` $\rightarrow$ `"designations"` $\rightarrow$ `"leads"`. Any administrative operation modifying employee status, team membership, or designations while touching leads MUST acquire locks in this identical sequence.  
> 3. **Prohibition of Lock Escalation:** Transactions must never attempt lock escalation (e.g. querying a tuple `FOR SHARE` and subsequently executing `UPDATE` or `FOR UPDATE` on that same tuple within the same transaction), which produces deterministic deadlocks under concurrent execution.  
> 4. **Read Committed Snapshot Re-evaluation:** Under PostgreSQL's default `Read Committed` isolation level, `SELECT ... FOR UPDATE` blocks on concurrent updates and re-evaluates the `WHERE` clause once the conflicting transaction commits. If the newly committed state violates the filter (e.g. lead assigned to someone else), the query returns **0 rows**. Defensive empty-result handling (`!rows || rows.length === 0`) is mandatory to fail closed safely.

#### Comprehensive Mutation-Time Invariant Enforcement:

##### Strategy A: Transactional Row Locking (Authoritative Pattern for Prisma Services):
```typescript
await prisma.$transaction(async (tx) => {
  // Step 1: Lock Caller Membership (FOR SHARE OF m)
  // PostgreSQL Rule: FOR SHARE cannot lock nullable side of outer join. Use FOR SHARE OF m.
  const callerRows = await tx.$queryRaw<Array<{
    id: string;
    status: string;
    role: string;
    is_team_lead: boolean;
    team: string | null;
    designation_id: string | null;
    is_crm_eligible: boolean;
  }>>`
    SELECT m.id, m.status, m.role, m.is_team_lead, m.team, m.designation_id,
           COALESCE(d.is_crm_eligible, FALSE) AS is_crm_eligible
    FROM "memberships" m
    LEFT JOIN "designations" d ON d.id = m.designation_id
    WHERE m.user_id = ${ctx.userId}::uuid 
      AND m.organization_id = ${ctx.organizationId}::uuid
    FOR SHARE OF m;
  `;
  // Safe Empty-Result Handling (Fails closed on missing or inactive caller)
  if (!callerRows || callerRows.length === 0 || callerRows[0].status !== 'ACTIVE') {
    throw new AuthorizationError("Caller membership is missing, revoked, or inactive in this tenant");
  }
  const caller = callerRows[0];

  // Step 1b: If caller is non-admin and has designation, lock designation row (FOR SHARE)
  if (caller.role !== Role.ADMIN && caller.designation_id) {
    const desigRows = await tx.$queryRaw<Array<{ id: string; is_crm_eligible: boolean }>>`
      SELECT id, is_crm_eligible 
      FROM "designations" 
      WHERE id = ${caller.designation_id}::uuid 
      FOR SHARE;
    `;
    if (!desigRows || desigRows.length === 0) {
      throw new AuthorizationError("Caller designation record missing or corrupted");
    }
    caller.is_crm_eligible = desigRows[0].is_crm_eligible;
  }

  // Step 2: Lock Target Lead Exclusively (FOR UPDATE)
  const leadRows = await tx.$queryRaw<Array<{
    id: string;
    organization_id: string;
    assigned_staff_id: string | null;
    active_conversion_operation_id: string | null;
    quarantine_conversion_operation_id: string | null;
    version: number;
  }>>`
    SELECT id, organization_id, assigned_staff_id, active_conversion_operation_id, quarantine_conversion_operation_id, version 
    FROM "leads" 
    WHERE id = ${leadId}::uuid AND organization_id = ${ctx.organizationId}::uuid 
    FOR UPDATE;
  `;
  // Safe Empty-Result Handling (Fails closed on missing or cross-tenant lead)
  if (!leadRows || leadRows.length === 0) {
    throw new NotFoundError("Lead not found or access denied across tenant");
  }
  const lead = leadRows[0];
  if (lead.active_conversion_operation_id !== null || lead.quarantine_conversion_operation_id !== null) {
    throw new ConcurrencyConflictError("Lead is currently locked by an active or quarantined conversion operation");
  }
  if (lead.assigned_staff_id !== expectedPreviousAssigneeId) {
    throw new ConcurrencyConflictError("Lead ownership changed mid-flight. Please refresh workbench.");
  }

  // Step 3: Lock and Validate Destination Assignee Membership & Designation (FOR SHARE OF m, d)
  // Inner join allows explicit locking of both relations without outer-join nullable side restrictions.
  const destRows = await tx.$queryRaw<Array<{
    id: string;
    status: string;
    team: string | null;
    is_crm_eligible: boolean;
  }>>`
    SELECT m.id, m.status, m.team, COALESCE(d.is_crm_eligible, FALSE) AS is_crm_eligible
    FROM "memberships" m
    JOIN "designations" d ON d.id = m.designation_id
    WHERE m.user_id = ${newAssigneeId}::uuid 
      AND m.organization_id = ${ctx.organizationId}::uuid
    FOR SHARE OF m, d;
  `;
  // Safe Empty-Result Handling (Fails closed on missing, cross-tenant, or inactive assignee)
  if (!destRows || destRows.length === 0 || destRows[0].status !== 'ACTIVE') {
    throw new ValidationError("Destination assignee does not hold an active membership in this tenant");
  }
  const destination = destRows[0];
  if (!destination.is_crm_eligible) {
    throw new ValidationError("Destination assignee designation is not eligible for CRM lead ownership");
  }

  // Step 4: Revalidate Scope Invariants Against Live Locked Records
  if (caller.role !== Role.ADMIN) {
    if (caller.is_team_lead) {
      if (destination.team !== caller.team) {
        throw new AuthorizationError("Team Leads may only assign leads to members of their own verified team");
      }
    } else if (caller.is_crm_eligible) {
      if (lead.assigned_staff_id === null && newAssigneeId !== ctx.userId) {
        throw new AuthorizationError("Sales representatives may only claim unassigned leads for themselves");
      }
      if (lead.assigned_staff_id !== null && lead.assigned_staff_id !== ctx.userId) {
        throw new AuthorizationError("Sales representatives cannot reassign leads owned by other representatives");
      }
    } else {
      throw new AuthorizationError("Caller lacks CRM assignment authority");
    }
  }

  // Step 5: Execute Mutation with Version Increment
  await tx.$executeRaw`
    UPDATE "leads"
    SET assigned_staff_id = ${newAssigneeId}::uuid,
        version = version + 1,
        updated_at = NOW()
    WHERE id = ${leadId}::uuid;
  `;

  // Step 6: Emit Immutable Audit Event
  await tx.auditEvent.create({
    data: {
      action: "crm.lead.assign",
      actorId: ctx.userId,
      organizationId: ctx.organizationId,
      entityType: "Lead",
      entityId: leadId,
      metadata: {
        previousOwnerId: expectedPreviousAssigneeId,
        newOwnerId: newAssigneeId,
        destinationTeam: destination.team
      }
    }
  });
});
```

##### Strategy B: Complete Atomic Composite Mutation SQL (Direct Raw Execution):
> [!IMPORTANT]
> **Strategy B Completeness Rule:**  
> A single conditional SQL statement is valid ONLY if it atomically validates the **caller's authority** in addition to the destination assignee's membership. Checking destination membership alone is insufficient. Both subqueries are required:
```sql
UPDATE "leads"
SET "assigned_staff_id" = $newAssigneeId,
    "version" = "version" + 1,
    "updated_at" = NOW()
WHERE "id" = $leadId
  AND "organization_id" = $ctxOrganizationId
  AND "assigned_staff_id" IS NOT DISTINCT FROM $expectedPreviousAssigneeId
  -- Invariant 1: Caller Membership remains ACTIVE and authorized at write instant
  AND EXISTS (
    SELECT 1 FROM "memberships" cm
    LEFT JOIN "designations" cd ON cd."id" = cm."designation_id"
    WHERE cm."user_id" = $ctxUserId
      AND cm."organization_id" = $ctxOrganizationId
      AND cm."status" = 'ACTIVE'
      AND (
        cm."role" = 'ADMIN'
        OR (cm."is_team_lead" = TRUE AND cm."team" = $expectedDestinationTeam)
        OR ($expectedPreviousAssigneeId IS NULL AND $newAssigneeId = $ctxUserId AND cd."is_crm_eligible" = TRUE)
        OR ($expectedPreviousAssigneeId = $ctxUserId AND cd."is_crm_eligible" = TRUE)
      )
  )
  -- Invariant 2: Destination Assignee remains ACTIVE, in destination team, and CRM-eligible
  AND EXISTS (
    SELECT 1 FROM "memberships" dm
    JOIN "designations" dd ON dd."id" = dm."designation_id"
    WHERE dm."user_id" = $newAssigneeId
      AND dm."organization_id" = $ctxOrganizationId
      AND dm."status" = 'ACTIVE'
      AND dm."team" = $expectedDestinationTeam
      AND dd."is_crm_eligible" = TRUE
  );
```
If any invariant (caller authority, prior assignee, destination team, membership status, or eligibility) is violated at mutation time, the query updates **0 rows**, aborts the transaction, and returns `409 Conflict: Assignment invariants violated concurrently`.

---

## 5. PostgreSQL Row-Level Security (RLS) Specification

All tables created in Phase 02 (`leads`, `lead_sources`, `lead_stage_histories`, `lead_activities`) must enforce strict PostgreSQL RLS policies.

### 5.1 RLS Invariant Rules:
1. `ALTER TABLE "public"."<table_name>" ENABLE ROW LEVEL SECURITY;`
2. `ALTER TABLE "public"."<table_name>" FORCE ROW LEVEL SECURITY;`
3. Table access must be evaluated strictly against `request.jwt.claim.sub` matching active staff membership.

### 5.2 Concrete Policy Blueprint (Leads Table):

```sql
-- 1. SELECT Policy (Staff Only, Tenant Scoped)
CREATE POLICY "leads_select_staff_isolation"
ON "public"."leads"
FOR SELECT
USING (
  public.is_org_member("organization_id")
  AND NOT public.is_candidate(NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid)
);

-- 2. INSERT Policy (Staff Manual or Server Ingest Service Role)
CREATE POLICY "leads_insert_staff_isolation"
ON "public"."leads"
FOR INSERT
WITH CHECK (
  public.is_org_member("organization_id")
  AND NOT public.is_candidate(NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid)
);

-- 3. UPDATE Policy (Staff Only, Tenant Scoped)
CREATE POLICY "leads_update_staff_isolation"
ON "public"."leads"
FOR UPDATE
USING (
  public.is_org_member("organization_id")
  AND NOT public.is_candidate(NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid)
)
WITH CHECK (
  public.is_org_member("organization_id")
  AND NOT public.is_candidate(NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid)
);

-- 4. DELETE Policy (Strictly Prohibited — Soft-Delete / Terminal States Only)
-- Zero DELETE policy. Hard deletion of leads is blocked at the database engine level.
```

### 5.3 Privileged Database Role Behavior & Public Intake Boundary Reassessment
> [!WARNING]
> **Database Privilege Reality & Honest Boundary Assessment:**
> 1. **Authenticated Operations (Staff):** All staff server actions execute within an authenticated user session and must use `withRlsContext`, setting `request.jwt.claim.sub` in PostgreSQL. Under `FORCE RLS`, database policies prevent cross-tenant access for connection roles subject to RLS.
> 2. **Unauthenticated Public Intake (`/api/leads/ingest`):** Public callers hold no user session or JWT. The Next.js API route connects to PostgreSQL via Prisma using the standard application connection pooler. In this architecture, connection poolers connect using superuser or database owner roles that hold the PostgreSQL `BYPASSRLS` attribute.
> 3. **Application-Layer Predicate Limitations:** An application-layer query predicate (`where: { organizationId: resolvedOrgId }`) is strictly an **application-level control, NOT an independent security boundary against a compromised application runtime or privileged database credential**. If the Next.js runtime is compromised, malicious code or SQL injection can issue queries that read or modify data across all organizations without PostgreSQL RLS intervention.
> 4. **Least-Privileged Feasible Repository Pattern:** To minimize this attack surface within the single-pooler constraint:
>    - All public intake database operations are strictly isolated inside a dedicated `CrmIntakeRepository`.
>    - `CrmIntakeRepository` exposes exclusively `ingestLead(resolvedOrgId, data)` which performs a single parameterized `INSERT INTO leads`. It exposes zero read, update, list, or delete methods.
>    - The repository strictly ignores any `organizationId` passed in the untrusted request payload and binds exclusively to the server-verified `token.organizationId`.
> 5. **Intake Token Binding & Revocation:**
>    - Public callers authenticate via `x-oos-intake-key`. The token is stored as a SHA-256 hash in `CrmIntakeToken`.
>    - Tokens are strictly bound to a single `organizationId`, support explicit expiration (`expiresAt`), and can be revoked instantly (`revokedAt = NOW()`).
>    - The token header is stripped from application logs and telemetry.
> 6. **Trusted Proxy & CORS Architecture:**
>    - Browser CORS (`allowedOrigins`) is strictly an advisory client-side browser control; it does NOT protect against server-to-server calls, curl, or automated bots.
>    - Recommended Deployment Architecture: Marketing websites should proxy form submissions through their own server backend rather than exposing `x-oos-intake-key` in public client-side JavaScript.
>    - Rate limiting strictly evaluates trusted socket connecting IPs or reverse-proxy verified headers (`CF-Connecting-IP`, `True-Client-IP`), preventing spoofed `X-Forwarded-For` cycling.
> 7. **Residual Risk:** Until platform infrastructure supports a dedicated, unprivileged PostgreSQL connection pooler role (`oos_public_ingest_role` with `NOBYPASSRLS` granted solely `INSERT ON leads`), tenant isolation on public intake depends entirely on application-layer repository isolation and code correctness.

---

## 6. Audit Trail Accountability & Catalog Additions

Every CRM mutation must record an immutable audit event in the existing [`AuditEvent`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1133) table via `logUserAuditEvent`.

### 6.1 New `AuditAction` Enum Values:
- `LEAD_CREATED`: Inbound lead captured or manually added by staff.
- `LEAD_UPDATED`: Contact details, compensation, or preferences modified.
- `LEAD_ASSIGNED`: Owner assigned or transferred between staff members.
- `LEAD_STAGE_CHANGED`: State machine advanced or regressed.
- `LEAD_QUALIFIED`: Admissions criteria verified; approved for proposal.
- `LEAD_CONVERTED`: Lead converted into Candidate and CBOS CustomerAccount.
- `LEAD_DISQUALIFIED`: Closed as disqualified with structured reason category.
- `LEAD_LOST`: Closed as lost with structured reason category.
- `LEAD_REOPENED`: Disqualified or lost lead reactivated by authorized staff.
- `LEAD_ACTIVITY_LOGGED`: Discovery call, email, or meeting note appended.

### 6.2 Sensitive Data Redaction Rule:
In compliance with the audit standards established in Phase 00, audit event `details` must **never** record unhashed credit card numbers, passwords, personal tax IDs, or full banking coordinates. Audit details record metadata references (`leadId`, `actorId`, `fromStatus`, `toStatus`, `disqualificationReason`) rather than unredacted PII.
