/**
 * Phase 6C — service-level lifecycle verification against Mumbai.
 * Run: npx --yes tsx scripts/phase6c-verify-outcome-ledger.ts
 */
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const { withRlsContext } = await import("../src/lib/db/rls");
  const {
    createStaffOutcome,
    createCandidateReportedOutcome,
    verifyCandidateReportedOutcome,
    voidOutcome,
    listOutcomesForStaff,
    listOutcomesForCandidate,
  } = await import("../src/lib/application/outcome-service");

  const staff = await prisma.user.findFirst({
    where: { email: "staff@citrux.com" },
    select: { id: true },
  });
  if (!staff) throw new Error("staff@citrux.com not found");

  const membership = await prisma.membership.findFirst({
    where: { userId: staff.id, status: "ACTIVE" },
    select: { organizationId: true, role: true },
  });
  if (!membership) throw new Error("staff membership missing");

  const submitted = await prisma.application.findFirst({
    where: {
      organizationId: membership.organizationId,
      status: "SUBMITTED",
      submissions: { some: {} },
    },
    include: {
      candidate: { select: { userId: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!submitted) throw new Error("No SUBMITTED application with submissions");

  const staffCtx = {
    userId: staff.id,
    organizationId: membership.organizationId,
    role: membership.role as "EMPLOYEE" | "ADMIN",
    email: "staff@citrux.com",
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };

  const results: Record<string, unknown> = {
    applicationId: submitted.id,
    beforeStatus: submitted.status,
  };

  // A: staff RECRUITER_CONTACT — remains SUBMITTED
  const contact = await withRlsContext(staff.id, async (tx) =>
    createStaffOutcome(tx, staffCtx, {
      applicationId: submitted.id,
      outcomeType: "RECRUITER_CONTACT",
      notes: "Phase 6C verify A",
    })
  );
  results.A = { outcomeId: contact.id, provenance: contact.provenance };

  // C: candidate report INTERVIEW_REQUESTED
  const candCtx = {
    userId: submitted.candidate.userId,
    organizationId: membership.organizationId,
    role: "CANDIDATE" as const,
    email: "candidate",
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
  const reported = await withRlsContext(submitted.candidate.userId, async (tx) =>
    createCandidateReportedOutcome(tx, candCtx, {
      applicationId: submitted.id,
      outcomeType: "INTERVIEW_REQUESTED",
      notes: "Phase 6C verify C",
    })
  );
  results.C = {
    outcomeId: reported.id,
    provenance: reported.provenance,
  };

  // D/E: staff sees unverified, then verifies
  const beforeVerify = await withRlsContext(staff.id, async (tx) =>
    listOutcomesForStaff(tx, staffCtx, submitted.id)
  );
  const unverified = beforeVerify.find((o) => o.id === reported.id);
  results.D = {
    seen: Boolean(unverified),
    provenanceLabel: unverified?.provenanceLabel,
  };

  const verified = await withRlsContext(staff.id, async (tx) =>
    verifyCandidateReportedOutcome(tx, staffCtx, { outcomeId: reported.id })
  );
  results.E = {
    verifiedId: verified.id,
    provenance: verified.provenance,
  };

  // F: candidate sees verified (not raw enum)
  const candView = await withRlsContext(submitted.candidate.userId, async (tx) =>
    listOutcomesForCandidate(tx, candCtx, submitted.id)
  );
  results.F = {
    labels: candView.map((o) => o.label),
    hasInterview: candView.some((o) =>
      o.label.toLowerCase().includes("interview requested")
    ),
  };

  // G: chronological multi-event
  await withRlsContext(staff.id, async (tx) =>
    createStaffOutcome(tx, staffCtx, {
      applicationId: submitted.id,
      outcomeType: "INTERVIEW_SCHEDULED",
      occurredAt: new Date("2026-10-20T14:00:00.000Z"),
      notes: "Phase 6C verify G schedule",
    })
  );
  const chron = await withRlsContext(staff.id, async (tx) =>
    listOutcomesForStaff(tx, staffCtx, submitted.id)
  );
  results.G = {
    count: chron.length,
    types: chron.map((o) => o.outcomeType),
  };

  // H/I: void + history
  const toVoid = chron.find((o) => o.outcomeType === "RECRUITER_CONTACT");
  if (!toVoid) throw new Error("missing recruiter contact to void");
  await withRlsContext(staff.id, async (tx) =>
    voidOutcome(tx, staffCtx, {
      outcomeId: toVoid.id,
      reason: "Phase 6C verify H void incorrect",
    })
  );
  const activeAfter = await withRlsContext(staff.id, async (tx) =>
    listOutcomesForStaff(tx, staffCtx, submitted.id)
  );
  const hist = await withRlsContext(staff.id, async (tx) =>
    listOutcomesForStaff(tx, staffCtx, submitted.id, { includeInactive: true })
  );
  results.H = {
    voidedExcludedFromActive: !activeAfter.some((o) => o.id === toVoid.id),
  };
  results.I = {
    historyContainsVoided: hist.some(
      (o) => o.id === toVoid.id && o.correctionState === "VOIDED"
    ),
  };

  // J: EMPLOYER_REJECTION coupling on a separate SUBMITTED app if available
  const otherSubmitted = await prisma.application.findFirst({
    where: {
      organizationId: membership.organizationId,
      status: "SUBMITTED",
      id: { not: submitted.id },
      submissions: { some: {} },
    },
    select: { id: true, status: true },
    orderBy: { updatedAt: "desc" },
  });
  if (otherSubmitted) {
    await withRlsContext(staff.id, async (tx) =>
      createStaffOutcome(tx, staffCtx, {
        applicationId: otherSubmitted.id,
        outcomeType: "EMPLOYER_REJECTION",
        notes: "Phase 6C verify J atomic couple",
      })
    );
    const after = await prisma.application.findUnique({
      where: { id: otherSubmitted.id },
      select: { status: true },
    });
    const outcomes = await prisma.applicationOutcomeEvent.findMany({
      where: {
        applicationId: otherSubmitted.id,
        outcomeType: "EMPLOYER_REJECTION",
        correctionState: "ACTIVE",
      },
    });
    const history = await prisma.applicationStateHistory.findFirst({
      where: {
        applicationId: otherSubmitted.id,
        fromStatus: "SUBMITTED",
        toStatus: "REJECTED",
      },
      orderBy: { createdAt: "desc" },
    });
    results.J = {
      applicationId: otherSubmitted.id,
      status: after?.status,
      outcomeCount: outcomes.length,
      history: Boolean(history),
    };
  } else {
    results.J = { skipped: "no second SUBMITTED application" };
  }

  // K: early REJECTED does not fabricate employer outcome (forensic)
  const earlyRejected = await prisma.application.findFirst({
    where: {
      organizationId: membership.organizationId,
      status: "REJECTED",
      stateHistory: {
        some: {
          fromStatus: { in: ["DISCOVERED", "QUALIFIED"] },
          toStatus: "REJECTED",
        },
      },
    },
    select: { id: true },
  });
  if (earlyRejected) {
    const fabricated = await prisma.applicationOutcomeEvent.count({
      where: {
        applicationId: earlyRejected.id,
        outcomeType: "EMPLOYER_REJECTION",
      },
    });
    results.K = {
      applicationId: earlyRejected.id,
      employerRejectionCount: fabricated,
      ok: fabricated === 0,
    };
  } else {
    results.K = { skipped: "no early REJECTED sample" };
  }

  // Still SUBMITTED after non-rejection outcomes on primary app
  const primary = await prisma.application.findUnique({
    where: { id: submitted.id },
    select: { status: true },
  });
  results.primaryStillSubmitted = primary?.status === "SUBMITTED";

  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
