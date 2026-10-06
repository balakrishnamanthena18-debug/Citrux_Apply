/**
 * Phase 5G — live verification of Requested Application Intake Queue.
 */
import { config } from "dotenv";
config({ path: ".env" });

const ALEX = "0a9adcc6-d29d-4133-aae7-189563341b54";
const ORG = "00000000-0000-0000-0000-000000000001";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/db/prisma");
  const { listRequestedApplicationIntake } = await import(
    "../src/lib/application/requested-intake"
  );

  const apps = await prisma.application.findMany({
    where: {
      candidateId: ALEX,
      status: { notIn: ["REJECTED", "WITHDRAWN", "FAILED"] },
    },
    select: { jobId: true },
  });
  const busyJobs = new Set(apps.map((a) => a.jobId));

  const job = await prisma.job.findFirst({
    where: {
      organizationId: ORG,
      status: "OPEN",
      visibility: "GLOBAL",
      id: { notIn: [...busyJobs] },
    },
    select: { id: true, title: true },
  });
  if (!job) {
    console.error("No eligible OPEN GLOBAL job without active Application");
    process.exit(1);
  }

  const match = await prisma.candidateJobMatch.findUnique({
    where: {
      organizationId_candidateId_jobId: {
        organizationId: ORG,
        candidateId: ALEX,
        jobId: job.id,
      },
    },
    select: { id: true, opportunityId: true },
  });
  if (!match) {
    console.error("Match missing for Alex/job — run Phase 5E population first");
    process.exit(1);
  }

  let opportunityId = match.opportunityId;
  if (!opportunityId) {
    const existingOpp = await prisma.candidateJobOpportunity.findUnique({
      where: { candidateId_jobId: { candidateId: ALEX, jobId: job.id } },
      select: { id: true },
    });
    if (existingOpp) {
      opportunityId = existingOpp.id;
    } else {
      const creator = await prisma.user.findFirst({
        where: { memberships: { some: { organizationId: ORG } } },
        select: { id: true },
      });
      if (!creator) {
        console.error("No user for discoveredById");
        process.exit(1);
      }
      const opp = await prisma.candidateJobOpportunity.create({
        data: {
          organizationId: ORG,
          candidateId: ALEX,
          jobId: job.id,
          discoveredById: creator.id,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      opportunityId = opp.id;
    }
  }

  await prisma.candidateJobMatch.update({
    where: { id: match.id },
    data: {
      opportunityId,
      applicationRequestedAt: new Date(),
      status: "SUCCEEDED",
      freshness: "CURRENT",
    },
  });

  const t0 = Date.now();
  const page = await listRequestedApplicationIntake(prisma, ORG, {});
  const listMs = Date.now() - t0;

  const inQueue = page.items.find(
    (i) => i.candidateId === ALEX && i.jobId === job.id
  );

  const staff = await prisma.user.findFirst({
    where: {
      memberships: {
        some: {
          organizationId: ORG,
          role: { in: ["EMPLOYEE", "ADMIN"] },
        },
      },
    },
    select: { id: true },
  });
  if (!staff) {
    console.error("No staff user");
    process.exit(1);
  }

  const app = await prisma.application.create({
    data: {
      organizationId: ORG,
      candidateId: ALEX,
      jobId: job.id,
      candidateJobOpportunityId: opportunityId,
      assignedEmployeeId: staff.id,
      status: "DISCOVERED",
    },
    select: { id: true },
  });
  await prisma.applicationStateHistory.create({
    data: {
      applicationId: app.id,
      fromStatus: null,
      toStatus: "DISCOVERED",
      changedById: staff.id,
      reason: "Phase5G intake verification",
    },
  });

  const pageAfter = await listRequestedApplicationIntake(prisma, ORG, {});
  const stillInQueue = pageAfter.items.some(
    (i) => i.candidateId === ALEX && i.jobId === job.id
  );

  const otherOrgPage = await listRequestedApplicationIntake(
    prisma,
    "00000000-0000-4000-8000-0000000000aa",
    {}
  );

  const report = {
    jobId: job.id,
    jobTitle: job.title,
    listMs,
    totalPendingBefore: page.totalPending,
    scenarioA_inQueue: inQueue != null,
    scenarioD_removedAfterApp: !stillInQueue,
    scenarioCrossTenantEmpty: otherOrgPage.items.length === 0,
    applicationId: app.id,
    canStartWasTrue: inQueue?.canStart === true,
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.scenarioA_inQueue &&
    report.scenarioD_removedAfterApp &&
    report.scenarioCrossTenantEmpty;

  if (!ok) {
    console.error("PHASE 5G live verification FAILED");
    process.exit(1);
  }
  console.log("PHASE 5G live verification PASSED");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
