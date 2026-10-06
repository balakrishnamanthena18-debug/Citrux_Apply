/**
 * Phase 5B.3 — seed persisted CURRENT/SUCCEEDED matches for live browser verification.
 * Uses real DB rows (not frontend mocks). Safe to re-run (upsert by idempotency key).
 *
 * Target: operating-org candidate alex.rivera@gmail.com (Gate13 / portal user).
 */
import { config } from "dotenv";
config({ path: ".env" });

import { randomUUID } from "crypto";
import { MATCHING_CONTRACT_VERSION } from "../src/lib/job-matching/constants";

const ALEX_CANDIDATE_ID = "0a9adcc6-d29d-4133-aae7-189563341b54";
const OPERATING_ORG = "00000000-0000-0000-0000-000000000001";

const SEED_JOBS: { jobId: string; category: string }[] = [
  { jobId: "54c21bbd-3fd7-407a-b5bf-6012900f68bd", category: "STRONG_MATCH" },
  { jobId: "2afa6131-d291-4011-8c86-fb6ae305678a", category: "GOOD_MATCH" },
  { jobId: "23b0a00a-2bb1-422e-8d12-16cd45176a2d", category: "POSSIBLE_MATCH" },
  { jobId: "43eea03f-1aa9-4a38-a36d-6b377e7d1534", category: "NEEDS_REVIEW" },
];

function buildPresentation(category: string) {
  return {
    why: `Phase 5B.3 browser verification (${category.replace("_", " ").toLowerCase()}).`,
    strengths: [{ title: "Profile alignment", message: "Sample strength for verification." }],
    thingsToCheck: [{ title: "Confirm details", message: "Sample check for verification." }],
    preferences: [
      { title: "Work arrangement", message: "Sample preference line.", tone: "info" },
    ],
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db/prisma");

  const candidate = await prisma.candidate.findUnique({
    where: { id: ALEX_CANDIDATE_ID },
    select: { id: true, organizationId: true },
  });
  if (!candidate || candidate.organizationId !== OPERATING_ORG) {
    console.error("Expected operating-org alex candidate");
    process.exit(1);
  }

  const created: string[] = [];
  for (const { jobId, category } of SEED_JOBS) {
    const sourceDataVersion = `phase5b3-browser-${jobId.slice(0, 8)}`;
    const idempotencyKey = `p5b3-${ALEX_CANDIDATE_ID.slice(0, 8)}-${jobId.slice(0, 8)}`;
    const existing = await prisma.candidateJobMatch.findFirst({
      where: {
        organizationId: OPERATING_ORG,
        candidateId: ALEX_CANDIDATE_ID,
        jobId,
        freshness: "CURRENT",
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.candidateJobMatch.update({
        where: { id: existing.id },
        data: {
          status: "SUCCEEDED",
          category: category as never,
          presentation: buildPresentation(category),
          dismissedAt: null,
          savedAt: null,
          applicationRequestedAt: null,
          opportunityId: null,
        },
      });
      created.push(existing.id);
      continue;
    }

    const id = randomUUID();
    await prisma.candidateJobMatch.create({
      data: {
        id,
        organizationId: OPERATING_ORG,
        candidateId: ALEX_CANDIDATE_ID,
        jobId,
        matchingContractVersion: MATCHING_CONTRACT_VERSION,
        sourceDataVersion,
        status: "SUCCEEDED",
        freshness: "CURRENT",
        category: category as never,
        qualificationSummary: [],
        preferenceSummary: [],
        presentation: buildPresentation(category),
        evidenceRefs: [],
        idempotencyKey,
        evaluatedAt: new Date(),
      },
    });
    created.push(id);
  }

  // Exclusion control — LOW_MATCH must not appear in primary feed
  const lowJob = "50ce5082-e8cf-4b6c-ba67-a79b54412cdc";
  const lowExisting = await prisma.candidateJobMatch.findFirst({
    where: {
      candidateId: ALEX_CANDIDATE_ID,
      jobId: lowJob,
      freshness: "CURRENT",
    },
    select: { id: true },
  });
  if (!lowExisting) {
    await prisma.candidateJobMatch.create({
      data: {
        id: randomUUID(),
        organizationId: OPERATING_ORG,
        candidateId: ALEX_CANDIDATE_ID,
        jobId: lowJob,
        matchingContractVersion: MATCHING_CONTRACT_VERSION,
        sourceDataVersion: "phase5b3-low-exclude",
        status: "SUCCEEDED",
        freshness: "CURRENT",
        category: "LOW_MATCH",
        qualificationSummary: [],
        preferenceSummary: [],
        presentation: { why: "low" },
        evidenceRefs: [],
        idempotencyKey: "p5b3-low-exclude",
        evaluatedAt: new Date(),
      },
    });
  } else {
    await prisma.candidateJobMatch.update({
      where: { id: lowExisting.id },
      data: { category: "LOW_MATCH", status: "SUCCEEDED", dismissedAt: null },
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        candidateId: ALEX_CANDIDATE_ID,
        feedMatchIds: created,
        categories: SEED_JOBS.map((j) => j.category),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
