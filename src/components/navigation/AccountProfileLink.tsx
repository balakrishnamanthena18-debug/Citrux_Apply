"use client";

import React from "react";
import Link from "next/link";
import type { Role } from "@/generated/prisma";

export interface AccountProfileLinkProps {
  role: Role;
  membershipId?: string;
  className?: string;
  children?: React.ReactNode;
  onNavigate?: () => void;
}

export function getProfileRoute(role: Role, membershipId?: string): { href: string; label: string } {
  if (role === "ADMIN") {
    return {
      href: membershipId ? `/admin/members/${membershipId}` : "/admin/members",
      label: "My Staff Profile",
    };
  }
  if (role === "CANDIDATE") {
    return {
      href: "/candidate/profile",
      label: "My Career Profile",
    };
  }
  return {
    href: "/employee",
    label: "My Command Center",
  };
}

export function AccountProfileLink({
  role,
  membershipId,
  className = "",
  children,
  onNavigate,
}: AccountProfileLinkProps) {
  const { href, label } = getProfileRoute(role, membershipId);

  return (
    <Link href={href} onClick={onNavigate} className={className}>
      {children || label}
    </Link>
  );
}
