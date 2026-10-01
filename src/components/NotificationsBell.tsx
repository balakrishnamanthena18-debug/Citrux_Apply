"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/communication/actions";
import { playNotificationSound } from "@/lib/utils/audio";
import { realtimeBus, realtimeSubscriptionManager } from "@/lib/realtime";
import type { ConnectionStatus, RealtimeEventPayload } from "@/lib/realtime";

/** Fallback poll when realtime is disconnected (ms). */
const FALLBACK_POLL_MS = 60_000;
/** Slow reconciliation poll even when realtime is healthy (ms). */
const HEALTHY_RECONCILE_MS = 5 * 60_000;

export function NotificationsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() =>
    realtimeSubscriptionManager.getStatus()
  );
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("oos_notification_sound_enabled");
      if (stored !== null) {
        return stored === "true";
      }
    }
    return true;
  });

  const isInitialLoadRef = useRef(true);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const toggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    if (typeof window !== "undefined") {
      localStorage.setItem("oos_notification_sound_enabled", String(nextState));
    }
    if (nextState) {
      playNotificationSound();
    }
  };

  const processNotifications = useCallback((items: any[]) => {
    setNotifications(items);
    const unread = items.filter((n: any) => !n.readAt).length;
    setUnreadCount(unread);

    if (isInitialLoadRef.current) {
      items.forEach((n: any) => knownNotificationIdsRef.current.add(n.id));
      isInitialLoadRef.current = false;
    } else {
      let hasNewUnread = false;
      for (const n of items) {
        if (!knownNotificationIdsRef.current.has(n.id) && !n.readAt) {
          hasNewUnread = true;
          break;
        }
      }
      items.forEach((n: any) => knownNotificationIdsRef.current.add(n.id));
      if (hasNewUnread && soundEnabledRef.current) {
        playNotificationSound();
      }
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          processNotifications(json.data.notifications);
        }
      }
    } catch {
      // Best-effort network fetch
    }
  }, [processNotifications]);

  // Deferred initial fetch + adaptive polling + visibility pause.
  // Do NOT block first paint / competing RSC bandwidth: schedule the first
  // reconciliation after idle (or a short timeout fallback).
  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let idleId: number | null = null;
    let deferTimeout: ReturnType<typeof setTimeout> | null = null;
    let initialStarted = false;

    const tick = async () => {
      if (!isMounted) return;
      await loadNotifications();
    };

    const startInitial = () => {
      if (!isMounted || initialStarted) return;
      initialStarted = true;
      void tick();
    };

    const schedule = (status: ConnectionStatus) => {
      if (intervalId) clearInterval(intervalId);
      const ms = status === "connected" ? HEALTHY_RECONCILE_MS : FALLBACK_POLL_MS;
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          void tick();
        }
      }, ms);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => startInitial(), { timeout: 1500 });
    } else {
      deferTimeout = setTimeout(startInitial, 250);
    }

    schedule(realtimeSubscriptionManager.getStatus());

    const unsubStatus = realtimeSubscriptionManager.onStatusChange((status) => {
      if (!isMounted) return;
      setConnectionStatus(status);
      schedule(status);
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Visibility recovery stays best-effort and non-blocking.
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (deferTimeout) clearTimeout(deferTimeout);
      unsubStatus();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadNotifications]);

  // Wire RealtimeEventBus → targeted notification refresh (no full router.refresh)
  useEffect(() => {
    const onNotificationEvent = (event: RealtimeEventPayload) => {
      if (
        event.eventType === "NOTIFICATION_CREATED" ||
        event.eventType === "NOTIFICATION_READ" ||
        event.eventType === "NOTIFICATION_ALL_READ"
      ) {
        // Always reconcile from authoritative API (tenant/recipient scoped) —
        // never trust broadcast bodies for privileged list content.
        void loadNotifications();
      }
    };

    const unsubType = realtimeBus.subscribeToEntityType("Notification", onNotificationEvent);
    return () => {
      unsubType();
    };
  }, [loadNotifications]);

  const handleMarkRead = async (id: string) => {
    await markNotificationReadAction({ notificationId: id });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsReadAction();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
    );
    setUnreadCount(0);
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) void loadNotifications();
        }}
        className="relative p-2 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 transition"
        title={
          connectionStatus === "connected"
            ? "Notifications (live)"
            : "Notifications (periodic sync)"
        }
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-lg bg-white shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                Notifications ({unreadCount} unread)
              </span>
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? "Notification sound enabled (Click to mute)" : "Notification sound muted (Click to enable)"}
                className={`text-xs px-1.5 py-0.5 rounded border transition flex items-center gap-1 ${
                  soundEnabled
                    ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                    : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                }`}
              >
                <span>{soundEnabled ? "🔔 Sound ON" : "🔕 Muted"}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 transition hover:bg-slate-50 flex items-start justify-between gap-3 ${
                    !n.readAt ? "bg-blue-50/50" : ""
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">{n.title}</span>
                      {!n.readAt && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">{n.body}</p>
                    <span className="text-[10px] text-slate-400">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {!n.readAt && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 shrink-0"
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
