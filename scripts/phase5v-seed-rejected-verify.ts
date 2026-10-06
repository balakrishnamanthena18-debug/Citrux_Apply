/**
 * Phase 5V — seed one DISCOVERED → REJECTED sample for browser verification.
 * Run: npx --yes tsx scripts/phase5v-seed-rejected-verify.ts
 */
import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const id = "29b09e48-29cc-457a-b73b-123af6b8ca8c";
  const app = await prisma.application.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!app) {
    console.error("app not found");
    process.exit(1);
  }
  if (app.status === "REJECTED") {
    console.log(JSON.stringify({ id, status: "REJECTED", already: true }));
    await prisma.$disconnect();
    return;
  }
  if (app.status !== "DISCOVERED") {
    console.error("expected DISCOVERED, got", app.status);
    process.exit(1);
  }
  const staff = await prisma.user.findFirst({
    where: { email: "staff@citrux.com" },
    select: { id: true },
  });
  if (!staff) {
    console.error("staff@citrux.com not found");
    process.exit(1);
  }
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason:
          "Phase 5V browser verification — neutral guidance check",
      },
    });
    await tx.applicationStateHistory.create({
      data: {
        applicationId: id,
        fromStatus: "DISCOVERED",
        toStatus: "REJECTED",
        changedById: staff.id,
        reason: "Phase 5V browser verification",
      },
    });
  });
  console.log(JSON.stringify({ id, from: "DISCOVERED", to: "REJECTED" }));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
