import { ConversationPaneSkeleton } from "@/components/messaging/ConversationPaneSkeleton";

/**
 * Localized conversation-switch fallback only.
 * The Messages layout (list + workspace frame) stays mounted — do not
 * replace the entire messages segment with MessagesPageSkeleton here.
 */
export default function EmployeeMessagesLoading() {
  return <ConversationPaneSkeleton />;
}
