import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EmployeeMessageComposer } from "./EmployeeMessageComposer";

export default async function EmployeeMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const conversation = await withRlsContext(ctx.userId, async (tx) => {
    return tx.conversation.findUnique({
      where: {
        id,
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
          include: {
            sender: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
  });

  if (!conversation) {
    notFound();
  }

  const candidateFullName =
    [conversation.candidate.user.firstName, conversation.candidate.user.lastName].filter(Boolean).join(" ") ||
    conversation.candidate.user.email;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <Link
            href="/employee/messages"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium mb-1 block"
          >
            ← Back to All Messages
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{conversation.subject}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span>
              Candidate:{" "}
              <strong className="text-slate-800">{candidateFullName}</strong> (
              {conversation.candidate.user.email})
            </span>
            {conversation.application && (
              <>
                <span>•</span>
                <span>Job: {conversation.application.job.title}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[550px]">
        {/* Messages scroll area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
          {conversation.messages.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-12">
              No messages in this conversation yet.
            </p>
          ) : (
            conversation.messages.map((msg: any) => {
              const isStaff = msg.senderRole !== "CANDIDATE";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isStaff ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-xs font-semibold text-slate-700">
                      {isStaff ? "Staff (" + msg.sender.email + ")" : candidateFullName}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className={`max-w-md p-3.5 rounded-2xl text-sm leading-relaxed ${
                      isStaff
                        ? "bg-blue-600 text-white rounded-tr-none shadow-sm"
                        : "bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Message composer */}
        <div className="p-4 bg-white border-t border-slate-200">
          <EmployeeMessageComposer conversationId={conversation.id} />
        </div>
      </div>
    </div>
  );
}
