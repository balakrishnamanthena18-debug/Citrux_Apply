-- AlterEnum: Add Phase 5 Audit Actions
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_SUBMITTED_FOR_QA';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_QA_PASSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_QA_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_APPROVED_BY_CANDIDATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_REVISION_REQUESTED_BY_CANDIDATE';

-- CreateEnum: QaDecision
DO $$ BEGIN
  CREATE TYPE "QaDecision" AS ENUM ('PASS', 'FAIL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: QaCriterionKey
DO $$ BEGIN
  CREATE TYPE "QaCriterionKey" AS ENUM (
    'CANDIDATE_JOB_ALIGNMENT',
    'RESUME_ACCURACY',
    'JOB_REQUIREMENTS_MATCH',
    'SALARY_ALIGNMENT',
    'LOCATION_AUTHORIZATION',
    'WORK_AUTHORIZATION',
    'SCREENING_ANSWERS',
    'APPLICATION_COMPLETENESS',
    'CANDIDATE_CONSENT_ACTIVE'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: application_qa_reviews
CREATE TABLE IF NOT EXISTS "application_qa_reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "reviewerId" UUID NOT NULL,
  "decision" "QaDecision" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "application_qa_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_qa_reviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_qa_reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_qa_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: application_qa_checklists
CREATE TABLE IF NOT EXISTS "application_qa_checklists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "qaReviewId" UUID NOT NULL,
  "criterionKey" "QaCriterionKey" NOT NULL,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "application_qa_checklists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_qa_checklists_qaReviewId_fkey" FOREIGN KEY ("qaReviewId") REFERENCES "application_qa_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "application_qa_reviews_organizationId_applicationId_idx" ON "application_qa_reviews"("organizationId", "applicationId");
CREATE INDEX IF NOT EXISTS "application_qa_reviews_applicationId_createdAt_idx" ON "application_qa_reviews"("applicationId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "application_qa_checklists_qaReviewId_criterionKey_key" ON "application_qa_checklists"("qaReviewId", "criterionKey");
CREATE INDEX IF NOT EXISTS "application_qa_checklists_qaReviewId_idx" ON "application_qa_checklists"("qaReviewId");

-- Enable RLS and FORCE RLS on QA tables
ALTER TABLE "application_qa_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_qa_reviews" FORCE ROW LEVEL SECURITY;

ALTER TABLE "application_qa_checklists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_qa_checklists" FORCE ROW LEVEL SECURITY;

-- Grants for app runtime
GRANT SELECT, INSERT, UPDATE, DELETE ON "application_qa_reviews" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE, DELETE ON "application_qa_checklists" TO "oos_app_runtime";

-- Helper function for QA Review RLS
CREATE OR REPLACE FUNCTION public.is_qa_review_org_privileged_member(target_qa_review_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.application_qa_reviews qr
    JOIN public.memberships om ON om."organizationId" = qr."organizationId"
    WHERE qr.id = target_qa_review_id
      AND om."organizationId" = (SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
      AND om."userId" = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      AND om.status = 'ACTIVE'
      AND om.role IN ('EMPLOYEE', 'ADMIN')
  );
$$;

-- Policies for application_qa_reviews (Staff-Only, Org-Scoped)
CREATE POLICY "application_qa_reviews_staff_select"
ON "public"."application_qa_reviews"
FOR SELECT
USING (
  public.is_org_privileged_member("organizationId")
);

CREATE POLICY "application_qa_reviews_staff_insert"
ON "public"."application_qa_reviews"
FOR INSERT
WITH CHECK (
  public.is_org_privileged_member("organizationId")
);

-- Policies for application_qa_checklists (Staff-Only, Parent-Scoped)
CREATE POLICY "application_qa_checklists_staff_select"
ON "public"."application_qa_checklists"
FOR SELECT
USING (
  public.is_qa_review_org_privileged_member("qaReviewId")
);

CREATE POLICY "application_qa_checklists_staff_insert"
ON "public"."application_qa_checklists"
FOR INSERT
WITH CHECK (
  public.is_qa_review_org_privileged_member("qaReviewId")
);
