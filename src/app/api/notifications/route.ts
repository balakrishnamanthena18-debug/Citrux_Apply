import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { withRlsContext } from "@/lib/db/rls";
import {
  verifyAbuseProtection,
  createAbuseProtectionResponse,
} from "@/lib/security/abuse-protection";
import { sanitizePaginationLimit } from "@/lib/utils/sanitization";

/**
 * Notification list for the AppShell bell.
 *
 * Latency posture (targeted remediation):
 * - One Supabase getUser()
 * - One atomic rate-limit consume (still enforced)
 * - One withRlsContext transaction that both verifies ACTIVE membership
 *   and loads notifications (no second interactive RLS txn)
 *
 * Security posture unchanged: auth required, abuse protection retained,
 * membership gate retained, FORCE RLS path via withRlsContext retained.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const abuseCheck = await verifyAbuseProtection(request, {
      action: "API_REQUEST",
      userId: user.id,
      endpoint: "notifications",
    });

    if (!abuseCheck.allowed) {
      return createAbuseProtectionResponse(abuseCheck);
    }

    const url = new URL(request.url);
    const limit = sanitizePaginationLimit(url.searchParams.get("limit"), 15, 100);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";

    const notifications = await withRlsContext(user.id, async (tx) => {
      const membership = await tx.membership.findFirst({
        where: {
          userId: user.id,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          organization: { status: "ACTIVE" },
        },
        select: { organizationId: true },
      });

      if (!membership) {
        throw new Error("Active organization membership not found");
      }

      return tx.notification.findMany({
        where: {
          organizationId: membership.organizationId,
          recipientId: user.id,
          ...(unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    });

    return NextResponse.json(
      { success: true, data: { notifications } },
      { headers: abuseCheck.headers }
    );
  } catch (err: any) {
    const message = err?.message || "Unauthorized";
    const status = message.includes("membership") ? 403 : 401;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
