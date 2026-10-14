import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import EmployeeCandidatesListPage from "@/app/(dashboard)/employee/candidates/page";

export default async function AdminCandidatesPage(props: {
  searchParams: Promise<{ status?: string; search?: string; scope?: string }>;
}) {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  return <EmployeeCandidatesListPage {...props} />;
}

