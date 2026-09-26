"use client";

import { useState } from "react";
import { sendMessageAction } from "@/lib/communication/actions";

export function EmployeeMessageComposer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setLoading(true);
    setError(null);
    const res = await sendMessageAction({
      conversationId,
      body: body.trim(),
    });

    if (res.success) {
      setBody("");
    } else {
      setError(res.error || "Failed to send message");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSend} className="space-y-2">
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      <div className="flex items-end gap-3">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a response to the candidate..."
          className="flex-1 rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          disabled={loading}
          required
        />
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50 h-[42px] shrink-0"
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
