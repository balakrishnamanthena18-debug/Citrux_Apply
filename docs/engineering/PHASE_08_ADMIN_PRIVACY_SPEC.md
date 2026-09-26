# Phase 8 Engineering Specification — Admin, Audit & Privacy Core

**Document Version:** `1.1.0`  
**Status:** `ACCEPTED — FROZEN`  
**Implementation Status:** `IMPLEMENTED — VERIFIED — ACCEPTED`  
**Authority:** Product Vision (§§22, 23), V1 PRD (§§17, 45, 46, 47, 48, 49), Approved Phase 1 Specification (v1.0.0), Approved Phase 2 Specification (v1.2.0), Approved Phase 3 Specification (v1.1.0), Approved Phase 4 Specification (v1.1.0), Approved Phase 5 Specification (v1.2.2), Approved Phase 6 Specification (v1.3.0), Approved Phase 7 Specification (v1.1.0), Approved ADRs (ADR-001 through ADR-005).

---

## Document Revision History

| Version | Date | Status | Description |
| :--- | :--- | :--- | :--- |
| `1.0.0` | 2026-09-25 | Draft | Initial engineering specification for Phase 8: Admin Operational Console, Authoritative Audit Trail, and Privacy Request Governance. |
| `1.1.0` | 2026-09-25 | Accepted / Frozen | Required corrections per human review incorporated, implemented, verified, regression-tested against Phases 1–7, reviewed, accepted, and frozen by Human Acceptance Gate. |

---

## 1. Purpose

Phase 8 defines the **Admin, Audit & Privacy Core** for the Operations Operating System (OOS).

The primary objective of Phase 8 is to provide authoritative operational governance, immutable tenant-level auditability, administrative staff and access control, and admin-assisted privacy request workflows (`DATA_EXPORT`, `DATA_CORRECTION`, `DATA_DELETION`) strictly within the boundary of the V1 Product Requirements Document.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 8 GOVERNANCE & PRIVACY TOPOLOGY                           │
├───────────────────────────────┬───────────────────────────────┬────────────────────────┤
│ 1. Admin Operational Console  │ 2. Authoritative Audit Trail  │ 3. Privacy Governance  │
│    (ADMIN Role Only)          │    (Append-Only & Immutable)  │    (Admin-Assisted)    │
│    • Staff Management         │    • Server-Derived Actor     │    • Request Intake    │
│    • Access & Activation      │    • Tenant-Scoped RLS        │    • Identity Check    │
│    • Operational Oversight    │    • Entity-Linked Event Log  │    • Scope Review      │
│    • Manual Work Reassignment │    • Filtered Investigation   │    • Export / Redaction│
└───────────────────────────────┴───────────────────────────────┴────────────────────────┘
```

---

## 2. Scope

### In-Scope (V1 PRD & Product Vision)
1. **Administrative Staff & Access Management** (V1 PRD §§17, 45):
   - Organization staff account provisioning and role assignment (`EMPLOYEE` vs `ADMIN`).
   - Explicit employee activation and deactivation lifecycle.
   - Immediate session and permission revocation upon employee deactivation.
   - Administrative manual reassignment of unassigned or orphaned applications, tasks, and candidates.
2. **Authoritative, Immutable Audit Trail** (V1 PRD §47):
   - First-class administrative inspection of system-wide audit records.
   - Multi-dimensional query filters (organization, actor, entity type, entity ID, action type, date range).
   - Strict tenant isolation and candidate-blind RLS boundary on raw administrative audit records.
3. **Admin Operational Oversight** (V1 PRD §46):
   - Global visibility across candidate onboarding, job applications, operational tasks, and escalations within the tenant.
   - Dedicated administrative workspaces for systemic bottleneck inspection.
4. **Privacy Request Governance (Admin-Assisted)** (V1 PRD §§48, 49):
   - Candidate submission of formal privacy requests (`DATA_EXPORT`, `DATA_CORRECTION`, `DATA_DELETION`).
   - Explicit identity verification step by staff/admin prior to processing.
   - Admin-assisted data export packaging (structured machine-readable format).
   - Admin-assisted candidate profile correction.
   - Admin-assisted candidate data deletion/anonymization with strict preservation of legally required records (historical applications, submission evidence, consent records, and audit logs).

### Explicit Exclusions (Out of Scope for V1)
- No new roles (`SUPER_ADMIN`, `MANAGER`, `TEAM_LEAD`, `QA_ROLE`, `BILLING_ROLE`, `SUPPORT_ROLE`, etc.).
- No automated workforce scheduling, skills-based routing, or AI auto-assignment engines.
- No SLA automation engines or workflow builders.
- No automated background batch deletion workers, Redis, Kafka, or microservices.
- No self-service instant deletion/hard-drop scripts that bypass admin verification.
- No billing, subscription, or payment administration.
- No external compliance reporting integrations or automated DPIA tooling.

---

## 3. Relationship to V1 PRD

| PRD Section | Requirement | Phase 8 Engineering Realization |
| :--- | :--- | :--- |
| **V1 PRD §17** | Organization Membership Governance | Direct admin management of organization staff records, role assignments, and active membership statuses. |
| **V1 PRD §45** | Administrative User Management | Admin actions to manage organization memberships, modify staff roles (`EMPLOYEE` ↔ `ADMIN`), activate/deactivate employees, and revoke access instantly. |
| **V1 PRD §46** | Operational Work Reassignment | Admin oversight of unassigned and orphaned tasks/applications with strictly manual reassignment workflows. |
| **V1 PRD §47** | Authoritative Audit Visibility | Dedicated `/admin/audit` workbench with server-side pagination, strict tenant RLS, actor resolution, and multi-filter event queries. |
| **V1 PRD §48** | Candidate Privacy Workflows | `PrivacyRequest` state machine supporting `DATA_EXPORT`, `DATA_CORRECTION`, and `DATA_DELETION` with mandatory human identity verification. |
| **V1 PRD §49** | Required Record Preservation | Admin-assisted privacy resolution ensuring required historical application records, submission evidence, QA sign-offs, consent history, and audit logs are preserved intact. |

---

## 4. Existing Architecture Dependencies

Phase 8 builds upon and strictly preserves the frozen architectural contracts from Phases 1 through 7:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Identity, RBAC & Membership (MembershipStatus, Role: CANDIDATE|EMPLOYEE|ADMIN) │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Candidate Core (Profile, Documents, Experiences, Skills, Verification)       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Application Core (Application, Materials, StateHistory)                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Task & Preparation Core (Task, ChecklistItem, EscalationHistory)             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 5: QA & Candidate Approval Core (ApplicationQaReview, ApplicationQaChecklist)   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 6: Submission & Evidence Core (ApplicationSubmission, Storage Evidence)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 7: Communication & Notifications Core (Conversation, InternalNote, Notification) │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 8: Admin Operational Console, Authoritative Audit Trail & Privacy Governance    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Entity Inventory

### Existing Entities Leveraged
- `User`: Base identity record.
- `Membership`: Organization tenancy, role (`ADMIN`, `EMPLOYEE`, `CANDIDATE`), status (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
- `AuditLog`: Authoritative audit record table in PostgreSQL.
- `Candidate`: Canonical candidate profile record.
- `Application`, `Task`, `ApplicationSubmission`: Linked operational entities.

### New Entities Introduced in Phase 8
1. **`PrivacyRequest` (`privacy_requests`)**:
   - Authoritative record tracking the lifecycle of candidate-initiated privacy requests.
   - Contains request type, status, identity verification tracking, resolution details, and executor user IDs.

---

## 6. Database Model

### 6.1 PostgreSQL Enums

```prisma
enum PrivacyRequestType {
  DATA_EXPORT
  DATA_CORRECTION
  DATA_DELETION
}

enum PrivacyRequestStatus {
  PENDING
  IDENTITY_VERIFIED
  IN_REVIEW
  COMPLETED
  REJECTED
}
```

### 6.2 Extended AuditAction Enum

```prisma
enum AuditAction {
  // Existing Phase 1-7 actions ...
  
  // Phase 8 Admin Actions
  EMPLOYEE_CREATED
  EMPLOYEE_ACTIVATED
  EMPLOYEE_DEACTIVATED
  EMPLOYEE_ROLE_UPDATED
  OPERATIONAL_WORK_REASSIGNED
  
  // Phase 8 Privacy Actions
  PRIVACY_REQUEST_CREATED
  PRIVACY_REQUEST_VERIFIED
  PRIVACY_REQUEST_COMPLETED
  PRIVACY_REQUEST_REJECTED
  CANDIDATE_DATA_EXPORTED
  CANDIDATE_DATA_CORRECTED
  CANDIDATE_DATA_DELETED
}
```

### 6.3 Prisma Schema Definitions

```prisma
model PrivacyRequest {
  id              String               @id @default(uuid()) @db.Uuid
  organizationId  String               @map("organization_id") @db.Uuid
  candidateId     String               @map("candidate_id") @db.Uuid
  requestType     PrivacyRequestType   @map("request_type")
  status          PrivacyRequestStatus @default(PENDING)
  
  requestedById   String               @map("requested_by_id") @db.Uuid
  verifiedById    String?              @map("verified_by_id") @db.Uuid
  completedById   String?              @map("completed_by_id") @db.Uuid
  
  requestedAt     DateTime             @default(now()) @map("requested_at")
  verifiedAt      DateTime?            @map("verified_at")
  completedAt     DateTime?            @map("completed_at")
  
  scopeDetails    String?              @map("scope_details") @db.Text
  resolutionNotes String?              @map("resolution_notes") @db.Text
  
  createdAt       DateTime             @default(now()) @map("created_at")
  updatedAt       DateTime             @updatedAt @map("updated_at")

  organization    Organization         @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  candidate       Candidate            @relation(fields: [candidateId], references: [id], onDelete: Restrict)
  requestedBy     User                 @relation("PrivacyRequestedBy", fields: [requestedById], references: [id], onDelete: Restrict)
  verifiedBy      User?                @relation("PrivacyVerifiedBy", fields: [verifiedById], references: [id], onDelete: Restrict)
  completedBy     User?                @relation("PrivacyCompletedBy", fields: [completedById], references: [id], onDelete: Restrict)

  @@index([organizationId, status])
  @@index([organizationId, candidateId])
  @@index([organizationId, createdAt])
  @@map("privacy_requests")
}
```

---

## 7. State Machines

### 7.1 Privacy Request Lifecycle State Machine

```text
 ┌─────────┐
 │ PENDING │ ◄── Candidate creates privacy request (DATA_EXPORT, DATA_CORRECTION, DATA_DELETION)
 └────┬────┘
      │
      ├────────────────────────────┐
      ▼ (Staff verifies identity)  ▼ (Failed verification / Ineligible)
┌───────────────────┐        ┌──────────┐
│ IDENTITY_VERIFIED │        │ REJECTED │
└─────────┬─────────┘        └──────────┘
          │
          ▼ (Admin starts processing)
    ┌───────────┐
    │ IN_REVIEW │
    └─────┬─────┘
          │
          ▼ (Admin completes export / correction / deletion resolution)
    ┌───────────┐
    │ COMPLETED │
    └───────────┘
```

#### Valid Privacy Request Transitions:
- `PENDING` → `IDENTITY_VERIFIED` (Initiated by Staff/Admin after confirming candidate identity)
- `PENDING` → `REJECTED` (Initiated by Admin with mandatory rejection reason)
- `IDENTITY_VERIFIED` → `IN_REVIEW` (Initiated by Admin starting payload generation, correction, or deletion triage)
- `IDENTITY_VERIFIED` → `REJECTED` (Initiated by Admin with rejection reason)
- `IN_REVIEW` → `COMPLETED` (Initiated by Admin upon final delivery/redaction with resolution notes)
- `IN_REVIEW` → `REJECTED` (Initiated by Admin if request cannot be lawfully completed)

---

## 8. Authorization & RBAC Model

| Action / Operation | CANDIDATE | EMPLOYEE | ADMIN | Enforcement Mechanism |
| :--- | :---: | :---: | :---: | :--- |
| **View Admin Console** | ❌ Blocked | ❌ Blocked | ✅ Allowed | Server RBAC (`requireAdmin`) |
| **Manage Staff Members (Provision)** | ❌ Blocked | ❌ Blocked | ✅ Allowed | Server RBAC (`requireAdmin`) |
| **Activate / Deactivate Employee** | ❌ Blocked | ❌ Blocked | ✅ Allowed | Server RBAC (`requireAdmin`) |
| **Update Staff Role (EMPLOYEE ↔ ADMIN)** | ❌ Blocked | ❌ Blocked | ✅ Allowed | Server RBAC (`requireAdmin`) |
| **Manual Work Reassignment** | ❌ Blocked | ❌ Blocked | ✅ Allowed | Server RBAC (`requireAdmin`) |
| **View Administrative Audit Trail** | ❌ Blocked | ❌ Blocked | ✅ Allowed | Server RBAC (`requireAdmin`) + RLS |
| **Submit Privacy Request** | ✅ Own Only | ❌ Blocked | ❌ Blocked | Server RBAC + Candidate ID Check |
| **Verify Privacy Request Identity** | ❌ Blocked | ✅ Allowed | ✅ Allowed | Server RBAC (`requireEmployeeOrAdmin`) |
| **Execute Privacy Action (Export/Delete)**| ❌ Blocked | ❌ Blocked | ✅ Allowed | Server RBAC (`requireAdmin`) |
| **View Privacy Requests** | ✅ Own Only | ✅ Org Wide | ✅ Org Wide | PostgreSQL RLS + Server Action |

---

## 9. PostgreSQL Row-Level Security (RLS) Model

All tables in Phase 8 enforce PostgreSQL `FORCE ROW LEVEL SECURITY`. Runtime executes strictly as `oos_app_runtime`.

### 9.1 Privacy Requests RLS Policies

```sql
ALTER TABLE "privacy_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "privacy_requests" FORCE ROW LEVEL SECURITY;

-- 1. Staff and Admin Select (Organization-wide)
CREATE POLICY "privacy_requests_staff_select" ON "privacy_requests"
  FOR SELECT
  USING (
    public.is_org_privileged_member(organization_id, public.current_user_id())
  );

-- 2. Candidate Select (Own records only)
CREATE POLICY "privacy_requests_candidate_select" ON "privacy_requests"
  FOR SELECT
  USING (
    candidate_id IN (
      SELECT c.id FROM "candidates" c
      WHERE c."userId" = public.current_user_id()
        AND c."organizationId" = organization_id
    )
  );

-- 3. Candidate Insert (Own request only)
CREATE POLICY "privacy_requests_candidate_insert" ON "privacy_requests"
  FOR INSERT
  WITH CHECK (
    requested_by_id = public.current_user_id()
    AND candidate_id IN (
      SELECT c.id FROM "candidates" c
      WHERE c."userId" = public.current_user_id()
        AND c."organizationId" = organization_id
    )
  );

-- 4. Staff/Admin Update (State progression)
CREATE POLICY "privacy_requests_staff_update" ON "privacy_requests"
  FOR UPDATE
  USING (
    public.is_org_privileged_member(organization_id, public.current_user_id())
  );
```

---

## 10. Admin Workflows

### 10.1 Staff Provisioning & Role Management (V1 PRD §§17, 45)
1. **Admin Provisions Staff Member**: Admin inputs name, email, and target role (`EMPLOYEE` or `ADMIN`).
2. **Server Action Execution**: Validates email uniqueness within organization, creates User/Membership in `ACTIVE` state, records `EMPLOYEE_CREATED` audit event.
3. **Role Modification**: Admin can modify staff role (`EMPLOYEE` ↔ `ADMIN`).

> [!NOTE]
> **PROPOSED HUMAN DECISION — NOT YET APPROVED**:
> *Rule*: Preventing an organization from demoting or deactivating its last active Admin.  
> *Status*: Marked for explicit human review. Not frozen as an authoritative requirement until explicitly approved.

### 10.2 Strictly Manual Work Reassignment (V1 PRD §46)
1. **Manual Queue Oversight**: Admin inspects applications, tasks, or candidates assigned to deactivated staff or unassigned queues.
2. **Explicit Manual Reassignment**: Admin manually selects a specific active employee. System updates assigned foreign keys atomically and logs `OPERATIONAL_WORK_REASSIGNED`.
3. **Explicit Boundary**: Zero automated routing, zero background auto-assignment, zero workload balancing algorithms, zero skills-based auto-routing. Reassignment is 100% manual and initiated by Admin.

---

## 11. Employee Lifecycle & Deactivation

When an Admin deactivates an employee (`MembershipStatus` → `INACTIVE`):

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              EMPLOYEE DEACTIVATION FLOW                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Admin triggers deactivation action with employeeId.                                 │
│ 2. Membership status updated to INACTIVE in PostgreSQL.                                │
│ 3. Active auth tokens invalidated; immediate rejection on getAuthenticatedContext().  │
│ 4. Assigned open tasks and applications preserved for explicit Admin reassignment.     │
│ 5. Completed historical submissions, QA approvals, and notes REMAIN attributed.       │
│ 6. Audit event EMPLOYEE_DEACTIVATED written immutably.                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Key Invariant**: Deactivation NEVER deletes historical database records, notes, or submission records. Completed work remains attributed to the deactivated user ID for compliance and forensic integrity.

---

## 12. Authoritative Audit Model

### 12.1 Audit Record Contract
Every privileged and state-altering operation across Phases 1–8 generates an authoritative `AuditLog` row:
- `id`: UUID primary key.
- `organizationId`: Tenant boundary.
- `userId`: Server-derived authenticated actor.
- `action`: Authoritative `AuditAction` enum.
- `entityType`: Domain entity name (e.g., `Candidate`, `Application`, `Task`, `PrivacyRequest`).
- `entityId`: Primary key of affected entity.
- `details`: Structured JSON payload capturing before/after metadata and transition reasons.
- `createdAt`: Authoritative PostgreSQL server timestamp.

### 12.2 Immutability Guarantee
- No `UPDATE` or `DELETE` SQL grants are ever given on `audit_logs` to `oos_app_runtime`.
- Application layer treats audit records as strictly append-only.

---

## 13. Privacy Request Model

### 13.1 Privacy Request Types
1. `DATA_EXPORT`: Structured extraction of candidate-owned profile and application history.
2. `DATA_CORRECTION`: Rectification of inaccurate biographical or profile facts.
3. `DATA_DELETION`: Admin-assisted data deletion/minimization workflow in accordance with legal and operational requirements.

### 13.2 Human Identity Verification
- Candidate creates request via Candidate Portal (status defaults to `PENDING`).
- Staff/Admin must explicitly verify the requester's identity before advancing the request to `IDENTITY_VERIFIED`.

---

## 14. Data Export Workflow (`DATA_EXPORT`)

1. **Verification**: Request verified by staff (`IDENTITY_VERIFIED`).
2. **Extraction Assembly (Admin-Assisted)**:
   Admin compiles machine-readable summary:
   - Biographical profile facts.
   - Structured sub-entities (experiences, educations, skills, projects, certifications).
   - Document metadata and candidate document references.
   - Submitted applications, state history, and candidate approval records.
   - Candidate-visible messages in conversation threads.
3. **Completion & Audit**:
   - Request marked `COMPLETED`.
   - Audit event `CANDIDATE_DATA_EXPORTED` logged.

---

## 15. Data Correction Workflow (`DATA_CORRECTION`)

1. **Verification**: Request verified by staff (`IDENTITY_VERIFIED`).
2. **Review & Scope**: Admin reviews requested corrections against canonical verification notes.
3. **Execution**: Profile inaccuracies updated.
4. **Completion & Audit**:
   - Request marked `COMPLETED` with `resolutionNotes`.
   - Audit event `CANDIDATE_DATA_CORRECTED` logged.

---

## 16. Data Deletion Workflow (`DATA_DELETION`)

### 16.1 Authoritative V1 Deletion Principles
- **Admin-Assisted**: Privacy deletion is an admin-assisted workflow, not an unverified automated script or self-service hard delete.
- **Data Minimization & Redaction**: Data should be minimized or redacted where appropriate.
- **Audit History Integrity**: Audit history must NEVER be rewritten, modified, or deleted.
- **Zero Inferred Retention Policies**: Specific retention periods, document blob retention/purge rules, and field-level deletion handling are retention-policy decisions requiring formal legal/human approval before production pilot. Phase 8 defines the governance workflow and authorization boundary, without inventing arbitrary blanket deletion rules.

> [!IMPORTANT]
> **PROPOSED RETENTION POLICY / DOCUMENT BLOB HANDLING — NOT YET APPROVED**:
> Exact retention periods and whether candidate document storage blobs are purged or retained for legal defence are explicitly flagged for future human/legal sign-off.

---

## 17. Required-Record Preservation Contract

To satisfy compliance, legal obligations, and operational integrity, **Data Deletion does NOT execute a database `CASCADE DELETE`**.

The following records must be preserved:
1. **Historical Application Records**: Applications, status histories, and job associations.
2. **Application State History**: Historical transition records, reasons, and timestamps.
3. **Submission Records & Evidence**: Application submissions, attempt numbers, external confirmation references, and submitted evidence.
4. **QA & Approval History**: QA review outcomes, checklist items, and candidate explicit sign-offs.
5. **Consent History**: Candidate explicit application consents.
6. **Immutable Audit Records**: All historical `AuditLog` rows.

Phase 3, 5, and 6 immutability contracts remain strictly intact.

---

## 18. Server Actions & API Contracts

### 18.1 Admin Management Actions

```typescript
// 1. Employee Provisioning (V1 PRD §§17, 45)
export async function createEmployeeAction(input: CreateEmployeeInput): Promise<ActionResult<{ membershipId: string }>>;

// 2. Employee Activation / Deactivation (V1 PRD §45)
export async function setEmployeeStatusAction(input: SetEmployeeStatusInput): Promise<ActionResult<{ status: MembershipStatus }>>;

// 3. Employee Role Modification (V1 PRD §45)
export async function updateEmployeeRoleAction(input: UpdateEmployeeRoleInput): Promise<ActionResult<{ role: Role }>>;

// 4. Operational Work Reassignment (V1 PRD §46 — Manual Only)
export async function reassignOperationalWorkAction(input: ReassignWorkInput): Promise<ActionResult<{ reassignedCount: number }>>;

// 5. Query Authoritative Audit Trail (V1 PRD §47)
export async function listAuditLogsAction(input: ListAuditLogsInput): Promise<ActionResult<{ logs: AuditLogItem[]; totalCount: number }>>;
```

### 18.2 Privacy Governance Actions

```typescript
// 6. Candidate Creates Privacy Request (V1 PRD §48)
export async function createPrivacyRequestAction(input: CreatePrivacyRequestInput): Promise<ActionResult<{ requestId: string }>>;

// 7. Staff Verifies Candidate Identity (V1 PRD §48)
export async function verifyPrivacyRequestAction(input: VerifyPrivacyRequestInput): Promise<ActionResult<{ status: PrivacyRequestStatus }>>;

// 8. Admin Completes Privacy Request (V1 PRD §§48, 49)
export async function completePrivacyRequestAction(input: CompletePrivacyRequestInput): Promise<ActionResult<{ status: PrivacyRequestStatus }>>;

// 9. Admin Rejects Privacy Request (V1 PRD §48)
export async function rejectPrivacyRequestAction(input: RejectPrivacyRequestInput): Promise<ActionResult<{ status: PrivacyRequestStatus }>>;

// 10. List Privacy Requests (V1 PRD §48)
export async function listPrivacyRequestsAction(input?: ListPrivacyRequestsInput): Promise<ActionResult<{ requests: PrivacyRequestItem[] }>>;
```

---

## 19. Validation Schemas (Zod)

```typescript
import { z } from "zod";

export const CreateEmployeeSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
});

export const SetEmployeeStatusSchema = z.object({
  employeeUserId: z.string().uuid("Invalid employee ID"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const UpdateEmployeeRoleSchema = z.object({
  employeeUserId: z.string().uuid("Invalid employee ID"),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
});

export const ReassignWorkSchema = z.object({
  targetEmployeeId: z.string().uuid("Invalid target employee ID"),
  applicationIds: z.array(z.string().uuid()).optional(),
  taskIds: z.array(z.string().uuid()).optional(),
  candidateIds: z.array(z.string().uuid()).optional(),
});

export const ListAuditLogsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  actorUserId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const CreatePrivacyRequestSchema = z.object({
  requestType: z.enum(["DATA_EXPORT", "DATA_CORRECTION", "DATA_DELETION"]),
  scopeDetails: z.string().trim().max(2000).optional(),
});

export const VerifyPrivacyRequestSchema = z.object({
  requestId: z.string().uuid("Invalid request ID"),
  verificationNotes: z.string().trim().min(5, "Verification notes required").max(1000),
});

export const CompletePrivacyRequestSchema = z.object({
  requestId: z.string().uuid("Invalid request ID"),
  resolutionNotes: z.string().trim().min(5, "Resolution notes required").max(2000),
});

export const RejectPrivacyRequestSchema = z.object({
  requestId: z.string().uuid("Invalid request ID"),
  rejectionReason: z.string().trim().min(5, "Rejection reason required").max(1000),
});
```

---

## 20. Error Taxonomy

| Error Code | HTTP Status | Description | Action / Resolution |
| :--- | :---: | :--- | :--- |
| `ERR_ADMIN_REQUIRED` | `403` | Operation requires ADMIN role | Reject caller without privilege |
| `ERR_PRIVACY_NOT_VERIFIED` | `400` | Attempt to complete unverified privacy request | Enforce identity verification step |
| `ERR_INVALID_TRANSITION` | `400` | Illegal state change on privacy request | Enforce privacy lifecycle rules |
| `ERR_CANNOT_ANONYMIZE_ACTIVE_WORK` | `400` | Deletion requested while active submissions exist | Resolve active workflows first |

---

## 21. Idempotency & Concurrency

- Status updates on employees and privacy requests execute within PostgreSQL transactions via `withRlsContext`.
- State transitions enforce atomic optimistic locking checks (`status: PENDING` before transitioning to `IDENTITY_VERIFIED`).
- Deletion/anonymization actions execute within an atomic PostgreSQL transaction.

---

## 22. Security Architecture

1. **Runtime Isolation**:
   - `oos_app_runtime` is used exclusively (non-superuser).
   - RLS strictly enforced on `privacy_requests` and `audit_logs`.
2. **Server-Side Actor Binding**:
   - Actor identity is derived strictly from `getAuthenticatedContext()`.
   - Client cannot supply or spoof `organizationId`, `userId`, or privileged roles.
3. **Audit Immutability**:
   - Audit logs cannot be modified, updated, or deleted through application interfaces or server actions.

---

## 23. Performance & Pagination

- Administrative audit queries require tenant indexing (`[organizationId, createdAt]`, `[organizationId, entityType, entityId]`).
- All list endpoints enforce server-side pagination (max limit 100).
- Data export generation streams/assembles structured data without unbounded memory buffering.

---

## 24. Admin & Privacy UI Requirements

### 24.1 Navigation & Layout
- `/admin`: Overview console with operational statistics and quick action links.
- `/admin/members`: Staff roster, creation modal, role toggle, and activation/deactivation controls.
- `/admin/audit`: Searchable, filterable audit log table with metadata drawer.
- `/admin/privacy`: Privacy request governance queue (pending verification, in-review, completed).
- `/candidate/privacy`: Candidate portal section for submitting and tracking privacy requests.

---

## 25. Audit Requirements

1. **Append-Only Logging**: All privileged administrative actions (`EMPLOYEE_CREATED`, `EMPLOYEE_ACTIVATED`, `EMPLOYEE_DEACTIVATED`, `EMPLOYEE_ROLE_UPDATED`, `OPERATIONAL_WORK_REASSIGNED`) and privacy actions (`PRIVACY_REQUEST_CREATED`, `PRIVACY_REQUEST_VERIFIED`, `PRIVACY_REQUEST_COMPLETED`, `PRIVACY_REQUEST_REJECTED`, `CANDIDATE_DATA_EXPORTED`, `CANDIDATE_DATA_CORRECTED`, `CANDIDATE_DATA_DELETED`) must be written immutably to `audit_logs`.
2. **Access Barrier**: Raw administrative audit logs must remain permanently inaccessible to the `CANDIDATE` role.

---

## 26. Privacy Requirements

1. **Mandatory Human Identity Verification**: Privacy requests must be verified by staff before execution.
2. **Required Record Preservation**: Deletion workflows must preserve application history, submission records, QA reviews, consent history, and audit records.
3. **Tenant Isolation**: Candidate privacy requests are strictly scoped to the requesting candidate and their organization.

---

## 27. Testing Strategy

### 27.1 Mandatory Unit Tests
- Validation schemas (`CreateEmployeeSchema`, `SetEmployeeStatusSchema`, `CreatePrivacyRequestSchema`, `CompletePrivacyRequestSchema`).
- Privacy request state machine transition validator.

### 27.2 Mandatory Integration Tests
1. **Admin Authorization & Role Guards**:
   - Verify `EMPLOYEE` and `CANDIDATE` roles are blocked from `/admin` actions.
2. **Employee Lifecycle**:
   - Admin creates employee → activation → deactivation → token invalidation verified.
3. **Manual Work Reassignment**:
   - Applications/tasks reassigned manually with audit logging.
4. **Audit Trail Verification**:
   - Verify audit log immutability and multi-filter queries.
5. **Privacy Workflow End-to-End**:
   - Candidate request → Staff identity verification → Admin execution (`DATA_EXPORT`, `DATA_CORRECTION`, `DATA_DELETION`).
   - Verify candidate PII minimized while historical application records and audit logs are preserved intact.

---

## 28. Regression Requirements

Implementation of Phase 8 must preserve all existing Phase 1–7 behaviors with zero regressions:
- **Phase 1**: Identity, RBAC, organization tenancy, and `MembershipStatus`.
- **Phase 2**: Candidate profile, document management, and verification.
- **Phase 3**: Application state machine, materials, and consent.
- **Phase 4**: Task checklists and escalation lifecycle.
- **Phase 5**: QA reviews, criteria checklists, and candidate approval gates.
- **Phase 6**: Immutable submission attempts and external evidence storage.
- **Phase 7**: Text-only candidate messaging, confidential internal notes, and transactional Gmail SMTP service.

---

## 29. Explicit Exclusions

The following features remain explicitly excluded from Phase 8:
- No new roles (`SUPER_ADMIN`, `MANAGER`, `TEAM_LEAD`, etc.).
- No automated assignment or workload balancing.
- No SLA engines or workflow automation builders.
- No background workers, Redis, Kafka, or microservices.
- No self-service instant deletion/hard-drop scripts.
- No billing, subscriptions, or payment features.

---

## 30. Acceptance Criteria

1. **Admin Console**: Admins can manage staff members, toggle roles, and deactivate accounts with instant access revocation.
2. **Manual Work Reassignment**: Admins can explicitly reassign unassigned/orphaned work to active staff members.
3. **Audit Visibility**: Complete, paginated, filterable audit history available to Admins only.
4. **Privacy Workflows**: Candidate can submit `DATA_EXPORT`, `DATA_CORRECTION`, and `DATA_DELETION` requests; Staff can verify identity; Admin can complete requests with full required-record preservation.
5. **Regression Quality**: All Phase 1–7 regression tests continue to pass with 100% success rate.
6. **Build Quality**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass cleanly.

---

## 31. Implementation Authorization Gate

> [!IMPORTANT]
> **Implementation Status: NOT AUTHORIZED**  
> This specification is submitted for human review. No code, schema migrations, or UI changes shall be made until explicit authorization is granted.
