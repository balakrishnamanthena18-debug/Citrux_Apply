import { notFound, redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { markConversationReadAction } from "@/lib/communication/actions";
import { ConversationPane } from "@/components/messaging/ConversationPane";
import { mapActiveThread } from "@/components/messaging";

export default async function CandidateConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect(`/employee/messages/${id}`);

  const payload = await withRlsContext(ctx.userId, async (tx) => {
    const candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
    });
    if (!candidate) return null;

    const conversation = await tx.conversation.findUnique({
      where: { id },
      include: {
        candidate: { include: { user: true } },
        application: { include: { job: true } },
        messages: {
          include: { sender: true },
          orderBy: { createdAt: "asc" },
          take: 500,
        },
      },
    });

    if (!conversation || conversation.candidate.userId !== ctx.userId) {
      return null;
    }

    const recentApplications = await tx.application.findMany({
      where: {
        organizationId: ctx.organizationId,
        candidateId: candidate.id,
      },
      include: { job: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    return { conversation, recentApplications };
  });

  if (!payload) {
    notFound();
  }

  await markConversationReadAction({ conversationId: id }).catch(() => {});

  const activeThread = mapActiveThread(payload.conversation, {
    recentApplications: payload.recentApplications,
    recentTasks: [],
  });

  return (
    <ConversationPane
      thread={activeThread}
      currentUserId={ctx.userId}
      roleView="CANDIDATE"
      backHref="/candidate/messages"
      applicationHrefPrefix="/candidate/applications"
      allowInternalNotes={false}
    />
  );
}
