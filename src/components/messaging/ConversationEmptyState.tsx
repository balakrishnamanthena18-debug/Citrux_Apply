export function ConversationEmptyState() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[#F7F9F8] px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#0B3B2C]/8 text-[#0B3B2C]">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <h2 className="text-base font-semibold tracking-[-0.02em] text-[#0F1720]">
          Select a conversation
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">
          Choose a thread from the left to review history, respond, and inspect linked
          operational context.
        </p>
      </div>
    </div>
  );
}
