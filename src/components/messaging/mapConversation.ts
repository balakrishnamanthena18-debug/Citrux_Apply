import {
  displayName,
  type MessagingActiveThread,
  type MessagingConversationListItem,
  type MessagingMessageItem,
} from "./types";

export function mapConversationListItem(
  conv: any,
  currentUserId: string
): MessagingConversationListItem {
  const candidateUser = conv.candidate?.user;
  const lastMsg = conv.messages?.[0];
  const candidateName = displayName({
    firstName: candidateUser?.firstName,
    lastName: candidateUser?.lastName,
    email: candidateUser?.email,
  });

  const unread = Boolean(
    lastMsg && !lastMsg.readAt && lastMsg.senderId !== currentUserId
  );

  return {
    id: conv.id,
    subject: conv.subject,
    updatedAt: new Date(conv.updatedAt).toISOString(),
    lastMessageAt: new Date(conv.lastMessageAt || conv.updatedAt).toISOString(),
    candidateId: conv.candidateId || conv.candidate?.id,
    candidateName,
    candidateEmail: candidateUser?.email || null,
    applicationId: conv.applicationId || conv.application?.id || null,
    jobTitle: conv.application?.job?.title || null,
    companyName: conv.application?.job?.companyName || null,
    lastMessageBody: lastMsg?.body || null,
    lastMessageSenderRole: lastMsg?.senderRole || null,
    lastMessageSenderId: lastMsg?.senderId || null,
    lastMessageReadAt: lastMsg?.readAt ? new Date(lastMsg.readAt).toISOString() : null,
    unread,
  };
}

export function mapActiveThread(
  conversation: any,
  extras?: {
    recentApplications?: any[];
    recentTasks?: any[];
  }
): MessagingActiveThread {
  const candidateUser = conversation.candidate?.user;
  const candidateName = displayName({
    firstName: candidateUser?.firstName,
    lastName: candidateUser?.lastName,
    email: candidateUser?.email,
  });

  const messages: MessagingMessageItem[] = (conversation.messages || []).map((msg: any) => ({
    id: msg.id,
    body: msg.body,
    createdAt: new Date(msg.createdAt).toISOString(),
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    readAt: msg.readAt ? new Date(msg.readAt).toISOString() : null,
    senderName: displayName({
      firstName: msg.sender?.firstName,
      lastName: msg.sender?.lastName,
      email: msg.sender?.email,
    }),
    senderEmail: msg.sender?.email || null,
  }));

  return {
    id: conversation.id,
    subject: conversation.subject,
    candidateId: conversation.candidateId || conversation.candidate?.id,
    candidateName,
    candidateEmail: candidateUser?.email || null,
    candidateStatus: conversation.candidate?.status || null,
    candidatePhone: conversation.candidate?.phone || null,
    candidateCity: conversation.candidate?.city || null,
    candidateCountry: conversation.candidate?.country || null,
    applicationId: conversation.applicationId || conversation.application?.id || null,
    jobTitle: conversation.application?.job?.title || null,
    companyName: conversation.application?.job?.companyName || null,
    applicationStatus: conversation.application?.status || null,
    messages,
    recentApplications: (extras?.recentApplications || []).map((app: any) => ({
      id: app.id,
      status: app.status,
      createdAt: new Date(app.createdAt).toISOString(),
      jobTitle: app.job?.title || "Application",
      companyName: app.job?.companyName || "",
    })),
    recentTasks: (extras?.recentTasks || []).map((task: any) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
    })),
  };
}
