# PHASE 01 — LEAD LIFECYCLE & STATE MACHINE SPECIFICATION

> **Document Status:** RECONCILED SPECIFICATION / PENDING HUMAN ACCEPTANCE  
> **Document Version:** 1.11.0  
> **Classification:** State Machine Architecture & Operational Governance  
> **System:** Operations Operating System (OOS) — Lead & CRM Subsystem  
> **Date:** 2026-10-15  
> **Parent Specification:** [`docs/crm/phase-01-product-contract.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01-product-contract.md)  
> **Reconciliation Reports:** [`docs/crm/phase-01.1-reconciliation-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.1-reconciliation-report.md), [`docs/crm/phase-01.2-final-gate-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.2-final-gate-report.md), [`docs/crm/phase-01.3-final-security-challenge.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.3-final-security-challenge.md), [`docs/crm/phase-01.4-final-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.4-final-consistency-report.md), [`docs/crm/phase-01.5-final-adversarial-consistency-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.5-final-adversarial-consistency-report.md), [`docs/crm/phase-01.6-final-safety-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.6-final-safety-corrections-report.md), [`docs/crm/phase-01.7-adversarial-verification-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.7-adversarial-verification-report.md), [`docs/crm/phase-01.8-final-adversarial-corrections-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.8-final-adversarial-corrections-report.md), [`docs/crm/phase-01.9-final-transaction-safety-report.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.9-final-transaction-safety-report.md), [`docs/crm/phase-01.10-final-recovery-and-governance-audit.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.10-final-recovery-and-governance-audit.md), [`docs/crm/phase-01.11-final-safety-and-traceability-review.md`](file:///Users/balakrishna/apply_citrux/docs/crm/phase-01.11-final-safety-and-traceability-review.md)  

---

## 1. Minimal Canonical Lifecycle Definition

To balance sales velocity with enterprise operational rigor, the CRM lifecycle is modeled as an **8-state deterministic finite state machine**:

```
                       ┌──────────────────────┐
                       │         NEW          │ (Unassigned Triage Queue)
                       └──────────┬───────────┘
                                  │ [Requires Owner Assignment]
                                  ▼
                       ┌──────────────────────┐
                       │      CONTACTED       │
                       └─────┬──────────┬─────┘
                             │          │
             ┌───────────────┘          └───────────────┐
             ▼                                          ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│  CONSULTATION_SCHEDULED │               │        QUALIFYING       │
└────────────┬────────────┘               └─────────────┬───────────┘
             │                                          │
             └───────────────────┬──────────────────────┘
                                 │ [All 4 Admission Gates Verified]
                                 ▼
                      ┌──────────────────────┐
                      │      QUALIFIED       │ (Proposal & Agreement In-Flight)
                      └──────────┬───────────┘
                                 │ [Executed Agreement via convertLeadAction]
                                 ▼
                     ┌────────────────────────┐
                     │ CONVERTED [TERMINAL 1] │ (Permanently Immutable)
                     └────────────────────────┘

    [From Any Active State] ──► DISQUALIFIED [CLOSED 1] (Requires Structured Reason)
    [From Any Active State] ──► LOST         [CLOSED 2] (Requires Structured Reason)
```

### 1.1 Status Definitions & Operational Semantics

| Status Enum | Classification | Operational Meaning | Mandatory Conditions & Pre-requisites |
|---|---|---|---|
| `NEW` | Initial Ingestion | Fresh inbound inquiry or manually created lead. Initial unassigned state. | Ingestion completed via `/api/leads/ingest` or manual staff entry. Subject to organization Triage SLA (4 business hours). Owner assignment optional while in triage. |
| `CONTACTED` | Active Outreach | First outreach attempt initiated (call, email, SMS). Awaiting prospect reply. | Assigned owner **strictly required**. At least one outreach activity logged in `LeadActivity`. Mandatory `nextFollowUpAt` and `nextActionNote`. |
| `CONSULTATION_SCHEDULED` | Active Engagement | Prospect agreed to a consultation/discovery call; calendar time is locked. | Confirmed consultation timestamp (`consultationScheduledAt`), calendar debrief notes. Assigned owner required. |
| `QUALIFYING` | In-Depth Review | Discovery dialogue held. Actively evaluating role alignment, sponsorship, budget, and service fit. | Consultation debrief logged. Qualification checklist partially or fully populated. Assigned owner required. |
| `QUALIFIED` | Admissions Approved | All 4 Qualification Gates satisfied and verified. Formal service proposal presented to lead. | All 4 Qualification Gates verified. CBOS `ContractServiceType` selected. Admissions sign-off recorded. Assigned owner required. |
| `CONVERTED` | Terminal Success | Service agreement signed, deposit paid, or terms executed. Lead handed off to CBOS and Candidate Core. | Successful execution of `convertLeadAction`. Permanent, immutable terminal state. Mandatory foreign keys `convertedCustomerAccountId` and `convertedContractId` populated; `convertedCandidateId` populated for Candidate Scenarios A/B/C (null for Scenario D). `LeadStageHistory` row committed. |
| `DISQUALIFIED` | Terminal Closed | Lead rejected by organization due to objective ineligibility (unsupported visa, budget shortfall, policy breach, spam). | Structured `disqualificationReasonCategory` and explanatory notes required. |
| `LOST` | Terminal Closed | Lead was eligible but dropped out (ghosted, chose competitor, deferred search, declined terms, duplicate). | Structured `lostReasonCategory` and minimum outreach attempt count satisfied (except for immediate intake duplicates). |

---

## 2. State Transition Rules & Permitted Pathways

### 2.1 Transition Matrix

| Current State | Permitted Next State | Required Staff Permission | Transition Guard / Enforcement Rule | Mandatory Data Required |
|---|---|---|---|---|
| `NEW` | `CONTACTED` | `crm:lead:stage_transition` | Owner must be assigned. Outreach activity logged simultaneously. | Assigned `ownerId`, outreach `LeadActivity`, `nextFollowUpAt`, `nextActionNote`. |
| `NEW` | `DISQUALIFIED` | `crm:lead:stage_transition` | Spam or obvious bot submission. **No individual owner required.** | `disqualificationReasonCategory`. (Actor recorded in `LeadStageHistory`). |
| `NEW` | `LOST` | `crm:lead:stage_transition` | Immediate withdrawal or duplicate submission. **No individual owner required.** | `lostReasonCategory`. (Actor recorded in `LeadStageHistory`). |
| `CONTACTED` | `CONSULTATION_SCHEDULED`| `crm:lead:stage_transition` | Call time scheduled. | `consultationScheduledAt`, calendar notes, updated `nextFollowUpAt`. |
| `CONTACTED` | `QUALIFYING` | `crm:lead:stage_transition` | Direct discussion held without calendar booking (fast-track). | Discovery call log or notes, updated `nextFollowUpAt`. |
| `CONTACTED` | `DISQUALIFIED` | `crm:lead:stage_transition` | Prospect revealed disqualifying criteria during initial contact. | `disqualificationReasonCategory`. |
| `CONTACTED` | `LOST` | `crm:lead:stage_transition` | Unresponsive after $\ge 3$ verified outreach attempts across $\ge 5$ business days. | `lostReasonCategory`, minimum 3 logged attempts in `LeadActivity`. |
| `CONSULTATION_SCHEDULED` | `QUALIFYING` | `crm:lead:stage_transition` | Consultation completed; discovery notes entered. | Meeting debrief notes in `LeadActivity`, updated `nextFollowUpAt`. |
| `CONSULTATION_SCHEDULED` | `LOST` | `crm:lead:stage_transition` | No-show to scheduled consultation; failed to reschedule after 2 attempts. | `lostReasonCategory = NO_SHOW_UNRESPONSIVE`. |
| `QUALIFYING` | `QUALIFIED` | `crm:lead:stage_transition` | All 4 Qualification Gates verified. | Full qualification checklist data, `selectedServiceTier`. |
| `QUALIFYING` | `DISQUALIFIED` | `crm:lead:stage_transition` | Ineligible work authorization or unserviceable target role detected. | `disqualificationReasonCategory`. |
| `QUALIFYING` | `LOST` | `crm:lead:stage_transition` | Prospect declined proposed pricing or chose alternative. | `lostReasonCategory`. |
| `QUALIFIED` | `CONVERTED` | `crm:lead:convert` (Only via `convertLeadAction`) | Formal agreement signed or terms accepted. Hand-off to CBOS / Candidate Core. Lead must NOT have an active conversion in flight (`leads.active_conversion_operation_id IS NULL`) and must NOT be quarantined (`leads.quarantine_conversion_operation_id IS NULL`). If a previous conversion operation entered compensation on this lead, conversion remains strictly BLOCKED until compensation settles. | Agreement reference, billing email, service tier, `conversionIdempotencyKey`. |
| `QUALIFIED` | `LOST` | `crm:lead:stage_transition` | Prospect stalled at contract signature stage and expired. | `lostReasonCategory`. |
| `DISQUALIFIED`| `NEW` | `crm:admin:configure` | Reopening closed lead due to changed eligibility or successful appeal. | Mandatory `reopenReason` text. |
| `LOST` | `NEW` / `CONTACTED` | `crm:lead:stage_transition` | Prospect re-engaged, replied to marketing drip, or returned. | Mandatory `reopenReason` text, assigned owner. |
| `CONVERTED` | *(None)* | **BLOCKED** | **STRICTLY IMMUTABLE.** Converted leads cannot transition backward. | N/A |

---

## 3. Qualification Criteria & The Proposal Period

### 3.1 The 4 Admissions Qualification Gates
Advancing a lead to `QUALIFIED` requires satisfying all four authoritative gates:
1. **Work Authorization Eligibility:** Verified citizenship, permanent residency, work visa, or approved sponsorship pathway matching OOS [`WorkAuthorizationStatus`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L54).
2. **Target Role & Domain Serviceability:** Target job titles align with the organization's sourcing capabilities.
3. **Experience Baseline Verification:** Total years of experience ($\ge 0$) and technical background meet minimum thresholds for the requested program.
4. **Commercial Commitment & Tier Alignment:** Prospect has reviewed pricing terms and selected a valid CBOS [`ContractServiceType`](file:///Users/balakrishna/apply_citrux/prisma/schema.prisma#L2425) (`CAREER_ACCELERATION`, `PLACEMENT_RETAINER`, `CONTINGENT_PLACEMENT`, `ENTERPRISE_TALENT_SEARCH`, `EXECUTIVE_COACHING`).

### 3.2 The Proposal & Decision In-Flight Period
- When a lead reaches `QUALIFIED`, formal service proposals or contract terms are presented to the prospect.
- The lead **remains in `QUALIFIED` status** while reviewing, negotiating, or arranging payment.
- `nextFollowUpAt` tracks the proposal expiration date or planned check-in call.
- If terms are signed $\rightarrow$ staff executes `convertLeadAction`, moving status to `CONVERTED`.
- If the proposal is declined or expires without response $\rightarrow$ staff executes transition to `LOST` with structured reason `FINANCIAL_CONSTRAINTS`, `WENT_WITH_COMPETITOR`, or `NO_REPLY_EXHAUSTED`.

---

## 4. Structured Terminal Reason Taxonomy

Closed states require a mandatory structured enum category supplemented by optional context notes:

### 4.1 Disqualification Reason Categories (`DisqualificationReasonCategory`)
1. `WORK_AUTHORIZATION_INELIGIBLE`: Candidate holds visa or authorization type not supported by target employers or program policies.
2. `SERVICE_TIER_MISMATCH`: Target role is outside the organization's domain (e.g. medical residency, retail hourly work).
3. `EXPERIENCE_DEFICIT`: Background does not meet minimum technical or professional thresholds for program entry.
4. `UNREALISTIC_EXPECTATIONS`: Compensation or role expectations impossible given current market conditions.
5. `GEOGRAPHIC_RESTRICTION`: Candidate resides outside serviceable geographic markets.
6. `POLICY_VIOLATION`: Candidate attempted fraud, abusive behavior, or falsified application materials.
7. `SPAM_SUBMISSION`: Automated bot entry or nonsensical test payload from public intake.
8. `OTHER`: Exceptional operational disqualification (requires mandatory text notes).

### 4.2 Lost Reason Categories (`LostReasonCategory`)
1. `WENT_WITH_COMPETITOR`: Chose alternative placement agency or coaching provider.
2. `FINANCIAL_CONSTRAINTS`: Unable or unwilling to afford program retainer / success fee structure.
3. `TIMING_POSTPONED`: Delayed job search due to personal circumstances (planned pause).
4. `NO_REPLY_EXHAUSTED`: Ghosted after repeated outreach attempts across multiple channels.
5. `NO_SHOW_UNRESPONSIVE`: Did not attend scheduled consultation and failed to reschedule.
6. `ACCEPTED_INTERNAL_PROMOTION`: Received internal offer at current employer; stopped job search.
7. `DECIDED_AGAINST_SEARCH`: Decided to pause career transition entirely.
8. `INTAKE_DUPLICATE`: Prospect submitted multiple duplicate web forms; redundant record closed.
9. `OTHER`: Alternative lost reason (requires mandatory text notes).

---

## 5. Reopening Behavior & Safety Guards

1. **Terminal Immutability of Converted Leads:**  
   Once a lead is `CONVERTED`, the lead row is frozen. The individual is now an active Candidate and/or Customer. Any subsequent re-engagement (e.g. alumni returning for second job placement) is handled either through CBOS contract renewal or by creating a fresh linked `Lead` marked with `source: ALUMNI_REFERRAL`.
2. **Reopening `DISQUALIFIED` Leads:**  
   A disqualified lead can only be reopened by a staff member holding `crm:admin:configure` authority. The reopen action requires an explanatory `reopenReason` and resets the stage to `NEW` for re-triage.
3. **Reopening `LOST` Leads:**  
   If a lost prospect responds to a marketing re-engagement campaign, any staff member with `crm:lead:stage_transition` may reopen the lead to `NEW` or `CONTACTED`. The system automatically emits a `LEAD_REOPENED` audit event.

---

## 6. Ownership, Next Actions & Stage History Rules

### 6.1 Owner Assignment & Triage Queue
- **Unassigned Triage Queue:** Inbound leads ingested via public API start with `assignedStaffId = NULL` in status `NEW`.
- **Triage SLA:** Organizations enforce a default 4-business-hour response SLA on unassigned `NEW` leads.
- **Claiming vs Assignment:** Any active sales employee may "Claim" an unassigned lead. Team Leads and Admins can assign unassigned leads to any active sales specialist.
- **Mandatory Ownership Guard:** Transitioning a lead from `NEW` to any active stage (`CONTACTED`, `CONSULTATION_SCHEDULED`, `QUALIFYING`, `QUALIFIED`, `CONVERTED`) **strictly requires** an assigned owner (`assignedStaffId != NULL`).
- **Direct Disqualification Exception:** Unassigned `NEW` leads that are spam, bot submissions, or immediate duplicates may be transitioned directly to `DISQUALIFIED` or `LOST` by triage staff without assigning a persistent owner. The `LeadStageHistory` records `actorId = ctx.userId`.

### 6.2 Next-Action Requirement (Zero Stalled Leads Policy)
- **Unassigned `NEW` Leads:** `nextFollowUpAt` is optional while a lead sits in the unassigned triage queue.
- **Assigned & Active Leads:** Once assigned or transitioned to `CONTACTED`, `CONSULTATION_SCHEDULED`, `QUALIFYING`, or `QUALIFIED`, the lead **must maintain**:
  1. `nextFollowUpAt`: DateTime indicating the scheduled date for next outreach.
  2. `nextActionNote`: Brief text describing the planned action (e.g. "Call to review counter-offer strategy", "Send agreement draft").
- **Overdue Follow-up Detection:** Any lead where `nextFollowUpAt < NOW()` while in an active stage is flagged as `OVERDUE_FOLLOW_UP` in the Workbench and surfaced in the urgent follow-ups queue.

### 6.3 WCOS Capacity & Task Independence Invariant
> [!IMPORTANT]
> **Strict Domain Isolation:** Sales follow-up dates (`nextFollowUpAt`) and outreach reminders exist exclusively within the CRM domain. They do **not** create rows in `tasks` or `wcos_work_items`, do **not** consume WCOS Capacity Units (CU), and do **not** alter employee delivery dispatch queues unless a future, separately approved RFC explicitly bridges sales tasks to WCOS.

### 6.4 Append-Only Stage History (`LeadStageHistory`)
Every change of `status` must atomically append a row to `lead_stage_histories`:
- `id`: UUID (Primary Key)
- `organizationId`: UUID (Tenant scope)
- `leadId`: UUID (Parent lead)
- `fromStatus`: LeadStatus (Nullable for initial creation)
- `toStatus`: LeadStatus (New stage)
- `actorId`: UUID (Staff user performing the transition, or system user for intake)
- `reasonCategory`: String (Nullable, populated on `DISQUALIFIED` / `LOST`)
- `reasonText`: String (Nullable, detailed context)
- `durationInPreviousStageSeconds`: BigInt (Calculated time spent in previous stage)
- `createdAt`: DateTime (Timestamptz)

This log is append-only, enforced by PostgreSQL RLS with zero `UPDATE` or `DELETE` permissions.
