import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { AppShell } from "@/components/navigation/AppShell";
import { NavigationPerfProbe } from "@/components/navigation/NavigationPerfProbe";
import type { SubscriptionScope } from "@/lib/realtime";

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

  const realtimeScope: SubscriptionScope = {
    role: ctx.role === "CANDIDATE" ? "CANDIDATE" : ctx.role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    // Candidate channels key off userId until candidateId is resolved client-side
    candidateId: ctx.role === "CANDIDATE" ? ctx.userId : null,
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
