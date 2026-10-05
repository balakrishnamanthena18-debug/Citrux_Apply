-- Phase 2 Gate 5 — Job-only requirement extraction runs
-- Makes candidate/application optional; adds analysisPurpose.
-- RLS: null applicationId rows are org-privileged only (no candidate path).

ALTER TABLE "public"."application_intelligence_runs"
  ALTER COLUMN "candidateId" DROP NOT NULL,
  ALTER COLUMN "applicationId" DROP NOT NULL;

ALTER TABLE "public"."application_intelligence_runs"
  ADD COLUMN IF NOT EXISTS "analysisPurpose" VARCHAR(64) NOT NULL DEFAULT 'APPLICATION_INTELLIGENCE';

CREATE INDEX IF NOT EXISTS "application_intelligence_runs_analysisPurpose_jobId_idx"
  ON "public"."application_intelligence_runs"("analysisPurpose", "jobId", "createdAt");

DROP POLICY IF EXISTS application_intelligence_runs_select ON "public"."application_intelligence_runs";
CREATE POLICY application_intelligence_runs_select ON "public"."application_intelligence_runs"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.is_org_privileged_member("organizationId", public.current_user_id()) OR
      (
        "applicationId" IS NOT NULL AND
        public.application_belongs_to_candidate_user("applicationId", public.current_user_id())
      )
    )
  );

DROP POLICY IF EXISTS application_intelligence_runs_insert ON "public"."application_intelligence_runs";
CREATE POLICY application_intelligence_runs_insert ON "public"."application_intelligence_runs"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      public.is_org_privileged_member("organizationId", public.current_user_id()) OR
      (
        "applicationId" IS NOT NULL AND
        public.application_belongs_to_candidate_user("applicationId", public.current_user_id())
      )
    )
  );
