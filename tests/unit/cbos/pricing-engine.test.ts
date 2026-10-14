/**
 * Phase 10E — CBOS Pricing Engine Unit Tests
 */

import { describe, it, expect } from "vitest";
import { PricingEngine } from "@/lib/cbos/pricing-engine";
import { PricingModel, PricingBasis } from "@/lib/cbos/types";
import { ValidationError } from "@/lib/errors";

describe("CBOS PricingEngine", () => {
  describe("Fixed Fee Model", () => {
    it("calculates exact fixed fee in integer cents", () => {
      const result = PricingEngine.calculateFee({
        pricingTerm: {
          pricingModel: PricingModel.FIXED_FEE,
          fixedAmountCents: 350000n, // $3,500.00
          currency: "USD",
        },
      });

      expect(result.grossFeeCents).toBe(350000n);
      expect(result.netPayableFeeCents).toBe(350000n);
      expect(result.currency).toBe("USD");
    });

    it("throws validation error for negative fixed amounts", () => {
      expect(() =>
        PricingEngine.calculateFee({
          pricingTerm: {
            pricingModel: PricingModel.FIXED_FEE,
            fixedAmountCents: -500n,
            currency: "USD",
          },
        })
      ).toThrow(ValidationError);
    });
  });

  describe("Percentage of Compensation Model", () => {
    it("calculates 15% placement fee on $180,000 base salary with zero floating point errors", () => {
      // 1500 basis points on $180,000.00 (18,000,000 cents) = $27,000.00 (2,700,000 cents)
      const result = PricingEngine.calculateFee({
        pricingTerm: {
          pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
          pricingBasis: PricingBasis.FIRST_YEAR_BASE_SALARY,
          percentageBasisPoints: 1500, // 15.00%
          currency: "USD",
        },
        candidateCompensationBasisCents: 18000000n, // $180,000.00
      });

      expect(result.grossFeeCents).toBe(2700000n); // $27,000.00
      expect(result.netPayableFeeCents).toBe(2700000n);
    });

    it("applies retainer credit offset against final placement fee", () => {
      // 20% on $200,000 = $40,000. Retainer paid = $5,000. Net = $35,000.
      const result = PricingEngine.calculateFee({
        pricingTerm: {
          pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
          percentageBasisPoints: 2000, // 20.00%
          retainerCreditOffset: true,
          currency: "USD",
        },
        candidateCompensationBasisCents: 20000000n, // $200,000.00
        priorRetainerPaidCents: 500000n, // $5,000.00
      });

      expect(result.grossFeeCents).toBe(4000000n); // $40,000.00
      expect(result.retainerCreditOffsetCents).toBe(500000n); // $5,000.00
      expect(result.netPayableFeeCents).toBe(3500000n); // $35,000.00
    });

    it("respects minimum fee clamp", () => {
      // 10% on $80,000 = $8,000, but minimum fee is $12,000.
      const result = PricingEngine.calculateFee({
        pricingTerm: {
          pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
          percentageBasisPoints: 1000, // 10.00%
          minimumFeeCents: 1200000n, // $12,000.00
          currency: "USD",
        },
        candidateCompensationBasisCents: 8000000n, // $80,000.00
      });

      expect(result.grossFeeCents).toBe(1200000n);
      expect(result.netPayableFeeCents).toBe(1200000n);
    });

    it("respects maximum fee cap", () => {
      // 20% on $350,000 = $70,000, but maximum fee is $50,000.
      const result = PricingEngine.calculateFee({
        pricingTerm: {
          pricingModel: PricingModel.PERCENTAGE_COMPENSATION,
          percentageBasisPoints: 2000, // 20.00%
          maximumFeeCents: 5000000n, // $50,000.00
          currency: "USD",
        },
        candidateCompensationBasisCents: 35000000n, // $350,000.00
      });

      expect(result.grossFeeCents).toBe(5000000n);
      expect(result.netPayableFeeCents).toBe(5000000n);
    });
  });

  describe("Formatting Helper", () => {
    it("formats minor units cleanly into currency strings", () => {
      expect(PricingEngine.formatCentsToCurrencyString(2700000n, "USD")).toBe("USD 27,000.00");
      expect(PricingEngine.formatCentsToCurrencyString(4550n, "USD")).toBe("USD 45.50");
      expect(PricingEngine.formatCentsToCurrencyString(0n, "EUR")).toBe("EUR 0.00");
    });
  });
});
