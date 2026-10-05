-- Phase 2 Gate 2 — Requirement set freshness + audit + privileged freshness updates
-- Snapshots remain immutable (UPDATE/DELETE still denied).

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_REQUIREMENT_SET_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_REQUIREMENT_SET_INVALIDATED';

ALTER TABLE "public"."job_requirement_sets"
  ADD COLUMN IF NOT EXISTS "normalizationVersion" VARCHAR(32) NOT NULL DEFAULT 'normalize.v1',
  ADD COLUMN IF NOT EXISTS "freshness" "IntelligenceResultFreshness" NOT NULL DEFAULT 'CURRENT';

CREATE INDEX IF NOT EXISTS "job_requirement_sets_jobId_freshness_idx"
  ON "public"."job_requirement_sets"("jobId", "freshness");

-- Allow org-privileged freshness/metadata updates; content rewrite discouraged at app layer
DROP POLICY IF EXISTS job_requirement_sets_update ON "public"."job_requirement_sets";
CREATE POLICY job_requirement_sets_update ON "public"."job_requirement_sets"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  )
  WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );
