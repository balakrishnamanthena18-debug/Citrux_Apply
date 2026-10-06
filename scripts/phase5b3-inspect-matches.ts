import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const rows = await prisma.candidateJobMatch.findMany({
    where: { status: "SUCCEEDED", freshness: "CURRENT", dismissedAt: null },
    take: 8,
    select: {
      id: true,
      category: true,
      candidateId: true,
      candidate: { select: { userId: true, user: { select: { email: true } } } },
      job: { select: { title: true, status: true, visibility: true } },
    },
  });
  const total = await prisma.candidateJobMatch.count({
    where: { status: "SUCCEEDED", freshness: "CURRENT" },
  });
  console.log(JSON.stringify({ total, sample: rows }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
