-- Migration: Optional Candidate Approval & Managed Application Authorization
-- Enforces PostgreSQL Row Level Security (FORCE RLS) for non-superuser oos_app_runtime

-- 1. Create ApplicationAuthorizationMode Enum if it does not exist
DO $$ BEGIN
  CREATE TYPE "ApplicationAuthorizationMode" AS ENUM (
    'MANAGED',
    'REVIEW_REQUIRED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Extend AuditAction Enum
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_MANAGED_AUTHORIZATION_GRANTED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CANDIDATE_AUTHORIZATION_MODE_CHANGED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPLICATION_ADVANCED_TO_READY_MANAGED';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Add application_authorization_mode Column to candidates table
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "application_authorization_mode" "ApplicationAuthorizationMode" NOT NULL DEFAULT 'MANAGED';
