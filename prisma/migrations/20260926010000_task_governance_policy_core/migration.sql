-- Migration: Task Governance & Access Control Policy (v2.3.0)
-- Enforces PostgreSQL Row Level Security (FORCE RLS) for multi-tenant isolation

-- 1. Extend AuditAction Enum
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TASK_GOVERNANCE_POLICY_UPDATED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Create task_governance_policies Table
CREATE TABLE IF NOT EXISTS "task_governance_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "can_create_roles" JSONB NOT NULL DEFAULT '["ADMIN", "MANAGER", "TEAM_LEAD"]'::jsonb,
  "can_assign_roles" JSONB NOT NULL DEFAULT '["ADMIN", "MANAGER", "TEAM_LEAD"]'::jsonb,
  "can_cancel_roles" JSONB NOT NULL DEFAULT '["ADMIN", "MANAGER", "TEAM_LEAD"]'::jsonb,
  "can_escalate_roles" JSONB NOT NULL DEFAULT '["ADMIN", "MANAGER", "TEAM_LEAD"]'::jsonb,
  "can_complete_roles" JSONB NOT NULL DEFAULT '["ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"]'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_governance_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_governance_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "task_governance_policies_organization_id_key" ON "task_governance_policies"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_task_governance_org" ON "task_governance_policies"("organization_id");

-- 3. RLS Policies for task_governance_policies
ALTER TABLE "task_governance_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_governance_policies" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "task_governance_policies_tenant_select" ON "task_governance_policies"
    FOR SELECT TO authenticated
    USING (
      "organization_id" IN (
        SELECT "organizationId" FROM "memberships"
        WHERE "userId" = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
        AND "status" = 'ACTIVE'
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "task_governance_policies_admin_manage" ON "task_governance_policies"
    FOR ALL TO authenticated
    USING (
      "organization_id" IN (
        SELECT "organizationId" FROM "memberships"
        WHERE "userId" = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
        AND "role" = 'ADMIN'
        AND "status" = 'ACTIVE'
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
