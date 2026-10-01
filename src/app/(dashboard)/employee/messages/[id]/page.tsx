import { getAuthenticatedContext, requireEmployeeOrAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { notFound } from "next/navigation";
import { ConversationPane } from "@/components/messaging/ConversationPane";
import { mapActiveThread } from "@/components/messaging";
import { markConversationReadAction } from "@/lib/communication/actions";

export default async function EmployeeMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  requireEmployeeOrAdmin(ctx);

  const payload = await withRlsContext(ctx.userId, async (tx) => {
    const conversation = await tx.conversation.findUnique({
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
          take: 500,
        },
      },
    });

    if (!conversation) {
      return null;
    }

    const candidateId = conversation.candidateId;
    const [recentApplications, recentTasks] = await Promise.all([
      tx.application.findMany({
        where: {
          organizationId: ctx.organizationId,
          candidateId,
        },
        include: { job: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      tx.task.findMany({
        where: {
          organizationId: ctx.organizationId,
          candidateId,
          status: { notIn: ["COMPLETED", "CANCELED"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
        },
      }),
    ]);

    return {
      conversation,
      recentApplications,
      recentTasks,
    };
  });

  if (!payload) {
    notFound();
  }

  await markConversationReadAction({ conversationId: id }).catch(() => {});

  const activeThread = mapActiveThread(payload.conversation, {
    recentApplications: payload.recentApplications,
    recentTasks: payload.recentTasks,
  });

  return (
    <ConversationPane
      thread={activeThread}
      currentUserId={ctx.userId}
      roleView="STAFF"
      backHref="/employee/messages"
      candidateProfileHref={`/employee/candidates/${activeThread.candidateId}`}
      applicationHrefPrefix="/employee/applications"
      taskHrefPrefix="/employee/tasks"
      allowInternalNotes
    />
  );
}
