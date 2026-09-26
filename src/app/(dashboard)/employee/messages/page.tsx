import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import Link from "next/link";

export default async function EmployeeMessagesPage() {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const conversations = await withRlsContext(ctx.userId, async (tx) => {
    return tx.conversation.findMany({
      where: {
        organizationId: ctx.organizationId,
      },
      include: {
        candidate: {
          include: {
            user: true,
          },
        },
        application: {
          include: {
            job: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Candidate Communications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Realtime messaging with candidates across all applications
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {conversations.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-600">No active conversations found</p>
            <p className="text-xs text-slate-400 mt-1">
              Conversations initiated by candidates or staff will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {conversations.map((conv: any) => {
              const lastMsg = conv.messages[0];
              return (
                <Link
                  key={conv.id}
                  href={`/employee/messages/${conv.id}`}
                  className="p-5 flex items-center justify-between hover:bg-slate-50 transition block"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">
                        {[conv.candidate.user.firstName, conv.candidate.user.lastName].filter(Boolean).join(" ") || conv.candidate.user.email}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        ({conv.candidate.user.email})
                      </span>
                      {conv.application && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {conv.application.job.title}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800">{conv.subject}</p>
                    {lastMsg && (
                      <p className="text-xs text-slate-500 line-clamp-1">
                        <span className="font-medium text-slate-700">
                          {lastMsg.senderRole === "CANDIDATE" ? "Candidate: " : "Staff: "}
                        </span>
                        {lastMsg.body}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">
                      {new Date(conv.updatedAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-xs text-blue-600 font-medium hover:underline mt-1 inline-block">
                      Open thread →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
