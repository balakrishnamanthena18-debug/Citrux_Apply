import { Role } from "@/generated/prisma";

export const PERMISSIONS = {
  AUTH_READ_SELF: "auth:read_self",
  AUTH_UPDATE_SELF: "auth:update_self",
  ORG_READ: "org:read",
  MEMBER_READ: "member:read",
  MEMBER_INVITE: "member:invite",
  MEMBER_UPDATE_ROLE: "member:update_role",
  MEMBER_DEACTIVATE: "member:deactivate",
  AUDIT_READ: "audit:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CANDIDATE: [
    PERMISSIONS.AUTH_READ_SELF,
    PERMISSIONS.AUTH_UPDATE_SELF,
    PERMISSIONS.ORG_READ,
  ],
  EMPLOYEE: [
    PERMISSIONS.AUTH_READ_SELF,
    PERMISSIONS.AUTH_UPDATE_SELF,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.MEMBER_READ,
  ],
  ADMIN: [
    PERMISSIONS.AUTH_READ_SELF,
    PERMISSIONS.AUTH_UPDATE_SELF,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.MEMBER_READ,
    PERMISSIONS.MEMBER_INVITE,
    PERMISSIONS.MEMBER_UPDATE_ROLE,
    PERMISSIONS.MEMBER_DEACTIVATE,
    PERMISSIONS.AUDIT_READ,
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.includes(permission) : false;
}
