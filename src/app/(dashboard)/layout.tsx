import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";
import { AppShell } from "@/components/navigation/AppShell";

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

  return (
    <>
      <RealtimeRefresher />
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
