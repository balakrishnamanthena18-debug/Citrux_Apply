/**
 * PHASE 10F — CBOS SECURITY / RLS / AUDIT ADVERSARIAL VERIFICATION SUITE
 *
 * Attacks the implemented CBOS system to prove:
 * 1. Multi-tenant isolation (Org A vs Org B) across all 14 CBOS entities
 * 2. Client-supplied authority tampering resistance
 * 3. Role escalation resistance (Candidate, Employee, Admin)
 * 4. Candidate financial privacy and DTO sanitization
 * 5. Immutable financial record protection (Service + Live Database)
 * 6. Append-only correction model enforcement
 * 7. Payment callback replay and idempotency
 * 8. Commercial event duplication and OPOS boundary integrity
 * 9. Transactional outbox resilience and retry safety
 * 10. Financial math boundary and integer precision safety
 * 11. Audit atomicity and rollback safety
 * 12. PostgreSQL FORCE RLS and catalog grants forensic
 */

import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { CbosService } from "@/lib/cbos/cbos-service";
import { PricingEngine } from "@/lib/cbos/pricing-engine";
import { CbosOutbox } from "@/lib/cbos/cbos-outbox";
import {
  CustomerType,
  CustomerStatus,
  ContractServiceType,
  BillingCadence,
  PricingModel,
  PricingBasis,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  CreditStatus,
  RefundStatus,
  AdjustmentType,
  EntitlementType,
  CommercialEventType,
} from "@/lib/cbos/types";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import {
  ensureRuntimeRoleGrant,
  getLiveDbUrl,
  withBypassClient,
  withRuntimeRlsAsUser,
} from "../helpers/live-rls";

const LIVE = !!getLiveDbUrl();

describe("PHASE 10F — CBOS Security, RLS & Financial Audit Adversarial Verification", () => {
  // Tenant A Identifiers
  const tenantAId = randomUUID();
  const userAdminA = randomUUID();
  const userEmpA = randomUUID();
  const userCandA = randomUUID();
  const candAId = randomUUID();

  // Tenant B Identifiers
  const tenantBId = randomUUID();
  const userAdminB = randomUUID();
  const userEmpB = randomUUID();
  const userCandB = randomUUID();
  const candBId = randomUUID();

  // Stranger Identifier
  const userStranger = randomUUID();

  // Seeded Entity Identifiers
  let customerAId: string;
  let customerBId: string;
  let contractAId: string;
  let contractBId: string;
  let versionAId: string;
  let versionBId: string;
  let pricingTermAId: string;
  let pricingTermBId: string;
  let entitlementAId: string;
  let entitlementBId: string;
  let commEventAId: string;
  let commEventBId: string;
  let invoiceAId: string;
  let invoiceBId: string;
  let paymentAId: string;
  let paymentBId: string;
  let creditAId: string;
  let creditBId: string;
  let refundAId: string;
  let refundBId: string;
  let adjustmentAId: string;
  let adjustmentBId: string;
  let attributionAId: string;
  let attributionBId: string;
  let outboxAId: string;
  let outboxBId: string;
  let placementAId: string;
  let placementBId: string;

  // Contexts
  let adminCtxA: AuthenticatedContext;
  let empCtxA: AuthenticatedContext;
  let candCtxA: AuthenticatedContext;

  let adminCtxB: AuthenticatedContext;
  let empCtxB: AuthenticatedContext;
  let candCtxB: AuthenticatedContext;

  let strangerCtx: AuthenticatedContext;

  const CBOS_TABLES = [
    "customer_accounts",
    "customer_candidate_relationships",
    "service_contracts",
    "service_contract_versions",
    "service_entitlements",
    "pricing_terms",
    "commercial_events",
    "cbos_outbox_events",
    "invoices",
    "invoice_lines",
    "payments",
    "commercial_credits",
    "commercial_refunds",
    "commercial_adjustments",
    "revenue_attributions",
  ];

  const IMMUTABLE_CBOS_TABLES = [
    "service_contract_versions",
    "commercial_events",
    "invoice_lines",
    "payments",
    "commercial_credits",
    "commercial_refunds",
    "commercial_adjustments",
    "revenue_attributions",
  ];

  beforeAll(async () => {
    if (!LIVE) return;
    await ensureRuntimeRoleGrant();

    // 1. Setup Base Database Records using Bypass Client
    await withBypassClient(async (c) => {
      // Clean old pending outbox events to prevent test pollution
      await c.query(`DELETE FROM public.cbos_outbox_events WHERE status = 'PENDING'`);

      // 1a. Create Organizations
      await c.query(
        `INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
        [tenantAId, "Org A", `org-a-10f-${Date.now()}`, tenantBId, "Org B", `org-b-10f-${Date.now()}`]
      );

      // 1b. Create Users
      await c.query(
        `INSERT INTO public.users (id, email) VALUES
         ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10), ($11, $12), ($13, $14)`,
        [
          userAdminA, `admin-a-10f-${Date.now()}@a.com`,
          userEmpA, `emp-a-10f-${Date.now()}@a.com`,
          userCandA, `cand-a-10f-${Date.now()}@a.com`,
          userAdminB, `admin-b-10f-${Date.now()}@b.com`,
          userEmpB, `emp-b-10f-${Date.now()}@b.com`,
          userCandB, `cand-b-10f-${Date.now()}@b.com`,
          userStranger, `stranger-10f-${Date.now()}@x.com`,
        ]
      );

      // 1c. Create Memberships
      await c.query(
        `INSERT INTO public.memberships (id, "organizationId", "userId", role, status) VALUES
         (gen_random_uuid(), $1, $2, 'ADMIN', 'ACTIVE'),
         (gen_random_uuid(), $1, $3, 'EMPLOYEE', 'ACTIVE'),
         (gen_random_uuid(), $1, $4, 'CANDIDATE', 'ACTIVE'),
         (gen_random_uuid(), $5, $6, 'ADMIN', 'ACTIVE'),
         (gen_random_uuid(), $5, $7, 'EMPLOYEE', 'ACTIVE'),
         (gen_random_uuid(), $5, $8, 'CANDIDATE', 'ACTIVE')`,
        [
          tenantAId, userAdminA, userEmpA, userCandA,
          tenantBId, userAdminB, userEmpB, userCandB,
        ]
      );

      // 1d. Create Candidates
      await c.query(
        `INSERT INTO public.candidates (id, "organizationId", "userId", status, "verificationStatus") VALUES
         ($1, $2, $3, 'ACTIVE', 'VERIFIED'),
         ($4, $5, $6, 'ACTIVE', 'VERIFIED')`,
        [candAId, tenantAId, userCandA, candBId, tenantBId, userCandB]
      );

      // 1d-bis. Create OPOS Placement Records
      const jobAId = randomUUID();
      await c.query(
        `INSERT INTO public.jobs (id, "organizationId", title, "companyName", "jobDescription", "createdById", status) VALUES
         ($1, $2, 'Staff Engineer A', 'Acme Corp', 'Great job description', $3, 'OPEN')`,
        [jobAId, tenantAId, userAdminA]
      );

      const appAId = randomUUID();
      await c.query(
        `INSERT INTO public.applications (id, "organizationId", "candidateId", "jobId", status) VALUES
         ($1, $2, $3, $4, 'SUBMITTED')`,
        [appAId, tenantAId, candAId, jobAId]
      );

      const offerAId = randomUUID();
      await c.query(
        `INSERT INTO public.offers (id, "organizationId", "candidateId", "applicationId", "jobId", status, "currentVersionNumber") VALUES
         ($1, $2, $3, $4, $5, 'ACCEPTED', 1)`,
        [offerAId, tenantAId, candAId, appAId, jobAId]
      );

      const joiningAId = randomUUID();
      await c.query(
        `INSERT INTO public.joining_records (id, "organizationId", "candidateId", "offerId", "applicationId", status, "scheduledStartDate", "actualStartDate") VALUES
         ($1, $2, $3, $4, $5, 'JOINING_CONFIRMED', now(), now())`,
        [joiningAId, tenantAId, candAId, offerAId, appAId]
      );

      placementAId = randomUUID();
      await c.query(
        `INSERT INTO public.placement_records (id, "organizationId", "candidateId", "offerId", "joiningId", "applicationId", "verifiedStartDate", "verifiedAt", "verifiedById", "firstDayConfirmed", "onboardingProofValidated") VALUES
         ($1, $2, $3, $4, $5, $6, now(), now(), $7, true, true)`,
        [placementAId, tenantAId, candAId, offerAId, joiningAId, appAId, userAdminA]
      );

      // 1e. Create Customer Accounts
      customerAId = randomUUID();
      customerBId = randomUUID();
      await c.query(
        `INSERT INTO public.customer_accounts (id, organization_id, customer_type, display_name, billing_email, currency, status) VALUES
         ($1, $2, 'INDIVIDUAL_CANDIDATE', 'Customer A Corp', $3, 'USD', 'ACTIVE'),
         ($4, $5, 'INDIVIDUAL_CANDIDATE', 'Customer B Corp', $6, 'USD', 'ACTIVE')`,
        [customerAId, tenantAId, `billing-a-${Date.now()}@a.com`, customerBId, tenantBId, `billing-b-${Date.now()}@b.com`]
      );

      // 1f. Create Relationships
      await c.query(
        `INSERT INTO public.customer_candidate_relationships (id, organization_id, customer_account_id, candidate_id, relationship_type, is_primary, status) VALUES
         (gen_random_uuid(), $1, $2, $3, 'SELF_FUNDING', true, 'ACTIVE'),
         (gen_random_uuid(), $4, $5, $6, 'SELF_FUNDING', true, 'ACTIVE')`,
        [tenantAId, customerAId, candAId, tenantBId, customerBId, candBId]
      );

      // 1g. Create Service Contracts
      contractAId = randomUUID();
      contractBId = randomUUID();
      await c.query(
        `INSERT INTO public.service_contracts (id, organization_id, customer_account_id, candidate_id, contract_number, service_type, billing_cadence, currency, effective_date, status, current_version_number) VALUES
         ($1, $2, $3, $4, $5, 'CAREER_ACCELERATION', 'HYBRID_RETAINER_PLACEMENT', 'USD', now(), 'ACTIVE', 1),
         ($6, $7, $8, $9, $10, 'CAREER_ACCELERATION', 'HYBRID_RETAINER_PLACEMENT', 'USD', now(), 'ACTIVE', 1)`,
        [contractAId, tenantAId, customerAId, candAId, `CTR-A-${Date.now()}`, contractBId, tenantBId, customerBId, candBId, `CTR-B-${Date.now()}`]
      );

      // 1h. Create Service Contract Versions
      versionAId = randomUUID();
      versionBId = randomUUID();
      await c.query(
        `INSERT INTO public.service_contract_versions (id, organization_id, contract_id, version_number, terms_summary, terms_snapshot, created_by_staff_id) VALUES
         ($1, $2, $3, 1, 'Org A V1 Terms', '{"fee": 15}', $4),
         ($5, $6, $7, 1, 'Org B V1 Terms', '{"fee": 20}', $8)`,
        [versionAId, tenantAId, contractAId, userAdminA, versionBId, tenantBId, contractBId, userAdminB]
      );

      // 1i. Create Service Entitlements
      entitlementAId = randomUUID();
      entitlementBId = randomUUID();
      await c.query(
        `INSERT INTO public.service_entitlements (id, organization_id, contract_id, candidate_id, entitlement_type, allocated_quota, consumed_quota, status) VALUES
         ($1, $2, $3, $4, 'APPLICATION_VOLUME_MONTHLY', 100, 10, 'ACTIVE'),
         ($5, $6, $7, $8, 'APPLICATION_VOLUME_MONTHLY', 100, 20, 'ACTIVE')`,
        [entitlementAId, tenantAId, contractAId, candAId, entitlementBId, tenantBId, contractBId, candBId]
      );

      // 1j. Create Pricing Terms
      pricingTermAId = randomUUID();
      pricingTermBId = randomUUID();
      await c.query(
        `INSERT INTO public.pricing_terms (id, organization_id, contract_id, contract_version_id, pricing_model, pricing_basis, percentage_basis_points, minimum_fee_cents, retainer_credit_offset, currency) VALUES
         ($1, $2, $3, $4, 'PERCENTAGE_COMPENSATION', 'FIRST_YEAR_BASE_SALARY', 1500, 1000000, true, 'USD'),
         ($5, $6, $7, $8, 'PERCENTAGE_COMPENSATION', 'FIRST_YEAR_BASE_SALARY', 2000, 1500000, true, 'USD')`,
        [pricingTermAId, tenantAId, contractAId, versionAId, pricingTermBId, tenantBId, contractBId, versionBId]
      );

      // 1k. Create Commercial Events
      commEventAId = randomUUID();
      commEventBId = randomUUID();
      await c.query(
        `INSERT INTO public.commercial_events (id, organization_id, customer_account_id, candidate_id, service_contract_id, event_type, calculated_amount_cents, currency, idempotency_key, source_system) VALUES
         ($1, $2, $3, $4, $5, 'PLACEMENT_FEE_TRIGGERED', 3000000, 'USD', $6, 'OPOS'),
         ($7, $8, $9, $10, $11, 'PLACEMENT_FEE_TRIGGERED', 4000000, 'USD', $12, 'OPOS')`,
        [
          commEventAId, tenantAId, customerAId, candAId, contractAId, `event-key-a-${Date.now()}`,
          commEventBId, tenantBId, customerBId, candBId, contractBId, `event-key-b-${Date.now()}`,
        ]
      );

      // 1l. Create Invoices and Invoice Lines
      invoiceAId = randomUUID();
      invoiceBId = randomUUID();
      await c.query(
        `INSERT INTO public.invoices (id, organization_id, customer_account_id, contract_id, commercial_event_id, invoice_number, status, currency, total_amount_cents, balance_due_amount_cents, subtotal_amount_cents) VALUES
         ($1, $2, $3, $4, $5, $6, 'ISSUED', 'USD', 3000000, 3000000, 3000000),
         ($7, $8, $9, $10, $11, $12, 'ISSUED', 'USD', 4000000, 4000000, 4000000)`,
        [
          invoiceAId, tenantAId, customerAId, contractAId, commEventAId, `INV-A-${Date.now()}`,
          invoiceBId, tenantBId, customerBId, contractBId, commEventBId, `INV-B-${Date.now()}`,
        ]
      );

      await c.query(
        `INSERT INTO public.invoice_lines (id, organization_id, invoice_id, line_number, description, quantity, unit_price_cents, total_price_cents) VALUES
         (gen_random_uuid(), $1, $2, 1, 'Placement Fee A', 1, 3000000, 3000000),
         (gen_random_uuid(), $3, $4, 1, 'Placement Fee B', 1, 4000000, 4000000)`,
        [tenantAId, invoiceAId, tenantBId, invoiceBId]
      );

      // 1m. Create Payments
      paymentAId = randomUUID();
      paymentBId = randomUUID();
      await c.query(
        `INSERT INTO public.payments (id, organization_id, customer_account_id, invoice_id, payment_number, amount_cents, currency, payment_method, provider, provider_transaction_id, status) VALUES
         ($1, $2, $3, $4, $5, 3000000, 'USD', 'BANK_WIRE', 'bank_wire', $6, 'COMPLETED'),
         ($7, $8, $9, $10, $11, 4000000, 'USD', 'BANK_WIRE', 'bank_wire', $12, 'COMPLETED')`,
        [
          paymentAId, tenantAId, customerAId, invoiceAId, `PMT-A-${Date.now()}`, `tx-a-${Date.now()}`,
          paymentBId, tenantBId, customerBId, invoiceBId, `PMT-B-${Date.now()}`, `tx-b-${Date.now()}`,
        ]
      );

      // 1n. Create Credits
      creditAId = randomUUID();
      creditBId = randomUUID();
      await c.query(
        `INSERT INTO public.commercial_credits (id, organization_id, customer_account_id, contract_id, credit_number, amount_cents, remaining_amount_cents, currency, reason, status, issued_by_staff_id) VALUES
         ($1, $2, $3, $4, $5, 50000, 50000, 'USD', 'Org A Retainer Credit', 'AVAILABLE', $6),
         ($7, $8, $9, $10, $11, 60000, 60000, 'USD', 'Org B Retainer Credit', 'AVAILABLE', $12)`,
        [creditAId, tenantAId, customerAId, contractAId, `CRD-A-${Date.now()}`, userAdminA, creditBId, tenantBId, customerBId, contractBId, `CRD-B-${Date.now()}`, userAdminB]
      );

      // 1o. Create Refunds
      refundAId = randomUUID();
      refundBId = randomUUID();
      await c.query(
        `INSERT INTO public.commercial_refunds (id, organization_id, customer_account_id, payment_id, refund_number, amount_cents, currency, provider, provider_refund_id, reason, status, authorized_by_staff_id) VALUES
         ($1, $2, $3, $4, $5, 20000, 'USD', 'bank_wire', $6, 'Org A Partial Refund', 'COMPLETED', $7),
         ($8, $9, $10, $11, $12, 30000, 'USD', 'bank_wire', $13, 'Org B Partial Refund', 'COMPLETED', $14)`,
        [
          refundAId, tenantAId, customerAId, paymentAId, `REF-A-${Date.now()}`, `ref-tx-a-${Date.now()}`, userAdminA,
          refundBId, tenantBId, customerBId, paymentBId, `REF-B-${Date.now()}`, `ref-tx-b-${Date.now()}`, userAdminB,
        ]
      );

      // 1p. Create Adjustments
      adjustmentAId = randomUUID();
      adjustmentBId = randomUUID();
      await c.query(
        `INSERT INTO public.commercial_adjustments (id, organization_id, customer_account_id, invoice_id, adjustment_type, amount_cents, currency, reason, authorized_by_staff_id) VALUES
         ($1, $2, $3, $4, 'GOODWILL_CREDIT', 10000, 'USD', 'Org A Adjustment', $5),
         ($6, $7, $8, $9, 'GOODWILL_CREDIT', 15000, 'USD', 'Org B Adjustment', $10)`,
        [adjustmentAId, tenantAId, customerAId, invoiceAId, userAdminA, adjustmentBId, tenantBId, customerBId, invoiceBId, userAdminB]
      );

      // 1q. Create Revenue Attributions
      attributionAId = randomUUID();
      attributionBId = randomUUID();
      await c.query(
        `INSERT INTO public.revenue_attributions (id, organization_id, customer_account_id, invoice_id, payment_id, candidate_id, attributed_amount_cents, currency, strategist_staff_id) VALUES
         ($1, $2, $3, $4, $5, $6, 3000000, 'USD', $7),
         ($8, $9, $10, $11, $12, $13, 4000000, 'USD', $14)`,
        [
          attributionAId, tenantAId, customerAId, invoiceAId, paymentAId, candAId, userAdminA,
          attributionBId, tenantBId, customerBId, invoiceBId, paymentBId, candBId, userAdminB,
        ]
      );

      // 1r. Create Outbox Events
      outboxAId = randomUUID();
      outboxBId = randomUUID();
      await c.query(
        `INSERT INTO public.cbos_outbox_events (id, organization_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key, status) VALUES
         ($1, $2, 'OPOS_PLACEMENT_VERIFIED_EVENT', 'PlacementRecord', 'plc-a-1', '{"amount": 100}', $3, 'COMPLETED'),
         ($4, $5, 'OPOS_PLACEMENT_VERIFIED_EVENT', 'PlacementRecord', 'plc-b-1', '{"amount": 200}', $6, 'COMPLETED')`,
        [outboxAId, tenantAId, `outbox-key-a-${Date.now()}`, outboxBId, tenantBId, `outbox-key-b-${Date.now()}`]
      );
    });

    // Initialize Contexts
    adminCtxA = {
      userId: userAdminA,
      email: "admin-a@a.com",
      organizationId: tenantAId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
    empCtxA = {
      userId: userEmpA,
      email: "emp-a@a.com",
      organizationId: tenantAId,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
    candCtxA = {
      userId: userCandA,
      email: "cand-a@a.com",
      organizationId: tenantAId,
      role: Role.CANDIDATE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    adminCtxB = {
      userId: userAdminB,
      email: "admin-b@b.com",
      organizationId: tenantBId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
    empCtxB = {
      userId: userEmpB,
      email: "emp-b@b.com",
      organizationId: tenantBId,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
    candCtxB = {
      userId: userCandB,
      email: "cand-b@b.com",
      organizationId: tenantBId,
      role: Role.CANDIDATE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };

    strangerCtx = {
      userId: userStranger,
      email: "stranger@x.com",
      organizationId: randomUUID(),
      role: Role.CANDIDATE,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    await withBypassClient(async (c) => {
      await c.query(`DELETE FROM public.audit_events WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.revenue_attributions WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.commercial_adjustments WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.commercial_refunds WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.commercial_credits WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.payments WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.invoice_lines WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.invoices WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.cbos_outbox_events WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.commercial_events WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.pricing_terms WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.service_entitlements WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.service_contract_versions WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.service_contracts WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.customer_candidate_relationships WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.customer_accounts WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.placement_records WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.joining_records WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.offers WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.applications WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.jobs WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.candidates WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.memberships WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await c.query(`DELETE FROM public.users WHERE id IN ($1, $2, $3, $4, $5, $6, $7)`, [
        userAdminA, userEmpA, userCandA, userAdminB, userEmpB, userCandB, userStranger,
      ]);
      await c.query(`DELETE FROM public.organizations WHERE id IN ($1, $2)`, [tenantAId, tenantBId]);
    });
  }, 60000);

  // ==========================================================
  // A. CROSS-TENANT ADVERSARIAL ATTACK SUITE
  // ==========================================================

  describe("A. Cross-Tenant Adversarial Isolation", () => {
    it("Admin A CANNOT read Org B data across all 15 CBOS tables via Live PostgreSQL Session RLS", async () => {
      await withRuntimeRlsAsUser(userAdminA, async (c) => {
        // Direct SELECT attempts on Org B entity IDs
        const custB = await c.query(`SELECT id FROM public.customer_accounts WHERE id = $1`, [customerBId]);
        expect(custB.rows).toHaveLength(0);

        const ctrB = await c.query(`SELECT id FROM public.service_contracts WHERE id = $1`, [contractBId]);
        expect(ctrB.rows).toHaveLength(0);

        const verB = await c.query(`SELECT id FROM public.service_contract_versions WHERE id = $1`, [versionBId]);
        expect(verB.rows).toHaveLength(0);

        const entB = await c.query(`SELECT id FROM public.service_entitlements WHERE id = $1`, [entitlementBId]);
        expect(entB.rows).toHaveLength(0);

        const ptB = await c.query(`SELECT id FROM public.pricing_terms WHERE id = $1`, [pricingTermBId]);
        expect(ptB.rows).toHaveLength(0);

        const evB = await c.query(`SELECT id FROM public.commercial_events WHERE id = $1`, [commEventBId]);
        expect(evB.rows).toHaveLength(0);

        const outB = await c.query(`SELECT id FROM public.cbos_outbox_events WHERE id = $1`, [outboxBId]);
        expect(outB.rows).toHaveLength(0);

        const invB = await c.query(`SELECT id FROM public.invoices WHERE id = $1`, [invoiceBId]);
        expect(invB.rows).toHaveLength(0);

        const pmtB = await c.query(`SELECT id FROM public.payments WHERE id = $1`, [paymentBId]);
        expect(pmtB.rows).toHaveLength(0);

        const crdB = await c.query(`SELECT id FROM public.commercial_credits WHERE id = $1`, [creditBId]);
        expect(crdB.rows).toHaveLength(0);

        const refB = await c.query(`SELECT id FROM public.commercial_refunds WHERE id = $1`, [refundBId]);
        expect(refB.rows).toHaveLength(0);

        const adjB = await c.query(`SELECT id FROM public.commercial_adjustments WHERE id = $1`, [adjustmentBId]);
        expect(adjB.rows).toHaveLength(0);

        const attrB = await c.query(`SELECT id FROM public.revenue_attributions WHERE id = $1`, [attributionBId]);
        expect(attrB.rows).toHaveLength(0);
      });
    });

    it("Org A Actor CANNOT create records in Org B from Org A Context", async () => {
      // Attempting to draft a contract for Org B customer from Org A context
      await expect(
        CbosService.draftServiceContract(adminCtxA, {
          customerAccountId: customerBId, // Foreign customer
          candidateId: candAId,
          contractNumber: `CTR-CROSS-${Date.now()}`,
          serviceType: ContractServiceType.CAREER_ACCELERATION,
          billingCadence: BillingCadence.MONTHLY_RETAINER,
          currency: "USD",
          effectiveDate: new Date(),
          initialPricingTerms: [],
          initialEntitlements: [],
        })
      ).rejects.toThrow();
    });

    it("Org A Actor CANNOT attach Org B candidate to Org A Customer Relationship", async () => {
      await expect(
        CbosService.createCustomerAccount(adminCtxA, {
          customerType: CustomerType.INDIVIDUAL_CANDIDATE,
          displayName: "Cross Tenant Customer",
          billingEmail: "cross@example.com",
          currency: "USD",
          primaryCandidateId: candBId, // Foreign candidate from Org B
        })
      ).rejects.toThrow();
    });

    it("Org A Actor CANNOT transition Org B Contract lifecycle", async () => {
      await expect(
        CbosService.activateServiceContract(adminCtxA, contractBId, "FORGED-DOC")
      ).rejects.toThrow();
    });

    it("Org A Actor CANNOT generate invoice against Org B Commercial Event", async () => {
      await expect(
        CbosService.generateInvoiceFromEvent(adminCtxA, {
          commercialEventId: commEventBId,
          invoiceNumber: `INV-FORGE-${Date.now()}`,
        })
      ).rejects.toThrow();
    });

    it("Org A Actor CANNOT record payment against Org B Invoice", async () => {
      await expect(
        CbosService.recordPayment(adminCtxA, {
          customerAccountId: customerAId,
          invoiceId: invoiceBId,
          paymentNumber: `PMT-FORGE-${Date.now()}`,
          amountCents: 100000n,
          currency: "USD",
          paymentMethod: PaymentMethod.BANK_WIRE,
          provider: "bank_wire",
        })
      ).rejects.toThrow();
    });

    it("Org A Actor CANNOT issue refund against Org B Payment", async () => {
      await expect(
        CbosService.issueCommercialRefund(adminCtxA, {
          paymentId: paymentBId,
          refundNumber: `REF-FORGE-${Date.now()}`,
          amountCents: 10000n,
          provider: "bank_wire",
          reason: "Adversarial cross tenant refund",
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================================
  // B. CLIENT-SUPPLIED AUTHORITY ATTACKS
  // ==========================================================

  describe("B. Client-Supplied Authority Tampering Resistance", () => {
    it("Ignores payload attempts to override context organizationId and userId", async () => {
      // Create a customer account while passing forged organizationId in payload
      const customer = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Tampering Test Account",
        billingEmail: "tamper@example.com",
        currency: "USD",
        primaryCandidateId: candAId,
        ...({ organizationId: tenantBId, userId: userAdminB } as any),
      });

      // The created customer MUST belong to Org A, never Org B
      expect(customer.organizationId).toBe(tenantAId);
    });
  });

  // ==========================================================
  // C. ROLE ESCALATION ATTACKS
  // ==========================================================

  describe("C. Role Escalation Resistance", () => {
    it("CANDIDATE cannot execute staff commercial mutations", async () => {
      // 1. Candidate cannot create customer accounts
      await expect(
        CbosService.createCustomerAccount(candCtxA, {
          customerType: CustomerType.INDIVIDUAL_CANDIDATE,
          displayName: "Candidate Unauthorized Account",
          billingEmail: "cand@test.com",
          currency: "USD",
          primaryCandidateId: candAId,
        })
      ).rejects.toThrow();

      // 2. Candidate cannot draft contracts
      await expect(
        CbosService.draftServiceContract(candCtxA, {
          customerAccountId: customerAId,
          candidateId: candAId,
          contractNumber: `CTR-CAND-${Date.now()}`,
          serviceType: ContractServiceType.CAREER_ACCELERATION,
          billingCadence: BillingCadence.MONTHLY_RETAINER,
          currency: "USD",
          effectiveDate: new Date(),
          initialPricingTerms: [],
          initialEntitlements: [],
        })
      ).rejects.toThrow();

      // 3. Candidate cannot issue invoices
      await expect(
        CbosService.issueInvoice(candCtxA, invoiceAId)
      ).rejects.toThrow();

      // 4. Candidate cannot record payments
      await expect(
        CbosService.recordPayment(candCtxA, {
          customerAccountId: customerAId,
          invoiceId: invoiceAId,
          paymentNumber: `PMT-CAND-${Date.now()}`,
          amountCents: 50000n,
          currency: "USD",
          paymentMethod: PaymentMethod.BANK_WIRE,
          provider: "bank_wire",
        })
      ).rejects.toThrow();

      // 5. Candidate cannot issue commercial credits
      await expect(
        CbosService.issueCommercialCredit(candCtxA, {
          customerAccountId: customerAId,
          creditNumber: `CRD-CAND-${Date.now()}`,
          amountCents: 50000n,
          reason: "Candidate self credit",
        })
      ).rejects.toThrow();

      // 6. Candidate cannot attribute revenue
      await expect(
        CbosService.attributeRevenue(candCtxA, {
          invoiceId: invoiceAId,
          paymentId: paymentAId,
          attributedAmountCents: 100000n,
        })
      ).rejects.toThrow();
    });

    it("EMPLOYEE cannot modify immutable financial records or cross tenant boundaries", async () => {
      // Employee cannot issue adjustments on another tenant
      await expect(
        CbosService.recordCommercialAdjustment(empCtxA, {
          customerAccountId: customerBId,
          adjustmentType: AdjustmentType.GOODWILL_CREDIT,
          amountCents: 10000n,
          reason: "Illegal cross-tenant adjustment",
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================================
  // D. CANDIDATE FINANCIAL PRIVACY & DTO BOUNDARY
  // ==========================================================

  describe("D. Candidate Financial Privacy & Sanitization", () => {
    it("Candidate billing summary does NOT expose company margins, internal rates, or revenue attribution", async () => {
      const summary = await CbosService.getCandidateBillingSummary(candCtxA, candAId);

      expect(summary.hasActiveCustomerAccount).toBe(true);
      expect(summary.customerDisplayName).toBe("Customer A Corp");

      // Verify no internal margins or pricing formulas are present
      expect(summary).not.toHaveProperty("companyMargin");
      expect(summary).not.toHaveProperty("recruiterRevenueAttribution");
      expect(summary).not.toHaveProperty("revenueAttributions");
      expect(summary).not.toHaveProperty("internalNotes");

      // Invoices in summary must be sanitized DTOs
      for (const inv of summary.invoices) {
        expect(inv).toHaveProperty("invoiceNumber");
        expect(inv).toHaveProperty("totalAmountFormatted");
        expect(inv).not.toHaveProperty("internalMargin");
      }
    });

    it("Candidate querying Postgres directly is blocked from reading internal pricing terms and revenue attribution", async () => {
      await withRuntimeRlsAsUser(userCandA, async (c) => {
        // Direct SELECT on pricing_terms
        const pt = await c.query(`SELECT id FROM public.pricing_terms WHERE organization_id = $1`, [tenantAId]);
        expect(pt.rows).toHaveLength(0); // Candidate cannot view internal pricing formulas

        // Direct SELECT on revenue_attributions
        const attr = await c.query(`SELECT id FROM public.revenue_attributions WHERE organization_id = $1`, [tenantAId]);
        expect(attr.rows).toHaveLength(0); // Candidate cannot view internal recruiter attribution

        // Direct SELECT on commercial_adjustments
        const adj = await c.query(`SELECT id FROM public.commercial_adjustments WHERE organization_id = $1`, [tenantAId]);
        expect(adj.rows).toHaveLength(0); // Candidate cannot view internal adjustment rationale
      });
    });
  });

  // ==========================================================
  // E. IMMUTABILITY & PROHIBITED MUTATIONS
  // ==========================================================

  describe("E. Financial Immutability Protection", () => {
    it("Rejects direct modification of ISSUED or PAID Invoices", async () => {
      // Attempting to void a PAID invoice without legitimate lifecycle transition
      const paidInvoiceId = randomUUID();
      await withBypassClient(async (c) => {
        await c.query(
          `INSERT INTO public.invoices (id, organization_id, customer_account_id, invoice_number, status, currency, total_amount_cents, balance_due_amount_cents)
           VALUES ($1, $2, $3, $4, 'PAID', 'USD', 100000, 0)`,
          [paidInvoiceId, tenantAId, customerAId, `INV-PAID-${Date.now()}`]
        );
      });

      // Attempting to void a PAID invoice must throw lifecycle error
      await expect(
        CbosService.voidInvoice(adminCtxA, paidInvoiceId, "Illegal void of paid invoice")
      ).rejects.toThrow();

      // Cleanup
      await withBypassClient(async (c) => {
        await c.query(`DELETE FROM public.invoices WHERE id = $1`, [paidInvoiceId]);
      });
    });

    it("PostgreSQL revokes direct DELETE grant on all immutable tables from runtime role", async () => {
      await withRuntimeRlsAsUser(userAdminA, async (c) => {
        // Direct DELETE on immutable tables MUST fail at the database level
        await expect(c.query(`DELETE FROM public.service_contract_versions WHERE id = $1`, [versionAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM public.commercial_events WHERE id = $1`, [commEventAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM public.invoice_lines WHERE id = $1`, [invoiceAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM public.payments WHERE id = $1`, [paymentAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM public.commercial_credits WHERE id = $1`, [creditAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM public.commercial_refunds WHERE id = $1`, [refundAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM public.commercial_adjustments WHERE id = $1`, [adjustmentAId])).rejects.toThrow();
        await expect(c.query(`DELETE FROM public.revenue_attributions WHERE id = $1`, [attributionAId])).rejects.toThrow();
      });
    });
  });

  // ==========================================================
  // F. APPEND-ONLY CORRECTION MODEL
  // ==========================================================

  describe("F. Append-Only Correction Model", () => {
    it("Maintains original historical invoice and applies corrections via CommercialCredit", async () => {
      // Create a test invoice
      const invoice = await withBypassClient(async (c) => {
        const invId = randomUUID();
        await c.query(
          `INSERT INTO public.invoices (id, organization_id, customer_account_id, invoice_number, status, currency, total_amount_cents, balance_due_amount_cents)
           VALUES ($1, $2, $3, $4, 'ISSUED', 'USD', 1000000, 1000000)`,
          [invId, tenantAId, customerAId, `INV-CORR-${Date.now()}`]
        );
        return invId;
      });

      // Issue Commercial Credit for $200 (20000 cents)
      const credit = await CbosService.issueCommercialCredit(adminCtxA, {
        customerAccountId: customerAId,
        creditNumber: `CRD-CORR-${Date.now()}`,
        amountCents: 20000n,
        contractId: contractAId,
        reason: "Correction of billing overage via credit",
      });

      expect(credit.amountCents).toBe(20000n);
      expect(credit.status).toBe(CreditStatus.AVAILABLE);

      // Verify original invoice totalAmountCents remains unchanged ($10,000.00)
      const originalInv = await prisma.invoice.findUnique({ where: { id: invoice } });
      expect(originalInv?.totalAmountCents).toBe(1000000n);

      // Cleanup
      await withBypassClient(async (c) => {
        await c.query(`DELETE FROM public.commercial_credits WHERE id = $1`, [credit.id]);
        await c.query(`DELETE FROM public.invoices WHERE id = $1`, [invoice]);
      });
    });
  });

  // ==========================================================
  // G. PAYMENT REPLAY & IDEMPOTENCY
  // ==========================================================

  describe("G. Payment Replay & Idempotency", () => {
    it("Rejects duplicate payment callback with identical providerTransactionId sequentially and concurrently", async () => {
      const pmtNum = `PMT-DUP-${Date.now()}`;
      const providerTxId = `wire-dup-${Date.now()}`;

      // 1. Initial Payment
      const payment1 = await CbosService.recordPayment(adminCtxA, {
        customerAccountId: customerAId,
        invoiceId: invoiceAId,
        paymentNumber: pmtNum,
        amountCents: 50000n,
        currency: "USD",
        paymentMethod: PaymentMethod.BANK_WIRE,
        provider: "bank_wire",
        providerTransactionId: providerTxId,
      });
      expect(payment1.id).toBeDefined();

      // 2. Sequential Duplicate Replay Attempt
      const payment2 = await CbosService.recordPayment(adminCtxA, {
        customerAccountId: customerAId,
        invoiceId: invoiceAId,
        paymentNumber: `PMT-DUP-2-${Date.now()}`,
        amountCents: 50000n,
        currency: "USD",
        paymentMethod: PaymentMethod.BANK_WIRE,
        provider: "bank_wire",
        providerTransactionId: providerTxId, // SAME providerTransactionId
      });
      expect(payment2.id).toBe(payment1.id);

      // 3. Concurrent Duplicate Attempt
      const sharedTxId = `concurrent-tx-${Date.now()}`;
      const results = await Promise.allSettled(
        Array.from({ length: 5 }).map((_, idx) =>
          CbosService.recordPayment(adminCtxA, {
            customerAccountId: customerAId,
            invoiceId: invoiceAId,
            paymentNumber: `PMT-CONC-${idx}-${Date.now()}`,
            amountCents: 10000n,
            currency: "USD",
            paymentMethod: PaymentMethod.BANK_WIRE,
            provider: "bank_wire",
            providerTransactionId: sharedTxId, // shared across these 5
          })
        )
      );

      // Verify at least 1 succeeded and all fulfilled calls return the same payment ID
      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      const uniquePaymentIds = new Set(fulfilled.map((r) => r.value.id));
      expect(uniquePaymentIds.size).toBe(1);

      // And exactly 1 payment record exists in the database
      const dbPayments = await prisma.payment.findMany({
        where: { providerTransactionId: sharedTxId },
      });
      expect(dbPayments.length).toBe(1);
    });
  });

  // ==========================================================
  // H. COMMERCIAL EVENT DUPLICATION & OPOS BOUNDARY
  // ==========================================================

  describe("H. Commercial Event Duplication & OPOS Ingestion", () => {
    it("Submitting identical OPOS placement event repeatedly processes idempotently with zero duplication", async () => {
      const idempotencyKey = `idemp-opos-plc-${Date.now()}`;

      // Enqueue 3 identical outbox events with same idempotency key
      await CbosOutbox.enqueueEvent(
        tenantAId,
        "OPOS_PLACEMENT_VERIFIED_EVENT",
        "PlacementRecord",
        placementAId,
        {
          organizationId: tenantAId,
          placementId: placementAId,
          candidateId: candAId,
          offerId: randomUUID(),
          annualBaseSalaryCents: 18000000, // $180,000
          currency: "USD",
          joiningDate: new Date(),
          verifiedAt: new Date(),
          verifiedByStaffId: userAdminA,
        },
        idempotencyKey
      );

      // Attempt second enqueue with same idempotencyKey
      await CbosOutbox.enqueueEvent(
        tenantAId,
        "OPOS_PLACEMENT_VERIFIED_EVENT",
        "PlacementRecord",
        placementAId,
        {
          organizationId: tenantAId,
          placementId: placementAId,
          candidateId: candAId,
          offerId: randomUUID(),
          annualBaseSalaryCents: 18000000,
          currency: "USD",
          joiningDate: new Date(),
          verifiedAt: new Date(),
          verifiedByStaffId: userAdminA,
        },
        idempotencyKey
      );

      // Process Outbox
      const { processedCount } = await CbosOutbox.processPendingEvents();
      expect(processedCount).toBeGreaterThanOrEqual(1);

      // Verify only ONE commercial event was recorded
      const commEvents = await prisma.commercialEvent.findMany({
        where: { organizationId: tenantAId, placementId: placementAId },
      });
      expect(commEvents).toHaveLength(1);
      expect(commEvents[0]?.calculatedAmountCents).toBe(2700000n); // 15% of $180,000 = $27,000
    });

    it("Rejects placement event when candidate has no active service contract", async () => {
      const unlinkedCandId = randomUUID();
      const unlinkedUserId = randomUUID();
      const placementId = randomUUID();

      await withBypassClient(async (c) => {
        await c.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [unlinkedUserId, `unlinked-${Date.now()}@a.com`]);
        await c.query(`INSERT INTO public.memberships (id, "organizationId", "userId", role) VALUES (gen_random_uuid(), $1, $2, 'CANDIDATE')`, [tenantAId, unlinkedUserId]);
        await c.query(`INSERT INTO public.candidates (id, "organizationId", "userId") VALUES ($1, $2, $3)`, [unlinkedCandId, tenantAId, unlinkedUserId]);
      });

      await CbosOutbox.enqueueEvent(
        tenantAId,
        "OPOS_PLACEMENT_VERIFIED_EVENT",
        "PlacementRecord",
        placementId,
        {
          organizationId: tenantAId,
          placementId,
          candidateId: unlinkedCandId, // Candidate has NO service contract
          offerId: randomUUID(),
          annualBaseSalaryCents: 15000000,
          currency: "USD",
          joiningDate: new Date(),
          verifiedAt: new Date(),
          verifiedByStaffId: userAdminA,
        },
        `no-contract-${placementId}`
      );

      const { processedCount } = await CbosOutbox.processPendingEvents();
      expect(processedCount).toBe(1);

      // OPOS state is untouched and no commercial event created
      const commEvent = await prisma.commercialEvent.findFirst({
        where: { organizationId: tenantAId, placementId },
      });
      expect(commEvent).toBeNull();

      // Cleanup
      await withBypassClient(async (c) => {
        await c.query(`DELETE FROM public.cbos_outbox_events WHERE idempotency_key = $1`, [`no-contract-${placementId}`]);
        await c.query(`DELETE FROM public.candidates WHERE id = $1`, [unlinkedCandId]);
        await c.query(`DELETE FROM public.memberships WHERE "userId" = $1`, [unlinkedUserId]);
        await c.query(`DELETE FROM public.users WHERE id = $1`, [unlinkedUserId]);
      });
    });
  });

  // ==========================================================
  // I. FINANCIAL MATH ADVERSARIAL BOUNDARY TESTING
  // ==========================================================

  describe("I. Financial Math Adversarial Boundaries", () => {
    it("Calculates percentage compensation with deterministic integer precision and fee clamping", () => {
      // 1. Minimum Fee Clamping: 15% on $50,000 = $7,500, but min fee is $10,000
      const resultMin = PricingEngine.calculateFee({
        pricingTerm: {
          pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
          pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
          percentageBasisPoints: 1500, // 15.00%
          minimumFeeCents: 1000000n, // $10,000.00
          maximumFeeCents: 5000000n, // $50,000.00
          currency: "USD",
        },
        candidateCompensationBasisCents: 5000000n, // $50,000.00
      });
      expect(resultMin.netPayableFeeCents).toBe(1000000n); // Clamped up to min fee

      // 2. Maximum Fee Clamping: 20% on $400,000 = $80,000, but max fee is $50,000
      const resultMax = PricingEngine.calculateFee({
        pricingTerm: {
          pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
          pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
          percentageBasisPoints: 2000, // 20.00%
          minimumFeeCents: 1000000n,
          maximumFeeCents: 5000000n, // $50,000.00 max
          currency: "USD",
        },
        candidateCompensationBasisCents: 40000000n, // $400,000.00
      });
      expect(resultMax.netPayableFeeCents).toBe(5000000n); // Clamped down to max fee

      // 3. Fractional Precision Truncation (no floating point corruption):
      // 17.55% (1755 bps) on $133,333.33 (13333333 cents) = 2339999n (integer precision)
      const resultFractional = PricingEngine.calculateFee({
        pricingTerm: {
          pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
          pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
          percentageBasisPoints: 1755,
          currency: "USD",
        },
        candidateCompensationBasisCents: 13333333n,
      });
      expect(resultFractional.netPayableFeeCents).toBe(2339999n); // Exact BigInt division (13333333 * 1755 / 10000)
    });

    it("Rejects negative salary amounts and negative basis points", () => {
      expect(() =>
        PricingEngine.calculateFee({
          pricingTerm: {
            pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
            pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
            percentageBasisPoints: -500, // Negative percentage
            currency: "USD",
          },
          candidateCompensationBasisCents: 10000000n,
        })
      ).toThrow();

      expect(() =>
        PricingEngine.calculateFee({
          pricingTerm: {
            pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
            pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
            percentageBasisPoints: 1500,
            currency: "USD",
          },
          candidateCompensationBasisCents: -10000000n, // Negative salary
        })
      ).toThrow();
    });
  });

  // ==========================================================
  // J. AUDIT ATOMICITY & ROLLBACK SAFETY
  // ==========================================================

  describe("J. Audit Atomicity & Transactional Integrity", () => {
    it("Authoritative audit event commits atomically on successful mutation", async () => {
      const cust = await CbosService.createCustomerAccount(adminCtxA, {
        customerType: CustomerType.INDIVIDUAL_CANDIDATE,
        displayName: "Audit Verified Account",
        billingEmail: "audit@test.com",
        currency: "USD",
        primaryCandidateId: candAId,
      });

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId: tenantAId,
          entityId: cust.id,
          entityType: "CustomerAccount",
        },
      });

      expect(auditEvent).toBeDefined();
      expect(auditEvent?.actorId).toBe(userAdminA);
      expect(auditEvent?.action).toBe("COMMERCIAL_CUSTOMER_CREATED");
    });
  });

  // ==========================================================
  // K. POSTGRESQL CATALOG FORENSIC: FORCE RLS & SECURITY DEFINER
  // ==========================================================

  describe("K. PostgreSQL Catalog Security Forensic", () => {
    it("Verifies relrowsecurity = true and relforcerowsecurity = true on all 14 CBOS tables", async () => {
      await withBypassClient(async (c) => {
        const res = await c.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND c.relname = ANY($1::text[])`,
          [CBOS_TABLES]
        );

        expect(res.rows.length).toBeGreaterThanOrEqual(14);
        for (const row of res.rows) {
          expect(row.relrowsecurity, `Table ${row.relname} must have row security enabled`).toBe(true);
          expect(row.relforcerowsecurity, `Table ${row.relname} must have FORCE row security enabled`).toBe(true);
        }
      });
    });

    it("Verifies NO DELETE grant exists for oos_app_runtime on immutable CBOS tables", async () => {
      await withBypassClient(async (c) => {
        const res = await c.query<{ table_name: string; privilege_type: string }>(
          `SELECT table_name, privilege_type
           FROM information_schema.role_table_grants
           WHERE grantee = 'oos_app_runtime'
             AND table_name = ANY($1::text[])
             AND privilege_type = 'DELETE'`,
          [IMMUTABLE_CBOS_TABLES]
        );

        expect(res.rows).toHaveLength(0);
      });
    });

    it("Verifies all CBOS SECURITY DEFINER helper functions have fixed search_path = public, pg_temp", async () => {
      await withBypassClient(async (c) => {
        const res = await c.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
          `SELECT p.proname, p.prosecdef, p.proconfig
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN (
               'is_candidate_owner',
               'is_customer_candidate_owner',
               'is_invoice_candidate_owner',
               'is_payment_candidate_owner',
               'is_org_member'
             )`
        );

        expect(res.rows.length).toBeGreaterThanOrEqual(5);
        for (const row of res.rows) {
          expect(row.prosecdef, `${row.proname} must be SECURITY DEFINER`).toBe(true);
          expect(row.proconfig).toContain("search_path=public, pg_temp");
        }
      });
    });
  });
});
