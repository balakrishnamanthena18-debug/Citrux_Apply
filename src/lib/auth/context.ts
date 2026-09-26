import { createServerClient } from "@/lib/supabase/server";
import { withRlsContext } from "@/lib/db/rls";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { Role, UserStatus, MembershipStatus } from "@/generated/prisma";
import { Permission, hasPermission } from "@/lib/auth/permissions";

export interface AuthenticatedContext {
  userId: string;
  email: string;
  fullName?: string | null;
  organizationId: string;
  membershipId?: string;
  role: Role;
  status: UserStatus;
  membershipStatus: MembershipStatus;
}

export type AuthContext = AuthenticatedContext;

/**
 * Resolves the authenticated user session from Supabase SSR cookies and fetches
 * active organization membership strictly within a transaction-local RLS context.
 * 
 * Rejects deactivated users, suspended accounts, and inactive memberships immediately.
 */
export async function getAuthenticatedContext(): Promise<AuthenticatedContext> {
  // 1. Verify Supabase Session from secure HTTP-only cookies
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationError("User is not authenticated");
  }

  // 2. Query membership strictly through withRlsContext() to enforce database-level RLS
  const membership = await withRlsContext(user.id, async (tx) => {
    return tx.membership.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        organization: { status: "ACTIVE" },
      },
      include: {
        user: true,
        organization: true,
      },
    });
  });

  if (!membership) {
    throw new AuthorizationError(
      "Active organization membership not found or account is deactivated"
    );
  }

  return {
    userId: user.id,
    email: user.email!,
    fullName: [membership.user.firstName, membership.user.lastName].filter(Boolean).join(" ") || null,
    organizationId: membership.organizationId,
    membershipId: membership.id,
    role: membership.role,
    status: membership.user.status,
    membershipStatus: membership.status,
  };
}

export function requireRole(ctx: AuthenticatedContext, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(ctx.role)) {
    throw new AuthorizationError(
      `Access denied: requires one of [${allowedRoles.join(", ")}], user has [${ctx.role}]`
    );
  }
}

export function requireAdmin(ctx: AuthenticatedContext): void {
  requireRole(ctx, ["ADMIN"]);
}

export function requireEmployeeOrAdmin(ctx: AuthenticatedContext): void {
  requireRole(ctx, ["EMPLOYEE", "ADMIN"]);
}

export function requireCandidate(ctx: AuthenticatedContext): void {
  requireRole(ctx, ["CANDIDATE"]);
}

export function requirePermission(ctx: AuthenticatedContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new AuthorizationError(
      `Access denied: missing required permission [${permission}] for role [${ctx.role}]`
    );
  }
}
