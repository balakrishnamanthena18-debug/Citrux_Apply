# PHASE 8A — OOS NEXT BUSINESS-VALUE DOMAIN FORENSIC AUDIT

## Executive Summary

Phase 8A executes a forensic audit across the complete Operations Operating System (OOS) codebase to identify the single highest-value next business domain following the completion and freezing of Candidate Career Intelligence / Candidate 360 (Phases 7A–7E.4).

In alignment with the core OOS product principle:
> *"People shouldn't manage the business around the system. The system should manage the business around the people."*

Our audit analyzed every operational transition from candidate ingestion to post-placement. The finding is conclusive: **the single largest operational and business gap in OOS today is the post-submission Interview stage.**

Currently, OOS is authoritative through candidate qualification, job matching, resume tailoring, QA approval, external submission, and post-submission outcome logging (Phase 6 ledger events `INTERVIEW_REQUESTED` and `INTERVIEW_SCHEDULED`). However, the moment an employer invites a candidate to interview, **OOS ceases to be operationally authoritative**. Round scheduling, interview preparation, question/topic intelligence, candidate debriefs, interviewer tracking, feedback loops, and interview outcomes are forced entirely off-platform into manual emails, personal calendars, and ad-hoc chat.

The recommended next domain is the **Interview Operating System (IOS)**.

---

## Current OOS Capability Inventory

| Domain / Subsystem | Status | Implementation Truth & Evidence |
| :--- | :--- | :--- |
| **Candidate Identity & Profile** | **EXISTS / FROZEN** | `Candidate`, `CandidateExperience`, `CandidateEducation`, `CandidateSkill`, `CandidateProject`, `CandidateCertification`. |
| **Career Evidence Service** | **EXISTS / FROZEN** | Phase 7C deterministic multi-source evidence graph (`VERIFIED`, `EVIDENCED`, `SELF_DECLARED`, `SYSTEM_DERIVED`). |
| **Candidate 360** | **EXISTS / FROZEN** | Phase 7E read-only composition service, candidate self-knowledge UI, and staff operational UI. |
| **Applications Core** | **EXISTS / FROZEN** | `Application`, `ApplicationStatus` state machine (Discovered → Submitted/Rejected/Withdrawn). |
| **Application Operations** | **EXISTS / FROZEN** | `ApplicationSubmission`, `ApplicationSubmissionCorrection`, `ApplicationStateHistory`. |
| **Job Catalog & Private Leads** | **EXISTS / FROZEN** | `Job` (GLOBAL vs CANDIDATE_PRIVATE), `JobDescriptionSnapshot`, `JobRequirementSet`. |
| **Job Matching** | **EXISTS / FROZEN** | Phase 5 `CandidateJobMatch` deterministic scoring and recommendation feeds. |
| **Task Management** | **EXISTS / FROZEN** | `Task`, `TaskCategory`, `TaskType`, `TaskGovernancePolicy`, assignment, escalation. |
| **QA & Approvals** | **EXISTS / FROZEN** | `ApplicationQaReview`, `ApplicationQaChecklist`, candidate approval modes (`MANAGED` vs `REVIEW_REQUIRED`). |
| **Communication** | **EXISTS** | `Conversation`, `Message`, `InternalNote` (1:1 candidate-staff messaging and internal staff notes). |
| **Document Storage** | **EXISTS / FROZEN** | `CandidateDocument` with private Supabase storage paths and access controls. |
| **Resume Intelligence** | **EXISTS / FROZEN** | Phase 4 ATS extraction, parsing, and `ResumeReview` representation scoring. |
| **Application Intelligence** | **EXISTS / FROZEN** | Phase 2 `ApplicationAlignmentResult`, `ApplicationReadinessResult`. |
| **Outcome Ledger** | **EXISTS / FROZEN** | Phase 6 append-only `ApplicationOutcomeEvent` ledger (`EMPLOYER_REJECTION`, `RECRUITER_CONTACT`, `INTERVIEW_REQUESTED`, `INTERVIEW_SCHEDULED`, `OFFER_RECEIVED`, `OTHER`). |
| **Teams & Organizations** | **EXISTS / FROZEN** | `Organization`, `Membership` (departments, teams, team leads, reporting managers). |
| **Staff & Onboarding** | **EXISTS / FROZEN** | `Designation`, `StaffActivationToken`, invitation lifecycles. |
| **RBAC & Authorization** | **EXISTS / FROZEN** | Granular role-based scoping (`CANDIDATE`, `EMPLOYEE`, `TEAM_LEAD`, `MANAGER`, `ADMIN`). |
| **Audit Logging** | **EXISTS / FROZEN** | `AuditEvent` with actor provenance, immutable JSON payloads, and IP/user-agent tracking. |
| **Privacy & Compliance** | **EXISTS / FROZEN** | `PrivacyRequest` (export, correction, deletion) with verification workflows. |
| **Interviews** | **PARTIAL / DEFERRED** | Only raw ledger events (`INTERVIEW_REQUESTED`, `INTERVIEW_SCHEDULED`) in Phase 6. Zero round modeling, scheduling logistics, preparation workflows, feedback capture, or debrief tracking. |
| **Offers & Placements** | **PARTIAL / DEFERRED** | Only raw ledger event (`OFFER_RECEIVED`). Zero compensation structuring, decision deadlines, negotiation logs, or placement milestones. |
| **Candidate CRM / Recruitment** | **PARTIAL / ORPHANED** | Basic conversation threads exist; zero external recruiter directory, contact timeline, or company CRM. |
| **Analytics & Reporting** | **PARTIAL** | Outcome reporting dashboard and basic application stats; no pipeline velocity, capacity modeling, or interview conversion intelligence. |
| **Workflow Engine / Automation** | **PARTIAL** | Static task types and manual state machines; no dynamic event-driven trigger engine. |
| **Notifications** | **EXISTS** | In-app `Notification` and `EmailDeliveryLog`. |
| **AI / LLM Runtime** | **FROZEN FOUNDATION ONLY** | Schema containers defined for intelligence runs; zero live LLM execution. |
| **Billing & Subscriptions** | **MISSING** | 0 models, 0 routes, 0 payment integrations. |
| **External Integrations** | **MISSING** | No calendar sync (Google/Outlook), email sync, or ATS webhooks. |

---

## End-to-End Operational Journey

Tracing the complete candidate and operational journey in OOS:

```
[1] Candidate Ingestion & Onboarding (Authoritative in OOS)
    ↓
[2] Profile & Deterministic Career Evidence Graph (Authoritative in OOS - Phase 7C)
    ↓
[3] Unified Candidate 360 Self-Knowledge & Staff Review (Authoritative in OOS - Phase 7E)
    ↓
[4] Job Discovery & Opportunity Sourcing (Authoritative in OOS - Phase 3)
    ↓
[5] Deterministic Match Recommendation (Authoritative in OOS - Phase 5)
    ↓
[6] Application Preparation & Material Tailoring (Authoritative in OOS - Phase 3 & 4)
    ↓
[7] Application QA Review & Candidate Approval (Authoritative in OOS - Phase 5)
    ↓
[8] External Application Submission & Evidence Storage (Authoritative in OOS - Phase 6)
    ↓
[9] Post-Submission Outcome Ledger Event (Authoritative in OOS - Phase 6)
    ↓
=========================== CRITICAL BREAKPOINT ===========================
    ↓
[10] Interview Lifecycle (Screening, Technical, Manager, Final) ───► ❌ MANUAL / OFF-PLATFORM
    ↓
[11] Interview Preparation & Question Intelligence ───────────────► ❌ MANUAL / OFF-PLATFORM
    ↓
[12] Interview Debrief & Feedback Capture ────────────────────────► ❌ MANUAL / OFF-PLATFORM
    ↓
[13] Offer Terms, Compensation Breakdown & Negotiation ───────────► ❌ MANUAL / OFF-PLATFORM
    ↓
[14] Placement Confirmation & Start Date Tracking ────────────────► ❌ MANUAL / OFF-PLATFORM
    ↓
[15] Post-Placement Relationship & Retention ─────────────────────► ❌ MANUAL / OFF-PLATFORM
```

### Forensic Transition Breakdown

- **Who acts at Step 9?** An employee or candidate records an outcome (`INTERVIEW_REQUESTED` or `INTERVIEW_SCHEDULED`).
- **What is authoritative?** The fact that an event occurred and (if scheduled) the `occurredAt` timestamp.
- **What happens next?** **Nothing in OOS.** 
- **What remains manual?**
  1. Knowing which round of interview it is (Recruiter Screen, Technical Coding, System Design, Behavioral, Executive).
  2. Preparing the candidate using their verified Candidate 360 facts mapped against the Job Requirement Set.
  3. Tracking meeting format (Zoom/Teams/Phone/Onsite), interviewer names/titles, and preparation notes.
  4. Setting up reminders and prep tasks for both candidate and assigned employee.
  5. Capturing candidate debrief and questions asked immediately following the interview.
  6. Logging employer feedback, advance/reject decisions per round, and next round scheduling.
- **What is lost?** The most valuable operational data in career services: interview conversion rates, interview question patterns, candidate interview readiness, and employer evaluation criteria.
- **What cannot be measured?** Submission-to-interview velocity, round-by-round pass rates, and employee coaching effectiveness.

---

## Employee Workflow

An employee's operational day currently consists of:
1. **Queue Intake**: Assigned candidates, incomplete profiles needing review, new job leads.
2. **Application Execution**: Tailoring resumes (`ResumeReview`), checking alignment (`ApplicationAlignmentResult`), preparing cover letters/screening answers, submitting for QA (`ApplicationQaReview`), executing external submissions, uploading confirmation evidence (`ApplicationSubmission`).
3. **Outcome Logging**: When an employer email or candidate message arrives, recording an `ApplicationOutcomeEvent`.

### Operational Gap for Employees:
When an application converts into an interview:
- The employee has no structured operational tool in OOS to manage the candidate through the interview process.
- They must use external docs, spreadsheets, or unformatted message threads to guide interview preparation.
- There are no standard `TaskType`s for "CONDUCT_INTERVIEW_PREP", "SCHEDULE_INTERVIEW_ROUND", or "COLLECT_INTERVIEW_DEBRIEF".
- Employee performance and productivity are measured heavily on submissions, ignoring the high-touch, high-value coaching required during active interview cycles.

---

## Team Lead / Manager Workflow

### What Managers Can Answer Today:
- How many applications are in each status (`DISCOVERED`, `PREPARING`, `READY`, `SUBMITTED`)?
- How many outcomes were recorded across teams (`EMPLOYER_REJECTION`, `INTERVIEW_REQUESTED`, `OFFER_RECEIVED`)?
- What is the QA pass/fail rate for applications?
- Are tasks escalated or blocked?

### What Managers CANNOT Answer Today (Operational Blindspots):
- **Which candidates have active interviews this week?** (Invisible)
- **Are candidates properly prepared for upcoming interviews?** (Invisible)
- **Why are candidates failing at specific interview rounds?** (Invisible)
- **Which employers/roles have multi-round interview bottlenecks?** (Invisible)
- **Where is staff coaching capacity needed most urgently?** (Invisible)

---

## Candidate Journey

Candidate 360 (Phase 7E) gave candidates deep self-knowledge regarding their competencies, evidence gaps, career direction, and application status.

### The Post-Submission Cliff:
1. Candidate sees an application move to `SUBMITTED`.
2. Later, an outcome appears: `Interview requested` or `Interview scheduled`.
3. **The candidate experience abruptly halts**:
   - The candidate cannot see what round this interview is.
   - The candidate cannot access a targeted preparation brief connecting the job's requirements with their verified Candidate 360 projects and achievements.
   - The candidate has no structured form to log feedback or debrief questions after the call.
   - The candidate feels abandoned by the system right when the stakes are highest.

---

## Business Value Gap Matrix

| Domain Candidate | Business Value | Operational Impact | Candidate Value | Employee Value | Manager Value | Revenue Impact | Data Moat | Auditability | Current Readiness | Implementation Complexity | Risk | Dependency on Unresolved Decisions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Interview Operating System (IOS)** | **HIGH** | **HIGH** | **HIGH** | **HIGH** | **HIGH** | **HIGH** | **HIGH** | **HIGH** | **HIGH** | **MEDIUM** | **LOW** | **LOW** |
| **B. Offer / Placement Operating System (POS)** | **MEDIUM** | **MEDIUM** | **HIGH** | **MEDIUM** | **HIGH** | **HIGH** | **MEDIUM** | **HIGH** | **LOW** *(Depends on IOS)* | **MEDIUM** | **LOW** | **HIGH** *(Needs active interviews)* |
| **C. Candidate CRM / Relationship Management** | **LOW** | **LOW** | **LOW** | **MEDIUM** | **LOW** | **LOW** | **LOW** | **MEDIUM** | **HIGH** | **LOW** | **LOW** | **LOW** |
| **D. Communication Operating System** | **MEDIUM** | **MEDIUM** | **MEDIUM** | **MEDIUM** | **LOW** | **LOW** | **LOW** | **HIGH** | **MEDIUM** | **HIGH** *(External sync)* | **MEDIUM** | **MEDIUM** |
| **E. Workflow / Automation Engine** | **MEDIUM** | **HIGH** | **LOW** | **HIGH** | **MEDIUM** | **LOW** | **LOW** | **MEDIUM** | **LOW** *(Needs domains first)* | **HIGH** | **HIGH** | **HIGH** |
| **F. Operational Analytics** | **MEDIUM** | **MEDIUM** | **LOW** | **LOW** | **HIGH** | **LOW** | **LOW** | **HIGH** | **MEDIUM** | **LOW** | **LOW** | **LOW** |
| **G. Billing & Subscriptions** | **MEDIUM** | **LOW** | **LOW** | **LOW** | **MEDIUM** | **HIGH** | **LOW** | **HIGH** | **LOW** *(Commercial only)* | **MEDIUM** | **LOW** | **MEDIUM** |
| **H. Employer / Recruiter CRM** | **LOW** | **LOW** | **LOW** | **MEDIUM** | **LOW** | **LOW** | **MEDIUM** | **MEDIUM** | **LOW** | **MEDIUM** | **LOW** | **HIGH** |
| **I. Resume / Application Optimization** | **LOW** *(Already deep)* | **LOW** | **LOW** | **LOW** | **LOW** | **LOW** | **LOW** | **HIGH** | **HIGH** | **LOW** | **LOW** | **LOW** |

---

## Interview Domain Audit

### Does OOS have enough product evidence to justify an Interview Operating System?
**YES.**

- **Existing Foundation**:
  - `ApplicationOutcomeType.INTERVIEW_REQUESTED` and `INTERVIEW_SCHEDULED` exist in Phase 6.
  - Phase 6 explicitly deferred interview entities and workflows to a dedicated future phase (see `PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md §9`).
  - Phase 7 Candidate 360 established verified career facts, skills, and projects that serve as prime input for interview preparation briefs.
- **What is Missing**:
  - **Interview Entity & Rounds**: Modeling multi-round interview stages (e.g. `ROUND_1_SCREEN`, `ROUND_2_TECHNICAL`, `ROUND_3_SYSTEM_DESIGN`, `ROUND_4_BEHAVIORAL`, `ROUND_5_FINAL_ONSITE`).
  - **Interview Logistics**: Scheduled time, time zone, duration, meeting format (Virtual/Phone/In-Person), meeting links, interviewer names, and titles.
  - **Interview Preparation Brief**: Connecting the specific `JobRequirementSet` with the candidate's verified `Candidate360` evidence to produce talking points and technical focus areas.
  - **Interview Debrief & Feedback**: Post-interview feedback capture (questions asked, candidate sentiment, difficulty, follow-up items).
  - **Interview Outcome Progression**: Explicit round progression (`PASSED_ADVANCING`, `FAILED_REJECTED`, `RESCHEDULED`, `NO_SHOW`, `CANCELLED_BY_EMPLOYER`, `OFFER_PENDING`).
  - **Operational Tasks**: Integration with Task Management (`PREPARE_INTERVIEW`, `CONDUCT_DEBRIEF`, `FOLLOW_UP_INTERVIEW`).

---

## Offer / Placement Audit

### Does OOS have enough authoritative data for an Offer Operating System?
**NOT YET AS A STANDALONE PHASE.**

- **Current State**: `ApplicationOutcomeType.OFFER_RECEIVED` is a ledger event in Phase 6.
- **Missing Data**: Base salary, variable bonus, equity grants, sign-on bonus, benefits notes, offer expiration date, offer letter document storage, negotiation strategy, candidate decision status (`ACCEPTED`, `DECLINED`, `COUNTERING`), start date, and placement verification.
- **Dependency**: Real-world offers occur as the direct outcome of successful interview rounds. Implementing Offer/Placement management *without* an Interview Operating System creates an orphaned end-state with no preceding operational pipeline. Offer/Placement is the natural successor to Interview.

---

## Communication Audit

- Current messaging model: `Conversation` and `Message` (1:1 candidate-staff messaging) and `InternalNote` (staff-only internal collaboration).
- Functioning as an operational transport layer with notification integration.
- While email/SMS gateway integrations and template libraries could be added in the future, communication is not currently blocking core business operations.

---

## Workflow Audit

- OOS currently uses explicit, disciplined state transitions (`ApplicationStatus`, `TaskStatus`, `VerificationStatus`).
- Task governance policies define who can assign, complete, or escalate tasks.
- A generic, complex "BPMN / workflow automation engine" is **NOT justified** at this stage. It would introduce high architectural complexity and failure modes. Instead, domain-specific deterministic state transitions (like those successfully deployed in Phase 2, Phase 5, and Phase 6) are vastly superior.

---

## Analytics Audit

- **Authoritative Metrics Available Today**:
  - Candidate profile completeness & verification rates.
  - Application volume by status and assignment.
  - QA approval/rejection rates and criteria breakdown.
  - Submission volume, submission issue rates, and resubmission turnaround.
  - Outcome counts (`EMPLOYER_REJECTION`, `INTERVIEW_REQUESTED`, `OFFER_RECEIVED`).
  - Staff task turnaround time and escalation volume.
- **Missing / Unmeasurable Today**:
  - Interview conversion rates by round, employer, and role.
  - Time-to-interview after submission.
  - Interview pass/fail ratios and drop-off stages.
  - Offer acceptance and placement compensation totals.
- **Conclusion**: Building an expansive analytics dashboard before capturing interview operations would only highlight empty post-submission funnels.

---

## Billing Audit

- **Status**: Completely missing (0 models, 0 routes).
- **Assessment**: Billing is a commercial billing/subscription mechanism (Stripe/Paddle integration). While necessary for commercial monetization, it is an orthogonal administrative back-office system. It does not improve candidate outcomes or operational workflow efficiency. It should be built when commercial launch requirements dictate, but it is not the next core business value domain.

---

## Data Moat Audit

What data makes OOS irreplaceable over time?
1. **Candidate Career Truth & Evidence** (Captured — Phase 7)
2. **Job Requirement & Alignment Intelligence** (Captured — Phase 2 & 5)
3. **Application Execution & Submission History** (Captured — Phase 3 & 6)
4. **Interview Intelligence & Questions Repository** (🔥 **MISSING — HIGHEST MOAT POTENTIAL**)
   - Real questions asked by specific companies for specific roles.
   - What candidate answers/experiences resonated.
   - Exact multi-round interview structures across thousands of employers.
5. **Placement & Compensation Outcomes** (Downstream of Interviews)

Capturing structured interview intelligence creates the strongest long-term proprietary data moat for OOS.

---

## Product Completeness

- **P0 (Business-Critical Missing Capability)**: **Interview Operating System (IOS)** — OOS goes blind the moment an application succeeds in securing an interview.
- **P1 (Major Operational Gap)**: **Offer & Placement Operating System (POS)** — Downstream from interviews, capturing final compensation and placement truth.
- **P2 (Meaningful Improvement)**: **Operational Pipeline Analytics & Capacity Intelligence** — Visualizing the full funnel once interview data is captured.
- **P3 (Future Enhancement)**: **Billing & Subscription Engine**, **External Calendar / Email Integrations**.

---

## Architectural Readiness

### For Interview Operating System (IOS):
- **Existing Models Reused**: `Organization`, `Candidate`, `Application`, `Job`, `User`, `Task`, `InternalNote`, `Conversation`, `ApplicationOutcomeEvent`.
- **Existing Authorization Reused**: Scoped access via `AuthenticatedContext` (`CANDIDATE`, `EMPLOYEE`, `TEAM_LEAD`, `MANAGER`, `ADMIN`).
- **Existing Audit Reused**: `AuditEvent` and `AuditAction` taxonomy.
- **New Domain Modeling Required**:
  - `Interview` / `InterviewRound`
  - `InterviewPreparation` (linking Candidate 360 facts to Job requirements)
  - `InterviewDebrief` (feedback, questions, next steps)
- **Product Contract Readiness**: High. Clear separation between Phase 6 outcome ledger (factual event record) and Phase 8 Interview Operating System (interactive operational workflow).

---

## Governance Assessment

Following OOS's established rigorous phase lifecycle:
1. **Phase 8A — Next Business-Value Domain Forensic Audit** (THIS ARTIFACT)
2. **Phase 8B — Interview Operating System Product Contract** (Next Phase)
3. **Phase 8B.1 — Product Contract Decision Lock**
4. **Phase 8C — Interview Domain Service & Data Model Implementation**
5. **Phase 8D — Candidate & Staff Interview UI**
6. **Phase 8E — Full System Verification & Freeze**

---

## Recommended Next Domain

### **INTERVIEW OPERATING SYSTEM (IOS)**

#### Why Now?
1. **Closes the Greatest Operational Black Hole**: Submission-to-interview is the direct objective of everything built in Phases 1–7. Leaving interview management outside OOS breaks operational continuity.
2. **High Business & Revenue Value**: Placements and client satisfaction are decided at the interview stage.
3. **Candidate Value Multiplier**: Transforms OOS from an "application submitter" into a complete career advancement partner providing tailored interview preparation and debrief coaching.
4. **Leverages Candidate 360**: Directly utilizes the verified skills, projects, and career evidence assembled in Phase 7 to generate hyper-relevant interview preparation briefs.
5. **Builds Long-Term Data Moat**: Captures proprietary employer interview processes, question sets, and evaluation trends.

#### Explicit Non-Goals for Initial IOS:
- Direct bi-directional Google/Outlook calendar API sync (use structured manual scheduling & ICS export first).
- Automated AI video interview bot / mock interviewer.
- WebRTC video calling embedded inside OOS (use external meeting links).

---

## Runner-Up

### **Offer & Placement Operating System (POS)**
- **Why it should wait**: Offers are downstream of interviews. Building offer workflows before interview workflows creates a disconnected funnel. Offer management should naturally follow the completion of the Interview Operating System.

---

## Explicitly Deferred Domains

1. **Billing & Subscriptions**: Commercial back-office, deferred until launch/monetization phase.
2. **External ATS / Email Sync Integrations**: High third-party fragility; deferred until core internal workflows are mature.
3. **Autonomous Workflow Engine**: Deterministic state machines and task governance are currently sufficient; generic BPMN adds unnecessary complexity.
4. **Employer / Recruiter CRM**: OOS is candidate-side operations first.

---

## Required Product Contract Before Implementation

Before any schema modifications, migrations, or UI development for the Interview Operating System, a formal product contract (**Phase 8B**) must define:
1. Round taxonomy and lifecycle state transitions.
2. Relationship between Phase 6 outcome events and active Interview entities.
3. Candidate vs. Staff visibility boundaries.
4. Interview preparation brief data sources and format.
5. Debrief capture structure (questions, sentiment, follow-ups).
6. Task integration rules and role-based permissions.

---

## Schema Changes
**NONE**

## Code Changes
**NONE**

## UI Changes
**NONE**

---

## Final Decision

**AUDIT COMPLETE — READY FOR NEXT DOMAIN PRODUCT CONTRACT**
