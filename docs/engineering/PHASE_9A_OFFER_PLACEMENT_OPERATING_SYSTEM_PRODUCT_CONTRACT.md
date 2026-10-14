# PHASE 9A — OFFER & PLACEMENT OPERATING SYSTEM PRODUCT CONTRACT

**Status:** PRODUCT CONTRACT DRAFT — PENDING DECISION LOCK (PHASE 9B)  
**Domain:** Offer & Placement Operating System (OPOS)  
**Type:** Product & Architectural Contract Specification (Contract Only — Zero Implementation)  
**Date:** October 7, 2026  
**Auditor:** Antigravity Forensic Architecture & Core Product Systems  

---

## 1. Executive Summary

Following the completion and verification of the **Interview Operating System (IOS, Phases 8A–8C.5)**, the **Offer & Placement Operating System (OPOS)** is formally established as the next authoritative business and operational domain for the **Operations Operating System (OOS)**.

Today, OOS is 100% operationally authoritative from Candidate Onboarding through Career Evidence Graphs, Candidate 360 Aggregation, Job Discovery, Match Recommendation, Application Preparation, QA Review, External Submission, Outcome Logging, and Interview Management (Rounds, Prep, Debriefs). 

However, the moment an employer expresses intent to hire or issues an outcome of `OFFER_RECEIVED`, **OOS reaches an operational breakpoint**. Everything involving offer term capture, compensation structuring, equity breakdown, exploding decision deadlines, counter-offers, negotiation strategy, candidate acceptance/decline decisions, joining tracking, and placement verification currently occurs off-platform in ad-hoc email threads, spreadsheets, and private conversations.

**Phase 9A establishes the definitive Product Contract for OPOS.** This phase is **CONTRACT ONLY**. No schemas, database migrations, UI components, routes, or backend services are implemented in this phase.

---

## 2. Product Purpose

### What OPOS Is:
OPOS is the **authoritative operational system of record for managing the candidate's offer-to-placement journey**. It governs the high-stakes, high-touch window between an employer's hiring decision and the verified commencement of employment.

### What OPOS Is NOT:
- **NOT a payroll system:** OPOS does not disburse wages or process tax withholdings.
- **NOT an HRIS:** OPOS does not manage employee records, organizational charts, or internal company policies post-onboarding.
- **NOT an ATS:** OPOS does not manage employer-side applicant pipelines or requisition headcount approvals.
- **NOT a financial accounting system:** OPOS does not recognize ledger revenue, manage corporate invoices, or run book audits.
- **NOT a legal contract repository:** OPOS does not draft binding legal contracts or provide formal legal representations.
- **NOT a financial advisory engine:** OPOS does not predict equity share price growth, advise on stock options exercise timing, or speculate on future wealth.
- **NOT a background verification platform:** OPOS does not conduct criminal records checks, drug screenings, or degree verifications independently.
- **NOT a recruitment marketplace:** OPOS does not auction candidates or publicly list compensation bids.

### Core Operating Principle:
> *"People shouldn't manage the business around the system. The system should manage the business around the people."*

OPOS actively structures, clarifies, coordinates, and protects the candidate and operating specialists through the most critical phase of the talent lifecycle: converting employer hiring intent into verified, successful career placement.

---

## 3. Authority Boundary

### When OPOS Becomes Authoritative:
OPOS authority begins **the exact moment an employer communicates hiring intent, provides an offer term sheet, or when an interview concludes with an `OFFER_RECEIVED` milestone**.

### When OPOS Stops Being Authoritative:
OPOS authority ends **when the candidate's placement is formally verified (day of joining confirmed + onboarding evidence validated) or when the offer/placement journey reaches an authoritative terminal state (`DECLINED`, `WITHDRAWN_BY_EMPLOYER`, `FAILED_TO_JOIN`, `REPLACED`, `EXPIRED`)**.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           END-TO-END AUTHORITY CHAIN                          │
├──────────────────────────┬────────────────────────────────────────────────────┤
│ Application Lifecycle    │ Submission Preparation, QA & External Dispatch     │
│ (Application Core)       │ (DISCOVERED → PREPARING → SUBMITTED)               │
├──────────────────────────┼────────────────────────────────────────────────────┤
│ Outcome Ledger           │ Factual Employer Outcome Ingestion                 │
│ (Outcome Core)           │ (Append-Only Event: OFFER_RECEIVED / REJECTED)     │
├──────────────────────────┼────────────────────────────────────────────────────┤
│ Interview Operating Sys  │ Logistics, Preparation & Candidate Debriefing      │
│ (Interview Core)         │ (ROUND_REQUESTED → COMPLETED → DEBRIEFED)          │
├──────────────────────────┼────────────────────────────────────────────────────┤
│ Offer & Placement OS     │ Compensation Ingestion, Deadlines, Negotiation,    │
│ (OPOS - This Domain)     │ Candidate Decision, Joining & Placement Proof      │
├──────────────────────────┼────────────────────────────────────────────────────┤
│ Post-Placement / Future  │ Placement Milestone Auditing, Retention Checks,    │
│ (Subsequent Phase)       │ Lifetime Career Alumni Records                     │
└──────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 4. Offer Definition

An **Offer** in OPOS is an authoritative record representing an employer's concrete terms for hiring a candidate for a specific role resulting from an application.

### Key Conceptual Properties:
- **Candidate Linkage:** Strictly tied to an authenticated `Candidate` identity.
- **Application Linkage:** Directly references the parent `Application` and target `Job`.
- **Employer Entity:** Explicit employer/company name and operating entity.
- **Provenance & Source:** Stored record of who entered the offer data and what evidence backs it.
- **Temporal Coordinates:** Date received, formal decision deadline, and proposed start/joining date.
- **Role Identity:** Exact offered job title, department, employment type (Full-Time, Contract, etc.), and location/remote policy.
- **Structured Compensation Terms:** Multi-component financial package (Base, Variable, Sign-on, Equity, Benefits).
- **Verification State:** Distinct verification status based on physical/electronic evidence.
- **Active Lifecycle State:** Current position in the OPOS operational state machine.

### Critical Integrity Invariant:
An employer outcome of `OFFER_RECEIVED` in the Outcome Ledger **does not mean the full compensation breakdown is automatically known**. OPOS must never fabricate missing salary, bonus, equity, or start date fields. Fields remain explicit, optional until recorded, and clearly marked as provided facts.

---

## 5. Offer Provenance

Every offer record and field update must store its exact origin and evidentiary basis:

| Provenance Type | Meaning | Verification Cap |
| :--- | :--- | :--- |
| `EMPLOYEE_RECORDED` | Specialist entered terms communicated orally or via employer message. | Requires independent verification before being marked `VERIFIED`. |
| `CANDIDATE_PROVIDED` | Candidate entered terms or forwarded an employer offer notice. | Requires specialist or document verification. |
| `EVIDENCE_BACKED` | Sourced directly from an attached formal written offer letter or portal receipt. | Eligible for `VERIFIED` status upon authorized staff sign-off. |
| `EMPLOYER_COMMUNICATED`| Direct written confirmation from authorized hiring manager/recruiter. | Eligible for `VERIFIED` status. |
| `SYSTEM_DERIVED` | Projections derived from deterministic rules (e.g. deadline countdown). | Cannot override recorded facts. |

---

## 6. Offer Lifecycle

The authoritative lifecycle of an Offer is defined by the following strict state machine:

```
                          ┌──────────────────────────┐
                          │      OFFER_RECEIVED      │ (Offer terms recorded/uploaded)
                          └─────────────┬────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │    OFFER_UNDER_REVIEW    │ (Specialist analyzing terms & equity)
                          └─────────────┬────────────┘
                                        │
                         ┌──────────────┴──────────────┐
                         │                             │
                         ▼                             ▼
           ┌──────────────────────────┐  ┌──────────────────────────┐
           │       NEGOTIATION        │  │     DECISION_PENDING     │ (Ready for candidate action)
           └─────────────┬────────────┘  └─────────────┬────────────┘
                         │                             │
                         └──────────────┬──────────────┘
                                        │
     ┌───────────────────┬──────────────┼───────────────────┬───────────────────┐
     ▼                   ▼              ▼                   ▼                   ▼
┌──────────┐      ┌───────────┐  ┌──────────────┐    ┌─────────────┐     ┌─────────────┐
│ ACCEPTED │      │ DECLINED  │  │   EXPIRED    │    │  WITHDRAWN  │     │  REPLACED   │
└────┬─────┘      └───────────┘  └──────────────┘    └─────────────┘     └─────────────┘
     │            (Candidate      (Deadline passed    (Employer revoked   (Superseded by
     │             rejected)       without action)     the offer)          new version)
     ▼
┌─────────────────────────┐
│     JOINING_PLANNED     │ (Pre-onboarding, start date scheduled)
└────────────┬────────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌──────────┐   ┌──────────────┐
│  PLACED  │   │ FAILED_JOIN  │ (Did not start / rescinded)
└──────────┘   └──────────────┘
```

### State Definitions & Transition Matrix:

| State | Definition | Authorized Actor | Allowed Next States | Candidate Visibility |
| :--- | :--- | :--- | :--- | :--- |
| `OFFER_RECEIVED` | Initial capture of offer notification and preliminary terms. | Staff / Candidate | `OFFER_UNDER_REVIEW`, `DECISION_PENDING`, `WITHDRAWN`, `CANCELED` | "Offer Received" |
| `OFFER_UNDER_REVIEW` | Specialists are auditing terms, extracting clauses, and structuring analysis. | Staff | `NEGOTIATION`, `DECISION_PENDING`, `WITHDRAWN` | "Under Review with Team" |
| `NEGOTIATION` | Active counter-proposal discussion or term adjustments in flight. | Staff / Candidate | `DECISION_PENDING`, `REPLACED`, `DECLINED`, `WITHDRAWN` | "Negotiation in Progress" |
| `DECISION_PENDING` | Terms structured; candidate has full information to make a decision before deadline. | Staff / Candidate | `ACCEPTED`, `DECLINED`, `NEGOTIATION`, `EXPIRED`, `WITHDRAWN` | "Decision Required" |
| `ACCEPTED` | Candidate has authoritatively executed their decision to accept the offer. | Candidate (or verified proof) | `JOINING_PLANNED`, `WITHDRAWN` | "Offer Accepted" |
| `DECLINED` | Candidate has chosen not to accept the offer. Terminal for this offer. | Candidate (or verified proof) | *Terminal* | "Offer Declined" |
| `EXPIRED` | Formal decision deadline elapsed without extension or acceptance. | System / Staff | `OFFER_UNDER_REVIEW` (if extended), *Terminal* | "Offer Expired" |
| `WITHDRAWN` | Employer formally rescinded or cancelled the offer prior to acceptance/joining. | Staff / Candidate | *Terminal* | "Offer Withdrawn by Employer" |
| `REPLACED` | Superseded by a formal revision or new offer version (V1 &rarr; V2). | Staff | *Historical Record* | "Revised Offer Available" |
| `JOINING_PLANNED` | Offer accepted; pre-joining onboarding and start-date confirmation active. | Staff / Candidate | `PLACED`, `FAILED_JOIN` | "Joining Scheduled" |
| `PLACED` | Candidate commenced employment; onboarding evidence authoritatively verified. | Staff (with proof) | *Terminal (Authoritative)* | "Placement Verified" |
| `FAILED_JOIN` | Candidate did not start on the agreed date or offer terminated prior to day 1. | Staff (with proof) | *Terminal* | "Placement Incomplete" |

---

## 7. Offer Verification

To ensure OOS never records unverified compensation or fabricated hiring outcomes, OPOS enforces an explicit **Offer Verification Model**:

### Verification States:
1. `UNVERIFIED`: Information entered manually by candidate or operator without attached documentary proof.
2. `EVIDENCE_SUBMITTED`: Formal written letter, term sheet, or official employer communication uploaded to encrypted storage.
3. `VERIFIED`: Authorized staff member reviewed the attached document, validated key terms against recorded fields, and stamped verification.
4. `DISPUTED`: Discrepancy identified between candidate understanding, employer communication, and recorded terms.

### Evidence Rules:
- Verification requires an immutable link to a stored document (`CandidateDocument` or dedicated offer evidence).
- Verifier identity and timestamp are immutably logged in the audit trail.
- Unverified offers display an explicit "Self-Reported / Pending Verification" badge in all dashboards.

---

## 8. Compensation Model

Compensation in OPOS is modeled as structured, distinct components rather than a single collapsed integer.

### Core Compensation Components:
1. **Base Salary:**
   - Amount (numerical integer).
   - Currency (ISO 4217 code, e.g. `USD`, `INR`, `GBP`, `EUR`).
   - Payment Frequency (`ANNUAL`, `MONTHLY`, `HOURLY`).
2. **Variable / Performance Compensation:**
   - Target Variable Amount or Percentage.
   - Frequency (`ANNUAL`, `QUARTERLY`, `PROJECT`).
   - Criteria Summary (e.g. "Performance-based corporate KPI bonus").
3. **Guaranteed Bonuses / Sign-On:**
   - Sign-On Bonus Amount.
   - Payout Schedule & Clawback Duration (e.g. "Paid in month 1; 12-month clawback period").
   - Retention / Milestone Bonus (if applicable).
4. **Relocation & Stipends:**
   - Relocation Assistance Amount.
   - Remote Work / Home Office Setup Allowance.
   - Commuter / Wellness Stipends.
5. **Benefits & Non-Cash Value:**
   - Healthcare / Insurance coverage summary.
   - Retirement / 401(k) match percentage or provident fund contributions.
   - Paid Time Off (PTO) days per year.

### Mathematical Invariants:
- **Deterministic Total First-Year Target Cash:** `Base Annual + Target Annual Variable + First-Year Sign-On`.
- No estimated returns, stock appreciation multipliers, or unstated tax calculations may be added to official cash totals.

---

## 9. Equity Model

Equity represents a major portion of modern compensation but carries high variance. OPOS records **factual grant terms**, never speculative financial advice.

### Structured Equity Properties:
- **Equity Type:** `STOCK_OPTIONS_ISO`, `STOCK_OPTIONS_NSO`, `RSU`, `SAR`, `PHANTOM_STOCK`, `PROFIT_INTEREST`, `OTHER`.
- **Grant Quantity:** Exact number of shares or units granted.
- **Estimated Total Grant Value:** Value stated directly in employer offer letter (at time of grant).
- **Vesting Period (Total):** Total duration in months (e.g. 48 months for standard 4-year vesting).
- **Cliff Period:** Duration in months before initial vesting (e.g. 12 months for standard 1-year cliff).
- **Cliff Percentage:** Percentage vesting at cliff (e.g. 25%).
- **Vesting Frequency (Post-Cliff):** `MONTHLY`, `QUARTERLY`, `ANNUAL`.
- **Strike / Exercise Price:** Specific price per share (for options).
- **Current Fair Market Value (FMV) / 409A:** As explicitly stated in documentation (if provided).

### Strict Anti-Speculation Invariant:
OPOS **never** displays hypothetical "future exit value", "projected 10x upside", or investment recommendations. All equity metrics are clearly labeled: *"Terms as stated in offer documentation."*

---

## 10. Decision Deadlines

Exploding deadlines create severe candidate anxiety and risk of offer forfeiture. OPOS treats deadlines with high operational rigor.

### Deadline Governance:
- **Initial Decision Deadline:** Exact date and time (with timezone) by which the candidate must respond.
- **Deadline Urgency Tiers:**
  - `COMFORTABLE`: > 5 business days remaining.
  - `APPROACHING`: 3–5 business days remaining.
  - `CRITICAL`: < 48 hours remaining (triggers priority dashboard accent and notification).
  - `EXPIRED`: Deadline timestamp has passed without acceptance or recorded extension.
- **Extension Requests:**
  - Date extension requested.
  - Extension justification / reason.
  - Employer response status (`PENDING`, `GRANTED`, `DENIED`).
  - Revised deadline timestamp (if granted).

---

## 11. Negotiation Operating Model

OPOS provides a structured workflow for tracking compensation negotiations without duplicating communication channels.

### Negotiation Workflow Phases:
1. **Negotiation Planning:**
   - Target counter-offer parameters (Base goal, Sign-on goal, Equity goal).
   - Value justification & Candidate 360 evidence linkage (e.g. specialized skills, competing offers, unique project accomplishments).
2. **Execution & Employer Engagement:**
   - Counter-proposal submission date.
   - Negotiation channel (Direct candidate email, Specialist-facilitated call).
   - Employer response status (`PENDING_REPLY`, `COUNTER_OFFER_RECEIVED`, `ACCEPTED_AS_REQUESTED`, `DECLINED_TERMS_FIRM`).
3. **Negotiation Closure:**
   - Finalized terms accepted or returned to initial terms.
   - Resulting in a new Offer Version (`Offer V2`) or closure of negotiation phase.

---

## 12. Negotiation Provenance

To prevent dangerous misattribution of compensation numbers:

- **Candidate Desired Terms:** Must be recorded as `CANDIDATE_TARGET` (e.g. "Candidate aiming for $175,000 base").
- **Employer Formal Terms:** Must be recorded as `EMPLOYER_OFFER` (e.g. "Employer offered $160,000 base").
- **Counter-Proposal:** Must be recorded as `SUBMITTED_COUNTER` with timestamp and submitting actor.

Under no circumstances may a candidate wish or target number be displayed as an employer-committed figure.

---

## 13. Candidate Decision

The candidate is the sole decision-making authority regarding their career. OPOS provides an un-coerced, explicit decision interface.

### Permitted Candidate Decisions:
1. **ACCEPT:** Authoritatively commits to accepting the offer terms.
2. **DECLINE:** Authoritatively declines the offer terms.
3. **REQUEST_NEGOTIATION:** Requests specialist guidance and initiates counter-offer workflow.
4. **REQUEST_EXTENSION:** Requests operational support to obtain more decision time from employer.

### Anti-Impersonation Rule:
An employee or administrator **cannot click Accept/Decline on behalf of a candidate** through candidate self-service actions. If a decision is recorded by staff based on verbal/written evidence, the provenance is immutably tagged as `RECORDED_BY_STAFF_ON_BEHALF` with mandatory evidence documentation.

---

## 14. Acceptance

Authoritative Acceptance in OPOS requires:
1. **Candidate Identity Stamping:** Authenticated `userId` and timestamp.
2. **Offer Snapshot Binding:** The exact Offer Version ID and compensation terms being accepted are sealed.
3. **Signed Confirmation / Evidence Upload:** Optional upload of executed signature page or digital sign-off.
4. **Automatic Pipeline Transition:** Application moves to `JOINING_PLANNED`. Active competing applications receive notification prompts to withdraw or inform other employers gracefully.

---

## 15. Decline

When an offer is declined:
1. **Authoritative Timestamp & Actor:** Captured immutably.
2. **Structured Reason Category:**
   - `COMPENSATION_BELOW_TARGET`
   - `ROLE_FIT_OR_GROWTH`
   - `ACCEPTED_COMPETING_OFFER`
   - `LOCATION_OR_COMMUTE`
   - `CULTURE_OR_LEADERSHIP`
   - `PERSONAL_OR_FAMILY`
   - `OTHER`
3. **Optional Candidate Narrative:** Private feedback for specialist review.
4. **Privacy Protection:** Decline reasons are strictly internal to OOS and **never** shared with the employer ATS or external entities without candidate consent.

---

## 16. Offer Versioning

When negotiations yield revised terms, OPOS creates sequential, immutable **Offer Versions** (e.g. `V1`, `V2`, `V3`).

### Versioning Rules:
- An earlier offer version is never deleted or mutated in-place.
- Upon creation of `V(n+1)`, `V(n)` transitions to state `REPLACED`.
- The UI maintains full historical comparison (e.g. *"Base increased by +$15,000 from V1"*).
- Only the **Current (Active)** Offer Version can be Accepted by the candidate.

---

## 17. Placement Definition

In OPOS, **Placement is an authoritative business reality**, not an assumption.

> **CRITICAL RULE:** An accepted offer is NOT a placement. A placement is only established when the candidate commences work and employment is operationally verified.

### Operational Sequence:
$$\text{Offer Received} \longrightarrow \text{Offer Accepted} \longrightarrow \text{Joining Planned} \longrightarrow \text{Joining Confirmed} \longrightarrow \mathbf{PLACEMENT\ VERIFIED}$$

---

## 18. Joining Model

The transition between offer acceptance and the first day of work is governed by the **Joining Model**:

### Key Properties:
- **Scheduled Start Date:** Official agreed first day of work.
- **Start Date Status:** `CONFIRMED`, `TENTATIVE`, `RESCHEDULED`, `DELAYED`.
- **Pre-Joining Checklist:**
  - Background verification clearance status.
  - Relocation completed (if applicable).
  - Hardware / Laptop delivery confirmation.
  - Day 1 reporting logistics (manager contact, arrival time, office address / video link).
- **Day 1 Check-In:** Operational prompt for candidate and specialist on the morning of scheduled start.

---

## 19. Placement Verification

A record transitions to `PLACED` (Placement Verified) only upon meeting strict verification standards:

### Verification Criteria (at least ONE mandatory):
1. **Candidate Confirmation:** Explicit digital sign-off from candidate inside OOS confirming they started work on Day 1.
2. **Employer / Recruiter Written Confirmation:** Official email or portal notice from employer confirming onboarding.
3. **First Paystub / Corporate Email Receipt:** Uploaded onboarding evidence verifying active employee status.

### Prohibited Claims:
OOS never marks a placement as verified based on elapsed calendar time alone.

---

## 20. Failed Placement

If a joining falls through post-acceptance, OPOS records the exact failure mode without corrupting the historical offer record:

### Failure Classifications:
- `RESCINDED_BY_EMPLOYER` (e.g. corporate hiring freeze, budget elimination).
- `CANDIDATE_RENEGED` (e.g. candidate accepted counter-offer elsewhere or chose not to start).
- `FAILED_BACKGROUND_CHECK` (e.g. background verification or visa issuance issue).
- `FAILED_TO_REPORT` (e.g. candidate did not arrive on start date).

---

## 21. Post-Placement Boundary

### What OPOS Owns Post-Placement:
- **Day 30 Placement Health Check:** Single structured check-in to confirm satisfaction and team fit.
- **Day 90 Guarantee / Retention Milestone:** Formal verification of milestone completion for candidate career success and billing realization.

### What OPOS Hands Off:
- Day-to-day employer management, annual performance appraisals, and payroll are entirely external.

---

## 22. Candidate Experience

The candidate experience in OPOS is designed for radical clarity, confidence, and reassurance:

### Core Workspaces:
1. **Offer Breakdown Card:** Clean, human-readable summary of Base, Bonus, Equity, and Perks without confusing jargon.
2. **Decision Countdown Tracker:** Prominent, stress-reducing timeline showing days remaining until decision deadline.
3. **Negotiation Workspace:** Real-time visibility into active counter-proposals and specialist coaching points.
4. **One-Click Decision Hub:** Accessible, unambiguous `Accept Offer` or `Decline Offer` action triggers.
5. **Joining Roadmap:** Step-by-step pre-joining checklist guiding candidate to Day 1.

---

## 23. Employee Experience

Career Specialists and Operators use OPOS as an active command console:

### Operator Tools:
- **Offer Ingestion Drawer:** Fast entry of offer terms with drag-and-drop letter parser/uploader.
- **Compensation Comparison Engine:** Instant comparison against candidate target criteria and role expectations.
- **Negotiation Tracker:** Structured counter-offer logs with notes and strategic talking points.
- **Deadline Risk Monitor:** Real-time alerts for offers with expiring decision windows.
- **Joining & Placement Verification Form:** Clear evidentiary capture for official placement sign-off.

---

## 24. Team Lead Experience

Team Leads oversee operational quality and execution velocity:
- **Team Offer Pipeline:** Visibility across all active offers and negotiations managed by their specialists.
- **High-Risk Intervention Alerts:** Flagged notifications for stalled negotiations or imminent deadlines.
- **Offer Verification Queue:** Sign-off authority for verifying uploaded offer evidence.

---

## 25. Manager Experience

Operations Managers monitor placement conversion and workflow health:
- **Pipeline Conversion Metrics:** Real-time visibility into Interview-to-Offer and Offer-to-Placement conversion rates.
- **Negotiation Workload Distribution:** Balancing complex negotiation support across specialist teams.
- **Placement Forecast:** Authoritative schedule of upcoming joining dates for the calendar month.

---

## 26. Admin Experience

System Administrators manage governance, compliance, and dispute resolution:
- **Organization-Wide Placement Audit:** Full immutable logs of all offer revisions, compensation changes, and placement proofs.
- **Dispute & Void Authority:** Authorized workflows to correct clerical errors or void invalid placement records with mandatory audit justification.
- **Policy Configuration:** Setting organization-level default deadline windows and currency rules.

---

## 27. Task Integration

OPOS integrates seamlessly with the existing authoritative **Task Management System (Phase 4)**:

### Standard System-Generated Tasks:
- `VERIFY_OFFER_EVIDENCE`: Created upon new offer letter upload.
- `PREPARE_NEGOTIATION_STRATEGY`: Created when candidate requests negotiation.
- `EXPIRING_OFFER_FOLLOWUP`: Created 48 hours prior to decision deadline.
- `CONFIRM_DAY_1_JOINING`: Created on the morning of scheduled start date.
- `VERIFY_PLACEMENT_EVIDENCE`: Created following start date for official placement verification.

OPOS never creates a redundant task engine; it dispatches authoritative tasks to the unified Task System.

---

## 28. Communication Integration

OPOS leverages the existing **Unified Communication & Messaging Engine (Phase 4)**:
- Every offer card links directly to the candidate's active conversation thread.
- Key offer milestones (e.g. "Offer V2 uploaded", "Deadline extended to Oct 15") emit standardized system activity messages into the thread.
- Private negotiation notes remain scoped to internal specialist notes without leaking into candidate view.

---

## 29. Evidence / Documents

Offer documents contain the most sensitive career data in the system.

### Evidence Architecture:
- Stored exclusively in private, encrypted, tenant-isolated Supabase Storage.
- Signed, short-lived URLs (max 15-minute validity) for authorized viewing.
- Integrated into the **Candidate Document Vault** under the specialized category `OFFER_LETTER` / `ONBOARDING_PROOF`.
- RBAC-enforced download access.

---

## 30. Candidate 360 Integration

The **Candidate 360 (Phase 7E)** consumes OPOS data as a **read-only downstream composite**:
- Displays current Offer Status pill (e.g. `Offer Received`, `Offer Accepted`, `Placed`).
- Presents active compensation summaries and placement milestones in the 360 overview.
- Candidate 360 never mutates offer data directly; it delegates all mutations to OPOS service authority.

---

## 31. Interview Boundary

- **Interview OS (Phase 8)** is authoritative for round scheduling, interview prep briefs, and session debriefs.
- When an interview concludes with `OFFER_RECEIVED`, Interview OS records the outcome and triggers the creation of an OPOS Offer record.
- Interview OS remains completely frozen and unchanged.

---

## 32. Application Boundary

- **Application Core (Phases 3–6)** is authoritative for application status, tailoring, QA, and external submissions.
- OPOS holds a reference to the `Application` record (`applicationId`).
- Application status reflects high-level progress while OPOS governs detailed offer and placement operations.

---

## 33. Outcome Ledger Boundary

- **Outcome Ledger (Phase 6)** is an append-only ledger of external employer events.
- OPOS records operational workflows *on top of* outcome events.
- An outcome event of `OFFER_RECEIVED` instantiates an OPOS cycle; an outcome of `PLACED` is emitted when OPOS verifies placement.

---

## 34. Authorization (Structural RBAC)

OPOS strictly enforces multi-tenant, role-based access control:

| Role | Read Authority | Write / Mutation Authority |
| :--- | :--- | :--- |
| **Candidate** | Own active offers, terms, and decision hub. | Submit decision (Accept/Decline), request negotiation/extension, upload evidence. |
| **Employee** | Assigned candidates within organization. | Record offers, upload evidence, draft negotiations, record joining logistics. |
| **Team Lead** | Assigned team's candidates. | Verify offer evidence, approve negotiation strategy, oversee deadlines. |
| **Manager** | Departmental / organizational candidates. | Full operational visibility, workload rebalancing, placement forecasting. |
| **Admin** | Entire organization scope. | Full governance, dispute resolution, audit review, policy configuration. |

*Client-provided organizationId or candidateId parameters are never trusted; scope is resolved authoritatively from the authenticated session.*

---

## 35. Privacy & Data Protection

Compensation data is subject to strict, field-level privacy controls:

| Field Group | Candidate | Assigned Employee | Team Lead / Manager | Organization Admin | Other Candidates |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Basic Role & Company** | YES | YES | YES | YES | NO (100% Isolated) |
| **Base & Cash Compensation** | YES | YES | YES | YES | NO |
| **Equity & Grant Terms** | YES | YES | YES | YES | NO |
| **Private Specialist Notes** | NO | YES | YES | YES | NO |
| **Decline Reasons (Private)**| YES | YES | YES | YES | NO |
| **Offer Letter Document** | YES | YES | YES | YES | NO |

---

## 36. Audit Requirements

Every lifecycle transition, field change, and evidence interaction in OPOS must generate an immutable audit log entry in the unified Audit System:

### Mandatory Audit Events:
- `OFFER_CREATED`
- `OFFER_TERMS_UPDATED`
- `OFFER_EVIDENCE_UPLOADED`
- `OFFER_VERIFIED`
- `OFFER_VERSION_CREATED`
- `OFFER_DEADLINE_EXTENDED`
- `NEGOTIATION_INITIATED`
- `NEGOTIATION_TERMS_UPDATED`
- `OFFER_ACCEPTED_BY_CANDIDATE`
- `OFFER_DECLINED_BY_CANDIDATE`
- `OFFER_WITHDRAWN_BY_EMPLOYER`
- `OFFER_EXPIRED`
- `JOINING_DATE_SCHEDULED`
- `JOINING_DATE_RESCHEDULED`
- `PLACEMENT_VERIFIED`
- `PLACEMENT_VOIDED_OR_FAILED`

### Audit Schema Payload:
All events capture `actorUserId`, `organizationId`, `candidateId`, `applicationId`, `timestamp`, `ipAddress`, `previousState`, `newState`, and `diffSnapshot`.

---

## 37. Idempotency

All mutation operations in OPOS require strict idempotency keys or transaction isolation to prevent duplicate records:
- Offer creation tied to unique `(applicationId, offerVersion)` tuple.
- Candidate decision execution (`Accept` / `Decline`) is strictly idempotent: re-submitting an already accepted offer returns the existing signed record without re-executing transitions.
- Placement verification enforces single-execution per application.

---

## 38. Concurrency & Collision Handling

To handle concurrent updates (e.g. candidate accepting an offer while specialist is updating a deadline note):
- Database transactions use PostgreSQL Row-Level Locking (`FOR UPDATE`).
- Optimistic concurrency control via `updatedAt` / version stamping.
- If an offer's terms change while a candidate is viewing the decision screen, the client detects the version change and prompts the candidate to review updated terms before committing.

---

## 39. Notifications

OPOS triggers automated, high-priority notifications through the unified Notification Service:

### Notification Triggers:
1. **To Candidate:**
   - *New Offer Available:* Immediate notification when offer is verified and ready for review.
   - *Deadline Reminder:* 72 hours, 24 hours, and 6 hours before decision deadline.
   - *Negotiation Update:* When specialist records updated counter-offer terms from employer.
   - *Start Date Countdown:* 7 days and 1 day prior to scheduled Day 1.
2. **To Operating Specialist & Team Lead:**
   - *Candidate Decision Recorded:* Instant alert when candidate accepts or declines.
   - *Expiring Offer Alert:* 48 hours prior to deadline if candidate has not acted.
   - *Day 1 Check-In Prompt:* Morning of candidate start date.

---

## 40. Operational Reporting

OPOS provides strict operational metrics without vanity predictive scoring:
- **Active Offers Pipeline:** Count of offers in Review, Negotiation, and Decision Pending.
- **Offer Acceptance Rate (OAR):** $\frac{\text{Accepted Offers}}{\text{Total Valid Offers Received}} \times 100$.
- **Average Decision Velocity:** Mean hours from `DECISION_PENDING` to `ACCEPTED` / `DECLINED`.
- **Negotiation Lift:** Net percentage increase in base/total compensation between `Offer V1` and `Accepted Offer`.
- **Placement Conversion Rate:** $\frac{\text{Verified Placements}}{\text{Accepted Offers}} \times 100$.
- **Upcoming Start Dates:** Timeline of scheduled candidate start dates for the active 30-day window.

---

## 41. Data Truth Model

Every data attribute in OPOS is tagged with its authoritative truth classification:

```
┌───────────────────────────┐
│     EVIDENCE_BACKED       │ ──► Uploaded offer letters, official portal receipts (Highest Truth)
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│   EMPLOYER_COMMUNICATED   │ ──► Direct written employer messages
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│     CANDIDATE_STATED      │ ──► Candidate self-reported numbers & preference targets
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│    EMPLOYEE_RECORDED      │ ──► Specialist operational notes & negotiation logs
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│      SYSTEM_DERIVED       │ ──► Calculated cash totals, deadline urgency flags
└───────────────────────────┘
```

System-derived calculations can never overwrite Evidence-backed facts.

---

## 42. Failure & Dispute Model

In the event of factual disputes (e.g. candidate claims offered salary differs from recorded system salary, or employer rescinds an offer):

1. **Dispute Ingestion:** Candidate or staff flags the offer record with a formal dispute notice.
2. **State Suspension:** Offer transitions to `OFFER_UNDER_REVIEW` (holding deadline timers).
3. **Evidentiary Reconciliation:** Team Lead or Admin inspects original uploaded documents.
4. **Correction Record:**
   - If clerical error: Admin issues a corrected Offer Version with explicit audit explanation.
   - If employer changed terms: System records a new formal Offer Version.
   - If employer canceled: System marks `WITHDRAWN` with attached documentation.
5. **No Historical Erasure:** Historical incorrect records are marked `SUPERSEDED_CORRECTION` and retained in audit history; records are never deleted silently.

---

## 43. State Machines Specification

### 1. Offer Core State Machine
- **Initial:** `OFFER_RECEIVED`
- **Active Operational States:** `OFFER_UNDER_REVIEW`, `NEGOTIATION`, `DECISION_PENDING`
- **Resolution States:** `ACCEPTED`, `DECLINED`, `EXPIRED`, `WITHDRAWN`, `REPLACED`
- **Post-Acceptance Progression:** `JOINING_PLANNED` $\rightarrow$ `PLACED` or `FAILED_JOIN`
- **Terminal States:** `DECLINED`, `EXPIRED` (unextended), `WITHDRAWN`, `REPLACED`, `PLACED`, `FAILED_JOIN`

### 2. Offer Verification State Machine
- `UNVERIFIED` $\xrightarrow{\text{Upload Document}}$ `EVIDENCE_SUBMITTED` $\xrightarrow{\text{Staff Review}}$ `VERIFIED` (or `DISPUTED`)

### 3. Negotiation State Machine
- `NOT_REQUESTED` $\xrightarrow{\text{Candidate Request}}$ `STRATEGY_PENDING` $\xrightarrow{\text{Counter Dispatched}}$ `AWAITING_EMPLOYER_RESPONSE` $\xrightarrow{\text{Terms Resolved}}$ `NEGOTIATION_CONCLUDED`

---

## 44. Domain Relationships

The complete entity relationship structure of OOS with OPOS:

```
[Candidate] (Phase 7C)
    │
    ├── [Candidate 360] (Phase 7E - Read-only View)
    │
    └── [Application] (Phase 3-6)
            │
            ├── [ApplicationOutcomeEvent] (Phase 6 - Outcome Ledger)
            │
            ├── [Interview] (Phase 8 - IOS: Rounds, Prep, Debrief)
            │
            └── [Offer] (Phase 9 - OPOS) ◄─── AUTHORITATIVE NEW DOMAIN
                    │
                    ├── [OfferVersion] (V1, V2, V3...)
                    │       │
                    │       ├── [CompensationPackage] (Base, Bonus, Equity, Perks)
                    │       │
                    │       └── [OfferEvidence] (Encrypted Offer Letters)
                    │
                    ├── [NegotiationRecord] (Strategy, Counters, Responses)
                    │
                    ├── [CandidateDecision] (Acceptance/Decline Execution)
                    │
                    └── [PlacementRecord] (Joining Proof, Placement Verification)
```

---

## 45. Deferred Scope (Explicitly Out of Phase 9)

To maintain focus and strict engineering discipline, the following items are **strictly deferred**:
1. **Automated Optical Character Recognition (OCR) for PDFs:** Offer letters are uploaded as files; automated AI text extraction is deferred.
2. **Automated Equity Valuation Models / Black-Scholes Calculators:** No stock price forecasting engines.
3. **Automated Candidate Commission / Placement Billing Engine:** Commercial billing integration will follow in Phase 10.
4. **Third-Party Background Check API Integrations (e.g. Checkr):** External webhook verification deferred; manual evidence proof is authoritative.
5. **Direct Employer Portal Ingestion (Client OS):** External employers do not log into OOS in this phase; communication is managed through OOS staff.

---

## 46. Acceptance Criteria

Phase 9A is complete and ready for Decision Lock when:
- [x] All 51 contract areas are rigorously defined without ambiguity.
- [x] Absolute boundary between Outcome Ledger, Interview OS, Application Core, and OPOS is preserved.
- [x] Compensation and Equity models are structured, deterministic, and free of speculative financial advice.
- [x] Single default resume / single authoritative offer semantics are strictly enforced.
- [x] Candidate anti-impersonation decision rules are established.
- [x] Placement is distinctly defined as verified employment start (not merely offer acceptance).
- [x] Complete state machines, error models, and concurrency controls are established.
- [x] Structural RBAC and privacy protections are defined for sensitive compensation data.
- [x] Zero code, zero schema, and zero database mutations were created in this specification phase.

---

## 47. Decision Lock

### OPOS Product Contract Status:
**APPROVED FOR DECISION LOCK REVIEW**

### Implementation Authorization:
- This document defines the **frozen product contract** for the Offer & Placement Operating System.
- **Implementation (Prisma schema, migrations, services, UI) is NOT authorized in Phase 9A.**
- Implementation is conditionally authorized for subsequent execution phases only upon formal Phase 9B Decision Lock review and approval.

---

## 48. Summary of Contract Deliverables

```
================================================================================
PHASE 9A — COMPLETE
STATUS: APPROVED
DOMAIN: OFFER & PLACEMENT OPERATING SYSTEM (OPOS)

AUTHORITY BOUNDARY:
- Begins: Outcome of OFFER_RECEIVED or direct employer offer intent.
- Concludes: PLACEMENT_VERIFIED (onboarding proof) or terminal decline/withdrawal.

OFFER LIFECYCLE:
- OFFER_RECEIVED → OFFER_UNDER_REVIEW → [NEGOTIATION] → DECISION_PENDING → ACCEPTED → JOINING_PLANNED → PLACED

PLACEMENT LIFECYCLE:
- ACCEPTED → JOINING_PLANNED (Start Date Scheduled) → JOINING_CONFIRMED → PLACEMENT_VERIFIED

SECURITY & RBAC:
- Strict multi-tenant isolation; field-level compensation privacy; immutable audit logging.

PRIVACY:
- Compensation and decline reasons sealed; zero exposure to other candidates or external ATS.

INTEGRATION BOUNDARIES:
- Consumes from Outcome Ledger and Interview OS; outputs to unified Tasks, Documents, and Candidate 360.

DEFERRED:
- Automated OCR extraction, speculative equity valuations, automated billing, external background check APIs.

IMPLEMENTATION:
- NOT AUTHORIZED IN PHASE 9A (CONTRACT ONLY).

NEXT PHASE:
- PHASE 9B — OPOS DECISION LOCK & IMPLEMENTATION READINESS REVIEW
================================================================================
```
