import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { withRlsContext } from "@/lib/db/rls";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { Role, UserStatus, MembershipStatus, type Prisma } from "@/generated/prisma";
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

/** Per-request store so membership resolved inside a data txn can seed later readers. */
const authContextStore = cache((): { current?: AuthenticatedContext } => ({}));

/** Cached Supabase Auth getUser() — never skipped; always verifies the session. */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationError("User is not authenticated");
  }

  return user;
});

export async function loadMembershipContext(
  tx: Prisma.TransactionClient,
  user: { id: string; email?: string | null }
): Promise<AuthenticatedContext> {
  const membership = await tx.membership.findFirst({
    where: {
      userId: user.id,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      organization: { status: "ACTIVE" },
    },
    select: {
      id: true,
      organizationId: true,
      role: true,
      status: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    },
  });

  if (!membership) {
    throw new AuthorizationError(
      "Active organization membership not found or account is deactivated"
    );
  }

  return {
    userId: user.id,
    email: user.email!,
    fullName:
      [membership.user.firstName, membership.user.lastName].filter(Boolean).join(" ") || null,
    organizationId: membership.organizationId,
    membershipId: membership.id,
    role: membership.role,
    status: membership.user.status,
    membershipStatus: membership.status,
  };
}

/**
 * Resolves the authenticated user session from Supabase SSR cookies and fetches
 * active organization membership strictly within a transaction-local RLS context.
 *
 * Wrapped in React cache() to deduplicate calls across Server Components, Layout, and Pages.
 * When membership was already resolved inside withAuthenticatedData's data transaction,
 * this returns the seeded context without opening a second RLS transaction.
 */
export const getAuthenticatedContext = cache(async (): Promise<AuthenticatedContext> => {
  const store = authContextStore();
  if (store.current) {
    return store.current;
  }

  const user = await getAuthenticatedUser();

  const ctx = await withRlsContext(user.id, async (tx) => {
    return loadMembershipContext(tx, user);
  });

  store.current = ctx;
  return ctx;
});

/** Seed request-scoped auth after membership was loaded inside another RLS txn. */
export function seedAuthenticatedContext(ctx: AuthenticatedContext): void {
  authContextStore().current = ctx;
}

/** Read seeded auth without opening a database transaction. */
export function peekAuthenticatedContext(): AuthenticatedContext | null {
  return authContextStore().current ?? null;
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
