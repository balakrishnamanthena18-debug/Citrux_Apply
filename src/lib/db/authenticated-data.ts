import type { Prisma } from "@/generated/prisma";
import {
  getAuthenticatedUser,
  loadMembershipContext,
  peekAuthenticatedContext,
  seedAuthenticatedContext,
  type AuthenticatedContext,
} from "@/lib/auth/context";
import { withRlsContext, type WithRlsOptions } from "@/lib/db/rls";

/**
 * Runs page data under a single RLS interactive transaction that also resolves
 * membership when not already seeded for this request.
 *
 * Soft navigations that only re-fetch the page segment typically pay:
 *   getUser() + one RLS txn (membership + page queries)
 *
 * Full document loads where the layout already called getAuthenticatedContext()
 * pay membership once in the layout txn; this helper then opens one data txn
 * and reuses the seeded membership (no second membership query).
 *
 * Security: Supabase Auth getUser(), FORCE RLS via set_config, and org-scoped
 * membership checks are preserved. No service-role bypass.
 */
export async function withAuthenticatedData<T>(
  fn: (tx: Prisma.TransactionClient, ctx: AuthenticatedContext) => Promise<T>,
  options?: WithRlsOptions
): Promise<{ ctx: AuthenticatedContext; data: T }> {
  const user = await getAuthenticatedUser();

  const result = await withRlsContext(
    user.id,
    async (tx) => {
      let ctx = peekAuthenticatedContext();
      if (!ctx) {
        ctx = await loadMembershipContext(tx, user);
        seedAuthenticatedContext(ctx);
      }

      const data = await fn(tx, ctx);
      return { ctx, data };
    },
    options
  );

  return result;
}
