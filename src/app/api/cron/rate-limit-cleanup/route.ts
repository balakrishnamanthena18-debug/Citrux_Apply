import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredRateLimits } from "@/lib/auth/rate-limiter";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Server-only scheduled maintenance endpoint for Vercel Cron.
 * Safely purges expired PostgreSQL rate-limit buckets.
 *
 * Security:
 * - Requires Authorization: Bearer <CRON_SECRET> header.
 * - Rejects unauthorized requests with 401.
 * - Never returns or logs PII, rate-limit keys, or database credentials.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Verify CRON_SECRET authorization
  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { deletedCount } = await cleanupExpiredRateLimits();
    const durationMs = Date.now() - startTime;

    logger.info("Rate limit cleanup completed successfully", {
      event: "RATE_LIMIT_CLEANUP",
      deletedCount,
      durationMs,
      success: true,
    });

    return NextResponse.json(
      { success: true, deletedCount },
      { status: 200 }
    );
  } catch {
    const durationMs = Date.now() - startTime;

    logger.error("Rate limit cleanup encountered an operational error", {
      event: "RATE_LIMIT_CLEANUP",
      durationMs,
      success: false,
    });

    return NextResponse.json(
      { success: false, error: "Operational cleanup failure" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
