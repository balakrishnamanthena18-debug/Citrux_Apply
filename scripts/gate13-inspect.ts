import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  try {
    const org = await prisma.organization.findFirst({
      select: { id: true, name: true, slug: true },
    });
    const membership = await prisma.membership.findFirst({
      where: { status: "ACTIVE", role: { in: ["EMPLOYEE", "ADMIN"] } },
      select: { userId: true, organizationId: true, role: true },
    });
    const apps = await prisma.application.findMany({
      take: 3,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        organizationId: true,
        candidateId: true,
        jobId: true,
        candidate: { select: { id: true, userId: true, headline: true } },
        job: { select: { id: true, title: true } },
      },
    });
    const runs = await prisma.applicationIntelligenceRun.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        analysisPurpose: true,
        applicationId: true,
        freshness: true,
        attemptCount: true,
      },
    });
    const alignments = await prisma.applicationAlignmentResult.count();
    const readiness = await prisma.applicationReadinessResult.count();
    const reqSets = await prisma.jobRequirementSet.count();
    console.log(
      JSON.stringify(
        {
          org,
          membership,
          apps,
          runs,
          alignments,
          readiness,
          reqSets,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e?.message || e).slice(0, 500));
  process.exit(1);
});
