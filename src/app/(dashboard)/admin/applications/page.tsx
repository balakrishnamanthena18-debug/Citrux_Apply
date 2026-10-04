import { redirect } from "next/navigation";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";

/**
 * Legacy Application Operations Oversight route.
 *
 * Canonical destination is the Application Operations Console at
 * `/employee/applications` (EmployeeApplicationsWorkbench), which already
 * authorizes ADMIN via requireEmployeeOrAdmin.
 *
 * AdminApplicationsWorkbench is retained in the codebase but is no longer
 * the primary Applications navigation target.
 */
export default async function AdminApplicationsPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);
  redirect("/employee/applications");
}
