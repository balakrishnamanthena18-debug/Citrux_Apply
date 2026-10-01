import { createClient } from "@/lib/supabase/client";
import { RealtimeEventPayload, SubscriptionScope, ConnectionStatus } from "./types";
import { realtimeBus } from "./event-bus";
import { getChannelName } from "./channels";

export { getChannelName } from "./channels";

export class RealtimeSubscriptionManager {
  private activeChannel: any = null;
  private status: ConnectionStatus = "disconnected";
  private statusListeners = new Set<(status: ConnectionStatus) => void>();

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    this.statusListeners.forEach((fn) => fn(newStatus));
  }

  /**
   * Initializes channel subscription for the authenticated scope.
   */
  public subscribe(scope: SubscriptionScope): () => void {
    this.unsubscribe(); // Clean up existing channel if any

    if (!scope.organizationId && scope.role !== "CANDIDATE") {
      return () => {};
    }

    const channelName = getChannelName(scope);
    this.setStatus("connecting");

    try {
      const supabase = createClient();
      if (!supabase?.channel) {
        this.setStatus("disconnected");
        return () => {};
      }

      this.activeChannel = supabase
        .channel(channelName)
        .on("broadcast", { event: "oos-operational-event" }, (payload: any) => {
          const event: RealtimeEventPayload = payload.payload;
          if (event) {
            // Verify event belongs to scope
            if (scope.role === "CANDIDATE") {
              if (event.candidateId && event.candidateId !== scope.candidateId && event.candidateId !== scope.userId) {
                return; // Suppress cross-candidate leakage
              }
            } else if (event.organizationId !== scope.organizationId) {
              return; // Suppress cross-tenant leakage
            }

            realtimeBus.dispatch(event);
          }
        })
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            this.setStatus("connected");
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            this.setStatus("reconnecting");
          } else if (status === "TIMED_OUT") {
            this.setStatus("disconnected");
          }
        });
    } catch {
      this.setStatus("disconnected");
    }

    return () => this.unsubscribe();
  }

  /**
   * Cleans up channel subscription gracefully.
   */
  public unsubscribe(): void {
    if (this.activeChannel) {
      try {
        const supabase = createClient();
        if (supabase?.removeChannel) {
          supabase.removeChannel(this.activeChannel);
        }
      } catch {
        // Best-effort cleanup
      }
      this.activeChannel = null;
    }
    this.setStatus("disconnected");
  }
}

export const realtimeSubscriptionManager = new RealtimeSubscriptionManager();
