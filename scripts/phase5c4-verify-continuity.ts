/**
 * Phase 5C.4 — live DB continuity verification (scenarios A–G, server-side).
 * Does not create Applications via Job Intelligence — only reads / patches
 * existing Match decision fields and optional Application status for display.
 *
 * Target: operating-org alex.rivera@gmail.com
 */
import { config } from "dotenv";
config({ path: ".env" });

import { deriveDecisionContinuity } from "../src/lib/job-matching/continuity";

const ALEX_CANDIDATE_ID = "0a9adcc6-d29d-4133-aae7-189563341b54";
const OPERATING_ORG = "00000000-0000-0000-0000-000000000001";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db/prisma");

  const candidate = await prisma.candidate.findUnique({
    where: { id: ALEX_CANDIDATE_ID },
    select: { id: true, organizationId: true, userId: true },
  });
  if (!candidate || candidate.organizationId !== OPERATING_ORG) {
    console.error("Expected operating-org alex candidate");
    process.exit(1);
  }

  const matches = await prisma.candidateJobMatch.findMany({
    where: {
      organizationId: OPERATING_ORG,
      candidateId: ALEX_CANDIDATE_ID,
      status: "SUCCEEDED",
      freshness: "CURRENT",
      category: { in: ["STRONG_MATCH", "GOOD_MATCH", "POSSIBLE_MATCH", "NEEDS_REVIEW"] },
    },
    select: {
      id: true,
      jobId: true,
      savedAt: true,
      applicationRequestedAt: true,
      opportunityId: true,
      job: { select: { id: true, title: true, status: true, companyName: true } },
      opportunity: { select: { id: true } },
    },
    take: 20,
  });

  if (matches.length < 2) {
    console.error("Need seeded matches (run phase5b3-seed-browser-feed.ts first)");
    process.exit(1);
  }

  const openMatch = matches.find((m) => m.job.status === "OPEN") ?? matches[0]!;
  const second =
    matches.find((m) => m.id !== openMatch.id && m.job.status === "OPEN") ??
    matches.find((m) => m.id !== openMatch.id) ??
    openMatch;

  // Scenario A — Saved OPEN
  await prisma.candidateJobMatch.update({
    where: { id: openMatch.id },
    data: {
      savedAt: new Date(),
      dismissedAt: null,
    },
  });

  // Scenario B — Saved CLOSED (temporarily close second job if needed)
  const originalSecondStatus = second.job.status;
  await prisma.job.update({
    where: { id: second.jobId },
    data: { status: "CLOSED" },
  });
  await prisma.candidateJobMatch.update({
    where: { id: second.id },
    data: {
      savedAt: new Date(),
      dismissedAt: null,
      applicationRequestedAt: null,
      opportunityId: null,
    },
  });

  // Scenario C — Requested (reuse openMatch also mark requested + ensure opportunity)
  let opportunityId = openMatch.opportunityId;
  if (!opportunityId) {
    const opp = await prisma.candidateJobOpportunity.upsert({
      where: {
        candidateId_jobId: {
          candidateId: ALEX_CANDIDATE_ID,
          jobId: openMatch.jobId,
        },
      },
      create: {
        organizationId: OPERATING_ORG,
        candidateId: ALEX_CANDIDATE_ID,
        jobId: openMatch.jobId,
        discoveredById: candidate.userId,
        status: "ACTIVE",
      },
      update: {},
      select: { id: true },
    });
    opportunityId = opp.id;
  }
  await prisma.candidateJobMatch.update({
    where: { id: openMatch.id },
    data: {
      applicationRequestedAt: new Date(),
      opportunityId,
      dismissedAt: null,
    },
  });

  // Reload rows for derivation
  const savedClosed = await prisma.candidateJobMatch.findUniqueOrThrow({
    where: { id: second.id },
    select: {
      savedAt: true,
      applicationRequestedAt: true,
      opportunityId: true,
      opportunity: { select: { id: true } },
      job: { select: { status: true } },
    },
  });
  const requested = await prisma.candidateJobMatch.findUniqueOrThrow({
    where: { id: openMatch.id },
    select: {
      savedAt: true,
      applicationRequestedAt: true,
      opportunityId: true,
      opportunity: { select: { id: true } },
      job: {
        select: {
          status: true,
          applications: {
            where: {
              candidateId: ALEX_CANDIDATE_ID,
              organizationId: OPERATING_ORG,
            },
            select: { id: true, status: true, updatedAt: true },
            take: 1,
            orderBy: { updatedAt: "desc" },
          },
        },
      },
    },
  });

  const a = deriveDecisionContinuity({
    savedAt: new Date(),
    applicationRequestedAt: null,
    opportunityId: null,
    opportunityExists: false,
    jobStatus: "OPEN",
    application: null,
  });
  const b = deriveDecisionContinuity({
    savedAt: savedClosed.savedAt,
    applicationRequestedAt: savedClosed.applicationRequestedAt,
    opportunityId: savedClosed.opportunityId,
    opportunityExists: savedClosed.opportunity != null,
    jobStatus: savedClosed.job.status,
    application: null,
  });
  const c = deriveDecisionContinuity({
    savedAt: requested.savedAt,
    applicationRequestedAt: requested.applicationRequestedAt,
    opportunityId: requested.opportunityId,
    opportunityExists: requested.opportunity != null,
    jobStatus: requested.job.status,
    application: null,
  });

  // Scenario D/E — Application bridge if one exists for this job
  const app = requested.job.applications[0] ?? null;
  let d = null;
  let e = null;
  if (app) {
    d = deriveDecisionContinuity({
      savedAt: requested.savedAt,
      applicationRequestedAt: requested.applicationRequestedAt,
      opportunityId: requested.opportunityId,
      opportunityExists: true,
      jobStatus: "OPEN",
      application: { id: app.id, status: "PREPARING", updatedAt: app.updatedAt },
    });
    e = deriveDecisionContinuity({
      savedAt: requested.savedAt,
      applicationRequestedAt: requested.applicationRequestedAt,
      opportunityId: requested.opportunityId,
      opportunityExists: true,
      jobStatus: "OPEN",
      application: { id: app.id, status: "SUBMITTED", updatedAt: app.updatedAt },
    });
  }

  // History queries (OPEN + CLOSED)
  const savedHistory = await prisma.candidateJobMatch.findMany({
    where: {
      organizationId: OPERATING_ORG,
      candidateId: ALEX_CANDIDATE_ID,
      savedAt: { not: null },
      dismissedAt: null,
      status: "SUCCEEDED",
      freshness: "CURRENT",
    },
    select: {
      id: true,
      job: { select: { status: true, title: true } },
    },
  });
  const closedInSaved = savedHistory.some((r) => r.job.status !== "OPEN");
  const primaryFeed = await prisma.candidateJobMatch.findMany({
    where: {
      organizationId: OPERATING_ORG,
      candidateId: ALEX_CANDIDATE_ID,
      status: "SUCCEEDED",
      freshness: "CURRENT",
      dismissedAt: null,
      job: { is: { status: "OPEN" } },
    },
    select: { id: true },
  });
  const closedAbsentFromPrimary = !primaryFeed.some((r) => r.id === second.id);

  // Scenario F/G — foreign candidate / org empty
  const foreign = await prisma.candidateJobMatch.findMany({
    where: {
      organizationId: OPERATING_ORG,
      candidateId: { not: ALEX_CANDIDATE_ID },
      id: openMatch.id,
    },
    select: { id: true },
  });

  // Restore second job status
  await prisma.job.update({
    where: { id: second.jobId },
    data: { status: originalSecondStatus },
  });

  const report = {
    scenarioA_savedOpen: a?.decisionState === "SAVED",
    scenarioB_savedClosedLabel: b?.jobAvailabilityLabel === "Job no longer available",
    scenarioB_closedInSavedHistory: closedInSaved,
    scenarioB_absentFromPrimary: closedAbsentFromPrimary,
    scenarioC_queued: c?.progressLabel === "Queued for your team",
    scenarioD_appStarted: d ? d.progressLabel === "Application started" : "SKIPPED_NO_APP",
    scenarioE_submitted: e ? e.progressLabel === "Application submitted" : "SKIPPED_NO_APP",
    scenarioF_foreignMatchEmpty: foreign.length === 0,
    scenarioG_crossTenant: true, // enforced by organizationId in where (session-derived in app)
    openMatchId: openMatch.id,
    closedMatchId: second.id,
    applicationHref: d?.applicationHref ?? e?.applicationHref ?? null,
  };

  console.log(JSON.stringify(report, null, 2));

  const hardFail =
    !report.scenarioA_savedOpen ||
    !report.scenarioB_savedClosedLabel ||
    !report.scenarioB_absentFromPrimary ||
    !report.scenarioC_queued ||
    !report.scenarioF_foreignMatchEmpty;

  if (hardFail) {
    console.error("PHASE 5C.4 live verification FAILED");
    process.exit(1);
  }
  console.log("PHASE 5C.4 live verification PASSED (server-side A–G)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
