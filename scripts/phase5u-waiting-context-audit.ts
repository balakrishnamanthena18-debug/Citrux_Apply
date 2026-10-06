/**
 * Phase 5U forensic data-quality measures (read-only).
 * Run: npx --yes tsx scripts/phase5u-waiting-context-audit.ts
 */
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const { prisma } = await import("../src/lib/db/prisma");
  const { resolveCurrentStateEnteredAt } = await import(
    "../src/lib/application/operations-aging"
  );

  const total = await prisma.application.count();
  const byStatus = await prisma.application.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const apps = await prisma.application.findMany({
    select: {
      id: true,
      status: true,
      approvalRequestedAt: true,
      approvedAt: true,
      approvalStatus: true,
      failureReason: true,
      rejectionReason: true,
      withdrawalReason: true,
      stateHistory: {
        orderBy: { createdAt: "desc" },
        select: { toStatus: true, createdAt: true, applicationId: true, reason: true },
      },
      qaReviews: { select: { id: true }, take: 1 },
      submissions: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: {
          id: true,
          submittedAt: true,
          confirmationEvidence: true,
          storagePath: true,
          externalReference: true,
        },
      },
      materials: {
        where: { isCurrent: true },
        take: 1,
        select: { id: true, candidateDocumentId: true, coverLetterText: true },
      },
      tasks: {
        where: {
          status: {
            notIn: ["COMPLETED", "CANCELED"],
          },
        },
        select: { id: true, type: true, status: true, dueDate: true },
        take: 5,
      },
    },
  });

  let missingHistoryMatch = 0;
  let noHistory = 0;
  let awaitingNoApprovalAt = 0;
  let awaitingWithApprovalAt = 0;
  let reviewNoQa = 0;
  let reviewWithQa = 0;
  let submittedNoSub = 0;
  let submittedNoEvidence = 0;
  let submittedOk = 0;
  let preparingNoMaterial = 0;
  let preparingPartial = 0;
  let preparingComplete = 0;
  let openTasksLinked = 0;
  let submissionIssueWithReason = 0;
  let submissionIssueNoReason = 0;

  for (const app of apps) {
    if (app.stateHistory.length === 0) noHistory++;
    const entered = resolveCurrentStateEnteredAt(app.status, app.stateHistory);
    if (!entered) missingHistoryMatch++;

    if (app.status === "AWAITING_APPROVAL") {
      if (app.approvalRequestedAt) awaitingWithApprovalAt++;
      else awaitingNoApprovalAt++;
    }
    if (app.status === "REVIEW") {
      if (app.qaReviews.length === 0) reviewNoQa++;
      else reviewWithQa++;
    }
    if (app.status === "SUBMITTED") {
      const sub = app.submissions[0];
      if (!sub) submittedNoSub++;
      else if (!sub.confirmationEvidence && !sub.storagePath) submittedNoEvidence++;
      else submittedOk++;
    }
    if (app.status === "PREPARING") {
      const m = app.materials[0];
      if (!m) preparingNoMaterial++;
      else if (!m.candidateDocumentId && !m.coverLetterText) preparingPartial++;
      else preparingComplete++;
    }
    if (app.tasks.length > 0) openTasksLinked++;
    if (app.status === "SUBMISSION_ISSUE") {
      const issueEntry = app.stateHistory.find((h) => h.toStatus === "SUBMISSION_ISSUE");
      if (issueEntry?.reason) submissionIssueWithReason++;
      else submissionIssueNoReason++;
    }
  }

  // QA reviews on non-REVIEW apps (orphaned relative to current status — normal after pass/fail)
  const qaCount = await prisma.applicationQaReview.count();
  const reviewStatusCount =
    byStatus.find((s) => s.status === "REVIEW")?._count._all ?? 0;

  console.log(
    JSON.stringify(
      {
        total,
        byStatus: Object.fromEntries(
          byStatus.map((s) => [s.status, s._count._all])
        ),
        age: {
          noHistory,
          missingHistoryMatchOrNoHistory: missingHistoryMatch,
        },
        awaitingApproval: {
          withApprovalRequestedAt: awaitingWithApprovalAt,
          withoutApprovalRequestedAt: awaitingNoApprovalAt,
        },
        review: {
          currentlyInReview: reviewStatusCount,
          reviewWithExistingQaRow: reviewWithQa,
          reviewWithoutQaRow: reviewNoQa,
          note: "QA row is created on complete, not on enter REVIEW — reviewWithoutQaRow expected while open",
        },
        qaReviewsTotal: qaCount,
        submitted: {
          withEvidence: submittedOk,
          withoutEvidenceArtifact: submittedNoEvidence,
          withoutSubmissionRow: submittedNoSub,
        },
        preparing: {
          noCurrentMaterial: preparingNoMaterial,
          materialButSparse: preparingPartial,
          materialPresent: preparingComplete,
        },
        submissionIssue: {
          withHistoryReason: submissionIssueWithReason,
          withoutHistoryReason: submissionIssueNoReason,
        },
        appsWithOpenLinkedTasks: openTasksLinked,
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
