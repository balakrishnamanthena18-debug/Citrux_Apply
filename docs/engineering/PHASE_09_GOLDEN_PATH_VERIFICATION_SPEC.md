# Phase 9 Engineering Specification — Golden-Path Verification

**Document Version:** `1.0.0`  
**Status:** `APPROVED — IN IMPLEMENTATION`  
**Implementation Status:** `IMPLEMENTATION AUTHORIZED`  
**Authority:** Product Vision (§§1–25), V1 PRD (§§1–50), Approved Phase 1 Specification (v1.0.0), Approved Phase 2 Specification (v1.2.0), Approved Phase 3 Specification (v1.1.0), Approved Phase 4 Specification (v1.1.0), Approved Phase 5 Specification (v1.2.2), Approved Phase 6 Specification (v1.3.0), Approved Phase 7 Specification (v1.1.0), Approved Phase 8 Specification (v1.1.0), Approved ADRs (ADR-001 through ADR-005).

---

## Document Revision History

| Version | Date | Status | Description |
| :--- | :--- | :--- | :--- |
| `1.0.0` | 2026-09-25 | Approved | Formal human approval granted for implementation. Phase 9 Golden-Path Verification suite implementation authorized. |

---

## 1. Purpose & Objectives

Phase 9 is the **Golden-Path Verification** phase for the Operations Operating System (OOS).

Phase 9 does **NOT** introduce new product features, new roles, schema models, or infrastructure components. Its sole purpose is to rigorously verify that the independently implemented, tested, and frozen capabilities from Phases 1 through 8 operate seamlessly, securely, and authoritatively as one unified, production-grade system.

The verification must prove:
1. **Deterministic End-to-End Business Flow**: Seamless execution from candidate onboarding, application qualification, task preparation, QA review, candidate approval, manual submission with evidence, and candidate communications.
2. **Authoritative State Machines & Invariants**: Uncompromising adherence to all frozen lifecycle transitions without illegal bypasses or shortcuts.
3. **Multi-Tenant Isolation**: Complete physical and logical isolation between organizations across all database entities and server actions.
4. **Strict Role-Based Access Control (RBAC)**: Enforced boundaries for `CANDIDATE`, `EMPLOYEE`, and `ADMIN` roles with server-derived actor identity.
5. **Consent & Regulatory Enforcement**: Immediate cascading withdrawal upon consent revocation, coupled with immutable preservation of historical submitted records.
6. **Immutable Audit Integrity**: Single authoritative append-only audit trail (`public.audit_events`) with strict candidate-blindness.
7. **Admin-Assisted Privacy Governance**: Legally sound identity verification, export assembly, and data minimization preserving required operational records.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                OOS GOLDEN PATH VERIFICATION TOPOLOGY                             │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│   Phase 1: Identity & RBAC ──────────► Phase 2: Candidate Profile & Consent                      │
│                │                                          │                                      │
│                ▼                                          ▼                                      │
│   Phase 8: Admin & Staff Roster ─────► Phase 3: Job & Application Core                           │
│                │                                          │                                      │
│                ▼                                          ▼                                      │
│   Phase 8: Audit & Privacy ──────────► Phase 4: Task & Preparation Core                          │
│                │                                          │                                      │
│                ▼                                          ▼                                      │
│   Phase 7: Communication & Realtime ─► Phase 5: QA Review & Candidate Approval                   │
│                                                           │                                      │
│                                                           ▼                                      │
│                                        Phase 6: Manual Submission & Immutable Evidence           │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authoritative Source Hierarchy

All Phase 9 verification procedures, fixtures, and assertions must adhere to the following strict order of precedence:

1. **Explicit Human Decisions & Instructions**
2. **Product Vision** ([`docs/00_PRODUCT_VISION.md`](file:///Users/balakrishna/apply_citrux/docs/00_PRODUCT_VISION.md))
3. **V1 Product Requirements Document** ([`docs/01_V1_PRD.md`](file:///Users/balakrishna/apply_citrux/docs/01_V1_PRD.md))
4. **Current Phase Specification** (`PHASE_09_GOLDEN_PATH_VERIFICATION_SPEC.md` once approved)
5. **Approved Architectural Decision Records** (ADR-001 through ADR-005)
6. **Accepted & Frozen Phase 1–8 Specifications**:
   - Phase 1: Identity, Tenancy & RBAC (`PHASE_01_IDENTITY_RBAC_SPEC.md` v1.0.0)
   - Phase 2: Candidate Core & Documents (`PHASE_02_CANDIDATE_CORE_SPEC.md` v1.2.0)
   - Phase 3: Application Lifecycle Core (`PHASE_03_APPLICATION_CORE_SPEC.md` v1.1.0)
   - Phase 4: Task & Preparation Core (`PHASE_04_TASK_PREPARATION_CORE_SPEC.md` v1.1.0)
   - Phase 5: QA & Candidate Approval Core (`PHASE_05_QA_APPROVAL_SPEC.md` v1.2.2)
   - Phase 6: Submission & Evidence Core (`PHASE_06_SUBMISSION_SPEC.md` v1.3.0)
   - Phase 7: Communication & Notifications Core (`PHASE_07_COMMUNICATION_SPEC.md` v1.1.0)
   - Phase 8: Admin, Audit & Privacy Core (`PHASE_08_ADMIN_PRIVACY_SPEC.md` v1.1.0)
7. **Existing Verified Implementation Contracts**

*Conflict Resolution Rule*: No ambiguity or contract discrepancy may be resolved by assumption, convention, or AI inference. Any discovered conflict must immediately stop execution and be documented as an unresolved human decision.

---

## 3. Phase 9 Scope

### 3.1 In-Scope Verification Domains

1. **Complete Candidate Golden Path**: Onboarding, profile data, document upload, representation consent, and portal navigation.
2. **Complete Employee Operational Path**: Member login, assigned workspace, candidate review, task management, checklists, internal notes, and candidate messaging.
3. **Complete Application Lifecycle**: Deterministic advancement through all valid states (`DISCOVERED` → `QUALIFIED` → `PREPARING` → `REVIEW` → `AWAITING_APPROVAL` → `READY` → `SUBMITTED`).
4. **QA Review & Candidate Approval Integration**: Strict 9-point QA criteria evaluation, notes on failure, staff-only review execution, and explicit candidate approval gate.
5. **Manual Submission & Immutable Evidence**: Readiness check, manual external submission execution, sequential attempts, evidence file linkage, and append-only submission records.
6. **Communication & Notifications Core**: Direct candidate ↔ staff text messaging, notification bell generation, email provider abstraction, and candidate isolation from internal notes.
7. **Admin Governance & Oversight**: Staff provisioning, member activation/deactivation, role toggling (`EMPLOYEE` ↔ `ADMIN`), and strictly manual work reassignment.
8. **Authoritative Audit Inspection**: Complete verification that all privileged actions produce append-only audit events in `public.audit_events` with complete candidate blindness.
9. **Admin-Assisted Privacy Governance**: Identity verification, administrative export generation, and data minimization preserving required records.
10. **Consent Revocation Cascading Withdrawal**: Immediate transition of unsubmitted applications to `WITHDRAWN` upon candidate consent revocation, while preserving submitted records.
11. **Employee Deactivation Access Revocation**: Immediate blocking of deactivated staff from operational actions while preserving work and attribution for manual reassignment.
12. **Multi-Tenant Isolation**: Strict cross-tenant isolation testing with positive and negative authorization tests across two distinct organizations.
13. **Role Boundary Security Matrix**: Comprehensive negative authorization testing for `CANDIDATE`, `EMPLOYEE`, and `ADMIN`.
14. **Historical Record Preservation**: Verification that destructive operations do not delete required legal, submission, QA, consent, or audit records.
15. **Failure & Recovery Paths**: Controlled testing of invalid state transitions, unauthorized accesses, missing consents, and race conditions.
16. **Full Regression Suite**: Zero-failure execution of all Phase 1 through 8 test suites, typechecks, linting, and production build.

### 3.2 Explicitly Out-of-Scope (Prohibited Additions)

- ❌ No new database models, columns, or schema migrations
- ❌ No new roles (e.g., `SUPER_ADMIN`, `MANAGER`, `TEAM_LEAD`, `QA_ROLE`)
- ❌ No new workflows, automated routing, or auto-assignment engines
- ❌ No AI automation, candidate screening bots, or automated resume tailoring
- ❌ No automated application submission or job scraping
- ❌ No billing, invoicing, or subscription management
- ❌ No SLA automation engines or workload balancing algorithms
- ❌ No background deletion workers or automated retention engines
- ❌ No document blob purging policies or invented legal retention periods
- ❌ No last-active-admin mandatory protection policy (remains unapproved human decision)
- ❌ No new infrastructure (Redis, Kafka, BullMQ, Celery, microservices, or external queues)

---

## 4. End-to-End Golden Path Workflow

Phase 9 defines a deterministic, end-to-end integration journey covering all 8 phases:

```text
Step  1: Candidate Registration & Email Verification (Phase 1)
Step  2: Candidate Career Profile Completion (Experiences, Education, Skills) (Phase 2)
Step  3: Candidate Document Upload & Verification (Phase 2)
Step  4: Candidate Representation Consent Grant (Phase 2 & 3)
Step  5: Admin Provisions Operational Employee (Phase 8)
Step  6: Employee Creates Job Opportunity (Phase 3)
Step  7: Employee Creates Applications for Candidate: Application A and Application B (Phase 3)
Step  8: Employee Advances Applications: DISCOVERED ──► QUALIFIED (Phase 3)
Step  9: Employee Advances Applications: QUALIFIED ──► PREPARING (Phase 3)
Step 10: Authorized Task Creation / Assignment & Checklist Execution for Preparation (Phase 4)
Step 11: Staff Records Internal Note on Task (Phase 4 & 7)
Step 12: Employee Advances Applications: PREPARING ──► REVIEW (Phase 3)
Step 13: Staff Conducts Formal 9-Point QA Review ──► PASS (Phase 5)
Step 14: Staff Requests Candidate Approval: REVIEW ──► AWAITING_APPROVAL (Phase 5)
Step 15: Candidate Reviews Materials & Explicitly Approves (Phase 5)
Step 16: Candidate approval authorizes the existing application transition: AWAITING_APPROVAL ──► READY (Phase 3 & 5)
Step 17: Staff Performs Manual External Submission for Application A ──► SUBMITTED (Phase 6)
Step 18: Staff Uploads & Links Immutable Submission Evidence for Application A (Phase 6)
Step 19: Notification Dispatched to Candidate & Email Transport Triggered (Phase 7)
Step 20: Candidate Initiates Direct Message to Staff (Phase 7)
Step 21: Staff Member Replies to Candidate Message (Phase 7)
Step 22: Admin Inspects Immutable Audit Trail & Confirms Authoritative Events (Phase 8)
Step 23: Candidate Submits DATA_EXPORT Request ──► Staff Verifies ──► Admin Assembles (Phase 8)
Step 24: Candidate Revokes Consent ──► Application A Remains SUBMITTED; Application B Transitions to WITHDRAWN with Open Tasks CANCELED (Phase 2 & 3)
```

Every single step in this journey must verify state persistence in PostgreSQL, RLS boundaries, and immutable audit event logging according to the frozen Phase 1–8 contracts.

> **Task Creation Boundary Clarification**: Phase 9 may invoke the existing explicitly authorized task-creation operation for verification. Phase 9 must NOT introduce automatic task generation, workflow-triggered task generation, background task workers, routing engines, or automatic assignment.

---

## 5. Application Lifecycle & Transition Invariants

The application state machine must strictly enforce the frozen Phase 3, 5, and 6 transition rules:

```text
       ┌──────────────┐
       │  DISCOVERED  │
       └──────┬───────┘
              │ (Staff Qualification)
              ▼
       ┌──────────────┐
       │  QUALIFIED   │
       └──────┬───────┘
              │ (Start Preparation)
              ▼
       ┌──────────────┐
       │  PREPARING   │
       └──────┬───────┘
              │ (Prep Tasks Complete)
              ▼
       ┌──────────────┐       (QA Failed)
       │    REVIEW    │◄────────────────────────┐
       └──────┬───────┘                         │
              │ (QA Passed & Request Approval)  │
              ▼                                 │
       ┌──────────────────┐                     │
       │AWAITING_APPROVAL │                     │
       └──────┬───────────┘                     │
              │ (Candidate Approves)            │ (Revision Requested)
              ▼                                 │
       ┌──────────────┐                         │
       │    READY     │                         │
       └──────┬───────┘                         │
              │ (Manual Submission Executed)    │
              ▼                                 │
       ┌──────────────┐   (Issue Flagged)       │
       │  SUBMITTED   ├─────────────────────────┘
       └──────────────┘
```

### 5.1 Submission & Correction Lifecycles

1. **Initial Submission Lifecycle**:
   `READY` → `SUBMITTED`
2. **Post-Submission Correction Lifecycle**:
   `SUBMISSION_ISSUE` → `REVIEW_REQUIRED` → `CORRECTION_APPROVED` → `RESUBMISSION` → `SUBMITTED`

> **Lifecycle Invariant**: Do not invent, rename, or alias lifecycle states. The vocabulary contains zero invalid states such as `SUBMISSION_CORRECTION`.

### 5.2 Forbidden Transition Assertions

1. `DISCOVERED` → `PREPARING` directly: **MUST FAIL** (Must qualify first).
2. `PREPARING` → `AWAITING_APPROVAL` directly: **MUST FAIL** (Must enter `REVIEW` first).
3. `REVIEW` → `READY` directly: **MUST FAIL** (Must obtain explicit candidate approval via `AWAITING_APPROVAL`).
4. `AWAITING_APPROVAL` → `SUBMITTED` directly: **MUST FAIL** (Must become `READY` first).
5. `PREPARING` or `REVIEW` → `SUBMITTED` directly: **MUST FAIL** (Submission before `READY` is impossible).
6. Candidate attempting to advance application state: **MUST FAIL** (Applications are staff-managed).

---

## 6. QA Review & Candidate Approval Integration

### 6.1 QA Review Criteria (Phase 5 Contract)

All QA reviews must evaluate exactly 9 mandatory binary criteria:
1. `CANDIDATE_JOB_ALIGNMENT`
2. `RESUME_ACCURACY`
3. `JOB_REQUIREMENTS_MATCH`
4. `SALARY_ALIGNMENT`
5. `LOCATION_AUTHORIZATION`
6. `WORK_AUTHORIZATION`
7. `SCREENING_ANSWERS`
8. `APPLICATION_COMPLETENESS`
9. `CANDIDATE_CONSENT_ACTIVE`

### 6.2 QA Execution Rules

- **Unanimous Pass Required**: Status `PASSED` is granted if and only if all 9 criteria evaluate to `true`.
- **Failure Notes Required**: If any criterion is `false`:
  - QA status must be `FAILED`.
  - Failure notes are mandatory.
  - Failure notes must be non-empty after trim.
  - Maximum length is 5000 characters.
  - Do not introduce a 10-character minimum.
- **Staff-Only Barrier**: The `CANDIDATE` role is strictly blocked from creating or modifying QA reviews.
- **Approval Gate**: Requesting candidate approval is prohibited if the latest QA review is not `PASSED`.

---

## 7. Submission & Evidence Integration

### 7.1 Submission Contract (Phase 6)

1. **Gate Requirement**: Only applications in `READY` status (or in the correction flow `CORRECTION_APPROVED` / `RESUBMISSION`) can execute a submission attempt.
   - Initial submission: `READY` → `SUBMITTED`
   - Correction lifecycle: `SUBMISSION_ISSUE` → `REVIEW_REQUIRED` → `CORRECTION_APPROVED` → `RESUBMISSION` → `SUBMITTED`
2. **Sequential Attempts**: Submission attempt numbers are strictly sequential (`attemptNumber: 1, 2, 3...`).
3. **Immutable History**: Past submission attempts and evidence records are permanent and append-only.
4. **Evidence Storage & Linkage**:
   - Submission metadata is persisted in PostgreSQL.
   - Submission evidence blobs are stored in the private `submission-evidence` Supabase Storage bucket.
   - `ApplicationSubmission` contains the authorized evidence storage metadata/path.
5. **No Update/Delete on Submissions**: The runtime database role `oos_app_runtime` must have zero `UPDATE` or `DELETE` capabilities on `application_submissions` and `submission_evidence`.

---

## 8. Communication & Realtime Integration

### 8.1 Messaging Boundaries (Phase 7)

1. **Text-Only Storage**: All message bodies are plain text stored in `public.messages`.
2. **Append-Only Communication**: Messages cannot be edited or deleted once persisted.
3. **Candidate Isolation**: Candidate A cannot view, query, or receive messages from Candidate B's conversations.
4. **Internal Notes Barrier**: Internal staff notes stored in `public.internal_notes` are permanently inaccessible to candidates via API, server action, or database RLS.
5. **Zero PII Message Body Logging**: Audit logs record conversation IDs and timestamps, never message body text.
6. **Email Transport Abstraction**: Notifications trigger the transactional email provider interface backed by Gmail SMTP without leaking transport details into domain logic.

---

## 9. Admin Operations & Work Reassignment Integration

### 9.1 Admin Capabilities (Phase 8)

1. **Staff Provisioning**: Admin can create staff accounts and assign initial roles (`EMPLOYEE` or `ADMIN`).
2. **Access Control**: Admin can activate or deactivate staff memberships.
3. **Role Management**: Admin can toggle staff roles between `EMPLOYEE` and `ADMIN`.
4. **Strictly Manual Work Reassignment**: Admin can explicitly reassign applications, tasks, and candidates to an active target employee.
5. **Zero Automated Routing**: Work reassignment must remain 100% manual (Admin → explicit employee selection → explicit target entity IDs).

### 9.2 Employee Deactivation Invariants

```text
Active Employee Deactivated by Admin
       │
       ├─► 1. Membership status becomes INACTIVE according to the frozen Phase 8 employee lifecycle contract.
       ├─► 2. Authentication session & operational actions immediately revoked (403 Forbidden)
       ├─► 3. Historical actions and audit event attribution preserved intact
       ├─► 4. Open applications, tasks, and candidates remain preserved in organization
       └─► 5. Work remains available for manual reassignment by Admin (No auto-routing)
```

---

## 10. Privacy Governance Integration

### 10.1 Privacy Request Workflow (Phase 8)

```text
Candidate Submits Privacy Request (DATA_EXPORT / DATA_CORRECTION / DATA_DELETION)
       │
       ▼
Status: PENDING
       │
       ├─► Staff / Admin verifies identity ──► Status: IDENTITY_VERIFIED
       │                                              │
       │                                              ├─► Admin Completes ──► Status: COMPLETED
       │                                              └─► Admin Rejects   ──► Status: REJECTED
       │
       └─► Admin Rejects with Reason ────────► Status: REJECTED
```

### 10.2 Strict Privacy Invariants

- **Admin-Assisted Model**: Privacy requests are intake records processed by authorized staff/administrators. No self-service deletion or export execution.
- **Required Record Preservation**: Deletion workflows must preserve application records, submission evidence, QA reviews, consent history, and audit records intact.
- **Zero Invented Deletion/Retention Rules**: No arbitrary retention periods or document blob purging rules may be executed.

---

## 11. Consent Revocation Verification

Consent revocation is a primary security and legal safeguard within OOS. The Phase 9 verification scenario creates at least two applications to test this invariant as a comprehensive end-to-end reality:

- **Application A**: Externally submitted (`SUBMITTED`)
- **Application B**: Unsubmitted (e.g. `READY` or `PREPARING` with open tasks)

```text
Candidate Revokes Representation Consent
       │
       ├─► 1. Candidate consentStatus set to REVOKED in PostgreSQL
       ├─► 2. Application A (SUBMITTED):
       │      └─► Remains SUBMITTED; historical submission & evidence records preserved intact
       ├─► 3. Application B (Unsubmitted / READY / PREPARING):
       │      └─► Immediately transitions to WITHDRAWN
       ├─► 4. Open preparation tasks associated with Application B:
       │      └─► Immediately marked CANCELED
       ├─► 5. Future progression or submission of Application B (and any unsubmitted apps):
       │      └─► Strictly prohibited
       ├─► 6. New application creation or qualification for candidate:
       │      └─► Strictly blocked
       └─► 7. Audit events explicitly required by Phase 1–8 contracts logged in public.audit_events
```

---

## 12. Multi-Tenant Isolation Matrix

Phase 9 verification must construct at least two distinct organizations (`Organization A` and `Organization B`) and assert mutual cross-tenant isolation:

| Entity | Positive Authorization (Org A Member) | Negative Authorization (Org B Member Attempt) | Enforced Boundary |
| :--- | :--- | :--- | :--- |
| **Candidates** | Read/Update Org A Candidates | Access Denied / Returns Null | Server Context + RLS |
| **Jobs** | Read/Update Org A Jobs | Access Denied / Returns Null | Server Context + RLS |
| **Applications** | Read/Update Org A Applications | Access Denied / Returns Null | Server Context + RLS |
| **Tasks** | Read/Update Org A Tasks | Access Denied / Returns Null | Server Context + RLS |
| **QA Reviews** | Create/Read Org A QA | Access Denied / Returns Null | Server Context + RLS |
| **Submissions** | Read/Execute Org A Submissions | Access Denied / Returns Null | Server Context + RLS |
| **Conversations** | Read/Send in Org A Threads | Access Denied / Returns Null | Server Context + RLS |
| **Internal Notes**| Read Org A Internal Notes | Access Denied / Returns Null | Server Context + RLS |
| **Notifications** | Read Org A Notifications | Access Denied / Returns Null | Server Context + RLS |
| **Privacy Requests**| View Org A Privacy Queue | Access Denied / Returns Null | Server Context + RLS |
| **Audit Logs** | Read Org A `audit_events` | Access Denied / Returns Null | Server Context + RLS |

---

## 13. Role-Based Access Control (RBAC) Boundary Matrix

Only three authoritative roles exist: `CANDIDATE`, `EMPLOYEE`, and `ADMIN`.

| Action / Capability | `CANDIDATE` | `EMPLOYEE` | `ADMIN` | Authorization Barrier |
| :--- | :---: | :---: | :---: | :--- |
| View Candidate Portal & Edit Own Profile | ✅ Allowed | ❌ Blocked | ❌ Blocked | `requireCandidate` |
| Upload & View Own Documents | ✅ Allowed | ❌ Blocked | ❌ Blocked | Server Context + RLS |
| Grant / Revoke Representation Consent | ✅ Allowed | ❌ Blocked | ❌ Blocked | `requireCandidate` |
| View Own Applications & Status | ✅ Allowed | ❌ Blocked | ❌ Blocked | Server Context + RLS |
| Approve / Request Revision on Application | ✅ Allowed | ❌ Blocked | ❌ Blocked | `requireCandidate` |
| Submit Privacy Request | ✅ Allowed | ❌ Blocked | ❌ Blocked | `requireCandidate` |
| View Staff Workspace & Task Queue | ❌ Blocked | ✅ Allowed | ✅ Allowed | `requireEmployeeOrAdmin` |
| Create / Qualify / Advance Applications | ❌ Blocked | ✅ Allowed | ✅ Allowed | `requireEmployeeOrAdmin` |
| Execute Preparation Tasks & Checklists | ❌ Blocked | ✅ Allowed | ✅ Allowed | `requireEmployeeOrAdmin` |
| Conduct QA Review (Pass/Fail) | ❌ Blocked | ✅ Allowed | ✅ Allowed | `requireEmployeeOrAdmin` |
| Execute Manual External Submission | ❌ Blocked | ✅ Allowed | ✅ Allowed | `requireEmployeeOrAdmin` |
| Create Internal Notes | ❌ Blocked | ✅ Allowed | ✅ Allowed | `requireEmployeeOrAdmin` |
| Verify Privacy Request Identity | ❌ Blocked | ✅ Allowed | ✅ Allowed | `requireEmployeeOrAdmin` |
| Provision Staff Accounts | ❌ Blocked | ❌ Blocked | ✅ Allowed | `requireAdmin` |
| Activate / Deactivate Staff Members | ❌ Blocked | ❌ Blocked | ✅ Allowed | `requireAdmin` |
| Update Staff Role (`EMPLOYEE` ↔ `ADMIN`) | ❌ Blocked | ❌ Blocked | ✅ Allowed | `requireAdmin` |
| Manual Operational Work Reassignment | ❌ Blocked | ❌ Blocked | ✅ Allowed | `requireAdmin` |
| Query Administrative Audit Trail | ❌ Blocked | ❌ Blocked | ✅ Allowed | `requireAdmin` |
| Complete / Reject Privacy Requests | ❌ Blocked | ❌ Blocked | ✅ Allowed | `requireAdmin` |
| Assemble Machine-Readable Data Export | ❌ Blocked | ❌ Blocked | ✅ Allowed | `requireAdmin` |

---

## 14. Authoritative Audit Integrity (`public.audit_events`)

All audit events explicitly required by the frozen Phase 1–8 contracts must be written to the single authoritative `public.audit_events` table.

Phase 9 must verify existing audit requirements. Phase 9 must NOT create new audit-event requirements.

### 14.1 Audit Verification Checklist

1. **Actor Attribution**: `actorId` must equal authenticated `userId` and `actorType` must equal `'USER'` (or `'SYSTEM'`). Client cannot spoof actor ID.
2. **Tenant Scoping**: `organizationId` must equal server context `organizationId`.
3. **Immutability Constraint**: No runtime `UPDATE` or `DELETE` permissions exist for `oos_app_runtime` on `audit_events`.
4. **Candidate Blindness**: The `CANDIDATE` role must receive `403 Forbidden` if attempting to query administrative audit logs.

---

## 15. Failure & Recovery Verification Paths

The Phase 9 suite must test controlled negative failure cases:

1. **Lifecycle Violations**: Attempting invalid state skips (e.g. `DISCOVERED` → `READY`) must return `400 ValidationError` without state change.
2. **Privilege Escalation**: Candidate attempting to call `createEmployeeAction` or `conductQaReviewAction` must receive `403 AuthorizationError`.
3. **Cross-Tenant Breach**: Employee in Org A attempting to update an application in Org B must receive `404 NotFoundError` or `403 AuthorizationError`.
4. **Submission Without Readiness**: Attempting submission on an application in `REVIEW` must fail with `400 ValidationError`.
5. **QA Without Notes on Failure**: Submitting QA `FAILED` with empty notes must be rejected by Zod schema validation.
6. **Concurrent Privacy Resolution**: Two simultaneous admin resolutions on the same request must fail cleanly for the second admin via optimistic concurrency check.
7. **Orphan Prevention**: Disabling or deleting non-critical records must never cascade-delete submitted applications or immutable audit records.

---

## 16. E2E Verification Architecture & Test Strategy

### 16.1 Test Environment & Fixtures

Phase 9 verification must operate in a dedicated, isolated test harness without touching production data:

- **Tenants**:
  - `Org-Alpha` (`id: 11111111-1111-4111-8111-111111111111`)
  - `Org-Beta` (`id: 22222222-2222-4222-8222-222222222222`)
- **Identities**:
  - `Candidate-A1` (Candidate in Org-Alpha)
  - `Candidate-A2` (Candidate in Org-Alpha)
  - `Candidate-B1` (Candidate in Org-Beta)
  - `Employee-A1` (Employee in Org-Alpha)
  - `Employee-A2` (Employee in Org-Alpha)
  - `Employee-B1` (Employee in Org-Beta)
  - `Admin-A1` (Admin in Org-Alpha)
  - `Admin-B1` (Admin in Org-Beta)
- **Data Cleanliness**: Automated setup and teardown within transaction blocks to guarantee zero side-effects across test runs.

### 16.2 Test Suite Organization

Phase 9 verification tests will be organized into dedicated integration suites under `tests/integration/golden-path/`:

1. `tests/integration/golden-path/candidate-journey.test.ts`: Complete candidate golden path.
2. `tests/integration/golden-path/application-workflow.test.ts`: Complete application lifecycle from discovery to submission.
3. `tests/integration/golden-path/qa-approval-submission.test.ts`: QA review, candidate approval, submission, and evidence upload.
4. `tests/integration/golden-path/communication-notifications.test.ts`: Messaging, internal notes barrier, and email provider.
5. `tests/integration/golden-path/admin-privacy-governance.test.ts`: Staff provisioning, role toggling, manual reassignment, audit log querying, and privacy resolution.
6. `tests/integration/golden-path/consent-revocation-cascade.test.ts`: Multi-application consent revocation cascading withdrawal verification.
7. `tests/integration/golden-path/multi-tenant-security-matrix.test.ts`: Full cross-tenant and RBAC negative boundary matrix.

---

## 17. Acceptance Gates & Quality Criteria

Phase 9 acceptance is strictly binary (**PASS / FAIL**). All 20 gates must achieve a **PASS** result:

| # | Acceptance Gate | Verification Criteria | Status |
| :---: | :--- | :--- | :---: |
| **G-01** | **Candidate Golden Path** | Registration → Profile → Document → Consent executes seamlessly | `PENDING` |
| **G-02** | **Application Lifecycle** | `DISCOVERED` through `SUBMITTED` advances in exact frozen sequence | `PENDING` |
| **G-03** | **Illegal Transitions Blocked** | Invalid state skips and unauthorized advances return errors | `PENDING` |
| **G-04** | **QA Review Integration** | All 9 criteria evaluated; failure notes mandatory (non-empty); staff-only | `PENDING` |
| **G-05** | **Candidate Approval Gate** | Application cannot enter `READY` without candidate sign-off | `PENDING` |
| **G-06** | **Manual Submission & Evidence**| Sequential attempts, immutable history, bucket evidence file linked | `PENDING` |
| **G-07** | **Messaging & Realtime** | Text-only, append-only, PostgreSQL source of truth | `PENDING` |
| **G-08** | **Internal Notes Barrier** | Internal notes completely invisible to `CANDIDATE` role | `PENDING` |
| **G-09** | **Notifications & Email** | Recipient-scoped delivery; Gmail SMTP provider abstraction | `PENDING` |
| **G-10** | **Admin Governance** | Member provisioning, activation, and role toggles verified | `PENDING` |
| **G-11** | **Manual Reassignment** | Explicit reassignment only; zero auto-routing or AI balancing | `PENDING` |
| **G-12** | **Employee Deactivation** | Status INACTIVE; access revoked; historical records preserved | `PENDING` |
| **G-13** | **Privacy Governance** | Admin-assisted review, export, deletion; zero blob purges | `PENDING` |
| **G-14** | **Consent Revocation Cascade**| Unsubmitted apps (B) withdrawn + tasks canceled; submitted (A) kept | `PENDING` |
| **G-15** | **Multi-Tenant Isolation** | Org A cannot access any Org B entities (negative & positive) | `PENDING` |
| **G-16** | **RBAC Boundary Matrix** | Candidate, Employee, Admin role constraints verified | `PENDING` |
| **G-17** | **Audit Trail Integrity** | Contractually required events logged to `audit_events`; append-only | `PENDING` |
| **G-18** | **Phase 1–8 Regression** | 100% test pass rate across all existing unit & integration tests | `PENDING` |
| **G-19** | **Code Quality Gates** | `npm run typecheck` (0 errors) & `npm run lint` (0 errors) | `PENDING` |
| **G-20** | **Production Build** | `npm run build` succeeds cleanly with all routes optimized | `PENDING` |

---

## 18. Phase 9 Completion & Governance Rules

1. **No Production Deployment Authorization**: Phase 9 verification verifies software correctness only. It does not constitute a production pilot authorization.
2. **Freeze Procedure**: Upon human review and approval of the verification report, Phase 9 will be marked `ACCEPTED — FROZEN`.
3. **Execution Prohibition**: No code, test execution, or verification implementation shall commence until formal human approval of this specification is granted.
