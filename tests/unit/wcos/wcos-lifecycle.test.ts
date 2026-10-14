import { describe, it, expect } from "vitest";
import { WcosLifecycle } from "@/lib/wcos/lifecycle";
import {
  WcosReservationStatus,
  WcosEscalationLevel,
  WcosBlockingCategory,
  WCOS_CAPACITY_CONSTANTS,
} from "@/lib/wcos/types";
import { InvalidStateTransitionError, ValidationError } from "@/lib/errors";

describe("Phase 10H-D — WCOS Lifecycle Rules Unit Tests", () => {
  it("validates reservation transitions according to state machine", () => {
    // Valid transitions
    expect(() =>
      WcosLifecycle.validateReservationTransition(
        WcosReservationStatus.RESERVED,
        WcosReservationStatus.CONSUMED
      )
    ).not.toThrow();

    expect(() =>
      WcosLifecycle.validateReservationTransition(
        WcosReservationStatus.CONSUMED,
        WcosReservationStatus.RELEASED
      )
    ).not.toThrow();

    // Invalid terminal transition
    expect(() =>
      WcosLifecycle.validateReservationTransition(
        WcosReservationStatus.RELEASED,
        WcosReservationStatus.CONSUMED
      )
    ).toThrow(InvalidStateTransitionError);
  });

  it("validates structured external blocking categories", () => {
    expect(
      WcosLifecycle.validateBlockingCategory("WAIT_CANDIDATE_INPUT")
    ).toBe(WcosBlockingCategory.WAIT_CANDIDATE_INPUT);

    expect(
      WcosLifecycle.validateBlockingCategory("WAIT_DOCUMENT_UPLOAD")
    ).toBe(WcosBlockingCategory.WAIT_DOCUMENT_UPLOAD);

    expect(
      WcosLifecycle.validateBlockingCategory("WAIT_EMPLOYER_FEEDBACK")
    ).toBe(WcosBlockingCategory.WAIT_EMPLOYER_FEEDBACK);

    expect(() =>
      WcosLifecycle.validateBlockingCategory("UNAUTHORIZED_FREE_TEXT_BLOCK")
    ).toThrow(ValidationError);
  });

  it("enforces strict 14-day ceiling on SLA pause duration", () => {
    const blockedAt = new Date("2026-01-01T00:00:00Z");
    const unblockedAt = new Date("2026-01-20T00:00:00Z"); // 19 days later

    const { elapsedMs, totalPausedDurationMs } = WcosLifecycle.calculateSlaPause(
      blockedAt,
      unblockedAt,
      0
    );

    expect(elapsedMs).toBe(19 * 24 * 60 * 60 * 1000);
    // Hard ceiling is 14 days
    expect(Number(totalPausedDurationMs)).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("evaluates SLA status (warning, breach, and remaining time)", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const slaTargetAt = new Date("2026-01-01T13:00:00Z"); // In 1 hour
    const slaWarningAt = new Date("2026-01-01T11:00:00Z"); // 1 hour ago (in warning window)

    const status = WcosLifecycle.evaluateSlaStatus(
      slaTargetAt,
      slaWarningAt,
      0,
      now
    );

    expect(status.isWarning).toBe(true);
    expect(status.isBreached).toBe(false);
    expect(status.remainingMs).toBe(3600000);
  });

  it("correctly maps numeric escalation levels", () => {
    expect(WcosLifecycle.mapEscalationLevel(1)).toBe(WcosEscalationLevel.LEVEL_1_WARNING);
    expect(WcosLifecycle.mapEscalationLevel(2)).toBe(WcosEscalationLevel.LEVEL_2_AT_RISK);
    expect(WcosLifecycle.mapEscalationLevel(3)).toBe(WcosEscalationLevel.LEVEL_3_BREACHED);
    expect(WcosLifecycle.mapEscalationLevel(4)).toBe(WcosEscalationLevel.LEVEL_4_MANAGEMENT);
    expect(() => WcosLifecycle.mapEscalationLevel(5)).toThrow(ValidationError);
  });
});
