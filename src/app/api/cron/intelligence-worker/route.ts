import { NextRequest, NextResponse } from "next/server";
import { drainIntelligenceWorker } from "@/lib/application-intelligence/worker";
import { drainJobMatchWorker } from "@/lib/job-matching/worker";
import { drainResumeReviewWorker } from "@/lib/resume-intelligence/worker";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Server-only Vercel Cron / privileged worker for Application Intelligence runs,
 * Phase 4 Resume Review, and Phase 5A.6 CandidateJobMatch (separate domains;
 * does not alter Phase 2/3/4 contracts).
 *
 * Security:
 * - Requires Authorization: Bearer <CRON_SECRET>
 * - Never accepts org/candidate/run IDs from the client as privilege
 * - Never logs API keys, provider credentials, or resume text
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
    const intelligence = await drainIntelligenceWorker({
      ip: "cron",
      isRenderingServerComponent: false,
    });
    const resumeReviews = await drainResumeReviewWorker(3);
    const jobMatches = await drainJobMatchWorker();

    return NextResponse.json(
      { success: true, intelligence, resumeReviews, jobMatches },
      { status: 200 }
    );
  } catch {
    logger.error("Intelligence worker drain failed", {
      event: "INTELLIGENCE_WORKER_DRAIN",
      success: false,
    });
    return NextResponse.json(
      { success: false, error: "Worker operational failure" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
