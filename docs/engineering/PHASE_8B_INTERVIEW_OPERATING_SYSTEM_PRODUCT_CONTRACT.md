# PHASE 8B — INTERVIEW OPERATING SYSTEM PRODUCT CONTRACT

**Status:** PRODUCT CONTRACT DRAFT — PENDING DECISION LOCK (PHASE 8B.1)  
**Domain:** Interview Operating System (IOS)  
**Type:** Product & Architectural Contract Specification (Zero Implementation)  

---

## Executive Summary

Following the forensic audit in Phase 8A, the Interview Operating System (IOS) is established as the next high-value business domain for the Operations Operating System (OOS). 

Today, OOS is authoritative for candidate career truth (Phase 7C), Candidate 360 intelligence (Phase 7E), job qualification & matching (Phase 5), application preparation & QA (Phases 3, 4, 5), external submissions (Phase 6), and outcome logging (Phase 6). However, the moment an employer invites a candidate to interview, OOS loses operational authority. Round coordination, interview preparation, interview question tracking, candidate debriefs, and feedback loops currently happen off-platform.

This product contract defines the boundaries, lifecycle, conceptual models, authorization rules, and integration contracts for the Interview Operating System to make post-submission interview operations a first-class, auditable, and deterministic workflow within OOS.

---

## Problem Statement

When an application converts into an interview opportunity:
1. **Operational Blindspot**: Operators (Employees, Team Leads, Managers) have no structured system to track which interview round a candidate is in, when it occurs, who the interviewers are, or what meeting format is being used.
2. **Disconnected Preparation**: Candidates are left to prepare in isolation, failing to leverage the verified Candidate 360 evidence graph and job requirements already structured in OOS.
3. **Lost Feedback & Debrief Intelligence**: Questions asked by employers, candidate performance impressions, and employer evaluation criteria are lost in unformatted email or Slack threads.
4. **Unmeasurable Conversion**: OOS cannot measure submission-to-interview velocity, round-by-round attrition, or interview-to-offer conversion.

---

## Product Principle

> *"People shouldn't manage the business around the system. The system should manage the business around the people."*

The Interview Operating System does not merely log that an interview exists. It actively organizes the preparation, coordination, execution, and debriefing workflows around both the candidate and the operating staff.

---

## Interview Domain Boundary

To maintain architectural integrity and prevent duplication of truth:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           THREE SEPARATE TRUTHS                          │
├────────────────────────────────┬─────────────────────────────────────────┤
│ 1. Application Lifecycle       │ Where is our operational submission work?│
│    (ApplicationStatus)         │ (DISCOVERED → PREPARING → SUBMITTED)    │
├────────────────────────────────┼─────────────────────────────────────────┤
│ 2. Outcome Ledger              │ What did the outside world do?          │
│    (ApplicationOutcomeEvent)   │ (Append-only factual ledger of events)  │
├────────────────────────────────┼─────────────────────────────────────────┤
│ 3. Interview Operating System  │ How are we actively executing the       │
│    (Interview / Round)         │ interview process and coaching the      │
│                                │ candidate? (Rounds, Prep, Debrief)      │
└────────────────────────────────┴─────────────────────────────────────────┘
```

IOS does **not** replace `ApplicationStatus` or `ApplicationOutcomeEvent`. IOS is the operational workflow domain for managing active interview rounds, preparation briefs, and debrief feedback.

---

## Authoritative Sources

| Information Category | Authority Source | Mutability & Provenance Rules |
| :--- | :--- | :--- |
| **Candidate Career Facts** | `Candidate 360` / Phase 7C Evidence | Read-only. Sourced strictly from verified candidate truth. |
| **Job Requirements** | `JobRequirementSet` (Phase 2) | Read-only. Sourced strictly from captured JD snapshot. |
| **Interview Logistics** | Staff / Candidate Recorded | Editable operational data with full audit trail. |
| **Employer Decision** | `ApplicationOutcomeEvent` (Phase 6) | Append-only ledger event with recorded provenance. |
| **Preparation Guidance** | Employee / System Prepared | Structured prep brief connecting Candidate 360 to JD requirements. |
| **Debrief & Questions** | Candidate / Employee Reported | Candidate post-interview feedback & questions asked. |

---

## Interview Lifecycle

An interview operational cycle represents a specific engagement between a candidate and an employer for a specific application. An interview contains one or more sequential **Rounds**.

### Round Lifecycle States

```
                 ┌──────────────────────────┐
                 │    ROUND_REQUESTED       │ (Employer invites candidate)
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │    ROUND_SCHEDULED       │ (Date, time & logistics confirmed)
                 └─────────────┬────────────┘
                               │
                 ┌─────────────┴────────────┐
                 │                          │
                 ▼                          ▼
   ┌──────────────────────────┐ ┌──────────────────────────┐
   │    ROUND_COMPLETED       │ │    ROUND_RESCHEDULED     │ (Logistics updated)
   └─────────────┬────────────┘ └───────────┬──────────────┘
                 │                          │ (Returns to SCHEDULED)
                 ▼                          └───────────┐
   ┌──────────────────────────┐                         │
   │    DEBRIEF_PENDING       │                         ▼
   └─────────────┬────────────┘             ┌───────────────────────┐
                 │                          │   ROUND_CANCELLED     │
                 ▼                          │   (With provenance)   │
   ┌──────────────────────────┐             └───────────────────────┘
   │    DEBRIEF_COMPLETED     │
   └─────────────┬────────────┘
                 │
                 ▼
   ┌──────────────────────────┐
   │    ROUND_CONCLUDED       │ (Outcome: ADVANCED, REJECTED, OFFER, COMPLETED)
   └──────────────────────────┘
```

#### State Definitions:
1. **`ROUND_REQUESTED`**: Employer has requested an interview round, but date/time is not yet finalized.
2. **`ROUND_SCHEDULED`**: Logistics (date, time, timezone, format) are confirmed.
3. **`ROUND_RESCHEDULED`**: Prior schedule was adjusted; moves back to `ROUND_SCHEDULED` with new timestamp and reason.
4. **`ROUND_CANCELLED`**: Round cancelled prior to occurrence (with actor provenance: Candidate vs Employer).
5. **`ROUND_COMPLETED`**: Scheduled time has passed, awaiting debrief.
6. **`DEBRIEF_PENDING`**: Candidate/Staff debrief form is open for input.
7. **`DEBRIEF_COMPLETED`**: Feedback and questions asked have been captured.
8. **`ROUND_CONCLUDED`**: Final status of this round recorded.

---

## Interview Identity

- **Parent Entity**: An Interview belongs strictly to an **`Application`** (and transitively inherits `Candidate`, `Job`, and `Organization`).
- **Cardinality**:
  - One `Application` has **0 or 1** active `Interview` record.
  - One `Interview` has **1 to N** sequential `InterviewRound` records.
- **Tenant Isolation**: Direct foreign key to `Organization` ensuring multi-tenant isolation.

---

## Interview Rounds

Each interview round is a first-class entity with explicit attributes:

- **`roundNumber`**: Positive integer (1, 2, 3, 4, ...).
- **`roundType`**: Controlled taxonomy (see §9).
- **`roundTitle`**: Human-readable label (e.g. "Screening with Recruiter", "System Design & Architecture").
- **`status`**: Lifecycle state from §5.
- **`scheduledStartTime`**: ISO 8601 UTC timestamp.
- **`scheduledEndTime`**: ISO 8601 UTC timestamp (or derived from duration).
- **`timezone`**: IANA canonical timezone string (e.g. `America/New_York`, `UTC`).
- **`format`**: Meeting format (Virtual Video, Phone, In-Person, Take-Home / Assessment).
- **`meetingUrl`**: Optional virtual meeting link (sanitized, private).
- **`location`**: Physical address or room detail if in-person.

---

## Scheduling Contract

- **Authoritative Data**:
  - `scheduledStartTime` and `timezone` are authoritative once set by Staff or reported by Candidate.
  - `occurredAt` is populated upon round completion.
- **Edit Permissions**:
  - Employees, Team Leads, Managers, Admins can create and edit schedule logistics.
  - Candidates can report their interview schedule or request staff assistance.
- **Rescheduling**:
  - Schedulers record `rescheduleReason` and `rescheduledBy` (Candidate vs Employer).
  - Preserves prior schedule in audit history; updates current round schedule in place.

---

## Timezone Contract

- **Storage Standard**: All timestamps (`scheduledStartTime`, `scheduledEndTime`, `occurredAt`, `createdAt`) **MUST** be stored in PostgreSQL as UTC (`timestamptz`).
- **IANA Timezone Storage**: Every round record **MUST** store an explicit IANA timezone identifier string (`timezone`, e.g. `"America/Los_Angeles"`, `"Europe/London"`, `"Asia/Kolkata"`).
- **Display Rule**:
  - The UI renders times in the viewer's local browser timezone AND explicitly displays the employer's scheduled timezone (e.g. *"Tuesday, Oct 14 at 2:00 PM EDT (11:00 AM your time)"*).
  - Never assume a default timezone without explicit user/record definition.

---

## Interview Types

Controlled taxonomy for `InterviewRoundType`:

| Enum Value | Meaning |
| :--- | :--- |
| `RECRUITER_SCREEN` | Initial recruiter or talent partner conversation |
| `TECHNICAL_SCREEN` | Initial technical or skills assessment screen |
| `CODING_ASSESSMENT` | Live coding or paired programming session |
| `SYSTEM_DESIGN` | Architecture or system design interview |
| `HIRING_MANAGER` | 1:1 conversation with the hiring manager |
| `BEHAVIORAL_CULTURE` | Values, leadership principles, or cultural fit interview |
| `PANEL_PRESENTATION` | Multi-interviewer panel or project presentation |
| `EXECUTIVE_FINAL` | Final interview with VP, Director, or C-level executive |
| `ONSITE_FULL_LOOP` | Multi-round onsite or virtual super-day |
| `OTHER` | Specific round format not captured above |

*`OTHER` requires a non-empty `roundTitle` explaining the format.*

---

## Participants / Interviewers

- **Design Rule**: External interviewers are **NOT** OOS User accounts.
- **Interviewer Model**: Structured metadata array or child records containing:
  - `fullName`: string (e.g. "Jane Doe")
  - `roleOrTitle`: string (e.g. "Director of Engineering")
  - `linkedinUrl`: optional URL
  - `notes`: optional notes
- Internal staff assigned to support the candidate are linked via existing OOS `User` IDs (`assignedEmployeeId`).

---

## Preparation Operating System

The Preparation subsystem provides deterministic guidance by mapping the job's requirements to the candidate's verified evidence.

```
┌───────────────────────────┐         ┌───────────────────────────┐
│   Phase 2 Job Requirements │         │   Phase 7C Candidate 360  │
│   (Requirements & Skills) │         │   (Verified Evidence)     │
└─────────────┬─────────────┘         └─────────────┬─────────────┘
              │                                     │
              └──────────────────┬──────────────────┘
                                 │
                                 ▼
              ┌─────────────────────────────────────┐
              │     INTERVIEW PREPARATION BRIEF     │
              │  - Target Role Context              │
              │  - Top Verified Competencies to Hit │
              │  - Key Projects & Metrics to Cite   │
              │  - Potential Focus & Gaps to Bridge │
              │  - Round-Specific Talking Points    │
              └─────────────────────────────────────┘
```

### Truth vs. Guidance Rules:
- **FACTS**: Candidate achievements, technologies, metrics, and dates come strictly from Candidate 360. Zero fabrication.
- **GUIDANCE**: Staff can author preparation tips, company background notes, and suggested talking points.

---

## Interview Preparation Brief

A structured, candidate-safe document generated for each upcoming round:
1. **Header**: Role title, company name, round type, scheduled date/time with timezone.
2. **Key Competencies to Emphasize**: Sourced directly from Candidate 360 `CORE` and `STRONG` skills matching the job's requirement set.
3. **Highlighted Projects**: Candidate 360 projects that demonstrate the required technologies.
4. **Talking Points & STAR Stories**: Relevant achievements from candidate's verified work history.
5. **Format Guidelines**: Best practices for the specific round type (e.g. System Design tips vs Behavioral frameworks).
6. **Staff Coaching Notes**: Direct guidance provided by the assigned employee.

---

## Interview Questions

Captures real questions asked during interviews to build OOS's proprietary intelligence moat.

- **Provenance Categories**:
  - `EMPLOYER_PROVIDED`: Questions explicitly sent in advance by the employer (e.g. take-home prompt).
  - `CANDIDATE_REPORTED`: Questions the candidate recalled and reported during debrief.
  - `EMPLOYEE_RECORDED`: Questions staff documented from recruiter prep calls.
- **Attributes**:
  - `questionText`: string
  - `category`: (Technical, Behavioral, System Design, Situational, Compensation/Logistics)
  - `candidateAnswerNotes`: optional notes on how the candidate answered
  - `perceivedDifficulty`: optional rating (EASY, MEDIUM, HARD)

*AI-generated questions are strictly prohibited in V1.*

---

## Preparation Tasks

Reuses the existing OOS `Task` infrastructure:
- **Task Category**: `TaskCategory.APPLICATION` / `TaskCategory.CANDIDATE`.
- **New Task Types for IOS**:
  - `PREPARE_INTERVIEW_BRIEF`: Assigned to Employee to review and publish the prep brief.
  - `COMPLETE_INTERVIEW_PREP`: Assigned to Candidate to review brief and complete prep checklist.
  - `CONDUCT_MOCK_INTERVIEW`: Assigned to Employee/Candidate for live prep session.
  - `SUBMIT_INTERVIEW_DEBRIEF`: Assigned to Candidate immediately following completed round.
- Governed by existing `TaskGovernancePolicy`.

---

## Employee Workflow

1. **Intake & Schedule**: Receive interview alert; record or verify round details, date, time, timezone, and meeting link.
2. **Generate Prep Brief**: Review pre-populated Candidate 360 evidence mapped to the job; add custom coaching notes.
3. **Assign Prep Task**: Assign prep task with checklist to the candidate.
4. **Conduct Pre-Interview Check-in**: Review candidate readiness.
5. **Initiate Debrief**: When round completes, initiate debrief capture.
6. **Record Round Outcome**: Log round outcome and schedule next round or record final decision.

---

## Team Lead Workflow

- **Team Active Interview Dashboard**: View all candidates within team scope with upcoming interviews this week.
- **Prep SLA Monitoring**: Identify interviews occurring within 48 hours that lack a completed prep brief.
- **Round Conversion Visibility**: Monitor team-level round progression rates (Screen → Technical → Manager → Final).

---

## Manager Workflow

- **Organizational Pipeline Review**: Monitor active candidate interview funnels across all teams.
- **At-Risk Interventions**: Identify candidates with multiple round rejections to recommend targeted coaching.
- **Capacity Balancing**: Allocate coaching workload based on upcoming interview volume.

---

## Candidate Experience

- **Upcoming Interview Card**: Prominently displayed on Candidate Dashboard and Candidate Career workspace.
- **Interactive Prep Brief**: Clear, structured guide with candidate's own verified STAR stories and role requirements.
- **Prep Checklist**: Simple interactive checklist (e.g., "Tested webcam & mic", "Reviewed system design talking points").
- **Post-Interview Debrief Form**: Easy-to-use form to report questions asked, overall impression, and follow-ups.
- **Strict Redaction**: Candidates **never** see internal staff coaching notes marked private, employee workload metrics, or internal task governance metadata.

---

## Feedback Contract

Structured feedback captured during debrief:

- **Candidate Debrief (Candidate Perspective)**:
  - `overallSentiment`: (VERY_POSITIVE, POSITIVE, NEUTRAL, CONCERNED, DIFFICULT)
  - `questionsAsked`: list of question items
  - `areasFeltStrong`: text
  - `areasFeltChallenged`: text
  - `candidateFollowUpItems`: text (e.g. "Need to send code sample link")
- **Staff Debrief Assessment (Staff Perspective)**:
  - `technicalExecutionRating`: (STRONG, ADEQUATE, WEAK, NOT_APPLICABLE)
  - `communicationRating`: (STRONG, ADEQUATE, WEAK)
  - `recommendedNextSteps`: text
  - `isCandidateVisible`: boolean (defaults to `false` for internal staff notes)

---

## Interview Outcome Contract

When a round or complete interview concludes, an explicit outcome is recorded:

| Round Outcome | Operational Meaning |
| :--- | :--- |
| `ADVANCED_TO_NEXT_ROUND` | Candidate passed; next round is being scheduled. |
| `OFFER_RECEIVED` | Final round passed; employer extended an offer (bridges to Phase 6 Outcome Ledger). |
| `REJECTED_AFTER_ROUND` | Employer declined candidate after this round (bridges to Phase 6 Outcome Ledger). |
| `CANDIDATE_WITHDREW` | Candidate voluntarily withdrew from the interview process. |
| `POSITION_CANCELLED` | Employer cancelled or put the job on hold. |
| `AWAITING_EMPLOYER_DECISION` | Round completed; waiting for employer feedback. |

---

## Cancellation / Reschedule / No-Show

To ensure factual truth and avoid unfair attribution:
- **`ROUND_RESCHEDULED`**: Requires `rescheduledBy` (`CANDIDATE`, `EMPLOYER`, `MUTUAL`) and optional `reason`.
- **`ROUND_CANCELLED`**: Requires `cancelledBy` (`CANDIDATE`, `EMPLOYER`) and mandatory `reason`.
- **`NO_SHOW`**: Requires explicit factual attribution (`CANDIDATE_NO_SHOW`, `EMPLOYER_NO_SHOW`).
  - *Candidate no-show must never be recorded automatically; requires explicit staff verification.*

---

## Evidence & Provenance

- **Allowed Evidence Types**:
  - Employer invitation email screenshot / text
  - Calendar invite file (.ics) or confirmation screenshot
  - Employer portal status screenshot
  - Candidate statement
- **Evidence Storage**:
  - Reuses the dedicated private outcome evidence bucket (`application-outcome-evidence`) established in Phase 6B/6C.
  - Zero public S3 URLs; signed URLs strictly gated by tenant and role authorization.

---

## Auditability

Every mutation in the Interview domain creates an immutable `AuditEvent`:
- `INTERVIEW_ROUND_CREATED`
- `INTERVIEW_ROUND_SCHEDULED`
- `INTERVIEW_ROUND_RESCHEDULED`
- `INTERVIEW_ROUND_CANCELLED`
- `INTERVIEW_PREP_BRIEF_UPDATED`
- `INTERVIEW_DEBRIEF_SUBMITTED`
- `INTERVIEW_OUTCOME_RECORDED`
- `INTERVIEW_ROUND_VOIDED`

---

## Correction / Void / Supersede

Aligns with Phase 6 Decision Lock O2:
- **No Hard Deletes in V1**: Historical interview records are never hard-deleted.
- **Voiding**: Erroneous or duplicate rounds are marked `VOIDED` with `voidedAt`, `voidedById`, and `voidReason`.
- **Superseding**: Corrections that replace a record link via `supersededById`.
- **In-Place Edits**: Minor logistical updates (e.g. correcting meeting room number or updating spelling) update the row and log an `AuditEvent`.

---

## Freshness

- An interview round's preparation brief is marked `STALE` if:
  - The parent `Application` or `JobRequirementSet` is updated after brief generation.
  - The candidate updates their primary resume or core skills in Candidate 360.
- Does not block interview execution; alerts staff to review changes.

---

## Notifications

Logical notification triggers for future implementation:
- **P0 (Critical)**:
  - Candidate: Interview Scheduled / Rescheduled (includes date, time, timezone).
  - Candidate & Staff: 24-hour and 2-hour pre-interview reminders.
  - Candidate: Post-interview debrief prompt.
- **P1 (Operational)**:
  - Employee: Candidate submitted debrief.
  - Employee: Employer requested new interview round.
- **P2 (Managerial)**:
  - Team Lead: Upcoming interview lacking prep brief 24h prior.

---

## Communication Boundary

- **Messages** (`Conversation` / `Message`): Used for freeform discussion between candidate and staff regarding interview preparation.
- **Interview Records** (`InterviewRound` / `InterviewDebrief`): The structured, authoritative system of record for logistics, brief, questions, and feedback.
- Messages do **not** serve as the source of truth for scheduling; interview records do.

---

## Candidate 360 Integration

- **Read-Only Composition**:
  - Candidate 360 composes an **Interview Summary**:
    - Active interview count
    - Next upcoming interview date/time and company
    - Current interview stage / round number
    - Total completed interviews
- Candidate 360 remains strictly read-only; mutations occur only in the Interview domain.

---

## Application Pipeline Integration

- `ApplicationStatus` does **not** expand into 10 separate interview statuses.
- The pipeline displays an operational badge/chip derived from the active `InterviewRound.status` when `Application.status === SUBMITTED`.
- Application pipeline remains clean and focused on core operational milestones.

---

## Outcome Ledger Integration

When an interview reaches a terminal milestone:
1. **`INTERVIEW_REQUESTED` / `INTERVIEW_SCHEDULED`**: Can automatically generate or link to a Phase 6 `ApplicationOutcomeEvent` with provenance.
2. **`OFFER_RECEIVED`**: Concluding an interview with an offer creates a Phase 6 `ApplicationOutcomeEvent(type: OFFER_RECEIVED)`.
3. **`REJECTED_AFTER_ROUND`**: Concluding with a rejection creates a Phase 6 `ApplicationOutcomeEvent(type: EMPLOYER_REJECTION)` atomically coupled with `ApplicationStatus.REJECTED` per Decision Lock O4.

---

## Task Integration

Reuses existing `tasks` table and `TaskGovernancePolicy`:
- `TaskCategory`: `APPLICATION` or `CANDIDATE`.
- Integrates cleanly into employee daily backlog and candidate task checklist.

---

## Authorization Matrix

| Action | Candidate | Employee | Team Lead | Manager | Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **View Own Interview & Prep Brief** | **YES** | **YES** | **YES** | **YES** | **YES** |
| **View Internal Staff Notes** | **NO** | **YES** | **YES** | **YES** | **YES** |
| **Create / Schedule Round** | **REPORT ONLY** | **YES** | **YES** | **YES** | **YES** |
| **Update Logistics (Time/Link)** | **REPORT ONLY** | **YES** | **YES** | **YES** | **YES** |
| **Edit Preparation Brief** | **NO** | **YES** | **YES** | **YES** | **YES** |
| **Submit Candidate Debrief** | **YES** | **YES** | **YES** | **YES** | **YES** |
| **Record Round Outcome** | **NO** | **YES** | **YES** | **YES** | **YES** |
| **Void / Supersede Round** | **NO** | **NO** | **YES** | **YES** | **YES** |

*All staff actions are strictly bounded by organizational scope (Assigned Candidate, Team Scope, Direct Report Scope, Organization Scope).*

---

## Tenant Isolation

- All Interview entities include an immutable `organizationId` foreign key referencing `Organization.id`.
- Every database lookup and server action enforces multi-tenant scoping matching Phase 1/Phase 7 standards.
- Cross-tenant queries are blocked at the service and data layer.

---

## Conceptual Data Model

*(Conceptual Specification Only — Zero Schema Code Written)*

```
┌─────────────────────────────────────────────────────────────┐
│                         Interview                           │
│  - id: UUID (PK)                                            │
│  - organizationId: UUID (FK -> Organization)                │
│  - applicationId: UUID (FK -> Application, UNIQUE)          │
│  - candidateId: UUID (FK -> Candidate)                      │
│  - jobId: UUID (FK -> Job)                                  │
│  - status: ACTIVE | CONCLUDED | CANCELLED | VOIDED          │
│  - createdAt, updatedAt: Timestamps                         │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1
                               │
                               │ N
┌──────────────────────────────▼──────────────────────────────┐
│                      InterviewRound                         │
│  - id: UUID (PK)                                            │
│  - interviewId: UUID (FK -> Interview)                      │
│  - organizationId: UUID (FK -> Organization)                │
│  - roundNumber: Integer (1, 2, 3...)                        │
│  - roundType: InterviewRoundType (Enum)                     │
│  - roundTitle: String (VarChar 200)                         │
│  - status: InterviewRoundStatus (Enum)                      │
│  - scheduledStartTime: Timestamp (UTC)                      │
│  - scheduledEndTime: Timestamp (UTC)                        │
│  - timezone: String (IANA e.g. "America/New_York")          │
│  - format: InterviewFormat (VIRTUAL, PHONE, IN_PERSON, etc) │
│  - meetingUrl: String? (Sanitized)                          │
│  - location: String?                                        │
│  - interviewers: JSONB (Array of {name, title, linkedin})   │
│  - preparationBrief: JSONB (Structured prep sections)       │
│  - internalStaffNotes: Text? (Staff only)                   │
│  - candidatePreparationNotes: Text?                         │
│  - occurredAt: Timestamp? (UTC)                             │
│  - outcome: InterviewRoundOutcome? (Enum)                   │
│  - outcomeNotes: Text?                                      │
│  - voidedAt, voidedById, voidReason: Metadata               │
│  - createdAt, updatedAt: Timestamps                         │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1
                               │
                               │ 0..1
┌──────────────────────────────▼──────────────────────────────┐
│                      InterviewDebrief                       │
│  - id: UUID (PK)                                            │
│  - roundId: UUID (FK -> InterviewRound, UNIQUE)             │
│  - organizationId: UUID (FK -> Organization)                │
│  - candidateSentiment: SentimentEnum                        │
│  - questionsAsked: JSONB (Array of {question, category})    │
│  - candidateFeedbackNotes: Text?                            │
│  - staffAssessmentNotes: Text? (Staff only)                 │
│  - followUpItems: Text?                                     │
│  - submittedAt: Timestamp (UTC)                             │
│  - submittedById: UUID (FK -> User)                         │
│  - createdAt, updatedAt: Timestamps                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Existing Model Reuse

| Existing Entity | Reused Responsibility in IOS |
| :--- | :--- |
| **`Application`** | Root operational anchor for the interview. |
| **`Candidate`** | Inherited identity, preferences, and contact information. |
| **`Job` / `JobRequirementSet`** | Target role specifications feeding the preparation brief. |
| **`Candidate 360`** | Verified career truth feeding prep brief talking points. |
| **`Task`** | Operational task assignment for prep briefs and debriefs. |
| **`ApplicationOutcomeEvent`** | Append-only ledger integration for major outcome events. |
| **`AuditEvent`** | Comprehensive security and operational change logging. |
| **`Notification`** | In-app alert dispatching for interview milestones. |

---

## V1 Capability Matrix

| Feature / Capability | Classification | Rationale |
| :--- | :---: | :--- |
| **Interview & Round Entity Lifecycle** | **MUST HAVE — V1** | Core foundation for post-submission authority. |
| **Timezone-Aware Scheduling** | **MUST HAVE — V1** | Essential for multi-region coordination. |
| **Deterministic Prep Brief (Candidate 360 ↔ JD)** | **MUST HAVE — V1** | High-value candidate coaching multiplier. |
| **Structured Post-Interview Debrief** | **MUST HAVE — V1** | Captures questions and candidate feedback. |
| **Outcome Ledger Bridge** | **MUST HAVE — V1** | Preserves Phase 6 ledger integrity. |
| **Candidate & Staff Scoped Views** | **MUST HAVE — V1** | Clean operational separation and privacy. |
| **ICS Calendar File Download** | **SHOULD HAVE — V1.x** | Frictionless calendar addition without API sync. |
| **Pre-Interview Notification Reminders** | **SHOULD HAVE — V1.x** | Reduces no-show risk. |
| **Live Google/Outlook Calendar API Sync** | **DEFERRED** | High third-party token & webhook fragility. |
| **In-App WebRTC Video Calling** | **DEFERRED** | Unjustified; external Zoom/Meet links suffice. |
| **AI Mock Interview Bot** | **NOT JUSTIFIED** | Fabricated feedback; violates core product principles. |

---

## Explicit Non-Goals

1. **No Google/Outlook Two-Way Calendar Sync in V1**: Manual scheduling and .ics exports prevent brittle OAuth token maintenance.
2. **No Video/Audio Streaming in OOS**: Meeting URLs link to employer-provided Zoom, Google Meet, Microsoft Teams, or Chime.
3. **No Automated AI Interview Simulation / Scoring**: All preparation guidance is grounded in deterministic facts and human coaching.
4. **No Employer Portal / External Recruiter Logins**: Employers do not log into OOS; all interactions are candidate-side operations.
5. **No Offer Negotiation / Compensation Management**: Reserved for Phase 9 Offer & Placement Operating System.

---

## Business Value

- **Candidate Value**: Eliminates pre-interview anxiety by providing tailored, role-specific talking points based on their verified achievements, accompanied by clear logistical visibility.
- **Employee Value**: Replaces chaotic spreadsheets and ad-hoc chat with an automated, structured queue for interview prep, round tracking, and debrief collection.
- **Manager & Team Lead Value**: Unlocks real-time visibility into active candidate interview pipelines, prep bottlenecks, and conversion rates across the organization.
- **Company Value**: Directly increases interview pass rates and placement revenue by institutionalizing high-quality interview preparation.

---

## Data Moat

The Interview Operating System establishes OOS's most defensible proprietary data assets:
1. **Company-Specific Interview Question Repositories**: Actual questions asked across thousands of employer interview loops.
2. **Round Structure Patterns**: Real-world knowledge of specific companies' evaluation stages (e.g. "Company X always does a 45-minute system design before coding").
3. **Effective Preparation Formats**: Empirical data connecting specific Candidate 360 project framing to successful round advancements.

---

## Metrics

### Authoritative Metrics (Calculable directly from IOS):
- Active interviews in progress (by organization, team, and employee).
- Total rounds completed by type.
- Round advance rate (`ADVANCED_TO_NEXT_ROUND` / total completed rounds).
- Debrief completion rate and average debrief turnaround time.
- Cancellation and reschedule rates (segmented by Candidate vs Employer).

### Derived Metrics (Calculable via cross-domain composition):
- Submission-to-interview velocity (days between `ApplicationSubmission` and Round 1).
- Interview-to-offer conversion rate (interviews leading to `OFFER_RECEIVED`).

### Unmeasurable / Prohibited:
- Inferred candidate "sentiment" without explicit debrief form input.
- Inferred employer satisfaction without explicit outcome records.

---

## Open Decisions

The following decisions are proposed for formal freezing during **Phase 8B.1 Decision Lock**:

- **Decision D1 (Round Cardinality)**: Confirm whether multiple concurrent rounds on the same date (e.g. onsite super-day) are represented as separate `InterviewRound` rows with sequential order indices or a single `ONSITE_FULL_LOOP` round. *(Recommended: Separate sequential `InterviewRound` rows with a shared session key)*.
- **Decision D2 (Candidate Self-Scheduling)**: Confirm whether candidates can directly edit round time/link or only submit a "Schedule Update Request" for staff review. *(Recommended: Candidates can directly input schedule, subject to staff review & verification)*.
- **Decision D3 (Debrief Visibility)**: Confirm whether candidate-submitted debrief notes are immediately visible to staff, and whether staff assessment notes default to hidden from candidate. *(Recommended: Candidate debrief is visible to staff; staff notes default hidden from candidate)*.
- **Decision D4 (Voiding vs Deletion)**: Confirm strict adherence to Decision Lock O2 (Void-only, zero hard deletion) across all interview entities. *(Recommended: Adhere 100% to Void-only)*.
- **Decision D5 (Prep Brief Generation)**: Confirm that the preparation brief is deterministically generated on demand from Candidate 360 and Job Requirements with zero LLM execution in V1. *(Recommended: 100% deterministic on-demand composition)*.

---

## Contradiction Check

| Existing Contract / System | Rule Verified | Contradiction Found? |
| :--- | :--- | :---: |
| **Phase 6B External Outcome Contract** | Preserves outcome ledger taxonomy, append-only rules, and Decision Lock O1–O7. | **NONE** |
| **Phase 7B / 7C Career Evidence** | Uses verified candidate facts as read-only inputs for prep briefs; zero fact mutation. | **NONE** |
| **Phase 7D / 7E Candidate 360** | Candidate 360 remains strictly read-only composition; does not own interview truth. | **NONE** |
| **Application Lifecycle** | `ApplicationStatus` state machine is untouched; interview state is domain-scoped. | **NONE** |
| **Task Governance & RBAC** | Reuses existing task tables, governance policies, and structural role hierarchy. | **NONE** |
| **Tenant Isolation & Security** | Strict `organizationId` foreign key and multi-tenant scoping on all proposed models. | **NONE** |

---

## Decision Lock Readiness

The Interview Operating System product contract is **READY FOR DECISION LOCK**.

- Lifecycle and round states are unambiguous.
- Ownership, cardinality, and authority boundaries are strictly defined.
- Relationship with Outcome Ledger, Candidate 360, and Application Lifecycle is resolved without duplication.
- Redaction, privacy, and authorization rules are fully specified.
- Non-goals and V1 boundaries are strictly controlled.
- Zero contradictions exist with frozen contracts.

---

## Implementation Gate

```
==================================================
GOVERNANCE GATE STATUS
==================================================
SCHEMA CHANGES:                  NONE
CODE CHANGES:                    NONE
UI CHANGES:                      NONE
MIGRATIONS:                      NONE
IMPLEMENTATION AUTHORIZATION:    NOT GRANTED
==================================================
NEXT GOVERNANCE STEP:
PHASE 8B.1 — INTERVIEW OPERATING SYSTEM DECISION LOCK
==================================================
```

---

## Final Product Contract

**PHASE 8B — PRODUCT CONTRACT COMPLETE**

**READY FOR DECISION LOCK**
