-- Fix Phase 5A.5 INSERT/UPDATE WITH CHECK: qualify outer organizationId.
-- Previous policy compared c."organizationId" = c."organizationId" (always true).

DROP POLICY IF EXISTS candidate_job_matches_insert ON "public"."candidate_job_matches";
DROP POLICY IF EXISTS candidate_job_matches_update ON "public"."candidate_job_matches";

CREATE POLICY candidate_job_matches_insert ON "public"."candidate_job_matches"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      (
        public.candidate_belongs_to_user("candidateId", public.current_user_id())
        AND EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c.id = candidate_job_matches."candidateId"
            AND c."organizationId" = candidate_job_matches."organizationId"
            AND c."userId" = public.current_user_id()
        )
      )
      OR (
        public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
        AND EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c.id = candidate_job_matches."candidateId"
            AND c."organizationId" = candidate_job_matches."organizationId"
        )
      )
    )
  );

CREATE POLICY candidate_job_matches_update ON "public"."candidate_job_matches"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  )
  WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      (
        public.candidate_belongs_to_user("candidateId", public.current_user_id())
        AND EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c.id = candidate_job_matches."candidateId"
            AND c."organizationId" = candidate_job_matches."organizationId"
            AND c."userId" = public.current_user_id()
        )
      )
      OR (
        public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
        AND EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c.id = candidate_job_matches."candidateId"
            AND c."organizationId" = candidate_job_matches."organizationId"
        )
      )
    )
  );
