import { config } from "dotenv";
config({ path: ".env" });

const ALEX = "0a9adcc6-d29d-4133-aae7-189563341b54";

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const rows = await prisma.candidateJobMatch.findMany({
    where: { candidateId: ALEX },
    select: {
      id: true,
      status: true,
      freshness: true,
      category: true,
      dismissedAt: true,
      job: { select: { status: true, title: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 15,
  });
  const preparing = rows.filter(
    (r) =>
      (r.status === "QUEUED" || r.status === "RUNNING") &&
      r.freshness === "CURRENT"
  );
  const feedable = rows.filter(
    (r) =>
      r.status === "SUCCEEDED" &&
      r.freshness === "CURRENT" &&
      r.dismissedAt == null &&
      r.job.status === "OPEN" &&
      r.category !== "LOW_MATCH"
  );
  console.log(
    JSON.stringify(
      { preparing: preparing.length, feedable: feedable.length, rows },
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
