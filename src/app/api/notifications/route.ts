import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  verifyAbuseProtection,
  createAbuseProtectionResponse,
} from "@/lib/security/abuse-protection";
import { sanitizePaginationLimit } from "@/lib/utils/sanitization";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthenticatedContext();

    // Verify rate limit & abuse protection for notifications API
    const abuseCheck = await verifyAbuseProtection(request, {
      action: "API_REQUEST",
      userId: ctx.userId,
      endpoint: "notifications",
    });

    if (!abuseCheck.allowed) {
      return createAbuseProtectionResponse(abuseCheck);
    }

    const url = new URL(request.url);
    const limit = sanitizePaginationLimit(url.searchParams.get("limit"), 15, 100);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";

    const notifications = await withRlsContext(ctx.userId, async (tx) => {
      return tx.notification.findMany({
        where: {
          organizationId: ctx.organizationId,
          recipientId: ctx.userId,
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
    return NextResponse.json(
      { success: false, error: err.message || "Unauthorized" },
      { status: 401 }
    );
  }
}
