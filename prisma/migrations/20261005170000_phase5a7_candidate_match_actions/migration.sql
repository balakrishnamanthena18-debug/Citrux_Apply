-- Phase 5A.7 — candidate match action audits + opportunity self-insert
-- Candidates may create CandidateJobOpportunity for themselves only.
-- Does not weaken JobRequirementSet / Snapshot / Job catalog visibility.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_MATCH_SAVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_MATCH_DISMISSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_APPLICATION_REQUESTED';

DROP POLICY IF EXISTS candidate_job_opportunities_insert ON "public"."candidate_job_opportunities";

CREATE POLICY candidate_job_opportunities_insert ON "public"."candidate_job_opportunities"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      public.is_org_privileged_member("organizationId", public.current_user_id())
      OR (
        public.candidate_belongs_to_user("candidateId", public.current_user_id())
        AND EXISTS (
          SELECT 1 FROM public.candidates c
          WHERE c.id = candidate_job_opportunities."candidateId"
            AND c."organizationId" = candidate_job_opportunities."organizationId"
            AND c."userId" = public.current_user_id()
        )
        AND "discoveredById" = public.current_user_id()
      )
    )
  );
