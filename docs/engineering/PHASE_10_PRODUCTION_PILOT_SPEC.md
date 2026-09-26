# Phase 10 Engineering Specification: Production Pilot Readiness & Operational Governance

**Version:** 1.0.0  
**Status:** ACCEPTED — FROZEN  
**Implementation Status:** IMPLEMENTED — VERIFIED — ACCEPTED  
**Classification:** Operational Readiness, Governance, & Production Pilot Execution Protocol  
**Repository:** `apply_citrux`

---

## 1. Purpose

Phase 10 defines the production readiness verification, environment governance, operational support procedures, and pilot execution framework required to operate the Operations Operating System (OOS) in a real-world, controlled production pilot.

Phase 10 is **NOT** a feature-development phase. It does not introduce new product capabilities, alter domain contracts, or expand the functional scope of Phases 1–9. Its sole mandate is to answer definitively:
> *"Can the existing, verified OOS implementation safely, reliably, and securely operate real-world candidate workflows, application staging, QA gates, manual submissions, and tenant isolation under controlled pilot conditions?"*

---

## 2. Scope

The scope of Phase 10 encompasses:
- Production environment and infrastructure readiness criteria for the existing stack.
- Multi-tenant security, RLS enforcement, and least-privilege runtime role verification.
- Privacy compliance execution (candidate consent, verification, export, correction, deletion).
- Production backup, restore verification, and deployment rollback procedures.
- Observability and structured audit stream monitoring.
- Severity-based incident response protocol and emergency stop procedures.
- Controlled pilot population boundaries and entry/exit criteria.
- Operational procedures for employees, candidates, and administrators.

---

## 3. Source Authority & Governance Hierarchy

All specifications in this document are strictly subordinate to the established governance hierarchy:
1. Explicit Human Instructions
2. [Product Vision (docs/00_PRODUCT_VISION.md)](file:///Users/balakrishna/apply_citrux/docs/00_PRODUCT_VISION.md)
3. [V1 PRD (docs/01_V1_PRD.md)](file:///Users/balakrishna/apply_citrux/docs/01_V1_PRD.md)
4. Accepted ADRs:
   - [ADR-001 Modular Monolith Tech Stack](file:///Users/balakrishna/apply_citrux/docs/decisions/ADRs/ADR-001-modular-monolith-tech-stack.md)
   - [ADR-002 Server-Client Boundary Security](file:///Users/balakrishna/apply_citrux/docs/decisions/ADRs/ADR-002-server-client-boundary-security.md)
   - [ADR-003 Database Connection & Prisma Strategy](file:///Users/balakrishna/apply_citrux/docs/decisions/ADRs/ADR-003-database-connection-prisma-strategy.md)
   - [ADR-004 Testing Strategy & Quality Firewalls](file:///Users/balakrishna/apply_citrux/docs/decisions/ADRs/ADR-004-testing-strategy.md)
   - [ADR-005 Logging & Observability Foundation](file:///Users/balakrishna/apply_citrux/docs/decisions/ADRs/ADR-005-logging-observability-foundation.md)
5. Frozen Phase 1–9 Engineering Specifications (`PHASE_01` through `PHASE_09`).
6. Accepted Post-Phase-9 Operational Hardening Baseline.

---

## 4. Phase 10 Boundaries & Explicit Prohibitions

Phase 10 strictly prohibits the introduction or contemplation of any of the following:
- **No Automated Job Ingestion**: No web scraping, job board scrapers, or third-party ATS scrapers.
- **No AI / LLM Features**: No automated resume tailoring, AI cover letters, AI matching, or automated candidate scoring.
- **No Automated External Submission**: No headless browser bots, Playwright/Puppeteer submitters, or bypass of manual human submission.
- **No Commercial / Billing Engine**: No payment gateways, Stripe integrations, billing tiers, or subscription metering.
- **No Automated Task Engines**: No automatic task generation, background cron routing, or automatic employee assignment.
- **No SLA Engines**: No automatic escalation timers or breach automation.
- **No Portfolio Engine**: No candidate public portfolio builders.
- **No Domain Schema Expansion**: Zero new database tables, columns, relations, or application status enum values.

---

## 5. Production Pilot Definition

The Production Pilot is a time-bound, volume-capped operational validation exercise where authorized staff use the accepted OOS platform to deliver high-touch application management for a discrete cohort of real candidates.

The pilot operates under the **Human-in-the-Loop Canonical Model**:
1. Candidates own their authoritative career profile and grant explicit consent.
2. Staff manually discover opportunities, prepare materials, and complete internal QA reviews.
3. Candidates explicitly approve each prepared application package in their portal.
4. Staff manually execute submissions on external job sites and record immutable evidence in OOS.

---

## 6. Environment Separation & Configuration Readiness

Production environments must maintain complete cryptographic, network, and data isolation from development and staging environments.

### 6.1 Environment Tiers
- **Development**: Local development environment with local PostgreSQL or Supabase branch.
- **Staging / Pre-Production**: Isolated Supabase project and Vercel preview deployment executing the complete Phase 9 Golden-Path regression suite against test data.
- **Production**: Dedicated production Supabase project (PostgreSQL, Auth, Storage) and production Vercel deployment with restricted access and forced RLS.

### 6.2 Environment Variable Matrix

| Variable Name | Environment Tier | Scope / Visibility | Purpose / Security Requirement |
|---|---|---|---|
| `DATABASE_URL` | Production | Server-Only | Pooled connection string (Transaction mode, PgBouncer port 6543) for runtime queries. |
| `DIRECT_URL` | Production | Server-Only | Direct PostgreSQL connection string (Port 5432) for migrations only. |
| `NEXT_PUBLIC_SUPABASE_URL` | Production | Public / Client | Production Supabase Project HTTPS endpoint. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production | Public / Client | Production Supabase client anonymous API key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Server-Only | Privileged admin key. **Strictly prohibited from client bundles.** |
| `SMTP_HOST` | Production | Server-Only | Production SMTP relay host (`smtp.gmail.com`). |
| `SMTP_PORT` | Production | Server-Only | Production SMTP port (`587`). |
| `SMTP_USER` | Production | Server-Only | Production dedicated system sender email. |
| `SMTP_PASS` | Production | Server-Only | Production Gmail App Password (encrypted secret). |
| `SMTP_FROM` | Production | Server-Only | Verified production sender display header. |
| `NEXT_PUBLIC_APP_URL` | Production | Public / Client | Canonical production HTTPS domain URL. |

### 6.3 Secret Rotation & Protection
- Secrets must never be committed to source control.
- Any detected secret exposure mandates immediate rotation and invalidation.
- Client bundles must be verified via automated static analysis to ensure zero leakage of `SUPABASE_SERVICE_ROLE_KEY` or `DIRECT_URL`.

---

## 7. Deployment Readiness & Zero-Downtime Strategy

- **Hosting Platform**: Vercel Serverless Architecture (Node.js 20+ runtime).
- **Build Verification**: Every production deployment must pass `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` prior to artifact promotion.
- **Atomic Cutover**: Production traffic cutover occurs atomically upon successful container health checks (`/api/health` returning HTTP 200).

---

## 8. Database Readiness & Runtime Security

### 8.1 Connection Pooling & Sizing
- Production runtime queries must connect via Supabase Connection Pooler (`DATABASE_URL`, transaction mode).
- Prisma client pool size configured to avoid connection exhaustion under concurrent staff operations (`connection_limit` bounded to pooler capacity).

### 8.2 Migration Safety & Schema Freeze
- Schema is 100% frozen. No unapplied migrations may exist.
- Database recovery and maintenance rely on safe migration procedures, verified backups, restore capability, and integrity verification.
- In the event of an emergency schema hotfix during pilot:
  - Migrations must be strictly backward-compatible.
  - Destructive schema operations (`DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN TYPE`) are strictly prohibited during pilot operations.
  - Any hotfix migration must be validated on staging prior to production execution.

### 8.3 RLS & Tenant Boundary Enforcement
- PostgreSQL Row-Level Security (RLS) is enabled and enforced with `FORCE ROW LEVEL SECURITY` on all tenant-aware tables:
  - `candidates`, `candidate_experiences`, `candidate_educations`, `candidate_skills`, `candidate_projects`, `candidate_certifications`, `candidate_documents`
  - `jobs`, `applications`, `application_materials`, `application_submissions`, `application_state_history`, `application_qa_reviews`
  - `tasks`, `task_checklist_items`, `task_state_history`
  - `conversations`, `messages`, `internal_notes`, `notifications`
  - `privacy_requests`, `audit_events`, `memberships`
- Runtime query execution mandates injection of the authenticated user UUID via `withRlsContext(userId)` setting `request.jwt.claim.sub` in transaction-local storage.

---

## 9. Authentication Readiness

- **Provider**: Supabase Auth (Email + Password).
- **Session Management**: Secure, HTTP-only, SameSite=Lax authentication cookies managed via `@supabase/ssr`.
- **Brute-Force & Rate Limiting**: Production Supabase Auth rate-limiting enabled for login, password reset, and registration endpoints.
- **Access Termination on Deactivation**: Production deactivation of a user or membership must prevent further authorized operational access. Session invalidation behavior must be verified against the existing authentication and session architecture without introducing unverified architectural assumptions.

---

## 10. Authorization & Role-Based Access Control (RBAC)

Three authoritative roles govern all operations:
1. **ADMIN**: Full operational and governance authority within the organization (user invites, role management, privacy request verification and execution, assignment, audit inspection).
2. **EMPLOYEE**: Operational specialist authority within the organization (candidate management, document upload/view, job creation, application staging, task execution, QA review, manual submission, internal notes).
3. **CANDIDATE**: Self-service portal access restricted strictly to own profile, own uploaded documents, own applications, explicit candidate approvals, candidate-facing messages, and privacy requests.

**Core Invariant**: Roles and memberships are strictly organization-scoped. Cross-tenant access is prohibited and mathematically impossible under RLS.

---

## 11. Storage Readiness & Document Security

- **Authoritative Provider**: **Supabase Storage** (No S3 SDK, no external object storage).
- **Storage Buckets**:
  1. `candidate-documents`: Private bucket storing candidate resumes, cover letters, transcripts, and certifications.
  2. `submission-evidence`: Private bucket storing staff-uploaded submission confirmation screenshots and confirmation PDFs.
- **Bucket Security**:
  - Public access is disabled (`public = false`).
  - Access is exclusively mediated via server-authorized, short-lived signed URLs with an appropriate expiration. [Exact signed URL TTL duration: HUMAN / SECURITY DECISION REQUIRED if a specific threshold is desired].
  - Storage paths are deterministic and tenant-isolated:
    - Candidate docs: `tenants/{orgId}/candidates/{candidateId}/documents/{docId}-v{version}-{filename}`
    - Submission evidence: `tenants/{orgId}/applications/{appId}/submissions/{submissionId}-{filename}`
  - Arbitrary client-provided storage paths are rejected.

---

## 12. Email & Notification Readiness

- **Provider**: Production Gmail SMTP via Nodemailer.
- **Authentication**: Dedicated production Google Workspace account with 2-Factor Authentication and App Password.
- **Delivery Invariants**:
  - Email failures must be caught gracefully and logged via `logSystemAuditEvent`; transient email errors must never roll back database transactions.
  - Notifications are created in PostgreSQL before email dispatch is attempted.
  - Candidate notifications only contain candidate-appropriate information (no internal notes or staff commentary).

---

## 13. Security Readiness Verification Matrix

| Security Domain | Requirement | Verification Method | Pilot Gate Status |
|---|---|---|---|
| Tenant Isolation | Zero cross-tenant data leakage across all tables | Automated RLS recursion & cross-tenant test suites | MANDATORY PASS |
| Candidate Boundary | Candidate cannot access internal notes, staff assignments, QA commentary, or employee tools | Automated client-boundary security tests | MANDATORY PASS |
| Actor Attribution | `submittedById`, `uploadedBy`, `createdById`, `changedById` derived from server context | Server action inspection & unit tests | MANDATORY PASS |
| Submission Immutability | `ApplicationSubmission` records are append-only; historical attempts cannot be updated or deleted | PostgreSQL triggers/RLS & integration tests | MANDATORY PASS |
| Secret Protection | Zero service keys or database credentials in client JS bundles | Next.js build bundle static scan | MANDATORY PASS |
| Input Validation | All server actions enforce Zod schema validation | Schema test coverage across all domain modules | MANDATORY PASS |

---

## 14. Privacy Readiness & Candidate Rights Governance

Phase 10 adheres to the Phase 8 Admin-Assisted Privacy Governance Model:
1. **Candidate Consent**:
   - Explicit consent recorded at registration (`consentToApply: true`, `consentTimestamp`).
   - Candidate may revoke consent at any time from their portal.
   - Upon Consent Revocation: Every application for the candidate not already externally submitted transitions to `WITHDRAWN`, applicable open tasks are canceled, and further external submission is strictly prohibited.
   - Candidate lifecycle status does NOT automatically change merely because consent is revoked. Already-submitted applications remain preserved as historical records.
2. **Privacy Requests**:
   - Candidates initiate requests (`DATA_EXPORT`, `DATA_CORRECTION`, `DATA_DELETION`) via `/candidate/privacy`.
   - Admin must verify candidate identity prior to executing requests.
   - Data Export generates a comprehensive, structured JSON dossier of all candidate-provided facts, applications, documents, and communications.
   - Deletion handling executes in accordance with the accepted Phase 8 privacy contract, preserving required historical records, immutable submission evidence, and audit integrity. (No deletion fields, anonymization algorithms, or purge rules are invented).

*Note on Retention Periods*: [HUMAN / LEGAL DECISION REQUIRED — Specific statutory data retention windows and legal purge rules must be approved by legal counsel prior to implementation].

---

## 15. Data Protection & Security Controls

- **In-Transit**: All web, database, and storage network communication must enforce secure encrypted transport meeting the approved security controls of the existing production infrastructure (HTTPS / SSL `sslmode=require`).
- **At-Rest**: Database tables and Supabase Storage buckets must enforce encryption at rest as provided by the underlying production infrastructure.
- **Data Minimization**: Staff collect only candidate facts necessary for job applications (no SSN, credit cards, or sensitive personal data).

---

## 16. Backup, Restore, & Disaster Recovery

### 16.1 Backup Policy
- **Automated Daily Backups**: Full PostgreSQL physical backups executed daily by Supabase infrastructure with Point-in-Time Recovery (PITR) enabled.
- **Pre-Pilot Logical Snapshot**: Complete logical dump (`pg_dump`) executed and archived in secure cold storage prior to pilot cohort onboarding.

### 16.2 Restore Verification
- **Principle**: *An untested backup is not a verified backup.*
- **Restore Drill**: Prior to pilot launch, a complete restore drill must be executed on a staging instance, verifying schema integrity, RLS policy persistence, and data consistency.

### 16.3 Recovery Objectives
- **RPO target**: [HUMAN / OPERATIONAL DECISION REQUIRED]
- **RTO target**: [HUMAN / OPERATIONAL DECISION REQUIRED]
- *Requirement*: Backup and restore capabilities must be verified through execution drills, but formal numerical recovery targets are subject to operational authorization.

---

## 17. Rollback Strategy

1. **Application Code Rollback**: Application rollback capability must be available and verified through Vercel deployment rollback to a previous verified production build artifact. [Maximum rollback duration: HUMAN / OPERATIONAL DECISION REQUIRED].
2. **Database Recovery**: Database recovery follows safe migration procedures, verified backups, point-in-time restore, integrity verification, and controlled recovery. (Do not assume every migration has a reversible rollback SQL script).
3. **Emergency State Correction**: Authorized Admin execution of state transition corrections via audited administrative tools.

---

## 18. Observability & Audit Stream Monitoring

- **Structured Logging**: Application events logged in structured JSON format with `timestamp`, `level`, `action`, `userId`, `organizationId`, and `context`.
- **Authoritative Audit Log**: Immutable `public.audit_events` (`AuditEvent`) records the authoritative operational and governance audit events established by the accepted Phase 1–9 contracts (including authentication, candidate consent, employee lifecycle changes, application state transitions where specified, submission recordings, and privacy request execution). Phase 10 verifies the audit events already required by accepted contracts and does not invent new audit requirements.
- **Failure Visibility**: Production must provide sufficient operational visibility into critical application, database, authentication, storage, email, and submission failures. Specific tooling, aggregation mechanisms, or external vendors remain subject to separate approval.

---

## 19. Incident Response Protocol

### 19.1 Severity Classifications

| Severity | Definition | Examples | Target Response | Target Resolution |
|---|---|---|---|---|
| **CRITICAL (P0)** | Active security breach, data loss, tenant isolation breach, or platform outage. | Cross-tenant data leak, unauthorized submission, consent bypass, database corruption. | Immediate (< 15 min) | < 2 hours |
| **HIGH (P1)** | Major operational blocker affecting core application workflows. | Storage signed URL failures, email delivery outage, QA gate blocking all applications. | < 30 min | < 6 hours |
| **MEDIUM (P2)** | Non-blocking operational defect with available workaround. | UI display formatting glitch, task checklist filtering issue, non-critical notification delay. | < 2 hours | < 24 hours |
| **LOW (P3)** | Minor cosmetic or usability issue. | Minor copy inconsistency, table alignment issue. | < 8 hours | Next scheduled release |

### 19.2 Incident Lifecycle
`Detection` → `Containment (Emergency Stop if P0)` → `Investigation` → `Remediation` → `Verification` → `Post-Mortem & Closure`.

---

## 20. Operational Support & Roles

- **Incident Commander / Pilot Lead**: [HUMAN DECISION REQUIRED — Designated lead responsible for operational decisions].
- **Lead Operations Specialist**: Responsible for queue operations and staff assignments.
- **Technical Custodian**: Responsible for database, storage, and deployment infrastructure monitoring.

---

## 21. Employee Standard Operating Procedure (SOP)

1. **Candidate Onboarding & Fact Verification**:
   - Review registered candidate career profile facts on `/employee/candidates/[id]`.
   - Inspect uploaded candidate documents (Resumes, Cover Letters) in Candidate Documents.
   - Verify candidate information and record verification status (`VERIFIED`).
2. **Job Opportunity Setup**:
   - Create or verify open job opportunity on `/employee/jobs`.
3. **Application Staging & Preparation**:
   - Create Managed Application on `/employee/applications`.
   - Advance application through `DISCOVERED` → `QUALIFIED` → `PREPARING`.
   - Select candidate resume version and draft tailored cover letter text.
   - Execute linked preparation checklist tasks.
4. **QA Review Gate**:
   - Submit application for QA review (`PREPARING` → `REVIEW`).
   - QA reviewer audits 9 mandatory QA criteria and records `PASS` (or `FAIL` with required notes).
5. **Candidate Approval Gate**:
   - Once QA is passed, application enters `AWAITING_APPROVAL`.
   - Application is locked until candidate reviews and approves package in portal.
6. **Manual External Submission Execution**:
   - Once candidate approves, application enters `READY`.
   - Staff opens external job posting URL and manually completes application on employer portal.
   - Staff captures confirmation ID, confirmation email text, and optional confirmation screenshot.
   - Staff records submission in OOS (`READY` → `SUBMITTED`), attaching confirmation evidence.
7. **Defect & Correction Handling**:
   - If an employer flags an issue or reapplication is required, record submission defect (`SUBMITTED` → `SUBMISSION_ISSUE`).
   - Follow correction review gate (`REVIEW_REQUIRED` → `CORRECTION_APPROVED` → `RESUBMISSION` → `SUBMITTED`).

---

## 22. Candidate Standard Operating Procedure (SOP)

1. **Registration & Profile Setup**:
   - Register account and grant explicit consent to apply.
   - Complete Canonical Career Profile (Contact, Headline, Summary, Skills, Experience, Education, Projects, Certifications).
   - Upload canonical resume document.
2. **Review & Approval**:
   - Receive notification when application package is staged (`AWAITING_APPROVAL`).
   - Review tailored resume version, cover letter, and job details in `/candidate/applications/[id]`.
   - Click `Approve Application` to authorize submission (or `Request Revision`).
3. **Submission Tracking**:
   - View confirmed submission status (`SUBMITTED`) and submission timestamp in portal.
4. **Communication & Privacy**:
   - Message operational staff transparently via `/candidate/messages`.
   - Manage consent or submit privacy requests via `/candidate/privacy`.

---

## 23. Manual Job & Application Operating Procedure

- **Manual External Submission**: Staff manually navigate to the employer portal and manually input candidate materials.
- **Truthful Representation**: Only candidate-verified facts and approved materials may be submitted.
- **Zero Fabrication**: Staff are strictly prohibited from modifying candidate dates, degrees, company names, or claiming unverified skills.

---

## 24. Submission Evidence Handling

- **Evidence Types**: Text confirmation code, application reference number, confirmation email snippet, confirmation screen image (PNG/JPG), confirmation PDF.
- **Storage Location**: Uploaded exclusively to private `submission-evidence` Supabase Storage bucket.
- **Access**: Strictly restricted to authorized staff and administrators. Invisible to candidate roles.

---

## 25. Pilot Entry Gates (Mandatory Binary Verification)

Before the pilot begins, all 10 entry gates must achieve an explicit **PASS**:

```
[ GATE 1: Environment & Secrets ]        PASS / FAIL — All secrets configured; zero client leaks.
[ GATE 2: Database & RLS ]               PASS / FAIL — Multi-tenant RLS active; FORCE RLS verified.
[ GATE 3: Supabase Storage ]             PASS / FAIL — Private buckets active; signed URLs verified.
[ GATE 4: Gmail SMTP Delivery ]          PASS / FAIL — SMTP credentials verified; test delivery verified.
[ GATE 5: Golden-Path Suite ]            PASS / FAIL — Complete 66 test suites (348 tests) passing.
[ GATE 6: Backup & Restore Drill ]       PASS / FAIL — PITR enabled; staging restore drill verified.
[ GATE 7: Rollback Verification ]        PASS / FAIL — Vercel atomic rollback procedure verified.
[ GATE 8: Security & Privacy Suite ]     PASS / FAIL — Consent revocation & boundary tests passing.
[ GATE 9: Staff SOP Training ]           PASS / FAIL — Operational staff trained on manual submission SOP.
[ GATE 10: Pilot Cohort Identified ]     PASS / FAIL — Candidate cohort enrolled with active consent.
```

---

## 26. Pilot Golden Path Operational Flow

```
[Candidate Registration + Consent]
                ↓
[Canonical Profile + Resume Upload]
                ↓
[Employee Assignment & Verification]
                ↓
[Job Creation & Managed Application] (DISCOVERED)
                ↓
[Application Qualification] (QUALIFIED)
                ↓
[Materials Preparation & Tasks] (PREPARING)
                ↓
[Internal QA Review — 9 Criteria] (REVIEW)
                ↓
[Candidate Portal Sign-Off] (AWAITING_APPROVAL)
                ↓
[Internal Gates Complete] (READY)
                ↓
[Manual External Submission on Employer Site]
                ↓
[Record Submission + Upload Evidence] (SUBMITTED)
                ↓
[Candidate Notification & Traceable Audit Log]
```

---

## 27. Pilot Monitoring Protocol

- **Operational Queue Visibility**: Staff and managers utilize `/employee/applications` derived queue metrics (Total Queue, Ready to Submit, In Review / QA, Awaiting Approval, Submitted) for operational tracking. [Monitoring frequency and operational review cadence: HUMAN / OPERATIONAL DECISION REQUIRED].
- **Submission Evidence Inspection**: Verification of recorded submission attempts and attached confirmation evidence in accordance with operational procedures. [Review sample size / cadence: HUMAN / OPERATIONAL DECISION REQUIRED].
- **Audit Log Inspection**: Inspection of the `public.audit_events` stream for security anomalies, access violations, or unauthorized actions.

---

## 28. Pilot Success Measurements (Factual Operational Observations)

Operational success will be evaluated against factual measurements:
1. **Onboarding & Verification Rate**: Percentage of pilot candidates completing profile and achieving `VERIFIED` status.
2. **QA First-Pass Rate**: Percentage of applications passing 9-criterion QA review without rejection.
3. **Candidate Approval Latency**: Time elapsed from `AWAITING_APPROVAL` to candidate sign-off.
4. **Submission Execution Latency**: Time elapsed from `READY` to manual external submission recording.
5. **Evidence Completeness Rate**: Percentage of `SUBMITTED` applications containing valid external reference IDs and confirmation evidence files.
6. **Submission Issue Rate**: Percentage of submitted applications flagging defects (`SUBMISSION_ISSUE`).
7. **System Error Rate**: Total count of uncaught application or database errors.
8. **Security / RLS Breach Count**: Must be exactly **ZERO (0)**.

*Target Thresholds*: [HUMAN DECISION REQUIRED — Specific numerical thresholds (e.g. >95% evidence rate) to be established by leadership].

---

## 29. Mandatory Pilot Stop Conditions

The pilot must be immediately paused under any of the following objective conditions:
1. **Tenant Isolation Breach**: Any instance of candidate or application data visible across organizations.
2. **Candidate Boundary Breach**: Any candidate accessing internal staff notes, employee queues, or staff evidence.
3. **Consent Violation**: Any unsubmitted application progressing toward external submission after consent has been revoked, or any external submission executed without active consent. (Historical records remain preserved).
4. **Unauthorized / Untracked Submission**: An application submitted externally without candidate approval or without recording in OOS.
5. **Audit Log Failure**: Failure of audit event emission during state transitions or submissions.
6. **Irreversible Data Corruption**: Database or storage inconsistency preventing normal application progression.
7. **Authentication Compromise**: Any credential or token exposure.

---

## 30. Emergency Stop & Resumption Procedure

```
[EMERGENCY STOP TRIGGERED]
          ↓
[1. Lock Operational Submissions] → Transition applications in READY to PREPARING / hold state.
          ↓
[2. Preserve System State]        → Capture database snapshot and audit log dump.
          ↓
[3. Isolate & Contain]            → Revoke affected credentials / isolate affected records.
          ↓
[4. Root-Cause Investigation]     → Technical and operational review of failure cause.
          ↓
[5. Remediation & Verification]   → Execute hotfix on staging; verify regression test suite.
          ↓
[6. Human Authorization]          → Formal sign-off from Pilot Lead and Technical Custodian.
          ↓
[7. Controlled Resumption]        → Unfreeze operational queues. (NEVER AUTOMATIC).
```

---

## 31. Pilot Validation

### 31.1 Validation Triggers
The formal Pilot Validation Review is triggered upon the **earliest** of:
1. Reaching approximately **30 real candidates** processed through the OOS.
2. Reaching approximately **100 real applications** submitted externally through the OOS.
3. **6 weeks** after the production pilot officially commences.

### 31.2 Governance & Review Timeline
- **Owner**: Operations Manager / designated OOS Product Owner.
- **Review Window**: The comprehensive pilot validation review must be conducted within **5 business days** of reaching a trigger.
- **Evaluation Inputs**:
  - **Factual Measurements**: Total applications submitted, average turnaround time, QA pass rate, defect count, audit log record counts, error logs.
  - **Operational Qualitative Feedback**: Staff usability feedback, candidate communication sentiment, manual friction points.
  - **Security & Compliance Audit**: Formal verification of zero RLS leaks, 100% consent adherence, and complete submission traceability.

---

## 32. Pilot Exit Decision

Upon conclusion of the Pilot Validation Review, the designated Product Owner must select exactly one of the three authoritative V1 decisions:
1. **CONTINUE V1**: Maintain current operational model and parameters without material changes.
2. **APPROVE V1.1**: Advance from pilot to authorized production scaling, incorporating scheduled enhancements into the next iteration specification.
3. **REWORK V1**: Return to hardening/remediation to resolve identified operational, usability, or procedural blockers prior to scaling.

---

## 33. Production Definition of Done

Phase 10 is complete when and only when:
1. Phase 10 Specification is approved by human leadership.
2. All 10 Production Entry Gates achieve verified **PASS** status.
3. Production environment, secrets, Supabase Storage, and Gmail SMTP are verified.
4. Pilot cohort completes operational lifecycle without triggering stop conditions.
5. Factual measurement report compiled and reviewed.
6. Formal human acceptance granted.

---

## 34. Open Human Decisions

The following parameters are explicitly reserved for human leadership and must not be inferred:
1. **Maximum Pilot Candidates**: [HUMAN DECISION REQUIRED — e.g. 10, 25, 50]
2. **Maximum Operational Employees**: [HUMAN DECISION REQUIRED — e.g. 2, 5, 10]
3. **Pilot Operating Duration**: [HUMAN DECISION REQUIRED — e.g. 14 days, 30 days]
4. **Application Volume Cap**: [HUMAN DECISION REQUIRED — e.g. 50 total applications]
5. **Designated Pilot Lead & Incident Commander**: [HUMAN DECISION REQUIRED]
6. **Numerical Success Target Thresholds**: [HUMAN DECISION REQUIRED]
7. **Statutory / Legal Data Retention Windows & Purge Rules**: [HUMAN / LEGAL DECISION REQUIRED]
8. **Recovery Point Objective (RPO) Target**: [HUMAN / OPERATIONAL DECISION REQUIRED]
9. **Recovery Time Objective (RTO) Target**: [HUMAN / OPERATIONAL DECISION REQUIRED]
10. **Application Rollback Maximum Target Duration**: [HUMAN / OPERATIONAL DECISION REQUIRED]
11. **Storage Signed URL Exact Expiration TTL**: [HUMAN / SECURITY DECISION REQUIRED]
12. **Operational Queue Monitoring & Evidence Audit Cadence**: [HUMAN / OPERATIONAL DECISION REQUIRED]

---

## 35. Governance & Change Control

- This document represents the binding engineering specification for Phase 10.
- No code implementation, infrastructure deployment, or database changes may occur until this document achieves formal human approval.
- Any modification to this specification requires a version increment and re-submission for approval.

---

## 36. Explicit Phase 1–9 Preservation

- **Phase 1 (Identity & RBAC)**: UNCHANGED & FROZEN
- **Phase 2 (Candidate Core)**: UNCHANGED & FROZEN
- **Phase 3 (Application Core)**: UNCHANGED & FROZEN
- **Phase 4 (Task & Preparation Core)**: UNCHANGED & FROZEN
- **Phase 5 (QA & Candidate Approval)**: UNCHANGED & FROZEN
- **Phase 6 (Submission & Evidence Core)**: UNCHANGED & FROZEN
- **Phase 7 (Communication & Notifications)**: UNCHANGED & FROZEN
- **Phase 8 (Admin & Privacy Governance)**: UNCHANGED & FROZEN
- **Phase 9 (Golden-Path Verification)**: UNCHANGED & FROZEN
- **Post-Phase-9 Operational Hardening**: UNCHANGED & FROZEN

---

## 37. Final Phase 10 Boundary

```
================================================================================
PHASE 10 SPECIFICATION STATUS:
ACCEPTED — FROZEN

IMPLEMENTATION STATUS:
IMPLEMENTED — VERIFIED — ACCEPTED

DEPLOYMENT & PILOT STATUS:
BLOCKED PENDING HUMAN OPERATIONAL GATES & PILOT LAUNCH AUTHORIZATION
================================================================================
```
