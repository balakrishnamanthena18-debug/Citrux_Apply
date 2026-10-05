-- Phase 2 Gate 4 — AI execution pipeline run fields + RETRY_PENDING

ALTER TYPE "IntelligenceRunStatus" ADD VALUE IF NOT EXISTS 'RETRY_PENDING';

ALTER TABLE "public"."application_intelligence_runs"
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "validatedPayload" JSONB,
  ADD COLUMN IF NOT EXISTS "providerRequestId" VARCHAR(128);

CREATE INDEX IF NOT EXISTS "application_intelligence_runs_status_leaseExpiresAt_idx"
  ON "public"."application_intelligence_runs"("status", "leaseExpiresAt");
