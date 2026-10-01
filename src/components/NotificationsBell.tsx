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

function NotificationPanel({
  notifications,
  unreadCount,
  soundEnabled,
  onClose,
  onToggleSound,
  onMarkAllRead,
  onMarkRead,
  variant,
}: {
  notifications: any[];
  unreadCount: number;
  soundEnabled: boolean;
  onClose: () => void;
  onToggleSound: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  variant: "desktop" | "mobile";
}) {
  return (
    <div
      className={
        variant === "mobile"
          ? "flex max-h-[min(80vh,640px)] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-[0_-12px_40px_rgba(15,23,32,0.18)]"
          : "absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[#E5EAE7] bg-white shadow-xl sm:w-96"
      }
      role="dialog"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between border-b border-[#EDF1EF] bg-[#F7F9F8] px-4 py-3">
        {variant === "mobile" && (
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[#DDE5E0]" aria-hidden />
        )}
        <div className={`flex min-w-0 items-center gap-2 ${variant === "mobile" ? "pt-2" : ""}`}>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0F1720]">
            Notifications
            {unreadCount > 0 ? ` · ${unreadCount}` : ""}
          </span>
          <button
            type="button"
            onClick={onToggleSound}
            title={
              soundEnabled
                ? "Notification sound enabled (Click to mute)"
                : "Notification sound muted (Click to enable)"
            }
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition ${
              soundEnabled
                ? "border-[#12A150]/25 bg-[#12A150]/8 text-[#0B3B2C]"
                : "border-[#E5EAE7] bg-white text-[#64748B]"
            }`}
          >
            {soundEnabled ? "Sound on" : "Muted"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-xs font-semibold text-[#12A150] hover:text-[#0E8541]"
            >
              Mark all read
            </button>
          )}
          {variant === "mobile" && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#EDF1EF]"
              aria-label="Close notifications"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        className={`divide-y divide-[#EDF1EF] overflow-y-auto ${
          variant === "mobile" ? "max-h-[min(60vh,480px)]" : "max-h-80"
        }`}
      >
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">No notifications yet.</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-3 p-3.5 transition hover:bg-[#F7F9F8] ${
                !n.readAt ? "bg-[#12A150]/[0.04]" : ""
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#0F1720]">{n.title}</span>
                  {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#12A150]" />}
                </div>
                <p className="text-xs leading-relaxed text-[#64748B]">{n.body}</p>
                <span className="text-[10px] text-[#94A3B8]">
                  {new Date(n.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {!n.readAt && (
                <button
                  type="button"
                  onClick={() => onMarkRead(n.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-[#64748B] hover:bg-[#EDF1EF] hover:text-[#0F1720]"
                  title="Mark as read"
                >
                  ✓
                </button>
              )}
            </div>
          ))
        )}
      </div>
      {variant === "mobile" && (
        <div
          className="border-t border-[#EDF1EF] bg-white"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        />
      )}
    </div>
  );
}

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

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    // Only lock scroll on small screens (mobile sheet).
    const mq = window.matchMedia("(max-width: 767px)");
    if (mq.matches) {
      document.body.style.overflow = "hidden";
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

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

  useEffect(() => {
    const onNotificationEvent = (event: RealtimeEventPayload) => {
      if (
        event.eventType === "NOTIFICATION_CREATED" ||
        event.eventType === "NOTIFICATION_READ" ||
        event.eventType === "NOTIFICATION_ALL_READ"
      ) {
        void loadNotifications();
      }
    };

    const unsubType = realtimeBus.subscribeToEntityType("Notification", onNotificationEvent);
    return () => {
      unsubType();
    };
  }, [loadNotifications]);

  const handleMarkRead = async (id: string) => {
    const previous = notifications;
    const previousUnread = unreadCount;
    const target = previous.find((n) => n.id === id);
    const wasUnread = target && !target.readAt;

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n))
    );
    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    try {
      await markNotificationReadAction({ notificationId: id });
    } catch {
      setNotifications(previous);
      setUnreadCount(previousUnread);
    }
  };

  const handleMarkAllRead = async () => {
    const previous = notifications;
    const previousUnread = unreadCount;
    const now = new Date().toISOString();

    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
    setUnreadCount(0);

    try {
      await markAllNotificationsReadAction();
    } catch {
      setNotifications(previous);
      setUnreadCount(previousUnread);
    }
  };

  const panelProps = {
    notifications,
    unreadCount,
    soundEnabled,
    onClose: () => setIsOpen(false),
    onToggleSound: toggleSound,
    onMarkAllRead: handleMarkAllRead,
    onMarkRead: handleMarkRead,
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) void loadNotifications();
        }}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#64748B] transition hover:bg-[#F7F9F8] hover:text-[#0F1720] sm:h-9 sm:w-9 sm:rounded-full"
        aria-label={
          connectionStatus === "connected"
            ? "Notifications (live)"
            : "Notifications (periodic sync)"
        }
        aria-expanded={isOpen}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Desktop popover */}
          <button
            type="button"
            className="fixed inset-0 z-40 hidden cursor-default md:block"
            aria-label="Dismiss notifications"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative z-50 hidden md:block">
            <NotificationPanel {...panelProps} variant="desktop" />
          </div>

          {/* Mobile bottom sheet */}
          <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 bg-[#0B3B2C]/35 transition-opacity duration-200"
              aria-label="Dismiss notifications"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 z-[61] transition-transform duration-200 ease-out">
              <NotificationPanel {...panelProps} variant="mobile" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
