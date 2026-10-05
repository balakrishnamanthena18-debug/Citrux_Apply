-- Phase 2 Application Intelligence foundation
-- Immutable JD snapshots + intelligence persistence contracts.
-- No AI execution. No result population.

CREATE TYPE "FactProvenance" AS ENUM (
  'VERIFIED',
  'CANDIDATE_PROVIDED',
  'EMPLOYEE_PROVIDED',
  'AI_INFERRED',
  'UNKNOWN'
);

CREATE TYPE "IntelligenceRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED'
);

CREATE TYPE "IntelligenceResultFreshness" AS ENUM (
  'CURRENT',
  'STALE',
  'RECOMPUTE_REQUIRED'
);

CREATE TYPE "IntelligenceValidationStatus" AS ENUM (
  'PENDING',
  'PASSED',
  'FAILED',
  'SKIPPED'
);

-- Extend AuditAction for intelligence lifecycle events
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_DESCRIPTION_SNAPSHOT_CAPTURED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_INTELLIGENCE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_INTELLIGENCE_STARTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_INTELLIGENCE_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_INTELLIGENCE_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_INTELLIGENCE_INVALIDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_INTELLIGENCE_MARKED_STALE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_INTELLIGENCE_RECOMPUTE_REQUESTED';

CREATE TABLE "public"."job_description_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "sourceText" TEXT NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "sourceUrl" VARCHAR(1024),
  "sourceLabel" VARCHAR(100),
  "sourceVersionId" VARCHAR(128) NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "capturedById" UUID,
  CONSTRAINT "job_description_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "job_description_snapshots_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "job_description_snapshots_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "job_description_snapshots_jobId_contentHash_key"
  ON "public"."job_description_snapshots"("jobId", "contentHash");
CREATE INDEX "job_description_snapshots_organizationId_jobId_idx"
  ON "public"."job_description_snapshots"("organizationId", "jobId");
CREATE INDEX "job_description_snapshots_jobId_capturedAt_idx"
  ON "public"."job_description_snapshots"("jobId", "capturedAt");

CREATE TABLE "public"."job_requirement_sets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "schemaVersion" VARCHAR(32) NOT NULL,
  "extractionVersion" VARCHAR(32) NOT NULL,
  "requirements" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_requirement_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "job_requirement_sets_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "job_requirement_sets_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "job_requirement_sets_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "public"."job_description_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "job_requirement_sets_organizationId_jobId_idx"
  ON "public"."job_requirement_sets"("organizationId", "jobId");
CREATE INDEX "job_requirement_sets_snapshotId_idx"
  ON "public"."job_requirement_sets"("snapshotId");

CREATE TABLE "public"."application_intelligence_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "requirementSetId" UUID,
  "requestedById" UUID,
  "status" "IntelligenceRunStatus" NOT NULL DEFAULT 'QUEUED',
  "freshness" "IntelligenceResultFreshness" NOT NULL DEFAULT 'CURRENT',
  "validationStatus" "IntelligenceValidationStatus" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(64) NOT NULL,
  "model" VARCHAR(128) NOT NULL,
  "promptVersion" VARCHAR(64) NOT NULL,
  "schemaVersion" VARCHAR(64) NOT NULL,
  "scoringVersion" VARCHAR(64) NOT NULL,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "sourceDataVersion" VARCHAR(128) NOT NULL,
  "errorCode" VARCHAR(64),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMPTZ(6),
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "application_intelligence_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_intelligence_runs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_intelligence_runs_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_intelligence_runs_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_intelligence_runs_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_intelligence_runs_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "public"."job_description_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_intelligence_runs_requirementSetId_fkey"
    FOREIGN KEY ("requirementSetId") REFERENCES "public"."job_requirement_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "application_intelligence_runs_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "application_intelligence_runs_idempotencyKey_key"
  ON "public"."application_intelligence_runs"("idempotencyKey");
CREATE INDEX "application_intelligence_runs_organizationId_applicationId_createdAt_idx"
  ON "public"."application_intelligence_runs"("organizationId", "applicationId", "createdAt");
CREATE INDEX "application_intelligence_runs_candidateId_createdAt_idx"
  ON "public"."application_intelligence_runs"("candidateId", "createdAt");
CREATE INDEX "application_intelligence_runs_status_createdAt_idx"
  ON "public"."application_intelligence_runs"("status", "createdAt");
CREATE INDEX "application_intelligence_runs_applicationId_freshness_status_idx"
  ON "public"."application_intelligence_runs"("applicationId", "freshness", "status");

CREATE TABLE "public"."application_alignment_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "freshness" "IntelligenceResultFreshness" NOT NULL DEFAULT 'CURRENT',
  "scoringVersion" VARCHAR(64) NOT NULL,
  "overallScore" INTEGER,
  "dimensionScores" JSONB NOT NULL DEFAULT '{}',
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_alignment_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_alignment_results_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_alignment_results_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_alignment_results_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "public"."application_intelligence_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "application_alignment_results_runId_key"
  ON "public"."application_alignment_results"("runId");
CREATE INDEX "application_alignment_results_organizationId_applicationId_idx"
  ON "public"."application_alignment_results"("organizationId", "applicationId");
CREATE INDEX "application_alignment_results_applicationId_freshness_idx"
  ON "public"."application_alignment_results"("applicationId", "freshness");

CREATE TABLE "public"."application_readiness_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "runId" UUID NOT NULL,
  "freshness" "IntelligenceResultFreshness" NOT NULL DEFAULT 'CURRENT',
  "readinessState" VARCHAR(32) NOT NULL,
  "blockers" JSONB NOT NULL DEFAULT '[]',
  "warnings" JSONB NOT NULL DEFAULT '[]',
  "nextActions" JSONB NOT NULL DEFAULT '[]',
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_readiness_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_readiness_results_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_readiness_results_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_readiness_results_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "public"."application_intelligence_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "application_readiness_results_runId_key"
  ON "public"."application_readiness_results"("runId");
CREATE INDEX "application_readiness_results_organizationId_applicationId_idx"
  ON "public"."application_readiness_results"("organizationId", "applicationId");
CREATE INDEX "application_readiness_results_applicationId_freshness_idx"
  ON "public"."application_readiness_results"("applicationId", "freshness");

-- RLS: mirror application ownership / org privilege patterns
ALTER TABLE "public"."job_description_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."job_requirement_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_intelligence_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_alignment_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_readiness_results" ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_description_snapshots_select ON "public"."job_description_snapshots"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.is_org_privileged_member("organizationId", public.current_user_id()) OR
      EXISTS (
        SELECT 1 FROM "public"."applications" a
        WHERE a."jobId" = "job_description_snapshots"."jobId"
          AND public.application_belongs_to_candidate_user(a.id, public.current_user_id())
      )
    )
  );

CREATE POLICY job_description_snapshots_insert ON "public"."job_description_snapshots"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

-- Snapshots are immutable: no UPDATE/DELETE for clients
CREATE POLICY job_description_snapshots_update ON "public"."job_description_snapshots"
  FOR UPDATE USING (false);
CREATE POLICY job_description_snapshots_delete ON "public"."job_description_snapshots"
  FOR DELETE USING (false);

CREATE POLICY job_requirement_sets_select ON "public"."job_requirement_sets"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.is_org_privileged_member("organizationId", public.current_user_id()) OR
      EXISTS (
        SELECT 1 FROM "public"."applications" a
        WHERE a."jobId" = "job_requirement_sets"."jobId"
          AND public.application_belongs_to_candidate_user(a.id, public.current_user_id())
      )
    )
  );

CREATE POLICY job_requirement_sets_insert ON "public"."job_requirement_sets"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY job_requirement_sets_update ON "public"."job_requirement_sets"
  FOR UPDATE USING (false);
CREATE POLICY job_requirement_sets_delete ON "public"."job_requirement_sets"
  FOR DELETE USING (false);

CREATE POLICY application_intelligence_runs_select ON "public"."application_intelligence_runs"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user("applicationId", public.current_user_id()) OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

CREATE POLICY application_intelligence_runs_insert ON "public"."application_intelligence_runs"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user("applicationId", public.current_user_id()) OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

CREATE POLICY application_intelligence_runs_update ON "public"."application_intelligence_runs"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY application_intelligence_runs_delete ON "public"."application_intelligence_runs"
  FOR DELETE USING (false);

CREATE POLICY application_alignment_results_select ON "public"."application_alignment_results"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user("applicationId", public.current_user_id()) OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

CREATE POLICY application_alignment_results_insert ON "public"."application_alignment_results"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY application_alignment_results_update ON "public"."application_alignment_results"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY application_alignment_results_delete ON "public"."application_alignment_results"
  FOR DELETE USING (false);

CREATE POLICY application_readiness_results_select ON "public"."application_readiness_results"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user("applicationId", public.current_user_id()) OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

CREATE POLICY application_readiness_results_insert ON "public"."application_readiness_results"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY application_readiness_results_update ON "public"."application_readiness_results"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY application_readiness_results_delete ON "public"."application_readiness_results"
  FOR DELETE USING (false);
