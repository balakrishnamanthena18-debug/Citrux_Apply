import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/context";
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
      >
        {children}
      </AppShell>
    </>
  );
}
