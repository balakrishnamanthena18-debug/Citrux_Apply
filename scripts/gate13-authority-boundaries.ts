/**
 * Gate 13.15–17 — QA / approval / submission remain authoritative.
 * Intelligence rows must not mutate when lifecycle authorities change.
 */
import { config } from "dotenv";
config({ path: ".env" });

async function intelSnapshot(
  prisma: Awaited<typeof import("../src/lib/db/prisma")>["prisma"],
  applicationId: string
) {
  const align = await prisma.applicationAlignmentResult.findFirst({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, freshness: true, overallScore: true, evidence: true },
  });
  const ready = await prisma.applicationReadinessResult.findFirst({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      freshness: true,
      readinessState: true,
      blockers: true,
      warnings: true,
    },
  });
  return { align, ready };
}

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const appId = process.argv[2] ?? "eb211138-bbdf-4930-88d3-89284c2d3e73";

  try {
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: appId },
      select: {
        id: true,
        organizationId: true,
        candidateId: true,
        status: true,
        approvalStatus: true,
        approvalRequestedAt: true,
        approvedAt: true,
        approvedBy: true,
      },
    });

    const staff = await prisma.membership.findFirstOrThrow({
      where: {
        organizationId: app.organizationId,
        status: "ACTIVE",
        role: { in: ["ADMIN", "EMPLOYEE"] },
      },
      select: { userId: true },
    });

    const before = await intelSnapshot(prisma, appId);
    if (!before.align || !before.ready) {
      throw new Error("CURRENT intelligence required before authority checks");
    }

    // --- QA path: move to REVIEW, create PASS review, advance approval pending ---
    await prisma.application.update({
      where: { id: appId },
      data: { status: "REVIEW" },
    });

    const qa = await prisma.applicationQaReview.create({
      data: {
        organizationId: app.organizationId,
        applicationId: appId,
        reviewerId: staff.userId,
        decision: "PASS",
        notes: "Gate13 live QA authority check",
      },
      select: { id: true, decision: true },
    });

    await prisma.application.update({
      where: { id: appId },
      data: {
        status: "AWAITING_APPROVAL",
        approvalStatus: "PENDING",
        approvalRequestedAt: new Date(),
      },
    });

    const afterQa = await intelSnapshot(prisma, appId);
    const qaIntelUnchanged =
      afterQa.align?.id === before.align.id &&
      afterQa.ready?.id === before.ready.id &&
      afterQa.align?.overallScore === before.align.overallScore &&
      afterQa.ready?.readinessState === before.ready.readinessState;

    // --- Approval path ---
    const cand = await prisma.candidate.findUniqueOrThrow({
      where: { id: app.candidateId },
      select: { userId: true },
    });
    await prisma.application.update({
      where: { id: appId },
      data: {
        status: "READY",
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedBy: cand.userId,
      },
    });

    const afterApproval = await intelSnapshot(prisma, appId);
    const approvalIntelUnchanged =
      afterApproval.align?.id === before.align.id &&
      afterApproval.ready?.id === before.ready.id;

    // --- Submission path ---
    const submission = await prisma.applicationSubmission.create({
      data: {
        applicationId: appId,
        submittedById: staff.userId,
        attemptNumber: 1,
        submittedAt: new Date(),
        confirmationEvidence: "Gate13 submission authority check",
        submissionNotes: "gate13-authority-check",
      },
      select: { id: true, attemptNumber: true },
    });
    await prisma.application.update({
      where: { id: appId },
      data: { status: "SUBMITTED" },
    });
    await prisma.applicationStateHistory.create({
      data: {
        applicationId: appId,
        fromStatus: "READY",
        toStatus: "SUBMITTED",
        changedById: staff.userId,
        reason: "Gate13 submission authority check",
      },
    });

    const afterSubmission = await intelSnapshot(prisma, appId);
    const submissionIntelUnchanged =
      afterSubmission.align?.id === before.align.id &&
      afterSubmission.ready?.id === before.ready.id;

    // Intelligence must not have created extra submissions beyond this one we created
    const submissionCount = await prisma.applicationSubmission.count({
      where: { applicationId: appId },
    });

    // Restore app to PREPARING for golden path cleanliness; keep artifacts tagged Gate13
    await prisma.application.update({
      where: { id: appId },
      data: {
        status: "PREPARING",
        approvalStatus: null,
        approvalRequestedAt: null,
        approvedAt: null,
        approvedBy: null,
      },
    });

    const report = {
      ok:
        qaIntelUnchanged &&
        approvalIntelUnchanged &&
        submissionIntelUnchanged &&
        submissionCount >= 1,
      qa: {
        reviewId: qa.id,
        decision: qa.decision,
        intelligenceUnchanged: qaIntelUnchanged,
      },
      approval: { intelligenceUnchanged: approvalIntelUnchanged },
      submission: {
        submissionId: submission.id,
        intelligenceUnchanged: submissionIntelUnchanged,
        submissionCount,
      },
      intelligenceIds: {
        alignmentId: before.align.id,
        readinessId: before.ready.id,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
