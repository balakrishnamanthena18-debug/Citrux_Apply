import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { sendMessageAction, markConversationReadAction } from "@/lib/communication/actions";

export default async function CandidateConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect(`/employee/messages/${id}`);

  const conversation = await withRlsContext(ctx.userId, async (tx) => {
    return tx.conversation.findUnique({
      where: { id },
      include: {
        candidate: { include: { user: true } },
        application: { include: { job: true } },
        messages: {
          include: { sender: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  if (!conversation || (ctx.role === "CANDIDATE" && conversation.candidate.userId !== ctx.userId)) {
    notFound();
  }

  // Mark unread messages read on view
  await markConversationReadAction({ conversationId: conversation.id }).catch(() => {});

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
        <Link
          href="/candidate/messages"
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
        >
          ← Back to Messages
        </Link>
        <div className="h-4 w-px bg-slate-200"></div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">{conversation.subject}</h1>
          {conversation.application && (
            <p className="text-xs text-slate-500">
              Regarding: {conversation.application.job.title} at {conversation.application.job.companyName}
            </p>
          )}
        </div>
      </div>

      {/* Message History Thread */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-4 min-h-[350px] flex flex-col justify-between">
        <div className="space-y-4 overflow-y-auto max-h-[500px]">
          {conversation.messages.map((msg) => {
            const isMe = msg.senderId === ctx.userId;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1">
                  <span className="font-semibold text-slate-700">
                    {isMe ? "You" : [msg.sender.firstName, msg.sender.lastName].filter(Boolean).join(" ") || msg.sender.email}
                  </span>
                  <span>•</span>
                  <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {msg.readAt && isMe && <span>• Read</span>}
                </div>
                <div
                  className={`max-w-md rounded-lg px-4 py-2.5 text-xs whitespace-pre-wrap ${
                    isMe
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-800 border border-slate-200"
                  }`}
                >
                  {msg.body}
                </div>
              </div>
            );
          })}
        </div>

        {/* Message Input Box */}
        <form
          action={async (formData: FormData) => {
            "use server";
            await sendMessageAction({
              conversationId: conversation.id,
              body: formData.get("body") as string,
            });
          }}
          className="pt-4 border-t border-slate-100 flex gap-2"
        >
          <input
            name="body"
            required
            maxLength={4000}
            placeholder="Type your message reply..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            Send Reply
          </button>
        </form>
      </div>
    </div>
  );
}
