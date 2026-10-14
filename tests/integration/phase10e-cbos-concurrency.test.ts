/**
 * Phase 10E — CBOS Concurrency & Idempotency Integration Tests
 */

import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { CbosService } from "@/lib/cbos/cbos-service";
import {
  CustomerType,
  PaymentMethod,
  CommercialEventType,
} from "@/lib/cbos/types";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";

describe("Phase 10E — CBOS Concurrency & Idempotency", () => {
  let orgId: string;
  let adminUserId: string;
  let adminContext: AuthenticatedContext;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `CBOS Concurrency Org ${Date.now()}`,
        slug: `cbos-conc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      },
    });
    orgId = org.id;

    adminUserId = "00000000-0000-0000-0000-000000000a02";
    await prisma.user.upsert({
      where: { id: adminUserId },
      update: {},
      create: {
        id: adminUserId,
        email: `admin-conc-${Date.now()}@cbostest.com`,
        status: "ACTIVE",
      },
    });

    await prisma.membership.create({
      data: {
        organizationId: orgId,
        userId: adminUserId,
        role: Role.ADMIN,
      },
    });

    adminContext = {
      userId: adminUserId,
      email: "admin@cbostest.com",
      organizationId: orgId,
      role: Role.ADMIN,
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    };
  });

  afterEach(async () => {
    await prisma.payment.deleteMany({ where: { organizationId: orgId } });
    await prisma.commercialEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.customerAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.membership.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("safeguards against duplicate payment webhook callbacks with identical providerTransactionId", async () => {
    const customer = await CbosService.createCustomerAccount(adminContext, {
      customerType: CustomerType.CORPORATE_CLIENT,
      displayName: "Acme Corp Billing",
      billingEmail: "acme.billing@example.com",
    });

    const providerTxId = `stripe_ch_${Date.now()}_abc123`;

    // First payment ingestion
    const payment1 = await CbosService.recordPayment(adminContext, {
      customerAccountId: customer.id,
      paymentNumber: `PMT-${Date.now()}-1`,
      amountCents: 1500000n,
      paymentMethod: PaymentMethod.STRIPE_CARD,
      provider: "stripe",
      providerTransactionId: providerTxId,
    });

    // Replay of identical webhook
    const payment2 = await CbosService.recordPayment(adminContext, {
      customerAccountId: customer.id,
      paymentNumber: `PMT-${Date.now()}-2`,
      amountCents: 1500000n,
      paymentMethod: PaymentMethod.STRIPE_CARD,
      provider: "stripe",
      providerTransactionId: providerTxId,
    });

    // Expect idempotent return of original payment record
    expect(payment1.id).toBe(payment2.id);
    const count = await prisma.payment.count({
      where: { organizationId: orgId, provider: "stripe", providerTransactionId: providerTxId },
    });
    expect(count).toBe(1);
  });

  it("safeguards against duplicate commercial event generation with same idempotency key", async () => {
    const customer = await CbosService.createCustomerAccount(adminContext, {
      customerType: CustomerType.CORPORATE_CLIENT,
      displayName: "Beta Corp",
      billingEmail: "beta.billing@example.com",
    });

    const idempotencyKey = `comm-key-${Date.now()}-unique`;

    // First event creation
    const event1 = await CbosService.createCommercialEvent(adminContext, {
      customerAccountId: customer.id,
      eventType: CommercialEventType.RETAINER_SCHEDULED,
      calculatedAmountCents: 500000n,
      idempotencyKey,
    });

    // Duplicate replay
    const event2 = await CbosService.createCommercialEvent(adminContext, {
      customerAccountId: customer.id,
      eventType: CommercialEventType.RETAINER_SCHEDULED,
      calculatedAmountCents: 500000n,
      idempotencyKey,
    });

    expect(event1.id).toBe(event2.id);
    const count = await prisma.commercialEvent.count({
      where: { organizationId: orgId, idempotencyKey },
    });
    expect(count).toBe(1);
  });
});
