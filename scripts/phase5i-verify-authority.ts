/**
 * Phase 5I live Mumbai verification — authority gates + ownership.
 * Run: npx tsx scripts/phase5i-verify-authority.ts
 */
import { config } from "dotenv";
config({ path: ".env" });

const ORG = "00000000-0000-0000-0000-000000000001";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { ApplicationStatus, QaDecision } = await import("../src/generated/prisma");
  const { QA_CRITERION_KEYS } = await import("../src/lib/validation/qa.schemas");
  const { evaluateAuthoritativeQaPass } = await import("../src/lib/qa/authority");
  const {
    assertSubmissionEvidence,
    hasSubmissionEvidence,
  } = await import("../src/lib/submission/evidence");
  const { prisma } = await import("../src/lib/db/prisma");
  const { assertAuthoritativeQaPass } = await import("../src/lib/qa/authority");

  const recent = await prisma.application.findMany({
    where: { organizationId: ORG },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      assignedEmployeeId: true,
      status: true,
      createdAt: true,
    },
  });

  // Live DB: assertAuthoritativeQaPass against a real app if any READY exists with/without QA
  const readyApp = await prisma.application.findFirst({
    where: { organizationId: ORG, status: ApplicationStatus.READY },
    select: { id: true, assignedEmployeeId: true },
  });

  let readyHasQaPass: boolean | null = null;
  if (readyApp) {
    try {
      await prisma.$transaction(async (tx) => {
        await assertAuthoritativeQaPass(tx, {
          applicationId: readyApp.id,
          organizationId: ORG,
        });
      });
      readyHasQaPass = true;
    } catch {
      readyHasQaPass = false;
    }
  }

  const noQa = evaluateAuthoritativeQaPass({ review: null });
  const failQa = evaluateAuthoritativeQaPass({
    review: {
      id: "x",
      decision: "FAIL",
      createdAt: new Date(),
      checklistItems: QA_CRITERION_KEYS.map((k) => ({
        criterionKey: k,
        isVerified: false,
      })),
    },
  });
  const passQa = evaluateAuthoritativeQaPass({
    review: {
      id: "y",
      decision: "PASS",
      createdAt: new Date("2026-10-06T12:00:00Z"),
      checklistItems: QA_CRITERION_KEYS.map((k) => ({
        criterionKey: k,
        isVerified: true,
      })),
    },
    currentMaterialCreatedAt: new Date("2026-10-06T11:00:00Z"),
  });
  const staleMaterial = evaluateAuthoritativeQaPass({
    review: {
      id: "z",
      decision: "PASS",
      createdAt: new Date("2026-10-06T10:00:00Z"),
      checklistItems: QA_CRITERION_KEYS.map((k) => ({
        criterionKey: k,
        isVerified: true,
      })),
    },
    currentMaterialCreatedAt: new Date("2026-10-06T12:00:00Z"),
  });

  let evidenceBlocked = false;
  try {
    assertSubmissionEvidence({ confirmationEvidence: "  ", storagePath: null });
  } catch {
    evidenceBlocked = true;
  }

  // Create via desk-equivalent ownership check: last 5 apps from today with assignee
  const deskLike = await prisma.application.findMany({
    where: {
      organizationId: ORG,
      assignedEmployeeId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, assignedEmployeeId: true },
  });

  const report = {
    recentAppsChecked: recent.length,
    unassignedAmongRecent10: recent.filter((a) => !a.assignedEmployeeId).length,
    deskLikeAssignedSample: deskLike.length,
    readyAppId: readyApp?.id ?? null,
    readyAppAssigned: Boolean(readyApp?.assignedEmployeeId),
    readyHasQaPass,
    noQaBlocked: !noQa.ok,
    failQaBlocked: !failQa.ok,
    passQaOk: passQa.ok === true,
    staleMaterialBlocked: !staleMaterial.ok,
    whitespaceEvidenceBlocked: evidenceBlocked,
    storagePathOnlyOk: hasSubmissionEvidence({
      storagePath: "tenants/o/a/s/x.pdf",
    }),
    confirmationOnlyOk: hasSubmissionEvidence({
      confirmationEvidence: "ok",
    }),
    QaDecisionPASS: QaDecision.PASS,
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.noQaBlocked &&
    report.failQaBlocked &&
    report.passQaOk &&
    report.staleMaterialBlocked &&
    report.whitespaceEvidenceBlocked &&
    report.storagePathOnlyOk &&
    report.confirmationOnlyOk;

  if (!ok) {
    console.error("PHASE 5I live verification FAILED");
    process.exit(1);
  }
  console.log("PHASE 5I live authority helpers PASSED");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
