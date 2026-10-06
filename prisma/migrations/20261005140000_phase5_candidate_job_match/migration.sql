-- Phase 5A.5 — CandidateJobMatch persistence + FORCE RLS
-- Additive only. ONE CURRENT match per (organizationId, candidateId, jobId).
-- matchingContractVersion + sourceDataVersion describe the CURRENT evaluation.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_MATCH_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_MATCH_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_MATCH_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_MATCH_MARKED_STALE';

CREATE TYPE "CandidateJobMatchStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'STALE',
  'FAILED'
);

CREATE TYPE "CandidateJobMatchCategory" AS ENUM (
  'STRONG_MATCH',
  'GOOD_MATCH',
  'POSSIBLE_MATCH',
  'NEEDS_REVIEW',
  'LOW_MATCH'
);

CREATE TABLE "public"."candidate_job_matches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "snapshotId" UUID,
  "requirementSetId" UUID,
  "matchingContractVersion" VARCHAR(64) NOT NULL,
  "sourceDataVersion" VARCHAR(256) NOT NULL,
  "status" "CandidateJobMatchStatus" NOT NULL DEFAULT 'QUEUED',
  "freshness" "IntelligenceResultFreshness" NOT NULL DEFAULT 'CURRENT',
  "category" "CandidateJobMatchCategory",
  "qualificationSummary" JSONB NOT NULL DEFAULT '[]',
  "preferenceSummary" JSONB NOT NULL DEFAULT '[]',
  "presentation" JSONB NOT NULL DEFAULT '{}',
  "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
  "errorCode" VARCHAR(64),
  "errorMessage" TEXT,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "leaseExpiresAt" TIMESTAMPTZ(6),
  "savedAt" TIMESTAMPTZ(6),
  "dismissedAt" TIMESTAMPTZ(6),
  "dismissReason" VARCHAR(64),
  "applicationRequestedAt" TIMESTAMPTZ(6),
  "opportunityId" UUID,
  "requestedById" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "evaluatedAt" TIMESTAMPTZ(6),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "candidate_job_matches_pkey" PRIMARY KEY ("id")
);

-- CURRENT feed/action identity
CREATE UNIQUE INDEX "candidate_job_matches_organizationId_candidateId_jobId_key"
  ON "public"."candidate_job_matches"("organizationId", "candidateId", "jobId");

CREATE UNIQUE INDEX "candidate_job_matches_idempotencyKey_key"
  ON "public"."candidate_job_matches"("idempotencyKey");

CREATE INDEX "candidate_job_matches_candidateId_status_freshness_dismissedAt_idx"
  ON "public"."candidate_job_matches"("candidateId", "status", "freshness", "dismissedAt");

CREATE INDEX "candidate_job_matches_organizationId_jobId_idx"
  ON "public"."candidate_job_matches"("organizationId", "jobId");

CREATE INDEX "candidate_job_matches_status_leaseExpiresAt_idx"
  ON "public"."candidate_job_matches"("status", "leaseExpiresAt");

ALTER TABLE "public"."candidate_job_matches"
  ADD CONSTRAINT "candidate_job_matches_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."candidate_job_matches"
  ADD CONSTRAINT "candidate_job_matches_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."candidate_job_matches"
  ADD CONSTRAINT "candidate_job_matches_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."candidate_job_matches"
  ADD CONSTRAINT "candidate_job_matches_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "public"."job_description_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."candidate_job_matches"
  ADD CONSTRAINT "candidate_job_matches_requirementSetId_fkey"
  FOREIGN KEY ("requirementSetId") REFERENCES "public"."job_requirement_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."candidate_job_matches"
  ADD CONSTRAINT "candidate_job_matches_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "public"."candidate_job_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."candidate_job_matches"
  ADD CONSTRAINT "candidate_job_matches_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FORCE RLS — do not broaden JobRequirementSet / Snapshot policies
ALTER TABLE "public"."candidate_job_matches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_job_matches" FORCE ROW LEVEL SECURITY;

CREATE POLICY candidate_job_matches_select ON "public"."candidate_job_matches"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

-- Inserts are server/worker/staff paths; candidates may not invent matches for others.
CREATE POLICY candidate_job_matches_insert ON "public"."candidate_job_matches"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

-- UPDATE allowed for own/privileged rows; evaluation field separation enforced in server code.
CREATE POLICY candidate_job_matches_update ON "public"."candidate_job_matches"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_job_matches_delete ON "public"."candidate_job_matches"
  FOR DELETE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."candidate_job_matches" TO oos_app_runtime;
