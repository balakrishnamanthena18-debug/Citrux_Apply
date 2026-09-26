-- ==============================================================================
-- Migration: 20260924010000_phase2_candidate_core
-- Description: Establishes Phase 2 Candidate Core Domain, Tables, RLS, and Security Definer Functions
-- ==============================================================================

-- 1. Create Enums
CREATE TYPE "public"."CandidateStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "public"."VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');
CREATE TYPE "public"."WorkAuthorizationStatus" AS ENUM ('CITIZEN', 'PERMANENT_RESIDENT', 'WORK_VISA', 'STUDENT_VISA', 'REQUIRES_SPONSORSHIP', 'OTHER');
CREATE TYPE "public"."RemotePreference" AS ENUM ('REMOTE_ONLY', 'HYBRID', 'ONSITE', 'FLEXIBLE');
CREATE TYPE "public"."DocumentType" AS ENUM ('RESUME', 'COVER_LETTER', 'TRANSCRIPT', 'CERTIFICATE', 'OTHER');

-- Alter AuditAction Enum to include Phase 2 actions
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_CREATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_PROFILE_UPDATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_EXPERIENCE_UPDATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_EDUCATION_UPDATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_SKILLS_UPDATED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_DOCUMENT_UPLOADED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_DOCUMENT_DELETED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_ASSIGNED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_VERIFIED';
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_STATUS_CHANGED';

-- 2. Create Candidate Tables
CREATE TABLE "public"."candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "assignedEmployeeId" UUID,
  "status" "public"."CandidateStatus" NOT NULL DEFAULT 'ONBOARDING',
  "verificationStatus" "public"."VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "phone" VARCHAR(50),
  "city" VARCHAR(100),
  "state" VARCHAR(100),
  "country" VARCHAR(100) NOT NULL DEFAULT 'US',
  "postalCode" VARCHAR(20),
  "timezone" VARCHAR(50),
  "linkedinUrl" VARCHAR(500),
  "githubUrl" VARCHAR(500),
  "portfolioUrl" VARCHAR(500),
  "headline" VARCHAR(255),
  "professionalSummary" TEXT,
  "totalYearsExperience" DECIMAL(4,1),
  "workAuthorization" "public"."WorkAuthorizationStatus" NOT NULL DEFAULT 'CITIZEN',
  "requiresSponsorship" BOOLEAN NOT NULL DEFAULT false,
  "visaDetails" VARCHAR(255),
  "targetRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetLocations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "remotePreference" "public"."RemotePreference" NOT NULL DEFAULT 'FLEXIBLE',
  "desiredSalaryMin" INTEGER,
  "desiredSalaryMax" INTEGER,
  "salaryCurrency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "verifiedAt" TIMESTAMPTZ(6),
  "verifiedBy" UUID,
  "verificationNotes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidates_userId_key" UNIQUE ("userId"),
  CONSTRAINT "candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidates_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "candidates_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "public"."candidate_experiences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL,
  "companyName" VARCHAR(200) NOT NULL,
  "jobTitle" VARCHAR(200) NOT NULL,
  "location" VARCHAR(100),
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "description" TEXT,
  "achievements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "technologies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_experiences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_experiences_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "public"."candidate_educations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL,
  "institution" VARCHAR(255) NOT NULL,
  "degree" VARCHAR(200) NOT NULL,
  "fieldOfStudy" VARCHAR(200),
  "startDate" DATE,
  "endDate" DATE,
  "graduationYear" INTEGER,
  "gpa" VARCHAR(20),
  "honors" VARCHAR(255),
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_educations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_educations_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "public"."candidate_skills" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_skills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_skill_unique" UNIQUE ("candidateId", "name"),
  CONSTRAINT "candidate_skills_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "public"."candidate_projects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "role" VARCHAR(100),
  "url" VARCHAR(500),
  "description" TEXT,
  "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "technologies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startDate" DATE,
  "endDate" DATE,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_projects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_projects_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "public"."candidate_certifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "issuingAuthority" VARCHAR(200) NOT NULL,
  "credentialId" VARCHAR(200),
  "credentialUrl" VARCHAR(500),
  "issueDate" DATE,
  "expirationDate" DATE,
  "doesNotExpire" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_certifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_certifications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "public"."candidate_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateId" UUID NOT NULL,
  "documentType" "public"."DocumentType" NOT NULL DEFAULT 'RESUME',
  "title" VARCHAR(255) NOT NULL,
  "storagePath" VARCHAR(1024) NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "uploadedBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_documents_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidate_documents_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 3. Create Indexes
CREATE INDEX "candidates_organizationId_status_idx" ON "public"."candidates"("organizationId", "status");
CREATE INDEX "candidates_assignedEmployeeId_status_idx" ON "public"."candidates"("assignedEmployeeId", "status");
CREATE INDEX "candidates_verificationStatus_idx" ON "public"."candidates"("verificationStatus");

CREATE INDEX "candidate_experiences_candidateId_orderIndex_idx" ON "public"."candidate_experiences"("candidateId", "orderIndex");
CREATE INDEX "candidate_educations_candidateId_orderIndex_idx" ON "public"."candidate_educations"("candidateId", "orderIndex");
CREATE INDEX "candidate_skills_candidateId_idx" ON "public"."candidate_skills"("candidateId");
CREATE INDEX "candidate_projects_candidateId_orderIndex_idx" ON "public"."candidate_projects"("candidateId", "orderIndex");
CREATE INDEX "candidate_certifications_candidateId_idx" ON "public"."candidate_certifications"("candidateId");
CREATE INDEX "candidate_documents_candidateId_documentType_isDefault_idx" ON "public"."candidate_documents"("candidateId", "documentType", "isDefault");

-- 4. Enable and Force Row Level Security
ALTER TABLE "public"."candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidates" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."candidate_experiences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_experiences" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."candidate_educations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_educations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."candidate_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_skills" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."candidate_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_projects" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."candidate_certifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_certifications" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."candidate_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_documents" FORCE ROW LEVEL SECURITY;

-- 5. Create Helper SECURITY DEFINER Functions
CREATE OR REPLACE FUNCTION public.candidate_belongs_to_user(lookup_candidate_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidates
    WHERE id = lookup_candidate_id
      AND "userId" = lookup_user_id
  );
$$;
REVOKE ALL ON FUNCTION public.candidate_belongs_to_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.candidate_belongs_to_user(uuid, uuid) TO oos_app_runtime, authenticated;

CREATE OR REPLACE FUNCTION public.is_candidate_org_privileged_member(lookup_candidate_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidates c
    JOIN public.memberships m ON c."organizationId" = m."organizationId"
    WHERE c.id = lookup_candidate_id
      AND m."userId" = lookup_user_id
      AND m.status = 'ACTIVE'
      AND m.role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.is_candidate_org_privileged_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_candidate_org_privileged_member(uuid, uuid) TO oos_app_runtime, authenticated;

-- 6. Define Row Level Security Policies
-- 6.1 Candidates Policies
CREATE POLICY candidates_select ON "public"."candidates"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      "userId" = public.current_user_id() OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

CREATE POLICY candidates_insert ON "public"."candidates"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    "userId" = public.current_user_id()
  );

CREATE POLICY candidates_update ON "public"."candidates"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND (
      ("userId" = public.current_user_id() AND status IN ('ONBOARDING', 'ACTIVE')) OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

-- 6.2 Child Entity Policies (Experiences, Educations, Skills, Projects, Certifications)
-- Experiences
CREATE POLICY candidate_experiences_select ON "public"."candidate_experiences"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_experiences_mutation ON "public"."candidate_experiences"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

-- Educations
CREATE POLICY candidate_educations_select ON "public"."candidate_educations"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_educations_mutation ON "public"."candidate_educations"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

-- Skills
CREATE POLICY candidate_skills_select ON "public"."candidate_skills"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_skills_mutation ON "public"."candidate_skills"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

-- Projects
CREATE POLICY candidate_projects_select ON "public"."candidate_projects"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_projects_mutation ON "public"."candidate_projects"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

-- Certifications
CREATE POLICY candidate_certifications_select ON "public"."candidate_certifications"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_certifications_mutation ON "public"."candidate_certifications"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

-- Documents
CREATE POLICY candidate_documents_select ON "public"."candidate_documents"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_documents_mutation ON "public"."candidate_documents"
  FOR ALL USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

-- 7. Grant Privileges to Application Runtime Role (oos_app_runtime)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."candidates",
  "public"."candidate_experiences",
  "public"."candidate_educations",
  "public"."candidate_skills",
  "public"."candidate_projects",
  "public"."candidate_certifications",
  "public"."candidate_documents"
TO oos_app_runtime;
