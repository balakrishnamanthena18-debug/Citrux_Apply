/**
 * Phase 10E — CBOS Deterministic Pricing Engine
 * Implements pure, deterministic calculation logic for all supported CBOS pricing models
 * using strict BigInt integer minor currency units (cents).
 * Floating-point arithmetic is strictly prohibited.
 */

import { PricingModel, PricingBasis, type PricingTerm } from "./types";
import { ValidationError } from "@/lib/errors";

export interface PricingCalculationInput {
  pricingTerm: {
    pricingModel: PricingModel;
    pricingBasis?: PricingBasis | null;
    percentageBasisPoints?: number | null;
    fixedAmountCents?: bigint | null;
    minimumFeeCents?: bigint | null;
    maximumFeeCents?: bigint | null;
    retainerCreditOffset?: boolean;
    currency?: string;
  };
  candidateCompensationBasisCents?: bigint;
  priorRetainerPaidCents?: bigint;
}

export interface PricingCalculationResult {
  grossFeeCents: bigint;
  retainerCreditOffsetCents: bigint;
  netPayableFeeCents: bigint;
  currency: string;
  calculationBreakdown: string;
}

export class PricingEngine {
  /**
   * Calculates the exact fee according to contract pricing term.
   */
  static calculateFee(input: PricingCalculationInput): PricingCalculationResult {
    const { pricingTerm, candidateCompensationBasisCents, priorRetainerPaidCents = 0n } = input;
    const currency = pricingTerm.currency || "USD";

    let grossFee = 0n;
    let breakdown = "";

    switch (pricingTerm.pricingModel) {
      case PricingModel.FIXED_FEE:
      case PricingModel.RECURRING_SUBSCRIPTION: {
        if (pricingTerm.fixedAmountCents === undefined || pricingTerm.fixedAmountCents === null) {
          throw new ValidationError(`Fixed pricing term missing fixedAmountCents.`);
        }
        if (pricingTerm.fixedAmountCents < 0n) {
          throw new ValidationError(`Fixed amount cannot be negative.`);
        }
        grossFee = pricingTerm.fixedAmountCents;
        breakdown = `Fixed fee: ${grossFee} ${currency} minor units`;
        break;
      }

      case PricingModel.PERCENTAGE_COMPENSATION: {
        if (pricingTerm.percentageBasisPoints === undefined || pricingTerm.percentageBasisPoints === null) {
          throw new ValidationError(`Percentage pricing term missing percentageBasisPoints.`);
        }
        if (pricingTerm.percentageBasisPoints <= 0) {
          throw new ValidationError(`percentageBasisPoints must be greater than zero.`);
        }
        if (candidateCompensationBasisCents === undefined || candidateCompensationBasisCents === null) {
          throw new ValidationError(`candidateCompensationBasisCents required for percentage calculation.`);
        }
        if (candidateCompensationBasisCents <= 0n) {
          throw new ValidationError(`Candidate compensation basis must be greater than zero.`);
        }

        // Calculation: (compensationBasis * basisPoints) / 10000
        const basisPoints = BigInt(pricingTerm.percentageBasisPoints);
        grossFee = (candidateCompensationBasisCents * basisPoints) / 10000n;
        breakdown = `${(Number(basisPoints) / 100).toFixed(2)}% of ${candidateCompensationBasisCents} ${currency} = ${grossFee}`;
        break;
      }

      case PricingModel.TIERED_COMPENSATION: {
        if (pricingTerm.percentageBasisPoints === undefined || pricingTerm.percentageBasisPoints === null) {
          throw new ValidationError(`Tiered pricing term missing percentageBasisPoints.`);
        }
        if (candidateCompensationBasisCents === undefined || candidateCompensationBasisCents === null) {
          throw new ValidationError(`candidateCompensationBasisCents required for tiered calculation.`);
        }

        const basisPoints = BigInt(pricingTerm.percentageBasisPoints);
        grossFee = (candidateCompensationBasisCents * basisPoints) / 10000n;
        breakdown = `Tiered fee on ${candidateCompensationBasisCents} ${currency} = ${grossFee}`;
        break;
      }

      case PricingModel.MILESTONE_CONTINGENT: {
        if (pricingTerm.fixedAmountCents !== null && pricingTerm.fixedAmountCents !== undefined) {
          grossFee = pricingTerm.fixedAmountCents;
          breakdown = `Milestone contingent fixed fee: ${grossFee} ${currency}`;
        } else if (pricingTerm.percentageBasisPoints !== null && pricingTerm.percentageBasisPoints !== undefined && candidateCompensationBasisCents) {
          const basisPoints = BigInt(pricingTerm.percentageBasisPoints);
          grossFee = (candidateCompensationBasisCents * basisPoints) / 10000n;
          breakdown = `Milestone ${(Number(basisPoints) / 100).toFixed(2)}% fee: ${grossFee} ${currency}`;
        } else {
          throw new ValidationError(`Milestone pricing term requires either fixed amount or percentage.`);
        }
        break;
      }

      case PricingModel.HYBRID: {
        let baseAmount = 0n;
        if (pricingTerm.fixedAmountCents) {
          baseAmount += pricingTerm.fixedAmountCents;
        }
        if (pricingTerm.percentageBasisPoints && candidateCompensationBasisCents) {
          const basisPoints = BigInt(pricingTerm.percentageBasisPoints);
          baseAmount += (candidateCompensationBasisCents * basisPoints) / 10000n;
        }
        grossFee = baseAmount;
        breakdown = `Hybrid combined calculation = ${grossFee} ${currency}`;
        break;
      }

      default:
        throw new ValidationError(`Unsupported pricing model: ${pricingTerm.pricingModel}`);
    }

    // Apply minimum fee clamp if specified
    if (pricingTerm.minimumFeeCents !== null && pricingTerm.minimumFeeCents !== undefined) {
      if (grossFee < pricingTerm.minimumFeeCents) {
        breakdown += ` (Clamped to contract minimum fee: ${pricingTerm.minimumFeeCents})`;
        grossFee = pricingTerm.minimumFeeCents;
      }
    }

    // Apply maximum fee cap if specified
    if (pricingTerm.maximumFeeCents !== null && pricingTerm.maximumFeeCents !== undefined) {
      if (grossFee > pricingTerm.maximumFeeCents) {
        breakdown += ` (Capped to contract maximum fee: ${pricingTerm.maximumFeeCents})`;
        grossFee = pricingTerm.maximumFeeCents;
      }
    }

    // Retainer credit offset deduction
    let retainerCreditOffset = 0n;
    if (pricingTerm.retainerCreditOffset && priorRetainerPaidCents > 0n) {
      retainerCreditOffset = priorRetainerPaidCents > grossFee ? grossFee : priorRetainerPaidCents;
      breakdown += ` (Retainer credit offset: -${retainerCreditOffset})`;
    }

    const netPayable = grossFee - retainerCreditOffset;

    return {
      grossFeeCents: grossFee,
      retainerCreditOffsetCents: retainerCreditOffset,
      netPayableFeeCents: netPayable > 0n ? netPayable : 0n,
      currency,
      calculationBreakdown: breakdown,
    };
  }

  /**
   * Helper to format minor unit integer into decimal string representation.
   */
  static formatCentsToCurrencyString(amountCents: bigint, currency: string = "USD"): string {
    const isNegative = amountCents < 0n;
    const absCents = isNegative ? -amountCents : amountCents;
    const whole = absCents / 100n;
    const rem = absCents % 100n;
    const remStr = rem.toString().padStart(2, "0");
    const sign = isNegative ? "-" : "";
    return `${sign}${currency} ${whole.toLocaleString()}.${remStr}`;
  }
}
