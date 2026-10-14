-- Phase 10D: Commercial & Billing Operating System (CBOS) Data Model & Persistence Foundation
-- Establishes CustomerAccount, CustomerCandidateRelationship, ServiceContract, ServiceContractVersion,
-- ServiceEntitlement, PricingTerm, CommercialEvent, CbosOutboxEvent, Invoice, InvoiceLine,
-- Payment, CommercialCredit, CommercialRefund, CommercialAdjustment, RevenueAttribution tables, enums, RLS, and AuditActions.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "CustomerType" AS ENUM (
    'INDIVIDUAL_CANDIDATE',
    'INDIVIDUAL_SPONSOR',
    'CORPORATE_CLIENT',
    'STAFFING_AGENCY',
    'ENTERPRISE_SUBSCRIPTION'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerStatus" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'DELINQUENT',
    'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerCandidateRelationType" AS ENUM (
    'SELF_FUNDING',
    'SPONSOR',
    'CORPORATE_RECRUITING_PARTNER',
    'STAFFING_AGENCY'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RelationStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'REVOKED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContractServiceType" AS ENUM (
    'CAREER_ACCELERATION',
    'PLACEMENT_RETAINER',
    'CONTINGENT_PLACEMENT',
    'ENTERPRISE_TALENT_SEARCH',
    'EXECUTIVE_COACHING'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BillingCadence" AS ENUM (
    'ONE_TIME',
    'MONTHLY_RETAINER',
    'MILESTONE_BASED',
    'PLACEMENT_CONTINGENT',
    'HYBRID_RETAINER_PLACEMENT'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContractStatus" AS ENUM (
    'DRAFT',
    'PENDING_SIGNATURE',
    'ACTIVE',
    'FULFILLED',
    'EXPIRED',
    'TERMINATED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EntitlementType" AS ENUM (
    'APPLICATION_VOLUME_MONTHLY',
    'SEARCH_DURATION_DAYS',
    'DEDICATED_STRATEGIST',
    'INTERVIEW_MOCK_SESSIONS',
    'OFFER_NEGOTIATION_SUPPORT'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EntitlementStatus" AS ENUM (
    'ACTIVE',
    'PAUSED_NONPAYMENT',
    'EXHAUSTED',
    'EXPIRED',
    'REVOKED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PricingModel" AS ENUM (
    'FIXED_FEE',
    'PERCENTAGE_COMPENSATION',
    'RECURRING_SUBSCRIPTION',
    'TIERED_COMPENSATION',
    'MILESTONE_CONTINGENT',
    'HYBRID'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PricingBasis" AS ENUM (
    'FIRST_YEAR_BASE_SALARY',
    'TOTAL_YEAR_ONE_CASH',
    'TOTAL_TARGET_COMPENSATION'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommercialEventType" AS ENUM (
    'RETAINER_SCHEDULED',
    'PLACEMENT_FEE_TRIGGERED',
    'MILESTONE_REACHED',
    'AD_HOC_SERVICE_ORDERED',
    'EARLY_TERMINATION_FEE',
    'CREDIT_ADJUSTMENT_EARNED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OutboxStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM (
    'DRAFT',
    'ISSUED',
    'PARTIALLY_PAID',
    'PAID',
    'OVERDUE',
    'VOID',
    'WRITTEN_OFF'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM (
    'STRIPE_CARD',
    'STRIPE_ACH',
    'RAZORPAY',
    'BANK_WIRE',
    'CHECK',
    'MANUAL_RECORD'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED',
    'REFUNDED',
    'PARTIALLY_REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CreditStatus" AS ENUM (
    'AVAILABLE',
    'PARTIALLY_APPLIED',
    'FULLY_APPLIED',
    'EXPIRED',
    'REVOKED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AdjustmentType" AS ENUM (
    'BAD_DEBT_WRITE_OFF',
    'DISPUTE_SETTLEMENT',
    'GOODWILL_CREDIT',
    'ACCOUNTING_CORRECTION'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. AuditAction enum extensions
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CUSTOMER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CUSTOMER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CUSTOMER_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CANDIDATE_RELATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CANDIDATE_RELATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CONTRACT_DRAFTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CONTRACT_ACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CONTRACT_VERSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CONTRACT_TERMINATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_EVENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_OUTBOX_EVENT_PROCESSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_INVOICE_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_INVOICE_ISSUED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_INVOICE_VOIDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_INVOICE_WRITTEN_OFF';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_PAYMENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_PAYMENT_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_CREDIT_ISSUED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_REFUND_EXECUTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_ADJUSTMENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMERCIAL_REVENUE_ATTRIBUTED';

-- 3. Tables

CREATE TABLE IF NOT EXISTS "customer_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_type" "CustomerType" NOT NULL,
  "display_name" VARCHAR(255) NOT NULL,
  "legal_name" VARCHAR(255),
  "billing_email" VARCHAR(255) NOT NULL,
  "billing_phone" VARCHAR(50),
  "tax_identifier" VARCHAR(100),
  "billing_address" JSONB,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "primary_candidate_id" UUID REFERENCES "candidates"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_customer_org_email" UNIQUE ("organization_id", "billing_email"),
  CONSTRAINT "uq_customer_org_display_name" UNIQUE ("organization_id", "display_name")
);

CREATE TABLE IF NOT EXISTS "customer_candidate_relationships" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE CASCADE,
  "candidate_id" UUID NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "relationship_type" "CustomerCandidateRelationType" NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "effective_to" TIMESTAMPTZ(6),
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "status" "RelationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_cust_cand_rel" UNIQUE ("organization_id", "customer_account_id", "candidate_id", "relationship_type")
);

CREATE TABLE IF NOT EXISTS "service_contracts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE RESTRICT,
  "candidate_id" UUID REFERENCES "candidates"("id") ON DELETE SET NULL,
  "contract_number" VARCHAR(50) NOT NULL,
  "service_type" "ContractServiceType" NOT NULL,
  "billing_cadence" "BillingCadence" NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "effective_date" TIMESTAMPTZ(6) NOT NULL,
  "expiration_date" TIMESTAMPTZ(6),
  "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
  "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
  "current_version_number" INTEGER NOT NULL DEFAULT 1,
  "signed_at" TIMESTAMPTZ(6),
  "signed_document_id" VARCHAR(255),
  "cancellation_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_contract_org_number" UNIQUE ("organization_id", "contract_number")
);

CREATE TABLE IF NOT EXISTS "service_contract_versions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "contract_id" UUID NOT NULL REFERENCES "service_contracts"("id") ON DELETE CASCADE,
  "version_number" INTEGER NOT NULL,
  "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "effective_to" TIMESTAMPTZ(6),
  "terms_summary" TEXT NOT NULL,
  "terms_snapshot" JSONB NOT NULL,
  "created_by_staff_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_contract_version" UNIQUE ("contract_id", "version_number")
);

CREATE TABLE IF NOT EXISTS "service_entitlements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "contract_id" UUID NOT NULL REFERENCES "service_contracts"("id") ON DELETE CASCADE,
  "candidate_id" UUID NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "entitlement_type" "EntitlementType" NOT NULL,
  "allocated_quota" INTEGER NOT NULL,
  "consumed_quota" INTEGER NOT NULL DEFAULT 0,
  "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "valid_to" TIMESTAMPTZ(6),
  "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "pricing_terms" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "contract_id" UUID NOT NULL REFERENCES "service_contracts"("id") ON DELETE CASCADE,
  "contract_version_id" UUID NOT NULL REFERENCES "service_contract_versions"("id") ON DELETE CASCADE,
  "pricing_model" "PricingModel" NOT NULL,
  "pricing_basis" "PricingBasis",
  "percentage_basis_points" INTEGER,
  "fixed_amount_cents" BIGINT,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "minimum_fee_cents" BIGINT,
  "maximum_fee_cents" BIGINT,
  "retainer_credit_offset" BOOLEAN NOT NULL DEFAULT false,
  "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "effective_to" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "commercial_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE RESTRICT,
  "candidate_id" UUID REFERENCES "candidates"("id") ON DELETE SET NULL,
  "service_contract_id" UUID REFERENCES "service_contracts"("id") ON DELETE SET NULL,
  "placement_id" UUID REFERENCES "placement_records"("id") ON DELETE SET NULL,
  "event_type" "CommercialEventType" NOT NULL,
  "calculated_amount_cents" BIGINT NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "pricing_term_id" UUID REFERENCES "pricing_terms"("id") ON DELETE SET NULL,
  "idempotency_key" VARCHAR(255) NOT NULL UNIQUE,
  "source_system" VARCHAR(50) NOT NULL DEFAULT 'OPOS',
  "source_reference_id" VARCHAR(255),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cbos_outbox_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_type" VARCHAR(100) NOT NULL,
  "aggregate_id" VARCHAR(255) NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL UNIQUE,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "processed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE RESTRICT,
  "contract_id" UUID REFERENCES "service_contracts"("id") ON DELETE SET NULL,
  "commercial_event_id" UUID REFERENCES "commercial_events"("id") ON DELETE SET NULL,
  "invoice_number" VARCHAR(50) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "subtotal_amount_cents" BIGINT NOT NULL DEFAULT 0,
  "discount_amount_cents" BIGINT NOT NULL DEFAULT 0,
  "credit_applied_amount_cents" BIGINT NOT NULL DEFAULT 0,
  "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 0,
  "tax_amount_cents" BIGINT NOT NULL DEFAULT 0,
  "total_amount_cents" BIGINT NOT NULL DEFAULT 0,
  "total_paid_amount_cents" BIGINT NOT NULL DEFAULT 0,
  "balance_due_amount_cents" BIGINT NOT NULL DEFAULT 0,
  "issue_date" TIMESTAMPTZ(6),
  "due_date" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "voided_at" TIMESTAMPTZ(6),
  "void_reason" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_invoice_org_number" UNIQUE ("organization_id", "invoice_number")
);

CREATE TABLE IF NOT EXISTS "invoice_lines" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "invoice_id" UUID NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "line_number" INTEGER NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_price_cents" BIGINT NOT NULL,
  "total_price_cents" BIGINT NOT NULL,
  "candidate_id" UUID REFERENCES "candidates"("id") ON DELETE SET NULL,
  "placement_id" UUID REFERENCES "placement_records"("id") ON DELETE SET NULL,
  "commercial_event_id" UUID REFERENCES "commercial_events"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_invoice_line_number" UNIQUE ("invoice_id", "line_number")
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE RESTRICT,
  "invoice_id" UUID REFERENCES "invoices"("id") ON DELETE SET NULL,
  "payment_number" VARCHAR(50) NOT NULL,
  "amount_cents" BIGINT NOT NULL,
  "refunded_amount_cents" BIGINT NOT NULL DEFAULT 0,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "payment_method" "PaymentMethod" NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "provider_transaction_id" VARCHAR(255),
  "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "recorded_by_staff_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_payment_org_number" UNIQUE ("organization_id", "payment_number"),
  CONSTRAINT "uq_payment_provider_ref" UNIQUE ("organization_id", "provider", "provider_transaction_id")
);

CREATE TABLE IF NOT EXISTS "commercial_credits" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE RESTRICT,
  "contract_id" UUID REFERENCES "service_contracts"("id") ON DELETE SET NULL,
  "applied_invoice_id" UUID REFERENCES "invoices"("id") ON DELETE SET NULL,
  "credit_number" VARCHAR(50) NOT NULL,
  "amount_cents" BIGINT NOT NULL,
  "remaining_amount_cents" BIGINT NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "reason" VARCHAR(500) NOT NULL,
  "status" "CreditStatus" NOT NULL DEFAULT 'AVAILABLE',
  "issued_by_staff_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_credit_org_number" UNIQUE ("organization_id", "credit_number")
);

CREATE TABLE IF NOT EXISTS "commercial_refunds" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE RESTRICT,
  "payment_id" UUID NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT,
  "refund_number" VARCHAR(50) NOT NULL,
  "amount_cents" BIGINT NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "provider" VARCHAR(50) NOT NULL,
  "provider_refund_id" VARCHAR(255),
  "reason" VARCHAR(500) NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'COMPLETED',
  "authorized_by_staff_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "uq_refund_org_number" UNIQUE ("organization_id", "refund_number"),
  CONSTRAINT "uq_refund_provider_ref" UNIQUE ("organization_id", "provider", "provider_refund_id")
);

CREATE TABLE IF NOT EXISTS "commercial_adjustments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE RESTRICT,
  "invoice_id" UUID REFERENCES "invoices"("id") ON DELETE SET NULL,
  "adjustment_type" "AdjustmentType" NOT NULL,
  "amount_cents" BIGINT NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "reason" VARCHAR(500) NOT NULL,
  "authorized_by_staff_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "revenue_attributions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "customer_account_id" UUID NOT NULL REFERENCES "customer_accounts"("id") ON DELETE RESTRICT,
  "invoice_id" UUID NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT,
  "payment_id" UUID NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT,
  "candidate_id" UUID REFERENCES "candidates"("id") ON DELETE SET NULL,
  "placement_id" UUID REFERENCES "placement_records"("id") ON DELETE SET NULL,
  "attributed_amount_cents" BIGINT NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "strategist_staff_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "specialist_staff_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "sourcing_staff_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "recognized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS "idx_customer_accounts_org_status" ON "customer_accounts"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "idx_cust_cand_rel_cand" ON "customer_candidate_relationships"("organization_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "idx_cust_cand_rel_cust" ON "customer_candidate_relationships"("organization_id", "customer_account_id");
CREATE INDEX IF NOT EXISTS "idx_contracts_org_cust_status" ON "service_contracts"("organization_id", "customer_account_id", "status");
CREATE INDEX IF NOT EXISTS "idx_contracts_org_cand" ON "service_contracts"("organization_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "idx_contract_versions_org_ctr" ON "service_contract_versions"("organization_id", "contract_id");
CREATE INDEX IF NOT EXISTS "idx_entitlements_org_cand" ON "service_entitlements"("organization_id", "candidate_id", "entitlement_type");
CREATE INDEX IF NOT EXISTS "idx_entitlements_org_ctr" ON "service_entitlements"("organization_id", "contract_id");
CREATE INDEX IF NOT EXISTS "idx_pricing_terms_org_ctr" ON "pricing_terms"("organization_id", "contract_id");
CREATE INDEX IF NOT EXISTS "idx_pricing_terms_org_ver" ON "pricing_terms"("organization_id", "contract_version_id");
CREATE INDEX IF NOT EXISTS "idx_comm_events_org_cust" ON "commercial_events"("organization_id", "customer_account_id");
CREATE INDEX IF NOT EXISTS "idx_comm_events_org_placement" ON "commercial_events"("organization_id", "placement_id");
CREATE INDEX IF NOT EXISTS "idx_comm_events_org_cand" ON "commercial_events"("organization_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "idx_outbox_org_status_avail" ON "cbos_outbox_events"("organization_id", "status", "available_at");
CREATE INDEX IF NOT EXISTS "idx_invoices_org_cust_status" ON "invoices"("organization_id", "customer_account_id", "status");
CREATE INDEX IF NOT EXISTS "idx_invoices_org_status_due" ON "invoices"("organization_id", "status", "due_date");
CREATE INDEX IF NOT EXISTS "idx_invoice_lines_org_inv" ON "invoice_lines"("organization_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "idx_payments_org_cust" ON "payments"("organization_id", "customer_account_id");
CREATE INDEX IF NOT EXISTS "idx_payments_org_inv" ON "payments"("organization_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "idx_credits_org_cust_status" ON "commercial_credits"("organization_id", "customer_account_id", "status");
CREATE INDEX IF NOT EXISTS "idx_refunds_org_pmt" ON "commercial_refunds"("organization_id", "payment_id");
CREATE INDEX IF NOT EXISTS "idx_adjustments_org_cust" ON "commercial_adjustments"("organization_id", "customer_account_id");
CREATE INDEX IF NOT EXISTS "idx_adjustments_org_inv" ON "commercial_adjustments"("organization_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "idx_rev_attr_org_cust" ON "revenue_attributions"("organization_id", "customer_account_id");
CREATE INDEX IF NOT EXISTS "idx_rev_attr_org_inv" ON "revenue_attributions"("organization_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "idx_rev_attr_org_pmt" ON "revenue_attributions"("organization_id", "payment_id");
CREATE INDEX IF NOT EXISTS "idx_rev_attr_org_cand" ON "revenue_attributions"("organization_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "idx_rev_attr_org_plc" ON "revenue_attributions"("organization_id", "placement_id");

-- 5. Enable RLS and FORCE RLS on all 14 CBOS tables
ALTER TABLE "customer_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_accounts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "customer_candidate_relationships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_candidate_relationships" FORCE ROW LEVEL SECURITY;

ALTER TABLE "service_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_contracts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "service_contract_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_contract_versions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "service_entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_entitlements" FORCE ROW LEVEL SECURITY;

ALTER TABLE "pricing_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pricing_terms" FORCE ROW LEVEL SECURITY;

ALTER TABLE "commercial_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "cbos_outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cbos_outbox_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;

ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "commercial_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_credits" FORCE ROW LEVEL SECURITY;

ALTER TABLE "commercial_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_refunds" FORCE ROW LEVEL SECURITY;

ALTER TABLE "commercial_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commercial_adjustments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "revenue_attributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revenue_attributions" FORCE ROW LEVEL SECURITY;

-- 6. Helper functions for CBOS RLS
CREATE OR REPLACE FUNCTION public.is_candidate_owner(p_candidate_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = p_candidate_id
      AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
  );
$$;
REVOKE ALL ON FUNCTION public.is_candidate_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_candidate_owner(UUID) TO oos_app_runtime, authenticated;

CREATE OR REPLACE FUNCTION public.is_customer_candidate_owner(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_candidate_relationships ccr
    JOIN public.candidates c ON c.id = ccr.candidate_id
    WHERE ccr.customer_account_id = p_customer_id
      AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
  );
$$;
REVOKE ALL ON FUNCTION public.is_customer_candidate_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_customer_candidate_owner(UUID) TO oos_app_runtime, authenticated;

CREATE OR REPLACE FUNCTION public.is_invoice_candidate_owner(p_invoice_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.customer_candidate_relationships ccr ON ccr.customer_account_id = i.customer_account_id
    JOIN public.candidates c ON c.id = ccr.candidate_id
    WHERE i.id = p_invoice_id
      AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
  );
$$;
REVOKE ALL ON FUNCTION public.is_invoice_candidate_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_invoice_candidate_owner(UUID) TO oos_app_runtime, authenticated;

CREATE OR REPLACE FUNCTION public.is_payment_candidate_owner(p_payment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payments p
    JOIN public.customer_candidate_relationships ccr ON ccr.customer_account_id = p.customer_account_id
    JOIN public.candidates c ON c.id = ccr.candidate_id
    WHERE p.id = p_payment_id
      AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
  );
$$;
REVOKE ALL ON FUNCTION public.is_payment_candidate_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_payment_candidate_owner(UUID) TO oos_app_runtime, authenticated;

-- 7. Policies

-- customer_accounts
DO $$ BEGIN
  CREATE POLICY "customer_accounts_select"
  ON "public"."customer_accounts"
  FOR SELECT
  USING (
    public.is_customer_candidate_owner("id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "customer_accounts_insert"
  ON "public"."customer_accounts"
  FOR INSERT
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "customer_accounts_update"
  ON "public"."customer_accounts"
  FOR UPDATE
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- customer_candidate_relationships
DO $$ BEGIN
  CREATE POLICY "customer_candidate_rel_select"
  ON "public"."customer_candidate_relationships"
  FOR SELECT
  USING (
    public.is_candidate_owner("candidate_id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "customer_candidate_rel_write"
  ON "public"."customer_candidate_relationships"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- service_contracts
DO $$ BEGIN
  CREATE POLICY "service_contracts_select"
  ON "public"."service_contracts"
  FOR SELECT
  USING (
    ("candidate_id" IS NOT NULL AND public.is_candidate_owner("candidate_id"))
    OR public.is_customer_candidate_owner("customer_account_id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_contracts_write"
  ON "public"."service_contracts"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- service_contract_versions
DO $$ BEGIN
  CREATE POLICY "service_contract_versions_select"
  ON "public"."service_contract_versions"
  FOR SELECT
  USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_contract_versions_write"
  ON "public"."service_contract_versions"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- service_entitlements
DO $$ BEGIN
  CREATE POLICY "service_entitlements_select"
  ON "public"."service_entitlements"
  FOR SELECT
  USING (
    public.is_candidate_owner("candidate_id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_entitlements_write"
  ON "public"."service_entitlements"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- pricing_terms
DO $$ BEGIN
  CREATE POLICY "pricing_terms_select"
  ON "public"."pricing_terms"
  FOR SELECT
  USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "pricing_terms_write"
  ON "public"."pricing_terms"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- commercial_events
DO $$ BEGIN
  CREATE POLICY "commercial_events_select"
  ON "public"."commercial_events"
  FOR SELECT
  USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "commercial_events_write"
  ON "public"."commercial_events"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- cbos_outbox_events
DO $$ BEGIN
  CREATE POLICY "cbos_outbox_events_select"
  ON "public"."cbos_outbox_events"
  FOR SELECT
  USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "cbos_outbox_events_write"
  ON "public"."cbos_outbox_events"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- invoices
DO $$ BEGIN
  CREATE POLICY "invoices_select"
  ON "public"."invoices"
  FOR SELECT
  USING (
    public.is_invoice_candidate_owner("id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "invoices_write"
  ON "public"."invoices"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- invoice_lines
DO $$ BEGIN
  CREATE POLICY "invoice_lines_select"
  ON "public"."invoice_lines"
  FOR SELECT
  USING (
    public.is_invoice_candidate_owner("invoice_id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "invoice_lines_write"
  ON "public"."invoice_lines"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- payments
DO $$ BEGIN
  CREATE POLICY "payments_select"
  ON "public"."payments"
  FOR SELECT
  USING (
    public.is_payment_candidate_owner("id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "payments_write"
  ON "public"."payments"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- commercial_credits
DO $$ BEGIN
  CREATE POLICY "commercial_credits_select"
  ON "public"."commercial_credits"
  FOR SELECT
  USING (
    public.is_customer_candidate_owner("customer_account_id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "commercial_credits_write"
  ON "public"."commercial_credits"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- commercial_refunds
DO $$ BEGIN
  CREATE POLICY "commercial_refunds_select"
  ON "public"."commercial_refunds"
  FOR SELECT
  USING (
    public.is_customer_candidate_owner("customer_account_id")
    OR public.is_org_member("organization_id")
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "commercial_refunds_write"
  ON "public"."commercial_refunds"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- commercial_adjustments
DO $$ BEGIN
  CREATE POLICY "commercial_adjustments_select"
  ON "public"."commercial_adjustments"
  FOR SELECT
  USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "commercial_adjustments_write"
  ON "public"."commercial_adjustments"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- revenue_attributions
DO $$ BEGIN
  CREATE POLICY "revenue_attributions_select"
  ON "public"."revenue_attributions"
  FOR SELECT
  USING (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "revenue_attributions_write"
  ON "public"."revenue_attributions"
  FOR ALL
  USING (public.is_org_member("organization_id"))
  WITH CHECK (public.is_org_member("organization_id"));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Runtime Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oos_app_runtime;

-- Immutability enforcement: revoke DELETE on immutable OPOS and CBOS tables
REVOKE DELETE ON TABLE 
  offers, offer_versions, negotiations, negotiation_events, 
  offer_decisions, joining_records, placement_records, offer_evidence,
  service_contract_versions, commercial_events, invoice_lines,
  payments, commercial_credits, commercial_refunds, commercial_adjustments, revenue_attributions
FROM oos_app_runtime;

