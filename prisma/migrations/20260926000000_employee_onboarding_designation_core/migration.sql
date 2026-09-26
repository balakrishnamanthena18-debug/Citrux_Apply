-- Migration: Employee Onboarding, Organizational Identity & Designation Management (v2.2.0)
-- Enforces PostgreSQL Row Level Security (FORCE RLS) for multi-tenant isolation

-- 1. Create DesignationStatus Enum
DO $$ BEGIN
  CREATE TYPE "DesignationStatus" AS ENUM (
    'ACTIVE',
    'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Extend AuditAction Enum
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_INVITATION_SENT';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_INVITATION_RESENT';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_DESIGNATION_CHANGED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_DEPARTMENT_CHANGED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_TEAM_CHANGED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_MANAGER_CHANGED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_SESSIONS_REVOKED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DESIGNATION_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DESIGNATION_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DESIGNATION_ARCHIVED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DESIGNATION_REACTIVATED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Create designations Table
CREATE TABLE IF NOT EXISTS "designations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "code" VARCHAR(50),
  "description" TEXT,
  "status" "DesignationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "designations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "designations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_designation_name_unique" ON "designations"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "idx_designations_org_status" ON "designations"("organization_id", "status");

-- 4. Create staff_activation_tokens Table
CREATE TABLE IF NOT EXISTS "staff_activation_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "reserved_until" TIMESTAMPTZ(6),
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_activation_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_activation_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_activation_tokens_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_activation_tokens_token_hash_key" ON "staff_activation_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "idx_staff_tokens_membership_expires" ON "staff_activation_tokens"("membership_id", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_staff_tokens_organization" ON "staff_activation_tokens"("organization_id");

-- 5. Extend memberships Table
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "employee_id" VARCHAR(50);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "designation_id" UUID;
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "department" VARCHAR(100);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "team" VARCHAR(100);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "reporting_manager_id" UUID;
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "employment_type" VARCHAR(50);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "joining_date" TIMESTAMPTZ(6);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "work_location" VARCHAR(100);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "work_mode" VARCHAR(50);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "personal_email" VARCHAR(255);
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMPTZ(6);

DO $$ BEGIN
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_reporting_manager_id_fkey" FOREIGN KEY ("reporting_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "org_employee_id_unique" ON "memberships"("organizationId", "employee_id");
CREATE INDEX IF NOT EXISTS "memberships_organizationId_designation_id_idx" ON "memberships"("organizationId", "designation_id");
CREATE INDEX IF NOT EXISTS "memberships_reporting_manager_id_idx" ON "memberships"("reporting_manager_id");

-- 6. RLS Policies for designations
ALTER TABLE "designations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "designations" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "designations_tenant_select" ON "designations"
    FOR SELECT TO authenticated
    USING (
      organization_id = (
        SELECT "organizationId" FROM memberships
        WHERE "userId" = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
          AND status = 'ACTIVE' LIMIT 1
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "designations_admin_write" ON "designations"
    FOR ALL TO authenticated
    USING (
      organization_id = (
        SELECT "organizationId" FROM memberships
        WHERE "userId" = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
          AND role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1
      )
    )
    WITH CHECK (
      organization_id = (
        SELECT "organizationId" FROM memberships
        WHERE "userId" = NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
          AND role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 7. RLS Policies for staff_activation_tokens (Server-Only, No Public Client Access)
ALTER TABLE "staff_activation_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_activation_tokens" FORCE ROW LEVEL SECURITY;

