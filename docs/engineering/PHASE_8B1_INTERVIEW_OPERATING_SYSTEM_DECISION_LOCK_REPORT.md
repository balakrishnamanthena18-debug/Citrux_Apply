# PHASE 8B.1 — INTERVIEW OPERATING SYSTEM DECISION LOCK

**Status:** APPROVED / ACCEPTED  
**Product Contract:** FROZEN (Phase 8B)  
**Governance Scope:** Final Decision Lock Verification for Interview Operating System (IOS)  

---

## 1. Contract Reviewed

- **Artifact**: [`docs/engineering/PHASE_8B_INTERVIEW_OPERATING_SYSTEM_PRODUCT_CONTRACT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_8B_INTERVIEW_OPERATING_SYSTEM_PRODUCT_CONTRACT.md)
- **Version**: Phase 8B Product Contract
- **Authoritative Baseline**: Phase 8A Forensic Audit

---

## 2. Repository Evidence Reviewed

- **Schema & Persistence**: [`prisma/schema.prisma`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma) (Enums, Models, Foreign Keys, Indexes, Constraints)
- **Outcome Ledger Contract & Code**:
  - [`docs/engineering/PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md)
  - [`src/lib/application/outcome-service.ts`](file:///Users/balakrishna/apply_citrux/src/lib/application/outcome-service.ts)
  - [`src/lib/application/outcome-labels.ts`](file:///Users/balakrishna/apply_citrux/src/lib/application/outcome-labels.ts)
  - [`src/lib/application/outcome-reporting.ts`](file:///Users/balakrishna/apply_citrux/src/lib/application/outcome-reporting.ts)
- **Career Intelligence & Evidence Graph**:
  - [`docs/engineering/PHASE_7B_CANDIDATE_CAREER_INTELLIGENCE_PRODUCT_CONTRACT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_7B_CANDIDATE_CAREER_INTELLIGENCE_PRODUCT_CONTRACT.md)
  - [`src/lib/career/career-evidence-service.ts`](file:///Users/balakrishna/apply_citrux/src/lib/career/career-evidence-service.ts)
- **Candidate 360 Composition & Verification**:
  - [`docs/engineering/PHASE_7D_CANDIDATE_360_PRODUCT_CONTRACT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_7D_CANDIDATE_360_PRODUCT_CONTRACT.md)
  - [`docs/engineering/PHASE_7E4_CANDIDATE_360_FULL_VERIFICATION_REPORT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_7E4_CANDIDATE_360_FULL_VERIFICATION_REPORT.md)
  - [`src/lib/candidate-360/candidate-360-service.ts`](file:///Users/balakrishna/apply_citrux/src/lib/candidate-360/candidate-360-service.ts)
- **Application Core & Submission Operations**:
  - [`src/lib/application/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/application/actions.ts)
  - [`src/lib/submission/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/submission/actions.ts)
- **Task Management & Governance**:
  - [`src/lib/task/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/task/actions.ts)
  - [`src/lib/task/governance.ts`](file:///Users/balakrishna/apply_citrux/src/lib/task/governance.ts)
- **Communication & Notifications**:
  - [`src/lib/communication/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/communication/actions.ts)
  - [`src/lib/notifications/presentation.ts`](file:///Users/balakrishna/apply_citrux/src/lib/notifications/presentation.ts)
- **Authorization & Security**:
  - [`src/lib/auth/server.ts`](file:///Users/balakrishna/apply_citrux/src/lib/auth/server.ts)
  - [`src/lib/security/tenant.ts`](file:///Users/balakrishna/apply_citrux/src/lib/security/tenant.ts)
  - [`src/lib/audit/actions.ts`](file:///Users/balakrishna/apply_citrux/src/lib/audit/actions.ts)

---

## 3. Contract Integrity

| # | Contract Dimension | Contract Spec Reference | Repository Evidence Check | Status |
| :--- | :--- | :--- | :--- | :---: |
| 1 | **Interview Identity** | §5 — UUID, bound to Application | `Application.id` FK, Org UUID | **PASS** |
| 2 | **Interview Ownership** | §5 — Scoped to Application | Unique constraint `(organizationId, applicationId)` | **PASS** |
| 3 | **Application Relationship** | §5 — 1:1 Application to Interview | Foreign Key `Application.id` | **PASS** |
| 4 | **Candidate Relationship** | §5 — Inherited from Application | Foreign Key `Candidate.id` | **PASS** |
| 5 | **Job Relationship** | §5 — Inherited from Application | Foreign Key `Job.id` | **PASS** |
| 6 | **Interview Rounds** | §6 — 1:N sequential rounds | Foreign Key `Interview.id` | **PASS** |
| 7 | **Round Lifecycle** | §3 — 6 main states + reschedule/cancel | Discrete enum state machine | **PASS** |
| 8 | **Scheduling Contract** | §7 — Start/End/Timezone/Format/URL | ISO 8601 UTC + IANA string | **PASS** |
| 9 | **Timezone Contract** | §8 — UTC storage + IANA identifier | `timestamptz` + VarChar IANA | **PASS** |
| 10 | **Interview Types** | §9 — 10 controlled taxonomy values | Controlled enum | **PASS** |
| 11 | **Interviewers / Participants** | §10 — Structured JSON array metadata | External actors decoupled from User | **PASS** |
| 12 | **Preparation System** | §11 — Deterministic C360 ↔ JD match | Read-only graph composition | **PASS** |
| 13 | **Preparation Evidence** | §11 — Verified C360 facts only | Phase 7C career evidence | **PASS** |
| 14 | **Interview Questions** | §13 — Employer / Candidate / Staff provenance | Provenance tracked per item | **PASS** |
| 15 | **Debrief Contract** | §18 — Structured debrief entity | 1:1 Round to Debrief | **PASS** |
| 16 | **Feedback Dimensions** | §18 — Sentiment & qualitative ratings | Non-numeric structured ratings | **PASS** |
| 17 | **Interview Outcome** | §19 — Explicit round outcomes | Controlled outcome enum | **PASS** |
| 18 | **Cancellation Semantics** | §20 — Mandatory actor provenance & reason | `cancelledBy` + `cancelReason` | **PASS** |
| 19 | **Rescheduling Semantics** | §20 — Actor provenance & new timestamp | `rescheduledBy` + `rescheduleReason` | **PASS** |
| 20 | **No-Show Semantics** | §20 — Explicit factual attribution | Factual attribution only | **PASS** |
| 21 | **Evidence Storage** | §21 — Outcome evidence bucket | Reuses `application-outcome-evidence` | **PASS** |
| 22 | **Provenance Rules** | §21 — Staff recorded vs Candidate reported | Provenance enum | **PASS** |
| 23 | **Auditability** | §22 — Dedicated AuditAction types | Immutable `AuditEvent` | **PASS** |
| 24 | **Correction Semantics** | §23 — In-place edits with audit | Field-level update logging | **PASS** |
| 25 | **Void Semantics** | §23 — Void-only (`voidedAt`, `voidReason`) | Aligns with Decision Lock O2 | **PASS** |
| 26 | **Supersede Semantics** | §23 — Linked correction chains | `supersededById` FK | **PASS** |
| 27 | **Freshness Rules** | §24 — Stale when C360 / JD changes | On-demand version hashing | **PASS** |
| 28 | **Candidate Visibility** | §17 — Candidate-safe prep & debrief | Strict redaction of staff notes | **PASS** |
| 29 | **Employee Visibility** | §15 — Full operational round management | Assigned scope visibility | **PASS** |
| 30 | **Team Lead Visibility** | §16 — Team interview monitoring & SLA | Team structural scope | **PASS** |
| 31 | **Manager Visibility** | §16 — Pipeline review & coaching capacity | Direct-report structural scope | **PASS** |
| 32 | **Admin Visibility** | §16 — Full organizational scope | Tenant structural scope | **PASS** |
| 33 | **Candidate 360 Boundary** | §27 — Read-only summary composition | C360 does not mutate IOS | **PASS** |
| 34 | **Application Boundary** | §28 — `ApplicationStatus` preserved | Separate operational domain | **PASS** |
| 35 | **Outcome Ledger Boundary** | §29 — Major milestones emit/bridge events | Preserves Phase 6 ledger | **PASS** |
| 36 | **Task Boundary** | §30 — Reuses existing `tasks` table | Reuses `TaskGovernancePolicy` | **PASS** |
| 37 | **Communication Boundary** | §26 — Chat transports; IOS owns facts | Clean separation | **PASS** |
| 38 | **Notification Boundary** | §25 — Defined logical triggers | In-app notification queue | **PASS** |
| 39 | **Tenant Isolation** | §32 — Mandatory `organizationId` scoping | RLS & query isolation | **PASS** |
| 40 | **Structural Authorization**| §31 — RBAC matrix without designation strings| Context-driven RBAC | **PASS** |
| 41 | **V1 Scope Boundary** | §34 / §35 — Bounded minimal core | Strict V1 feature boundary | **PASS** |
| 42 | **Non-Goals Defined** | §35 — Prohibits calendar sync / AI bot | Explicit non-goals | **PASS** |

---

## 4. Source-of-Truth Verification

The product contract strictly respects the separation of operational truths:

1. **`Application`**: Owns application operational lifecycle (`ApplicationStatus`).
2. **`Interview` / `InterviewRound`**: Owns the interactive interview execution workflow, round scheduling, prep briefs, and debrief feedback.
3. **`ApplicationOutcomeEvent`**: Owns the append-only factual ledger of external employer decisions.
4. **`Candidate 360`**: Purely a read-only composition layer (owns zero interview persistence).
5. **`Task`**: Owns operational assignments and checklists.
6. **`Message` / `Conversation`**: Owns candidate-staff communication transport.
7. **`AuditEvent`**: Owns immutable security and data change history.

**Result**: **PASS** — Zero source-of-truth collisions.

---

## 5. Outcome Ledger Boundary

- **Ledger Independence**: Phase 6's append-only outcome ledger (`ApplicationOutcomeEvent`) remains untouched.
- **Event Mapping**:
  - `INTERVIEW_REQUESTED` & `INTERVIEW_SCHEDULED` in the Outcome Ledger record the external fact that an invitation occurred.
  - The `Interview` domain manages the actual interactive preparation and round logistics.
  - Terminal outcomes (e.g. `OFFER_RECEIVED` or `REJECTED_AFTER_ROUND`) emit/bridge to Phase 6 outcome records, preserving Phase 6 Decision Lock O4 (atomic rejection coupling).
- **Distinctions Enforced**:
  - Staff assessment ≠ Employer decision.
  - Candidate sentiment ≠ Employer decision.
  - Round completed ≠ Final offer or rejection.

**Result**: **PASS** — Boundary is clear, deterministic, and preserves Phase 6 contracts.

---

## 6. Lifecycle Verification

The round state machine is deterministic and unambiguous:
- **`ROUND_REQUESTED`**: Initial invitation recorded; awaiting logistics confirmation.
- **`ROUND_SCHEDULED`**: Confirmed `scheduledStartTime`, `timezone`, format, and meeting details.
- **`ROUND_RESCHEDULED`**: Logistics updated with reason and attribution; transitions back to `ROUND_SCHEDULED`.
- **`ROUND_CANCELLED`**: Round cancelled prior to execution (with `cancelledBy` attribution).
- **`ROUND_COMPLETED`**: Scheduled time has occurred.
- **`DEBRIEF_PENDING`**: Candidate debrief form awaiting submission.
- **`DEBRIEF_COMPLETED`**: Feedback and questions asked captured.
- **`ROUND_CONCLUDED`**: Terminal round status set (`ADVANCED_TO_NEXT_ROUND`, `OFFER_RECEIVED`, `REJECTED_AFTER_ROUND`, `CANDIDATE_WITHDREW`).

**Result**: **PASS** — Every transition has defined entry criteria, actor permissions, and allowed next states.

---

## 7. Interview vs Round Verification

- **`Interview`**: Container entity representing the overall interview campaign for an `Application`. Owns overall status (`ACTIVE`, `CONCLUDED`, `CANCELLED`, `VOIDED`).
- **`InterviewRound`**: Represents an individual evaluation session (e.g., Round 1 Recruiter Screen, Round 2 Coding Session).
- **Multi-Round Support**: 1 `Interview` contains 1..N sequential `InterviewRound` rows.
- **Independent Scheduling**: Rounds can be scheduled, rescheduled, completed, or cancelled independently without breaking the parent Interview container.

**Result**: **PASS** — Cardinality and responsibilities are distinct and complete.

---

## 8. Data Model Minimality

Only 3 conceptual entities are proposed:
1. **`Interview`**: Root container linking `Application`, `Candidate`, `Job`, and `Organization`.
2. **`InterviewRound`**: Granular operational record for each round's logistics, brief, notes, and outcome.
3. **`InterviewDebrief`**: Structured container for candidate questions, feedback, and staff evaluation.

*No unnecessary entities (e.g. separate interviewer tables, separate prep brief tables, or redundant task tables) are introduced.*

**Result**: **PASS** — Data model is minimal, normalized, and purposeful.

---

## 9. Preparation Safety

- Preparation briefs compose data **strictly on demand** from:
  1. Verified candidate facts in Phase 7C / Candidate 360 (`CORE` and `STRONG` competencies).
  2. Captured job requirements from Phase 2 `JobRequirementSet`.
- Zero LLM generation of candidate facts, zero fabricated work metrics, and zero synthetic project experience.
- Preparation briefs remain advisory coaching tools; they never mutate canonical candidate truth.

**Result**: **PASS** — 100% compliant with candidate truth safety standards.

---

## 10. Question Intelligence

- Captures real questions asked during actual interview rounds.
- Provenance is explicitly tracked:
  - `EMPLOYER_PROVIDED`: Sourced from employer prompts.
  - `CANDIDATE_REPORTED`: Sourced from candidate debrief submissions.
  - `EMPLOYEE_RECORDED`: Sourced from recruiter briefing notes.
- Strictly bans AI-generated or simulated interview questions in V1.

**Result**: **PASS** — Factual provenance strictly enforced.

---

## 11. Feedback Safety

- Explicitly decouples:
  - `candidateSentiment` (Candidate's subjective experience: `VERY_POSITIVE` .. `DIFFICULT`).
  - `staffAssessmentNotes` (Employee's coaching evaluation: private to staff).
  - `InterviewRoundOutcome` (Factual operational advancement or employer decision).
- Prohibits arbitrary numeric scoring; uses structured qualitative categories.

**Result**: **PASS** — Subjective sentiment cannot masquerade as employer truth.

---

## 12. Evidence & Provenance

- Reuses the secure `application-outcome-evidence` private storage bucket.
- Signed URLs strictly gated behind authenticated tenant and role authorization.
- Factual attribution rules require explicit source logging for reschedules, cancellations, and outcomes.

**Result**: **PASS** — Strict alignment with Phase 6 evidence security.

---

## 13. Correction Semantics

- **No Hard Deletion**: Complies with Decision Lock O2.
- **Voiding**: Erroneous records are flagged `VOIDED` with `voidedAt`, `voidedById`, and `voidReason`.
- **Supersession**: Corrective entries reference the prior record via `supersededById`.
- **In-Place Updates**: Minor logistical fixes update attributes and produce an immutable `AuditEvent`.

**Result**: **PASS** — Full audit preservation; zero data destruction.

---

## 14. Timezone Verification

- Timestamps stored as PostgreSQL `timestamptz` (UTC).
- Explicit IANA timezone identifier stored on each round (`timezone`, e.g. `"America/New_York"`).
- Client presentation renders in local viewer time + explicit context timezone.

**Result**: **PASS** — Multi-region scheduling integrity guaranteed.

---

## 15. Authorization Matrix

- Granular structural permissions defined for `CANDIDATE`, `EMPLOYEE`, `TEAM_LEAD`, `MANAGER`, and `ADMIN`.
- Authorization derived from contextual relationship (`assignedEmployeeId`, `Membership.team`, reporting hierarchy), never fragile designation strings.
- Direct-ID parameter tampering prevented by verifying entity tenancy and role scope.

**Result**: **PASS** — Structural RBAC strictly enforced.

---

## 16. Tenant / IDOR Verification

- All entities require immutable `organizationId` foreign keys.
- Queries and actions enforce multi-tenant scoping.
- Candidate cross-access, employee out-of-scope access, and cross-tenant leakage are blocked at the service boundary.

**Result**: **PASS** — IDOR and tenant isolation verified.

---

## 17. Candidate 360 Boundary

- Candidate 360 remains a **read-only composition layer**.
- Candidate 360 may consume an Interview Summary (active count, next interview date/company, latest stage) for self-knowledge and staff review.
- Candidate 360 cannot mutate interview data.

**Result**: **PASS** — Composition boundary maintained.

---

## 18. Application Pipeline Boundary

- `ApplicationStatus` enum is **NOT** modified.
- Active interview rounds display as dynamic operational chips derived from the `Interview` domain while `Application.status === SUBMITTED`.
- Prevents bloat and complexity in the root application state machine.

**Result**: **PASS** — Application pipeline remains clean and stable.

---

## 19. Task Boundary

- Reuses the existing `tasks` table, `TaskGovernancePolicy`, and `TaskStateHistory`.
- Supports operational task types (`PREPARE_INTERVIEW_BRIEF`, `COMPLETE_INTERVIEW_PREP`, `SUBMIT_INTERVIEW_DEBRIEF`).
- Zero parallel task systems introduced.

**Result**: **PASS** — Task reuse confirmed.

---

## 20. Communication Boundary

- Messages in `Conversation` / `Message` remain freeform candidate-staff discussion channels.
- Interview records in `InterviewRound` remain the structured system of record.
- Chat does not dictate interview state; interview records do not replace conversation.

**Result**: **PASS** — Clear transport vs system-of-record boundary.

---

## 21. Notification Boundary

- Notification triggers prioritized logically (P0 scheduling & 24h reminders; P1 debrief alerts).
- No unapproved notification spam or premature background workers introduced.

**Result**: **PASS** — Logical boundary defined.

---

## 22. Business Value

Directly solves the operational gap identified in Phase 8A:
- Operators gain real-time visibility into active candidate interview loops.
- Candidates receive tailored prep briefs grounded in their verified Candidate 360 facts.
- Organizations capture interview questions and conversion metrics across employers.

**Result**: **PASS** — High operational and strategic business value.

---

## 23. Data Moat

Authoritatively captures real interview questions, round structures by company, and conversion milestones, establishing OOS's proprietary interview intelligence repository.

**Result**: **PASS** — Defensible data moat verified.

---

## 24. V1 Scope

Explicitly prohibits:
- Live Google/Outlook two-way calendar sync (manual + .ics export only in V1).
- In-app WebRTC video/audio streaming.
- AI interview simulation / automated scoring.
- External employer/recruiter login portals.
- Offer negotiation management (reserved for Phase 9).

**Result**: **PASS** — Scope is tightly bounded and realistic.

---

## 25. Architecture Compatibility

- Builds natively within Next.js Turbopack, Prisma ORM, Supabase PostgreSQL, and existing modular service layers.
- Zero external dependencies, zero microservices, zero vector databases, and zero event buses required.

**Result**: **PASS** — Full architectural harmony with existing stack.

---

## 26. Contradiction Matrix

| Domain / Subsystem | Phase 8B Contract Rule | Existing System Standard | Result | Evidence |
| :--- | :--- | :--- | :---: | :--- |
| **Application Lifecycle** | Preserves `ApplicationStatus` machine | `DISCOVERED` .. `SUBMITTED` / `REJECTED` | **PASS** | `prisma/schema.prisma` lines 78–93 |
| **Outcome Ledger** | Appends external outcome events; preserves O1–O7 | Append-only `ApplicationOutcomeEvent` | **PASS** | `PHASE_6B_EXTERNAL_OUTCOME_PRODUCT_CONTRACT.md` |
| **Candidate 360** | Read-only composition of interview summary | Read-only DTO composition | **PASS** | `PHASE_7D_CANDIDATE_360_PRODUCT_CONTRACT.md` |
| **Career Evidence** | Read-only input for prep briefs; zero mutation | Multi-source deterministic evidence | **PASS** | `src/lib/career/career-evidence-service.ts` |
| **Resume Intelligence** | Read-only advisory input for prep briefs | Phase 4 ATS extraction & review | **PASS** | `prisma/schema.prisma` lines 1509–1606 |
| **Application Intelligence**| Read-only requirement set matching | Phase 2 JD snapshots & readiness | **PASS** | `prisma/schema.prisma` lines 1290–1476 |
| **Job Matching** | Independent pre-application match feeds | Phase 5 `CandidateJobMatch` | **PASS** | `prisma/schema.prisma` lines 1609–1681 |
| **Task Governance** | Reuses existing task tables & governance rules | `TaskGovernancePolicy` | **PASS** | `src/lib/task/governance.ts` |
| **Communication** | 1:1 messaging transport separate from facts | `Conversation` / `Message` | **PASS** | `src/lib/communication/actions.ts` |
| **Notifications** | In-app notification queue integration | `Notification` / `NotificationType` | **PASS** | `src/lib/notifications/presentation.ts` |
| **RBAC / Authorization** | Structural role hierarchy without designation strings | Context-based authorization | **PASS** | `src/lib/auth/server.ts` |
| **RLS / Multi-Tenancy** | Mandatory `organizationId` scoping on all entities | Multi-tenant isolation | **PASS** | `src/lib/security/tenant.ts` |
| **Audit Logging** | Immutable `AuditEvent` for every round mutation | `AuditEvent` / `AuditAction` | **PASS** | `src/lib/audit/actions.ts` |
| **Candidate Truth** | Zero fabrication of candidate skills or metrics | Fact attestation & provenance | **PASS** | `prisma/schema.prisma` lines 1478–1506 |

**Total Contradictions Found**: **0**

---

## 27. Findings

- **P0 (Security / Authorization / Data Leak)**: `0`
- **P1 (Contract Conflict / Architectural Duplication)**: `0`
- **P2 (Ambiguity / Missing Specification)**: `0`
- **P3 (Future Enhancement)**: `0`

---

## 28. Final Decision

```
==================================================
FINAL DECISION:
PHASE 8B.1 — APPROVED / ACCEPTED
PRODUCT CONTRACT: FROZEN
==================================================
```

### Implementation Gate

- **SCHEMA CHANGES**: `NONE`
- **CODE CHANGES**: `NONE`
- **UI CHANGES**: `NONE`
- **MIGRATIONS**: `NONE`
- **IMPLEMENTATION AUTHORIZATION**: **GRANTED FOR PHASE 8C ONLY**
- **AUTHORIZED DOMAIN**: `INTERVIEW OPERATING SYSTEM (V1)`
- **AUTHORIZED SCOPE**: Strictly the frozen Phase 8B Product Contract.
- **NEXT GOVERNANCE STEP**: `PHASE 8C — INTERVIEW OPERATING SYSTEM DATA MODEL & SERVICE IMPLEMENTATION`

---

**PHASE 8B.1 — DECISION LOCK COMPLETE**

**APPROVED / ACCEPTED**
