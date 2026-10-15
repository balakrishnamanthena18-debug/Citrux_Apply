# OOS CRM — Phase 00: Forensic Audit & Capability Gap Analysis

> **Status:** PROPOSED — READ-ONLY CAPABILITY AUDIT  
> **Document Version:** 1.0.0  
> **Classification:** Architecture, Security & Domain Governance  
> **Target Subsystem:** Operations Operating System (OOS) — Lead & CRM Domain  
> **Date:** 2026-10-15  
> **Author:** Antigravity AI (Pair Programming with Engineering Leadership)  

---

## 1. Executive Summary & Context

The Operations Operating System (OOS) is the company's authoritative operational system of record. As established in the authoritative product vision ([`docs/00_PRODUCT_VISION.md`](file:///Users/balakrishna/apply_citrux/docs/00_PRODUCT_VISION.md)) and the commercial operational gap review ([`docs/engineering/PHASE_10A_OOS_BUSINESS_VALUE_OPERATIONAL_GAP_FORENSIC_AUDIT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_10A_OOS_BUSINESS_VALUE_OPERATIONAL_GAP_FORENSIC_AUDIT.md)), OOS excels at the internal candidate delivery lifecycle:
- Candidate onboarding and career profiling (Phase 1, 2, 7C)
- Job sourcing, application preparation, and QA gating (Phase 3, 4, 5)
- Application submission proof and external outcome tracking (Phase 6, 6C)
- Multi-round interview preparation and debriefs (Phase 8)
- Offer structuring, counter-offer negotiation, joining verification, and placement proof (Phase 9 OPOS)
- Commercial accounts, service contracts, retainer billing, and revenue attribution (Phase 10 CBOS)
- Specialist capacity management, queue dispatch, and SLA enforcement (Phase 10H WCOS)

However, **Step [1] of the business operating chain — Lead Ingestion, Qualification, and Sales Pipeline Management — currently lives completely outside OOS**:

```
[1] Lead Ingestion & Qualification          ──► ❌ OUTSIDE OOS (Marketing / Typeform / Spreadsheets)
    ↓
[2] Customer Agreement & Service Plan       ──► ✅ IMPLEMENTED (CBOS: CustomerAccount & ServiceContract)
    ↓
[3] Upfront Retainer / Subscription Payment ──► ✅ IMPLEMENTED (CBOS: Invoice & Payment Ledger)
    ↓
[4] Candidate Onboarding & Identity         ──► ✅ IMPLEMENTED (OOS: User, Candidate & Membership)
    ↓
[5] Career Operations, QA, Placements       ──► ✅ IMPLEMENTED (WCOS & OPOS)
```

The objective of **Phase 00** is to perform a forensic audit of the existing codebase to determine the exact architectural boundary, data model scope, security constraints, and integration contracts required to introduce a native **Lead & CRM Domain** into OOS without corrupting existing domain invariants.

> [!IMPORTANT]
> **READ-ONLY MANDATE**: This audit introduces zero database schema changes, zero migrations, zero modified domain contracts, and zero mock production records. All conclusions are derived strictly from active repository evidence.

---

## 2. Repository Forensic Inspection Findings

### 2.1 Candidate Domain & Candidate 360
- **Database Schema ([`prisma/schema.prisma:694-750`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L694-L750)):**  
  The `Candidate` model represents an active, authenticated individual undergoing career operations. It has mandatory 1:1 binding to `User` (`userId String @unique @db.Uuid`), foreign keys to `Organization`, and child relations for `experiences`, `educations`, `skills`, `projects`, `certifications`, and `documents`.
- **Candidate 360 Aggregation ([`src/lib/candidate-360/service.ts`](file:///Users/balakrishna/apply_citrux/src/lib/candidate-360/service.ts)):**  
  `getCandidate360(candidateId, ctx)` aggregates career intelligence, resume ATS scoring, job application readiness, match opportunities, and placement outcomes into a read-only composite DTO (`Candidate360DTO`).
- **Domain Invariant:**  
  A Candidate is **not** a sales prospect. Candidates possess authenticated portal access, career attestations, and active specialist assignments. Prospective leads must not be modeled as `Candidate` records.

### 2.2 Candidate Onboarding & Account Invitations
- **Server Action ([`src/lib/candidate/actions.ts:104-260`](file:///Users/balakrishna/apply_citrux/src/lib/candidate/actions.ts#L104-L260)):**  
  `createCandidateAction(input)` executes an atomic multi-step sequence:
  1. Calls Supabase Auth Admin API (`supabaseAdmin.auth.admin.createUser`) to create an authenticated identity.
  2. Generates an optional cryptographic single-use invitation token (`StaffActivationToken`).
  3. Inserts into public `users` table (`User.email` is globally unique: `email String @unique @db.VarChar(255)`).
  4. Inserts into `candidates` and `memberships` tables with `Role.CANDIDATE`.
  5. Dispatches candidate welcome/activation emails via [`src/lib/email`](file:///Users/balakrishna/apply_citrux/src/lib/email/index.ts).
- **Forensic Gap for Leads:**  
  If unverified inbound website inquiries, marketing leads, or cold prospects were ingested through `createCandidateAction`, every spam submission or inquiry would pollute Supabase Auth and the canonical `users` table. Inbound leads must be held in an unauthenticated, isolated lead table until qualified.

### 2.3 Website / Contact Enquiries & Lead-like Records
- **Public Surface Inspection:**  
  - The root page ([`src/app/page.tsx`](file:///Users/balakrishna/apply_citrux/src/app/page.tsx)) is an internal placeholder card.
  - Route handlers in [`src/app/api`](file:///Users/balakrishna/apply_citrux/src/app/api) only include `/auth/callback`, `/health`, `/notifications`, and cron jobs (`/cron/intelligence-worker`, `/cron/rate-limit-cleanup`).
  - There are **zero public contact forms, inquiry capture endpoints, or webhook handlers**.
- **Data Model Inspection:**  
  - No tables exist for `Lead`, `Inquiry`, `Prospect`, `ContactSubmission`, or `Campaign`.
  - The only appearance of "lead" in Prisma schema is `JobVisibility.CANDIDATE_PRIVATE` ("candidate-specific job lead") and `isTeamLead` on `Membership`.
- **Finding:**  
  Public enquiry ingestion and lead storage is currently a **100% gap** in OOS. External marketing traffic on `careerbutton.in` operates disconnected from OOS.

### 2.4 Applications & Application Operations
- **Models & Services ([`prisma/schema.prisma:983-1131`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L983-L1131), [`src/lib/application/service.ts`](file:///Users/balakrishna/apply_citrux/src/lib/application/service.ts)):**  
  The `Application` aggregate models the lifecycle of submitting a candidate to an employer job opening (`ApplicationStatus`: `DISCOVERED` -> `QUALIFIED` -> `PREPARING` -> `REVIEW` -> `AWAITING_APPROVAL` -> `READY` -> `SUBMITTED` -> `SUBMISSION_ISSUE` -> `RESUBMISSION` -> `REJECTED` / `WITHDRAWN`).
- **Domain Invariant:**  
  Job applications are employer-facing operational work products. CRM deals with prospective customer acquisition. Job applications must never be reused or conflated with sales lead qualification.

### 2.5 Messages, Activities, Follow-ups, and Reminders
- **Conversations & Messages ([`prisma/schema.prisma:1318-1354`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1318-L1354)):**  
  `Conversation` strictly enforces a non-nullable candidate link (`candidateId String @map("candidate_id") @db.Uuid`). It powers internal portal messaging between candidates and staff. It cannot attach to anonymous leads or unverified prospects.
- **Internal Notes ([`prisma/schema.prisma:1356-1377`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1356-L1377)):**  
  `InternalNote` has nullable foreign keys to `candidateId`, `applicationId`, and `taskId`. It does not support a `leadId`.
- **Sales Activities & Reminders:**  
  There is **zero existing capability** for logging sales calls, discovery notes, qualification checklists, follow-up reminders, or deal stage timelines for prospects.

### 2.6 WCOS Tasks & Work Items
- **Models ([`prisma/schema.prisma:1155-1208`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1155-L1208), [`3183-3220`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L3183-L3220)):**  
  `Task` has an enum `TaskCategory` (`CANDIDATE`, `JOB`, `APPLICATION`, `QA`, `OPERATIONAL`) and 20 discrete `TaskType` values designed for delivery work (`COMPLETE_PROFILE`, `PREPARE_RESUME`, `APPLICATION_QA`, etc.).
- **Work Items & Capacity:**  
  WCOS work items (`WcosWorkItem`) calculate Capacity Units (CU), SLA breach limits, and dispatch scores to assign delivery work to career specialists.
- **Boundary Decision:**  
  Sales follow-ups (e.g. "Call prospect back tomorrow at 2 PM") must not distort delivery capacity metrics or trigger automated WCOS specialist dispatch algorithms unless explicitly modeled as sales-demand queues. Sales tasks require a lighter, dedicated follow-up schedule model.

### 2.7 OPOS Offers & Placements
- **Models ([`prisma/schema.prisma:2112-2363`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2112-L2363)):**  
  OPOS is authoritative for candidate employment offers, counter-offer negotiations, first-day joining attendance, and 2-factor placement verification.
- **Boundary Decision:**  
  OPOS operates downstream of candidate service delivery. CRM does not touch OPOS directly.

### 2.8 CBOS Customer Accounts, Contracts, and Billing Ledger
- **Models ([`prisma/schema.prisma:2546-2810`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2546-L2810)):**  
  CBOS governs `CustomerAccount` (`CustomerType`: `INDIVIDUAL_CANDIDATE`, `INDIVIDUAL_SPONSOR`, `CORPORATE_CLIENT`, `STAFFING_AGENCY`), `CustomerCandidateRelationship`, `ServiceContract`, `PricingTerm`, `Invoice`, and `Payment`.
- **Conversion Hand-off Point:**  
  When a sales lead is marked `CONVERTED`, the lead transitions into CBOS by creating or linking a `CustomerAccount` and generating a `ServiceContract` with agreed service entitlements. CBOS remains authoritative for all commercial and billing transactions.

### 2.9 Organization Scoping, RBAC, Audit Events & Notifications
- **Tenant Isolation ([`src/lib/db/rls.ts`](file:///Users/balakrishna/apply_citrux/src/lib/db/rls.ts)):**  
  PostgreSQL `FORCE ROW LEVEL SECURITY` with `withRlsContext(userId, tx)` injecting `request.jwt.claim.sub`. All tables require strict `organization_id` foreign keys and tenant isolation policies.
- **RBAC ([`src/lib/auth/context.ts`](file:///Users/balakrishna/apply_citrux/src/lib/auth/context.ts)):**  
  Roles are currently restricted to `enum Role { CANDIDATE, EMPLOYEE, ADMIN }`. Staff specializations are represented via `Designation` (`designations` table) and `team`/`department` columns on `Membership`.
- **Audit System ([`src/lib/audit/catalog.ts`](file:///Users/balakrishna/apply_citrux/src/lib/audit/catalog.ts)):**  
  The system enforces 77 `AuditAction` enum items across 9 operational categories. **There are currently zero CRM audit actions in the catalog.**
- **Email Infrastructure ([`src/lib/email/index.ts`](file:///Users/balakrishna/apply_citrux/src/lib/email/index.ts)):**  
  `EmailNotificationService` using Nodemailer Gmail SMTP with audit logging to `EmailDeliveryLog` is fully functional and reusable for lead confirmation emails.

---

## 3. Evidence-Based Capability Matrix

| # | Domain / Feature Area | Current Status in OOS | Classification | Authoritative File / Schema / Policy References | Analysis & Reuse Notes |
|---|-----------------------|----------------------|----------------|------------------------------------------------|------------------------|
| **1** | **Tenant Scoping & RLS** | Implemented & Verified | **Existing and Reusable** | [`src/lib/db/rls.ts`](file:///Users/balakrishna/apply_citrux/src/lib/db/rls.ts)<br>[`prisma/schema.prisma:438`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L438)<br>`tests/integration/rls-execution.test.ts` | Multi-tenant session setting `request.jwt.claim.sub` and `is_org_member(org_id)` RLS policies can be directly applied to all CRM tables. |
| **2** | **Audit Logging Framework** | Implemented & Verified | **Existing and Reusable** | [`src/lib/audit/index.ts`](file:///Users/balakrishna/apply_citrux/src/lib/audit/index.ts)<br>[`src/lib/audit/catalog.ts`](file:///Users/balakrishna/apply_citrux/src/lib/audit/catalog.ts)<br>[`prisma/schema.prisma:1133`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1133) | `logUserAuditEvent` and `AuditEvent` table are append-only. Only requires adding new `AuditAction` enum values for CRM operations. |
| **3** | **Email Notification Service** | Implemented & Verified | **Existing and Reusable** | [`src/lib/email/index.ts`](file:///Users/balakrishna/apply_citrux/src/lib/email/index.ts)<br>[`prisma/schema.prisma:1399`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1399)<br>`tests/unit/email-provider.test.ts` | Nodemailer SMTP adapter and `EmailDeliveryLog` table can be reused for sales auto-responders and intake confirmations. |
| **4** | **Shared Workbench UI Design System** | Implemented & Verified | **Existing and Reusable** | [`src/components/workbench/`](file:///Users/balakrishna/apply_citrux/src/components/workbench/)<br>[`src/components/ui/MetricStrip.tsx`](file:///Users/balakrishna/apply_citrux/src/components/ui/MetricStrip.tsx)<br>[`src/components/ui/HelpTooltip.tsx`](file:///Users/balakrishna/apply_citrux/src/components/ui/HelpTooltip.tsx) | `WorkbenchShell`, `InstantSearch`, `InstantTabs`, `InstantFilterBar`, `TablePagination`, and `MetricStrip` provide ready-to-use UX foundation. |
| **5** | **Staff Designation & Org Roster** | Implemented & Verified | **Existing and Reusable** | [`prisma/schema.prisma:658-674`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L658-L674)<br>[`src/lib/admin/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/admin/actions.ts)<br>`tests/integration/designation-management.test.ts` | Staff assignments for sales reps, intake coordinators, and admissions advisors can reuse the `Designation` and `Membership` models. |
| **6** | **CBOS Customer Accounts & Contracts** | Implemented & Verified | **Existing and Reusable** | [`prisma/schema.prisma:2546-2639`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2546-L2639)<br>[`src/lib/cbos/cbos-service.ts`](file:///Users/balakrishna/apply_citrux/src/lib/cbos/cbos-service.ts)<br>`tests/integration/phase10e-cbos-service.test.ts` | Reusable as the authoritative destination when a Lead converts into a paying customer with a service contract. |
| **7** | **Candidate 360 & Profiles** | Implemented & Verified | **Existing and Reusable** | [`src/lib/candidate-360/service.ts`](file:///Users/balakrishna/apply_citrux/src/lib/candidate-360/service.ts)<br>[`prisma/schema.prisma:694`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L694)<br>`tests/integration/candidate-profile.test.ts` | Reusable as the authoritative destination when a Lead converts into an onboarded candidate. |
| **8** | **Internal Staff Notes** | Implemented but Constrained | **Existing but Incomplete** | [`prisma/schema.prisma:1356`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1356)<br>[`src/lib/communication/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/communication/actions.ts)<br>`tests/integration/internal-notes-barrier.test.ts` | `InternalNote` only supports `candidateId`, `applicationId`, `taskId`. It lacks a `leadId` column and lacks structured activity types (call, email, meeting). |
| **9** | **In-App Messaging & Conversations** | Implemented but Constrained | **Existing but Incomplete** | [`prisma/schema.prisma:1318`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1318)<br>[`src/lib/communication/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/communication/actions.ts)<br>`tests/integration/communication-isolation.test.ts` | `Conversation` requires a mandatory `candidateId`. It cannot be used for prospects who do not have an authenticated candidate user account. |
| **10** | **App Navigation & Sidebar** | Implemented but Constrained | **Existing but Incomplete** | [`src/components/navigation/AppSidebar.tsx`](file:///Users/balakrishna/apply_citrux/src/components/navigation/AppSidebar.tsx) | Navigation tree supports `WORK`, `OPERATIONS`, `GOVERNANCE`, `ADMINISTRATION`. Contains zero entries for CRM or Leads. |
| **11** | **Candidate Creation / Onboarding** | Implemented but Coupled | **Existing but Incomplete** | [`src/lib/candidate/actions.ts:104`](file:///Users/balakrishna/apply_citrux/src/lib/candidate/actions.ts#L104)<br>[`src/components/candidate/AddCandidateModal.tsx`](file:///Users/balakrishna/apply_citrux/src/components/candidate/AddCandidateModal.tsx) | Strongly couples candidate record creation with Supabase Auth user generation and single-use activation tokens. Not suitable for unverified leads. |
| **12** | **Lead Data Model & Persistence** | Non-existent | **Missing and Required** | None (Prisma schema void) | Required: `Lead` table with status lifecycle, contact info, acquisition channels, qualification scores, and conversion foreign keys. |
| **13** | **Lead Source & Attribution Tracking** | Non-existent | **Missing and Required** | None | Required: Tracking UTM parameters (source, medium, campaign, term, content), referral URLs, and offline channels. |
| **14** | **Sales Pipeline & Stage History** | Non-existent | **Missing and Required** | None | Required: Append-only `LeadStageHistory` tracking transitions between sales stages (`NEW`, `CONTACTED`, `QUALIFYING`, `QUALIFIED`, `CONVERTED`, `DISQUALIFIED`, `LOST`). |
| **15** | **Sales Activity & Follow-up Scheduling** | Non-existent | **Missing and Required** | None | Required: `LeadActivity` model capturing notes, call logs, qualification answers, scheduled follow-up dates, and rep assignments. |
| **16** | **Lead Qualification Framework** | Non-existent | **Missing and Required** | None | Required: Evaluation criteria (budget, timeline, target role, work authorization eligibility, service tier fit) before conversion. |
| **17** | **Lead Conversion Orchestration** | Non-existent | **Missing and Required** | None | Required: Atomic transaction converting a qualified lead into a `CustomerAccount` (CBOS) and/or `Candidate` (Candidate Core) without duplicate auth users. |
| **18** | **CRM Staff Workbench UI** | Non-existent | **Missing and Required** | None | Required: Staff console (`/employee/crm` or `/admin/crm`) with MetricStrip, stage tabs, search/filters, lead detail drawer, and quick follow-up actions. |
| **19** | **Public Lead Ingestion API / Webhook** | Non-existent | **Missing and Required** | None | Required: Rate-limited, validated endpoint (`/api/leads/ingest` or `/api/webhooks/typeform`) with honeypot spam protection. |
| **20** | **CRM Audit Action Enum Additions** | Non-existent | **Missing and Required** | [`src/lib/audit/catalog.ts`](file:///Users/balakrishna/apply_citrux/src/lib/audit/catalog.ts) | Required: New `AuditAction` enum items: `LEAD_CREATED`, `LEAD_STATUS_CHANGED`, `LEAD_ASSIGNED`, `LEAD_QUALIFIED`, `LEAD_CONVERTED`, `LEAD_DISQUALIFIED`, `LEAD_ACTIVITY_LOGGED`. |
| **21** | **Omnichannel Social / WhatsApp Integrations** | Explicitly Deferred | **Not Required for Initial Release** | [`docs/engineering/PHASE_07_COMMUNICATION_SPEC.md:133`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_07_COMMUNICATION_SPEC.md#L133) | Deferred: No WhatsApp, SMS, or telephony dialer integrations. Standard manual activity logging and email are sufficient for V1. |
| **22** | **Automated AI Sales Bots / Auto-Callers** | Explicitly Deferred | **Not Required for Initial Release** | [`docs/engineering/PHASE_8D_OOS_BUSINESS_VALUE_NEXT_DOMAIN_FORENSIC_REVIEW.md:268`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_8D_OOS_BUSINESS_VALUE_NEXT_DOMAIN_FORENSIC_REVIEW.md#L268) | Deferred: Deterministic staff-governed sales qualification is mandated before AI automation. |
| **23** | **Corporate Employer Client CRM Portal** | Explicitly Deferred | **Not Required for Initial Release** | [`docs/engineering/PHASE_8D_OOS_BUSINESS_VALUE_NEXT_DOMAIN_FORENSIC_REVIEW.md:266`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_8D_OOS_BUSINESS_VALUE_NEXT_DOMAIN_FORENSIC_REVIEW.md#L266) | Deferred: OOS is candidate-side operations first. B2B employer client logins remain out of scope for initial CRM release. |

---

## 4. Domain Boundaries & Authoritative Ownership

To prevent architectural entropy, CRM must have strict, unambiguous domain boundaries. It must **orchestrate the top of the funnel** and hand off authority to existing OOS domains as soon as records mature.

```
       ┌────────────────────────────────────────────────────────┐
       │                       CRM DOMAIN                       │
       │  - Inbound Enquiries (Web/Form/Manual/Referral)        │
       │  - Attribution & UTM Tracking                          │
       │  - Lead Qualification & Scoring                        │
       │  - Sales Stage History & Follow-up Scheduling          │
       │  - Sales Notes & Call Logs                             │
       └───────────────────────────┬────────────────────────────┘
                                   │
                     CONVERT LEAD (Hand-off Gate)
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│           CBOS DOMAIN           │         │        CANDIDATE DOMAIN         │
│  - CustomerAccount (Billing)    │         │  - User & Supabase Auth         │
│  - ServiceContract & Tiers      │         │  - Candidate Career Profile     │
│  - ServiceEntitlements          │         │  - Work Authorization & Docs    │
│  - Invoices & Retainers         │         │  - Specialist Assignment        │
└─────────────────────────────────┘         └─────────────────────────────────┘
```

### 4.1 What the CRM Domain Owns
1. **Prospective Leads (`Lead`):** Unauthenticated individuals or prospective sponsors who have expressed interest but have not yet signed a contract or started onboarding.
2. **Attribution & Sources (`LeadSource`):** UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`), referrer domain, landing page path, and ingestion channel (`WEBSITE_FORM`, `TYPEFORM`, `MANUAL_STAFF`, `REFERRAL`, `LINKEDIN`).
3. **Sales Pipeline & Stage Transitions (`LeadStageHistory`):** State progression:
   - `NEW` (Received, untouched)
   - `CONTACTED` (Outreach attempt made)
   - `ENGAGED` (Active discovery discussion)
   - `QUALIFYING` (Assessing budget, timeline, target role, sponsorship)
   - `QUALIFIED` (Approved for enrollment; proposal/agreement presented)
   - `CONVERTED` (Signed agreement; handed off to CBOS & Candidate Core)
   - `DISQUALIFIED` (Unqualified: budget mismatch, ineligible work authorization, bad fit)
   - `LOST` (Went with competitor, unresponsive, declined)
4. **Sales Activities (`LeadActivity`):** Time-stamped records of sales interactions: discovery calls, email exchanges, qualification notes, meeting logs, and objections.
5. **Sales Follow-up Schedules (`LeadFollowUp`):** Scheduled next action date (`nextFollowUpAt`), reminder flag, and assigned sales specialist.
6. **Conversion Orchestration:** Transactional boundary that marks the lead `CONVERTED`, creates the CBOS `CustomerAccount`, links the agreed service plan, and creates the `Candidate` onboarding profile.
7. **CRM Funnel Analytics:** Conversion rates by source/campaign, sales cycle duration, stage velocity, and drop-off analysis.

### 4.2 Authoritative Domain Responsibility Matrix

| Entity / Concern | Authoritative Domain | Permitted CRM Action | Strict Boundary Constraints |
|---|---|---|---|
| **Candidate Profile** | **Candidate Core** ([`src/lib/candidate`](file:///Users/balakrishna/apply_citrux/src/lib/candidate)) | Read reference / Create upon conversion | CRM must never store duplicate resumes, career history, or education records. Upon conversion, candidate data is handed to `Candidate`. |
| **Authentication & Identity** | **Identity & RBAC** ([`src/lib/auth`](file:///Users/balakrishna/apply_citrux/src/lib/auth)) | Trigger invite upon conversion | CRM leads do **not** exist in `auth.users` or public `users`. They have no login credentials until conversion. |
| **Customer Financial Account** | **CBOS** ([`src/lib/cbos`](file:///Users/balakrishna/apply_citrux/src/lib/cbos)) | Trigger account creation upon conversion | CRM must never calculate pricing terms, generate invoices, or record payments. CBOS is sole authority for financial ledger. |
| **Service Contracts & Quotas** | **CBOS** ([`src/lib/cbos`](file:///Users/balakrishna/apply_citrux/src/lib/cbos)) | Select package during qualification | Contracts, versions, and application quotas (`ServiceEntitlement`) live exclusively in CBOS. |
| **Work Items & Specialist SLA** | **WCOS** ([`src/lib/wcos`](file:///Users/balakrishna/apply_citrux/src/lib/wcos)) | Optional demand event on conversion | CRM follow-up reminders must not alter delivery capacity units (CU) or specialist dispatch queues. |
| **Job Applications** | **Application Core** ([`src/lib/application`](file:///Users/balakrishna/apply_citrux/src/lib/application)) | None (Read-only after conversion) | CRM has zero involvement in job applications, cover letters, screening answers, or QA reviews. |
| **Job Offers & Placements** | **OPOS** ([`src/lib/opos`](file:///Users/balakrishna/apply_citrux/src/lib/opos)) | None (Attribution reporting only) | OPOS is sole authority for offer negotiation and placement verification. CRM may read placement revenue for ROI attribution. |
| **System Audit Trail** | **Audit System** ([`src/lib/audit`](file:///Users/balakrishna/apply_citrux/src/lib/audit)) | Append-only logging | CRM emits authoritative audit events via `logUserAuditEvent` / `logSystemAuditEvent`. Never mutates historical audit records. |

---

## 5. Risks and Architectural Dependencies

### 5.1 Duplicate-Person and Duplicate-Email Handling
- **Database Hazard:**  
  `User.email` has a global unique constraint (`email String @unique`). If a prospect submits a lead form with an email already belonging to an active Candidate or Employee, a blind insert into `User` will fail with a database constraint violation.
- **Architectural Solution:**  
  1. The `Lead` table must maintain an independent `email` column scoped to the organization (`@@index([organizationId, email])`).
  2. Implement an **Intelligent Deduplication Query**: When a lead is ingested, query both `leads` and `users` within the tenant.
  3. If an existing `Candidate` matches the email, flag the lead as `EXISTING_CANDIDATE_INQUIRY` rather than creating a duplicate prospect.
  4. If multiple inbound enquiries arrive from the same email within 30 days, append the new submission as a `LeadActivity` on the existing `Lead` instead of fragmenting the pipeline.

### 5.2 Anonymous Website Enquiries & Consent Requirements
- **Privacy & Consent Compliance:**  
  Inbound leads from public websites must record explicit data processing consent:
  - Timestamp of consent (`consentGivenAt`)
  - Consent version and IP address (`consentIpAddress`, `consentTextVersion`)
  - Marketing opt-in status (`marketingConsent: boolean`)
- **GDPR / CCPA Alignment:**  
  OOS already implements Privacy Requests (`PrivacyRequest` model in [`prisma/schema.prisma:1419`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L1419)). The privacy deletion and export workflows in [`src/lib/privacy`](file:///Users/balakrishna/apply_citrux/src/lib/privacy) must be updated to include `Lead` and `LeadActivity` records when processing an erasure request.

### 5.3 Role & Permission Limitations
- **Current Role Structure:**  
  `enum Role { CANDIDATE, EMPLOYEE, ADMIN }` is hard-coded into database enums and Prisma client.
- **Decision on Sales Roles:**  
  Adding a `SALES_REP` value to `Role` would require a PostgreSQL enum migration across multiple RLS policies and TypeScript guards.  
  **Recommended Low-Risk Approach:** Leverage the existing OOS `Designation` and `department` structure:
  - Role remains `Role.EMPLOYEE`.
  - Department is set to `"Sales"` or `"Admissions"`.
  - Designation is set to `"Sales Specialist"`, `"Intake Coordinator"`, or `"Admissions Advisor"`.
  - Enforce permission checks via helper: `requireSalesOrAdmin(ctx)`.

### 5.4 Tenant Isolation and PostgreSQL RLS
- **Security Invariant:**  
  No lead, prospect note, or sales activity may ever leak across organization boundaries.
- **RLS Requirements:**  
  All CRM tables (`leads`, `lead_sources`, `lead_stage_histories`, `lead_activities`, `lead_follow_ups`) must:
  1. Contain a mandatory `organization_id UUID NOT NULL REFERENCES organizations(id)`.
  2. Execute `ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;`
  3. Execute `ALTER TABLE "public"."leads" FORCE ROW LEVEL SECURITY;`
  4. Implement strict tenant-matching RLS policies:
     ```sql
     CREATE POLICY "leads_org_isolation" ON "public"."leads"
     FOR ALL USING (public.is_org_member("organization_id"))
     WITH CHECK (public.is_org_member("organization_id"));
     ```
  5. Deny all `SELECT`/`INSERT`/`UPDATE` access to `Role.CANDIDATE`.

### 5.5 Migration Risks & Data Integrity
- **Non-Breaking Additions:**  
  All proposed CRM models are purely additive. They introduce new tables and new `AuditAction` enum values without altering existing foreign keys or columns on `candidates`, `applications`, `tasks`, or `invoices`.
- **Enum Safety:**  
  PostgreSQL enums (`ALTER TYPE "AuditAction" ADD VALUE 'LEAD_CREATED'`) cannot be executed inside a multi-statement transaction in older PostgreSQL versions. Migrations must follow the existing OOS pattern of checking `duplicate_object` inside `DO $$ BEGIN ... END $$;` blocks.

### 5.6 Background Jobs, Notifications & Idempotency
- **Public Ingestion Endpoint:**  
  Public endpoints are vulnerable to automated bot submissions and replay attacks.
  - Require an `idempotency_key` (derived from `hash(orgId, email, formType, submissionDate)`).
  - Implement distributed rate limiting via the existing `RateLimitBucket` table ([`src/lib/security/ratelimit.ts`](file:///Users/balakrishna/apply_citrux/src/lib/security/ratelimit.ts)).
  - Include invisible honeypot fields (`website`, `company_fax`) to drop spam silently.
- **Transactional Consistency:**  
  Lead conversion must run within `withRlsContext(ctx.userId, async (tx) => { ... })` to guarantee that lead status update, candidate creation, and customer account initialization succeed or roll back atomically.

### 5.7 Existing Test Coverage & Regression Surface
- **Existing Suites:**  
  The repository maintains 124 test suites across unit, integration, and golden-path workflows.
- **Regression Risks:**  
  - Authentication tests (`tests/integration/candidate-registration.test.ts`, `tests/integration/admin-candidate-creation.test.ts`) must remain untouched.
  - CBOS tests (`tests/integration/phase10e-cbos-service.test.ts`, `phase10g-cbos-cross-domain-golden-path.test.ts`) must continue passing without alteration.
  - WCOS task tests (`tests/integration/phase10h-wcos-service.test.ts`) must not be affected by sales follow-ups.

---

## 6. Unresolved Architectural Decisions (For Decision Lock)

Before Phase 01 implementation begins, engineering leadership must resolve these 5 specific decisions:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                       DECISION LOCK MATRIX FOR CRM                        │
├────────────────────┬─────────────────────────────┬────────────────────────┤
│ Decision Topic     │ Option A (Recommended)      │ Option B (Alternative) │
├────────────────────┼─────────────────────────────┼────────────────────────┤
│ 1. Activity Model  │ Dedicated `LeadActivity`    │ Overload `InternalNote`│
│                    │ (Structured: calls/notes)   │ (Add leadId column)    │
├────────────────────┼─────────────────────────────┼────────────────────────┤
│ 2. Public Ingest   │ Next.js `/api/leads/ingest` │ External Webhook Relay │
│                    │ (Direct, honeypot, token)   │ (Zapier / Supabase Edge│
├────────────────────┼─────────────────────────────┼────────────────────────┤
│ 3. Conversion Flow │ Two-step atomic transition  │ Single combined        │
│                    │ (Create Customer & Cand)    │ mega-action            │
├────────────────────┼─────────────────────────────┼────────────────────────┤
│ 4. RBAC Structure  │ Role.EMPLOYEE + Designation │ Add Role.SALES_REP to  │
│                    │ (No enum migration needed)  │ database enum          │
├────────────────────┼─────────────────────────────┼────────────────────────┤
│ 5. Staff Navigation│ New "CRM & PIPELINE" item   │ Sub-tab under existing │
│                    │ in AppSidebar (Top Level)   │ "Operations Command"   │
└────────────────────┴─────────────────────────────┴────────────────────────┘
```

### Recommendation Rationale:
1. **Dedicated `LeadActivity` over `InternalNote`:** Sales interactions require structured fields (`activityType`: `DISCOVERY_CALL`, `FOLLOW_UP_EMAIL`, `QUALIFICATION_NOTE`, `MEETING`, `STAGE_CHANGE`, `durationMinutes`, `outcomeStatus`). Overloading `InternalNote` would dilute its simplicity as a lightweight internal message.
2. **Native `/api/leads/ingest` Endpoint:** Direct integration eliminates third-party middleware latency and preserves end-to-end type safety with Zod schemas.
3. **Atomic Two-Step Conversion:** Allows a sales lead to convert into a CBOS `CustomerAccount` (billing ready) while optionally postponing candidate career profiling until the customer completes onboarding.
4. **Role.EMPLOYEE with Designation:** Avoids high-risk PostgreSQL enum migrations across existing RLS policies while achieving full functional segregation.
5. **Top-Level Sidebar Item:** Sales and admissions staff need immediate 1-click access to the pipeline without digging through engineering/operations tabs.

---

## 7. Recommended Implementation Order (Phases 01 – 06)

Following the proven OOS domain delivery methodology:

```
Phase 00 ──► Phase 01 ──► Phase 02 ──► Phase 03 ──► Phase 04 ──► Phase 05 ──► Phase 06
Forensic     Product      Data Model   Service &    Public       Staff UI     Golden Path
Audit        Contract     & Security   Actions      Ingestion    Workbench    Verification
(Done)       (Lock)       (Prisma/RLS) (Zod/Logic)  (API/Spam)   (Console)    (E2E Tests)
```

1. **Phase 01 — Product Contract & Decision Lock:**  
   Lock down lifecycle state machine, qualification criteria, conversion rules, and the 5 architectural decisions in a binding product contract (`docs/crm/PHASE_01_CRM_PRODUCT_CONTRACT.md`).
2. **Phase 02 — Data Model, Persistence & Security:**  
   Prisma schema definitions for `Lead`, `LeadSource`, `LeadStageHistory`, `LeadActivity`, `LeadFollowUp`, new `AuditAction` enum items, PostgreSQL migration with FORCE RLS, and tenant isolation policies.
3. **Phase 03 — Service Layer, Actions & Validation Schemas:**  
   Zod schemas, `CrmRepository`, `CrmService`, and server actions (`createLeadAction`, `updateLeadStageAction`, `logLeadActivityAction`, `scheduleFollowUpAction`, `convertLeadAction`).
4. **Phase 04 — Public Ingestion Endpoint & Abuse Protection:**  
   Secure public route `/api/leads/ingest` with rate limiting, honeypot validation, attribution parsing, and transactional email acknowledgment.
5. **Phase 05 — Staff CRM Investigation & Pipeline Workbench:**  
   Next.js App Router route `/employee/crm` with `MetricStrip` (New, Contacted, In Review, Converted), stage tab navigation, search/filter toolbar, compact table view, slide-over Lead Detail Drawer, and quick activity logging.
6. **Phase 06 — Cross-Domain Conversion Golden Path & Automated Verification:**  
   Comprehensive unit tests for lifecycle and schemas, integration tests for tenant RLS and idempotency, cross-domain tests verifying lead-to-candidate conversion, and production build verification.

---

## 8. Phase 00 Recommendation & Human Acceptance Gate

### Formal Recommendation:
The repository is in a healthy, modular, and highly suitable state to receive the **Lead & CRM Domain**. The existing architectural foundations (Prisma, PostgreSQL RLS, `withRlsContext`, `EmailNotificationService`, `AuditEvent` logging, and the OOS Workbench design tokens) allow CRM to be added cleanly without technical debt or breaking changes to existing domains.

### Next Action:
**Wait for human acceptance of this Phase 00 Capability Audit.**  
Upon user approval, proceed to **Phase 01: Product Contract & Decision Lock**.
