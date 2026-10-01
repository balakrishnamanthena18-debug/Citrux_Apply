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
      <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F1720] tracking-tight">
            Candidate Communications
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Realtime messaging with candidates across all applications
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#E5EAE7] rounded-[20px] overflow-hidden shadow-[0_10px_40px_rgba(15,23,32,0.03)]">
        {conversations.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-[#64748B]">No active conversations found</p>
            <p className="text-xs text-[#94A3B8] mt-1">
              Conversations initiated by candidates or staff will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EDF1EF]">
            {conversations.map((conv) => {
              const lastMsg = conv.messages[0];
              const candidateUser = conv.candidate?.user;
              const candidateName =
                [candidateUser?.firstName, candidateUser?.lastName].filter(Boolean).join(" ") ||
                candidateUser?.email ||
                "Unknown candidate";
              const jobTitle = conv.application?.job?.title;

              return (
                <Link
                  key={conv.id}
                  href={`/employee/messages/${conv.id}`}
                  prefetch={false}
                  className="p-5 flex items-center justify-between hover:bg-[#F7F9F8] transition block"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-[#0F1720]">{candidateName}</span>
                      {candidateUser?.email && (
                        <span className="text-xs text-[#64748B] font-mono">
                          ({candidateUser.email})
                        </span>
                      )}
                      {jobTitle && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {jobTitle}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#0F1720]">{conv.subject}</p>
                    {lastMsg && (
                      <p className="text-xs text-[#64748B] line-clamp-1">
                        <span className="font-medium text-[#334155]">
                          {lastMsg.senderRole === "CANDIDATE" ? "Candidate: " : "Staff: "}
                        </span>
                        {lastMsg.body}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[#94A3B8] block">
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
