import { NextRequest, NextResponse } from "next/server";
import { jobCollectionRunner } from "@/lib/job-discovery/runner";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Server-only Vercel Cron endpoint for scheduled Global Job Discovery & Collection.
 *
 * Security:
 * - Requires Authorization: Bearer <CRON_SECRET>
 * - Never leaks provider credentials
 * - Protected against concurrent overlapping runs
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const summaries = await jobCollectionRunner.executeCollection({
      triggerType: "SCHEDULED",
      maxJobs: 50,
    });

    return NextResponse.json(
      { success: true, count: summaries.length, summaries },
      { status: 200 }
    );
  } catch (err: any) {
    logger.error("Job collection cron execution error", {
      event: "JOB_COLLECTION_CRON_FAILED",
      error: err?.message,
    });

    return NextResponse.json(
      { success: false, error: err?.message || "Collection cron failure" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
