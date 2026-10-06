-- Phase 8C.1: Interview Operating System Data Model & Persistence Foundation
-- Establishes Interview, InterviewRound, InterviewDebrief tables, enums, RLS, and AuditActions.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "InterviewStatus" AS ENUM (
    'ACTIVE',
    'CONCLUDED',
    'CANCELLED',
    'VOIDED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewRoundStatus" AS ENUM (
    'ROUND_REQUESTED',
    'ROUND_SCHEDULED',
    'ROUND_COMPLETED',
    'DEBRIEF_PENDING',
    'DEBRIEF_COMPLETED',
    'ROUND_CONCLUDED',
    'ROUND_CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewRoundType" AS ENUM (
    'RECRUITER_SCREEN',
    'TECHNICAL_SCREEN',
    'CODING_ASSESSMENT',
    'SYSTEM_DESIGN',
    'HIRING_MANAGER',
    'BEHAVIORAL_CULTURE',
    'PANEL_PRESENTATION',
    'EXECUTIVE_FINAL',
    'ONSITE_FULL_LOOP',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewFormat" AS ENUM (
    'VIRTUAL',
    'PHONE',
    'IN_PERSON',
    'ASSESSMENT_TAKE_HOME'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewRoundOutcome" AS ENUM (
    'ADVANCED_TO_NEXT_ROUND',
    'OFFER_RECEIVED',
    'REJECTED_AFTER_ROUND',
    'CANDIDATE_WITHDREW',
    'POSITION_CANCELLED',
    'AWAITING_EMPLOYER_DECISION'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InterviewSentiment" AS ENUM (
    'VERY_POSITIVE',
    'POSITIVE',
    'NEUTRAL',
    'CONCERNED',
    'DIFFICULT'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Audit actions
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_ROUND_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_ROUND_SCHEDULED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_ROUND_RESCHEDULED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_ROUND_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_ROUND_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_DEBRIEF_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_OUTCOME_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_ROUND_VOIDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTERVIEW_ROUND_SUPERSEDED';

-- 3. Tables

-- 3.1 interviews
CREATE TABLE IF NOT EXISTS "interviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "status" "InterviewStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "interviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interviews_applicationId_key" UNIQUE ("applicationId")
);

ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "interviews_organizationId_status_idx"
  ON "interviews"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "interviews_candidateId_status_idx"
  ON "interviews"("candidateId", "status");

CREATE INDEX IF NOT EXISTS "interviews_jobId_idx"
  ON "interviews"("jobId");

-- 3.2 interview_rounds
CREATE TABLE IF NOT EXISTS "interview_rounds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "interviewId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "roundNumber" INTEGER NOT NULL DEFAULT 1,
  "roundType" "InterviewRoundType" NOT NULL DEFAULT 'RECRUITER_SCREEN',
  "roundTitle" VARCHAR(200) NOT NULL,
  "status" "InterviewRoundStatus" NOT NULL DEFAULT 'ROUND_REQUESTED',
  "scheduledStartTime" TIMESTAMPTZ(6),
  "scheduledEndTime" TIMESTAMPTZ(6),
  "timezone" VARCHAR(100),
  "format" "InterviewFormat" NOT NULL DEFAULT 'VIRTUAL',
  "meetingUrl" VARCHAR(1024),
  "location" VARCHAR(500),
  "interviewers" JSONB NOT NULL DEFAULT '[]',
  "preparationBrief" JSONB NOT NULL DEFAULT '{}',
  "internalStaffNotes" TEXT,
  "candidatePreparationNotes" TEXT,
  "occurredAt" TIMESTAMPTZ(6),
  "outcome" "InterviewRoundOutcome",
  "outcomeNotes" TEXT,
  "rescheduledBy" VARCHAR(50),
  "rescheduleReason" TEXT,
  "cancelledBy" VARCHAR(50),
  "cancelReason" TEXT,
  "voidedAt" TIMESTAMPTZ(6),
  "voidedById" UUID,
  "voidReason" TEXT,
  "supersededById" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "interview_rounds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interview_rounds_interviewId_roundNumber_key" UNIQUE ("interviewId", "roundNumber")
);

ALTER TABLE "interview_rounds"
  ADD CONSTRAINT "interview_rounds_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_rounds"
  ADD CONSTRAINT "interview_rounds_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "interview_rounds"
  ADD CONSTRAINT "interview_rounds_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "interview_rounds"
  ADD CONSTRAINT "interview_rounds_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "interview_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "interview_rounds_organizationId_status_idx"
  ON "interview_rounds"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "interview_rounds_interviewId_status_idx"
  ON "interview_rounds"("interviewId", "status");

CREATE INDEX IF NOT EXISTS "interview_rounds_scheduledStartTime_idx"
  ON "interview_rounds"("scheduledStartTime");

-- 3.3 interview_debriefs
CREATE TABLE IF NOT EXISTS "interview_debriefs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "roundId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "candidateSentiment" "InterviewSentiment" NOT NULL DEFAULT 'NEUTRAL',
  "questionsAsked" JSONB NOT NULL DEFAULT '[]',
  "candidateFeedbackNotes" TEXT,
  "staffAssessmentNotes" TEXT,
  "followUpItems" TEXT,
  "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "interview_debriefs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interview_debriefs_roundId_key" UNIQUE ("roundId")
);

ALTER TABLE "interview_debriefs"
  ADD CONSTRAINT "interview_debriefs_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "interview_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interview_debriefs"
  ADD CONSTRAINT "interview_debriefs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "interview_debriefs"
  ADD CONSTRAINT "interview_debriefs_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "interview_debriefs_organizationId_idx"
  ON "interview_debriefs"("organizationId");

CREATE INDEX IF NOT EXISTS "interview_debriefs_roundId_idx"
  ON "interview_debriefs"("roundId");

-- 4. RLS & Security

ALTER TABLE "interviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interviews" FORCE ROW LEVEL SECURITY;

ALTER TABLE "interview_rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_rounds" FORCE ROW LEVEL SECURITY;

ALTER TABLE "interview_debriefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_debriefs" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON "interviews" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "interview_rounds" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "interview_debriefs" TO "oos_app_runtime";
-- No DELETE grant (Void-only in V1)

-- Helper check for candidate ownership of an interview
CREATE OR REPLACE FUNCTION public.is_interview_candidate_owner(lookup_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = lookup_candidate_id
      AND c."userId" = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      AND c."organizationId" = (SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  );
$$;
REVOKE ALL ON FUNCTION public.is_interview_candidate_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_interview_candidate_owner(uuid) TO oos_app_runtime, authenticated;

-- Helper check for candidate ownership of an interview round
CREATE OR REPLACE FUNCTION public.is_interview_round_candidate_owner(lookup_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.interview_rounds r
    JOIN public.interviews i ON i.id = r."interviewId"
    JOIN public.candidates c ON c.id = i."candidateId"
    WHERE r.id = lookup_round_id
      AND c."userId" = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      AND i."organizationId" = (SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  );
$$;
REVOKE ALL ON FUNCTION public.is_interview_round_candidate_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_interview_round_candidate_owner(uuid) TO oos_app_runtime, authenticated;

-- Policies for interviews
DO $$ BEGIN
  CREATE POLICY "interviews_select"
  ON "public"."interviews"
  FOR SELECT
  USING (
    public.is_application_org_privileged_member("applicationId")
    OR public.is_interview_candidate_owner("candidateId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "interviews_insert"
  ON "public"."interviews"
  FOR INSERT
  WITH CHECK (
    public.is_application_org_privileged_member("applicationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "interviews_update"
  ON "public"."interviews"
  FOR UPDATE
  USING (public.is_application_org_privileged_member("applicationId"))
  WITH CHECK (public.is_application_org_privileged_member("applicationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for interview_rounds
DO $$ BEGIN
  CREATE POLICY "interview_rounds_select"
  ON "public"."interview_rounds"
  FOR SELECT
  USING (
    public.is_interview_round_candidate_owner("id")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "interview_rounds_insert"
  ON "public"."interview_rounds"
  FOR INSERT
  WITH CHECK (
    public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "interview_rounds_update"
  ON "public"."interview_rounds"
  FOR UPDATE
  USING (public.is_org_member("organizationId"))
  WITH CHECK (public.is_org_member("organizationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for interview_debriefs
DO $$ BEGIN
  CREATE POLICY "interview_debriefs_select"
  ON "public"."interview_debriefs"
  FOR SELECT
  USING (
    public.is_interview_round_candidate_owner("roundId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "interview_debriefs_insert"
  ON "public"."interview_debriefs"
  FOR INSERT
  WITH CHECK (
    public.is_interview_round_candidate_owner("roundId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "interview_debriefs_update"
  ON "public"."interview_debriefs"
  FOR UPDATE
  USING (public.is_org_member("organizationId"))
  WITH CHECK (public.is_org_member("organizationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
