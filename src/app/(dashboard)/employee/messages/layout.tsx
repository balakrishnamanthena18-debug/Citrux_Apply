import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  MessageWorkspace,
  mapConversationListItem,
} from "@/components/messaging";
import { displayName } from "@/components/messaging/types";

/**
 * Persistent Messages workspace shell for employee/admin.
 * Conversation list lives here so /messages ↔ /messages/[id] does not
 * remount the list or trip a full-page loading.tsx skeleton.
 */
export default async function EmployeeMessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const { conversations, candidates } = await withRlsContext(ctx.userId, async (tx) => {
    const [convs, cands] = await Promise.all([
      tx.conversation.findMany({
        where: { organizationId: ctx.organizationId },
        include: {
          candidate: { include: { user: true } },
          application: { include: { job: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      tx.candidate.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: { not: "ARCHIVED" },
        },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);
    return { conversations: convs, candidates: cands };
  });

  const list = conversations.map((c) => mapConversationListItem(c, ctx.userId));
  const candidateOptions = candidates.map((c) => ({
    id: c.id,
    name: displayName({
      firstName: c.user.firstName,
      lastName: c.user.lastName,
      email: c.user.email,
    }),
    email: c.user.email,
  }));

  return (
    <MessageWorkspace
      conversations={list}
      roleView="STAFF"
      basePath="/employee/messages"
      showNewMessage
      candidateOptions={candidateOptions}
    >
      {children}
    </MessageWorkspace>
  );
}
