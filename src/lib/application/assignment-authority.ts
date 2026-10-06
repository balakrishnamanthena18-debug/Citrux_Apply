/**
 * Phase 5M — Application assignment authorization.
 *
 * VISIBILITY SCOPE (5K) = MUTATION SCOPE (5M).
 * Structural authority only: Role.ADMIN, Membership.isTeamLead/teamLeadOf,
 * reportingManagerId. Never designation strings or client teamId/managerId.
 */

import type { Prisma } from "@/generated/prisma";
import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  resolveManagerScope,
  resolveTeamLeadScope,
} from "@/lib/application/operations-scope";
import {
  inactiveAssigneeInManagerFormerScope,
  inactiveAssigneeInTeamLeadFormerScope,
  isAssigneeInactiveInOrganization,
} from "@/lib/application/orphan-scope";
import { activeAssigneeContinuitySubjectAllowed } from "@/lib/application/continuity-scope";

export type AssignmentActorKind = "ADMIN" | "TEAM_LEAD" | "MANAGER" | "EMPLOYEE";

export interface AssignmentAuthorityProfile {
  actorKinds: AssignmentActorKind[];
  /** ACTIVE staff userIds the actor may assign TO (never includes null). */
  eligibleTargetUserIds: string[];
  /** Whether actor may set assignedEmployeeId = null. */
  canUnassign: boolean;
  teamKeys: string[];
  directReportCount: number;
}

export interface AssertCanAssignResult {
  applicationId: string;
  organizationId: string;
  previousAssignedEmployeeId: string | null;
  newAssignedEmployeeId: string | null;
  profile: AssignmentAuthorityProfile;
}

const STAFF_ROLES = [Role.EMPLOYEE, Role.ADMIN] as const;

/**
 * Resolve structural assignment powers for the authenticated actor.
 * Fail closed: empty targets / no unassign when scopes missing.
 */
export async function resolveAssignmentAuthority(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext
): Promise<AssignmentAuthorityProfile> {
  if (ctx.role === Role.CANDIDATE) {
    return {
      actorKinds: [],
      eligibleTargetUserIds: [],
      canUnassign: false,
      teamKeys: [],
      directReportCount: 0,
    };
  }

  if (ctx.role === Role.ADMIN) {
    const staff = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "ACTIVE",
        role: { in: [...STAFF_ROLES] },
      },
      select: { userId: true },
      take: 500,
      orderBy: { createdAt: "asc" },
    });
    return {
      actorKinds: ["ADMIN"],
      eligibleTargetUserIds: [...new Set(staff.map((s) => s.userId))],
      canUnassign: true,
      teamKeys: [],
      directReportCount: 0,
    };
  }

  // EMPLOYEE (may also hold structural TL / Manager authority)
  const [teamScope, managerScope] = await Promise.all([
    resolveTeamLeadScope(tx, ctx),
    resolveManagerScope(tx, ctx),
  ]);

  const kinds: AssignmentActorKind[] = ["EMPLOYEE"];
  const targets = new Set<string>([ctx.userId]);

  if (teamScope.authorized) {
    kinds.push("TEAM_LEAD");
    for (const id of teamScope.assigneeUserIds) targets.add(id);
  }
  if (managerScope.authorized) {
    kinds.push("MANAGER");
    for (const id of managerScope.assigneeUserIds) targets.add(id);
  }

  const elevated = kinds.includes("TEAM_LEAD") || kinds.includes("MANAGER");

  return {
    actorKinds: kinds,
    eligibleTargetUserIds: [...targets],
    canUnassign: elevated,
    teamKeys: teamScope.teamKeys,
    directReportCount: managerScope.directReportCount,
  };
}

/**
 * Phase 5M active-owner scope + Phase 5O inactive former-scope + Phase 5R
 * active continuity subject (assignment-time snapshot). Never client team/manager IDs.
 */
async function applicationInStructuralScope(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext,
  application: {
    assignedEmployeeId: string | null;
    assignedTeamKey: string | null;
    assignedManagerId: string | null;
  },
  profile: AssignmentAuthorityProfile
): Promise<boolean> {
  if (profile.actorKinds.includes("ADMIN")) return true;

  const assignedEmployeeId = application.assignedEmployeeId;

  // Unassigned Applications may be claimed/assigned by authorized actors.
  if (assignedEmployeeId == null) return true;

  const elevated =
    profile.actorKinds.includes("TEAM_LEAD") ||
    profile.actorKinds.includes("MANAGER");

  if (elevated) {
    // Active owners in current eligible set.
    if (profile.eligibleTargetUserIds.includes(assignedEmployeeId)) {
      return true;
    }

    // Phase 5O — inactive assignee orphan recovery (manual only).
    const inactive = await isAssigneeInactiveInOrganization(
      tx,
      ctx.organizationId,
      assignedEmployeeId
    );
    if (inactive) {
      if (
        profile.actorKinds.includes("TEAM_LEAD") &&
        profile.teamKeys.length > 0 &&
        (await inactiveAssigneeInTeamLeadFormerScope(
          tx,
          ctx.organizationId,
          assignedEmployeeId,
          profile.teamKeys
        ))
      ) {
        return true;
      }

      if (
        profile.actorKinds.includes("MANAGER") &&
        (await inactiveAssigneeInManagerFormerScope(
          tx,
          ctx.organizationId,
          assignedEmployeeId,
          ctx.userId
        ))
      ) {
        return true;
      }

      return false;
    }
  } else if (profile.eligibleTargetUserIds.includes(assignedEmployeeId)) {
    // Base employee current ownership (self).
    return true;
  }

  // Phase 5R — ACTIVE owner continuity subject via assignment-time snapshot.
  // Runs even when Manager has zero current reports (no MANAGER actor kind):
  // proof is Application.assignedManagerId / assignedTeamKey, not report count.
  // Target eligibility remains enforced by assertCanAssignApplication separately.
  if (
    await activeAssigneeContinuitySubjectAllowed(tx, ctx, application, profile)
  ) {
    return true;
  }

  if (elevated) return false;

  // Base employee: only own Applications or unassigned (handled above).
  // Peer orphan / continuity recovery explicitly denied absent snapshot proof.
  return assignedEmployeeId === ctx.userId;
}

/**
 * Authoritative assignment gate. Throws AuthorizationError / NotFoundError /
 * ValidationError. Never trusts client teamId/managerId/organizationId.
 */
export async function assertCanAssignApplication(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext,
  args: {
    applicationId: string;
    /** null = unassign */
    targetEmployeeId: string | null;
  }
): Promise<AssertCanAssignResult> {
  if (ctx.role === Role.CANDIDATE) {
    throw new AuthorizationError("Candidates do not have assignment authority.");
  }
  if (ctx.role !== Role.EMPLOYEE && ctx.role !== Role.ADMIN) {
    throw new AuthorizationError("Assignment requires staff authority.");
  }

  const application = await tx.application.findUnique({
    where: {
      id: args.applicationId,
      organizationId: ctx.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      assignedEmployeeId: true,
      assignedTeamKey: true,
      assignedManagerId: true,
    },
  });

  if (!application) {
    throw new NotFoundError("Application not found in organization");
  }

  const profile = await resolveAssignmentAuthority(tx, ctx);

  if (!(await applicationInStructuralScope(tx, ctx, application, profile))) {
    throw new AuthorizationError(
      "You are not authorized to change assignment for this Application."
    );
  }

  const targetId = args.targetEmployeeId;

  if (targetId === null) {
    if (!profile.canUnassign) {
      throw new AuthorizationError(
        "You are not authorized to unassign this Application."
      );
    }
    return {
      applicationId: application.id,
      organizationId: application.organizationId,
      previousAssignedEmployeeId: application.assignedEmployeeId,
      newAssignedEmployeeId: null,
      profile,
    };
  }

  if (!profile.eligibleTargetUserIds.includes(targetId)) {
    throw new AuthorizationError(
      "Target employee is outside your assignment authority."
    );
  }

  // Defense in depth: re-validate ACTIVE staff in-org (forged / stale lists).
  const targetMembership = await tx.membership.findFirst({
    where: {
      userId: targetId,
      organizationId: ctx.organizationId,
      role: { in: [...STAFF_ROLES] },
      status: "ACTIVE",
    },
    select: { userId: true },
  });

  if (!targetMembership) {
    throw new ValidationError(
      "Target user is not an active staff member in this organization"
    );
  }

  return {
    applicationId: application.id,
    organizationId: application.organizationId,
    previousAssignedEmployeeId: application.assignedEmployeeId,
    newAssignedEmployeeId: targetId,
    profile,
  };
}

export interface EligibleAssigneeOption {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: Role;
}

/**
 * Bounded eligible assignee list for UI. Server-enforced; never org-wide dump
 * for non-Admin.
 */
export async function listEligibleAssignees(
  tx: Prisma.TransactionClient,
  ctx: AuthenticatedContext
): Promise<{
  profile: AssignmentAuthorityProfile;
  options: EligibleAssigneeOption[];
  allowUnassigned: boolean;
}> {
  const profile = await resolveAssignmentAuthority(tx, ctx);

  if (profile.eligibleTargetUserIds.length === 0) {
    return { profile, options: [], allowUnassigned: profile.canUnassign };
  }

  const memberships = await tx.membership.findMany({
    where: {
      organizationId: ctx.organizationId,
      userId: { in: profile.eligibleTargetUserIds },
      status: "ACTIVE",
      role: { in: [...STAFF_ROLES] },
    },
    select: {
      userId: true,
      role: true,
      user: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    take: 500,
    orderBy: { createdAt: "asc" },
  });

  const options: EligibleAssigneeOption[] = memberships.map((m) => ({
    userId: m.userId,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    role: m.role,
  }));

  options.sort((a, b) => {
    const nameA = `${a.lastName || ""} ${a.firstName || ""}`.trim() || a.email;
    const nameB = `${b.lastName || ""} ${b.firstName || ""}`.trim() || b.email;
    return nameA.localeCompare(nameB);
  });

  return {
    profile,
    options,
    allowUnassigned: profile.canUnassign,
  };
}
