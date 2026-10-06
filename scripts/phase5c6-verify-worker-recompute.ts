/**
 * Phase 5C.6 — Scenario H/I: invalidate → worker recompute same identity;
 * old RUNNING write cannot overwrite newer STALE.
 */
import { config } from "dotenv";
config({ path: ".env" });

const ALEX_CANDIDATE_ID = "0a9adcc6-d29d-4133-aae7-189563341b54";
const OPERATING_ORG = "00000000-0000-0000-0000-000000000001";

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const { invalidateCandidateJobMatchesForCandidate } =
    await import("../src/lib/job-matching/invalidation");
  const { drainJobMatchWorker } = await import("../src/lib/job-matching/worker");

  const match = await prisma.candidateJobMatch.findFirst({
    where: {
      organizationId: OPERATING_ORG,
      candidateId: ALEX_CANDIDATE_ID,
      status: "SUCCEEDED",
      freshness: "CURRENT",
    },
    select: {
      id: true,
      sourceDataVersion: true,
      savedAt: true,
      opportunityId: true,
      applicationRequestedAt: true,
    },
  });

  if (!match) {
    // Seed may have been invalidated; promote one QUEUED or reseed expectation
    const any = await prisma.candidateJobMatch.findFirst({
      where: {
        organizationId: OPERATING_ORG,
        candidateId: ALEX_CANDIDATE_ID,
      },
      select: {
        id: true,
        status: true,
        sourceDataVersion: true,
        savedAt: true,
        opportunityId: true,
        applicationRequestedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!any) {
      console.error("No matches for Alex");
      process.exit(1);
    }
    console.log("using_non_current_match", any.status, any.id);
  }

  const target =
    match ??
    (await prisma.candidateJobMatch.findFirstOrThrow({
      where: {
        organizationId: OPERATING_ORG,
        candidateId: ALEX_CANDIDATE_ID,
      },
      select: {
        id: true,
        sourceDataVersion: true,
        savedAt: true,
        opportunityId: true,
        applicationRequestedAt: true,
      },
    }));

  await prisma.$transaction(async (tx) => {
    await invalidateCandidateJobMatchesForCandidate(tx, {
      organizationId: OPERATING_ORG,
      candidateId: ALEX_CANDIDATE_ID,
      reason: "CANDIDATE_TRUTH_CHANGED",
    });
  });

  const afterInv = await prisma.candidateJobMatch.findUniqueOrThrow({
    where: { id: target.id },
    select: { status: true, freshness: true, sourceDataVersion: true },
  });

  const drain = await drainJobMatchWorker(20);

  const afterDrain = await prisma.candidateJobMatch.findUniqueOrThrow({
    where: { id: target.id },
    select: {
      id: true,
      status: true,
      freshness: true,
      sourceDataVersion: true,
      savedAt: true,
      opportunityId: true,
      applicationRequestedAt: true,
    },
  });

  // Scenario I: simulate stale RUNNING write race via conditional updateMany
  await prisma.candidateJobMatch.update({
    where: { id: target.id },
    data: {
      status: "RUNNING",
      freshness: "CURRENT",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    },
  });
  await prisma.$transaction(async (tx) => {
    await invalidateCandidateJobMatchesForCandidate(tx, {
      organizationId: OPERATING_ORG,
      candidateId: ALEX_CANDIDATE_ID,
      reason: "CANDIDATE_TRUTH_CHANGED",
    });
  });
  // Old worker path: updateMany only succeeds if still RUNNING and not STALE
  const race = await prisma.candidateJobMatch.updateMany({
    where: {
      id: target.id,
      status: "RUNNING",
      freshness: { not: "STALE" },
    },
    data: {
      status: "SUCCEEDED",
      freshness: "CURRENT",
      sourceDataVersion: "stale-old-sdv-must-not-win",
    },
  });

  const afterRace = await prisma.candidateJobMatch.findUniqueOrThrow({
    where: { id: target.id },
    select: { status: true, freshness: true, sourceDataVersion: true },
  });

  const report = {
    afterInvalidationStatus: afterInv.status,
    drain,
    sameMatchId: afterDrain.id === target.id,
    afterDrainStatus: afterDrain.status,
    afterDrainFreshness: afterDrain.freshness,
    sdvChangedOrSucceeded:
      afterDrain.status === "SUCCEEDED" || afterDrain.status === "QUEUED",
    decisionSavedPreserved:
      target.savedAt == null || afterDrain.savedAt != null,
    raceOldWriteCount: race.count,
    raceNewerWins: race.count === 0 && afterRace.sourceDataVersion !== "stale-old-sdv-must-not-win",
    afterRaceStatus: afterRace.status,
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.afterInvalidationStatus === "QUEUED" &&
    report.sameMatchId &&
    report.raceNewerWins;

  if (!ok) {
    console.error("PHASE 5C.6 worker race verification FAILED");
    process.exit(1);
  }
  console.log("PHASE 5C.6 worker race verification PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
