import { config } from "dotenv";
config({ path: ".env" });

/**
 * Uploads a text-based PDF to the Gate13 golden seed resume path (DB row exists
 * without a Storage object), clears the failed extract, and requeues review.
 */

function buildMinimalTextPdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const lines = escaped.split("\n");
  const contentLines: string[] = ["BT", "/F1 11 Tf", "50 750 Td", "14 TL"];
  lines.forEach((line, i) => {
    if (i === 0) contentLines.push(`(${line}) Tj`);
    else contentLines.push(`T* (${line}) Tj`);
  });
  contentLines.push("ET");
  const stream = contentLines.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n"
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream\nendobj\n`
  );
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const { getSupabaseAdminClient } = await import("../src/lib/supabase/admin");
  const { CANDIDATE_DOCUMENTS_BUCKET } = await import("../src/lib/storage");
  const { drainResumeReviewWorker } = await import(
    "../src/lib/resume-intelligence/worker"
  );

  const documentId = "1358b87c-7395-44f8-939a-3d2d7a3a0cbb";
  const reviewId = "e9b8dce9-708e-4222-ab6c-30bd3f027124";
  const appId = "eb211138-bbdf-4930-88d3-89284c2d3e73";

  const doc = await prisma.candidateDocument.findUnique({
    where: { id: documentId },
    select: { storagePath: true, mimeType: true, title: true },
  });
  if (!doc) throw new Error("document missing");

  const pdf = buildMinimalTextPdf(
    [
      "Alex Rivera",
      "Senior Full Stack Engineer",
      "Email: alex.rivera@example.com",
      "Phone: 555-0100",
      "",
      "SUMMARY",
      "Platform engineer with TypeScript, React, and PostgreSQL experience.",
      "",
      "EXPERIENCE",
      "Staff Software Engineer - Example Corp",
      "Built TypeScript services and Next.js applications.",
      "Owned PostgreSQL data models and reliability work.",
      "",
      "SKILLS",
      "TypeScript, React, Node.js, PostgreSQL, AWS",
      "",
      "EDUCATION",
      "B.S. Computer Science",
      "",
      "PROJECTS",
      "Operations dashboard with TypeScript and PostgreSQL",
    ].join("\n")
  );

  const admin = getSupabaseAdminClient();
  const { error: uploadError } = await admin.storage
    .from(CANDIDATE_DOCUMENTS_BUCKET)
    .upload(doc.storagePath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`upload failed: ${uploadError.message}`);
  }

  // Clear failed extract so content-hash can be recomputed from real bytes.
  await prisma.candidateDocumentExtract.deleteMany({
    where: { candidateDocumentId: documentId },
  });

  // Requeue existing review for another worker pass.
  await prisma.resumeReview.update({
    where: { id: reviewId },
    data: {
      status: "QUEUED",
      freshness: "CURRENT",
      extractId: null,
      attemptCount: 0,
      leaseExpiresAt: null,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      startedAt: null,
      atsReadability: {},
      representation: {},
      strengths: [],
      recommendations: [],
      overallLabel: null,
      overallSummary: null,
    },
  });

  const drain = await drainResumeReviewWorker(3);
  const review = await prisma.resumeReview.findUnique({
    where: { id: reviewId },
    select: {
      status: true,
      overallLabel: true,
      overallSummary: true,
      extractId: true,
      atsReadability: true,
      recommendations: true,
      strengths: true,
    },
  });
  const extract = review?.extractId
    ? await prisma.candidateDocumentExtract.findUnique({
        where: { id: review.extractId },
        select: {
          parseStatus: true,
          errorCode: true,
          charCount: true,
          pageCount: true,
        },
      })
    : null;

  console.log(
    JSON.stringify(
      {
        appId,
        uploadPath: doc.storagePath,
        drain,
        review: {
          status: review?.status,
          overallLabel: review?.overallLabel,
          overallSummary: review?.overallSummary,
          atsLabel:
            review?.atsReadability && typeof review.atsReadability === "object"
              ? (review.atsReadability as { label?: string }).label
              : null,
          strengthsCount: Array.isArray(review?.strengths)
            ? review!.strengths.length
            : 0,
          recommendationsCount: Array.isArray(review?.recommendations)
            ? review!.recommendations.length
            : 0,
        },
        extract,
      },
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
