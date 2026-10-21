import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { DataQualityReviewWorkbench } from "@/components/admin/data-quality/DataQualityReviewWorkbench";

export const metadata = {
  title: "Data Quality Audit | Operations Operating System",
  description: "Inspection and human review dashboard for FreeHire job inventory audits.",
};

export default async function AdminDataQualityPage() {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  return <DataQualityReviewWorkbench />;
}
