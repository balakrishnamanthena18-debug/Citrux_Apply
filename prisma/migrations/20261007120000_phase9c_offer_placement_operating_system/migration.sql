-- Phase 9C: Offer & Placement Operating System (OPOS) Data Model & Persistence Foundation
-- Establishes Offer, OfferVersion, Negotiation, NegotiationEvent, OfferDecision,
-- JoiningRecord, PlacementRecord, OfferEvidence tables, enums, RLS, and AuditActions.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "OfferStatus" AS ENUM (
    'OFFER_RECEIVED',
    'OFFER_UNDER_REVIEW',
    'NEGOTIATION',
    'DECISION_PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED',
    'WITHDRAWN',
    'REPLACED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OfferVerificationState" AS ENUM (
    'UNVERIFIED',
    'EVIDENCE_SUBMITTED',
    'VERIFIED',
    'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OfferProvenanceType" AS ENUM (
    'CANDIDATE_PROVIDED',
    'EMPLOYEE_RECORDED',
    'EMPLOYER_COMMUNICATED',
    'EVIDENCE_BACKED',
    'SYSTEM_DERIVED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompensationPaymentFrequency" AS ENUM (
    'ANNUAL',
    'MONTHLY',
    'HOURLY'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EquityType" AS ENUM (
    'STOCK_OPTIONS_ISO',
    'STOCK_OPTIONS_NSO',
    'RSU',
    'SAR',
    'PHANTOM_STOCK',
    'PROFIT_INTEREST',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EquityVestingFrequency" AS ENUM (
    'MONTHLY',
    'QUARTERLY',
    'ANNUAL'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "NegotiationStatus" AS ENUM (
    'NOT_REQUESTED',
    'STRATEGY_PENDING',
    'COUNTER_DISPATCHED',
    'AWAITING_EMPLOYER_RESPONSE',
    'CONCLUDED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "NegotiationEventType" AS ENUM (
    'CANDIDATE_TARGET_SET',
    'STRATEGY_NOTES_ADDED',
    'COUNTER_PROPOSAL_DISPATCHED',
    'EMPLOYER_COUNTER_RECEIVED',
    'EMPLOYER_ACCEPTED_TERMS',
    'EMPLOYER_REJECTED_TERMS',
    'NEGOTIATION_CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OfferDecisionType" AS ENUM (
    'ACCEPT',
    'DECLINE',
    'REQUEST_NEGOTIATION',
    'REQUEST_EXTENSION'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OfferDeclineReasonCategory" AS ENUM (
    'COMPENSATION_BELOW_TARGET',
    'ROLE_FIT_OR_GROWTH',
    'ACCEPTED_COMPETING_OFFER',
    'LOCATION_OR_COMMUTE',
    'CULTURE_OR_LEADERSHIP',
    'PERSONAL_OR_FAMILY',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "JoiningStatus" AS ENUM (
    'JOINING_PLANNED',
    'JOINING_CONFIRMED',
    'FAILED_TO_JOIN'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "JoiningFailureReason" AS ENUM (
    'RESCINDED_BY_EMPLOYER',
    'CANDIDATE_RENEGED',
    'FAILED_BACKGROUND_CHECK',
    'FAILED_TO_REPORT',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Audit Actions for OPOS
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_OFFER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_OFFER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_OFFER_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_OFFER_VERSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_DEADLINE_EXTENDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_NEGOTIATION_INITIATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_NEGOTIATION_EVENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_OFFER_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_OFFER_DECLINED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_JOINING_SCHEDULED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_JOINING_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_PLACEMENT_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_PLACEMENT_VOIDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OPOS_EVIDENCE_ATTACHED';

-- 3. Tables

-- 3.1 offers
CREATE TABLE IF NOT EXISTS "offers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "status" "OfferStatus" NOT NULL DEFAULT 'OFFER_RECEIVED',
  "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
  "verificationState" "OfferVerificationState" NOT NULL DEFAULT 'UNVERIFIED',
  "initialReceivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decisionDeadline" TIMESTAMPTZ(6),
  "decisionDeadlinetz" VARCHAR(100),
  "scheduledStartDate" TIMESTAMPTZ(6),
  "internalStaffNotes" TEXT,
  "candidateNotes" TEXT,
  "verifiedAt" TIMESTAMPTZ(6),
  "verifiedById" UUID,
  "voidedAt" TIMESTAMPTZ(6),
  "voidedById" UUID,
  "voidReason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "offers_organizationId_status_idx"
  ON "offers"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "offers_candidateId_status_idx"
  ON "offers"("candidateId", "status");

CREATE INDEX IF NOT EXISTS "offers_applicationId_idx"
  ON "offers"("applicationId");

CREATE INDEX IF NOT EXISTS "offers_jobId_idx"
  ON "offers"("jobId");

-- 3.2 offer_versions
CREATE TABLE IF NOT EXISTS "offer_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offerId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "provenance" "OfferProvenanceType" NOT NULL DEFAULT 'EMPLOYEE_RECORDED',
  "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decisionDeadline" TIMESTAMPTZ(6),
  "decisionDeadlinetz" VARCHAR(100),
  "proposedStartDate" TIMESTAMPTZ(6),
  "roleTitle" VARCHAR(255),
  "department" VARCHAR(255),
  "location" VARCHAR(500),
  "isRemote" BOOLEAN NOT NULL DEFAULT false,
  "employmentType" "JobEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "baseSalaryAmount" INTEGER,
  "baseSalaryCurrency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "paymentFrequency" "CompensationPaymentFrequency" NOT NULL DEFAULT 'ANNUAL',
  "targetVariableAmount" INTEGER,
  "targetVariablePercentage" DECIMAL(5, 2),
  "variableCriteria" TEXT,
  "signOnBonusAmount" INTEGER,
  "signOnTerms" TEXT,
  "retentionBonusAmount" INTEGER,
  "relocationAmount" INTEGER,
  "benefitsSummary" TEXT,
  "equityType" "EquityType",
  "grantQuantity" INTEGER,
  "estimatedGrantValue" DECIMAL(12, 2),
  "vestingPeriodMonths" INTEGER,
  "cliffPeriodMonths" INTEGER,
  "cliffPercentage" DECIMAL(5, 2),
  "vestingFrequency" "EquityVestingFrequency",
  "strikePrice" DECIMAL(10, 4),
  "fairMarketValueAtGrant" DECIMAL(10, 4),
  "supersededAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offer_versions_offerId_versionNumber_key" UNIQUE ("offerId", "versionNumber")
);

ALTER TABLE "offer_versions"
  ADD CONSTRAINT "offer_versions_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offer_versions"
  ADD CONSTRAINT "offer_versions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "offer_versions_organizationId_idx"
  ON "offer_versions"("organizationId");

CREATE INDEX IF NOT EXISTS "offer_versions_offerId_versionNumber_idx"
  ON "offer_versions"("offerId", "versionNumber");

-- 3.3 negotiations
CREATE TABLE IF NOT EXISTS "negotiations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offerId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "status" "NegotiationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "activeRoundNumber" INTEGER NOT NULL DEFAULT 1,
  "candidateTargetBase" INTEGER,
  "candidateTargetVariable" INTEGER,
  "candidateTargetEquity" INTEGER,
  "candidateTargetSignOn" INTEGER,
  "candidateTargetNotes" TEXT,
  "strategyTalkingPoints" TEXT,
  "concludedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "negotiations_offerId_key" UNIQUE ("offerId")
);

ALTER TABLE "negotiations"
  ADD CONSTRAINT "negotiations_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "negotiations"
  ADD CONSTRAINT "negotiations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "negotiations_organizationId_status_idx"
  ON "negotiations"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "negotiations_offerId_idx"
  ON "negotiations"("offerId");

-- 3.4 negotiation_events
CREATE TABLE IF NOT EXISTS "negotiation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "negotiationId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "offerVersionId" UUID,
  "roundNumber" INTEGER NOT NULL DEFAULT 1,
  "eventType" "NegotiationEventType" NOT NULL,
  "actorUserId" UUID NOT NULL,
  "actorRole" "Role" NOT NULL,
  "provenance" "OfferProvenanceType" NOT NULL DEFAULT 'EMPLOYEE_RECORDED',
  "eventDetails" JSONB NOT NULL DEFAULT '{}',
  "internalStaffNotes" TEXT,
  "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "negotiation_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "negotiation_events"
  ADD CONSTRAINT "negotiation_events_negotiationId_fkey"
  FOREIGN KEY ("negotiationId") REFERENCES "negotiations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "negotiation_events"
  ADD CONSTRAINT "negotiation_events_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "negotiation_events"
  ADD CONSTRAINT "negotiation_events_offerVersionId_fkey"
  FOREIGN KEY ("offerVersionId") REFERENCES "offer_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "negotiation_events"
  ADD CONSTRAINT "negotiation_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "negotiation_events_organizationId_idx"
  ON "negotiation_events"("organizationId");

CREATE INDEX IF NOT EXISTS "negotiation_events_negotiationId_recordedAt_idx"
  ON "negotiation_events"("negotiationId", "recordedAt");

-- 3.5 offer_decisions
CREATE TABLE IF NOT EXISTS "offer_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offerId" UUID NOT NULL,
  "offerVersionId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "decisionType" "OfferDecisionType" NOT NULL,
  "provenance" "OfferProvenanceType" NOT NULL DEFAULT 'CANDIDATE_PROVIDED',
  "executedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "structuredReason" "OfferDeclineReasonCategory",
  "privateCandidateFeedback" TEXT,
  "recordedOnBehalf" BOOLEAN NOT NULL DEFAULT false,
  "recordedOnBehalfReason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_decisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "offer_decisions"
  ADD CONSTRAINT "offer_decisions_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offer_decisions"
  ADD CONSTRAINT "offer_decisions_offerVersionId_fkey"
  FOREIGN KEY ("offerVersionId") REFERENCES "offer_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "offer_decisions"
  ADD CONSTRAINT "offer_decisions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "offer_decisions"
  ADD CONSTRAINT "offer_decisions_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offer_decisions"
  ADD CONSTRAINT "offer_decisions_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "offer_decisions_organizationId_idx"
  ON "offer_decisions"("organizationId");

CREATE INDEX IF NOT EXISTS "offer_decisions_offerId_executedAt_idx"
  ON "offer_decisions"("offerId", "executedAt");

CREATE INDEX IF NOT EXISTS "offer_decisions_candidateId_idx"
  ON "offer_decisions"("candidateId");

-- 3.6 joining_records
CREATE TABLE IF NOT EXISTS "joining_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offerId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "status" "JoiningStatus" NOT NULL DEFAULT 'JOINING_PLANNED',
  "scheduledStartDate" TIMESTAMPTZ(6) NOT NULL,
  "scheduledStartDatetz" VARCHAR(100),
  "actualStartDate" TIMESTAMPTZ(6),
  "location" VARCHAR(500),
  "reportingInstructions" TEXT,
  "hardwareDeliveryStatus" VARCHAR(100),
  "backgroundCheckStatus" VARCHAR(100),
  "firstDayConfirmedByCandidate" BOOLEAN NOT NULL DEFAULT false,
  "firstDayConfirmedAt" TIMESTAMPTZ(6),
  "failureReason" "JoiningFailureReason",
  "failureNotes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "joining_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "joining_records_offerId_key" UNIQUE ("offerId")
);

ALTER TABLE "joining_records"
  ADD CONSTRAINT "joining_records_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "joining_records"
  ADD CONSTRAINT "joining_records_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "joining_records"
  ADD CONSTRAINT "joining_records_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "joining_records"
  ADD CONSTRAINT "joining_records_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "joining_records_organizationId_status_idx"
  ON "joining_records"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "joining_records_scheduledStartDate_idx"
  ON "joining_records"("scheduledStartDate");

CREATE INDEX IF NOT EXISTS "joining_records_candidateId_idx"
  ON "joining_records"("candidateId");

-- 3.7 placement_records
CREATE TABLE IF NOT EXISTS "placement_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offerId" UUID NOT NULL,
  "joiningId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "verifiedStartDate" TIMESTAMPTZ(6) NOT NULL,
  "verifiedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedById" UUID NOT NULL,
  "firstDayConfirmed" BOOLEAN NOT NULL DEFAULT true,
  "onboardingProofValidated" BOOLEAN NOT NULL DEFAULT true,
  "verificationNotes" TEXT,
  "proofDocumentId" UUID,
  "proofStoragePath" VARCHAR(1024),
  "day30HealthCheckCompleted" BOOLEAN NOT NULL DEFAULT false,
  "day30HealthCheckAt" TIMESTAMPTZ(6),
  "day90RetentionMilestoneCompleted" BOOLEAN NOT NULL DEFAULT false,
  "day90RetentionMilestoneAt" TIMESTAMPTZ(6),
  "voidedAt" TIMESTAMPTZ(6),
  "voidedById" UUID,
  "voidReason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "placement_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "placement_records_offerId_key" UNIQUE ("offerId"),
  CONSTRAINT "placement_records_joiningId_key" UNIQUE ("joiningId")
);

ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_joiningId_fkey"
  FOREIGN KEY ("joiningId") REFERENCES "joining_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "placement_records"
  ADD CONSTRAINT "placement_records_proofDocumentId_fkey"
  FOREIGN KEY ("proofDocumentId") REFERENCES "candidate_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "placement_records_organizationId_idx"
  ON "placement_records"("organizationId");

CREATE INDEX IF NOT EXISTS "placement_records_candidateId_idx"
  ON "placement_records"("candidateId");

CREATE INDEX IF NOT EXISTS "placement_records_applicationId_idx"
  ON "placement_records"("applicationId");

CREATE INDEX IF NOT EXISTS "placement_records_verifiedStartDate_idx"
  ON "placement_records"("verifiedStartDate");

-- 3.8 offer_evidence
CREATE TABLE IF NOT EXISTS "offer_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "offerId" UUID NOT NULL,
  "offerVersionId" UUID,
  "organizationId" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "candidateDocumentId" UUID,
  "documentType" VARCHAR(50) NOT NULL,
  "storagePath" VARCHAR(1024) NOT NULL,
  "fileSizeBytes" INTEGER,
  "mimeType" VARCHAR(100),
  "provenance" "OfferProvenanceType" NOT NULL DEFAULT 'EVIDENCE_BACKED',
  "uploadedById" UUID NOT NULL,
  "uploadedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_evidence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "offer_evidence"
  ADD CONSTRAINT "offer_evidence_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offer_evidence"
  ADD CONSTRAINT "offer_evidence_offerVersionId_fkey"
  FOREIGN KEY ("offerVersionId") REFERENCES "offer_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "offer_evidence"
  ADD CONSTRAINT "offer_evidence_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "offer_evidence"
  ADD CONSTRAINT "offer_evidence_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offer_evidence"
  ADD CONSTRAINT "offer_evidence_candidateDocumentId_fkey"
  FOREIGN KEY ("candidateDocumentId") REFERENCES "candidate_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "offer_evidence"
  ADD CONSTRAINT "offer_evidence_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "offer_evidence_organizationId_idx"
  ON "offer_evidence"("organizationId");

CREATE INDEX IF NOT EXISTS "offer_evidence_offerId_idx"
  ON "offer_evidence"("offerId");

CREATE INDEX IF NOT EXISTS "offer_evidence_candidateId_idx"
  ON "offer_evidence"("candidateId");

-- 4. RLS & Security Policies

ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offers" FORCE ROW LEVEL SECURITY;

ALTER TABLE "offer_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offer_versions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "negotiations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "negotiations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "negotiation_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "negotiation_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "offer_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offer_decisions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "joining_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "joining_records" FORCE ROW LEVEL SECURITY;

ALTER TABLE "placement_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "placement_records" FORCE ROW LEVEL SECURITY;

ALTER TABLE "offer_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offer_evidence" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON "offers" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "offer_versions" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "negotiations" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "negotiation_events" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "offer_decisions" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "joining_records" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "placement_records" TO "oos_app_runtime";
GRANT SELECT, INSERT, UPDATE ON "offer_evidence" TO "oos_app_runtime";
-- Helper check for organization membership using session variables or JWT claim
CREATE OR REPLACE FUNCTION public.is_org_member(lookup_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m."organizationId" = lookup_org_id
      AND m."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
      AND m.status = 'ACTIVE'
      AND m.role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO oos_app_runtime, authenticated;

-- Helper check for candidate ownership of an offer
CREATE OR REPLACE FUNCTION public.is_offer_candidate_owner(lookup_candidate_id uuid)
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
      AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
  );
$$;
REVOKE ALL ON FUNCTION public.is_offer_candidate_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_offer_candidate_owner(uuid) TO oos_app_runtime, authenticated;

-- Helper check for candidate ownership of an offer version
CREATE OR REPLACE FUNCTION public.is_offer_version_candidate_owner(lookup_offer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.offers o
    JOIN public.candidates c ON c.id = o."candidateId"
    WHERE o.id = lookup_offer_id
      AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
  );
$$;
REVOKE ALL ON FUNCTION public.is_offer_version_candidate_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_offer_version_candidate_owner(uuid) TO oos_app_runtime, authenticated;

-- Helper check for candidate ownership of a negotiation
CREATE OR REPLACE FUNCTION public.is_negotiation_candidate_owner(lookup_negotiation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.negotiations n
    JOIN public.offers o ON o.id = n."offerId"
    JOIN public.candidates c ON c.id = o."candidateId"
    WHERE n.id = lookup_negotiation_id
      AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
  );
$$;
REVOKE ALL ON FUNCTION public.is_negotiation_candidate_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_negotiation_candidate_owner(uuid) TO oos_app_runtime, authenticated;

-- Policies for offers
DO $$ BEGIN
  CREATE POLICY "offers_select"
  ON "public"."offers"
  FOR SELECT
  USING (
    public.is_org_member("organizationId")
    OR public.is_offer_candidate_owner("candidateId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "offers_insert"
  ON "public"."offers"
  FOR INSERT
  WITH CHECK (
    public.is_org_member("organizationId")
    OR public.is_offer_candidate_owner("candidateId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "offers_update"
  ON "public"."offers"
  FOR UPDATE
  USING (
    public.is_org_member("organizationId")
    OR public.is_offer_candidate_owner("candidateId")
  )
  WITH CHECK (
    public.is_org_member("organizationId")
    OR public.is_offer_candidate_owner("candidateId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for offer_versions
DO $$ BEGIN
  CREATE POLICY "offer_versions_select"
  ON "public"."offer_versions"
  FOR SELECT
  USING (
    public.is_offer_version_candidate_owner("offerId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "offer_versions_insert"
  ON "public"."offer_versions"
  FOR INSERT
  WITH CHECK (
    public.is_offer_version_candidate_owner("offerId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "offer_versions_update"
  ON "public"."offer_versions"
  FOR UPDATE
  USING (public.is_org_member("organizationId"))
  WITH CHECK (public.is_org_member("organizationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for negotiations
DO $$ BEGIN
  CREATE POLICY "negotiations_select"
  ON "public"."negotiations"
  FOR SELECT
  USING (
    public.is_offer_version_candidate_owner("offerId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "negotiations_insert"
  ON "public"."negotiations"
  FOR INSERT
  WITH CHECK (
    public.is_offer_version_candidate_owner("offerId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "negotiations_update"
  ON "public"."negotiations"
  FOR UPDATE
  USING (
    public.is_offer_version_candidate_owner("offerId")
    OR public.is_org_member("organizationId")
  )
  WITH CHECK (
    public.is_offer_version_candidate_owner("offerId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for negotiation_events
DO $$ BEGIN
  CREATE POLICY "negotiation_events_select"
  ON "public"."negotiation_events"
  FOR SELECT
  USING (
    public.is_negotiation_candidate_owner("negotiationId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "negotiation_events_insert"
  ON "public"."negotiation_events"
  FOR INSERT
  WITH CHECK (
    public.is_negotiation_candidate_owner("negotiationId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "negotiation_events_update"
  ON "public"."negotiation_events"
  FOR UPDATE
  USING (public.is_org_member("organizationId"))
  WITH CHECK (public.is_org_member("organizationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for offer_decisions
DO $$ BEGIN
  CREATE POLICY "offer_decisions_select"
  ON "public"."offer_decisions"
  FOR SELECT
  USING (
    public.is_offer_candidate_owner("candidateId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "offer_decisions_insert"
  ON "public"."offer_decisions"
  FOR INSERT
  WITH CHECK (
    public.is_offer_candidate_owner("candidateId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "offer_decisions_update"
  ON "public"."offer_decisions"
  FOR UPDATE
  USING (public.is_org_member("organizationId"))
  WITH CHECK (public.is_org_member("organizationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for joining_records
DO $$ BEGIN
  CREATE POLICY "joining_records_select"
  ON "public"."joining_records"
  FOR SELECT
  USING (
    public.is_offer_candidate_owner("candidateId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "joining_records_insert"
  ON "public"."joining_records"
  FOR INSERT
  WITH CHECK (
    public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "joining_records_update"
  ON "public"."joining_records"
  FOR UPDATE
  USING (public.is_org_member("organizationId"))
  WITH CHECK (public.is_org_member("organizationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for placement_records
DO $$ BEGIN
  CREATE POLICY "placement_records_select"
  ON "public"."placement_records"
  FOR SELECT
  USING (
    public.is_offer_candidate_owner("candidateId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "placement_records_insert"
  ON "public"."placement_records"
  FOR INSERT
  WITH CHECK (
    public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "placement_records_update"
  ON "public"."placement_records"
  FOR UPDATE
  USING (public.is_org_member("organizationId"))
  WITH CHECK (public.is_org_member("organizationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Policies for offer_evidence
DO $$ BEGIN
  CREATE POLICY "offer_evidence_select"
  ON "public"."offer_evidence"
  FOR SELECT
  USING (
    public.is_offer_candidate_owner("candidateId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "offer_evidence_insert"
  ON "public"."offer_evidence"
  FOR INSERT
  WITH CHECK (
    public.is_offer_candidate_owner("candidateId")
    OR public.is_org_member("organizationId")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "offer_evidence_update"
  ON "public"."offer_evidence"
  FOR UPDATE
  USING (public.is_org_member("organizationId"))
  WITH CHECK (public.is_org_member("organizationId"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
