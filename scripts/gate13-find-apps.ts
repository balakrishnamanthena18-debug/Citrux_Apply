import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  try {
    const apps = await prisma.application.findMany({
      where: { job: { title: { contains: "Gate13" } } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        candidateId: true,
        createdAt: true,
        job: { select: { title: true, id: true } },
        alignmentResults: {
          where: { freshness: "CURRENT" },
          select: { id: true, freshness: true, overallScore: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        readinessResults: {
          where: { freshness: "CURRENT" },
          select: { id: true, freshness: true, readinessState: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    console.log(JSON.stringify(apps, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
