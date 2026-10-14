/**
 * Phase 10E — CBOS Transactional Outbox & Event Dispatcher
 * Manages decoupled, idempotent event delivery from operational domains (OPOS) to CBOS.
 */

import { prisma } from "@/lib/db/prisma";
import { CbosRepository } from "./cbos-repository";
import { CbosService } from "./cbos-service";
import type { OposPlacementVerifiedEventPayload } from "./types";
import { logUserAuditEvent } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma";

export class CbosOutbox {
  /**
   * Enqueues an event into the transactional outbox table.
   */
  static async enqueueEvent(
    organizationId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string
  ) {
    try {
      return await CbosRepository.createOutboxEvent({
        organizationId,
        eventType,
        aggregateType,
        aggregateId,
        payload: payload as object,
        idempotencyKey,
        status: "PENDING",
        attemptCount: 0,
        availableAt: new Date(),
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "P2002") {
        const existing = await prisma.cbosOutboxEvent.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  /**
   * Polls and processes pending outbox events idempotently.
   */
  static async processPendingEvents(batchSize: number = 20): Promise<{ processedCount: number; errorsCount: number }> {
    const pending = await CbosRepository.findPendingOutboxEvents(batchSize);
    let processedCount = 0;
    let errorsCount = 0;

    for (const event of pending) {
      try {
        await CbosRepository.updateOutboxEvent(event.id, {
          status: "PROCESSING",
          attemptCount: { increment: 1 },
        });

        if (event.eventType === "OPOS_PLACEMENT_VERIFIED_EVENT") {
          const payload = event.payload as unknown as OposPlacementVerifiedEventPayload;
          const result = await CbosService.processPlacementVerifiedEvent(payload);

          await CbosRepository.updateOutboxEvent(event.id, {
            status: "COMPLETED",
            processedAt: new Date(),
            lastError: result.reason,
          });

          await logUserAuditEvent({
            userId: payload.verifiedByStaffId,
            organizationId: event.organizationId,
            action: AuditAction.COMMERCIAL_OUTBOX_EVENT_PROCESSED,
            entityType: "CbosOutboxEvent",
            entityId: event.id,
            details: {
              eventType: event.eventType,
              eligible: result.eligible,
              reason: result.reason,
            },
          });

          processedCount++;
        } else {
          // Unhandled event type marked completed
          await CbosRepository.updateOutboxEvent(event.id, {
            status: "COMPLETED",
            processedAt: new Date(),
            lastError: `Ignored unhandled event type: ${event.eventType}`,
          });
          processedCount++;
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await CbosRepository.updateOutboxEvent(event.id, {
          status: event.attemptCount >= 5 ? "FAILED" : "PENDING",
          lastError: errorMsg,
          availableAt: new Date(Date.now() + Math.min(60000 * Math.pow(2, event.attemptCount), 3600000)),
        });
        errorsCount++;
      }
    }

    return { processedCount, errorsCount };
  }
}
