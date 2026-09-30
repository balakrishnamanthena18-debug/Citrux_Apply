import { RealtimeEntityType, RealtimeEventPayload } from "./types";

type RealtimeListener<T = any> = (event: RealtimeEventPayload<T>) => void;

class RealtimeEventBus {
  private entityListeners = new Map<string, Set<RealtimeListener>>();
  private typeListeners = new Map<RealtimeEntityType, Set<RealtimeListener>>();
  private globalListeners = new Set<RealtimeListener>();

  // Deduplication cache: keeps track of recent event IDs (capped at 500)
  private processedEventIds = new Set<string>();
  private processedIdQueue: string[] = [];
  private static readonly MAX_DEDUP_SIZE = 500;

  // Stale event protection: entityKey -> highest version processed
  private entityVersions = new Map<string, number>();

  /**
   * Subscribe to events for a specific entity ID.
   */
  public subscribeToEntity<T = any>(
    entityType: RealtimeEntityType,
    entityId: string,
    listener: RealtimeListener<T>
  ): () => void {
    const key = `${entityType}:${entityId}`;
    if (!this.entityListeners.has(key)) {
      this.entityListeners.set(key, new Set());
    }
    this.entityListeners.get(key)!.add(listener);

    return () => {
      const listeners = this.entityListeners.get(key);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.entityListeners.delete(key);
        }
      }
    };
  }

  /**
   * Subscribe to all events of a specific entity type (e.g., all Task events).
   */
  public subscribeToEntityType<T = any>(
    entityType: RealtimeEntityType,
    listener: RealtimeListener<T>
  ): () => void {
    if (!this.typeListeners.has(entityType)) {
      this.typeListeners.set(entityType, new Set());
    }
    this.typeListeners.get(entityType)!.add(listener);

    return () => {
      const listeners = this.typeListeners.get(entityType);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.typeListeners.delete(entityType);
        }
      }
    };
  }

  /**
   * Subscribe to all realtime events globally across the client app.
   */
  public subscribeGlobal(listener: RealtimeListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Dispatches an incoming realtime event to appropriate targeted listeners.
   * Enforces deduplication and stale event checks.
   * Returns true if processed, false if skipped as duplicate/stale.
   */
  public dispatch(event: RealtimeEventPayload): boolean {
    if (!event?.id || !event.entityType || !event.entityId) {
      return false;
    }

    // 1. Deduplication check
    if (this.processedEventIds.has(event.id)) {
      return false; // Duplicate event ignored
    }

    // 2. Stale event check
    const entityKey = `${event.entityType}:${event.entityId}`;
    const latestVersion = this.entityVersions.get(entityKey) ?? -1;
    if (event.version !== undefined && event.version <= latestVersion) {
      return false; // Stale event ignored
    }

    // Record event ID in dedup cache
    this.processedEventIds.add(event.id);
    this.processedIdQueue.push(event.id);
    if (this.processedIdQueue.length > RealtimeEventBus.MAX_DEDUP_SIZE) {
      const oldestId = this.processedIdQueue.shift();
      if (oldestId) this.processedEventIds.delete(oldestId);
    }

    // Record highest version
    if (event.version !== undefined) {
      this.entityVersions.set(entityKey, event.version);
    }

    // 3. Dispatch to entity-specific listeners
    const specificListeners = this.entityListeners.get(entityKey);
    if (specificListeners) {
      specificListeners.forEach((fn) => {
        try {
          fn(event);
        } catch {
          // Prevent listener errors from breaking event bus
        }
      });
    }

    // 4. Dispatch to entity-type listeners
    const typeScopedListeners = this.typeListeners.get(event.entityType);
    if (typeScopedListeners) {
      typeScopedListeners.forEach((fn) => {
        try {
          fn(event);
        } catch {
          // Prevent listener errors from breaking event bus
        }
      });
    }

    // 5. Dispatch to global listeners
    this.globalListeners.forEach((fn) => {
      try {
        fn(event);
      } catch {
        // Prevent listener errors from breaking event bus
      }
    });

    return true;
  }

  /**
   * Clears internal event caches (useful in test teardown).
   */
  public reset(): void {
    this.entityListeners.clear();
    this.typeListeners.clear();
    this.globalListeners.clear();
    this.processedEventIds.clear();
    this.processedIdQueue = [];
    this.entityVersions.clear();
  }
}

export const realtimeBus = new RealtimeEventBus();
