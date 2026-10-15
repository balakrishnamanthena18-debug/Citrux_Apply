import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { AppShell } from "@/components/navigation/AppShell";
import { NavigationPerfProbe } from "@/components/navigation/NavigationPerfProbe";
import type { SubscriptionScope } from "@/lib/realtime";
import { buildCandidateRealtimeScope } from "@/lib/realtime/candidate-identity";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let ctx;
  try {
    ctx = await getAuthenticatedContext();
  } catch {
    redirect("/login");
  }

  let organizationName: string | undefined;
  let designationName: string | null = null;
  let isTeamLead = false;
  let isManager = false;

  try {
    const details = await withRlsContext(ctx.userId, async (tx) => {
      const mem = await tx.membership.findFirst({
        where: { id: ctx.membershipId },
        select: {
          isTeamLead: true,
          teamLeadOf: true,
          organization: { select: { name: true } },
          designation: { select: { name: true } },
        },
      });

      let manager = false;
      if (ctx.role !== "CANDIDATE") {
        const count = await tx.membership.count({
          where: {
            organizationId: ctx.organizationId,
            reportingManagerId: ctx.userId,
            status: "ACTIVE",
            role: { in: ["EMPLOYEE", "ADMIN"] },
          },
        });
        manager = count > 0;
      }

      return { mem, manager };
    });

    organizationName = details.mem?.organization?.name;
    designationName = details.mem?.designation?.name ?? null;
    isTeamLead = details.mem?.isTeamLead === true || Boolean(details.mem?.teamLeadOf?.trim());
    isManager = details.manager;
  } catch {
    // Graceful fallback to default organization name
  }

  // INTENTIONAL IDENTITY CONTRACT:
  // Candidate realtime channels are keyed by Auth/User.id (ctx.userId), NOT Prisma Candidate.id.
  // Publishers set event.candidateId to the candidate's User.id so subscribe/publish match.
  const realtimeScope: SubscriptionScope =
    ctx.role === "CANDIDATE"
      ? buildCandidateRealtimeScope({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        })
      : {
          role: ctx.role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          candidateId: null,
        };

  return (
    <>
      <RealtimeProvider scope={realtimeScope} />
      <RealtimeRefresher />
      <NavigationPerfProbe />
      <AppShell
        role={ctx.role}
        email={ctx.email}
        fullName={ctx.fullName}
        organizationName={organizationName}
        designationName={designationName}
        isTeamLead={isTeamLead}
        isManager={isManager}
        membershipId={ctx.membershipId}
      >
        {children}
      </AppShell>
    </>
  );
}
