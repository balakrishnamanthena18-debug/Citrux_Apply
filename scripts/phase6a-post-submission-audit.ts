/**
 * Phase 6A — post-submission data quality sample (read-only).
 * Run: npx --yes tsx scripts/phase6a-post-submission-audit.ts
 */
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const { prisma } = await import("../src/lib/db/prisma");

  const total = await prisma.application.count();
  const submitted = await prisma.application.findMany({
    where: { status: "SUBMITTED" },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      assignedEmployeeId: true,
      submissions: {
        orderBy: { attemptNumber: "desc" },
        select: {
          attemptNumber: true,
          submittedAt: true,
          submittedById: true,
          externalReference: true,
          externalUrl: true,
          confirmationEvidence: true,
          storagePath: true,
        },
      },
      tasks: {
        select: { id: true, type: true, status: true, createdAt: true },
        take: 20,
      },
      conversations: {
        select: {
          id: true,
          lastMessageAt: true,
          _count: { select: { messages: true } },
        },
        take: 10,
      },
      stateHistory: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { fromStatus: true, toStatus: true, createdAt: true },
      },
    },
  });

  let withSubRow = 0;
  let withEvidence = 0;
  let withExtRef = 0;
  let withExtUrl = 0;
  let multiAttempt = 0;
  let withOpenTask = 0;
  let withConversation = 0;
  let msgsAfterSubmit = 0;

  for (const app of submitted) {
    const latest = app.submissions[0];
    if (latest) withSubRow++;
    if (latest && ((latest.confirmationEvidence ?? "").trim() || (latest.storagePath ?? "").trim())) {
      withEvidence++;
    }
    if (latest?.externalReference) withExtRef++;
    if (latest?.externalUrl) withExtUrl++;
    if (app.submissions.some((s) => s.attemptNumber > 1) || app.submissions.length > 1) {
      multiAttempt++;
    }
    const openTasks = app.tasks.filter(
      (t) => !["COMPLETED", "CANCELED"].includes(t.status)
    );
    if (openTasks.length) withOpenTask++;
    if (app.conversations.length) withConversation++;
    if (latest) {
      const after = app.conversations.some(
        (c) => c.lastMessageAt.getTime() >= latest.submittedAt.getTime()
      );
      if (after) msgsAfterSubmit++;
    }
  }

  // REJECTED that came from SUBMITTED (history)
  const rejected = await prisma.application.findMany({
    where: { status: "REJECTED" },
    select: {
      id: true,
      rejectionReason: true,
      stateHistory: {
        where: { toStatus: "REJECTED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { fromStatus: true, reason: true, createdAt: true },
      },
    },
  });
  const rejectedFromSubmitted = rejected.filter(
    (r) => r.stateHistory[0]?.fromStatus === "SUBMITTED"
  ).length;
  const rejectedFromEarly = rejected.filter((r) =>
    ["DISCOVERED", "QUALIFIED"].includes(r.stateHistory[0]?.fromStatus ?? "")
  ).length;

  // Interview/offer table existence probe via information_schema
  const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND (table_name ILIKE '%interview%' OR table_name ILIKE '%offer%'
            OR table_name ILIKE '%outcome%' OR table_name ILIKE '%employer%')
     ORDER BY table_name`
  );

  const emailTemplates = await prisma.emailDeliveryLog.groupBy({
    by: ["templateId"],
    _count: { _all: true },
  });

  const notificationTypes = await prisma.notification.groupBy({
    by: ["type"],
    _count: { _all: true },
  });

  console.log(
    JSON.stringify(
      {
        sampleSize: { totalApplications: total, submitted: submitted.length },
        submittedQuality: {
          withSubmissionRow: withSubRow,
          withEvidenceArtifact: withEvidence,
          withExternalReference: withExtRef,
          withExternalUrl: withExtUrl,
          multiAttemptPresent: multiAttempt,
          withOpenLinkedTasks: withOpenTask,
          withConversations: withConversation,
          conversationsActiveAtOrAfterLatestSubmit: msgsAfterSubmit,
        },
        rejected: {
          total: rejected.length,
          fromSubmitted: rejectedFromSubmitted,
          fromDiscoveredOrQualified: rejectedFromEarly,
          otherOrUnknownFrom:
            rejected.length - rejectedFromSubmitted - rejectedFromEarly,
        },
        outcomeAdjacentTables: tables.map((t) => t.table_name),
        emailDeliveryByTemplate: Object.fromEntries(
          emailTemplates.map((t) => [t.templateId, t._count._all])
        ),
        notificationByType: Object.fromEntries(
          notificationTypes.map((t) => [t.type, t._count._all])
        ),
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
