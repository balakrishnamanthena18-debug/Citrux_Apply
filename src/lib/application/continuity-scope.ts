/**
 * Phase 5R — Active assignee scope-drift continuity visibility.
 *
 * Authorization uses Application assignment-time snapshot fields:
 *   assignedTeamKey / assignedManagerId
 * Never: "outside my current scope" alone, AuditEvent JSON, or client IDs.
 *
 * Priority: 5O inactive orphan > continuity > normal current scope.
 */

import type { Prisma } from "@/generated/prisma";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import {
  resolveManagerScope,
  resolveTeamLeadScope,
} from "@/lib/application/operations-scope";

const STAFF_ROLES = [Role.EMPLOYEE, Role.ADMIN] as const;

/** ACTIVE staff assignee predicate (excludes 5O orphans). */
function activeAssigneeFilter(
  organizationId: string
): Prisma.UserWhereInput {
  return {
    memberships: {
      some: {
        organizationId,
        status: "ACTIVE",
        role: { in: [...STAFF_ROLES] },
      },
    },
  };
}

/**
 * Team Lead continuity: snapshot team in TL keys AND owner ACTIVE AND
 * owner not in TL's current ACTIVE team member set.
 */
export function buildTeamLeadContinuityWhere(
  organizationId: string,
  teamKeys: string[],
  currentAssigneeUserIds: string[]
): Prisma.ApplicationWhereInput {
  if (teamKeys.length === 0) {
    return { organizationId, id: { in: [] } };
  }
  return {
    organizationId,
    assignedEmployeeId: { not: null, notIn: currentAssigneeUserIds },
    assignedTeamKey: { in: teamKeys },
    assignedEmployee: { is: activeAssigneeFilter(organizationId) },
  };
}

/**
 * Manager continuity: snapshot manager = viewer AND owner ACTIVE AND
 * owner not in Manager's current ACTIVE direct reports.
 */
export function buildManagerContinuityWhere(
  organizationId: string,
  managerUserId: string,
  currentReportUserIds: string[]
): Prisma.ApplicationWhereInput {
  return {
    organizationId,
    assignedEmployeeId: { not: null, notIn: currentReportUserIds },
    assignedManagerId: managerUserId,
    assignedEmployee: { is: activeAssigneeFilter(organizationId) },
  };
}

/**
 * Admin org-wide continuity: known snapshot + ACTIVE owner whose CURRENT
 * Membership team/manager differs from the assignment snapshot.
 * Uses bounded SQL (no get-all-then-filter).
 */
export async function countAdminContinuityApplications(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM applications a
    INNER JOIN memberships m
      ON m."userId" = a."assignedEmployeeId"
     AND m."organizationId" = a."organizationId"
     AND m.status = 'ACTIVE'
     AND m.role IN ('EMPLOYEE', 'ADMIN')
    WHERE a."organizationId" = ${organizationId}::uuid
      AND a."assignedEmployeeId" IS NOT NULL
      AND (
        a."assignedTeamKey" IS NOT NULL
        OR a."assignedManagerId" IS NOT NULL
      )
      AND (
        (a."assignedTeamKey" IS NOT NULL AND m.team IS DISTINCT FROM a."assignedTeamKey")
        OR (
          a."assignedManagerId" IS NOT NULL
          AND m.reporting_manager_id IS DISTINCT FROM a."assignedManagerId"
        )
      )
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function listAdminContinuityApplicationIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  args: { skip: number; take: number }
): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT a.id
    FROM applications a
    INNER JOIN memberships m
      ON m."userId" = a."assignedEmployeeId"
     AND m."organizationId" = a."organizationId"
     AND m.status = 'ACTIVE'
     AND m.role IN ('EMPLOYEE', 'ADMIN')
    WHERE a."organizationId" = ${organizationId}::uuid
      AND a."assignedEmployeeId" IS NOT NULL
      AND (
        a."assignedTeamKey" IS NOT NULL
        OR a."assignedManagerId" IS NOT NULL
      )
      AND (
        (a."assignedTeamKey" IS NOT NULL AND m.team IS DISTINCT FROM a."assignedTeamKey")
        OR (
          a."assignedManagerId" IS NOT NULL
          AND m.reporting_manager_id IS DISTINCT FROM a."assignedManagerId"
        )
      )
    ORDER BY a."updatedAt" DESC, a.id DESC
    OFFSET ${args.skip}
    LIMIT ${args.take}
  `;
  return rows.map((r) => r.id);
}

export type ContinuityVisibilityKind =
  | "NONE"
  | "ADMIN"
  | "TEAM_LEAD"
  | "MANAGER"
  | "BOTH";

export async function resolveContinuityVisibilityScope(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext
): Promise<{
  kind: ContinuityVisibilityKind;
  canViewContinuity: boolean;
  teamKeys: string[];
  /** Current ACTIVE team assignees (excluded from TL continuity). */
  currentTeamAssigneeIds: string[];
  currentReportIds: string[];
}> {
  if (ctx.role === Role.CANDIDATE) {
    return {
      kind: "NONE",
      canViewContinuity: false,
      teamKeys: [],
      currentTeamAssigneeIds: [],
      currentReportIds: [],
    };
  }
  if (ctx.role === Role.ADMIN) {
    return {
      kind: "ADMIN",
      canViewContinuity: true,
      teamKeys: [],
      currentTeamAssigneeIds: [],
      currentReportIds: [],
    };
  }

  const [teamScope, managerScope] = await Promise.all([
    resolveTeamLeadScope(tx, ctx),
    resolveManagerScope(tx, ctx),
  ]);

  let kind: ContinuityVisibilityKind = "NONE";
  if (teamScope.authorized && teamScope.teamKeys.length > 0) {
    kind = "TEAM_LEAD";
  }

  // Manager continuity identity is Application.assignedManagerId = viewer.
  // Do NOT require current directReports.length > 0 (Phase 5R fix).
  // Current report count still drives MANAGER queue + eligible targets (5M).
  let managerContinuity = managerScope.authorized;
  if (!managerContinuity && ctx.role === Role.EMPLOYEE) {
    const hit = await tx.application.findFirst({
      where: buildManagerContinuityWhere(
        ctx.organizationId,
        ctx.userId,
        managerScope.assigneeUserIds
      ),
      select: { id: true },
    });
    managerContinuity = Boolean(hit);
  }
  if (managerContinuity) {
    kind = kind === "TEAM_LEAD" ? "BOTH" : "MANAGER";
  }

  return {
    kind,
    canViewContinuity: kind !== "NONE",
    teamKeys: teamScope.teamKeys,
    currentTeamAssigneeIds: teamScope.assigneeUserIds,
    currentReportIds: managerScope.assigneeUserIds,
  };
}

/**
 * Prisma where for TL/Manager continuity queues (Admin uses raw helpers).
 */
export function buildContinuityQueueWhere(
  ctx: AuthenticatedContext,
  continuity: Awaited<ReturnType<typeof resolveContinuityVisibilityScope>>
): Prisma.ApplicationWhereInput | null {
  if (!continuity.canViewContinuity || continuity.kind === "ADMIN") {
    return null;
  }

  const parts: Prisma.ApplicationWhereInput[] = [];
  if (
    (continuity.kind === "TEAM_LEAD" || continuity.kind === "BOTH") &&
    continuity.teamKeys.length > 0
  ) {
    parts.push(
      buildTeamLeadContinuityWhere(
        ctx.organizationId,
        continuity.teamKeys,
        continuity.currentTeamAssigneeIds
      )
    );
  }
  if (continuity.kind === "MANAGER" || continuity.kind === "BOTH") {
    parts.push(
      buildManagerContinuityWhere(
        ctx.organizationId,
        ctx.userId,
        continuity.currentReportIds
      )
    );
  }
  if (parts.length === 0) {
    return { organizationId: ctx.organizationId, id: { in: [] } };
  }
  if (parts.length === 1) return parts[0]!;
  return { organizationId: ctx.organizationId, OR: parts };
}

/**
 * Subject-scope proof for 5M: may mutate Application because snapshot ties
 * it to this TL/Manager and owner is ACTIVE but outside current scope.
 *
 * Manager continuity uses Application.assignedManagerId = ctx.userId as the
 * structural proof — it does NOT require MANAGER actor kind from current
 * direct-report count (zero-report managers remain continuity-capable).
 * Target eligibility remains current 5M eligibleTargetUserIds only.
 */
export async function activeAssigneeContinuitySubjectAllowed(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext,
  application: {
    assignedEmployeeId: string | null;
    assignedTeamKey: string | null;
    assignedManagerId: string | null;
  },
  profile: { actorKinds: string[]; teamKeys: string[]; eligibleTargetUserIds: string[] }
): Promise<boolean> {
  if (ctx.role === Role.CANDIDATE) return false;
  if (!application.assignedEmployeeId) return false;
  if (profile.eligibleTargetUserIds.includes(application.assignedEmployeeId)) {
    // Still in current scope — normal path, not continuity exception.
    return false;
  }

  const active = await tx.membership.findFirst({
    where: {
      organizationId: ctx.organizationId,
      userId: application.assignedEmployeeId,
      status: "ACTIVE",
      role: { in: [...STAFF_ROLES] },
    },
    select: { id: true },
  });
  if (!active) return false; // inactive → 5O path, not continuity

  if (
    profile.actorKinds.includes("TEAM_LEAD") &&
    application.assignedTeamKey &&
    profile.teamKeys.includes(application.assignedTeamKey)
  ) {
    return true;
  }

  // Snapshot manager proof — independent of current report count / MANAGER kind.
  if (application.assignedManagerId === ctx.userId) {
    return true;
  }

  return false;
}
