/**
 * Gate 13.14 — verify Application status ≠ Intelligence readiness under
 * persisted CURRENT intelligence for key lifecycle statuses.
 */
import { config } from "dotenv";
config({ path: ".env" });

const STATUSES = [
  "PREPARING",
  "REVIEW",
  "AWAITING_APPROVAL",
  "READY",
  "SUBMITTED",
  "REJECTED",
] as const;

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const { withRlsContext } = await import("../src/lib/db/rls");
  const { loadStaffApplicationIntelligence } = await import(
    "../src/lib/application-intelligence/load-application-intelligence"
  );

  const appId = process.argv[2] ?? "eb211138-bbdf-4930-88d3-89284c2d3e73";

  try {
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: appId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        approvalStatus: true,
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

    const original = {
      status: app.status,
      approvalStatus: app.approvalStatus,
    };

    const rows: Array<Record<string, unknown>> = [];
    let ok = true;

    for (const status of STATUSES) {
      await prisma.application.update({
        where: { id: appId },
        data: { status },
      });

      const loaded = await withRlsContext(staff.userId, async (tx) =>
        loadStaffApplicationIntelligence({
          db: tx,
          applicationId: appId,
          organizationId: app.organizationId,
        })
      );

      const appNow = await prisma.application.findUniqueOrThrow({
        where: { id: appId },
        select: { status: true },
      });

      const readiness = loaded.ok ? loaded.view.readinessState : null;
      const phase = loaded.ok ? loaded.view.phase : null;
      const distinguishes =
        loaded.ok &&
        String(appNow.status) !== String(readiness) &&
        (phase === "CURRENT" || phase === "STALE") &&
        /advisory/i.test(loaded.view.messaging.body);

      if (!distinguishes) ok = false;
      rows.push({
        applicationStatus: appNow.status,
        intelligenceReadiness: readiness,
        phase,
        distinguishes,
      });
    }

    // Restore original status
    await prisma.application.update({
      where: { id: appId },
      data: {
        status: original.status,
        approvalStatus: original.approvalStatus,
      },
    });

    console.log(JSON.stringify({ ok, rows, restored: original }, null, 2));
    process.exit(ok ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
