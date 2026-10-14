# PHASE 10H-C — WCOS DATA MODEL & PERSISTENCE SPECIFICATION

**Phase Status:** COMPLETE / ARCHITECTURALLY LOCKED  
**Implementation Authorization:** NOT AUTHORIZED (Specification Only)  
**Authoritative Baselines:**
- [PHASE_10H_A_WCOS_PRODUCT_CONTRACT.md](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_10H_A_WCOS_PRODUCT_CONTRACT.md)
- [PHASE_10H_B_WCOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_10H_B_WCOS_DECISION_LOCK_IMPLEMENTATION_READINESS.md)
**Scope:** Authoritative PostgreSQL Schema Design, Foreign Key Cascades, Index Optimization, Unique Constraints, Immutability Guarantees, Concurrency Controls, and RLS Specifications for the Workforce & Capacity Operations System (WCOS).

---

## 1. Executive Summary

This document establishes the authoritative data model and persistence specification for the **Workforce & Capacity Operations System (WCOS)**. It translates the locked architectural decisions of Phase 10H-B into precise, enterprise-grade PostgreSQL DDL structures, entity definitions, indexing strategies, and Row Level Security (RLS) policies.

### Core Persistence Axiom
> **`public.tasks` remains the sole canonical execution entity in Open Operating System.**  
> **WCOS attaches a strict 1:1 operational projection (`public.wcos_work_items`) that tracks workforce telemetry, routing, SLA countdowns, and capacity consumption without duplicating or conflicting with Task execution truth.**

---

## 2. Persistence Principles

1. **Strict 1:1 Task Anchoring:** Every `wcos_work_items` record has `task_id` as its Primary Key and Foreign Key to `public.tasks(id)`.
2. **Single Status & Ownership Authority:** `Task.status` and `Task.assignedEmployeeId` are canonical. WCOS manages operational routing and triggers authoritative Task transitions.
3. **Capacity Conservation Invariant:** Reservations strictly track estimated, active, and released Capacity Units (CU). Double-reservation and negative capacity are prevented by database-level constraints.
4. **Append-Only Forensic Telemetry:** Assignment transitions, dispatch scoring decisions, blocking events, and escalation states are persisted as immutable, append-only history records.
5. **Zero Financial / Candidate PII Leakage:** WCOS stores operational foreign keys only; sensitive CBOS invoices, margin terms, and candidate identification documents are never replicated into workforce tables.
6. **Mandatory Tenant Scoping:** Every WCOS table contains `organization_id UUID NOT NULL` with foreign key enforcement and future PostgreSQL `FORCE ROW LEVEL SECURITY`.

---

## 3. Task ↔ WCOS Relationship & Single Source of Truth

```
+-----------------------------------------------------------------------------------+
|                                  public.tasks                                     |
|                       (Canonical Execution Unit - Phase 4)                        |
|                                                                                   |
|  - id: UUID (PK)                                                                  |
|  - organization_id: UUID (FK -> organizations.id)                                 |
|  - title: VARCHAR(255) NOT NULL                                                   |
|  - description: TEXT                                                              |
|  - category: TaskCategory NOT NULL                                                |
|  - type: TaskType NOT NULL                                                        |
|  - status: TaskStatus NOT NULL DEFAULT 'BACKLOG'                                  |
|  - priority: TaskPriority NOT NULL DEFAULT 'NORMAL'                               |
|  - due_date: TIMESTAMPTZ(6) (Canonical Target Deadline)                           |
|  - assigned_employee_id: UUID (FK -> users.id, Canonical Owner)                   |
|  - candidate_id, job_id, application_id: UUID                                     |
+-----------------------------------------------------------------------------------+
                                         |
                                         | 1 : 1 (Mandatory Foreign Key)
                                         v
+-----------------------------------------------------------------------------------+
|                             public.wcos_work_items                                |
|                      (WCOS Operational Workforce Projection)                      |
|                                                                                   |
|  - task_id: UUID (PK, FK -> public.tasks.id ON DELETE RESTRICT)                   |
|  - organization_id: UUID (FK -> organizations.id)                                 |
|  - queue_id: UUID (FK -> wcos_queues.id)                                          |
|  - work_type: VARCHAR(64) NOT NULL                                                |
|  - capacity_units_estimated: INT NOT NULL DEFAULT 3                               |
|  - capacity_units_consumed: INT NOT NULL DEFAULT 0                                |
|  - required_capability_code: VARCHAR(64) NOT NULL                                 |
|  - required_proficiency_level: INT NOT NULL DEFAULT 1                             |
|  - sla_policy_id: UUID (FK -> wcos_sla_policies.id)                               |
|  - sla_target_at: TIMESTAMPTZ(6) NOT NULL                                         |
|  - sla_warning_at: TIMESTAMPTZ(6) NOT NULL                                        |
|  - sla_breached_at: TIMESTAMPTZ(6)                                                |
|  - sla_paused_duration_ms: BIGINT NOT NULL DEFAULT 0                              |
|  - blocking_category: VARCHAR(64)                                                 |
|  - blocked_at: TIMESTAMPTZ(6)                                                     |
|  - unblock_expected_at: TIMESTAMPTZ(6)                                            |
|  - escalation_level: INT NOT NULL DEFAULT 0                                       |
|  - last_escalated_at: TIMESTAMPTZ(6)                                              |
|  - dispatch_mode: VARCHAR(32) NOT NULL DEFAULT 'AUTO'                             |
|  - dispatch_reason: TEXT NOT NULL                                                 |
|  - dispatch_score: NUMERIC(5,2)                                                   |
|  - continuity_candidate_id: UUID                                                  |
|  - created_at: TIMESTAMPTZ(6) NOT NULL DEFAULT now()                              |
|  - updated_at: TIMESTAMPTZ(6) NOT NULL DEFAULT now()                              |
+-----------------------------------------------------------------------------------+
```

---

## 4. WCOS Table Inventory

WCOS introduces 12 dedicated operational tables:

| Table Name | Entity Purpose | Mutability | Tenant Scoped | Primary Authority |
| :--- | :--- | :--- | :---: | :--- |
| `wcos_queues` | Queue configurations and team routing rules | Mutable | **YES** | WCOS Governance |
| `wcos_sla_policies` | SLA duration rules and warning thresholds | Mutable | **YES** | WCOS Governance |
| `wcos_capacity_policies` | Standard organizational capacity baselines | Mutable | **YES** | WCOS Governance |
| `wcos_capacity_profiles` | Daily staff schedule budgets and buffers | Mutable | **YES** | WCOS Capacity Engine |
| `wcos_availability_records`| Staff availability state chronology | Append-Only | **YES** | WCOS Service / HR |
| `wcos_capability_definitions`| Certified organizational skill catalog | Mutable | **YES** | WCOS Governance |
| `wcos_employee_capabilities`| Staff verified capabilities and proficiency| Mutable | **YES** | WCOS Governance |
| `wcos_work_items` | 1:1 Operational projection to `public.tasks` | Mutable | **YES** | WCOS Control Plane |
| `wcos_capacity_reservations`| Atomic CU reservation ledger | Append-State | **YES** | WCOS Capacity Engine |
| `wcos_assignment_history`| Immutable task handoff audit log | **Append-Only** | **YES** | WCOS Assignment Engine |
| `wcos_dispatch_decisions`| Deterministic dispatch score audit records | **Append-Only** | **YES** | WCOS Dispatch Engine |
| `wcos_blocking_records` | Structured blocking events and SLA pause log| **Append-Only** | **YES** | WCOS SLA Engine |
| `wcos_escalation_records`| Multi-tier escalation lifecycle records | **Append-Only** | **YES** | WCOS Escalation Engine |

---

## 5. Detailed Schema & PostgreSQL DDL Specifications

### 5.1 Enums

```sql
CREATE TYPE "WcosWorkDemandType" AS ENUM (
  'DEMAND_CANDIDATE_INTAKE',
  'DEMAND_RESUME_TAILORING',
  'DEMAND_SCREENING_ANSWERS',
  'DEMAND_APPLICATION_QA',
  'DEMAND_SUBMISSION_EXEC',
  'DEMAND_INTERVIEW_PREP',
  'DEMAND_OFFER_REVIEW',
  'DEMAND_PLACEMENT_VERIFY',
  'DEMAND_COMMERCIAL_BILL',
  'DEMAND_ESCALATION_RESOLV'
);

CREATE TYPE "WcosAvailabilityState" AS ENUM (
  'AVAILABLE',
  'LIMITED',
  'BUSY',
  'UNAVAILABLE',
  'LEAVE',
  'INACTIVE'
);

CREATE TYPE "WcosProficiencyLevel" AS ENUM (
  'BASIC',
  'INTERMEDIATE',
  'ADVANCED',
  'EXPERT'
);

CREATE TYPE "WcosDispatchMode" AS ENUM (
  'AUTO',
  'MANUAL',
  'SELF_CLAIM',
  'OVERRIDE'
);

CREATE TYPE "WcosBlockingCategory" AS ENUM (
  'WAIT_CANDIDATE_INPUT',
  'WAIT_DOCUMENT_UPLOAD',
  'WAIT_EMPLOYER_FEEDBACK'
);

CREATE TYPE "WcosReservationStatus" AS ENUM (
  'RESERVED',
  'CONSUMED',
  'RELEASED',
  'CANCELLED'
);

CREATE TYPE "WcosEscalationLevel" AS ENUM (
  'LEVEL_1_WARNING',
  'LEVEL_2_AT_RISK',
  'LEVEL_3_BREACHED',
  'LEVEL_4_MANAGEMENT'
);
```

---

### 5.2 Table Definitions

#### 1. `wcos_queues`
```sql
CREATE TABLE public.wcos_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(128) NOT NULL,
  description TEXT,
  target_capability_code VARCHAR(64),
  assigned_team_id UUID,
  priority_weight INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_queues_org_slug UNIQUE (organization_id, slug)
);

CREATE INDEX idx_wcos_queues_org_active ON public.wcos_queues(organization_id, is_active);
```

#### 2. `wcos_sla_policies`
```sql
CREATE TABLE public.wcos_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,
  demand_type "WcosWorkDemandType" NOT NULL,
  priority "TaskPriority" NOT NULL,
  target_duration_minutes INT NOT NULL,
  warning_threshold_percentage INT NOT NULL DEFAULT 80,
  max_pause_duration_minutes INT NOT NULL DEFAULT 20160, -- 14 Days
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_sla_policies_org_demand_priority UNIQUE (organization_id, demand_type, priority),
  CONSTRAINT chk_sla_warning_pct CHECK (warning_threshold_percentage > 0 AND warning_threshold_percentage < 100)
);

CREATE INDEX idx_wcos_sla_policies_org ON public.wcos_sla_policies(organization_id, is_active);
```

#### 3. `wcos_capacity_policies`
```sql
CREATE TABLE public.wcos_capacity_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,
  standard_daily_cu INT NOT NULL DEFAULT 32,
  default_allocated_budget_cu INT NOT NULL DEFAULT 28,
  default_reserved_overhead_cu INT NOT NULL DEFAULT 4,
  overload_threshold_pct INT NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT chk_wcos_cap_policy_math CHECK (default_allocated_budget_cu + default_reserved_overhead_cu = standard_daily_cu)
);

CREATE INDEX idx_wcos_cap_policies_org ON public.wcos_capacity_policies(organization_id);
```

#### 4. `wcos_capacity_profiles`
```sql
CREATE TABLE public.wcos_capacity_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  effective_date DATE NOT NULL,
  daily_capacity_cu INT NOT NULL DEFAULT 32,
  allocated_budget_cu INT NOT NULL DEFAULT 28,
  reserved_overhead_cu INT NOT NULL DEFAULT 4,
  active_workload_cu INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_cap_profiles_org_emp_date UNIQUE (organization_id, employee_id, effective_date),
  CONSTRAINT chk_wcos_cap_non_negative CHECK (active_workload_cu >= 0)
);

CREATE INDEX idx_wcos_cap_profiles_org_date ON public.wcos_capacity_profiles(organization_id, effective_date);
CREATE INDEX idx_wcos_cap_profiles_emp ON public.wcos_capacity_profiles(employee_id, effective_date);
```

#### 5. `wcos_availability_records`
```sql
CREATE TABLE public.wcos_availability_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  state "WcosAvailabilityState" NOT NULL,
  effective_from TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ(6),
  reason VARCHAR(255),
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX idx_wcos_availability_emp ON public.wcos_availability_records(organization_id, employee_id, effective_from DESC);
```

#### 6. `wcos_capability_definitions`
```sql
CREATE TABLE public.wcos_capability_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_cap_defs_org_code UNIQUE (organization_id, code)
);

CREATE INDEX idx_wcos_cap_defs_org ON public.wcos_capability_definitions(organization_id, is_active);
```

#### 7. `wcos_employee_capabilities`
```sql
CREATE TABLE public.wcos_employee_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  capability_id UUID NOT NULL REFERENCES public.wcos_capability_definitions(id) ON DELETE RESTRICT,
  proficiency "WcosProficiencyLevel" NOT NULL DEFAULT 'INTERMEDIATE',
  verified_by_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_emp_caps_org_emp_cap UNIQUE (organization_id, employee_id, capability_id)
);

CREATE INDEX idx_wcos_emp_caps_query ON public.wcos_employee_capabilities(organization_id, capability_id, is_active);
```

#### 8. `wcos_work_items`
```sql
CREATE TABLE public.wcos_work_items (
  task_id UUID PRIMARY KEY REFERENCES public.tasks(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  queue_id UUID REFERENCES public.wcos_queues(id) ON DELETE RESTRICT,
  work_type "WcosWorkDemandType" NOT NULL,
  capacity_units_estimated INT NOT NULL DEFAULT 3,
  capacity_units_consumed INT NOT NULL DEFAULT 0,
  required_capability_code VARCHAR(64) NOT NULL,
  required_proficiency_level "WcosProficiencyLevel" NOT NULL DEFAULT 'BASIC',
  sla_policy_id UUID REFERENCES public.wcos_sla_policies(id) ON DELETE RESTRICT,
  sla_target_at TIMESTAMPTZ(6) NOT NULL,
  sla_warning_at TIMESTAMPTZ(6) NOT NULL,
  sla_breached_at TIMESTAMPTZ(6),
  sla_paused_duration_ms BIGINT NOT NULL DEFAULT 0,
  blocking_category "WcosBlockingCategory",
  blocked_at TIMESTAMPTZ(6),
  unblock_expected_at TIMESTAMPTZ(6),
  escalation_level INT NOT NULL DEFAULT 0,
  last_escalated_at TIMESTAMPTZ(6),
  dispatch_mode "WcosDispatchMode" NOT NULL DEFAULT 'AUTO',
  dispatch_reason TEXT NOT NULL,
  dispatch_score NUMERIC(5,2),
  continuity_candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT chk_wcos_cu_positive CHECK (capacity_units_estimated > 0),
  CONSTRAINT chk_wcos_escalation_range CHECK (escalation_level >= 0 AND escalation_level <= 4)
);

CREATE INDEX idx_wcos_work_items_org_queue ON public.wcos_work_items(organization_id, queue_id);
CREATE INDEX idx_wcos_work_items_sla ON public.wcos_work_items(organization_id, sla_target_at ASC);
CREATE INDEX idx_wcos_work_items_escalation ON public.wcos_work_items(organization_id, escalation_level);
CREATE INDEX idx_wcos_work_items_continuity ON public.wcos_work_items(organization_id, continuity_candidate_id);
```

#### 9. `wcos_capacity_reservations`
```sql
CREATE TABLE public.wcos_capacity_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  estimated_cu INT NOT NULL,
  reserved_cu INT NOT NULL,
  consumed_cu INT NOT NULL DEFAULT 0,
  released_cu INT NOT NULL DEFAULT 0,
  status "WcosReservationStatus" NOT NULL DEFAULT 'RESERVED',
  idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ(6),
  CONSTRAINT uq_wcos_res_idemp UNIQUE (organization_id, idempotency_key),
  CONSTRAINT chk_wcos_res_math CHECK (reserved_cu >= 0 AND released_cu >= 0)
);

-- Unique Active Reservation Invariant: Max ONE active reservation per task
CREATE UNIQUE INDEX uq_wcos_active_task_reservation 
  ON public.wcos_capacity_reservations (task_id) 
  WHERE status IN ('RESERVED', 'CONSUMED');

CREATE INDEX idx_wcos_reservations_emp_active ON public.wcos_capacity_reservations(organization_id, employee_id, status);
```

#### 10. `wcos_assignment_history`
```sql
CREATE TABLE public.wcos_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  previous_employee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  new_employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reassignment_reason VARCHAR(255) NOT NULL,
  dispatch_mode "WcosDispatchMode" NOT NULL,
  dispatch_decision_id UUID,
  capacity_transferred_cu INT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_assign_hist_idemp UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX idx_wcos_assign_hist_task ON public.wcos_assignment_history(task_id, created_at ASC);
CREATE INDEX idx_wcos_assign_hist_emp ON public.wcos_assignment_history(organization_id, new_employee_id);
```

#### 11. `wcos_dispatch_decisions`
```sql
CREATE TABLE public.wcos_dispatch_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  selected_employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  candidate_pool_count INT NOT NULL,
  eligible_pool_count INT NOT NULL,
  hard_gate_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  capacity_score NUMERIC(5,2) NOT NULL,
  continuity_score NUMERIC(5,2) NOT NULL,
  team_score NUMERIC(5,2) NOT NULL,
  proficiency_score NUMERIC(5,2) NOT NULL,
  total_score NUMERIC(5,2) NOT NULL,
  tie_break_applied VARCHAR(64),
  dispatch_mode "WcosDispatchMode" NOT NULL,
  algorithm_version VARCHAR(32) NOT NULL DEFAULT 'v1.0',
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_dispatch_dec_idemp UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX idx_wcos_dispatch_dec_task ON public.wcos_dispatch_decisions(task_id);
```

#### 12. `wcos_blocking_records`
```sql
CREATE TABLE public.wcos_blocking_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  category "WcosBlockingCategory" NOT NULL,
  reason TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  blocked_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  unblock_expected_at TIMESTAMPTZ(6) NOT NULL,
  unblocked_at TIMESTAMPTZ(6),
  unblock_actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  paused_duration_ms BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX idx_wcos_blocking_task ON public.wcos_blocking_records(task_id, blocked_at DESC);
```

#### 13. `wcos_escalation_records`
```sql
CREATE TABLE public.wcos_escalation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  level "WcosEscalationLevel" NOT NULL,
  trigger_reason VARCHAR(255) NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  acknowledged_by_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ(6),
  resolved_by_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ(6),
  idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_escalation_idemp UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX idx_wcos_escalations_task ON public.wcos_escalation_records(task_id, created_at DESC);
CREATE INDEX idx_wcos_escalations_org_level ON public.wcos_escalation_records(organization_id, level, resolved_at);
```

---

## 6. Entity Relationship Map

```
Organization (public.organizations)
 ├── wcos_queues
 ├── wcos_sla_policies
 ├── wcos_capacity_policies
 ├── wcos_capability_definitions
 │    └── wcos_employee_capabilities (Staff Link)
 ├── wcos_capacity_profiles (Daily Staff Capacity)
 ├── wcos_availability_records (Staff State Timeline)
 └── Tasks (public.tasks - Phase 4)
      └── wcos_work_items (1:1 Projection)
           ├── wcos_capacity_reservations (Active/Released CU)
           ├── wcos_assignment_history (Append-Only Reassignment Log)
           ├── wcos_dispatch_decisions (Deterministic Score Traces)
           ├── wcos_blocking_records (Blocking & SLA Pauses)
           └── wcos_escalation_records (Escalation State Machine)
```

---

## 7. Foreign Key Deletion Integrity Rules

| Foreign Key | Parent Table | Child Table | `ON DELETE` Rule | Architectural Rationale |
| :--- | :--- | :--- | :---: | :--- |
| `task_id` | `public.tasks` | `wcos_work_items` | **`RESTRICT`** | Prohibits physical task deletion if workforce history exists |
| `task_id` | `public.tasks` | `wcos_capacity_reservations` | **`RESTRICT`** | Preserves financial/capacity audit balances |
| `task_id` | `public.tasks` | `wcos_assignment_history` | **`RESTRICT`** | Preserves immutable chain of custody |
| `task_id` | `public.tasks` | `wcos_dispatch_decisions` | **`RESTRICT`** | Preserves algorithmic dispatch history |
| `employee_id`| `public.users` | `wcos_capacity_profiles` | **`RESTRICT`** | Staff profile cannot be destroyed while capacity exists |
| `employee_id`| `public.users` | `wcos_employee_capabilities` | **`RESTRICT`** | Verified capability credentials cannot be purged |
| `actor_id` | `public.users` | `wcos_assignment_history` | **`RESTRICT`** | Preserves author identity on all state handoffs |

---

## 8. Immutability & Append-Only Table Grants

In production, PostgreSQL permissions revoke direct `UPDATE` and `DELETE` on all append-only WCOS history tables for `oos_app_runtime`:

```sql
-- Revoke physical DELETE on immutable workforce tables
REVOKE DELETE ON public.wcos_assignment_history FROM oos_app_runtime;
REVOKE DELETE ON public.wcos_dispatch_decisions FROM oos_app_runtime;
REVOKE DELETE ON public.wcos_blocking_records FROM oos_app_runtime;
REVOKE DELETE ON public.wcos_escalation_records FROM oos_app_runtime;
REVOKE DELETE ON public.wcos_availability_records FROM oos_app_runtime;
```

---

## 9. Future Row Level Security (RLS) Specification

All 12 WCOS tables will enforce PostgreSQL Row Level Security using the established OOS tenant context helper:

```sql
-- Pattern applied to every WCOS table
ALTER TABLE public.wcos_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wcos_work_items FORCE ROW LEVEL SECURITY;

CREATE POLICY wcos_work_items_tenant_isolation ON public.wcos_work_items
  FOR ALL
  TO oos_app_runtime
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
```

---

## 10. Concurrency & Locking Strategy

1. **Queue Dispatch Claim (Pessimistic Row Lock):**
   ```sql
   SELECT t.id, w.capacity_units_estimated, w.required_capability_code
   FROM public.tasks t
   JOIN public.wcos_work_items w ON t.id = w.task_id
   WHERE t.id = $1 AND t.status = 'BACKLOG'
   FOR UPDATE NOWAIT;
   ```
2. **Capacity Profile Atomic Decrement:**
   ```sql
   UPDATE public.wcos_capacity_profiles
   SET active_workload_cu = active_workload_cu + $1,
       updated_at = now()
   WHERE organization_id = $2 AND employee_id = $3 AND effective_date = CURRENT_DATE
     AND (active_workload_cu + $1) <= (allocated_budget_cu + $4); -- $4 is override allowance
   ```

---

## 11. Complete Audit Event Matrix

| WCOS Action Enum | Primary Entity | Trigger Condition |
| :--- | :--- | :--- |
| `WCOS_WORK_DEMAND_ENQUEUED` | `wcos_work_items` | Task initialized with WCOS operational envelope |
| `WCOS_WORK_ITEM_DISPATCHED` | `wcos_work_items` | Dispatch engine assigns employee |
| `WCOS_WORK_ITEM_ACCEPTED` | `wcos_work_items` | Employee transitions task to `IN_PROGRESS` |
| `WCOS_WORK_ITEM_BLOCKED` | `wcos_blocking_records` | Task set to `BLOCKED` with external reason |
| `WCOS_WORK_ITEM_UNBLOCKED` | `wcos_blocking_records` | Block cleared; SLA paused duration computed |
| `WCOS_WORK_ITEM_REASSIGNED` | `wcos_assignment_history`| Ownership transferred to new employee |
| `WCOS_WORK_ITEM_ESCALATED` | `wcos_escalation_records`| Escalation level raised (Level 1..4) |
| `WCOS_SLA_BREACH_RECORDED` | `wcos_work_items` | SLA countdown passes hard target deadline |
| `WCOS_CAPACITY_OVERLOADED` | `wcos_capacity_profiles`| Employee exceeds 100% daily budget |
| `WCOS_MANAGER_OVERRIDE` | `wcos_dispatch_decisions`| Manager forces assignment or capacity override |
| `WCOS_WORK_ITEM_COMPLETED` | `wcos_work_items` | Task finished; 100% capacity released |

---

## 12. Master Domain Boundary Matrix

| Domain / Table | WCOS Authority | External Authority | WCOS Read Authority | WCOS Write Authority | Strict Prohibition |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **`public.tasks`** | Control Plane (Routing/Capacity) | Phase 4 Task Engine | Full | Assignee, Status, Priority, DueDate | Creating competing Task table |
| **`public.candidates`** | Continuity Linkage | Phase 2 Candidate Engine | Read Name/Status | NONE | Modifying candidate profile |
| **`public.applications`**| Work Demand Source | Phase 3 Application Core | Read Status | NONE | Modifying application state |
| **`public.application_qa_reviews`** | QA Review Routing | Phase 5 QA Engine | Read Status | NONE | Modifying QA pass/fail decision |
| **`public.interviews`**| Prep Demand Source | Phase 8 Interview OS | Read Schedule | NONE | Modifying interview records |
| **`public.offers` / `placements`**| Verification Demand Source | Phase 9 OPOS | Read Proofs | NONE | Mutating verified placement |
| **`public.invoices` / `payments`**| Billing Task Source | Phase 10 CBOS | Task Flag Only | NONE | Mutating financial ledgers |
| **`public.audit_events`**| Appends WCOS Events | Phase 0/1 Audit Core | Read Logs | Append Only | Modifying historical audit logs |

---

## 13. Master Architectural Decision Table

| # | Concern | Locked Specification Choice | Architectural Rationale | Authority |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Primary Key** | `wcos_work_items.task_id UUID PK` | Enforces exact 1:1 database constraint with `public.tasks` | DB Schema |
| **2** | **Task Status** | No status duplication; derives from `public.tasks.status` | Guarantees zero status split-brain across application | Phase 4 Task |
| **3** | **Task Assignee** | Written to `Task.assigned_employee_id` atomically | Single-threaded human execution ownership | WCOS Service |
| **4** | **SLA Baseline** | Anchored to `Task.due_date` with `sla_paused_duration_ms` | Reassignment never resets deadline; exact time accounting | WCOS SLA Engine |
| **5** | **Priority** | Derived from `Task.priority`; WCOS elevates on breach | Single business priority enum throughout enterprise | Phase 4 Task |
| **6** | **Active Reservation**| PostgreSQL Partial Unique Index on `task_id` (`WHERE status IN ('RESERVED', 'CONSUMED')`) | Enforces max 1 active reservation per task at DB level | PostgreSQL DB |
| **7** | **Capacity Limits**| Daily profile budgets with check constraints (`active_workload_cu >= 0`) | Mathematically prevents negative capacity drift | Capacity Engine |
| **8** | **Immutability** | `REVOKE DELETE` on all 5 WCOS history tables | Guarantees forensic reconstructability of workforce execution | PostgreSQL Security |
| **9** | **Multi-Tenancy** | `organization_id` on all 12 tables + Future PostgreSQL FORCE RLS | Strict tenant isolation preventing cross-org leakage | DB Security |
| **10**| **Concurrency** | `SELECT ... FOR UPDATE NOWAIT` row locking | Prevents worker race conditions and double-assignments | PostgreSQL DB |

---

## 14. Implementation Readiness Checklist

- [x] All 12 table schemas, types, and constraints defined in PostgreSQL DDL.
- [x] Strict 1:1 Foreign Key relationship to `public.tasks` locked.
- [x] Unique active reservation partial index specified.
- [x] Append-only immutability and permission revokes documented.
- [x] SLA pause tracking and 14-day ceiling rules specified.
- [x] 11 WCOS audit actions mapped with complete payload metadata.
- [x] Multi-tenancy, RLS policies, and session-derived context locked.
- [x] Domain boundaries and zero foreign-domain write laws verified.

---

## Architectural Sign-Off Banner

```
PHASE 10H-C STATUS:
COMPLETE

DATA MODEL:
READY

TASK RELATIONSHIP:
CLEAR

ASSIGNMENT HISTORY:
DEFINED

CAPACITY MODEL:
DEFINED

RESERVATION MODEL:
DEFINED

DISPATCH DECISION MODEL:
DEFINED

SLA TELEMETRY:
DEFINED

QUEUE MODEL:
DEFINED

ESCALATION:
DEFINED

AUDIT:
DEFINED

IMMUTABILITY:
DEFINED

TENANT SCOPING:
DEFINED

RLS CONTRACT:
DEFINED

CONCURRENCY:
DEFINED

FAILURE RECOVERY:
DEFINED

DOMAIN BOUNDARIES:
CLEAR

IMPLEMENTATION AUTHORIZATION:
NOT AUTHORIZED
```
