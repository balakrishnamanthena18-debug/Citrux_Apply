# OOS / CareerButton — Playwright E2E Coverage Matrix

This document tracks all routes, user roles, authentication requirements, primary workflows, validation states, associated Playwright end-to-end tests, execution statuses, and known environment boundaries for the Operations Operating System (OOS).

## Legend
- **PASS**: Executed in browser test and passed.
- **FAIL**: Executed in browser test and failed (defect or regression).
- **BLOCKED**: Requires unavailable external service / provider or safe mock (e.g. real SMTP mailbox, payment gateway, third-party job board API).
- **NOT COVERED**: Route or edge state not covered in the current test run.
- **SKIPPED**: Deliberately excluded for safety reasons (e.g. live production mutation).

---

## 1. Public & Authentication Routes

| Route | Purpose | Auth Required | Authorized Roles | Primary Actions | Key Validation & Error States | Associated Test | Execution Status | Known Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Landing / Engineering Foundation | No | Public / All | Display foundation status and system overview | Renders without authentication (HTTP 200) | `tests/e2e/auth.spec.ts` | PASS | Public landing page |
| `/login` | User login portal | No | Public (All) | Submit credentials, redirect to role home | Invalid password, empty fields, inactive account, rate limit | `tests/e2e/auth.spec.ts` | PASS | Database-backed rate limiter active |
| `/register` | Candidate sign up | No | Public (Candidates) | Register candidate account | Required fields, duplicate email, weak password | `tests/e2e/auth.spec.ts` | PASS | Test email isolation maintained |
| `/forgot-password` | Password recovery | No | Public (All) | Request reset email | Invalid email format, non-existent email generic response | `tests/e2e/auth.spec.ts` | PASS | Email delivery mocked/sink |
| `/reset-password` | Set new password | No (Token) | Token Bearer | Input new password | Expired token, password complexity rules | `tests/e2e/auth.spec.ts` | BLOCKED | Requires valid unexpired reset token from Supabase Auth |
| `/verify-reset-otp` | OTP recovery verify | No (Code) | Code Bearer | Submit verification code | Invalid code, expired code, max attempts | `tests/e2e/auth.spec.ts` | BLOCKED | Requires active SMS/Email OTP code |
| `/activate` | Staff invite activate | No (Token) | Invited Staff | Set password & complete profile | Expired invitation, already activated token | `tests/e2e/auth.spec.ts` | BLOCKED | Requires active staff invitation token |
| `/auth/callback` | OAuth / Magic link callback | No (Code) | Code Bearer | Exchange auth code for session | Invalid code, expired session | `tests/e2e/auth.spec.ts` | PASS | Redirects to login on missing/invalid code |

---

## 2. System Administrator Routes (`ADMIN`)

| Route | Purpose | Auth Required | Authorized Roles | Primary Actions | Key Validation & Error States | Associated Test | Execution Status | Known Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/admin` | Admin root redirect | Yes | `ADMIN` | Redirect to `/admin/dashboard` | 307 Redirect for unauthenticated / 403 for unauthorized | `tests/e2e/admin-workflows.spec.ts` | PASS | Redirect target verified |
| `/admin/dashboard` | System health & KPIs | Yes | `ADMIN` | View operational KPIs, team velocity, queues | RLS context check, loading metrics | `tests/e2e/admin-workflows.spec.ts` | PASS | Full layout verified |
| `/admin/settings` | Org settings hub | Yes | `ADMIN` | Navigate settings sub-sections | Organization boundary verification | `tests/e2e/admin-workflows.spec.ts` | PASS | Settings hubs rendered |
| `/admin/settings/designations` | Titles & Designations | Yes | `ADMIN` | Create, edit, archive, reactivate designations | Duplicate code/name, dialog cancel/confirm, no native popups | `tests/e2e/designations-dialog.spec.ts` | PASS | Verified `ConfirmDialog` replaces `window.confirm` |
| `/admin/settings/task-rules` | Task automation rules | Yes | `ADMIN` | Configure SLA thresholds, escalation tiers | Invalid criteria, numeric limits | `tests/e2e/admin-workflows.spec.ts` | PASS | SLA threshold rules view |
| `/admin/members` | Staff roster & invites | Yes | `ADMIN` | Invite employee, change roles, deactivate | Duplicate invite, self-deactivation block | `tests/e2e/admin-workflows.spec.ts` | PASS | Role upgrade/deactivate dialogs |
| `/admin/members/[id]` | Member details & audit | Yes | `ADMIN` | Inspect member history, permissions | 404 for non-existent member, cross-org block | `tests/e2e/admin-workflows.spec.ts` | PASS | Non-existent ID handled safely |
| `/admin/applications` | Platform applications | Yes | `ADMIN` | View all org applications, status filter | Cross-tenant isolation, filter validation | `tests/e2e/admin-workflows.spec.ts` | PASS | Filter & pagination states |
| `/admin/candidates` | Candidate directory | Yes | `ADMIN` | Search candidates, review profiles | Empty search results, pagination bounds | `tests/e2e/admin-workflows.spec.ts` | PASS | Search query input & clear |
| `/admin/tasks/escalations` | Escalation queue | Yes | `ADMIN` | Reassign breached tasks, acknowledge | Reassignment validation, audit event | `tests/e2e/admin-workflows.spec.ts` | PASS | SLA breach queue display |
| `/admin/outcomes` | Outcome intelligence | Yes | `ADMIN` | Review conversion metrics, placements | Empty outcome states, date filters | `tests/e2e/admin-workflows.spec.ts` | PASS | Metrics charts & summaries |
| `/admin/privacy` | Privacy & DPDP governance | Yes | `ADMIN` | Approve data erasure, export dossier | Irreversible erasure confirmation dialog | `tests/e2e/admin-workflows.spec.ts` | PASS | Request status filters |
| `/admin/audit` | Compliance audit trail | Yes | `ADMIN` | Filter audit logs by actor/action, inspect JSON | High-volume query handling, JSON parsing | `tests/e2e/admin-workflows.spec.ts` | PASS | Actor & action filters |

---

## 3. Employee / Staff Routes (`EMPLOYEE`)

| Route | Purpose | Auth Required | Authorized Roles | Primary Actions | Key Validation & Error States | Associated Test | Execution Status | Known Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/employee` | Staff daily dashboard | Yes | `EMPLOYEE`, `ADMIN` | View assigned queues, daily targets | Unauthenticated redirect, role access | `tests/e2e/employee-workflows.spec.ts` | PASS | Queue counts verified |
| `/employee/applications` | Application triage | Yes | `EMPLOYEE`, `ADMIN` | Filter applications, open candidate record | Status filter dropdown, search | `tests/e2e/employee-workflows.spec.ts` | PASS | Table and list views |
| `/employee/applications/[id]` | Application deep review | Yes | `EMPLOYEE`, `ADMIN` | Update status, add notes, trigger review | State transition rules, required notes | `tests/e2e/employee-workflows.spec.ts` | PASS | Status transition modal |
| `/employee/application-log` | Submission history | Yes | `EMPLOYEE`, `ADMIN` | Audit past submissions and matches | Date range filters, pagination | `tests/e2e/employee-workflows.spec.ts` | PASS | Log entries rendered |
| `/employee/candidates` | Talent directory | Yes | `EMPLOYEE`, `ADMIN` | Search talent, view resumes | Search query sanitization | `tests/e2e/employee-workflows.spec.ts` | PASS | Talent card grid |
| `/employee/candidates/[id]` | Candidate dossier | Yes | `EMPLOYEE`, `ADMIN` | Inspect career history, matches | 404 for invalid ID, permission boundary | `tests/e2e/employee-workflows.spec.ts` | PASS | Candidate dossier cards |
| `/employee/jobs` | Job opportunities | Yes | `EMPLOYEE`, `ADMIN` | Browse requisitions, match candidates | Active vs archived jobs | `tests/e2e/employee-workflows.spec.ts` | PASS | Job requisition cards |
| `/employee/interviews` | Interview coordination | Yes | `EMPLOYEE`, `ADMIN` | Schedule interview, log feedback | Invalid dates, missing scorecard fields | `tests/e2e/employee-workflows.spec.ts` | PASS | Interview schedule view |
| `/employee/tasks` | Operational task queue | Yes | `EMPLOYEE`, `ADMIN` | Complete tasks, escalate blockers | Completion status validation | `tests/e2e/employee-workflows.spec.ts` | PASS | Task checkbox/action |
| `/employee/tasks/[id]` | Task workspace | Yes | `EMPLOYEE`, `ADMIN` | Update task notes, change priority | Invalid state transitions | `tests/e2e/employee-workflows.spec.ts` | PASS | Detail and action pane |
| `/employee/messages` | Internal messaging | Yes | `EMPLOYEE`, `ADMIN` | Send team messages, select channels | Empty message validation | `tests/e2e/employee-workflows.spec.ts` | PASS | Thread list rendered |
| `/employee/messages/[id]` | Message thread | Yes | `EMPLOYEE`, `ADMIN` | Reply to conversation | Real-time connection failure handling | `tests/e2e/employee-workflows.spec.ts` | PASS | Reply box & history |
| `/employee/outcomes` | Operational metrics | Yes | `EMPLOYEE`, `ADMIN` | View team placements & milestones | Empty state handling | `tests/e2e/employee-workflows.spec.ts` | PASS | Metrics charts |

---

## 4. Candidate Portal Routes (`CANDIDATE`)

| Route | Purpose | Auth Required | Authorized Roles | Primary Actions | Key Validation & Error States | Associated Test | Execution Status | Known Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/candidate` | Candidate home | Yes | `CANDIDATE` | View active pipeline, next steps | Role check, unauthorized redirect to `/admin` | `tests/e2e/candidate-workflows.spec.ts` | PASS | Pipeline summary cards |
| `/candidate/profile` | Personal profile | Yes | `CANDIDATE` | Update contact info, headline | Invalid phone/URL, save confirmation | `tests/e2e/candidate-workflows.spec.ts` | PASS | Profile form validation |
| `/candidate/career` | Career portfolio editor | Yes | `CANDIDATE` | Add/edit education, experience, projects, skills | Date range validation, delete confirmations | `tests/e2e/candidate-workflows.spec.ts` | PASS | Uses `ConfirmDialog` for record deletion |
| `/candidate/jobs` | Recommended jobs | Yes | `CANDIDATE` | View job matches, apply to position | Already applied block, match score | `tests/e2e/candidate-workflows.spec.ts` | PASS | Job search & filter |
| `/candidate/applications` | My applications | Yes | `CANDIDATE` | Check application progress & status | Empty application state | `tests/e2e/candidate-workflows.spec.ts` | PASS | Stage progress stepper |
| `/candidate/applications/[id]` | Application status | Yes | `CANDIDATE` | View feedback, interview details | Unauthorized cross-candidate block | `tests/e2e/candidate-workflows.spec.ts` | PASS | Strict RLS candidate isolation |
| `/candidate/interviews` | Interview schedule | Yes | `CANDIDATE` | View upcoming interviews, meeting links | Join meeting action | `tests/e2e/candidate-workflows.spec.ts` | PASS | Calendar / list view |
| `/candidate/messages` | Advisor messages | Yes | `CANDIDATE` | Message career advisor | Message input validation | `tests/e2e/candidate-workflows.spec.ts` | PASS | Chat interface |
| `/candidate/messages/[id]` | Chat thread | Yes | `CANDIDATE` | Send reply | Connection drops, retry | `tests/e2e/candidate-workflows.spec.ts` | PASS | Message bubbles |
| `/candidate/privacy` | Privacy & DPDP rights | Yes | `CANDIDATE` | Request data export, request deletion | Confirm deletion dialog | `tests/e2e/candidate-workflows.spec.ts` | PASS | DPDP download/delete requests |

---

## 5. Security & Boundary Enforcement Matrix

| Boundary / Policy | Target Role | Restricted Target | Expected Behavior | Associated Test | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Candidate to Admin Route | `CANDIDATE` | `/admin/dashboard` | 307 Redirect to `/candidate` or 403 Forbidden | `tests/e2e/rbac-boundaries.spec.ts` | PASS |
| Candidate to Employee Route | `CANDIDATE` | `/employee/applications` | 307 Redirect to `/candidate` or 403 Forbidden | `tests/e2e/rbac-boundaries.spec.ts` | PASS |
| Employee to Admin Settings | `EMPLOYEE` | `/admin/settings/designations` | 307 Redirect to `/employee` or 403 Forbidden | `tests/e2e/rbac-boundaries.spec.ts` | PASS |
| Employee to Audit Trail | `EMPLOYEE` | `/admin/audit` | 307 Redirect to `/employee` or 403 Forbidden | `tests/e2e/rbac-boundaries.spec.ts` | PASS |
| Unauthenticated to Dashboard | Anonymous | `/admin/dashboard`, `/employee`, `/candidate` | 307 Redirect to `/login?redirectTo=...` | `tests/e2e/auth.spec.ts` | PASS |
| Cross-Tenant Record Access | Any | Other Organization's UUID | Record hidden / 404 / 403 / RLS rejection | `tests/e2e/rbac-boundaries.spec.ts` | PASS |

---

## 6. Shared Enterprise Interaction & UI Matrix

| Component | Target Pages | Actions Tested | Verifications | Associated Test | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AccountMenu` | Top-right header (Admin, Employee, Candidate) | Click trigger, view role badge, navigate profile, click Sign Out | Keyboard Esc, click outside, document navigation, session cleared | `tests/e2e/account-lifecycle.spec.ts` | PASS |
| `ResponsiveAccountPanel` | Sidebar footer & mobile drawer | Click user panel, trigger popover, collapsed mode, Sign Out | Collapsed sidebar tooltips, accessible labels | `tests/e2e/account-lifecycle.spec.ts` | PASS |
| `ConfirmDialog` | Designations, Staff Roster, Privacy, Career Editor | Open dialog, inspect copy, click Cancel, press Escape, click Confirm | Replaces native `window.confirm`/`alert`, focus trap, aria-modal, accessible attributes | `tests/e2e/designations-dialog.spec.ts` | PASS |
| Responsive Layouts | All authenticated dashboards | Desktop (1280px), Tablet (768px), Mobile (390px) | Drawer toggle, no horizontal scrollbar overflow, touch targets >= 44px | `tests/e2e/responsive-viewports.spec.ts` | PASS |
