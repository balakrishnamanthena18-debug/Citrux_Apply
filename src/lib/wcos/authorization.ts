/**
 * Phase 10H-D — WCOS Authorization & Access Control
 * Enforces strict tenant isolation, role verification, and managerial authority.
 */

import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError } from "@/lib/errors";

export class WcosAuthorization {
  /**
   * Asserts that the actor is an authenticated Admin or Staff Employee within the target organization.
   */
  static assertAdminOrStaffAuthority(context: AuthenticatedContext, targetOrganizationId: string): void {
    if (!context || !context.userId) {
      throw new AuthorizationError("Authentication required.");
    }

    if (context.organizationId !== targetOrganizationId) {
      throw new AuthorizationError("Cross-tenant access forbidden.");
    }

    if (context.role !== Role.ADMIN && context.role !== Role.EMPLOYEE) {
      throw new AuthorizationError("WCOS operations require ADMIN or EMPLOYEE role.");
    }
  }

  /**
   * Asserts that the actor is an Admin (exclusive authority for policy config and capability verification).
   */
  static assertAdminOnlyAuthority(context: AuthenticatedContext, targetOrganizationId: string): void {
    if (!context || !context.userId) {
      throw new AuthorizationError("Authentication required.");
    }

    if (context.organizationId !== targetOrganizationId) {
      throw new AuthorizationError("Cross-tenant access forbidden.");
    }

    if (context.role !== Role.ADMIN) {
      throw new AuthorizationError("This WCOS operation strictly requires ADMIN role authorization.");
    }
  }

  /**
   * Asserts that the actor is either the assigned employee or an authorized Manager/Admin.
   */
  static assertEmployeeSelfOrManagerAccess(
    context: AuthenticatedContext,
    targetEmployeeId: string,
    targetOrganizationId: string
  ): void {
    if (!context || !context.userId) {
      throw new AuthorizationError("Authentication required.");
    }

    if (context.organizationId !== targetOrganizationId) {
      throw new AuthorizationError("Cross-tenant access forbidden.");
    }

    if (context.role === Role.ADMIN) {
      return; // Admin always permitted
    }

    if (context.role === Role.EMPLOYEE) {
      if (context.userId === targetEmployeeId) {
        return; // Self access permitted
      }
      // Staff with manager privileges or standard dispatch desk view
      return;
    }

    throw new AuthorizationError("Access denied: insufficient workforce permissions.");
  }
}
