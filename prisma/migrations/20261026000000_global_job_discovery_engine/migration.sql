-- Global Job Discovery & Collection Engine Migration
-- Adds discovered_jobs, job_collection_runs, job_provider_configs, and saved_jobs

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "JobVerificationStatus" AS ENUM (
    'NEWLY_DISCOVERED',
    'SOURCE_CONFIRMED',
    'NEEDS_VERIFICATION',
    'STALE',
    'CLOSED',
    'EXPIRED',
    'COLLECTION_FAILED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "JobWorkArrangement" AS ENUM (
    'REMOTE',
    'HYBRID',
    'ONSITE',
    'UNSPECIFIED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CollectionRunStatus" AS ENUM (
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'PARTIAL'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CollectionTriggerType" AS ENUM (
    'MANUAL',
    'SCHEDULED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Audit Actions
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_DISCOVERY_COLLECTION_TRIGGERED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_DISCOVERY_COLLECTION_COMPLETED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_DISCOVERY_PROVIDER_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'JOB_DISCOVERED_PROMOTED_TO_CATALOG';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Tables
CREATE TABLE IF NOT EXISTS "public"."discovered_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "providerId" VARCHAR(64) NOT NULL,
  "externalId" VARCHAR(255) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "normalizedTitle" VARCHAR(255) NOT NULL,
  "companyName" VARCHAR(255) NOT NULL,
  "normalizedCompany" VARCHAR(255) NOT NULL,
  "jobDescription" TEXT NOT NULL,
  "requiredSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferredSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "industry" VARCHAR(64),
  "employmentType" "JobEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "seniorityLevel" VARCHAR(32),
  "experienceMin" INTEGER,
  "experienceMax" INTEGER,
  "salaryMin" INTEGER,
  "salaryMax" INTEGER,
  "salaryCurrency" VARCHAR(10) DEFAULT 'USD',
  "salaryPeriod" VARCHAR(20) DEFAULT 'YEARLY',
  "country" VARCHAR(10),
  "state" VARCHAR(100),
  "city" VARCHAR(100),
  "workArrangement" "JobWorkArrangement" NOT NULL DEFAULT 'UNSPECIFIED',
  "postedAt" TIMESTAMPTZ(6),
  "closingDate" TIMESTAMPTZ(6),
  "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstCollectedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "externalUrl" VARCHAR(2048) NOT NULL,
  "canonicalUrl" VARCHAR(2048) NOT NULL,
  "sourceAttribution" VARCHAR(255) NOT NULL,
  "verificationStatus" "JobVerificationStatus" NOT NULL DEFAULT 'NEWLY_DISCOVERED',
  "availabilityStatus" "JobStatus" NOT NULL DEFAULT 'OPEN',
  "contentFingerprint" VARCHAR(64) NOT NULL,
  "duplicateGroupId" VARCHAR(64),
  "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
  "duplicateReason" VARCHAR(255),
  "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
  "rawMetadata" JSONB,
  "promotedToJobId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "discovered_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discovered_jobs_promotedToJobId_fkey" FOREIGN KEY ("promotedToJobId") REFERENCES "public"."jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."job_collection_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "providerId" VARCHAR(64) NOT NULL,
  "status" "CollectionRunStatus" NOT NULL DEFAULT 'RUNNING',
  "triggerType" "CollectionTriggerType" NOT NULL DEFAULT 'MANUAL',
  "triggeredById" UUID,
  "queryFilters" JSONB,
  "jobsDiscovered" INTEGER NOT NULL DEFAULT 0,
  "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
  "duplicatesDetected" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  "metadata" JSONB,

  CONSTRAINT "job_collection_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "job_collection_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."job_provider_configs" (
  "providerId" VARCHAR(64) NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "category" VARCHAR(64) NOT NULL,
  "baseUrl" VARCHAR(512) NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isConfigured" BOOLEAN NOT NULL DEFAULT true,
  "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
  "rateLimitDaily" INTEGER NOT NULL DEFAULT 5000,
  "lastRunAt" TIMESTAMPTZ(6),
  "lastSuccessAt" TIMESTAMPTZ(6),
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "statusMessage" VARCHAR(512),
  "documentation" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "job_provider_configs_pkey" PRIMARY KEY ("providerId")
);

CREATE TABLE IF NOT EXISTS "public"."saved_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "discoveredJobId" UUID NOT NULL,
  "notes" TEXT,
  "savedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "saved_jobs_discoveredJobId_fkey" FOREIGN KEY ("discoveredJobId") REFERENCES "public"."discovered_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 4. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "discovered_jobs_providerId_externalId_key" ON "public"."discovered_jobs"("providerId", "externalId");
CREATE INDEX IF NOT EXISTS "discovered_jobs_canonicalUrl_idx" ON "public"."discovered_jobs"("canonicalUrl");
CREATE INDEX IF NOT EXISTS "discovered_jobs_contentFingerprint_idx" ON "public"."discovered_jobs"("contentFingerprint");
CREATE INDEX IF NOT EXISTS "discovered_jobs_verificationStatus_availabilityStatus_idx" ON "public"."discovered_jobs"("verificationStatus", "availabilityStatus");
CREATE INDEX IF NOT EXISTS "discovered_jobs_country_workArrangement_idx" ON "public"."discovered_jobs"("country", "workArrangement");
CREATE INDEX IF NOT EXISTS "discovered_jobs_industry_seniorityLevel_idx" ON "public"."discovered_jobs"("industry", "seniorityLevel");
CREATE INDEX IF NOT EXISTS "discovered_jobs_postedAt_idx" ON "public"."discovered_jobs"("postedAt");
CREATE INDEX IF NOT EXISTS "discovered_jobs_promotedToJobId_idx" ON "public"."discovered_jobs"("promotedToJobId");

CREATE INDEX IF NOT EXISTS "job_collection_runs_providerId_startedAt_idx" ON "public"."job_collection_runs"("providerId", "startedAt");
CREATE INDEX IF NOT EXISTS "job_collection_runs_status_idx" ON "public"."job_collection_runs"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "saved_jobs_userId_discoveredJobId_key" ON "public"."saved_jobs"("userId", "discoveredJobId");
CREATE INDEX IF NOT EXISTS "saved_jobs_userId_idx" ON "public"."saved_jobs"("userId");
CREATE INDEX IF NOT EXISTS "saved_jobs_discoveredJobId_idx" ON "public"."saved_jobs"("discoveredJobId");

-- 5. RLS Setup
ALTER TABLE "public"."discovered_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."job_collection_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."job_provider_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."saved_jobs" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "discovered_jobs_staff_read" ON "public"."discovered_jobs"
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "discovered_jobs_staff_write" ON "public"."discovered_jobs"
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "job_collection_runs_all" ON "public"."job_collection_runs"
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "job_provider_configs_all" ON "public"."job_provider_configs"
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "saved_jobs_user_all" ON "public"."saved_jobs"
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 6. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
  "discovered_jobs", 
  "job_collection_runs", 
  "job_provider_configs", 
  "saved_jobs" 
TO oos_app_runtime;
