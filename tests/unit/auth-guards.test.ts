import { describe, it, expect } from "vitest";
import {
  requireRole,
  requireAdmin,
  requireEmployeeOrAdmin,
  requirePermission,
  type AuthContext,
} from "@/lib/auth/context";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/errors";

describe("Auth Guards & Permissions (src/lib/auth/)", () => {
  const candidateCtx: AuthContext = {
    userId: "u-candidate-1",
    email: "candidate@example.com",
    fullName: "Jane Candidate",
    organizationId: "org-operating-1",
    membershipId: "mem-candidate-1",
    role: "CANDIDATE",
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  const employeeCtx: AuthContext = {
    userId: "u-employee-1",
    email: "employee@example.com",
    fullName: "John Employee",
    organizationId: "org-operating-1",
    membershipId: "mem-employee-1",
    role: "EMPLOYEE",
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  const adminCtx: AuthContext = {
    userId: "u-admin-1",
    email: "admin@example.com",
    fullName: "Alice Admin",
    organizationId: "org-operating-1",
    membershipId: "mem-admin-1",
    role: "ADMIN",
    status: "ACTIVE",
    membershipStatus: "ACTIVE",
  };

  describe("hasPermission()", () => {
    it("correctly identifies candidate permissions", () => {
      expect(hasPermission("CANDIDATE", PERMISSIONS.AUTH_READ_SELF)).toBe(true);
      expect(hasPermission("CANDIDATE", PERMISSIONS.ORG_READ)).toBe(true);
      expect(hasPermission("CANDIDATE", PERMISSIONS.MEMBER_READ)).toBe(false);
      expect(hasPermission("CANDIDATE", PERMISSIONS.MEMBER_INVITE)).toBe(false);
      expect(hasPermission("CANDIDATE", PERMISSIONS.AUDIT_READ)).toBe(false);
    });

    it("correctly identifies employee permissions", () => {
      expect(hasPermission("EMPLOYEE", PERMISSIONS.AUTH_READ_SELF)).toBe(true);
      expect(hasPermission("EMPLOYEE", PERMISSIONS.MEMBER_READ)).toBe(true);
      expect(hasPermission("EMPLOYEE", PERMISSIONS.MEMBER_INVITE)).toBe(false);
      expect(hasPermission("EMPLOYEE", PERMISSIONS.AUDIT_READ)).toBe(false);
    });

    it("correctly identifies admin permissions", () => {
      expect(hasPermission("ADMIN", PERMISSIONS.AUTH_READ_SELF)).toBe(true);
      expect(hasPermission("ADMIN", PERMISSIONS.MEMBER_READ)).toBe(true);
      expect(hasPermission("ADMIN", PERMISSIONS.MEMBER_INVITE)).toBe(true);
      expect(hasPermission("ADMIN", PERMISSIONS.MEMBER_UPDATE_ROLE)).toBe(true);
      expect(hasPermission("ADMIN", PERMISSIONS.MEMBER_DEACTIVATE)).toBe(true);
      expect(hasPermission("ADMIN", PERMISSIONS.AUDIT_READ)).toBe(true);
    });
  });

  describe("requireRole()", () => {
    it("allows execution when context matches allowed roles", () => {
      expect(() => requireRole(adminCtx, ["ADMIN"])).not.toThrow();
      expect(() => requireRole(employeeCtx, ["EMPLOYEE", "ADMIN"])).not.toThrow();
      expect(() => requireRole(candidateCtx, ["CANDIDATE"])).not.toThrow();
    });

    it("throws ForbiddenError when context role is unauthorized", () => {
      expect(() => requireRole(candidateCtx, ["ADMIN"])).toThrow(ForbiddenError);
      expect(() => requireRole(candidateCtx, ["EMPLOYEE", "ADMIN"])).toThrow(ForbiddenError);
      expect(() => requireRole(employeeCtx, ["ADMIN"])).toThrow(ForbiddenError);
    });
  });

  describe("requireAdmin()", () => {
    it("passes for ADMIN context", () => {
      expect(() => requireAdmin(adminCtx)).not.toThrow();
    });

    it("fails for EMPLOYEE context", () => {
      expect(() => requireAdmin(employeeCtx)).toThrow(ForbiddenError);
    });

    it("fails for CANDIDATE context", () => {
      expect(() => requireAdmin(candidateCtx)).toThrow(ForbiddenError);
    });
  });

  describe("requireEmployeeOrAdmin()", () => {
    it("passes for ADMIN and EMPLOYEE contexts", () => {
      expect(() => requireEmployeeOrAdmin(adminCtx)).not.toThrow();
      expect(() => requireEmployeeOrAdmin(employeeCtx)).not.toThrow();
    });

    it("fails for CANDIDATE context", () => {
      expect(() => requireEmployeeOrAdmin(candidateCtx)).toThrow(ForbiddenError);
    });
  });

  describe("requirePermission()", () => {
    it("passes when user role possesses required permission", () => {
      expect(() => requirePermission(adminCtx, PERMISSIONS.AUDIT_READ)).not.toThrow();
      expect(() => requirePermission(employeeCtx, PERMISSIONS.MEMBER_READ)).not.toThrow();
      expect(() => requirePermission(candidateCtx, PERMISSIONS.ORG_READ)).not.toThrow();
    });

    it("fails when user role lacks required permission", () => {
      expect(() => requirePermission(candidateCtx, PERMISSIONS.MEMBER_READ)).toThrow(ForbiddenError);
      expect(() => requirePermission(employeeCtx, PERMISSIONS.MEMBER_INVITE)).toThrow(ForbiddenError);
      expect(() => requirePermission(candidateCtx, PERMISSIONS.AUDIT_READ)).toThrow(ForbiddenError);
    });
  });
});
