import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthenticatedContext();
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "15", 10);
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

    return NextResponse.json({ success: true, data: { notifications } });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Unauthorized" },
      { status: 200 }
    );
  }
}
