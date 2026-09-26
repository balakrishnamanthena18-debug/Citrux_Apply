import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { createPrivacyRequestAction } from "@/lib/privacy/actions";
import { PrivacyRequestType } from "@/generated/prisma";
import { redirect } from "next/navigation";

export default async function CandidatePrivacyPage() {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin/privacy");
  if (ctx.role === "EMPLOYEE") redirect("/employee");

  const { candidate, requests } = await withRlsContext(ctx.userId, async (tx) => {
    const cand = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });

    if (!cand) return { candidate: null, requests: [] };

    const reqs = await tx.privacyRequest.findMany({
      where: { candidateId: cand.id, organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
    });

    return { candidate: cand, requests: reqs };
  });

  if (!candidate) {
    return (
      <div className="p-8 text-center text-slate-600">
        Candidate profile not found.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Privacy Requests & Request History</h1>
        <p className="mt-1 text-sm text-slate-500">
          Candidate-initiated, Admin-assisted privacy requests and request history.
        </p>
      </div>

      {/* Workflow Explanation Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 text-xs text-slate-700 space-y-2.5">
        <div className="font-semibold text-slate-900 text-sm">Privacy Request Workflow:</div>
        <p className="text-slate-600">
          Requests submitted through this portal undergo identity verification by operations staff before being reviewed and executed by an organization administrator.
        </p>
        <ul className="list-disc list-inside space-y-1 text-slate-600 pt-1">
          <li>
            <strong className="text-slate-900">DATA EXPORT:</strong> Request a structured data package of your candidate profile, applications, documents metadata, and messages.
          </li>
          <li>
            <strong className="text-slate-900">DATA CORRECTION:</strong> Request rectification of biographical or contact details.
          </li>
          <li>
            <strong className="text-slate-900">DATA DELETION:</strong> Request profile PII deletion and redaction. Historical submission records, evidence, and audit trails remain preserved.
          </li>
        </ul>
      </div>

      {/* Submit New Request Form */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Submit a New Privacy Request</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            await createPrivacyRequestAction({
              requestType: formData.get("requestType") as PrivacyRequestType,
              scopeDetails: (formData.get("scopeDetails") as string) || undefined,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700">Request Type</label>
            <select
              name="requestType"
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 bg-white"
            >
              <option value="DATA_EXPORT">DATA EXPORT — Request machine-readable export bundle</option>
              <option value="DATA_CORRECTION">DATA CORRECTION — Request data rectification</option>
              <option value="DATA_DELETION">DATA DELETION — Request profile PII deletion and redaction</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Details or Specific Scope (Optional)
            </label>
            <textarea
              name="scopeDetails"
              rows={3}
              placeholder="Provide any specific context or details regarding your request..."
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 font-sans"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 shadow-sm transition"
            >
              Submit Privacy Request
            </button>
          </div>
        </form>
      </div>

      {/* Privacy Requests History Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-900">Your Privacy Requests ({requests.length})</h2>
        </div>

        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-6 py-3.5 text-left">Type</th>
              <th className="px-6 py-3.5 text-left">Status</th>
              <th className="px-6 py-3.5 text-left">Submitted Date</th>
              <th className="px-6 py-3.5 text-left">Resolution / Notes</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200 text-xs">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  You have not submitted any privacy requests yet.
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                        req.requestType === PrivacyRequestType.DATA_DELETION
                          ? "bg-rose-50 text-rose-800 border border-rose-200"
                          : req.requestType === PrivacyRequestType.DATA_EXPORT
                          ? "bg-blue-50 text-blue-800 border border-blue-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {req.requestType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        req.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : req.status === "REJECTED"
                          ? "bg-rose-50 text-rose-800 border border-rose-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                    {new Date(req.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-6 py-4 text-slate-600 max-w-xs truncate">
                    {req.resolutionNotes || "Under review by administration"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
