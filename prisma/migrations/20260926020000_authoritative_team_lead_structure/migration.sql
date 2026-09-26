-- Migration: Authoritative Team Lead Structural Model (v2.4.0)

-- 1. Extend AuditAction Enum
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_TEAM_LEAD_CHANGED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TASK_CREATION_DENIED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Extend memberships Table with explicit team lead structural fields
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "is_team_lead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "team_lead_of" VARCHAR(100);

CREATE INDEX IF NOT EXISTS "idx_memberships_team_lead" ON "memberships"("organizationId", "is_team_lead");
