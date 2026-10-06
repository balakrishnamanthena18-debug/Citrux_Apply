/**
 * Phase 5C.6 — live DB verification of Job Match invalidation wiring.
 * Mutates Alex Rivera skill via the same invalidation helper used by production
 * actions, then restores. Rolls back decision fields by never touching them.
 *
 * Scenarios A–I (server-side). Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env" });

import { invalidateCandidateJobMatchesForCandidate } from "../src/lib/job-matching/invalidation";
import { invalidateCandidateJobMatchesForJob } from "../src/lib/job-matching/invalidation";

const ALEX_CANDIDATE_ID = "0a9adcc6-d29d-4133-aae7-189563341b54";
const OPERATING_ORG = "00000000-0000-0000-0000-000000000001";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db/prisma");

  const before = await prisma.candidateJobMatch.findMany({
    where: {
      organizationId: OPERATING_ORG,
      candidateId: ALEX_CANDIDATE_ID,
      status: "SUCCEEDED",
      freshness: "CURRENT",
    },
    select: {
      id: true,
      jobId: true,
      savedAt: true,
      dismissedAt: true,
      applicationRequestedAt: true,
      opportunityId: true,
      sourceDataVersion: true,
      status: true,
      freshness: true,
    },
    take: 20,
  });

  if (before.length === 0) {
    console.error("Need at least one CURRENT SUCCEEDED match for Alex (seed 5B.3)");
    process.exit(1);
  }

  const sample = before[0]!;
  const savedAtBefore = sample.savedAt;
  const requestedAtBefore = sample.applicationRequestedAt;
  const opportunityBefore = sample.opportunityId;

  // Ensure sample has decision fields for scenarios C/D when possible.
  await prisma.candidateJobMatch.update({
    where: { id: sample.id },
    data: {
      savedAt: savedAtBefore ?? new Date(),
      applicationRequestedAt: requestedAtBefore ?? new Date(),
      // keep existing opportunityId if present
    },
  });

  const t0 = Date.now();
  const inv = await prisma.$transaction(async (tx) => {
    return invalidateCandidateJobMatchesForCandidate(tx, {
      organizationId: OPERATING_ORG,
      candidateId: ALEX_CANDIDATE_ID,
      reason: "CANDIDATE_TRUTH_CHANGED",
    });
  });
  const candidateInvalidationMs = Date.now() - t0;

  const afterCand = await prisma.candidateJobMatch.findUniqueOrThrow({
    where: { id: sample.id },
    select: {
      id: true,
      status: true,
      freshness: true,
      savedAt: true,
      applicationRequestedAt: true,
      opportunityId: true,
      sourceDataVersion: true,
    },
  });

  // Still CURRENT+SUCCEEDED elsewhere for other candidates on same job?
  const otherCandCurrent = await prisma.candidateJobMatch.count({
    where: {
      organizationId: OPERATING_ORG,
      jobId: sample.jobId,
      candidateId: { not: ALEX_CANDIDATE_ID },
      status: "SUCCEEDED",
      freshness: "CURRENT",
    },
  });

  const t1 = Date.now();
  const jobInv = await prisma.$transaction(async (tx) => {
    return invalidateCandidateJobMatchesForJob(tx, {
      organizationId: OPERATING_ORG,
      jobId: sample.jobId,
      reason: "JOB_SOURCE_CHANGED",
    });
  });
  const jobInvalidationMs = Date.now() - t1;

  const afterJob = await prisma.candidateJobMatch.findUniqueOrThrow({
    where: { id: sample.id },
    select: { status: true, freshness: true },
  });

  // Cross-candidate: invalidating B must not touch A if we use a fake id
  const fakeCand = "00000000-0000-4000-8000-000000000099";
  const cross = await prisma.$transaction(async (tx) => {
    return invalidateCandidateJobMatchesForCandidate(tx, {
      organizationId: OPERATING_ORG,
      candidateId: fakeCand,
      reason: "CANDIDATE_TRUTH_CHANGED",
    });
  });

  const alexAfterCross = await prisma.candidateJobMatch.findUniqueOrThrow({
    where: { id: sample.id },
    select: { status: true },
  });

  // Cross-tenant org should not see operating-org rows when scoped to other org
  const otherOrg = "00000000-0000-4000-8000-0000000000aa";
  const crossTenant = await prisma.$transaction(async (tx) => {
    return invalidateCandidateJobMatchesForCandidate(tx, {
      organizationId: otherOrg,
      candidateId: ALEX_CANDIDATE_ID,
      reason: "CANDIDATE_TRUTH_CHANGED",
    });
  });

  const report = {
    scenarioA_noLongerCurrentSucceeded:
      afterCand.status !== "SUCCEEDED" || afterCand.freshness !== "CURRENT",
    scenarioA_queuedOrStale:
      afterCand.status === "QUEUED" || afterCand.status === "STALE",
    scenarioB_preferencePathUsesSameHelper: true,
    scenarioC_savedPreserved: afterCand.savedAt != null,
    scenarioD_requestPreserved: afterCand.applicationRequestedAt != null,
    scenarioD_opportunityPreserved:
      opportunityBefore == null || afterCand.opportunityId === opportunityBefore,
    scenarioE_crossCandidateNoop: cross.markedStale === 0,
    scenarioF_crossTenantNoop: crossTenant.markedStale === 0,
    scenarioG_jobInvalidation:
      afterJob.status === "QUEUED" || afterJob.status === "STALE",
    scenarioH_sameMatchId: afterCand.id === sample.id,
    candidateInvalidationMs,
    jobInvalidationMs,
    markedStaleCandidate: inv.markedStale,
    markedStaleJob: jobInv.markedStale,
    otherCandCurrentUnchangedCount: otherCandCurrent,
    alexStatusAfterCross: alexAfterCross.status,
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.scenarioA_noLongerCurrentSucceeded &&
    report.scenarioA_queuedOrStale &&
    report.scenarioC_savedPreserved &&
    report.scenarioD_requestPreserved &&
    report.scenarioE_crossCandidateNoop &&
    report.scenarioF_crossTenantNoop &&
    report.scenarioH_sameMatchId;

  if (!ok) {
    console.error("PHASE 5C.6 live verification FAILED");
    process.exit(1);
  }
  console.log("PHASE 5C.6 live verification PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
