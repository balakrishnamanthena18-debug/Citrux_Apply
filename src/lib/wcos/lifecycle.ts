/**
 * Phase 10H-D — WCOS Lifecycle Rules & Validation Engine
 * Governs state transitions for work items, capacity reservations, SLA pause accounting, and escalations.
 */

import {
  WcosReservationStatus,
  WcosEscalationLevel,
  WcosBlockingCategory,
  TaskStatus,
  WCOS_CAPACITY_CONSTANTS,
} from "./types";
import { InvalidStateTransitionError, ValidationError } from "@/lib/errors";

export class WcosLifecycle {
  /**
   * Validates reservation status transitions.
   */
  static validateReservationTransition(
    currentStatus: WcosReservationStatus,
    targetStatus: WcosReservationStatus
  ): void {
    const validTransitions: Record<WcosReservationStatus, WcosReservationStatus[]> = {
      RESERVED: [WcosReservationStatus.CONSUMED, WcosReservationStatus.RELEASED, WcosReservationStatus.CANCELLED],
      CONSUMED: [WcosReservationStatus.RELEASED, WcosReservationStatus.CANCELLED],
      RELEASED: [], // Terminal
      CANCELLED: [], // Terminal
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new InvalidStateTransitionError(
        `Invalid reservation transition from ${currentStatus} to ${targetStatus}.`
      );
    }
  }

  /**
   * Validates blocking category against allowed external categories.
   */
  static validateBlockingCategory(category: string): WcosBlockingCategory {
    const validCategories = Object.values(WcosBlockingCategory);
    if (!validCategories.includes(category as WcosBlockingCategory)) {
      throw new ValidationError(
        `Invalid blocking category '${category}'. Allowed categories: ${validCategories.join(", ")}.`
      );
    }
    return category as WcosBlockingCategory;
  }

  /**
   * Calculates SLA paused duration adhering to the strict 14-day ceiling.
   */
  static calculateSlaPause(
    blockedAt: Date,
    unblockedAt: Date,
    currentPausedDurationMs: bigint | number
  ): { elapsedMs: number; totalPausedDurationMs: bigint } {
    const elapsedMs = Math.max(0, unblockedAt.getTime() - blockedAt.getTime());
    const currentMs = Number(currentPausedDurationMs);
    const maxCeilingMs = WCOS_CAPACITY_CONSTANTS.MAX_SLA_PAUSE_DURATION_MS;

    // Hard 14-day ceiling enforcement
    const totalPausedMs = Math.min(maxCeilingMs, currentMs + elapsedMs);

    return {
      elapsedMs,
      totalPausedDurationMs: BigInt(totalPausedMs),
    };
  }

  /**
   * Evaluates SLA status based on current time and paused duration.
   */
  static evaluateSlaStatus(
    slaTargetAt: Date,
    slaWarningAt: Date,
    pausedDurationMs: bigint | number,
    now: Date = new Date()
  ): { isWarning: boolean; isBreached: boolean; remainingMs: number } {
    const totalPaused = Number(pausedDurationMs);
    const adjustedTargetTime = slaTargetAt.getTime() + totalPaused;
    const adjustedWarningTime = slaWarningAt.getTime() + totalPaused;

    const remainingMs = adjustedTargetTime - now.getTime();
    const isBreached = now.getTime() >= adjustedTargetTime;
    const isWarning = !isBreached && now.getTime() >= adjustedWarningTime;

    return {
      isWarning,
      isBreached,
      remainingMs,
    };
  }

  /**
   * Maps numeric escalation level to WcosEscalationLevel enum.
   */
  static mapEscalationLevel(level: number): WcosEscalationLevel {
    switch (level) {
      case 1:
        return WcosEscalationLevel.LEVEL_1_WARNING;
      case 2:
        return WcosEscalationLevel.LEVEL_2_AT_RISK;
      case 3:
        return WcosEscalationLevel.LEVEL_3_BREACHED;
      case 4:
        return WcosEscalationLevel.LEVEL_4_MANAGEMENT;
      default:
        throw new ValidationError(`Invalid escalation level numeric value: ${level}`);
    }
  }
}
