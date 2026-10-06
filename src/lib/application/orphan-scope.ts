/**
 * Phase 5O — Inactive assignee orphan detection & structural former-scope proofs.
 *
 * Authoritative relationship for "was on my team / was my report":
 * Membership row retained after DEACTIVATED (team, teamLeadOf, reportingManagerId).
 * No historical assignment table. Fail closed if Membership missing.
 */

import type { Prisma } from "@/generated/prisma";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import {
  resolveManagerScope,
  resolveTeamLeadScope,
} from "@/lib/application/operations-scope";

const STAFF_ROLES = [Role.EMPLOYEE, Role.ADMIN] as const;

/** Derived condition: assigned + no ACTIVE staff Membership in Application org. */
export function buildInactiveAssigneeOrphanWhere(
  organizationId: string
): Prisma.ApplicationWhereInput {
  return {
    organizationId,
    assignedEmployeeId: { not: null },
    assignedEmployee: {
      is: {
        memberships: {
          none: {
            organizationId,
            status: "ACTIVE",
            role: { in: [...STAFF_ROLES] },
          },
        },
      },
    },
  };
}

/**
 * UserIds of staff whose Membership in this org is not ACTIVE and whose
 * team/teamLeadOf matches Team Lead keys (includes DEACTIVATED former members).
 */
export async function resolveFormerTeamMemberUserIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  teamKeys: string[]
): Promise<string[]> {
  if (teamKeys.length === 0) return [];
  const rows = await tx.membership.findMany({
    where: {
      organizationId,
      role: { in: [...STAFF_ROLES] },
      status: { not: "ACTIVE" },
      OR: [{ team: { in: teamKeys } }, { teamLeadOf: { in: teamKeys } }],
    },
    select: { userId: true },
    take: 500,
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * UserIds of staff who still have Membership with reportingManagerId = manager
 * but are not ACTIVE (former direct reports).
 */
export async function resolveFormerDirectReportUserIds(
  tx: Prisma.TransactionClient,
  organizationId: string,
  managerUserId: string
): Promise<string[]> {
  const rows = await tx.membership.findMany({
    where: {
      organizationId,
      reportingManagerId: managerUserId,
      role: { in: [...STAFF_ROLES] },
      status: { not: "ACTIVE" },
    },
    select: { userId: true },
    take: 500,
  });
  return [...new Set(rows.map((r) => r.userId))];
}

export async function isAssigneeInactiveInOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assigneeUserId: string
): Promise<boolean> {
  const active = await tx.membership.findFirst({
    where: {
      organizationId,
      userId: assigneeUserId,
      status: "ACTIVE",
      role: { in: [...STAFF_ROLES] },
    },
    select: { id: true },
  });
  return !active;
}

/**
 * Prove inactive assignee was in TL structural team via retained Membership fields.
 */
export async function inactiveAssigneeInTeamLeadFormerScope(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assigneeUserId: string,
  teamKeys: string[]
): Promise<boolean> {
  if (teamKeys.length === 0) return false;
  const m = await tx.membership.findFirst({
    where: {
      organizationId,
      userId: assigneeUserId,
      role: { in: [...STAFF_ROLES] },
      status: { not: "ACTIVE" },
      OR: [{ team: { in: teamKeys } }, { teamLeadOf: { in: teamKeys } }],
    },
    select: { id: true },
  });
  return Boolean(m);
}

/**
 * Prove inactive assignee was a direct report via retained reportingManagerId.
 */
export async function inactiveAssigneeInManagerFormerScope(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assigneeUserId: string,
  managerUserId: string
): Promise<boolean> {
  const m = await tx.membership.findFirst({
    where: {
      organizationId,
      userId: assigneeUserId,
      role: { in: [...STAFF_ROLES] },
      status: { not: "ACTIVE" },
      reportingManagerId: managerUserId,
    },
    select: { id: true },
  });
  return Boolean(m);
}

export type OrphanVisibilityKind = "NONE" | "ADMIN" | "TEAM_LEAD" | "MANAGER" | "BOTH";

/**
 * Resolve which orphan Applications the actor may list (server-derived).
 */
export async function resolveOrphanVisibilityScope(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext
): Promise<{
  kind: OrphanVisibilityKind;
  /** When non-null, restrict orphans to these inactive assignee userIds. */
  inactiveAssigneeUserIds: string[] | null;
  canViewOrphans: boolean;
}> {
  if (ctx.role === Role.CANDIDATE) {
    return { kind: "NONE", inactiveAssigneeUserIds: [], canViewOrphans: false };
  }
  if (ctx.role === Role.ADMIN) {
    return { kind: "ADMIN", inactiveAssigneeUserIds: null, canViewOrphans: true };
  }

  const [teamScope, managerScope] = await Promise.all([
    resolveTeamLeadScope(tx, ctx),
    resolveManagerScope(tx, ctx),
  ]);

  const ids = new Set<string>();
  let kind: OrphanVisibilityKind = "NONE";

  if (teamScope.authorized && teamScope.teamKeys.length > 0) {
    const former = await resolveFormerTeamMemberUserIds(
      tx,
      ctx.organizationId,
      teamScope.teamKeys
    );
    for (const id of former) ids.add(id);
    kind = "TEAM_LEAD";
  }

  if (managerScope.authorized) {
    const former = await resolveFormerDirectReportUserIds(
      tx,
      ctx.organizationId,
      ctx.userId
    );
    for (const id of former) ids.add(id);
    kind = kind === "TEAM_LEAD" ? "BOTH" : "MANAGER";
  }

  if (ids.size === 0 && kind === "NONE") {
    return { kind: "NONE", inactiveAssigneeUserIds: [], canViewOrphans: false };
  }

  // TL/Manager authorized structurally but no former inactive members yet → empty orphan list (not fail-open).
  return {
    kind,
    inactiveAssigneeUserIds: [...ids],
    canViewOrphans: kind !== "NONE",
  };
}
