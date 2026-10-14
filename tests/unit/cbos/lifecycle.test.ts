/**
 * Phase 10E — CBOS Lifecycle Unit Tests
 */

import { describe, it, expect } from "vitest";
import { CbosLifecycle } from "@/lib/cbos/lifecycle";
import {
  CustomerStatus,
  ContractStatus,
  InvoiceStatus,
  PaymentStatus,
} from "@/lib/cbos/types";
import { InvalidStateTransitionError, ValidationError } from "@/lib/errors";

describe("CBOS Lifecycle State Machines", () => {
  describe("CustomerAccount Lifecycle", () => {
    it("allows valid customer transitions", () => {
      expect(() => CbosLifecycle.validateCustomerTransition(CustomerStatus.ACTIVE, CustomerStatus.SUSPENDED)).not.toThrow();
      expect(() => CbosLifecycle.validateCustomerTransition(CustomerStatus.SUSPENDED, CustomerStatus.ACTIVE)).not.toThrow();
      expect(() => CbosLifecycle.validateCustomerTransition(CustomerStatus.ACTIVE, CustomerStatus.CLOSED)).not.toThrow();
    });

    it("rejects transition from terminal CLOSED state", () => {
      expect(() => CbosLifecycle.validateCustomerTransition(CustomerStatus.CLOSED, CustomerStatus.ACTIVE)).toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe("ServiceContract Lifecycle", () => {
    it("allows standard drafting to activation and fulfillment", () => {
      expect(() => CbosLifecycle.validateContractTransition(ContractStatus.DRAFT, ContractStatus.ACTIVE)).not.toThrow();
      expect(() => CbosLifecycle.validateContractTransition(ContractStatus.ACTIVE, ContractStatus.FULFILLED)).not.toThrow();
    });

    it("rejects transition from terminal FULFILLED or TERMINATED", () => {
      expect(() => CbosLifecycle.validateContractTransition(ContractStatus.FULFILLED, ContractStatus.ACTIVE)).toThrow(
        InvalidStateTransitionError
      );
      expect(() => CbosLifecycle.validateContractTransition(ContractStatus.TERMINATED, ContractStatus.DRAFT)).toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe("Invoice Lifecycle & Immutability", () => {
    it("allows transition from DRAFT to ISSUED to PAID", () => {
      expect(() => CbosLifecycle.validateInvoiceTransition(InvoiceStatus.DRAFT, InvoiceStatus.ISSUED)).not.toThrow();
      expect(() => CbosLifecycle.validateInvoiceTransition(InvoiceStatus.ISSUED, InvoiceStatus.PAID)).not.toThrow();
    });

    it("prevents modifying draft amounts once in ISSUED or PAID", () => {
      expect(() => CbosLifecycle.assertInvoiceDraftMutable(InvoiceStatus.DRAFT)).not.toThrow();
      expect(() => CbosLifecycle.assertInvoiceDraftMutable(InvoiceStatus.ISSUED)).toThrow(ValidationError);
      expect(() => CbosLifecycle.assertInvoiceDraftMutable(InvoiceStatus.PAID)).toThrow(ValidationError);
    });

    it("blocks voiding an invoice that has received payments", () => {
      expect(() => CbosLifecycle.assertInvoiceCanBeVoided(InvoiceStatus.ISSUED, 50000n)).toThrow(ValidationError);
      expect(() => CbosLifecycle.assertInvoiceCanBeVoided(InvoiceStatus.ISSUED, 0n)).not.toThrow();
    });
  });

  describe("Payment Lifecycle", () => {
    it("allows COMPLETED to PARTIALLY_REFUNDED and REFUNDED", () => {
      expect(() => CbosLifecycle.validatePaymentTransition(PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED)).not.toThrow();
      expect(() => CbosLifecycle.validatePaymentTransition(PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED)).not.toThrow();
    });

    it("rejects transition from terminal REFUNDED", () => {
      expect(() => CbosLifecycle.validatePaymentTransition(PaymentStatus.REFUNDED, PaymentStatus.COMPLETED)).toThrow(
        InvalidStateTransitionError
      );
    });
  });
});
