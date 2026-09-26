-- Phase 6: Submission & Evidence Core Migration
-- Operations Operating System (OOS) - PostgreSQL Contract

-- 1. Alter Enum: Add Phase 6 Audit Actions
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_SUBMISSION_ISSUE_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_CORRECTION_REVIEW_STARTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_RESUBMISSION_STAGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_SUBMISSION_EVIDENCE_UPLOADED';

-- 2. Alter Table: Add storagePath to application_submissions
ALTER TABLE "application_submissions" ADD COLUMN IF NOT EXISTS "storagePath" VARCHAR(1024);

-- 3. Create Indexes & Constraints
CREATE UNIQUE INDEX IF NOT EXISTS "application_submissions_applicationId_attemptNumber_key" ON "application_submissions"("applicationId", "attemptNumber");
CREATE INDEX IF NOT EXISTS "application_submissions_submittedById_idx" ON "application_submissions"("submittedById");

-- 4. Enable and FORCE Row Level Security
ALTER TABLE "application_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_submissions" FORCE ROW LEVEL SECURITY;

-- 5. Append-Only Grants for app runtime role (SELECT and INSERT only; UPDATE and DELETE are PROHIBITED)
GRANT SELECT, INSERT ON "application_submissions" TO "oos_app_runtime";

-- 6. Helper functions for Application and Submission RLS
CREATE OR REPLACE FUNCTION public.is_application_org_privileged_member(lookup_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.memberships m ON a."organizationId" = m."organizationId"
    WHERE a.id = lookup_application_id
      AND m."userId" = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      AND m.status = 'ACTIVE'
      AND m.role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.is_application_org_privileged_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_application_org_privileged_member(uuid) TO oos_app_runtime, authenticated;

CREATE OR REPLACE FUNCTION public.is_submission_org_privileged_member(target_submission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.application_submissions s
    JOIN public.applications a ON a.id = s."applicationId"
    JOIN public.memberships om ON om."organizationId" = a."organizationId"
    WHERE s.id = target_submission_id
      AND om."organizationId" = (SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
      AND om."userId" = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      AND om.status = 'ACTIVE'
      AND om.role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.is_submission_org_privileged_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_submission_org_privileged_member(uuid) TO oos_app_runtime, authenticated;

-- 7. RLS Policies for application_submissions (Staff-Only, Org-Scoped via Parent Application; Append-Only)
DO $$ BEGIN
  CREATE POLICY "application_submissions_staff_select"
  ON "public"."application_submissions"
  FOR SELECT
  USING (
    public.is_application_org_privileged_member("applicationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "application_submissions_staff_insert"
  ON "public"."application_submissions"
  FOR INSERT
  WITH CHECK (
    public.is_application_org_privileged_member("applicationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
