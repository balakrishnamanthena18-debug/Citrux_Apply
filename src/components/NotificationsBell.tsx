"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  listNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/communication/actions";
import { playNotificationSound } from "@/lib/utils/audio";

export function NotificationsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("oos_notification_sound_enabled");
      if (stored !== null) {
        return stored === "true";
      }
    }
    return true;
  });

  // Track whether we've completed the initial load so we only chime on new incoming items
  const isInitialLoadRef = useRef(true);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());

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
      // First load: just record known IDs without chiming
      items.forEach((n: any) => knownNotificationIdsRef.current.add(n.id));
      isInitialLoadRef.current = false;
    } else {
      // Check if there are newly arrived unread notifications
      let hasNewUnread = false;
      for (const n of items) {
        if (!knownNotificationIdsRef.current.has(n.id) && !n.readAt) {
          hasNewUnread = true;
          break;
        }
      }

      // Update known ID set
      items.forEach((n: any) => knownNotificationIdsRef.current.add(n.id));

      if (hasNewUnread && soundEnabled) {
        playNotificationSound();
      }
    }
  }, [soundEnabled]);

  const loadNotifications = useCallback(async () => {
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
    const fetchNotifications = async () => {
      try {
        const res = await fetch("/api/notifications?limit=15");
        if (isMounted && res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            processNotifications(json.data.notifications);
          }
        }
      } catch {
        // Best-effort network fetch
      }
    };

    fetchNotifications();

    const interval = setInterval(fetchNotifications, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [processNotifications]);

  const handleMarkRead = async (id: string) => {
    await markNotificationReadAction({ notificationId: id });
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsReadAction();
    loadNotifications();
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications();
        }}
        className="relative p-2 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 transition"
        title="Notifications"
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
