"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/lib/communication/actions";

export interface CandidateNotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  readAt?: string | Date | null;
  createdAt: string | Date;
}

interface Props {
  initialNotifications: CandidateNotificationItem[];
  onNotificationsChanged?: () => void;
}

export function CandidateNotificationCenter({
  initialNotifications,
  onNotificationsChanged,
}: Props) {
  const [notifications, setNotifications] = useState<CandidateNotificationItem[]>(
    initialNotifications
  );
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [isProcessing, setIsProcessing] = useState(false);

  const filterTabs = [
    { key: "ALL", label: "All Notifications" },
    { key: "UNREAD", label: "Unread Only" },
    { key: "APPLICATION", label: "Applications" },
    { key: "APPROVAL", label: "Approvals" },
    { key: "PROFILE", label: "Profile & Docs" },
    { key: "MESSAGE", label: "Messages" },
    { key: "SYSTEM", label: "System" },
  ];

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (selectedFilter === "UNREAD") return !n.readAt;
      if (selectedFilter === "APPLICATION") {
        return (
          n.type === "APPLICATION_STATUS_CHANGED" ||
          n.type === "APPLICATION_SUBMITTED" ||
          n.type === "SUBMISSION_ISSUE_REPORTED" ||
          n.type === "CORRECTION_REVIEW_STARTED"
        );
      }
      if (selectedFilter === "APPROVAL") {
        return (
          n.type === "CANDIDATE_APPROVAL_REQUESTED" ||
          n.type === "CANDIDATE_REVISION_REQUESTED"
        );
      }
      if (selectedFilter === "PROFILE") {
        return (
          n.relatedEntityType === "Candidate" ||
          n.relatedEntityType === "CandidateDocument" ||
          n.title.toLowerCase().includes("profile") ||
          n.title.toLowerCase().includes("document") ||
          n.title.toLowerCase().includes("resume")
        );
      }
      if (selectedFilter === "MESSAGE") {
        return n.type === "NEW_MESSAGE";
      }
      if (selectedFilter === "SYSTEM") {
        return n.type === "TASK_ASSIGNED" || n.relatedEntityType === "Organization";
      }
      return true;
    });
  }, [notifications, selectedFilter]);

  const handleMarkRead = async (notificationId: string) => {
    // Optimistic local update (0ms perceived latency)
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, readAt: new Date() } : n
      )
    );

    try {
      await markNotificationReadAction({ notificationId });
      onNotificationsChanged?.();
    } catch {
      // Best-effort
    }
  };

  const handleMarkAllRead = async () => {
    setIsProcessing(true);
    // Optimistic local update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: new Date() }))
    );

    try {
      await markAllNotificationsReadAction();
      onNotificationsChanged?.();
    } catch {
      // Best-effort
    } finally {
      setIsProcessing(false);
    }
  };

  const getTargetUrl = (n: CandidateNotificationItem): string => {
    if (n.relatedEntityType === "Application" && n.relatedEntityId) {
      return `/candidate/applications/${n.relatedEntityId}`;
    }
    if (n.type === "NEW_MESSAGE") {
      return `/candidate/messages`;
    }
    if (n.type === "CANDIDATE_APPROVAL_REQUESTED" && n.relatedEntityId) {
      return `/candidate/applications/${n.relatedEntityId}`;
    }
    return "/candidate";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Notification Center
          </h2>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
              {unreadCount} Unread
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={isProcessing}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 cursor-pointer"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="p-3 bg-slate-50/40 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto">
        {filterTabs.map((tab) => {
          const isSelected = selectedFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedFilter(tab.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 ${
                isSelected
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <div className="p-10 text-center text-slate-500 space-y-1">
          <div className="text-2xl">🔔</div>
          <h3 className="text-xs font-semibold text-slate-900">
            No notifications in this filter
          </h3>
          <p className="text-xs text-slate-400">
            You are completely caught up on candidate alerts and updates.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredNotifications.map((n) => {
            const isUnread = !n.readAt;
            const targetUrl = getTargetUrl(n);
            const timeAgo = new Date(n.createdAt).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            });

            return (
              <div
                key={n.id}
                className={`p-4 transition-colors flex items-start justify-between gap-3 text-xs ${
                  isUnread
                    ? "bg-blue-50/30 hover:bg-blue-50/60"
                    : "hover:bg-slate-50/70"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      isUnread ? "bg-blue-600" : "bg-transparent"
                    }`}
                  />
                  <div className="space-y-0.5 min-w-0">
                    <h4 className="font-semibold text-slate-900 text-xs">
                      {n.title}
                    </h4>
                    <p className="text-slate-600 leading-relaxed">{n.body}</p>
                    <div className="pt-1 flex items-center gap-3">
                      <Link
                        href={targetUrl}
                        className="font-medium text-blue-600 hover:text-blue-800 text-[11px] inline-flex items-center gap-1"
                      >
                        <span>Open Details</span>
                        <span>→</span>
                      </Link>
                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <span className="text-right text-slate-400 text-[11px] shrink-0">
                  {timeAgo}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
