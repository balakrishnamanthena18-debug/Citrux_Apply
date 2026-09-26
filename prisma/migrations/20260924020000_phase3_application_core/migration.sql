-- Phase 3 — Application Core SQL Migration
-- Migration: 20260924020000_phase3_application_core

-- 1. Create Enums
CREATE TYPE "public"."ApplicationStatus" AS ENUM (
  'DISCOVERED',
  'QUALIFIED',
  'PREPARING',
  'REVIEW',
  'AWAITING_APPROVAL',
  'READY',
  'SUBMITTED',
  'SUBMISSION_ISSUE',
  'REVIEW_REQUIRED',
  'CORRECTION_APPROVED',
  'RESUBMISSION',
  'REJECTED',
  'WITHDRAWN',
  'FAILED'
);

CREATE TYPE "public"."JobStatus" AS ENUM (
  'OPEN',
  'CLOSED',
  'ARCHIVED'
);

CREATE TYPE "public"."JobEmploymentType" AS ENUM (
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'TEMPORARY'
);

CREATE TYPE "public"."ApplicationApprovalStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REVISION_REQUESTED'
);

-- Extend AuditAction Enum with Phase 3 Events
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'JOB_CREATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'JOB_UPDATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_CREATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_STATUS_CHANGED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_ASSIGNED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_MATERIAL_UPDATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_APPROVAL_REQUESTED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_APPROVED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_APPROVAL_REJECTED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_SUBMITTED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_SUBMISSION_ISSUE';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_CORRECTION_APPROVED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_RESUBMITTED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_WITHDRAWN';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_BULK_WITHDRAWN_CONSENT_REVOKED';

-- 2. Create Tables
CREATE TABLE "public"."jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "companyName" VARCHAR(255) NOT NULL,
  "jobDescription" TEXT NOT NULL,
  "location" VARCHAR(255),
  "isRemote" BOOLEAN NOT NULL DEFAULT false,
  "employmentType" "public"."JobEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "salaryMin" INTEGER,
  "salaryMax" INTEGER,
  "salaryCurrency" VARCHAR(10) DEFAULT 'USD',
  "source" VARCHAR(100),
  "externalUrl" VARCHAR(1024),
  "qualificationNotes" TEXT,
  "status" "public"."JobStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "public"."applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "status" "public"."ApplicationStatus" NOT NULL DEFAULT 'DISCOVERED',
  "assignedEmployeeId" UUID,
  "approvalStatus" "public"."ApplicationApprovalStatus",
  "approvalRequestedAt" TIMESTAMPTZ(6),
  "approvedAt" TIMESTAMPTZ(6),
  "approvedBy" UUID,
  "approvalNotes" TEXT,
  "rejectionReason" TEXT,
  "failureReason" TEXT,
  "withdrawalReason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applications_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "applications_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "public"."application_materials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL,
  "candidateDocumentId" UUID,
  "documentVersion" INTEGER,
  "coverLetterText" TEXT,
  "screeningAnswers" JSONB,
  "customNotes" TEXT,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_materials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_materials_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_materials_candidateDocumentId_fkey" FOREIGN KEY ("candidateDocumentId") REFERENCES "public"."candidate_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "application_materials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "public"."application_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedById" UUID NOT NULL,
  "externalReference" VARCHAR(255),
  "externalUrl" VARCHAR(1024),
  "confirmationEvidence" TEXT,
  "submissionNotes" TEXT,
  "issueDescription" TEXT,
  "correctionNotes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_submissions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_submissions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "public"."application_state_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL,
  "fromStatus" "public"."ApplicationStatus",
  "toStatus" "public"."ApplicationStatus" NOT NULL,
  "changedById" UUID NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_state_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_state_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_state_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 3. Create Indexes & Approved Reapplication Partial Unique Index
CREATE INDEX "jobs_organizationId_status_idx" ON "public"."jobs"("organizationId", "status");

CREATE INDEX "applications_organizationId_status_idx" ON "public"."applications"("organizationId", "status");
CREATE INDEX "applications_assignedEmployeeId_status_idx" ON "public"."applications"("assignedEmployeeId", "status");
CREATE INDEX "applications_candidateId_status_idx" ON "public"."applications"("candidateId", "status");

-- Approved Partial Unique Index: Allow reapplication after terminal state (REJECTED, WITHDRAWN, FAILED)
CREATE UNIQUE INDEX "applications_active_candidate_job_idx" 
ON "public"."applications"("candidateId", "jobId") 
WHERE "status" NOT IN ('REJECTED', 'WITHDRAWN', 'FAILED');

CREATE INDEX "application_materials_applicationId_isCurrent_idx" ON "public"."application_materials"("applicationId", "isCurrent");
CREATE INDEX "application_submissions_applicationId_attemptNumber_idx" ON "public"."application_submissions"("applicationId", "attemptNumber");
CREATE INDEX "application_state_history_applicationId_createdAt_idx" ON "public"."application_state_history"("applicationId", "createdAt");

-- 4. Enable and Force Row Level Security
ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."jobs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."applications" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."application_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_materials" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."application_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_submissions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."application_state_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."application_state_history" FORCE ROW LEVEL SECURITY;

-- 5. Helper SECURITY DEFINER Functions
CREATE OR REPLACE FUNCTION public.is_job_org_privileged_member(lookup_job_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    JOIN public.memberships m ON j."organizationId" = m."organizationId"
    WHERE j.id = lookup_job_id
      AND m."userId" = lookup_user_id
      AND m.status = 'ACTIVE'
      AND m.role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.is_job_org_privileged_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_job_org_privileged_member(uuid, uuid) TO oos_app_runtime, authenticated;

CREATE OR REPLACE FUNCTION public.is_application_org_privileged_member(lookup_application_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.memberships m ON a."organizationId" = m."organizationId"
    WHERE a.id = lookup_application_id
      AND m."userId" = lookup_user_id
      AND m.status = 'ACTIVE'
      AND m.role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.is_application_org_privileged_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_application_org_privileged_member(uuid, uuid) TO oos_app_runtime, authenticated;

CREATE OR REPLACE FUNCTION public.application_belongs_to_candidate_user(lookup_application_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.candidates c ON a."candidateId" = c.id
    WHERE a.id = lookup_application_id
      AND c."userId" = lookup_user_id
  );
$$;
REVOKE ALL ON FUNCTION public.application_belongs_to_candidate_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.application_belongs_to_candidate_user(uuid, uuid) TO oos_app_runtime, authenticated;

-- 6. Row Level Security Policies
-- 6.1 Jobs Policies
CREATE POLICY jobs_select ON "public"."jobs"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.is_org_privileged_member("organizationId", public.current_user_id()) OR
      status = 'OPEN'
    )
  );

CREATE POLICY jobs_insert ON "public"."jobs"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY jobs_update ON "public"."jobs"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

-- 6.2 Applications Policies
CREATE POLICY applications_select ON "public"."applications"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user(id, public.current_user_id()) OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

CREATE POLICY applications_insert ON "public"."applications"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_privileged_member("organizationId", public.current_user_id())
  );

CREATE POLICY applications_update ON "public"."applications"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user(id, public.current_user_id()) OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

CREATE POLICY applications_delete ON "public"."applications"
  FOR DELETE USING (
    false
  );

-- 6.3 Child Entities Policies
-- Application Materials
CREATE POLICY application_materials_select ON "public"."application_materials"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user("applicationId", public.current_user_id()) OR
      public.is_application_org_privileged_member("applicationId", public.current_user_id())
    )
  );

CREATE POLICY application_materials_mutation ON "public"."application_materials"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND
    public.is_application_org_privileged_member("applicationId", public.current_user_id())
  );

-- Application Submissions
CREATE POLICY application_submissions_select ON "public"."application_submissions"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user("applicationId", public.current_user_id()) OR
      public.is_application_org_privileged_member("applicationId", public.current_user_id())
    )
  );

CREATE POLICY application_submissions_mutation ON "public"."application_submissions"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND
    public.is_application_org_privileged_member("applicationId", public.current_user_id())
  );

-- Application State History
CREATE POLICY application_state_history_select ON "public"."application_state_history"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user("applicationId", public.current_user_id()) OR
      public.is_application_org_privileged_member("applicationId", public.current_user_id())
    )
  );

CREATE POLICY application_state_history_mutation ON "public"."application_state_history"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND (
      public.application_belongs_to_candidate_user("applicationId", public.current_user_id()) OR
      public.is_application_org_privileged_member("applicationId", public.current_user_id())
    )
  );

-- 7. Grant Privileges to Application Runtime Role (oos_app_runtime)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."jobs",
  "public"."applications",
  "public"."application_materials",
  "public"."application_submissions",
  "public"."application_state_history"
TO oos_app_runtime;
