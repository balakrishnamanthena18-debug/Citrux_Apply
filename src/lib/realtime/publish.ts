import { createClient } from "@supabase/supabase-js";
import { getChannelName } from "./channels";
import type { RealtimeEventPayload, SubscriptionScope } from "./types";
import { randomUUID } from "crypto";

/**
 * Best-effort server-side broadcast of operational events onto scoped channels.
 * Uses service role when available. Failures are swallowed — polling remains the fallback.
 * Payloads must stay metadata-only (no PII bodies, tokens, or secrets).
 */
export async function publishRealtimeEvent(
  scope: Pick<SubscriptionScope, "role" | "organizationId" | "userId" | "teamId" | "candidateId">,
  event: Omit<RealtimeEventPayload, "id" | "occurredAt" | "version" | "organizationId"> & {
    id?: string;
    occurredAt?: string;
    version?: number;
    organizationId?: string;
  }
): Promise<boolean> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return false;
  }

  try {
    const client = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload: RealtimeEventPayload = {
      id: event.id || randomUUID(),
      entityType: event.entityType,
      entityId: event.entityId,
      eventType: event.eventType,
      version: event.version ?? Date.now(),
      occurredAt: event.occurredAt || new Date().toISOString(),
      organizationId: event.organizationId || scope.organizationId,
      teamId: event.teamId ?? scope.teamId ?? null,
      candidateId: event.candidateId ?? scope.candidateId ?? null,
      data: event.data,
    };

    const channelName = getChannelName(scope as SubscriptionScope);
    const channel = client.channel(channelName);
    await channel.subscribe();
    const result = await channel.send({
      type: "broadcast",
      event: "oos-operational-event",
      payload,
    });
    try {
      await client.removeChannel(channel);
    } catch {
      // best-effort cleanup
    }
    return result === "ok";
  } catch {
    return false;
  }
}
