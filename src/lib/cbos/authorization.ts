/**
 * Phase 10E — CBOS Authorization & Access Control
 * Enforces structural authority without relying on client-supplied parameters.
 */

import { Role } from "@/generated/prisma";
import type { AuthenticatedContext } from "@/lib/auth/context";
import { AuthorizationError } from "@/lib/errors";

export class CbosAuthorization {
  /**
   * Asserts that the actor is an authenticated Admin or Staff Employee with Billing Authority.
   */
  static assertAdminOrStaffAuthority(context: AuthenticatedContext, targetOrganizationId: string): void {
    if (!context || !context.userId) {
      throw new AuthorizationError("Authentication required.");
    }

    if (context.organizationId !== targetOrganizationId) {
      throw new AuthorizationError("Cross-tenant access forbidden.");
    }

    if (context.role !== Role.ADMIN && context.role !== Role.EMPLOYEE) {
      throw new AuthorizationError("CBOS administration requires ADMIN or EMPLOYEE role.");
    }
  }

  /**
   * Asserts that the actor has Admin-exclusive authority (e.g. for write-offs and critical terminations).
   */
  static assertAdminOnlyAuthority(context: AuthenticatedContext, targetOrganizationId: string): void {
    if (!context || !context.userId) {
      throw new AuthorizationError("Authentication required.");
    }

    if (context.organizationId !== targetOrganizationId) {
      throw new AuthorizationError("Cross-tenant access forbidden.");
    }

    if (context.role !== Role.ADMIN) {
      throw new AuthorizationError("This operation strictly requires ADMIN role authorization.");
    }
  }

  /**
   * Asserts that a candidate is viewing only their own commercial/billing records.
   */
  static assertCandidateSelfAccess(context: AuthenticatedContext, targetCandidateId: string, targetOrganizationId: string): void {
    if (!context || !context.userId) {
      throw new AuthorizationError("Authentication required.");
    }

    if (context.organizationId !== targetOrganizationId) {
      throw new AuthorizationError("Cross-tenant access forbidden.");
    }

    if (context.role === Role.ADMIN || context.role === Role.EMPLOYEE) {
      return; // Staff can view within their tenant
    }

    if (context.role === Role.CANDIDATE) {
      const authCandId = (context as unknown as { candidateId?: string }).candidateId;
      if (authCandId && authCandId !== targetCandidateId) {
        throw new AuthorizationError("Candidates may only access their own billing records.");
      }
    }
  }
}
