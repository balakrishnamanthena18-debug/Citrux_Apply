/**
 * Phase 5E — explicit, resumable bootstrap for missing CandidateJobMatch rows.
 *
 * NOT run on deploy. Invoke manually:
 *   npx tsx scripts/phase5e-bootstrap-match-population.ts --org <uuid> [--dry-run]
 *
 * Only enqueues QUEUED work via populate* helpers. Never evaluates matching.v1.
 */
import { config } from "dotenv";
config({ path: ".env" });

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const orgId = arg("--org");
  const dryRun = process.argv.includes("--dry-run");
  if (!orgId) {
    console.error("Usage: --org <organizationId> [--dry-run]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db/prisma");
  const {
    populateJobMatchWorkForJob,
    populateJobMatchWorkForCandidate,
  } = await import("../src/lib/job-matching/population");

  const jobs = await prisma.job.findMany({
    where: { organizationId: orgId, status: "OPEN", visibility: "GLOBAL" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const candidates = await prisma.candidate.findMany({
    where: { organizationId: orgId, status: "ACTIVE" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  console.log(
    JSON.stringify(
      {
        orgId,
        dryRun,
        openGlobalJobs: jobs.length,
        activeCandidates: candidates.length,
        theoreticalMaxPairs: jobs.length * candidates.length,
      },
      null,
      2
    )
  );

  if (dryRun) {
    await prisma.$disconnect();
    return;
  }

  let enqueuedJobs = 0;
  let enqueuedCandidates = 0;
  let truncated = false;

  for (const job of jobs) {
    const r = await prisma.$transaction(async (tx) =>
      populateJobMatchWorkForJob(tx, {
        organizationId: orgId,
        jobId: job.id,
        reason: "BOOTSTRAP",
      })
    );
    enqueuedJobs += r.enqueued;
    if (r.truncated) truncated = true;
  }

  // Candidate pass catches private leads + any residual GLOBAL gaps within batch caps.
  for (const cand of candidates) {
    const r = await prisma.$transaction(async (tx) =>
      populateJobMatchWorkForCandidate(tx, {
        organizationId: orgId,
        candidateId: cand.id,
        reason: "BOOTSTRAP",
      })
    );
    enqueuedCandidates += r.enqueued;
    if (r.truncated) truncated = true;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        enqueuedViaJobs: enqueuedJobs,
        enqueuedViaCandidates: enqueuedCandidates,
        truncated,
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
