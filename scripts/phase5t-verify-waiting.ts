/**
 * Phase 5T live Mumbai verification — waiting attribution samples.
 * Run: npx --yes tsx scripts/phase5t-verify-waiting.ts
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
  const { resolveWaitingAttribution } = await import(
    "../src/lib/application/operations-waiting"
  );

  const now = new Date();
  const statuses = [
    "READY",
    "PREPARING",
    "REVIEW",
    "AWAITING_APPROVAL",
    "SUBMITTED",
    "FAILED",
    "REJECTED",
    "WITHDRAWN",
  ] as const;

  const rows = [];
  for (const status of statuses) {
    const app = await prisma.application.findFirst({
      where: { status },
      select: {
        id: true,
        status: true,
        approvalRequestedAt: true,
        assignedEmployeeId: true,
        job: { select: { title: true, companyName: true } },
        assignedEmployee: {
          select: { email: true, firstName: true, lastName: true },
        },
        stateHistory: {
          orderBy: { createdAt: "desc" },
          select: { toStatus: true, createdAt: true, applicationId: true },
        },
      },
    });
    if (!app) {
      rows.push({ status, found: false });
      continue;
    }
    const entered = resolveCurrentStateEnteredAt(app.status, app.stateHistory);
    const waiting = resolveWaitingAttribution(app.status, now, {
      statusHistoryEnteredAt: entered,
      approvalRequestedAt: app.approvalRequestedAt,
    });
    rows.push({
      status,
      found: true,
      id: app.id,
      title: app.job.title,
      company: app.job.companyName,
      owner: app.assignedEmployee?.email ?? "Unassigned",
      waitingFor: waiting.waitingForLabel,
      expectedActor: waiting.expectedActor,
      waitingKind: waiting.waitingKind,
      waitingAge: waiting.waitingAgeLabel,
      hasApprovalRequestedAt: Boolean(app.approvalRequestedAt),
      stuckLanguage: false,
    });
  }

  console.log(JSON.stringify({ asOf: now.toISOString(), samples: rows }, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
