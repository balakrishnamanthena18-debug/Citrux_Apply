import { config } from "dotenv";
config({ path: ".env" });
import { prisma } from "../src/lib/db/prisma";
import { withRlsContext } from "../src/lib/db/rls";
import {
  createStaffOutcome,
  createCandidateReportedOutcome,
  listOutcomesForCandidate,
} from "../src/lib/application/outcome-service";

async function main() {
  const appId = "c25b9013-ad32-4a94-b049-39ce05ada8a9";
  const staff = await prisma.user.findFirst({
    where: { email: "staff@citrux.com" },
  });
  const app = await prisma.application.findUnique({
    where: { id: appId },
    include: { candidate: true },
  });
  if (!staff || !app) throw new Error("missing staff or app");
  const m = await prisma.membership.findFirst({
    where: { userId: staff.id, status: "ACTIVE" },
  });
  if (!m) throw new Error("missing membership");

  const staffCtx = {
    userId: staff.id,
    organizationId: m.organizationId,
    role: m.role as "EMPLOYEE",
    email: "staff@citrux.com",
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };

  await withRlsContext(staff.id, async (tx) =>
    createStaffOutcome(tx, staffCtx, {
      applicationId: appId,
      outcomeType: "RECRUITER_CONTACT",
      notes: "Phase 6C browser B",
    })
  );

  const candCtx = {
    userId: app.candidate.userId,
    organizationId: app.organizationId,
    role: "CANDIDATE" as const,
    email: "alex",
    status: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };

  await withRlsContext(app.candidate.userId, async (tx) =>
    createCandidateReportedOutcome(tx, candCtx, {
      applicationId: appId,
      outcomeType: "INTERVIEW_REQUESTED",
      notes: "Phase 6C browser C",
    })
  );

  const view = await withRlsContext(app.candidate.userId, async (tx) =>
    listOutcomesForCandidate(tx, candCtx, appId)
  );
  console.log(
    JSON.stringify(
      view.map((v) => ({ label: v.label, provenance: v.provenance })),
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
