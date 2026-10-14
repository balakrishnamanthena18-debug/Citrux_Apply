# PHASE 10H-B — WCOS DECISION LOCK & IMPLEMENTATION READINESS SPECIFICATION

**Phase Status:** COMPLETE / ARCHITECTURALLY LOCKED  
**Implementation Authorization:** NOT AUTHORIZED (Design Lock Phase Only)  
**Authoritative Baseline:** [PHASE_10H_A_WCOS_PRODUCT_CONTRACT.md](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_10H_A_WCOS_PRODUCT_CONTRACT.md)  
**Scope:** Architectural Decision Freeze, Persistence Mapping, Authority Boundaries, and Concurrency Invariants for the Workforce & Capacity Operations System (WCOS).

---

## 1. Executive Summary

This document establishes the authoritative, legally binding architectural decision lock for the **Workforce & Capacity Operations System (WCOS)**. It translates the operational product requirements of Phase 10H-A into a formal, unambiguous persistence, authority, and concurrency specification.

### The Immutable Architectural Axiom
> **`public.tasks` remains the canonical execution source of truth for all human labor across OOS.**  
> **WCOS is the operational workforce control plane.**  
> **WCOS shall NEVER create a second, competing task entity.**

WCOS manages routing, queueing, capacity balancing, capability verification, SLA tracking, proactive reassignment, and multi-tier escalation. Execution semantics (checklists, context linkages, internal notes, completion validation) remain strictly delegated to `Task`.

---

## 2. Architectural Principles

1. **Single Source of Execution Truth:** There is exactly one task record per unit of work. WCOS extends `Task` via a 1:1 persisted operational projection (`wcos_work_items`).
2. **Single Authority Per Mutation:** Every field and state transition has exactly one authoritative owner. No dual-authority or conflicting write paths are permitted.
3. **Deterministic & Explainable Dispatch:** Automated dispatch is 100% rules-based and reproducible. Black-box AI models have zero operational dispatch authority.
4. **Capacity Conservation Law:** Capacity units (CU) are neither created nor destroyed arbitrarily. Every assignment, completion, or reassignment conserves mathematical capacity balances without negative drift.
5. **SLA Invariance Law:** Reassignment never resets or extends an SLA clock. The original business obligation remains immutable unless an authorized external blocking condition is verified.
6. **Multi-Tenant Fortress:** All workforce telemetry, queues, capacity profiles, and assignments are strictly scoped to `organizationId` with future PostgreSQL Row Level Security (`FORCE RLS`) enforcement.

---

## 3. Task ↔ WCOS Persistence Architecture

### 3.1 Locked Architectural Choice: Option B (Persisted Operational Projection)
WCOS implements a **Persisted Operational Extension (`wcos_work_items`) with a mandatory 1:1 foreign key relationship to `public.tasks`**.

```
+-----------------------------------------------------------------------------------+
|                                  public.tasks                                     |
|                       (Canonical Execution Unit - Phase 4)                        |
|                                                                                   |
|  - id: UUID (PK)                                                                  |
|  - organizationId: UUID                                                           |
|  - title, description: String                                                     |
|  - category: TaskCategory                                                         |
|  - type: TaskType                                                                 |
|  - status: TaskStatus (Authoritative Execution State)                             |
|  - priority: TaskPriority (Canonical Business Priority)                           |
|  - dueDate: Timestamptz (Canonical Business Due Date)                             |
|  - assignedEmployeeId: UUID (Authoritative Single Assignee)                       |
|  - candidateId, jobId, applicationId: UUID (Context Linkages)                     |
|  - completedAt, completedById, createdById: UUID                                  |
+-----------------------------------------------------------------------------------+
                                         |
                                         | 1 : 1 (Mandatory Foreign Key)
                                         v
+-----------------------------------------------------------------------------------+
|                             public.wcos_work_items                                |
|                      (WCOS Operational Workforce Projection)                      |
|                                                                                   |
|  - taskId: UUID (PK, FK -> public.tasks.id ON DELETE CASCADE)                     |
|  - organizationId: UUID                                                           |
|  - queueId: UUID (FK -> public.wcos_queues.id)                                    |
|  - capacityUnitsEstimated: Int (1..20 CU)                                         |
|  - capacityUnitsConsumed: Int (Default 0)                                         |
|  - requiredCapabilityCode: String                                                 |
|  - requiredProficiencyLevel: Int (1..4)                                           |
|  - slaPolicyId: UUID (FK -> public.wcos_sla_policies.id)                          |
|  - slaTargetAt: Timestamptz (Dynamic Target Deadline)                             |
|  - slaWarningAt: Timestamptz (Warning Threshold)                                  |
|  - slaBreachedAt: Timestamptz nullable                                            |
|  - slaPausedDurationMs: BigInt (Default 0)                                        |
|  - blockingCategory: WcosBlockingCategory nullable                                |
|  - blockedAt: Timestamptz nullable                                                |
|  - unblockExpectedAt: Timestamptz nullable                                        |
|  - escalationLevel: Int (0..4, Default 0)                                         |
|  - lastEscalatedAt: Timestamptz nullable                                          |
|  - dispatchMode: WcosDispatchMode (AUTO, MANUAL, SELF_CLAIM, OVERRIDE)            |
|  - dispatchReason: String                                                         |
|  - dispatchScore: Decimal(5,2) nullable                                           |
|  - continuityCandidateId: UUID nullable                                           |
+-----------------------------------------------------------------------------------+
```

### 3.2 Formal Field Ownership Matrix

| Operational Concern | Canonical Owner (`Task`) | Operational Control (`WCOS`) | Enforcement Mechanism |
| :--- | :---: | :---: | :--- |
| **Execution State** | **YES (`status`)** | Observes & Triggers | Task state machine governs execution |
| **Assignee Identity** | **YES (`assignedEmployeeId`)** | Calculates & Dispatches | WCOS writes directly to `Task.assignedEmployeeId` |
| **Business Priority** | **YES (`priority`)** | Derives Dispatch Urgency | WCOS updates `Task.priority` on escalation |
| **Checklist Items** | **YES (`TaskChecklistItem`)** | NO | Execution detail strictly owned by Task |
| **Internal Notes** | **YES (`InternalNote`)** | NO | Collaboration strictly owned by Task |
| **Context Associations** | **YES (`candidateId`, etc.)** | NO | Domain linkages owned by Task |
| **Capacity Weight** | NO | **YES (`capacityUnitsEstimated`)** | Controlled entirely by WCOS engine |
| **Queue Routing** | NO | **YES (`queueId`)** | Managed via WCOS queue engine |
| **Capability Matching**| NO | **YES (`requiredCapabilityCode`)** | Verified against staff capabilities |
| **Dynamic SLA Clocks** | NO (Uses `dueDate` as target) | **YES (`slaTargetAt`, pauses)**| WCOS computes active countdown & pause offsets |
| **Escalation Tiers** | NO | **YES (`escalationLevel`)** | Multi-tier state machine (0 to 4) |
| **Dispatch Traceability**| NO | **YES (`dispatchReason`, `score`)**| 100% audit logging of assignment rationale |

---

## 4. Status Authority & State Mapping

### 4.1 Single Status Authority Principle
`TaskStatus` in `public.tasks` is the **sole authoritative status enum**. WCOS does **not** introduce a separate operational status enum. Instead, WCOS tracks supplementary orthogonal state flags (`blockingCategory`, `escalationLevel`, `dispatchMode`).

### 4.2 Comprehensive State Transition Matrix

```
[BACKLOG / UNASSIGNED] ──(Auto/Manual Dispatch)──> [ASSIGNED]
         │                                            │
         │                                   (Employee Accepts/Starts)
         │                                            │
         │                                            v
         │                                      [IN_PROGRESS] ──(Ready for QA)──> [READY_FOR_REVIEW]
         │                                            │                                  │
         │                                     (Block Encountered)                  (QA Trigger)
         │                                            │                                  │
         │                                            v                                  v
         │                                        [BLOCKED]                             [QA]
         │                                            │                                  │
         │                                      (Unblocked)                              │
         │                                            │                                  v
         │                                            v                            [COMPLETED]
         │                                      [IN_PROGRESS]
         │                                            │
         ├──(SLA Breach / Expired)────────────────────┴──(Reassignment Triggered)──> [REASSIGNED]
         │                                                                                 │
         │                                                                           (New Assignee)
         │                                                                                 │
         │                                                                                 v
         └─────────────────────────────────────────────────────────────────────────>  [ASSIGNED]
```

| `TaskStatus` | WCOS Operational Meaning | Who Can Transition | WCOS Capacity Effect | WCOS SLA Clock Effect |
| :--- | :--- | :--- | :--- | :--- |
| `BACKLOG` | Unassigned in holding queue | Upstream Engine / Dispatcher | 0 CU Allocated | Clock Running |
| `ASSIGNED` | Dispatched to specific employee | Dispatcher / Team Lead / Admin | **Reserves Estimated CU** | Clock Running |
| `IN_PROGRESS` | Employee active on task | Assigned Employee / Staff | **Consumes Active CU** | Clock Running |
| `WAITING` | Waiting on lightweight async response| Assigned Employee | Retains Active CU | Clock Running |
| `READY_FOR_REVIEW`| Work draft finished, pending review | Assigned Employee | Releases Active CU | Clock Running |
| `QA` | Under active QA review | QA Auditor | Allocates QA CU to Auditor | Clock Running |
| `BLOCKED` | Formally blocked on external dependency| Assigned Employee / Manager | Retains or Releases CU (by rule)| **PAUSES SLA (if external)** |
| `REASSIGNED` | Transferring to new employee | Dispatcher / Manager / Auto | Releases Old, Reserves New | Clock Continues Unchanged |
| `ESCALATED` | Operational escalation active | WCOS Engine / Manager | Retains CU; elevates priority | Clock Continues (Tier Raised) |
| `COMPLETED` | Execution successfully finished | Assigned Employee / Auditor | **Releases 100% CU** | Clock Stopped |
| `CANCELED` | Task aborted or invalidated | Manager / Admin | **Releases 100% CU** | Clock Stopped |

---

## 5. Assignment Authority & Synchronization

### 5.1 Single Assignment Authority
`Task.assignedEmployeeId` is the single canonical representation of human ownership. WCOS is the **control plane** deciding which UUID is written into `Task.assignedEmployeeId`.

### 5.2 Assignment Modes & Protocols

```
+-----------------------------------------------------------------------------------+
|                              WCOS ASSIGNMENT GATEWAY                              |
+-----------------------------------------------------------------------------------+
       |                                   |                                   |
       v                                   v                                   v
[AUTO-DISPATCH]                     [MANUAL DISPATCH]                   [SELF-CLAIM]
- Deterministic Algorithm           - Manager / Team Lead               - Qualified Employee
- Capacity < 100%                   - Mandated Reason Code              - Top of Queue Only
- Verified Capability               - Capacity Override if needed       - Within Capacity Cap
       │                                   │                                   │
       └───────────────────────────────────┼───────────────────────────────────┘
                                           │
                                           v [Single Atomic DB Transaction]
                     +-------------------------------------------+
                     | 1. Update public.tasks.assignedEmployeeId |
                     | 2. Update public.wcos_work_items telemetry|
                     | 3. Adjust Employee Capacity Profile       |
                     | 4. Emit Audit Event                       |
                     +-------------------------------------------+
```

1. **Initial Auto-Dispatch:** WCOS Worker queries eligible employees, scores candidates, and atomically updates `Task.assignedEmployeeId`, `wcos_work_items.dispatchMode = 'AUTO'`, and reserves CU.
2. **Manager Manual Assignment:** Manager selects employee. If within capacity, updates assignment. If exceeding capacity, requires `CAPACITY_OVERRIDE` audit code.
3. **Employee Self-Claim:** Employee claims highest-priority task from team queue. Permitted **only** if employee possesses required capability and effective capacity $> \text{Task CU}$.
4. **Reassignment (Employee Requested / Auto):** Atomically clears old employee CU reservation, updates `Task.assignedEmployeeId`, and assigns new employee CU reservation.

---

## 6. Capacity Reservation & Consumption Model

### 6.1 Capacity Lifecycle State Machine
Capacity operates on a **Hybrid Reservation-Release Model**:

$$\text{Active Workload}(E) = \sum_{t \in \text{ASSIGNED}(E)} \text{CU}_{\text{est}}(t) + \sum_{t \in \text{IN\_PROGRESS}(E)} \text{CU}_{\text{est}}(t)$$

```
                                [TASK CREATION]
                                       │
                               (Estimated CU Set)
                                       ▼
    [UNASSIGNED] ──(Dispatched)──> [ASSIGNED] ──(Started)──> [IN_PROGRESS]
         │                            │                           │
   (0 CU Reserved)             (Reserve CU_est)            (CU_est Active)
                                      │                           │
                                      ▼                           ▼
                              [REASSIGNED / LEAVE]         [COMPLETED / CANCELED]
                                      │                           │
                               (Release CU_est)            (Release 100% CU_est)
```

### 6.2 Standard Work Item Weights

| Work Demand Type | Code | Default Estimated CU | Duration Equivalent |
| :--- | :--- | :---: | :---: |
| Candidate Onboarding Review | `DEMAND_CANDIDATE_INTAKE` | 2 CU | 30 Minutes |
| Complex Resume Tailoring | `DEMAND_RESUME_TAILORING` | 5 CU | 75 Minutes |
| Custom Screening Answers | `DEMAND_SCREENING_ANSWERS`| 3 CU | 45 Minutes |
| Application QA Audit | `DEMAND_APPLICATION_QA` | 3 CU | 45 Minutes |
| Portal Submission & Proof | `DEMAND_SUBMISSION_EXEC` | 2 CU | 30 Minutes |
| Interview Prep Session | `DEMAND_INTERVIEW_PREP` | 4 CU | 60 Minutes |
| Offer Review & Strategy | `DEMAND_OFFER_REVIEW` | 4 CU | 60 Minutes |
| Placement Verification Proof | `DEMAND_PLACEMENT_VERIFY` | 3 CU | 45 Minutes |
| Billing & Invoicing Follow-up| `DEMAND_COMMERCIAL_BILL` | 2 CU | 30 Minutes |
| Manager Escalation Triage | `DEMAND_ESCALATION_RESOLV`| 5 CU | 75 Minutes |

---

## 7. Daily Capacity & Schedule Configuration

### 7.1 Configurable Baseline Standard
- **Full-Time Standard Schedule:** $8\text{ Hours/Day} = 32\text{ Standard CU/Day}$.
  - Allocated Execution Budget: $28\text{ CU}$ ($7\text{ Hours}$).
  - Reserved Overhead Buffer: $4\text{ CU}$ ($1\text{ Hour}$ for meetings, breaks, admin).
- **Part-Time / Reduced Schedule:** Configured in `public.wcos_capacity_profiles`:
  $$\text{Daily Capacity}(E) = \text{Scheduled Hours}(E) \times 4\text{ CU/Hour}$$
  $$\text{Allocated Budget}(E) = \text{Daily Capacity}(E) - \text{Reserved Overhead}(E)$$

### 7.2 Non-Standard & Temporary Capacity Schedules
- **Holidays / PTO:** Automatically transitions availability to `LEAVE` and sets Daily Capacity to `0 CU`.
- **Onboarding Ramp:** New employees receive scaled capacity multipliers (Month 1: $50\%$, Month 2: $75\%$, Month 3: $100\%$).

---

## 8. Availability State Machine & Queue Draining

### 8.1 State Definitions & Invariants

```
       +------------------+
       |     INACTIVE     | ──(Deactivated)──> Zero Capacity, Full Drain
       +------------------+
                 │
                 ▼ (Account Active)
       +------------------+ <─────────────────────────────────────────────+
       |    AVAILABLE     |                                               │
       +------------------+                                               │
         │              │                                                 │
(Load > 85%)      (Meeting / Temp Duty)                                   │
         │              │                                                 │
         ▼              ▼                                                 │
+----------------+ +--------------+                                       │
|      BUSY      | |   LIMITED    |                                       │
+----------------+ +--------------+                                       │
         │              │                                                 │
(Load >= 100%)    (PTO / Sickness)                                        │
         │              │                                                 │
         ▼              ▼                                                 │
+----------------+ +--------------+                                       │
|  UNAVAILABLE   | |    LEAVE     | ──────────────────────────────────────+ (Returns to Work)
+----------------+ +--------------+
```

### 8.2 Formal Availability Transition Policy

| Availability State | Accepts Auto-Dispatch | Accepts High/Critical | Retains Current Work | Auto-Queue Drain Action |
| :--- | :---: | :---: | :---: | :--- |
| `AVAILABLE` | **YES** | **YES** | **YES** | None |
| `LIMITED` | **NO** | **YES** | **YES** | None |
| `BUSY` | **NO** | **YES** (With Override) | **YES** | None |
| `UNAVAILABLE` | **NO** | **NO** | **YES** (If SLA $> 4\text{h}$) | Proactively reassigns tasks with SLA $< 4\text{h}$ |
| `LEAVE` | **NO** | **NO** | **NO** | **Immediate Auto-Drain**: All non-completed tasks re-queued |
| `INACTIVE` | **NO** | **NO** | **NO** | **Immediate Full Drain**: All tasks unassigned |

---

## 9. Capability & Proficiency Model

### 9.1 Capability Taxonomy & Verification
Capabilities represent certified operational skills. Dispatch strictly forbids unverified self-assignment.

```
+-----------------------------------------------------------------------------------+
|                            CAPABILITY VERIFICATION ENGINE                         |
+-----------------------------------------------------------------------------------+
  - CAP_CANDIDATE_ONBOARDING (Level 1..3) -> Verified by Team Lead
  - CAP_RESUME_ENGINEERING   (Level 1..4) -> Verified by Technical Resume Auditor
  - CAP_APPLICATION_PREP     (Level 1..3) -> Verified by Application Specialist
  - CAP_QA_COMPLIANCE        (Level 1..3) -> Verified by Compliance Manager
  - CAP_SUBMISSION_OPS       (Level 1..2) -> Verified by Submission Lead
  - CAP_INTERVIEW_COACHING   (Level 1..4) -> Verified by Principal Career Coach
  - CAP_OFFER_NEGOTIATION    (Level 1..4) -> Verified by Executive Strategist
  - CAP_PLACEMENT_OPS        (Level 1..3) -> Verified by Operations Manager
  - CAP_BILLING_OPS          (Level 1..3) -> Verified by Finance Lead
  - CAP_OPS_MANAGEMENT       (Level 1..4) -> Verified by Operations Director
```

### 9.2 Proficiency Scale
1. **Level 1 (Junior / Basic):** Handles standard, non-complex workflows.
2. **Level 2 (Standard / Intermediate):** Handles all standard workloads independently.
3. **Level 3 (Senior / Advanced):** Handles complex, multi-stakeholder, and high-value files.
4. **Level 4 (Principal / Lead):** Authorized for edge-case resolutions, coaching, and escalation overrides.

---

## 10. Deterministic Dispatch Scoring & Hard Constraints

### 10.1 Stage 1: Hard Eligibility Constraints (Zero-Tolerance Gates)
An employee $E$ is **strictly disqualified** prior to scoring if any gate fails:
1. $\text{Organization}(E) \neq \text{Organization}(W)$.
2. $E$ does not possess `requiredCapabilityCode` at $\ge \text{requiredProficiencyLevel}$.
3. $\text{Availability}(E) \in \{\text{UNAVAILABLE}, \text{LEAVE}, \text{INACTIVE}\}$.
4. $\text{Utilization}(E) \ge 100\%$ (unless `OVERRIDE` mode is active).
5. $E$ is not a member of the queue's designated target team (if team lock is enabled).

### 10.2 Stage 2: Deterministic Scoring Formula (0 to 100 Points)
$$\text{TotalScore}(E, W) = S_{\text{capacity}}(E) + S_{\text{continuity}}(E, W) + S_{\text{team}}(E, W) + S_{\text{proficiency}}(E, W)$$

- **Available Capacity Score (0–40 Points):**
  $$S_{\text{capacity}}(E) = \text{Round}\left( \frac{\text{Effective Available CU}(E)}{\text{Allocated Budget CU}(E)} \times 40, 2 \right)$$
- **Candidate Continuity Bonus (0–25 Points):**
  $$S_{\text{continuity}}(E, W) = \begin{cases} 25 & \text{if } E \text{ previously completed a task for } \text{Candidate}(W) \text{ within 90 days} \\ 0 & \text{otherwise} \end{cases}$$
- **Team Alignment Bonus (0–20 Points):**
  $$S_{\text{team}}(E, W) = \begin{cases} 20 & \text{if } E \text{ belongs to the primary team assigned to Queue}(W) \\ 10 & \text{if } E \text{ belongs to a secondary overflow team} \\ 0 & \text{otherwise} \end{cases}$$
- **Proficiency Match Score (0–15 Points):**
  $$S_{\text{proficiency}}(E, W) = \text{Round}\left( \frac{\text{Proficiency}(E, W)}{\text{Max Proficiency (4)}} \times 15, 2 \right)$$

### 10.3 Stage 3: Deterministic Tie-Breaking Order
If two or more candidates have identical `TotalScore`:
1. **Lowest Active CU Workload** (Assign to employee with lowest total active CU).
2. **Longest Idle Time** (Assign to employee whose most recent task completion timestamp is oldest).
3. **Lexicographical UUID Ascending** (`User.id` string comparison).

---

## 11. SLA Management, Clocks & Pause Rules

### 11.1 The Single SLA Clock Rule
There is **exactly one** authoritative SLA deadline for any work item.
- Base target: $\text{slaTargetAt} = \text{createdAt} + \text{SlaPolicyDuration}$.
- Dynamic adjustment: $\text{CurrentDeadline} = \text{slaTargetAt} + \text{slaPausedDurationMs}$.

### 11.2 Reassignment Invariance
$$\text{slaTargetAt}_{\text{post-reassign}} \equiv \text{slaTargetAt}_{\text{pre-reassign}}$$
Reassignment **never** resets or recalculates the initial SLA deadline.

### 11.3 Authorized SLA Pause Reasons

```
+-----------------------------------------------------------------------------------+
|                                SLA PAUSE GATEWAY                                  |
+-----------------------------------------------------------------------------------+
  ALLOWED (Pauses Clock):
  - WAIT_CANDIDATE_INPUT   -> Candidate action requested; verified timestamp
  - WAIT_DOCUMENT_UPLOAD   -> Candidate document missing; link sent
  - WAIT_EMPLOYER_FEEDBACK -> Interview OS employer debrief pending

  FORBIDDEN (Clock Keeps Running):
  - WAITING_FOR_EMPLOYEE   -> Staff member is busy / delayed
  - CAPACITY_OVERLOAD      -> Department is busy
  - INTERNAL_SYSTEM_ISSUE  -> Internal infrastructure latency
```

- Pause duration is capped at **14 Days maximum**. After 14 days, the item automatically unpauses and enters `LEVEL_3_BREACHED`.

---

## 12. Priority & Business Urgency Mapping

### 12.1 Canonical Priority Mapping
`TaskPriority` in `public.tasks` is the authoritative business priority. WCOS maps priority to deterministic SLA timelines:

| `TaskPriority` | Default SLA Target | SLA Warning ($80\%$) | Escalation Trigger |
| :--- | :---: | :---: | :--- |
| `CRITICAL` | **4 Hours** | 2.5 Hours | Level 2 at 2.5h; Level 3 at 4h |
| `HIGH` | **8 Hours** | 6.4 Hours | Level 2 at 6.4h; Level 3 at 8h |
| `NORMAL` | **24 Hours** | 19.2 Hours | Level 2 at 19.2h; Level 3 at 24h |
| `LOW` | **72 Hours** | 57.6 Hours | Level 2 at 57.6h; Level 3 at 72h |

---

## 13. Queue Architecture: Derived Views vs. Persisted Metadata

### 13.1 Hybrid Queue Strategy
- **`public.wcos_queues` (Persisted Configuration):** Stores queue definitions, target capability, owning team, SLA policy, and overflow routing rules.
- **Queue Membership (Deterministic SQL Projection):** Unassigned tasks are queried dynamically:
  ```sql
  SELECT t.id, t.title, w.capacity_units_estimated, w.sla_target_at
  FROM public.tasks t
  JOIN public.wcos_work_items w ON t.id = w.task_id
  WHERE t.organization_id = $1
    AND t.status IN ('BACKLOG', 'REASSIGNED')
    AND w.queue_id = $2
  ORDER BY w.sla_target_at ASC, t.priority DESC, t.created_at ASC;
  ```
  This eliminates heavy queue synchronization tables while guaranteeing real-time queue consistency.

---

## 14. Work Aging & Telemetry Tracking

### 14.1 Authoritative Timestamp Ledger
Every Work Item maintains an immutable lifecycle chronology:
- `createdAt`: Immutable task creation timestamp (Phase 4).
- `queuedAt`: Timestamp when item entered current queue.
- `assignedAt`: Timestamp of latest assignment.
- `acceptedAt`: Timestamp when employee accepted/started task (`status == IN_PROGRESS`).
- `blockedAt`: Timestamp when formal blocking commenced.
- `unblockedAt`: Timestamp when blocking was cleared.
- `completedAt`: Immutable completion timestamp.

---

## 15. Structured Blocking Taxonomy

### 15.1 Blocking State Rules
- An employee cannot set `status = BLOCKED` without supplying a valid `WcosBlockingCategory` and `unblockExpectedAt` date.
- Transitioning to `BLOCKED` with an external reason immediately initiates cumulative SLA pause tracking.
- Resolving the block recalculates `slaPausedDurationMs = slaPausedDurationMs + (now() - blockedAt)` and restores `status = IN_PROGRESS`.

---

## 16. Multi-Tier Escalation State Machine

```
[Level 0: Nominal State]
          │
      (SLA Warning Threshold Elapsed: 80%)
          ▼
[Level 1: SLA Warning]
  - Visual Warning Badge on Work Item
  - Proactive notification to Assignee
          │
      (SLA 90% Window Elapsed AND status == ASSIGNED)
          ▼
[Level 2: SLA At Risk]
  - Notification to Team Lead
  - Eligible for automated proactive reassignment
          │
      (Clock surpasses SLA Deadline)
          ▼
[Level 3: SLA Breached]
  - Flagged RED on Manager Dispatch Desk
  - SLA breach recorded in audit telemetry
  - Immediate operational manager alert
          │
      (Breached + 4 Hours Unresolved)
          ▼
[Level 4: Management Escalation]
  - Paged to Operations Director / Admin
  - Force-reassignment authorized
```

---

## 17. Manager Override Authority

### 17.1 Authorized Overrides & Schema
Managers may override dispatch recommendations, capability gates, and capacity limits only via the authorized `WcosService.overrideDispatch` method.

```typescript
interface ManagerOverrideInput {
  taskId: string;
  targetEmployeeId: string;
  overrideType: "CAPACITY_CAP" | "CAPABILITY_BYPASS" | "QUEUE_REROUTE" | "PRIORITY_ELEVATION";
  justificationCode: "CRITICAL_CLIENT_DEMAND" | "STAFF_EMERGENCY" | "SPECIALIST_DIRECT_ORDER" | "EXECUTIVE_REQUEST";
  justificationNote: string;
}
```

- Overrides are strictly audited under `AuditAction.WCOS_MANAGER_OVERRIDE_RECORDED`.

---

## 18. Idempotency Keys & Deduplication

### 18.1 Deterministic Key Formulations

| Operation | Idempotency Key Pattern | Scope |
| :--- | :--- | :--- |
| **Work Item Intake** | `wcos:intake:{organizationId}:{sourceDomain}:{sourceEntityId}:{demandType}` | Unique per upstream trigger |
| **Auto-Dispatch** | `wcos:dispatch:{taskId}:{dispatchRunId}` | Unique per dispatch run |
| **Reassignment** | `wcos:reassign:{taskId}:{fromStaffId}:{toStaffId}:{timestamp}` | Unique per transfer |
| **SLA Escalation** | `wcos:escalate:{taskId}:{escalationLevel}` | Unique per escalation tier |
| **Capacity Adjustment**| `wcos:cap:{organizationId}:{staffId}:{date}:{adjustmentType}` | Unique per staff date balance |

---

## 19. Concurrency Control & Race Condition Defenses

### 19.1 Transactional Isolation & Row Locking
1. **Dispatch Race Prevention:** When the dispatch worker processes a queue item, it acquires a PostgreSQL row lock:
   ```sql
   SELECT * FROM public.tasks WHERE id = $1 FOR UPDATE NOWAIT;
   ```
2. **Simultaneous Manager & Dispatcher Assignment:** First transaction commits; second transaction encounters version mismatch/lock error and gracefully aborts.
3. **Capacity Invariant Lock:**
   $$\text{Assigned CU} \le \text{Max Capacity} + \text{Override Allowance}$$
   Database-level check constraint or transactional pre-validation guarantees capacity cannot be double-decremented.

---

## 20. Comprehensive Audit Event Contract

### 20.1 WCOS Audit Actions in `public.audit_events`

| Audit Action Enum | Trigger | Payload Metadata |
| :--- | :--- | :--- |
| `WCOS_WORK_DEMAND_ENQUEUED` | Work item created & queued | `queueId`, `workType`, `capacityUnitsEstimated` |
| `WCOS_WORK_ITEM_DISPATCHED` | Dispatched to employee | `assignedEmployeeId`, `dispatchMode`, `score` |
| `WCOS_WORK_ITEM_ACCEPTED` | Employee starts work | `acceptedAt`, `latencySeconds` |
| `WCOS_WORK_ITEM_BLOCKED` | Task placed in blocked state | `blockingCategory`, `unblockExpectedAt` |
| `WCOS_WORK_ITEM_UNBLOCKED` | Task resumed | `slaPausedDurationMs`, `resumedAt` |
| `WCOS_WORK_ITEM_REASSIGNED` | Task transferred to new owner | `fromStaffId`, `toStaffId`, `reassignmentReason` |
| `WCOS_WORK_ITEM_ESCALATED` | Escalation tier increased | `fromLevel`, `toLevel`, `triggerReason` |
| `WCOS_SLA_BREACH_RECORDED` | SLA deadline surpassed | `breachedAt`, `totalElapsedMs`, `targetAt` |
| `WCOS_CAPACITY_OVERLOADED` | Staff member exceeds 100% | `staffId`, `activeCU`, `maxCU` |
| `WCOS_MANAGER_OVERRIDE` | Manager forces override | `overrideType`, `justificationCode`, `note` |
| `WCOS_WORK_ITEM_COMPLETED` | Work successfully finished | `completedAt`, `actualDurationMinutes` |

---

## 21. Multi-Tenancy & Data Security

1. **Server-Derived Context Authority:** `organizationId` is strictly extracted from verified session claims (`AuthenticatedContext`). Client-supplied organization IDs are unconditionally rejected.
2. **PostgreSQL Row Level Security:** All WCOS tables (`wcos_work_items`, `wcos_queues`, `wcos_capacity_profiles`, `wcos_capabilities`, `wcos_sla_policies`) enforce `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.

---

## 22. Privacy & Data Minimization

- **Financial Isolation:** Non-finance employees dispatched to placement verification or interview tasks have zero access to CBOS contract rates, margin percentages, fee structures, or customer billing balances.
- **PII Minimization:** Operational dispatch desks display candidate initials, target job title, and required deliverables. Sensitive candidate identification documents remain gated in the Candidate Document Vault (Phase 2).

---

## 23. Failure & Self-Healing Resilience Model

```
+-----------------------------------------------------------------------------------+
|                             WCOS SELF-HEALING ARCHITECTURE                        |
+-----------------------------------------------------------------------------------+
  1. Worker Crash / Timeout    -> Work item remains PENDING in queue; auto-retried.
  2. Database Deadlock         -> Transaction rollback; exp-backoff retry (max 3).
  3. Staff Unplanned Leave     -> Auto-drain worker re-allocates tasks to Team Queue.
  4. Stale Dispatch Decision   -> Version check on Task entity detects conflict.
  5. Capacity Drift Anomaly    -> Nightly reconciliation job re-computes active CU sum.
```

---

## 24. Domain Boundary Verification Matrix

| Domain | Canonical Authority | WCOS Read Permissions | WCOS Mutation Authority | WCOS Strictly Prohibited |
| :--- | :--- | :--- | :--- | :--- |
| **`Task`** | Execution truth, checklists, notes | Full task metadata | Assignee, Status, Priority, Due Date | Creating alternate Task table |
| **`Candidate`** | Profile, documents, consent | Onboarding status, name | NONE | Mutating candidate profile/consent |
| **`Application`**| Application status, job link | Status, job requirements | NONE | Bypassing application state machine |
| **`QA`** | QA checklists, Pass/Fail decision| Review state, reviewer | NONE | Overriding QA evaluation results |
| **`Interview OS`**| Interview schedule, feedback | Stage, scheduled time | NONE | Altering interview feedback/status |
| **`OPOS`** | Offer review, placement record | Offer status, joining date | NONE | Fabricating placement verification |
| **`CBOS`** | Contracts, invoices, payments | Billing task flag | NONE | Mutating ledger/invoice balances |
| **`Audit`** | Historical immutable audit trail | Audit logs | Appends WCOS events | Modifying historical audit logs |
| **`Team`** | Team membership, structure | Team assignments | NONE | Mutating team structural hierarchy |

---

## 25. Future Implementation Architecture (Service & Seam Contract)

```
                       Browser UI / Next.js Server Action / Cron Worker
                                             │
                                             ▼
                        [Step 1: AuthenticatedContext Resolution]
                               (Role, Organization, Staff ID)
                                             │
                                             ▼
                           [Step 2: WCOS Authorization Gate]
                            (assertStaffOrManagerAuthority)
                                             │
                                             ▼
                             [Step 3: WCOS Service Layer]
                            (Business Logic & State Machine)
                                             │
                                             ▼
                            [Step 4: WCOS Repository Layer]
                           (Prisma Transactions & Row Locks)
                                             │
                                             ▼
                         [Step 5: PostgreSQL Database Engine]
                             (FORCE RLS & REVOKE DELETE)
                                             │
                                             ▼
                           [Step 6: Atomic Audit Event Log]
```

---

## 26. Master Architectural Decision Table

| # | Decision Area | Locked Choice | Architectural Reason | Authority | Implementation Impact |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **Work Item Entity** | 1:1 Persisted Operational Projection (`wcos_work_items`) | Prevents duplicate task tables; binds workforce telemetry directly to execution entity | WCOS Contract | Single foreign key to `public.tasks` |
| **2** | **Status Authority** | Canonical in `Task.status`; WCOS observes and transitions | Zero dual-status split brain; unified state machine across application | Phase 4 Task | WCOS service calls Task status transitions |
| **3** | **Assignment Owner** | `Task.assignedEmployeeId` is single source; WCOS controls dispatch | Guarantees single-threaded ownership and prevents assignment conflicts | WCOS Control Plane | Updates Task assignee in atomic tx |
| **4** | **Capacity Model** | Standard Capacity Units (1 CU = 15m); Hybrid Reservation-Release | Reflects true cognitive effort; preserves capacity balance invariants | WCOS Service | Active CU tracking per staff member |
| **5** | **Capacity Limits** | Standard 32 CU/day (28 budget + 4 buffer); configurable by schedule | Supports part-time, shifts, and leaves cleanly without hard-coding assumptions | Capacity Engine | Configured per staff profile |
| **6** | **Availability** | 6-State Machine (`AVAILABLE` to `INACTIVE`) | Explicit gating for auto-dispatch and automated leave queue-draining | WCOS Service | Staff status trigger |
| **7** | **Capability Model**| Verified codes + 4-level proficiency scale | Eliminates skill mismatch and unverified self-assignment | Admin Governance | Capability verification registry |
| **8** | **Dispatch Algorithm**| Deterministic Scoring Matrix (0–100 pts) after Hard Gating | 100% explainable, fair, reproducible; zero opaque AI black boxes | Dispatch Engine | Pure mathematical scoring function |
| **9** | **Dispatch Determinism**| Strict tie-breaking: Workload $\rightarrow$ Idle Time $\rightarrow$ UUID | Eliminates non-deterministic race conditions across worker runs | Dispatch Engine | Fully reproducible dispatch order |
| **10**| **Continuity** | +25 pt bonus bounded strictly by hard capacity/skill gates | Balances candidate familiarity with operational health | Dispatch Engine | Queried from recent completion history |
| **11**| **SLA Authority** | Single SLA clock anchored to `Task.dueDate` with paused offsets | Reassignment never resets SLA; single source of deadline truth | SLA Engine | Dynamic deadline calculator |
| **12**| **SLA Pause Rules** | Permitted ONLY on verified external blocking categories | Prevents staff gaming the clock; enforces external accountability | Governance Engine | Tracks cumulative paused duration |
| **13**| **Priority Model** | `TaskPriority` is canonical business priority; drives SLA timeline | Single priority hierarchy across entire enterprise | Phase 4 Task | Determines dispatch scoring urgency |
| **14**| **Queue Model** | Persisted Queue configs + Derived SQL Projections | Eliminates synchronization overhead while providing live telemetry | WCOS Repository | Dynamic queue queries |
| **15**| **Aging Telemetry** | Authoritative timestamps (`queuedAt`, `acceptedAt`, `blockedAt`) | Full latency tracking across every operational handoff phase | WCOS Engine | Recorded on projection metadata |
| **16**| **Blocking Model** | Structured blocking taxonomy with mandatory unblock estimates | Replaces free-text excuses with structured dependency tracking | WCOS Service | Triggers SLA pause logic |
| **17**| **Escalation Model**| 4-Tier Operational Responsibility Escalation | Establishes managerial accountability for overdue commitments | Escalation Worker | Auto-promotes priority on Level 3/4 |
| **18**| **Manager Overrides**| Allowed for Capacity/Capability with mandatory audit codes | Gives managers crisis flexibility without invisible rule-breaking | Manager Role | Mandatory audit log record |
| **19**| **Idempotency** | Deterministic composite idempotency keys on all mutations | Guarantees exactly-once execution across background worker ticks | WCOS Service | Deduplication checks |
| **20**| **Concurrency** | PostgreSQL `SELECT FOR UPDATE` row locks | Prevents double-assignment, capacity drift, and worker race conditions | PostgreSQL DB | Row-level locking |
| **21**| **Audit Contract** | 11 discrete WCOS audit actions logged atomically in tx | 100% forensic reconstructability of workforce history | Audit System | Appended to `public.audit_events` |
| **22**| **Multi-Tenancy** | Session-derived `organizationId` + Future PostgreSQL FORCE RLS | Zero cross-tenant data leakage or spoofing | Auth Context | Tenant-scoped repository queries |
| **23**| **Privacy** | Strict data minimization; zero financial ledger leakage | Protects candidate PII and proprietary commercial terms | WCOS Views | Gated payload serialization |
| **24**| **Failure Recovery**| Automatic task re-queueing, auto-drain, and background reconcile | Zero lost work; zero orphaned tasks | Resilience Worker | Automatic self-healing routines |
| **25**| **Domain Boundaries**| Read-only access to foreign business truth; no cross-domain writes | Preserves frozen architecture across OPOS, CBOS, QA, and Tasks | Architecture Lock | Enforced via service boundaries |

---

## 27. Operational Risks & Mitigations

1. **Risk: Capacity Calculation Contention under High Concurrency.**  
   *Mitigation:* Employee capacity profiles use row-level version locks during assignment; worker uses bulk-fetch read snapshots for candidate scoring before locking target assignee.
2. **Risk: Orphaned Tasks During Emergency System Downtime.**  
   *Mitigation:* Self-healing heartbeat worker scans for `IN_PROGRESS` tasks with zero updates $> 24\text{ hours}$ and triggers Level 2 escalation triage.
3. **Risk: Manager Override Abuse.**  
   *Mitigation:* Monthly executive audit telemetry highlights override frequency per manager, exposing persistent bottlenecks.

---

## 28. Implementation Readiness Checklist

- [x] Persistence architecture locked (Option B: $1:1$ operational projection to `public.tasks`).
- [x] Status authority and state transition matrix completely frozen.
- [x] Assignment synchronization mechanism locked (single canonical owner).
- [x] Capacity unit lifecycle, formulas, and daily schedules defined.
- [x] Availability state machine and automated leave-drain rules established.
- [x] Capability matrix, proficiency scales, and verification authority frozen.
- [x] Deterministic dispatch algorithm, formulas, and tie-breakers locked.
- [x] SLA clock lifecycle, pause boundaries, and reassignment invariance frozen.
- [x] 4-Tier escalation state machine and operational responsibilities locked.
- [x] Concurrency controls, row locking, and idempotency keys specified.
- [x] Domain boundaries, data minimization, and audit event contracts locked.
- [x] Master Architectural Decision Table (25 areas) fully resolved.

---

## Architectural Sign-Off Banner

```
PHASE 10H-B STATUS:
COMPLETE

DECISION LOCK:
READY

TASK AUTHORITY:
CLEAR

STATUS AUTHORITY:
CLEAR

ASSIGNMENT AUTHORITY:
CLEAR

CAPACITY MODEL:
LOCKED

DISPATCH MODEL:
LOCKED

SLA AUTHORITY:
LOCKED

QUEUE MODEL:
LOCKED

REASSIGNMENT:
LOCKED

ESCALATION:
LOCKED

CONCURRENCY:
LOCKED

AUDIT:
LOCKED

MULTI-TENANCY:
LOCKED

DOMAIN BOUNDARIES:
CLEAR

IMPLEMENTATION AUTHORIZATION:
NOT AUTHORIZED
```
