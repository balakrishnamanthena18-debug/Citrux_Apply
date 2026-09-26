-- Phase 8 Admin & Privacy Core Migration
-- Enforces PostgreSQL Row Level Security (FORCE RLS) for non-superuser oos_app_runtime

-- 1. Create Enums if they do not exist
DO $$ BEGIN
  CREATE TYPE "PrivacyRequestType" AS ENUM (
    'DATA_EXPORT',
    'DATA_CORRECTION',
    'DATA_DELETION'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PrivacyRequestStatus" AS ENUM (
    'PENDING',
    'IDENTITY_VERIFIED',
    'IN_REVIEW',
    'COMPLETED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Extend AuditAction Enum
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_ACTIVATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_DEACTIVATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMPLOYEE_ROLE_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPERATIONAL_WORK_REASSIGNED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRIVACY_REQUEST_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRIVACY_REQUEST_VERIFIED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRIVACY_REQUEST_COMPLETED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRIVACY_REQUEST_REJECTED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_DATA_EXPORTED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_DATA_CORRECTED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_DATA_DELETED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Create privacy_requests table
CREATE TABLE IF NOT EXISTS "privacy_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "request_type" "PrivacyRequestType" NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requested_by_id" UUID NOT NULL,
  "verified_by_id" UUID,
  "completed_by_id" UUID,
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "scope_details" TEXT,
  "resolution_notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "privacy_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "privacy_requests_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "privacy_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "privacy_requests_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "privacy_requests_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS "idx_privacy_requests_org_status" ON "privacy_requests"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "idx_privacy_requests_org_candidate" ON "privacy_requests"("organization_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "idx_privacy_requests_org_created" ON "privacy_requests"("organization_id", "created_at");

-- 5. Row Level Security Grants and Policies
ALTER TABLE "privacy_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "privacy_requests" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON "privacy_requests" TO "oos_app_runtime";
EXCEPTION WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "privacy_requests_staff_select" ON "privacy_requests"
    FOR SELECT
    USING (
      public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "privacy_requests_candidate_select" ON "privacy_requests"
    FOR SELECT
    USING (
      candidate_id IN (
        SELECT c.id FROM "candidates" c
        WHERE c."userId" = public.current_user_id()
          AND c."organizationId" = organization_id
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "privacy_requests_candidate_insert" ON "privacy_requests"
    FOR INSERT
    WITH CHECK (
      requested_by_id = public.current_user_id()
      AND candidate_id IN (
        SELECT c.id FROM "candidates" c
        WHERE c."userId" = public.current_user_id()
          AND c."organizationId" = organization_id
      )
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "privacy_requests_staff_update" ON "privacy_requests"
    FOR UPDATE
    USING (
      public.is_org_privileged_member(organization_id, public.current_user_id())
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
