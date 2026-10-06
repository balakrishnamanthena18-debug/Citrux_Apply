import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const appId = process.argv[2] || "eb211138-bbdf-4930-88d3-89284c2d3e73";
  const reviews = await prisma.resumeReview.findMany({
    where: { applicationId: appId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      freshness: true,
      overallLabel: true,
      overallSummary: true,
      errorCode: true,
      errorMessage: true,
      extractId: true,
      candidateDocumentId: true,
      completedAt: true,
      createdAt: true,
      atsReadability: true,
      strengths: true,
      recommendations: true,
    },
  });
  console.log(
    JSON.stringify(
      reviews.map((r) => ({
        id: r.id,
        status: r.status,
        freshness: r.freshness,
        overallLabel: r.overallLabel,
        overallSummary: r.overallSummary,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage,
        extractId: r.extractId,
        candidateDocumentId: r.candidateDocumentId,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
        atsLabel:
          r.atsReadability && typeof r.atsReadability === "object"
            ? (r.atsReadability as { label?: string }).label
            : null,
        strengthsCount: Array.isArray(r.strengths) ? r.strengths.length : 0,
        recommendationsCount: Array.isArray(r.recommendations)
          ? r.recommendations.length
          : 0,
      })),
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
