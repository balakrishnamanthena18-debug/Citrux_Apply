import Link from "next/link";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { createConversationAction } from "@/lib/communication/actions";
import { redirect } from "next/navigation";
import {
  MessageWorkspace,
  mapConversationListItem,
} from "@/components/messaging";

/**
 * Persistent candidate Messages workspace shell.
 * List stays mounted across /candidate/messages ↔ /[id] switches.
 */
export default async function CandidateMessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        candidate: {
          include: { user: true },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
    });

    return { candidate: cand, conversations: convs };
  });

  const list = conversations.map((c) => mapConversationListItem(c, ctx.userId));

  return (
    <div className="space-y-4">
      {candidate && (
        <details className="rounded-[16px] border border-[#E5EAE7] bg-white px-4 py-3 shadow-[0_10px_40px_rgba(15,23,32,0.03)]">
          <summary className="cursor-pointer text-sm font-semibold text-[#0F1720]">
            Start a new conversation
          </summary>
          <form
            action={async (formData: FormData) => {
              "use server";
              if (!candidate) return;
              const res = await createConversationAction({
                candidateId: candidate.id,
                subject: formData.get("subject") as string,
                initialMessage: formData.get("message") as string,
              });
              if (res.success && res.data?.conversationId) {
                redirect(`/candidate/messages/${res.data.conversationId}`);
              }
            }}
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input
              name="subject"
              required
              maxLength={200}
              placeholder="Subject"
              className="rounded-[10px] border border-[#DDE5E0] px-3 py-2 text-xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            />
            <input
              name="message"
              required
              maxLength={4000}
              placeholder="Initial message"
              className="rounded-[10px] border border-[#DDE5E0] px-3 py-2 text-xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150]"
            />
            <button
              type="submit"
              className="rounded-[10px] bg-[#12A150] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0E8541]"
            >
              Send
            </button>
          </form>
          <p className="mt-2 text-[11px] text-[#94A3B8]">
            Or continue an existing thread below.{" "}
            <Link href="/candidate/profile" className="font-semibold text-[#12A150]">
              Update profile
            </Link>
          </p>
        </details>
      )}

      <MessageWorkspace
        conversations={list}
        roleView="CANDIDATE"
        basePath="/candidate/messages"
      >
        {children}
      </MessageWorkspace>
    </div>
  );
}
