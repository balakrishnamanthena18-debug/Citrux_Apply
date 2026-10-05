import { describe, it, expect, beforeEach, vi } from "vitest";
import { realtimeBus } from "@/lib/realtime/event-bus";
import { getChannelName, RealtimeSubscriptionManager } from "@/lib/realtime/subscription-manager";
import type { RealtimeEventPayload, SubscriptionScope } from "@/lib/realtime/types";

describe("Targeted Realtime Event Bus & Deduplication Unit Tests", () => {
  beforeEach(() => {
    realtimeBus.reset();
  });

  describe("1. Scoped Channel Name Generation & Tenant Isolation", () => {
    it("generates isolated candidate channel from the Auth/User.id channel key", () => {
      // Production sets scope.candidateId = userId (not Prisma Candidate.id).
      const scope: SubscriptionScope = {
        role: "CANDIDATE",
        organizationId: "org-1",
        userId: "user-cand-1",
        candidateId: "user-cand-1",
      };
      expect(getChannelName(scope)).toBe("candidate:user-cand-1");
    });

    it("falls back to userId when candidateId is omitted", () => {
      const scope: SubscriptionScope = {
        role: "CANDIDATE",
        organizationId: "org-1",
        userId: "user-cand-1",
      };
      expect(getChannelName(scope)).toBe("candidate:user-cand-1");
    });

    it("generates team-scoped channel for Team Leads with a team assignment", () => {
      const scope: SubscriptionScope = {
        role: "TEAM_LEAD",
        organizationId: "org-1",
        userId: "user-tl-1",
        teamId: "team-alpha",
      };
      expect(getChannelName(scope)).toBe("team:org-1:team-alpha");
    });

    it("generates organization-scoped channel for Admins and Employees", () => {
      const scope: SubscriptionScope = {
        role: "ADMIN",
        organizationId: "org-xyz",
        userId: "user-admin-1",
      };
      expect(getChannelName(scope)).toBe("org:org-xyz");
    });
  });

  describe("2. Targeted Entity Subscriptions & Zero-Refresh Dispatch", () => {
    it("dispatches events strictly to listeners subscribed to the specific entity", () => {
      const specificListener = vi.fn();
      const unrelatedListener = vi.fn();

      realtimeBus.subscribeToEntity("Task", "task-100", specificListener);
      realtimeBus.subscribeToEntity("Task", "task-200", unrelatedListener);

      const event: RealtimeEventPayload = {
        id: "evt-1",
        entityType: "Task",
        entityId: "task-100",
        eventType: "TASK_ASSIGNED",
        version: 1,
        occurredAt: new Date().toISOString(),
        organizationId: "org-1",
      };

      const processed = realtimeBus.dispatch(event);

      expect(processed).toBe(true);
      expect(specificListener).toHaveBeenCalledWith(event);
      expect(unrelatedListener).not.toHaveBeenCalled();
    });

    it("dispatches entity-type scoped events correctly across multiple instances", () => {
      const taskListener = vi.fn();
      const appListener = vi.fn();

      realtimeBus.subscribeToEntityType("Task", taskListener);
      realtimeBus.subscribeToEntityType("Application", appListener);

      const taskEvent: RealtimeEventPayload = {
        id: "evt-task-1",
        entityType: "Task",
        entityId: "task-abc",
        eventType: "TASK_COMPLETED",
        version: 1,
        occurredAt: new Date().toISOString(),
        organizationId: "org-1",
      };

      realtimeBus.dispatch(taskEvent);

      expect(taskListener).toHaveBeenCalledWith(taskEvent);
      expect(appListener).not.toHaveBeenCalled();
    });
  });

  describe("3. Duplicate Event Suppression", () => {
    it("rejects duplicate events with the exact same event UUID", () => {
      const listener = vi.fn();
      realtimeBus.subscribeToEntity("Task", "task-1", listener);

      const event: RealtimeEventPayload = {
        id: "duplicate-event-uuid-1",
        entityType: "Task",
        entityId: "task-1",
        eventType: "TASK_UPDATED",
        version: 1,
        occurredAt: new Date().toISOString(),
        organizationId: "org-1",
      };

      const firstDispatch = realtimeBus.dispatch(event);
      const secondDispatch = realtimeBus.dispatch(event);

      expect(firstDispatch).toBe(true);
      expect(secondDispatch).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Out-of-Order / Stale Event Rejection", () => {
    it("rejects incoming stale events with an older or equal version number", () => {
      const listener = vi.fn();
      realtimeBus.subscribeToEntity("Application", "app-1", listener);

      const newerEvent: RealtimeEventPayload = {
        id: "evt-newer",
        entityType: "Application",
        entityId: "app-1",
        eventType: "APPLICATION_APPROVED",
        version: 10,
        occurredAt: new Date().toISOString(),
        organizationId: "org-1",
      };

      const staleEvent: RealtimeEventPayload = {
        id: "evt-stale",
        entityType: "Application",
        entityId: "app-1",
        eventType: "APPLICATION_AWAITING_APPROVAL",
        version: 5, // older than 10
        occurredAt: new Date().toISOString(),
        organizationId: "org-1",
      };

      expect(realtimeBus.dispatch(newerEvent)).toBe(true);
      expect(realtimeBus.dispatch(staleEvent)).toBe(false); // suppressed

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(newerEvent);
    });
  });

  describe("5. Subscription Teardown & Memory Management", () => {
    it("cleans up listener registrations upon unsubscribe to prevent leaks", () => {
      const listener = vi.fn();
      const unsubscribe = realtimeBus.subscribeToEntity("Notification", "notif-1", listener);

      unsubscribe();

      const event: RealtimeEventPayload = {
        id: "evt-notif-1",
        entityType: "Notification",
        entityId: "notif-1",
        eventType: "NOTIFICATION_READ",
        version: 1,
        occurredAt: new Date().toISOString(),
        organizationId: "org-1",
      };

      realtimeBus.dispatch(event);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
