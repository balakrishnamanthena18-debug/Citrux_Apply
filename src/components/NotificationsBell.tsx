"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/generated/prisma";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/communication/actions";
import { playNotificationSound } from "@/lib/utils/audio";
import { realtimeBus, realtimeSubscriptionManager } from "@/lib/realtime";
import type { ConnectionStatus, RealtimeEventPayload } from "@/lib/realtime";
import {
  formatNotificationRelativeTime,
  groupNotificationsByRecency,
  presentNotification,
  type NotificationIconKind,
  type NotificationPresentation,
  type NotificationRecordLike,
} from "@/lib/notifications/presentation";

/** Fallback poll when realtime is disconnected (ms). */
const FALLBACK_POLL_MS = 60_000;
/** Slow reconciliation poll even when realtime is healthy (ms). */
const HEALTHY_RECONCILE_MS = 5 * 60_000;
const TOAST_DISMISS_MS = 5_500;

function NotificationTypeIcon({ kind }: { kind: NotificationIconKind }) {
  const common = "h-[18px] w-[18px]";
  switch (kind) {
    case "message":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M8 10h8M8 14h5m7-9H4a1 1 0 00-1 1v14l4-3h12a1 1 0 001-1V6a1 1 0 00-1-1z"
          />
        </svg>
      );
    case "application":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v14l-7-3-7 3V6a2 2 0 012-2z"
          />
        </svg>
      );
    case "approval":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "document":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
          />
        </svg>
      );
    case "task":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M9 5h11M9 12h11M9 19h11M5 5h.01M5 12h.01M5 19h.01"
          />
        </svg>
      );
    case "interview":
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"
          />
        </svg>
      );
    default:
      return (
        <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      );
  }
}

function NotificationRow({
  presentation,
  notificationId,
  onOpen,
  onMarkRead,
  compact,
}: {
  presentation: NotificationPresentation;
  notificationId: string;
  onOpen: (id: string, href: string) => void;
  onMarkRead: (id: string) => void;
  compact?: boolean;
}) {
  const relative = formatNotificationRelativeTime(presentation.createdAt);
  const label = [
    presentation.headline,
    presentation.context,
    presentation.preview,
    relative,
    presentation.unread ? "Unread" : "Read",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <article
      className={`group relative flex gap-3 border border-[#DDE5E1] bg-white transition hover:border-[#12A150]/35 hover:bg-[#F7F9F8] focus-within:border-[#12A150] focus-within:ring-2 focus-within:ring-[#12A150]/20 ${
        compact ? "rounded-[14px] p-3" : "rounded-2xl p-3.5"
      } ${presentation.unread ? "shadow-[0_1px_0_rgba(18,161,80,0.12)]" : "shadow-[0_1px_2px_rgba(15,32,26,0.04)]"}`}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-[inherit] focus:outline-none"
        onClick={() => onOpen(notificationId, presentation.href)}
        aria-label={label}
      />
      <div
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          presentation.unread
            ? "bg-[#0B3B2C] text-[#C6F432]"
            : "bg-[#F7F9F8] text-[#66756E]"
        }`}
        aria-hidden
      >
        <NotificationTypeIcon kind={presentation.icon} />
      </div>
      <div className="relative z-10 min-w-0 flex-1 space-y-1 pointer-events-none">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            {presentation.unread && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#12A150]" aria-hidden />
            )}
            <h3 className="truncate text-[13px] font-semibold tracking-tight text-[#10201A]">
              {presentation.headline}
            </h3>
          </div>
          <time
            className="shrink-0 text-[10px] font-medium text-[#66756E]"
            dateTime={presentation.createdAt.toISOString()}
          >
            {relative}
          </time>
        </div>
        {presentation.context && (
          <p className="truncate text-xs font-medium text-[#0B3B2C]">{presentation.context}</p>
        )}
        {presentation.preview && (
          <p className="line-clamp-2 text-xs leading-relaxed text-[#66756E]">
            “{presentation.preview.replace(/^["“]|["”]$/g, "")}”
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] font-semibold text-[#12A150]">
            {presentation.actionLabel} →
          </span>
          {presentation.unread && (
            <button
              type="button"
              className="pointer-events-auto relative z-20 rounded-md px-2 py-1 text-[10px] font-semibold text-[#66756E] hover:bg-[#EDF1EF] hover:text-[#10201A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]"
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(notificationId);
              }}
            >
              Mark read
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function NotificationPanel({
  presentations,
  unreadCount,
  soundEnabled,
  onClose,
  onToggleSound,
  onMarkAllRead,
  onMarkRead,
  onOpen,
  variant,
}: {
  presentations: Array<{ id: string; presentation: NotificationPresentation }>;
  unreadCount: number;
  soundEnabled: boolean;
  onClose: () => void;
  onToggleSound: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onOpen: (id: string, href: string) => void;
  variant: "desktop" | "mobile";
}) {
  const grouped = useMemo(() => {
    const withDates = presentations.map((p) => ({
      ...p,
      createdAt: p.presentation.createdAt,
    }));
    return groupNotificationsByRecency(withDates);
  }, [presentations]);

  const renderGroup = (
    label: string,
    items: Array<{ id: string; presentation: NotificationPresentation }>
  ) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-2" aria-label={label}>
        <h4 className="px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#66756E]">
          {label}
        </h4>
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationRow
                notificationId={item.id}
                presentation={item.presentation}
                onOpen={onOpen}
                onMarkRead={onMarkRead}
                compact={variant === "desktop"}
              />
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div
      className={
        variant === "mobile"
          ? "flex max-h-[min(78vh,640px)] w-full flex-col overflow-hidden rounded-t-[20px] border border-[#DDE5E1] border-b-0 bg-white shadow-[0_-12px_40px_rgba(15,32,26,0.14)]"
          : "absolute right-0 z-50 mt-2 w-[min(100vw-2rem,380px)] overflow-hidden rounded-2xl border border-[#DDE5E1] bg-white shadow-[0_12px_32px_rgba(15,32,26,0.12)]"
      }
      role="dialog"
      aria-label="Notifications"
    >
      <div
        className={`relative flex items-center justify-between border-b border-[#EDF1EF] bg-[#F7F9F8] px-4 py-3 ${
          variant === "mobile" ? "pt-5" : ""
        }`}
      >
        {variant === "mobile" && (
          <div
            className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[#DDE5E1]"
            aria-hidden
          />
        )}
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#10201A]">
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
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150] ${
              soundEnabled
                ? "border-[#12A150]/25 bg-[#12A150]/8 text-[#0B3B2C]"
                : "border-[#DDE5E1] bg-white text-[#66756E]"
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
              className="text-xs font-semibold text-[#12A150] hover:text-[#0E8541] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]"
            >
              Mark all read
            </button>
          )}
          {variant === "mobile" && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#66756E] hover:bg-[#EDF1EF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]"
              aria-label="Close notifications"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        className={`space-y-4 overflow-y-auto px-3 py-3 ${
          variant === "mobile" ? "max-h-[min(58vh,480px)]" : "max-h-96"
        }`}
      >
        {presentations.length === 0 ? (
          <div className="space-y-1 p-8 text-center">
            <p className="text-sm font-semibold text-[#10201A]">No notifications yet</p>
            <p className="text-xs text-[#66756E]">
              Updates about applications, approvals, and messages will appear here.
            </p>
          </div>
        ) : (
          <>
            {renderGroup("Today", grouped.today)}
            {renderGroup("Earlier", grouped.earlier)}
          </>
        )}
      </div>
      {variant === "mobile" && (
        <div
          className="border-t border-[#EDF1EF] bg-white"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
        />
      )}
    </div>
  );
}

function IncomingToast({
  item,
  onOpen,
  onDismiss,
}: {
  item: { id: string; presentation: NotificationPresentation };
  onOpen: (id: string, href: string) => void;
  onDismiss: () => void;
}) {
  const label = [
    item.presentation.headline,
    item.presentation.context,
    item.presentation.preview,
    item.presentation.actionLabel,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div
      className="pointer-events-auto mx-auto w-full max-w-[430px] motion-safe:transition motion-safe:duration-200 motion-safe:ease-out"
      role="status"
      aria-live="polite"
    >
      <div className="relative overflow-hidden rounded-2xl border border-[#DDE5E1] bg-white shadow-[0_10px_28px_rgba(15,32,26,0.14)]">
        <div className="absolute left-0 top-0 h-full w-1 bg-[#12A150]" aria-hidden />
        {/* Entire card is the hit target: tap anywhere → open + dismiss */}
        <button
          type="button"
          className="flex w-full items-start gap-3 p-3.5 pl-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#12A150]"
          onClick={() => onOpen(item.id, item.presentation.href)}
          aria-label={label}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B3B2C] text-[#C6F432]"
            aria-hidden
          >
            <NotificationTypeIcon kind={item.presentation.icon} />
          </span>
          <span className="min-w-0 flex-1 pr-8">
            <span className="block text-[13px] font-semibold text-[#10201A]">
              {item.presentation.headline}
            </span>
            {item.presentation.context && (
              <span className="mt-0.5 block truncate text-xs font-medium text-[#0B3B2C]">
                {item.presentation.context}
              </span>
            )}
            {item.presentation.preview && (
              <span className="mt-1 block line-clamp-2 text-xs text-[#66756E]">
                “{item.presentation.preview.replace(/^["“]|["”]$/g, "")}”
              </span>
            )}
            <span className="mt-2 block text-[11px] font-semibold text-[#12A150]">
              {item.presentation.actionLabel} →
            </span>
          </span>
        </button>
        {/* Explicit dismiss — tap × removes toast without navigating */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#66756E] hover:bg-[#F7F9F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]"
          aria-label="Dismiss notification"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Authoritative notification UX for all dashboard roles (incl. candidates). */
export function NotificationsBell({ role }: { role: Role }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecordLike[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<{
    id: string;
    presentation: NotificationPresentation;
  } | null>(null);
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
  const isOpenRef = useRef(isOpen);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
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

  const presentations = useMemo(
    () =>
      notifications.map((n) => ({
        id: n.id,
        presentation: presentNotification(n, role),
      })),
    [notifications, role]
  );

  const showToast = useCallback(
    (record: NotificationRecordLike) => {
      if (isOpenRef.current) return;
      if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
        return;
      }
      const presentation = presentNotification(record, role);
      setToast({ id: record.id, presentation });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    },
    [role]
  );

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

  const processNotifications = useCallback(
    (items: NotificationRecordLike[]) => {
      setNotifications(items);
      const unread = items.filter((n) => !n.readAt).length;
      setUnreadCount(unread);

      if (isInitialLoadRef.current) {
        items.forEach((n) => knownNotificationIdsRef.current.add(n.id));
        isInitialLoadRef.current = false;
      } else {
        let newestUnread: NotificationRecordLike | null = null;
        for (const n of items) {
          if (!knownNotificationIdsRef.current.has(n.id) && !n.readAt) {
            newestUnread = n;
            break;
          }
        }
        items.forEach((n) => knownNotificationIdsRef.current.add(n.id));
        if (newestUnread) {
          if (soundEnabledRef.current) playNotificationSound();
          showToast(newestUnread);
        }
      }
    },
    [showToast]
  );

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

    // Defer below primary soft-nav / RSC work so notifications never contend
    // with click → useful on the session-mode pool.
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => startInitial(), { timeout: 4000 });
    } else {
      deferTimeout = setTimeout(startInitial, 1200);
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

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  const handleOpen = async (id: string, href: string) => {
    setIsOpen(false);
    dismissToast();
    void handleMarkRead(id);
    router.push(href);
  };

  const panelProps = {
    presentations,
    unreadCount,
    soundEnabled,
    onClose: () => setIsOpen(false),
    onToggleSound: toggleSound,
    onMarkAllRead: handleMarkAllRead,
    onMarkRead: handleMarkRead,
    onOpen: handleOpen,
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          dismissToast();
          if (!isOpen) void loadNotifications();
        }}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#66756E] transition hover:bg-[#F7F9F8] hover:text-[#10201A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150] sm:h-9 sm:w-9 sm:rounded-full"
        aria-label={
          connectionStatus === "connected"
            ? "Notifications (live)"
            : "Notifications (periodic sync)"
        }
        aria-expanded={isOpen}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#12A150] px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {toast && !isOpen && (
        <div
          className="pointer-events-none fixed inset-x-0 z-[70] px-3 md:hidden"
          style={{ top: "max(12px, env(safe-area-inset-top, 0px))" }}
        >
          <IncomingToast
            item={toast}
            onOpen={handleOpen}
            onDismiss={dismissToast}
          />
        </div>
      )}

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 hidden cursor-default md:block"
            aria-label="Dismiss notifications"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative z-50 hidden md:block">
            <NotificationPanel {...panelProps} variant="desktop" />
          </div>

          <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 bg-[#0B3B2C]/35 transition-opacity duration-200 motion-reduce:transition-none"
              aria-label="Dismiss notifications"
              onClick={() => setIsOpen(false)}
            />
            <div
              className="absolute inset-x-0 bottom-0 z-[61] px-0 transition-transform duration-200 ease-out motion-reduce:transition-none"
              style={{
                // Sit above the mobile tab bar (64px) + safe area; avoid clipped/overlapped sheets.
                paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <NotificationPanel {...panelProps} variant="mobile" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
