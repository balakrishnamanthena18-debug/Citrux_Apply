# PHASE 10H-A — WORKFORCE & CAPACITY OPERATIONS SYSTEM (WCOS)
## PRODUCT CONTRACT & OPERATIONAL DESIGN LOCK

**Phase Status:** DESIGN LOCKED / CONTRACT SPECIFICATION ONLY  
**Implementation Authorization:** NOT AUTHORIZED (Design Lock Phase Only)  
**Authoritative Context:** OOS Core (Phases 0–7), Interview OS (Phase 8), OPOS (Phase 9), CBOS (Phase 10)  
**Document Classification:** Authoritative Architectural Contract & Domain Specification  

---

## 1. Executive Summary

The **Workforce & Capacity Operations System (WCOS)** establishes the authoritative operational control plane for Open Operating System (OOS). Operating strictly between business demand and human execution, WCOS orchestrates operational work allocation, workload visibility, capacity measurement, deterministic dispatch, SLA preservation, proactive reassignments, and multi-tier escalations.

WCOS adheres strictly to the core OOS doctrine:
> **"People should not manage the business around the system. The system should manage the business around the people."**

WCOS does **not** replace the frozen `Task` entity (Phase 4). Instead, WCOS introduces an operational control envelope—the **Work Item Projection**—that governs routing, queue aging, capacity consumption, capability matching, and SLA tracking while delegating execution semantics to `Task` and business state truth to originating domain entities (`Application`, `ApplicationQaReview`, `Interview`, `PlacementRecord`, `CustomerAccount`).

---

## 2. Business Problem

Across OOS, operational business demand is generated concurrently from multiple upstream domains:
1. **Candidate Onboarding & Career Intake** (Profile readiness, document collection)
2. **Application Processing & Tailoring** (Resume tailoring, cover letter preparation, screening answers)
3. **Application Quality Assurance** (QA reviews, compliance checks, consent validation)
4. **Interview Operations** (Prep sessions, debriefs, scheduling coordination)
5. **Offer & Placement Operations** (Offer review, compensation negotiation, verification)
6. **Commercial & Billing Operations** (Contract drafting, invoicing, payment follow-up)

Without an authoritative workforce control plane, operations suffer from fundamental pathologies:
- **Opaque Demand:** Operations managers cannot quantify total active operational load across departments.
- **Static & Unequal Workload:** Assigning 10 simple follow-ups is treated identically to 10 complex multi-hour resume rewrites.
- **Silent SLA Erosion:** Tasks drift toward deadlines without automated warning or capacity-aware reassignment.
- **Skill Mismatch & Cherry-Picking:** High-complexity tasks are claimed by underqualified personnel or avoided in favor of low-effort tasks.
- **Siloed Overload:** High-performing employees become bottlenecked with unsustainable backlogs while others remain idle.
- **Disjointed Escalations:** Escalations consist of unstructured chat notifications rather than deterministic operational state changes.

---

## 3. Product Objective

WCOS provides real-time, deterministic, and auditable answers to the 15 core operational workforce questions:
1. **What work exists?** Canonical catalog of all pending work demand across all OOS domains.
2. **How much work exists?** Quantitative measurement using standardized **Capacity Units (CU)** rather than simple item counts.
3. **Who owns it?** Clear single-threaded ownership with historical continuity.
4. **Who should receive it?** Deterministic capability- and capacity-matched dispatch.
5. **Who has capacity?** Real-time effective capacity tracking (Total Schedule $-$ Active Workload $-$ Reserved Capacity).
6. **Who has the required capability?** Structured capability tags and proficiency levels.
7. **What is urgent?** Multi-factor priority scoring driven by business impact and SLA countdown.
8. **What is approaching SLA breach?** Predictive warning thresholds before deadlines expire.
9. **Who is overloaded?** Automated detection of employees exceeding maximum utilization thresholds ($> 100\%$).
10. **Who is underutilized?** Automated routing to qualified employees with available capacity ($< 60\%$).
11. **What work should be reassigned?** Triggered reassignments on employee unavailability, prolonged blocking, or impending breach.
12. **What work is blocked?** Categorized blocking states with explicit reasons, owners, and unblock deadlines.
13. **What requires escalation?** Four-tier escalation state machine creating actionable operational responsibility.
14. **What work can safely wait?** Backlog triage preserving focus on urgent commitments.
15. **What work must never wait?** Priority fast-tracking for compliance, candidate consent, offer acceptance, and commercial verification.

---

## 4. Domain Position

WCOS sits directly between **Business Demand Generators** and **Human Execution Units**.

```
+---------------------------------------------------------------------------------------------------+
|                                  UPSTREAM BUSINESS DOMAINS                                        |
|  Candidate Core | Application Core | QA Engine | Interview OS | OPOS (Placement) | CBOS (Billing) |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v [Work Demand / Operational Trigger]
+---------------------------------------------------------------------------------------------------+
|                                 WORKFORCE CONTROL PLANE (WCOS)                                    |
|                                                                                                   |
|   +-----------------------+     +------------------------+     +------------------------------+   |
|   |   WORK QUEUE ENGINE   | --> | DETERMINISTIC DISPATCH | --> | CAPACITY & WORKLOAD TRACKER  |   |
|   | Priority, Aging, Tier |     | Capability & Scoring   |     | Capacity Units, Availability |   |
|   +-----------------------+     +------------------------+     +------------------------------+   |
|                                             |                                                     |
|                                             v                                                     |
|                           +-----------------------------------+                                   |
|                           |      SLA & ESCALATION ENGINE      |                                   |
|                           | Warning, Breach, Reassignment     |                                   |
|                           +-----------------------------------+                                   |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v [Controlled Task Projection & Envelope]
+---------------------------------------------------------------------------------------------------+
|                                      TASK EXECUTION PLANE                                         |
|                      public.tasks (Phase 4 Canonical Unit of Human Execution)                     |
|                                                  |                                                |
|                                                  v                                                |
|                                         EMPLOYEE WORKSPACE                                        |
+---------------------------------------------------------------------------------------------------+
```

---

## 5. Domain Boundaries

To preserve architectural integrity, WCOS maintains strict boundaries:
- **`Task` Domain (Phase 4):** Owns execution semantics (checklists, state transitions, internal notes, candidate/job associations). WCOS does **not** duplicate tasks.
- **`Candidate` / `Application` Domains:** Own candidate career profile, resume documents, job matches, and application statuses. WCOS only tracks the operational effort required to process them.
- **`QA` Domain (Phase 5):** Owns QA reviews, criteria verification, and pass/fail decisions. WCOS manages reviewer allocation and QA turnaround time.
- **`Interview OS` (Phase 8):** Owns scheduling, interview structures, feedback, and debrief notes. WCOS manages interview specialist prep load.
- **`OPOS` (Phase 9):** Owns offer versions, candidate decisions, joining records, and placement verifications. WCOS manages specialist verification turnaround.
- **`CBOS` (Phase 10):** Owns contracts, invoices, payments, credits, and revenue attribution. WCOS manages manual invoicing follow-ups and dispute resolutions.
- **`Audit` Domain:** Owns immutable tenant audit history. WCOS emits structured audit events for every dispatch, assignment, reassignment, and override.

---

## 6. Core Concepts

WCOS is governed by 10 foundational operational entities:

```
[Work Demand] ---> [Work Queue] ---> [Work Item (Task Envelope)]
                                             |
                   +-------------------------+-------------------------+
                   |                         |                         |
                   v                         v                         v
         [Capacity Profile]            [Capability]              [SLA Policy]
                   |                         |                         |
                   +-------------------------+-------------------------+
                                             |
                                             v
                                    [Dispatch Decision]
                                             |
                                             v
                                  [Employee Assignment]
```

---

## 7. Work Demand

**Work Demand** represents raw operational necessity triggered by an upstream event.

### 7.1 Demand Types & Sources

| Demand Type Code | Upstream Source Domain | Triggering Event | Default Weight | Target Capability Required |
| :--- | :--- | :--- | :--- | :--- |
| `DEMAND_CANDIDATE_INTAKE` | Candidate Core | New Candidate Profile Created | 2 CU | `CAP_CANDIDATE_ONBOARDING` |
| `DEMAND_RESUME_TAILORING` | Application Core | Match Selected / Application Initiated | 5 CU | `CAP_RESUME_ENGINEERING` |
| `DEMAND_SCREENING_ANSWERS`| Application Core | Application Requires Custom Screening | 3 CU | `CAP_APPLICATION_PREP` |
| `DEMAND_APPLICATION_QA`   | QA Engine | Application Ready for QA Review | 3 CU | `CAP_QA_COMPLIANCE` |
| `DEMAND_SUBMISSION_EXEC`  | Submission Core | Candidate Approved Application | 2 CU | `CAP_SUBMISSION_OPS` |
| `DEMAND_INTERVIEW_PREP`   | Interview OS | Interview Scheduled with Employer | 4 CU | `CAP_INTERVIEW_COACHING` |
| `DEMAND_OFFER_REVIEW`     | OPOS | Offer Received from Employer | 4 CU | `CAP_OFFER_NEGOTIATION` |
| `DEMAND_PLACEMENT_VERIFY` | OPOS | First Day Proof Submitted | 3 CU | `CAP_PLACEMENT_OPS` |
| `DEMAND_COMMERCIAL_BILL`  | CBOS | Placement Verified / Invoice Pending | 2 CU | `CAP_BILLING_OPS` |
| `DEMAND_ESCALATION_RESOLV`| WCOS / Governance | SLA Breach Level 3/4 Triggered | 5 CU | `CAP_OPS_MANAGEMENT` |

---

## 8. Work Item (Architectural Resolution)

### 8.1 Canonical Decision: Controlled Operational Wrapper & Projection

> **ARCHITECTURAL DECISION LOCK:**  
> A `Work Item` in WCOS is **NOT** a separate, competing canonical entity that duplicates `public.tasks`.  
> A `Work Item` is a **Controlled Operational Projection & State Envelope** anchored $1:1$ to `public.tasks`.

### 8.2 Attribute Schema & Operational Envelope

Every Work Item projection comprises:
- `taskId`: UUID (Primary Key, Foreign Key to `public.tasks.id`)
- `organizationId`: UUID (Multi-tenant partition)
- `queueId`: UUID (Target routing queue)
- `workType`: `WorkDemandType` enum
- `capacityUnitsWeight`: Integer ($1 \text{ to } 20\text{ CU}$)
- `requiredCapabilityCode`: String (e.g. `CAP_RESUME_ENGINEERING`)
- `requiredProficiencyLevel`: Integer ($1 \text{ [Junior]} \text{ to } 3 \text{ [Senior]}$)
- `slaPolicyId`: UUID (Associated SLA configuration)
- `slaTargetAt`: Timestamp (Calculated hard deadline)
- `slaWarningAt`: Timestamp (Calculated warning threshold)
- `slaBreachedAt`: Timestamp nullable (Actual breach timestamp)
- `slaPausedDurationMs`: BigInt default 0 (Cumulative paused time during approved blocked states)
- `blockingCategory`: `BlockingCategory` nullable
- `blockedAt`: Timestamp nullable
- `unblockExpectedAt`: Timestamp nullable
- `escalationLevel`: Integer ($0 \text{ [Normal]} \text{ to } 4 \text{ [Executive]}$)
- `dispatchMode`: `AUTO` | `MANUAL` | `SELF_CLAIM` | `OVERRIDE`
- `dispatchReason`: String (Traceable explanation of assignment)
- `dispatchScore`: Decimal nullable (Algorithmic match score)
- `continuityCandidateId`: UUID nullable (Candidate affinity link)

---

## 9. Work Queue Model

Work Queues serve as partitioned operational holding areas for unassigned or pending work items.

```
+-----------------------------------------------------------------------------------+
|                                  ORGANIZATION QUEUE                               |
|                                                                                   |
|  +---------------------------+  +--------------------------+  +-----------------+  |
|  |     TEAM QUEUES           |  |     SPECIALTY QUEUES     |  | ESCALATION QUEUE|  |
|  | - Candidate Onboarding    |  | - Executive Resume Prep  |  | - Tier 3 Breach |  |
|  | - Application QA Review   |  | - Complex Negotiation    |  | - Tier 4 Mgmt   |  |
|  | - Placement Operations    |  | - Billing Disputes       |  |                 |  |
|  +---------------------------+  +--------------------------+  +-----------------+  |
+-----------------------------------------------------------------------------------+
```

### 9.1 Queue Structure & Dimensions
- `Queue ID & Name`: Unique queue identifier within organization.
- `Queue Scope`: Organization-wide, Team-specific, or Capability-restricted.
- `Ordering Policy`: Strict SLA Urgency First ($\text{SLA Deadline} \uparrow$, then $\text{Priority} \downarrow$, then $\text{Created Date} \uparrow$).
- `Queue Thresholds`:
  - `Max Queue Depth`: Maximum pending items before automatic manager warning.
  - `Aging Alert Threshold`: Maximum unassigned wait time before auto-escalation.

---

## 10. Capacity Profile Model

WCOS replaces primitive task-count metrics with a deterministic **Capacity Unit (CU)** system.

### 10.1 Capacity Mathematical Definition
$$1\text{ Capacity Unit (CU)} \equiv 15\text{ minutes of standard focused operational execution.}$$

- Standard Full-Time Employee (8-hour day) = $32\text{ Standard Capacity Units / Day}$.
- Workday Allowance = $28\text{ Allocated Units} + 4\text{ Reserved Overhead Units}$ (meetings, admin).

### 10.2 Employee Capacity Equation
For any employee $E$ on day $D$:
$$\text{Max Capacity}(E) = \text{Base Working Hours}(E) \times 4\text{ CU/hour}$$
$$\text{Reserved Capacity}(E) = \text{Scheduled Meetings} + \text{Administrative Buffer}$$
$$\text{Active Workload}(E) = \sum_{i \in \text{AssignedWorkItems}(E)} \text{CU Weight}(i)$$
$$\text{Effective Available Capacity}(E) = \text{Max Capacity}(E) - \text{Reserved Capacity}(E) - \text{Active Workload}(E)$$
$$\text{Utilization Percentage}(E) = \left( \frac{\text{Active Workload}(E)}{\text{Max Capacity}(E) - \text{Reserved Capacity}(E)} \right) \times 100\%$$

---

## 11. Employee Availability Lifecycle

Employee availability defines whether an employee can receive new dispatches or continue active work.

```
       +------------------+
       |     INACTIVE     |
       +------------------+
                 |
                 v (Schedule Activated)
       +------------------+ <---------------------------------------------+
       |    AVAILABLE     |                                               |
       +------------------+                                               |
         |              |                                                 |
(Load > 85%)      (Meeting/Admin)                                         |
         v              v                                                 |
+----------------+ +--------------+                                       |
|      BUSY      | |   LIMITED    |                                       |
+----------------+ +--------------+                                       |
         |              |                                                 |
(Load >= 100%)    (PTO/Out of Office)                                     |
         v              v                                                 |
+----------------+ +--------------+                                       |
|  UNAVAILABLE   | |    LEAVE     | --------------------------------------+
+----------------+ +--------------+ (Return to Active Schedule)
```

### 11.1 Availability Matrix

| Availability State | Accepts Auto-Dispatch? | Accepts Urgent/Breach Work? | Retains In-Progress Work? | Triggers Auto-Reassignment? |
| :--- | :---: | :---: | :---: | :---: |
| `AVAILABLE` | **YES** | **YES** | **YES** | **NO** |
| `LIMITED` | **NO** (Unless Priority = Critical) | **YES** | **YES** | **NO** |
| `BUSY` | **NO** | **YES** (With Override) | **YES** | **NO** |
| `UNAVAILABLE` | **NO** | **NO** | **YES** (Paused) | **YES** (If SLA $< 4\text{ hrs}$) |
| `LEAVE` | **NO** | **NO** | **NO** | **YES** (Immediate full queue drain) |
| `INACTIVE` | **NO** | **NO** | **NO** | **YES** (Immediate reassignment) |

---

## 12. Capability Matrix & Skill Verification

Capabilities represent verifiable operational skills required to execute specific work demands.

### 12.1 Canonical Capability Codes

| Capability Code | Description | Verified Criteria |
| :--- | :--- | :--- |
| `CAP_CANDIDATE_ONBOARDING` | Intake, document collection, profile vetting | Completed onboarding training |
| `CAP_RESUME_ENGINEERING` | Technical ATS-compliant resume restructuring | Passed technical resume benchmarking |
| `CAP_APPLICATION_PREP` | Screening questions, custom cover letters | Application tailoring certified |
| `CAP_QA_COMPLIANCE` | Independent verification against QA checklist | Staff QA auditor designation |
| `CAP_SUBMISSION_OPS` | Job board & employer portal submission | Certified submission operator |
| `CAP_INTERVIEW_COACHING` | Mock interviews, candidate briefing, debrief | Senior recruiter/coach designation |
| `CAP_OFFER_NEGOTIATION` | Compensation analysis, counter-offers | Negotiation specialist certification |
| `CAP_PLACEMENT_OPS` | First-day verification, onboarding proof audit | Placement operations specialist |
| `CAP_BILLING_OPS` | CBOS contract terms, invoicing, payment audits | Financial/operations specialist |
| `CAP_OPS_MANAGEMENT` | Escalation resolution, override authorization | Team Lead / Manager role |

---

## 13. Workload Measurement

WCOS implements a **Hybrid Workload Model**:
1. **Primary Metric (Capacity-Weighted):** Total active Capacity Units ($\sum \text{CU}$).
2. **Secondary Metric (Active Concurrency Count):** Maximum parallel in-flight tasks (to prevent cognitive fragmentation, capped at max 8 concurrent active items per employee).

### 13.1 Workload State Buckets
- `Assigned`: Dispatched, waiting for employee start.
- `In Progress`: Actively being worked on by employee.
- `Waiting`: Temporarily awaiting external input (candidate response, document).
- `Blocked`: Formally blocked on dependencies.
- `SLA At Risk`: Active work item with $< 20\%$ SLA window remaining.

---

## 14. Deterministic Dispatch Engine

WCOS employs a strict, deterministic multi-stage scoring algorithm for automated dispatch. **No opaque AI is permitted to make dispatch decisions.**

```
Incoming Work Item
        |
        v
[Stage 1: Hard Eligibility Filtering]
  - Organization Match
  - Required Capability Match
  - Availability != LEAVE/INACTIVE/UNAVAILABLE
  - Current Utilization < 100%
        |
        v
[Stage 2: Deterministic Scoring Matrix (0 to 100 Points)]
  - Available Capacity Score (0-40 pts)
  - Candidate Continuity Bonus (0-25 pts)
  - Team Alignment Bonus (0-20 pts)
  - Capability Proficiency Bonus (0-15 pts)
        |
        v
[Stage 3: Deterministic Tie-Breaking]
  1. Lowest Current Active CU Workload
  2. Longest Idle Duration since last task completion
  3. Stable Lexicographical UUID
        |
        v
Selected Employee Assigned
```

### 14.1 Scoring Formula
$$\text{Score}(E, W) = S_{\text{capacity}}(E) + S_{\text{continuity}}(E, W) + S_{\text{team}}(E, W) + S_{\text{proficiency}}(E, W)$$

- $S_{\text{capacity}}(E) = \left( \frac{\text{Effective Available Capacity}(E)}{\text{Max Capacity}(E)} \right) \times 40$
- $S_{\text{continuity}}(E, W) = 25$ if $E$ previously handled candidate for $W$, else $0$.
- $S_{\text{team}}(E, W) = 20$ if $E$ is in the designated team for queue, else $0$.
- $S_{\text{proficiency}}(E, W) = 15 \times \left( \frac{\text{Proficiency Level}(E, W)}{\text{Max Level}} \right)$

---

## 15. Assignment Lifecycle

The WCOS Assignment lifecycle integrates seamlessly with the frozen Phase 4 `TaskStatus` state machine:

```
                  +----------------------------------------------------+
                  |                      UNASSIGNED                    |
                  +----------------------------------------------------+
                                            |
                         (Auto-Dispatch / Manual Assignment)
                                            v
                  +----------------------------------------------------+
                  |                       ASSIGNED                     |
                  +----------------------------------------------------+
                        |                   |                   |
                  (Accept/Start)      (Reassign Req)      (Auto-Reassign on Expire)
                        v                   v                   v
                  +-------------+     +-------------+     +------------+
                  | IN_PROGRESS |     | REASSIGNED  |     | ESCALATED  |
                  +-------------+     +-------------+     +------------+
                   |     |    |
       (Blocked)   |     |    | (Ready for QA)
           +-------+     |    +------------+
           v             v                 v
     +---------+   +-----------+    +---------------+
     | BLOCKED |   | COMPLETED |    |   READY_FOR_  |
     +---------+   +-----------+    |     REVIEW    |
           |                        +---------------+
     (Unblocked)                           |
           v                               v
     [IN_PROGRESS]                      [QA / COMPLETED]
```

---

## 16. Reassignment Protocol

Reassignment transfers operational responsibility while preserving audit integrity and SLA countdown continuity.

### 16.1 Reassignment Triggers
1. **Employee Initiated:** Explicit reassignment request with mandatory reason code (`SKILL_MISMATCH`, `CAPACITY_OVERLOAD`, `UNEXPECTED_ABSENCE`).
2. **Manager Initiated:** Manual re-allocation from Manager Dispatch Desk.
3. **Automated SLA Protection:** Automatic trigger when work item reaches SLA Warning ($80\%$ elapsed) and assigned employee has not initiated work (`status == ASSIGNED`).
4. **Availability Change:** Employee transitions to `LEAVE` or `INACTIVE`.

### 16.2 Reassignment Invariant Laws
- **Law 1 (No SLA Reset):** Reassignment **never** resets or extends the original `slaTargetAt` deadline.
- **Law 2 (Capacity Adjustment):** Reassignment immediately deducts CU weight from previous assignee and allocates to new assignee.
- **Law 3 (Immutable Audit):** Full previous assignee history is appended to `public.task_state_history` and `public.audit_events`.

---

## 17. Deterministic Priority Model

WCOS enforces four discrete priority levels:

| Priority Level | Description | Target SLA Default | SLA Warning Threshold | Auto-Escalation Rule |
| :--- | :--- | :--- | :--- | :--- |
| `CRITICAL` | Time-sensitive offer/placement, compliance, candidate consent | 4 Hours | 2 Hours ($50\%$) | Direct to Manager at 2h |
| `HIGH` | QA review, scheduled interview preparation | 8 Hours | 6 Hours ($75\%$) | Auto-reassign at 6h if unstarted |
| `NORMAL` | Standard application resume tailoring & review | 24 Hours | 18 Hours ($75\%$) | Auto-warning at 18h |
| `LOW` | Background data enrichment, profile follow-up | 72 Hours | 54 Hours ($75\%$) | Backlog triage |

---

## 18. SLA Management & Clock Lifecycle

### 18.1 SLA Clock States
- **RUNNING:** Active task in `ASSIGNED`, `IN_PROGRESS`, `READY_FOR_REVIEW`, or `QA`.
- **PAUSED:** Permitted **only** during verified external blocking states (`WAITING_FOR_CANDIDATE`, `WAITING_FOR_DOCUMENT`).
- **EXPIRED / BREACHED:** Clock surpassed `slaTargetAt`.

### 18.2 Pausing Rules & Safeguards
- An employee cannot pause an SLA unilaterally without selecting a valid blocking category.
- When paused, cumulative `slaPausedDurationMs` increases.
- When unblocked, `slaTargetAt` is mathematically extended by exactly `slaPausedDurationMs`.
- Internal employee blocking (`WAITING_FOR_EMPLOYEE`, `CAPACITY_OVERLOAD`) **never pauses the SLA clock**.

---

## 19. Work Aging Metrics

WCOS computes live aging metrics across the operational lifecycle:
1. **Queue Age:** Duration spent in `UNASSIGNED` queue before dispatch.
2. **Acceptance Latency:** Time elapsed between `ASSIGNED` and transition to `IN_PROGRESS`.
3. **Execution Age:** Net active time spent in `IN_PROGRESS`.
4. **Blocked Age:** Duration in paused/blocked state.
5. **SLA Remaining:** $\text{Max}(0, \text{slaTargetAt} - \text{CurrentTime})$.
6. **Breach Overdue Age:** $\text{Max}(0, \text{CurrentTime} - \text{slaTargetAt})$ if breached.

---

## 20. Structured Work Blocking Taxonomy

WCOS replaces free-text blocking with a formal blocking taxonomy:

| Blocking Code | Category | SLA Clock Behavior | Auto-Unblock Trigger |
| :--- | :--- | :--- | :--- |
| `WAIT_CANDIDATE_INPUT` | External Candidate | **PAUSES SLA** | Candidate submits requested input/document |
| `WAIT_DOCUMENT_UPLOAD` | External Document | **PAUSES SLA** | Document verified in vault |
| `WAIT_EMPLOYER_FEEDBACK`| External Employer | **PAUSES SLA** | Feedback logged in Interview OS |
| `WAIT_QA_APPROVAL` | Internal Process | **RUNS SLA** | QA review completed |
| `WAIT_MANAGER_OVERRIDE`| Internal Governance | **RUNS SLA** | Manager approves/rejects override |
| `BLOCKED_SYSTEM_ERROR` | Infrastructure | **RUNS SLA** | Error resolved / retry executed |

---

## 21. Multi-Tier Escalation Model

Escalations in WCOS create explicit, auditable operational responsibility rather than passive notifications.

```
[Level 0: Normal Execution]
        |
    (SLA Warning Threshold Elapsed)
        v
[Level 1: SLA Warning]
  - Visual badge in Employee Workspace
  - Proactive dispatch engine warning
        |
    (SLA 90% Window Elapsed & Inactive)
        v
[Level 2: SLA At Risk]
  - Notification to Team Lead
  - Automatic eligibility for proactive reassignment
        |
    (SLA Deadline Exceeded)
        v
[Level 3: SLA Breached]
  - Work item flagged RED in Manager Dispatch Desk
  - SLA breach recorded in employee performance log
  - Mandatory manager triage
        |
    (Breached + 4 Hours Unresolved)
        v
[Level 4: Management Escalation]
  - High-priority routing to Operations Director / Admin
  - Capacity override & manual force-reassignment authorized
```

---

## 22. Manager Dispatch Desk Contract

The **Manager Dispatch Desk** is the operational command interface (to be implemented in UI phases) governed by this contract:
1. **Live Queue Telemetry:** Aggregate count and CU volume of unassigned, active, and blocked work by queue and team.
2. **Team Capacity Balance Matrix:** Real-time visual comparison of available vs. consumed CU across all team members.
3. **SLA Early Warning Radar:** Real-time list of all tasks in Level 1–4 escalation.
4. **Interactive Dispatch Controls:**
   - Single-click manual assignment.
   - Force-reassignment with mandatory reason.
   - Bulk queue redistribution for overloaded teams.
   - Capacity override for high-priority fast-tracking.

---

## 23. Employee Workspace Contract

The **Employee Workspace** provides focused, cognitive-overhead-free operational task execution:
1. **"What I Must Do Next":** Strict priority- and SLA-ordered list of active assignments.
2. **"Why This Is Mine":** Clear dispatch explanation (e.g., *"Assigned based on your Resume Engineering capability & candidate continuity"*).
3. **"My Daily Capacity Meter":** Clear visual display of consumed CU (e.g., $22/28\text{ CU}$) and available buffer.
4. **Action Triggers:**
   - `Start Work`: Transitions `ASSIGNED` $\rightarrow$ `IN_PROGRESS`.
   - `Block / Wait`: Opens structured blocking modal with reason codes.
   - `Request Reassignment`: Opens reassignment modal with structured justification.
   - `Submit for QA / Complete`: Triggers validation checklists and completes work item.

---

## 24. Team Capacity Aggregation

Team-level capacity is computed dynamically from member capacity profiles:

$$\text{Team Total Capacity} = \sum_{E \in \text{Team}} \text{Max Capacity}(E)$$
$$\text{Team Active Workload} = \sum_{E \in \text{Team}} \text{Active Workload}(E)$$
$$\text{Team Utilization} = \left( \frac{\text{Team Active Workload}}{\text{Team Total Capacity} - \sum \text{Reserved Capacity}} \right) \times 100\%$$

### 24.1 Team Capacity State Classifications
- **`UNDER_CAPACITY`:** $\text{Team Utilization} < 50\%$ (Eligible for inbound queue spillover).
- **`BALANCED`:** $50\% \le \text{Team Utilization} \le 85\%$ (Nominal operating zone).
- **`AT_CAPACITY`:** $85\% < \text{Team Utilization} \le 100\%$ (New assignments restricted to urgent only).
- **`OVER_CAPACITY`:** $\text{Team Utilization} > 100\%$ (Automated alert to Manager Dispatch Desk; triggers queue shedding).

---

## 25. Candidate Continuity Model

Candidate continuity minimizes context switching by preferring employees who have previously worked on a candidate's file.

### 25.1 Continuity Rules & Constraints
- **Preference, Not Absolute:** Continuity awards $+25\text{ points}$ in dispatch scoring.
- **Hard Constraints Override Continuity:** Continuity is **strictly bypassed** if:
  1. The continuous employee is `UNAVAILABLE`, `LEAVE`, or `INACTIVE`.
  2. The continuous employee's utilization is $\ge 100\%$ (`OVERLOADED`).
  3. The work demand requires a capability the continuous employee does not possess.
  4. The work item is `CRITICAL` and the continuous employee cannot meet the SLA deadline.

---

## 26. Manager Override Model

When operational crises or unique exceptions occur, managers require override authority.

### 26.1 Permitted Overrides
1. **Capacity Cap Override:** Assigning work to an employee currently at $\ge 100\%$ utilization.
2. **Capability Bypass Override:** Assigning work to an employee without verified capability code.
3. **Queue Re-routing Override:** Forcing work from one team queue into another.
4. **Priority Override:** Elevating priority to `CRITICAL`.

### 26.2 Mandatory Override Auditing
Every override must capture:
- `overrideByStaffId`: Staff UUID
- `overrideReason`: Structured justification code + text
- `originalDispatchRecommendation`: Algorithmic suggestion
- `persistedAuditAction`: `WCOS_MANAGER_OVERRIDE_RECORDED`

---

## 27. Complete Audit Trail Model

WCOS logs every operational state mutation to `public.audit_events` with transaction-level atomicity.

### 27.1 WCOS Audit Actions
- `WCOS_WORK_DEMAND_ENQUEUED`
- `WCOS_WORK_ITEM_DISPATCHED`
- `WCOS_WORK_ITEM_ACCEPTED`
- `WCOS_WORK_ITEM_STARTED`
- `WCOS_WORK_ITEM_BLOCKED`
- `WCOS_WORK_ITEM_UNBLOCKED`
- `WCOS_WORK_ITEM_REASSIGNED`
- `WCOS_WORK_ITEM_ESCALATED`
- `WCOS_SLA_WARNING_EMITTED`
- `WCOS_SLA_BREACH_RECORDED`
- `WCOS_CAPACITY_OVERLOAD_TRIGGERED`
- `WCOS_MANAGER_OVERRIDE_RECORDED`
- `WCOS_WORK_ITEM_COMPLETED`
- `WCOS_WORK_ITEM_CANCELED`

---

## 28. Multi-Tenancy & Data Isolation

WCOS operations are strictly partitioned by `organizationId`.
- No employee, team lead, or manager can view, query, claim, or dispatch work items belonging to another organization.
- Future implementation will enforce PostgreSQL Row Level Security (`FORCE RLS`) on all WCOS projection and queue tables.

---

## 29. Financial & Candidate Privacy

Workforce visibility must never compromise candidate or financial privacy:
- **Operational Data Only:** Work items expose only the operational instructions and entity links necessary to execute the task.
- **Financial Cloaking:** Non-billing employees see only work type `DEMAND_PLACEMENT_VERIFY` with placement checklist proofs; salary amounts, fee basis points, and CBOS invoices remain hidden behind CBOS authorization checks.
- **Candidate Data Minimization:** Resume tailoring specialists see career history and target job descriptions; PII and identity documents are restricted to verified onboarding/verification staff.

---

## 30. Failure & Resilience Model

| Failure Mode | Detection Mechanism | Automated Resilience Recovery |
| :--- | :--- | :--- |
| **Worker Dispatch Failure** | DB transaction timeout or exception | Work item remains in `UNASSIGNED` queue; retry on next worker tick. |
| **Capacity Calculation Error** | Schema validator or negative capacity | Fallback to default task capacity (3 CU); flag for background reconcile. |
| **Employee Inactivity / No-Show** | Zero activity on `ASSIGNED` item $> 2\text{ hours}$ | SLA Warning emitted; auto-reassigns at 50% SLA mark. |
| **Concurrent Dispatch Claim** | Postgres row lock (`SELECT FOR UPDATE`) | First transaction wins; second receives conflict and claims next item. |
| **Upstream Domain Rollback** | Domain cancellation event | WCOS transitions associated Work Item projection to `CANCELED`. |

---

## 31. Idempotency Matrix

| Operation | Idempotency Key Formulation | Behavior on Duplicate Submission |
| :--- | :--- | :--- |
| **Work Demand Intake** | `wcos-intake-{orgId}-{sourceEntity}-{demandType}` | Ignores duplicate; returns existing `taskId`. |
| **Dispatch Execution** | `wcos-dispatch-{taskId}-{dispatchVersion}` | Serializes; returns current authoritative assignment. |
| **Reassignment** | `wcos-reassign-{taskId}-{targetEmployeeId}-{timestamp}` | Executes single transfer; prevents double-reassignment. |
| **SLA Escalation** | `wcos-escl-{taskId}-{escalationLevel}` | Emits escalation state change exactly once. |

---

## 32. Role-Based Access Control (RBAC) Authority Matrix

| Operational Capability | Candidate | Employee | Team Lead | Operations Manager | Org Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| View Own Workspace & Tasks | **YES** (Own) | **YES** (Own) | **YES** | **YES** | **YES** |
| Accept / Start Own Work | **YES** | **YES** | **YES** | **YES** | **YES** |
| Request Reassignment (Self) | **NO** | **YES** | **YES** | **YES** | **YES** |
| Claim Work from Team Queue | **NO** | **YES** (Eligible) | **YES** | **YES** | **YES** |
| Reassign Team Member Tasks | **NO** | **NO** | **YES** (Team) | **YES** (Org) | **YES** (Org) |
| Override Capacity Cap | **NO** | **NO** | **NO** | **YES** | **YES** |
| Override Capability Requirements | **NO** | **NO** | **NO** | **YES** | **YES** |
| Configure Queues & SLA Policies | **NO** | **NO** | **NO** | **YES** | **YES** |
| View Org-Wide Capacity Telemetry | **NO** | **NO** | **YES** (Team) | **YES** (Org) | **YES** (Org) |

---

## 33. Domain Boundary Summary Table

| Domain | Entity Authority | WCOS Interaction | Forbidden Cross-Over |
| :--- | :--- | :--- | :--- |
| **Task (Phase 4)** | Execution state, checklist items, completion | WCOS wraps Task in operational projection | WCOS cannot create a competing task table |
| **QA (Phase 5)** | QA review criteria, pass/fail decisions | WCOS routes QA review to certified QA auditor | WCOS cannot override QA decision |
| **Interview OS (Phase 8)**| Schedules, feedback, debrief notes | WCOS assigns interview prep coaching | WCOS cannot mutate interview status |
| **OPOS (Phase 9)** | Offer negotiation, placement verification | WCOS assigns placement proof audit | WCOS cannot alter verified placement |
| **CBOS (Phase 10)** | Contracts, invoices, revenue attribution | WCOS assigns billing follow-up tasks | WCOS cannot alter ledger balances |

---

## 34. Non-Goals

WCOS explicitly excludes the following areas from its scope:
- **HRIS & Payroll:** No employee compensation, tax withholdings, bonuses, or payroll processing.
- **Time Clock / Surveillance:** No invasive screen tracking, keystroke monitoring, or micromanagement surveillance.
- **Leave System Authority:** WCOS consumes availability calendars from external/admin inputs; it does not manage vacation approvals.
- **Autonomous AI Dispatch Authority:** AI models may provide dispatch scoring suggestions in future phases, but all dispatch logic is strictly deterministic and rules-based.
- **External Freelancer Marketplace:** WCOS manages internal organizational employees and verified staff, not public crowdsourced contractors.

---

## 35. Master Architectural Decision Table

| # | Decision Area | Current Frozen State | Proposed WCOS State | Architectural Rationale | Authority | Dependencies | Future Extension |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Work Item Entity** | Standalone `Task` in Phase 4 | Controlled Operational Projection anchored $1:1$ to `Task` | Prevents split brain; leverages existing task execution infrastructure | WCOS Contract | Phase 4 Task | Dynamic workflow steps |
| **2** | **Workload Model** | Simple task count | Hybrid: Capacity Units (CU) + Concurrency limits | 1 resume rewrite $\neq$ 1 follow-up; balances real cognitive effort | WCOS Contract | Phase 4 Task | Historical task duration tuning |
| **3** | **Capacity Units** | Undefined | $1\text{ CU} \equiv 15\text{ minutes}$; $32\text{ CU/day standard}$ | Deterministic math enables objective load balancing | WCOS Contract | None | Role-specific baseline CU |
| **4** | **Queue Architecture** | Ad-hoc queries on `assignedEmployeeId` | Structured Queues (Team, Capability, Escalation) | Centralizes unassigned demand; prevents cherry-picking | WCOS Contract | RBAC / Teams | Geo-distributed queues |
| **5** | **Availability** | Boolean or basic status | 6-State Lifecycle (`AVAILABLE` to `INACTIVE`) | Explicitly controls dispatch eligibility and automated drains | WCOS Contract | Memberships | External calendar sync |
| **6** | **Capability Model** | Free-text / none | Structured verified capability codes + proficiency levels | Guarantees quality; eliminates skill mismatch | WCOS Contract | Admin settings | Auto-certification badges |
| **7** | **Dispatch Algorithm** | Manual assignment | Deterministic Multi-Stage Scoring (Capacity, Continuity, Team) | Transparent, fair, auditable; zero opaque black-box logic | WCOS Contract | Queues, Capacity | Advisory AI scoring |
| **8** | **Assignment State** | Basic TaskStatus | Integrated Lifecycle with auto-reassignment hooks | Seamless transition from creation to QA completion | Phase 4 + WCOS | TaskStatus | Multi-assignee subtasks |
| **9** | **Reassignment** | Manual update | Policy-driven with SLA clock preservation | Prevents tasks dying in inactive/overloaded queues | WCOS Contract | SLA Engine | Smart handoff notes |
| **10**| **SLA Model** | Basic `dueDate` | Multi-tier thresholds (Target, Warning, Breach, Paused) | Proactive breach prevention rather than reactive alerts | WCOS Contract | Governance | Custom candidate SLAs |
| **11**| **Priority Model** | `TaskPriority` enum | Deterministic 4-level model with SLA mapping | Standardizes urgency across all organization teams | WCOS Contract | TaskPriority | Client tier multiplier |
| **12**| **Work Aging** | None | Real-time queue, acceptance, execution, and blocked aging | Exposes operational bottlenecks and queue latency | WCOS Contract | Audit / Tasks | Executive latency heatmaps |
| **13**| **Blocking Model** | `blockedReason` string | Structured blocking taxonomy with SLA pause rules | Prevents bogus blocking; tracks external dependencies | WCOS Contract | Task Model | Automated webhook unblock |
| **14**| **Escalation** | Notification only | 4-Tier Operational Responsibility Escalation | Enforces managerial accountability for breached work | WCOS Contract | Admin / Ops | Auto-executive paging |
| **15**| **Continuity** | Ad-hoc | Weighted bonus (+25 pts) bounded by hard constraints | Balances candidate familiarity with team load balance | WCOS Contract | Candidate Core | Team affinity clusters |
| **16**| **Manager Desk** | Basic task table | Unified command surface with capacity balance & queue triage | Gives managers macro and micro workforce control | WCOS Contract | Manager Role | Real-time WebSocket feed |
| **17**| **Employee Desk** | Generic task view | Context-aware "What I Must Do Next" priority stream | Minimizes decision overhead for executing staff | WCOS Contract | Employee Role | Keyboard-first workbench |
| **18**| **Multi-Tenancy** | Org-scoped DB | Strict Org-partitioning with future RLS lock | Zero cross-tenant data leakage | OOS Core | RLS Helpers | Cross-org enterprise views |
| **19**| **Audit Integrity** | Standard audit | Atomic transaction audit logging for all WCOS state changes | 100% forensic reconstructability of work lifecycle | Audit System | PostgreSQL | Compliance export reports |
| **20**| **Failure Recovery**| Manual repair | Deterministic idempotency, transaction rollback, auto-drain | Zero lost work; zero orphaned tasks | WCOS Contract | PostgreSQL | Multi-region worker failover |

---

## 36. Operational Risks & Mitigations

1. **Risk: Employee Resistance to Capacity Measurement.**  
   *Mitigation:* Capacity units measure task complexity, not individual speed surveillance. WCOS balances workload to protect employees from burnout.
2. **Risk: Gaming the Blocking System to Pause SLAs.**  
   *Mitigation:* Internal employee delays cannot pause SLAs; only verified candidate/employer external blocks qualify and require auditable evidence.
3. **Risk: Cherry-Picking Easy Tasks from Queues.**  
   *Mitigation:* Self-claim is restricted to the top of the queue; deterministic auto-dispatch is the primary assignment channel.
4. **Risk: Manager Override Abuse.**  
   *Mitigation:* All overrides require mandatory justification codes and are permanently highlighted in manager audit reports.

---

## 37. Open Architectural Questions (Resolved in Contract)

- **Q1: Does WCOS require a new database table for Work Items?**  
  *Resolution:* WCOS introduces lightweight projection attributes (`wcos_work_item_metadata`) joined $1:1$ to `public.tasks`, ensuring zero duplication of task lifecycle truth.
- **Q2: How does WCOS handle part-time employees or non-standard shifts?**  
  *Resolution:* Daily capacity profiles define custom base working hours per employee membership, scaling standard 32 CU down to exact schedule parameters.
- **Q3: What happens when an employee goes on unplanned emergency leave?**  
  *Resolution:* Manager marks status as `LEAVE`, triggering the WCOS Auto-Drain worker to immediately reassign all non-completed tasks back to the team queue.

---

## 38. Implementation Readiness Checklist

- [x] Executive Summary & Business Problem locked.
- [x] Task domain relationship resolved ($1:1$ operational projection wrapper).
- [x] Capacity Unit (CU) mathematical model formalized.
- [x] Deterministic dispatch scoring algorithm defined (zero opaque AI).
- [x] Availability lifecycle (6 states) and capability matrix established.
- [x] SLA clock lifecycle, pause rules, and 4-tier escalation mapped.
- [x] Structured blocking taxonomy and aging metrics specified.
- [x] Manager Dispatch Desk & Employee Workspace contracts defined.
- [x] Role authority and permission boundaries established.
- [x] Multi-tenancy, privacy, failure recovery, and idempotency specified.
- [x] Master Architectural Decision Table (20 areas) completed.

---

## Architectural Sign-Off

```
PHASE 10H-A STATUS:
COMPLETE

CONTRACT:
READY

TASK AUTHORITY:
CLEAR

DISPATCH AUTHORITY:
CLEAR

CAPACITY MODEL:
DEFINED

SLA MODEL:
DEFINED

REASSIGNMENT MODEL:
DEFINED

ESCALATION MODEL:
DEFINED

AUDIT MODEL:
DEFINED

MULTI-TENANCY:
DEFINED

IDEMPOTENCY:
DEFINED

FAILURE MODEL:
DEFINED

FROZEN-DOMAIN COMPATIBILITY:
PASS

IMPLEMENTATION AUTHORIZATION:
NOT AUTHORIZED
```
