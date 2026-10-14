-- Phase 10H: Workforce & Capacity Operations System (WCOS) Data Model & Persistence Foundation
-- Establishes WCOS Queues, SLA Policies, Capacity Policies, Capacity Profiles, Availability Records,
-- Capability Definitions, Employee Capabilities, Work Items, Capacity Reservations, Assignment History,
-- Dispatch Decisions, Blocking Records, and Escalation Records.

-- 1. Enums
DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WcosAvailabilityState" AS ENUM (
    'AVAILABLE',
    'LIMITED',
    'BUSY',
    'UNAVAILABLE',
    'LEAVE',
    'INACTIVE'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WcosProficiencyLevel" AS ENUM (
    'BASIC',
    'INTERMEDIATE',
    'ADVANCED',
    'EXPERT'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WcosDispatchMode" AS ENUM (
    'AUTO',
    'MANUAL',
    'SELF_CLAIM',
    'OVERRIDE'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WcosBlockingCategory" AS ENUM (
    'WAIT_CANDIDATE_INPUT',
    'WAIT_DOCUMENT_UPLOAD',
    'WAIT_EMPLOYER_FEEDBACK'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WcosReservationStatus" AS ENUM (
    'RESERVED',
    'CONSUMED',
    'RELEASED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WcosEscalationLevel" AS ENUM (
    'LEVEL_1_WARNING',
    'LEVEL_2_AT_RISK',
    'LEVEL_3_BREACHED',
    'LEVEL_4_MANAGEMENT'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. AuditAction enum additions
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_WORK_DEMAND_ENQUEUED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_WORK_ITEM_DISPATCHED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_WORK_ITEM_ACCEPTED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_WORK_ITEM_BLOCKED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_WORK_ITEM_UNBLOCKED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_WORK_ITEM_REASSIGNED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_WORK_ITEM_ESCALATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_SLA_BREACH_RECORDED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_CAPACITY_OVERLOADED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_MANAGER_OVERRIDE';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WCOS_WORK_ITEM_COMPLETED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Tables

-- 3.1 wcos_queues
CREATE TABLE IF NOT EXISTS public.wcos_queues (
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
CREATE INDEX IF NOT EXISTS idx_wcos_queues_org_active ON public.wcos_queues(organization_id, is_active);

-- 3.2 wcos_sla_policies
CREATE TABLE IF NOT EXISTS public.wcos_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,
  demand_type "WcosWorkDemandType" NOT NULL,
  priority "TaskPriority" NOT NULL,
  target_duration_minutes INT NOT NULL,
  warning_threshold_percentage INT NOT NULL DEFAULT 80,
  max_pause_duration_minutes INT NOT NULL DEFAULT 20160,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_wcos_sla_policies_org_demand_priority UNIQUE (organization_id, demand_type, priority),
  CONSTRAINT chk_sla_warning_pct CHECK (warning_threshold_percentage > 0 AND warning_threshold_percentage < 100)
);
CREATE INDEX IF NOT EXISTS idx_wcos_sla_policies_org ON public.wcos_sla_policies(organization_id, is_active);

-- 3.3 wcos_capacity_policies
CREATE TABLE IF NOT EXISTS public.wcos_capacity_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name VARCHAR(128) NOT NULL,
  standard_daily_cu INT NOT NULL DEFAULT 32,
  default_allocated_budget_cu INT NOT NULL DEFAULT 28,
  default_reserved_overhead_cu INT NOT NULL DEFAULT 4,
  overload_threshold_pct INT NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wcos_cap_policies_org ON public.wcos_capacity_policies(organization_id);

-- 3.4 wcos_capacity_profiles
CREATE TABLE IF NOT EXISTS public.wcos_capacity_profiles (
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
CREATE INDEX IF NOT EXISTS idx_wcos_cap_profiles_org_date ON public.wcos_capacity_profiles(organization_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_wcos_cap_profiles_emp ON public.wcos_capacity_profiles(employee_id, effective_date);

-- 3.5 wcos_availability_records
CREATE TABLE IF NOT EXISTS public.wcos_availability_records (
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
CREATE INDEX IF NOT EXISTS idx_wcos_availability_emp ON public.wcos_availability_records(organization_id, employee_id, effective_from DESC);

-- 3.6 wcos_capability_definitions
CREATE TABLE IF NOT EXISTS public.wcos_capability_definitions (
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
CREATE INDEX IF NOT EXISTS idx_wcos_cap_defs_org ON public.wcos_capability_definitions(organization_id, is_active);

-- 3.7 wcos_employee_capabilities
CREATE TABLE IF NOT EXISTS public.wcos_employee_capabilities (
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
CREATE INDEX IF NOT EXISTS idx_wcos_emp_caps_query ON public.wcos_employee_capabilities(organization_id, capability_id, is_active);

-- 3.8 wcos_work_items
CREATE TABLE IF NOT EXISTS public.wcos_work_items (
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
CREATE INDEX IF NOT EXISTS idx_wcos_work_items_org_queue ON public.wcos_work_items(organization_id, queue_id);
CREATE INDEX IF NOT EXISTS idx_wcos_work_items_sla ON public.wcos_work_items(organization_id, sla_target_at ASC);
CREATE INDEX IF NOT EXISTS idx_wcos_work_items_escalation ON public.wcos_work_items(organization_id, escalation_level);
CREATE INDEX IF NOT EXISTS idx_wcos_work_items_continuity ON public.wcos_work_items(organization_id, continuity_candidate_id);

-- 3.9 wcos_capacity_reservations
CREATE TABLE IF NOT EXISTS public.wcos_capacity_reservations (
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_wcos_active_task_reservation
  ON public.wcos_capacity_reservations (task_id)
  WHERE status IN ('RESERVED', 'CONSUMED');
CREATE INDEX IF NOT EXISTS idx_wcos_reservations_emp_active ON public.wcos_capacity_reservations(organization_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_wcos_reservations_task ON public.wcos_capacity_reservations(task_id);

-- 3.10 wcos_assignment_history
CREATE TABLE IF NOT EXISTS public.wcos_assignment_history (
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
CREATE INDEX IF NOT EXISTS idx_wcos_assign_hist_task ON public.wcos_assignment_history(task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_wcos_assign_hist_emp ON public.wcos_assignment_history(organization_id, new_employee_id);

-- 3.11 wcos_dispatch_decisions
CREATE TABLE IF NOT EXISTS public.wcos_dispatch_decisions (
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
CREATE INDEX IF NOT EXISTS idx_wcos_dispatch_dec_task ON public.wcos_dispatch_decisions(task_id);

-- 3.12 wcos_blocking_records
CREATE TABLE IF NOT EXISTS public.wcos_blocking_records (
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
CREATE INDEX IF NOT EXISTS idx_wcos_blocking_task ON public.wcos_blocking_records(task_id, blocked_at DESC);

-- 3.13 wcos_escalation_records
CREATE TABLE IF NOT EXISTS public.wcos_escalation_records (
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

-- 4. Enable and FORCE Row Level Security on all 13 WCOS tables
ALTER TABLE "wcos_queues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_queues" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_sla_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_sla_policies" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_capacity_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_capacity_policies" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_capacity_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_capacity_profiles" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_availability_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_availability_records" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_capability_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_capability_definitions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_employee_capabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_employee_capabilities" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_work_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_work_items" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_capacity_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_capacity_reservations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_assignment_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_assignment_history" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_dispatch_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_dispatch_decisions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_blocking_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_blocking_records" FORCE ROW LEVEL SECURITY;

ALTER TABLE "wcos_escalation_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wcos_escalation_records" FORCE ROW LEVEL SECURITY;

-- 5. Tenant RLS Policies for all 13 WCOS tables
DO $$ BEGIN
  CREATE POLICY "wcos_queues_select" ON "public"."wcos_queues" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_queues_write" ON "public"."wcos_queues" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_sla_policies_select" ON "public"."wcos_sla_policies" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_sla_policies_write" ON "public"."wcos_sla_policies" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_capacity_policies_select" ON "public"."wcos_capacity_policies" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_capacity_policies_write" ON "public"."wcos_capacity_policies" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_capacity_profiles_select" ON "public"."wcos_capacity_profiles" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_capacity_profiles_write" ON "public"."wcos_capacity_profiles" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_availability_records_select" ON "public"."wcos_availability_records" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_availability_records_write" ON "public"."wcos_availability_records" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_capability_definitions_select" ON "public"."wcos_capability_definitions" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_capability_definitions_write" ON "public"."wcos_capability_definitions" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_employee_capabilities_select" ON "public"."wcos_employee_capabilities" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_employee_capabilities_write" ON "public"."wcos_employee_capabilities" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_work_items_select" ON "public"."wcos_work_items" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_work_items_write" ON "public"."wcos_work_items" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_capacity_reservations_select" ON "public"."wcos_capacity_reservations" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_capacity_reservations_write" ON "public"."wcos_capacity_reservations" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_assignment_history_select" ON "public"."wcos_assignment_history" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_assignment_history_write" ON "public"."wcos_assignment_history" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_dispatch_decisions_select" ON "public"."wcos_dispatch_decisions" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_dispatch_decisions_write" ON "public"."wcos_dispatch_decisions" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_blocking_records_select" ON "public"."wcos_blocking_records" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_blocking_records_write" ON "public"."wcos_blocking_records" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_escalation_records_select" ON "public"."wcos_escalation_records" FOR SELECT USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "wcos_escalation_records_write" ON "public"."wcos_escalation_records" FOR ALL USING (public.is_org_member("organization_id")) WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 6. Runtime Permissions & Immutability Enforcement
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oos_app_runtime;

REVOKE DELETE ON TABLE 
  "offers", "offer_versions", "negotiations", "negotiation_events", 
  "offer_decisions", "joining_records", "placement_records", "offer_evidence",
  "service_contract_versions", "commercial_events", "invoice_lines",
  "payments", "commercial_credits", "commercial_refunds", "commercial_adjustments", "revenue_attributions",
  "wcos_assignment_history", "wcos_dispatch_decisions", "wcos_blocking_records", "wcos_escalation_records", "wcos_availability_records"
FROM oos_app_runtime;
