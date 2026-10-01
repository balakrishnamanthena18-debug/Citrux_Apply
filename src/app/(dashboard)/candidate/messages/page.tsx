import Link from "next/link";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { createConversationAction } from "@/lib/communication/actions";
import { redirect } from "next/navigation";

export default async function CandidateMessagesPage() {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect("/employee/messages");

  const { candidate, conversations } = await withRlsContext(ctx.userId, async (tx) => {
    const cand = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });
    if (!cand) return { candidate: null, conversations: [] };

    const convs = await tx.conversation.findMany({
      where: { candidateId: cand.id, organizationId: ctx.organizationId },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        application: {
          include: { job: true },
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    return { candidate: cand, conversations: convs };
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#E5EAE7] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#0F1720] tracking-tight">Messages & Communications</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Direct, transparent communication with your assigned operations specialists.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: New Conversation Starter */}
        <div className="bg-white p-6 rounded-[16px] border border-[#E5EAE7] shadow-[0_10px_40px_rgba(15,23,32,0.03)] space-y-4">
          <h2 className="text-sm font-bold text-[#0F1720] uppercase tracking-wide">Start a New Conversation</h2>
          <form
            action={async (formData: FormData) => {
              "use server";
              if (!candidate) return;
              await createConversationAction({
                candidateId: candidate.id,
                subject: formData.get("subject") as string,
                initialMessage: formData.get("message") as string,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label className="block text-xs font-semibold text-[#334155]">Subject</label>
              <input
                name="subject"
                required
                maxLength={200}
                placeholder="Question about profile / applications..."
                className="mt-1 block w-full rounded-md border border-[#DDE5E0] px-3 py-1.5 text-xs focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#334155]">Message</label>
              <textarea
                name="message"
                required
                rows={4}
                maxLength={4000}
                placeholder="Write your message here..."
                className="mt-1 block w-full rounded-md border border-[#DDE5E0] px-3 py-1.5 text-xs focus:ring-1 focus:ring-slate-900 font-sans"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Send Message
            </button>
          </form>
        </div>

        {/* Right: Conversation List */}
        <div className="md:col-span-2 space-y-3">
          <h2 className="text-sm font-bold text-[#0F1720] uppercase tracking-wide">Your Conversations</h2>
          {conversations.length === 0 ? (
            <div className="bg-white p-8 rounded-[16px] border border-[#E5EAE7] text-center text-xs text-[#64748B]">
              No conversations yet. Start a conversation on the left to message your specialist.
            </div>
          ) : (
            conversations.map((conv) => {
              const lastMsg = conv.messages[0];
              const isUnread = lastMsg && lastMsg.senderId !== ctx.userId && !lastMsg.readAt;

              return (
                <Link
                  key={conv.id}
                  href={`/candidate/messages/${conv.id}`}
                  prefetch={false}
                  className={`block p-4 rounded-[16px] border transition hover:shadow-[0_10px_40px_rgba(15,23,32,0.03)] ${
                    isUnread ? "bg-blue-50/40 border-blue-200" : "bg-white border-[#E5EAE7] hover:border-[#DDE5E0]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#0F1720]">{conv.subject}</span>
                      {isUnread && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">
                          NEW
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#94A3B8]">
                      {new Date(conv.lastMessageAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  </div>

                  {conv.application && (
                    <div className="mt-1 text-[11px] text-[#64748B] font-medium">
                      Linked Application: {conv.application.job.title} at {conv.application.job.companyName}
                    </div>
                  )}

                  {lastMsg && (
                    <p className="mt-2 text-xs text-[#64748B] line-clamp-1">
                      <span className="font-semibold">{lastMsg.senderRole === "CANDIDATE" ? "You: " : "Staff: "}</span>
                      {lastMsg.body}
                    </p>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
