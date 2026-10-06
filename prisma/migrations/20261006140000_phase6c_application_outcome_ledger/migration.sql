-- Phase 6C: Application Outcome Ledger Foundation
-- Append-only external outcome events (not ApplicationStatus).

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "ApplicationOutcomeType" AS ENUM (
    'EMPLOYER_REJECTION',
    'RECRUITER_CONTACT',
    'INTERVIEW_REQUESTED',
    'INTERVIEW_SCHEDULED',
    'OFFER_RECEIVED',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApplicationOutcomeProvenance" AS ENUM (
    'EMPLOYEE_RECORDED',
    'CANDIDATE_REPORTED',
    'STAFF_VERIFIED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApplicationOutcomeCorrectionState" AS ENUM (
    'ACTIVE',
    'VOIDED',
    'SUPERSEDED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Audit actions
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_OUTCOME_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_OUTCOME_CANDIDATE_REPORTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_OUTCOME_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_OUTCOME_VOIDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_OUTCOME_SUPERSEDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_OUTCOME_EVIDENCE_UPLOADED';

-- 3. Table
CREATE TABLE IF NOT EXISTS "application_outcome_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "outcomeType" "ApplicationOutcomeType" NOT NULL,
  "provenance" "ApplicationOutcomeProvenance" NOT NULL,
  "actorUserId" UUID NOT NULL,
  "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurredAt" TIMESTAMPTZ(6),
  "notes" TEXT,
  "candidateVisible" BOOLEAN NOT NULL DEFAULT false,
  "evidenceText" TEXT,
  "evidenceStoragePath" VARCHAR(1024),
  "evidenceShareable" BOOLEAN NOT NULL DEFAULT false,
  "correctionState" "ApplicationOutcomeCorrectionState" NOT NULL DEFAULT 'ACTIVE',
  "voidedAt" TIMESTAMPTZ(6),
  "voidedById" UUID,
  "voidReason" TEXT,
  "supersededById" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_outcome_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "application_outcome_events"
  ADD CONSTRAINT "application_outcome_events_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "application_outcome_events"
  ADD CONSTRAINT "application_outcome_events_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "application_outcome_events"
  ADD CONSTRAINT "application_outcome_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "application_outcome_events"
  ADD CONSTRAINT "application_outcome_events_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "application_outcome_events"
  ADD CONSTRAINT "application_outcome_events_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "application_outcome_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "application_outcome_events_organizationId_applicationId_recordedAt_idx"
  ON "application_outcome_events"("organizationId", "applicationId", "recordedAt");

CREATE INDEX IF NOT EXISTS "application_outcome_events_applicationId_correctionState_recordedAt_idx"
  ON "application_outcome_events"("applicationId", "correctionState", "recordedAt");

CREATE INDEX IF NOT EXISTS "application_outcome_events_organizationId_outcomeType_recordedAt_idx"
  ON "application_outcome_events"("organizationId", "outcomeType", "recordedAt");

-- 4. RLS — org staff + owning candidate (visibility rules enforced in app + SELECT policy)
ALTER TABLE "application_outcome_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_outcome_events" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON "application_outcome_events" TO "oos_app_runtime";
-- No DELETE grant (O2 void-only)

CREATE OR REPLACE FUNCTION public.is_outcome_application_candidate_owner(lookup_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.candidates c ON c.id = a."candidateId"
    WHERE a.id = lookup_application_id
      AND c."userId" = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      AND a."organizationId" = (SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  );
$$;
REVOKE ALL ON FUNCTION public.is_outcome_application_candidate_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_outcome_application_candidate_owner(uuid) TO oos_app_runtime, authenticated;

DO $$ BEGIN
  CREATE POLICY "application_outcome_events_select"
  ON "public"."application_outcome_events"
  FOR SELECT
  USING (
    public.is_application_org_privileged_member("applicationId")
    OR (
      public.is_outcome_application_candidate_owner("applicationId")
      AND (
        "candidateVisible" = true
        OR "provenance" = 'CANDIDATE_REPORTED'
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "application_outcome_events_insert"
  ON "public"."application_outcome_events"
  FOR INSERT
  WITH CHECK (
    public.is_application_org_privileged_member("applicationId")
    OR (
      public.is_outcome_application_candidate_owner("applicationId")
      AND "provenance" = 'CANDIDATE_REPORTED'
      AND "actorUserId" = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    )
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "application_outcome_events_update"
  ON "public"."application_outcome_events"
  FOR UPDATE
  USING (public.is_application_org_privileged_member("applicationId"))
  WITH CHECK (public.is_application_org_privileged_member("applicationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
