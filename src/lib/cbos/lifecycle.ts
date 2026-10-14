/**
 * Phase 10E — CBOS Lifecycle State Machines & Immutability Guards
 * Mathematical verification of valid state transitions across all CBOS entities.
 */

import {
  CustomerStatus,
  ContractStatus,
  InvoiceStatus,
  PaymentStatus,
  CreditStatus,
  RefundStatus,
} from "./types";
import { InvalidStateTransitionError, ValidationError } from "@/lib/errors";

export class CbosLifecycle {
  // ==========================================
  // CUSTOMER ACCOUNT TRANSITIONS
  // ==========================================
  private static readonly CUSTOMER_TRANSITIONS: Record<CustomerStatus, CustomerStatus[]> = {
    [CustomerStatus.ACTIVE]: [CustomerStatus.SUSPENDED, CustomerStatus.DELINQUENT, CustomerStatus.CLOSED],
    [CustomerStatus.SUSPENDED]: [CustomerStatus.ACTIVE, CustomerStatus.DELINQUENT, CustomerStatus.CLOSED],
    [CustomerStatus.DELINQUENT]: [CustomerStatus.ACTIVE, CustomerStatus.SUSPENDED, CustomerStatus.CLOSED],
    [CustomerStatus.CLOSED]: [], // Terminal
  };

  static validateCustomerTransition(from: CustomerStatus, to: CustomerStatus): void {
    if (from === to) return;
    const allowed = this.CUSTOMER_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(`Invalid CustomerAccount transition from ${from} to ${to}`);
    }
  }

  // ==========================================
  // SERVICE CONTRACT TRANSITIONS
  // ==========================================
  private static readonly CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
    [ContractStatus.DRAFT]: [ContractStatus.PENDING_SIGNATURE, ContractStatus.ACTIVE, ContractStatus.CANCELLED],
    [ContractStatus.PENDING_SIGNATURE]: [ContractStatus.ACTIVE, ContractStatus.DRAFT, ContractStatus.CANCELLED],
    [ContractStatus.ACTIVE]: [ContractStatus.FULFILLED, ContractStatus.EXPIRED, ContractStatus.TERMINATED],
    [ContractStatus.FULFILLED]: [], // Terminal
    [ContractStatus.EXPIRED]: [ContractStatus.ACTIVE], // Renewal
    [ContractStatus.TERMINATED]: [], // Terminal
    [ContractStatus.CANCELLED]: [], // Terminal
  };

  static validateContractTransition(from: ContractStatus, to: ContractStatus): void {
    if (from === to) return;
    const allowed = this.CONTRACT_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(`Invalid ServiceContract transition from ${from} to ${to}`);
    }
  }

  // ==========================================
  // INVOICE TRANSITIONS
  // ==========================================
  private static readonly INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
    [InvoiceStatus.DRAFT]: [InvoiceStatus.ISSUED, InvoiceStatus.VOID],
    [InvoiceStatus.ISSUED]: [InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.VOID, InvoiceStatus.WRITTEN_OFF],
    [InvoiceStatus.PARTIALLY_PAID]: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.WRITTEN_OFF],
    [InvoiceStatus.PAID]: [], // Terminal
    [InvoiceStatus.OVERDUE]: [InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.WRITTEN_OFF],
    [InvoiceStatus.VOID]: [], // Terminal
    [InvoiceStatus.WRITTEN_OFF]: [], // Terminal
  };

  static validateInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
    if (from === to) return;
    const allowed = this.INVOICE_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(`Invalid Invoice transition from ${from} to ${to}`);
    }
  }

  /**
   * Asserts that an invoice is mutable (must be in DRAFT state).
   */
  static assertInvoiceDraftMutable(status: InvoiceStatus): void {
    if (status !== InvoiceStatus.DRAFT) {
      throw new ValidationError(`Invoice amounts and line items cannot be modified once in ${status} state.`);
    }
  }

  /**
   * Asserts that an invoice can be voided (cannot have settled payments).
   */
  static assertInvoiceCanBeVoided(status: InvoiceStatus, totalPaidAmountCents: bigint): void {
    if (totalPaidAmountCents > 0n) {
      throw new ValidationError(`Cannot void invoice that has recorded payments (${totalPaidAmountCents} cents). Issue a refund or credit instead.`);
    }
    if (status === InvoiceStatus.VOID || status === InvoiceStatus.WRITTEN_OFF) {
      throw new ValidationError(`Invoice is already in terminal ${status} state.`);
    }
  }

  // ==========================================
  // PAYMENT TRANSITIONS
  // ==========================================
  private static readonly PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    [PaymentStatus.PENDING]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED],
    [PaymentStatus.COMPLETED]: [PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED],
    [PaymentStatus.PARTIALLY_REFUNDED]: [PaymentStatus.REFUNDED],
    [PaymentStatus.FAILED]: [],
    [PaymentStatus.REFUNDED]: [],
  };

  static validatePaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
    if (from === to) return;
    const allowed = this.PAYMENT_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(`Invalid Payment transition from ${from} to ${to}`);
    }
  }
}
