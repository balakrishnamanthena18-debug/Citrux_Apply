/**
 * Phase 5R — Application assignment-time structural snapshot.
 *
 * Captures Membership.team + reportingManagerId at assign/create time.
 * Authoritative for continuity proof only — never for current scope.
 * Server-derived only; never from client teamId/managerId.
 */

import type { Prisma } from "@/generated/prisma";
import { Role } from "@/generated/prisma";
import { ValidationError } from "@/lib/errors";

const STAFF_ROLES = [Role.EMPLOYEE, Role.ADMIN] as const;

export type AssignmentWriteData = {
  assignedEmployeeId: string | null;
  assignedTeamKey: string | null;
  assignedManagerId: string | null;
};

function normalizeTeamKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Unassign: clear owner and structural snapshot together. */
export function clearAssignmentSnapshot(): AssignmentWriteData {
  return {
    assignedEmployeeId: null,
    assignedTeamKey: null,
    assignedManagerId: null,
  };
}

/**
 * Resolve target employee's CURRENT Membership structural context.
 * Throws if target is not ACTIVE staff in org (defense in depth).
 */
export async function resolveAssignmentSnapshotForEmployee(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeUserId: string
): Promise<{ assignedTeamKey: string | null; assignedManagerId: string | null }> {
  const membership = await tx.membership.findFirst({
    where: {
      organizationId,
      userId: employeeUserId,
      status: "ACTIVE",
      role: { in: [...STAFF_ROLES] },
    },
    select: {
      team: true,
      reportingManagerId: true,
    },
  });

  if (!membership) {
    throw new ValidationError(
      "Target user is not an active staff member in this organization"
    );
  }

  return {
    assignedTeamKey: normalizeTeamKey(membership.team),
    assignedManagerId: membership.reportingManagerId ?? null,
  };
}

/**
 * Atomic owner + snapshot write payload for assign / unassign / create.
 */
export async function buildAssignmentWriteData(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeUserId: string | null
): Promise<AssignmentWriteData> {
  if (employeeUserId === null) {
    return clearAssignmentSnapshot();
  }
  const snap = await resolveAssignmentSnapshotForEmployee(
    tx,
    organizationId,
    employeeUserId
  );
  return {
    assignedEmployeeId: employeeUserId,
    assignedTeamKey: snap.assignedTeamKey,
    assignedManagerId: snap.assignedManagerId,
  };
}

/** True when at least one snapshot field is known (not legacy SNAPSHOT_UNKNOWN). */
export function hasKnownAssignmentSnapshot(app: {
  assignedTeamKey: string | null;
  assignedManagerId: string | null;
}): boolean {
  return Boolean(app.assignedTeamKey) || Boolean(app.assignedManagerId);
}
