import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  verifyPrivacyRequestAction,
  completePrivacyRequestAction,
  rejectPrivacyRequestAction,
} from "@/lib/privacy/actions";
import { PrivacyRequestStatus, PrivacyRequestType, Role } from "@/generated/prisma";
import Link from "next/link";

export default async function AdminPrivacyPage() {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const requests = await withRlsContext(ctx.userId, async (tx) => {
    return tx.privacyRequest.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        candidate: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        requestedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        verifiedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        completedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Privacy & Data Subject Governance</h1>
          <p className="mt-1 text-sm text-slate-500">
            Admin-assisted privacy queue: Verify identity, execute export/correction, and conduct compliant data deletion preserving required records.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md hover:bg-slate-50 shadow-sm"
        >
          ← Back to Admin Console
        </Link>
      </div>

      {/* Overview Counts */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Pending Verification</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">
            {requests.filter((r) => r.status === PrivacyRequestStatus.PENDING).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Identity Verified / Ready</div>
          <div className="mt-1 text-2xl font-bold text-blue-600">
            {requests.filter((r) => r.status === PrivacyRequestStatus.IDENTITY_VERIFIED).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Completed Requests</div>
          <div className="mt-1 text-2xl font-bold text-green-600">
            {requests.filter((r) => r.status === PrivacyRequestStatus.COMPLETED).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Rejected Requests</div>
          <div className="mt-1 text-2xl font-bold text-slate-600">
            {requests.filter((r) => r.status === PrivacyRequestStatus.REJECTED).length}
          </div>
        </div>
      </div>

      {/* Privacy Requests Queue Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-900">Privacy Request Queue ({requests.length})</h2>
        </div>

        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Candidate & Request
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Timestamps & Governance
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Action & Governance Control
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">
                  No privacy requests currently in queue.
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">
                      {req.candidate.user.firstName} {req.candidate.user.lastName}
                    </div>
                    <div className="text-xs text-slate-500">{req.candidate.user.email}</div>
                    {req.scopeDetails && (
                      <div className="mt-1 text-xs text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200">
                        <span className="font-medium">Details:</span> {req.scopeDetails}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                        req.requestType === PrivacyRequestType.DATA_DELETION
                          ? "bg-red-100 text-red-800"
                          : req.requestType === PrivacyRequestType.DATA_EXPORT
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {req.requestType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        req.status === PrivacyRequestStatus.COMPLETED
                          ? "bg-green-100 text-green-800"
                          : req.status === PrivacyRequestStatus.IDENTITY_VERIFIED
                          ? "bg-blue-100 text-blue-800"
                          : req.status === PrivacyRequestStatus.PENDING
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 space-y-1">
                    <div>Requested: {new Date(req.requestedAt).toLocaleString()}</div>
                    {req.verifiedAt && (
                      <div className="text-blue-700">
                        Verified: {new Date(req.verifiedAt).toLocaleString()}
                        {req.verifiedBy && ` by ${req.verifiedBy.firstName} ${req.verifiedBy.lastName}`}
                      </div>
                    )}
                    {req.completedAt && (
                      <div className="text-green-700">
                        Completed: {new Date(req.completedAt).toLocaleString()}
                        {req.completedBy && ` by ${req.completedBy.firstName} ${req.completedBy.lastName}`}
                      </div>
                    )}
                    {req.resolutionNotes && (
                      <div className="text-slate-600 italic">Note: {req.resolutionNotes}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium space-y-2">
                    {/* Stage 1: Identity Verification (Staff or Admin) */}
                    {req.status === PrivacyRequestStatus.PENDING && (
                      <div className="flex flex-col items-end space-y-2">
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await verifyPrivacyRequestAction({
                              requestId: req.id,
                              verificationNotes: formData.get("notes") as string || "Identity verified via government ID and registered credentials",
                            });
                          }}
                        >
                          <input
                            type="hidden"
                            name="notes"
                            value="Identity verified by staff via registered credentials"
                          />
                          <button
                            type="submit"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded shadow-sm"
                          >
                            Verify Identity
                          </button>
                        </form>

                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await rejectPrivacyRequestAction({
                              requestId: req.id,
                              rejectionReason: formData.get("reason") as string || "Identity could not be verified",
                            });
                          }}
                        >
                          <input
                            type="hidden"
                            name="reason"
                            value="Unable to verify candidate identity"
                          />
                          <button
                            type="submit"
                            className="text-red-600 hover:text-red-900 text-xs underline"
                          >
                            Reject Request
                          </button>
                        </form>
                      </div>
                    )}

                    {/* Stage 2: Admin Execution (ADMIN only) */}
                    {req.status === PrivacyRequestStatus.IDENTITY_VERIFIED && ctx.role === Role.ADMIN && (
                      <div className="flex flex-col items-end space-y-2">
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await completePrivacyRequestAction({
                              requestId: req.id,
                              resolutionNotes:
                                req.requestType === PrivacyRequestType.DATA_DELETION
                                  ? "Candidate profile PII redacted and membership deactivated. Preserved required historical applications, submission records, and audit events."
                                  : req.requestType === PrivacyRequestType.DATA_EXPORT
                                  ? "Data export bundle compiled and provided."
                                  : "Data correction verified and updated.",
                            });
                          }}
                        >
                          <button
                            type="submit"
                            className={`px-3 py-1 rounded text-white shadow-sm font-medium ${
                              req.requestType === PrivacyRequestType.DATA_DELETION
                                ? "bg-red-600 hover:bg-red-700"
                                : "bg-green-600 hover:bg-green-700"
                            }`}
                          >
                            Execute {req.requestType.replace(/_/g, " ")}
                          </button>
                        </form>

                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await rejectPrivacyRequestAction({
                              requestId: req.id,
                              rejectionReason: formData.get("reason") as string || "Administrative review rejected request",
                            });
                          }}
                        >
                          <input
                            type="hidden"
                            name="reason"
                            value="Administrative review rejected request"
                          />
                          <button
                            type="submit"
                            className="text-red-600 hover:text-red-900 text-xs underline"
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                    )}

                    {req.status === PrivacyRequestStatus.IDENTITY_VERIFIED && ctx.role !== Role.ADMIN && (
                      <span className="text-xs text-slate-500 italic">
                        Verified. Awaiting Admin Execution.
                      </span>
                    )}

                    {req.status === PrivacyRequestStatus.COMPLETED && (
                      <span className="text-xs text-green-700 font-semibold">
                        ✓ Completed
                      </span>
                    )}

                    {req.status === PrivacyRequestStatus.REJECTED && (
                      <span className="text-xs text-slate-500 font-semibold">
                        ✕ Rejected
                      </span>
                    )}
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
