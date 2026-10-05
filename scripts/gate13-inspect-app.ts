import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const appId = process.argv[2] ?? "eb211138-bbdf-4930-88d3-89284c2d3e73";
  try {
    const aligns = await prisma.applicationAlignmentResult.findMany({
      where: { applicationId: appId },
      select: {
        id: true,
        freshness: true,
        overallScore: true,
        createdAt: true,
        runId: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const reads = await prisma.applicationReadinessResult.findMany({
      where: { applicationId: appId },
      select: {
        id: true,
        freshness: true,
        readinessState: true,
        createdAt: true,
        runId: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const runs = await prisma.applicationIntelligenceRun.findMany({
      where: { applicationId: appId },
      select: {
        id: true,
        status: true,
        analysisPurpose: true,
        freshness: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    console.log(JSON.stringify({ appId, aligns, reads, runs }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
