import type { ReactNode } from "react";
import type { Role } from "@/generated/prisma";

export type MobileTabItem = {
  id: string;
  label: string;
  href: string;
  match: (pathname: string) => boolean;
  icon: (active: boolean) => ReactNode;
};

function iconClass(active: boolean) {
  return `h-[22px] w-[22px] ${active ? "text-[#12A150]" : "text-[#94A3B8]"}`;
}

const homeIcon = (active: boolean) => (
  <svg className={iconClass(active)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={active ? 2.2 : 1.8}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  </svg>
);

const appsIcon = (active: boolean) => (
  <svg className={iconClass(active)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={active ? 2.2 : 1.8}
      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
    />
  </svg>
);

const tasksIcon = (active: boolean) => (
  <svg className={iconClass(active)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={active ? 2.2 : 1.8}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
);

const messagesIcon = (active: boolean) => (
  <svg className={iconClass(active)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={active ? 2.2 : 1.8}
      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
    />
  </svg>
);

const moreIcon = (active: boolean) => (
  <svg className={iconClass(active)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={active ? 2.2 : 1.8}
      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
    />
  </svg>
);

const profileIcon = (active: boolean) => (
  <svg className={iconClass(active)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={active ? 2.2 : 1.8}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

function startsWithPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Primary mobile tab destinations derived from existing role navigation.
 * "More" opens the existing drawer (full nav) — not a fake route.
 */
export function getMobileTabItems(role: Role): MobileTabItem[] {
  if (role === "CANDIDATE") {
    return [
      {
        id: "home",
        label: "Home",
        href: "/candidate",
        match: (p) => p === "/candidate",
        icon: homeIcon,
      },
      {
        id: "apps",
        label: "Apps",
        href: "/candidate/applications",
        match: (p) => startsWithPath(p, "/candidate/applications"),
        icon: appsIcon,
      },
      {
        id: "messages",
        label: "Messages",
        href: "/candidate/messages",
        match: (p) => startsWithPath(p, "/candidate/messages"),
        icon: messagesIcon,
      },
      {
        id: "profile",
        label: "Profile",
        href: "/candidate/profile",
        match: (p) => startsWithPath(p, "/candidate/profile"),
        icon: profileIcon,
      },
      {
        id: "more",
        label: "More",
        href: "#more",
        match: () => false,
        icon: moreIcon,
      },
    ];
  }

  if (role === "EMPLOYEE") {
    return [
      {
        id: "home",
        label: "Home",
        href: "/employee",
        match: (p) => p === "/employee",
        icon: homeIcon,
      },
      {
        id: "apps",
        label: "Apps",
        href: "/employee/applications",
        match: (p) =>
          startsWithPath(p, "/employee/applications") ||
          startsWithPath(p, "/employee/application-log"),
        icon: appsIcon,
      },
      {
        id: "tasks",
        label: "Tasks",
        href: "/employee/tasks",
        match: (p) => startsWithPath(p, "/employee/tasks"),
        icon: tasksIcon,
      },
      {
        id: "messages",
        label: "Messages",
        href: "/employee/messages",
        match: (p) => startsWithPath(p, "/employee/messages"),
        icon: messagesIcon,
      },
      {
        id: "more",
        label: "More",
        href: "#more",
        match: () => false,
        icon: moreIcon,
      },
    ];
  }

  // ADMIN
  return [
    {
      id: "home",
      label: "Home",
      href: "/admin",
      match: (p) => p === "/admin" || p === "/admin/dashboard",
      icon: homeIcon,
    },
    {
      id: "apps",
      label: "Apps",
      href: "/admin/applications",
      match: (p) => startsWithPath(p, "/admin/applications"),
      icon: appsIcon,
    },
    {
      id: "tasks",
      label: "Tasks",
      href: "/employee/tasks",
      match: (p) =>
        startsWithPath(p, "/employee/tasks") || startsWithPath(p, "/admin/tasks"),
      icon: tasksIcon,
    },
    {
      id: "messages",
      label: "Messages",
      href: "/employee/messages",
      match: (p) => startsWithPath(p, "/employee/messages"),
      icon: messagesIcon,
    },
    {
      id: "more",
      label: "More",
      href: "#more",
      match: () => false,
      icon: moreIcon,
    },
  ];
}
