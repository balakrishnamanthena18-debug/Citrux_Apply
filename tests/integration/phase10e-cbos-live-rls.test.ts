/**
 * Phase 10E — CBOS Live PostgreSQL FORCE RLS & Tenant Isolation Tests
 * Validates that PostgreSQL RLS and FORCE RLS enforce cross-tenant isolation and candidate privacy.
 */

import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  ensureRuntimeRoleGrant,
  getLiveDbUrl,
  withBypassClient,
  withRuntimeRlsAsUser,
} from "../helpers/live-rls";
import { prisma } from "@/lib/db/prisma";

const LIVE = !!getLiveDbUrl();

describe.skipIf(!LIVE)("Phase 10E — Live PostgreSQL FORCE RLS & Tenant Security", () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const userAdminA = randomUUID();
  const userAdminB = randomUUID();
  const userCandA = randomUUID();
  const userCandB = randomUUID();
  const userStranger = randomUUID();

  const candAId = randomUUID();
  const candBId = randomUUID();

  const customerAId = randomUUID();
  const customerBId = randomUUID();
  const contractAId = randomUUID();
  const invoiceAId = randomUUID();
  const invoiceBId = randomUUID();
  const paymentAId = randomUUID();

  beforeAll(async () => {
    await ensureRuntimeRoleGrant();

    await withBypassClient(async (client) => {
      // Grant table permissions to runtime role, ensuring DELETE remains revoked on immutable tables
      await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oos_app_runtime");
      await client.query("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO oos_app_runtime");
      await client.query(`
        REVOKE DELETE ON TABLE 
          "offers", "offer_versions", "negotiations", "negotiation_events", 
          "offer_decisions", "joining_records", "placement_records", "offer_evidence",
          "service_contract_versions", "commercial_events", "invoice_lines",
          "payments", "commercial_credits", "commercial_refunds", "commercial_adjustments", "revenue_attributions"
        FROM oos_app_runtime;
      `);

      // 1. Create Organizations
      await client.query(
        `INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)`,
        [tenantAId, "Org A", `org-a-${Date.now()}`, tenantBId, "Org B", `org-b-${Date.now()}`]
      );

      // 2. Create Users
      await client.query(
        `INSERT INTO public.users (id, email) VALUES
         ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10)`,
        [
          userAdminA, `admin-a-${Date.now()}@a.com`,
          userAdminB, `admin-b-${Date.now()}@b.com`,
          userCandA, `cand-a-${Date.now()}@a.com`,
          userCandB, `cand-b-${Date.now()}@b.com`,
          userStranger, `stranger-${Date.now()}@x.com`,
        ]
      );

      // 3. Memberships
      await client.query(
        `INSERT INTO public.memberships (id, "organizationId", "userId", role, status) VALUES
         (gen_random_uuid(), $1, $2, 'ADMIN', 'ACTIVE'),
         (gen_random_uuid(), $3, $4, 'ADMIN', 'ACTIVE'),
         (gen_random_uuid(), $1, $5, 'CANDIDATE', 'ACTIVE'),
         (gen_random_uuid(), $3, $6, 'CANDIDATE', 'ACTIVE')`,
        [tenantAId, userAdminA, tenantBId, userAdminB, userCandA, userCandB]
      );

      // 4. Candidates
      await client.query(
        `INSERT INTO public.candidates (id, "organizationId", "userId", status) VALUES
         ($1, $2, $3, 'ACTIVE'),
         ($4, $5, $6, 'ACTIVE')`,
        [candAId, tenantAId, userCandA, candBId, tenantBId, userCandB]
      );

      // 5. Customer Accounts
      await client.query(
        `INSERT INTO public.customer_accounts (id, organization_id, customer_type, display_name, billing_email, currency, status) VALUES
         ($1, $2, 'INDIVIDUAL_CANDIDATE', 'Customer A', $3, 'USD', 'ACTIVE'),
         ($4, $5, 'INDIVIDUAL_CANDIDATE', 'Customer B', $6, 'USD', 'ACTIVE')`,
        [customerAId, tenantAId, `billing-a-${Date.now()}@a.com`, customerBId, tenantBId, `billing-b-${Date.now()}@b.com`]
      );

      // 6. Customer Candidate Relationships
      await client.query(
        `INSERT INTO public.customer_candidate_relationships (id, organization_id, customer_account_id, candidate_id, relationship_type, is_primary, status) VALUES
         (gen_random_uuid(), $1, $2, $3, 'SELF_FUNDING', true, 'ACTIVE'),
         (gen_random_uuid(), $4, $5, $6, 'SELF_FUNDING', true, 'ACTIVE')`,
        [tenantAId, customerAId, candAId, tenantBId, customerBId, candBId]
      );

      // 7. Service Contracts
      await client.query(
        `INSERT INTO public.service_contracts (id, organization_id, customer_account_id, candidate_id, contract_number, service_type, billing_cadence, currency, effective_date, status) VALUES
         ($1, $2, $3, $4, $5, 'CAREER_ACCELERATION', 'MONTHLY_RETAINER', 'USD', now(), 'ACTIVE')`,
        [contractAId, tenantAId, customerAId, candAId, `CTR-A-${Date.now()}`]
      );

      // 8. Invoices
      await client.query(
        `INSERT INTO public.invoices (id, organization_id, customer_account_id, invoice_number, status, currency, total_amount_cents, balance_due_amount_cents) VALUES
         ($1, $2, $3, $4, 'ISSUED', 'USD', 250000, 250000),
         ($5, $6, $7, $8, 'ISSUED', 'USD', 500000, 500000)`,
        [invoiceAId, tenantAId, customerAId, `INV-A-${Date.now()}`, invoiceBId, tenantBId, customerBId, `INV-B-${Date.now()}`]
      );

      // 9. Payments
      await client.query(
        `INSERT INTO public.payments (id, organization_id, customer_account_id, invoice_id, payment_number, amount_cents, currency, payment_method, provider, status) VALUES
         ($1, $2, $3, $4, $5, 250000, 'USD', 'STRIPE_CARD', 'stripe', 'COMPLETED')`,
        [paymentAId, tenantAId, customerAId, invoiceAId, `PMT-A-${Date.now()}`]
      );
    });
  });

  afterAll(async () => {
    await withBypassClient(async (client) => {
      await client.query(`DELETE FROM public.payments WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.invoices WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.service_contracts WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.customer_candidate_relationships WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.customer_accounts WHERE organization_id IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.candidates WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.memberships WHERE "organizationId" IN ($1, $2)`, [tenantAId, tenantBId]);
      await client.query(`DELETE FROM public.users WHERE id IN ($1, $2, $3, $4, $5)`, [
        userAdminA, userAdminB, userCandA, userCandB, userStranger
      ]);
      await client.query(`DELETE FROM public.organizations WHERE id IN ($1, $2)`, [tenantAId, tenantBId]);
    });
  });

  it("proves Admin A can read Org A invoices but is physically blocked from Org B invoices", async () => {
    await withRuntimeRlsAsUser(userAdminA, async (client) => {
      const res = await client.query(`SELECT id FROM public.invoices`);
      const ids = res.rows.map((r) => r.id);
      expect(ids).toContain(invoiceAId);
      expect(ids).not.toContain(invoiceBId);
    });
  });

  it("proves Candidate A can read their own Invoice A but is blocked from Invoice B", async () => {
    await withRuntimeRlsAsUser(userCandA, async (client) => {
      const res = await client.query(`SELECT id FROM public.invoices`);
      const ids = res.rows.map((r) => r.id);
      expect(ids).toContain(invoiceAId);
      expect(ids).not.toContain(invoiceBId);
    });
  });

  it("proves Stranger with no membership or relation is completely blocked from all CBOS tables", async () => {
    await withRuntimeRlsAsUser(userStranger, async (client) => {
      const custRes = await client.query(`SELECT id FROM public.customer_accounts`);
      expect(custRes.rows.length).toBe(0);

      const invRes = await client.query(`SELECT id FROM public.invoices`);
      expect(invRes.rows.length).toBe(0);

      const pmtRes = await client.query(`SELECT id FROM public.payments`);
      expect(pmtRes.rows.length).toBe(0);
    });
  });
});
