-- Phase 5A.5 remediation (applied): intended org consistency on INSERT/UPDATE.
-- Historical note: early draft used unqualified "organizationId" inside EXISTS which
-- PostgreSQL bound to candidates.c (tautology). Correct qualification is applied in
-- 20261005144500_phase5a5_match_rls_org_qualify. This migration remains for history.

DROP POLICY IF EXISTS candidate_job_matches_insert ON "public"."candidate_job_matches";
DROP POLICY IF EXISTS candidate_job_matches_update ON "public"."candidate_job_matches";

CREATE POLICY candidate_job_matches_insert ON "public"."candidate_job_matches"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_job_matches_update ON "public"."candidate_job_matches"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );
