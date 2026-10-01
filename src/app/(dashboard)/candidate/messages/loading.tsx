import { ConversationPaneSkeleton } from "@/components/messaging/ConversationPaneSkeleton";

/** Localized conversation-switch fallback — list stays mounted in layout. */
export default function CandidateMessagesLoading() {
  return <ConversationPaneSkeleton />;
}
