/**
 * Phase 5K — structural Team Lead / Manager Application visibility scopes.
 *
 * Team Lead: Membership.isTeamLead / Membership.teamLeadOf (NOT designation strings).
 * Manager: Membership.reportingManagerId direct reports.
 *
 * Fail closed: no authorized keys/reports → empty assignee set → empty query results.
 * Client-supplied teamId / managerId / employeeId must never be accepted here.
 */

import type { Prisma } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { Role } from "@/generated/prisma";

export interface TeamLeadScope {
  /** True when structural TL authority and at least one team key exist. */
  authorized: boolean;
  teamKeys: string[];
  /** Active org member userIds on those teams (may be empty → empty apps). */
  assigneeUserIds: string[];
}

export interface ManagerScope {
  /**
   * True when the actor currently has ≥1 ACTIVE direct report.
   * Drives MANAGER / Direct Reports queue and 5M eligible targets.
   * Continuity visibility uses Application.assignedManagerId separately
   * and must not require this flag (Phase 5R zero-reports fix).
   */
  authorized: boolean;
  directReportCount: number;
  assigneeUserIds: string[];
}

function normalizeTeamKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Derive Team Lead authorized team keys from the caller's Membership only.
 */
export async function resolveTeamLeadScope(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext
): Promise<TeamLeadScope> {
  if (ctx.role === Role.CANDIDATE) {
    return { authorized: false, teamKeys: [], assigneeUserIds: [] };
  }

  const membership = await tx.membership.findFirst({
    where: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      status: "ACTIVE",
    },
    select: {
      isTeamLead: true,
      teamLeadOf: true,
      team: true,
    },
  });

  if (!membership) {
    return { authorized: false, teamKeys: [], assigneeUserIds: [] };
  }

  const structuralLead =
    membership.isTeamLead === true || Boolean(normalizeTeamKey(membership.teamLeadOf));

  if (!structuralLead) {
    return { authorized: false, teamKeys: [], assigneeUserIds: [] };
  }

  const keys = new Set<string>();
  const leadOf = normalizeTeamKey(membership.teamLeadOf);
  const ownTeam = normalizeTeamKey(membership.team);
  if (leadOf) keys.add(leadOf);
  // Admin UI defaults teamLeadOf from team when enabling TL; accept own team when isTeamLead.
  if (membership.isTeamLead && ownTeam) keys.add(ownTeam);

  const teamKeys = [...keys];
  if (teamKeys.length === 0) {
    return { authorized: false, teamKeys: [], assigneeUserIds: [] };
  }

  const members = await tx.membership.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: "ACTIVE",
      role: { in: [Role.EMPLOYEE, Role.ADMIN] },
      OR: [{ team: { in: teamKeys } }, { teamLeadOf: { in: teamKeys } }],
    },
    select: { userId: true },
    take: 500,
  });

  const assigneeUserIds = [...new Set(members.map((m) => m.userId))];
  return {
    authorized: true,
    teamKeys,
    assigneeUserIds,
  };
}

/**
 * Derive Manager scope: Applications assigned to ACTIVE direct reports.
 */
export async function resolveManagerScope(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext
): Promise<ManagerScope> {
  if (ctx.role === Role.CANDIDATE) {
    return { authorized: false, directReportCount: 0, assigneeUserIds: [] };
  }

  const reports = await tx.membership.findMany({
    where: {
      organizationId: ctx.organizationId,
      reportingManagerId: ctx.userId,
      status: "ACTIVE",
      role: { in: [Role.EMPLOYEE, Role.ADMIN] },
    },
    select: { userId: true },
    take: 500,
  });

  const assigneeUserIds = [...new Set(reports.map((r) => r.userId))];
  return {
    authorized: assigneeUserIds.length > 0,
    directReportCount: assigneeUserIds.length,
    assigneeUserIds,
  };
}
