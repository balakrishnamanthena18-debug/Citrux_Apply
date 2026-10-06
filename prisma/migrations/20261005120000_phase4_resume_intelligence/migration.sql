-- Phase 4 ATS & Resume Intelligence (additive only)
-- CandidateDocument.id remains the immutable resume version identity.

-- Audit vocabulary (additive enum values)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESUME_EXTRACT_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESUME_EXTRACT_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESUME_EXTRACT_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESUME_REVIEW_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESUME_REVIEW_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESUME_REVIEW_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESUME_REVIEW_MARKED_STALE';

CREATE TYPE "ResumeParseStatus" AS ENUM ('SUCCESS', 'EMPTY', 'FAILED', 'UNSUPPORTED');
CREATE TYPE "ResumeReviewStatus" AS ENUM ('QUEUED', 'ANALYZING', 'READY', 'STALE', 'FAILED');

CREATE TABLE "public"."candidate_document_extracts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "candidateDocumentId" UUID NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "extractedText" TEXT NOT NULL,
  "parseStatus" "ResumeParseStatus" NOT NULL,
  "parserVersion" VARCHAR(64) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "pageCount" INTEGER,
  "charCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" VARCHAR(64),
  "parsedAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "candidate_document_extracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "candidate_document_extracts_organizationId_candidateDocumentId_contentHash_key"
  ON "public"."candidate_document_extracts"("organizationId", "candidateDocumentId", "contentHash");
CREATE INDEX "candidate_document_extracts_candidateDocumentId_idx"
  ON "public"."candidate_document_extracts"("candidateDocumentId");
CREATE INDEX "candidate_document_extracts_organizationId_candidateId_idx"
  ON "public"."candidate_document_extracts"("organizationId", "candidateId");

ALTER TABLE "public"."candidate_document_extracts"
  ADD CONSTRAINT "candidate_document_extracts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."candidate_document_extracts"
  ADD CONSTRAINT "candidate_document_extracts_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."candidate_document_extracts"
  ADD CONSTRAINT "candidate_document_extracts_candidateDocumentId_fkey"
  FOREIGN KEY ("candidateDocumentId") REFERENCES "public"."candidate_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."resume_reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "applicationId" UUID,
  "candidateDocumentId" UUID NOT NULL,
  "documentVersion" INTEGER NOT NULL,
  "extractId" UUID,
  "status" "ResumeReviewStatus" NOT NULL DEFAULT 'QUEUED',
  "freshness" "IntelligenceResultFreshness" NOT NULL DEFAULT 'CURRENT',
  "analysisVersion" VARCHAR(64) NOT NULL,
  "sourceDataVersion" VARCHAR(256) NOT NULL,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "leaseExpiresAt" TIMESTAMPTZ(6),
  "atsReadability" JSONB NOT NULL DEFAULT '{}',
  "representation" JSONB NOT NULL DEFAULT '{}',
  "strengths" JSONB NOT NULL DEFAULT '[]',
  "recommendations" JSONB NOT NULL DEFAULT '[]',
  "overallLabel" VARCHAR(64),
  "overallSummary" TEXT,
  "errorCode" VARCHAR(64),
  "errorMessage" TEXT,
  "requestedById" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "startedAt" TIMESTAMPTZ(6),
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "resume_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resume_reviews_idempotencyKey_key" ON "public"."resume_reviews"("idempotencyKey");
CREATE INDEX "resume_reviews_organizationId_applicationId_createdAt_idx"
  ON "public"."resume_reviews"("organizationId", "applicationId", "createdAt");
CREATE INDEX "resume_reviews_candidateId_createdAt_idx"
  ON "public"."resume_reviews"("candidateId", "createdAt");
CREATE INDEX "resume_reviews_status_leaseExpiresAt_idx"
  ON "public"."resume_reviews"("status", "leaseExpiresAt");
CREATE INDEX "resume_reviews_applicationId_freshness_status_idx"
  ON "public"."resume_reviews"("applicationId", "freshness", "status");
CREATE INDEX "resume_reviews_candidateDocumentId_createdAt_idx"
  ON "public"."resume_reviews"("candidateDocumentId", "createdAt");

ALTER TABLE "public"."resume_reviews"
  ADD CONSTRAINT "resume_reviews_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."resume_reviews"
  ADD CONSTRAINT "resume_reviews_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."resume_reviews"
  ADD CONSTRAINT "resume_reviews_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."resume_reviews"
  ADD CONSTRAINT "resume_reviews_candidateDocumentId_fkey"
  FOREIGN KEY ("candidateDocumentId") REFERENCES "public"."candidate_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."resume_reviews"
  ADD CONSTRAINT "resume_reviews_extractId_fkey"
  FOREIGN KEY ("extractId") REFERENCES "public"."candidate_document_extracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."resume_reviews"
  ADD CONSTRAINT "resume_reviews_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (FORCE) — mirror candidate document ownership patterns
ALTER TABLE "public"."candidate_document_extracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."candidate_document_extracts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."resume_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."resume_reviews" FORCE ROW LEVEL SECURITY;

CREATE POLICY candidate_document_extracts_select ON "public"."candidate_document_extracts"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_document_extracts_insert ON "public"."candidate_document_extracts"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_document_extracts_update ON "public"."candidate_document_extracts"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY candidate_document_extracts_delete ON "public"."candidate_document_extracts"
  FOR DELETE USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY resume_reviews_select ON "public"."resume_reviews"
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY resume_reviews_insert ON "public"."resume_reviews"
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY resume_reviews_update ON "public"."resume_reviews"
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND (
      public.candidate_belongs_to_user("candidateId", public.current_user_id()) OR
      public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
    )
  );

CREATE POLICY resume_reviews_delete ON "public"."resume_reviews"
  FOR DELETE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_candidate_org_privileged_member("candidateId", public.current_user_id())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."candidate_document_extracts" TO oos_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."resume_reviews" TO oos_app_runtime;
