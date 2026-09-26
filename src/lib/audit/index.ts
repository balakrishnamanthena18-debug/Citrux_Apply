import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import { logger } from "@/lib/logger";
import { AuditAction, Prisma } from "@/generated/prisma";
import { sanitizeObject } from "@/lib/utils/sanitization";

export interface LogUserAuditParams {
  userId: string;
  organizationId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  tx?: Prisma.TransactionClient;
}

export interface LogSystemAuditParams {
  organizationId?: string;
  actorId?: string;
  actorType: "SYSTEM" | "ANONYMOUS";
  action: AuditAction;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Logs an audit event on behalf of an authenticated user inside the user's RLS transaction.
 * RLS enforces that actorId must equal current_user_id() and actorType must be 'USER'.
 * If an existing transaction client 'tx' is passed, it executes directly within that transaction
 * to prevent nested transactions and pool exhaustion.
 */
export async function logUserAuditEvent(params: LogUserAuditParams): Promise<void> {
  const sanitizedDetails = params.details ? sanitizeObject(params.details) : undefined;

  if (params.tx) {
    await params.tx.auditEvent.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.userId,
        actorType: "USER",
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: sanitizedDetails as any,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } else {
    await withRlsContext(params.userId, async (tx) => {
      await tx.auditEvent.create({
        data: {
          organizationId: params.organizationId,
          actorId: params.userId,
          actorType: "USER",
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          details: sanitizedDetails as any,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });
    });
  }

  logger.info(`[AUDIT:USER] ${params.action} on ${params.entityType}:${params.entityId ?? "N/A"} by ${params.userId}`, {
    auditAction: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    actorId: params.userId,
  });
}

/**
 * Logs a system-level or unauthenticated audit event (e.g. failed login, security alert)
 * via the secure stored function system_log_audit_event.
 */
export async function logSystemAuditEvent(params: LogSystemAuditParams): Promise<void> {
  const sanitizedDetails = params.details ? JSON.stringify(sanitizeObject(params.details)) : null;

  await prisma.$executeRaw`
    SELECT public.system_log_audit_event(
      ${params.organizationId ?? null}::uuid,
      ${params.actorId ?? null}::uuid,
      ${params.actorType},
      ${params.action}::public."AuditAction",
      ${params.entityType},
      ${params.entityId ?? null},
      ${sanitizedDetails}::jsonb,
      ${params.ipAddress ?? null},
      ${params.userAgent ?? null}
    )
  `;

  logger.info(`[AUDIT:SYSTEM] ${params.action} on ${params.entityType}:${params.entityId ?? "N/A"} by ${params.actorType}`, {
    auditAction: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    actorType: params.actorType,
  });
}
