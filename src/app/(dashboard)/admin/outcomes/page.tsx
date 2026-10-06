import { redirect } from "next/navigation";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { getOutcomeReportingData } from "@/lib/application/outcome-reporting";
import { OutcomeReportingDashboard } from "@/components/application/OutcomeReportingDashboard";

export default async function AdminOutcomeReportingPage() {
  let ctx;
  try {
    ctx = await getAuthenticatedContext();
    requireAdmin(ctx);
  } catch {
    redirect("/login");
  }

  const initialData = await withRlsContext(ctx.userId, async (tx) =>
    getOutcomeReportingData(tx, ctx, { dateRange: "all" })
  );

  return <OutcomeReportingDashboard initialData={initialData} role={ctx.role} />;
}
