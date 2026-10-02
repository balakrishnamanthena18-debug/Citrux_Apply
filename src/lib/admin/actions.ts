"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { logUserAuditEvent, logSystemAuditEvent } from "@/lib/audit";
import { emailNotificationService } from "@/lib/email";
import {
  buildStaffActivationEmailHtml,
  buildStaffActivationEmailText,
  buildStaffWelcomeEmailSubject,
  buildStaffResentEmailSubject,
} from "@/lib/email/templates/staffWelcomeActivation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  AuditAction,
  Role,
  MembershipStatus,
  DesignationStatus,
  ApplicationStatus,
  TaskStatus,
} from "@/generated/prisma";
import {
  CreateEmployeeSchema,
  CreateDesignationSchema,
  UpdateDesignationSchema,
  SetDesignationStatusSchema,
  ResendStaffActivationSchema,
  UpdateEmployeeDesignationSchema,
  UpdateEmployeeOrganizationSchema,
  SetEmployeeStatusSchema,
  UpdateEmployeeRoleSchema,
  ReassignWorkSchema,
  ListAuditLogsSchema,
  type CreateEmployeeInput,
  type CreateDesignationInput,
  type UpdateDesignationInput,
  type SetDesignationStatusInput,
  type ResendStaffActivationInput,
  type UpdateEmployeeDesignationInput,
  type UpdateEmployeeOrganizationInput,
  type SetEmployeeStatusInput,
  type UpdateEmployeeRoleInput,
  type ReassignWorkInput,
  type ListAuditLogsInput,
} from "@/lib/validation/admin-privacy.schemas";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function revalidateAdminViews() {
  try {
    revalidatePath("/admin");
    revalidatePath("/admin/members");
    revalidatePath("/admin/settings/designations");
    revalidatePath("/admin/applications");
    revalidatePath("/admin/candidates");
    revalidatePath("/admin/tasks/escalations");
    revalidatePath("/admin/audit");
    revalidatePath("/admin/privacy");
  } catch {
    // Safe fallback when executed outside Next.js request context
  }
}

/**
 * Generates a sequential employee ID formatted as CIT-EMP-XXXX per organization.
 */
async function generateSequentialEmployeeId(
  tx: any,
  organizationId: string
): Promise<string> {
  const existingMemberships = (await tx.membership.findMany?.({
    where: {
      organizationId,
      employeeId: { not: null },
    },
    select: { employeeId: true },
  })) || [];

  let maxSeq = 0;
  for (const m of existingMemberships) {
    if (m.employeeId) {
      const match = m.employeeId.match(/CIT-EMP-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  const padded = String(nextSeq).padStart(4, "0");
  return `CIT-EMP-${padded}`;
}

// ==========================================
// 1. Designation Management Actions
// ==========================================

export async function createDesignationAction(
  input: CreateDesignationInput
): Promise<ActionResult<{ id: string; name: string; code?: string | null; description?: string | null; status: DesignationStatus; createdAt: Date; }>> {
  const parsed = CreateDesignationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const designation = await withRlsContext(ctx.userId, async (tx) => {
      const existing = await tx.designation.findFirst({
        where: {
          organizationId: ctx.organizationId,
          name: { equals: parsed.data.name, mode: "insensitive" },
        },
      });

      if (existing) {
        throw new ValidationError("A designation with this name already exists in the organization");
      }

      const created = await tx.designation.create({
        data: {
          organizationId: ctx.organizationId,
          name: parsed.data.name,
          code: parsed.data.code ?? null,
          description: parsed.data.description ?? null,
          status: DesignationStatus.ACTIVE,
        },
      });

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.DESIGNATION_CREATED,
        entityType: "Designation",
        entityId: created.id,
        details: {
          name: created.name,
          code: created.code,
        },
      });

      return created;
    });

    revalidateAdminViews();
    return { success: true, data: designation };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create designation" };
  }
}

export async function updateDesignationAction(
  input: UpdateDesignationInput
): Promise<ActionResult<{ id: string; name: string; code?: string | null; description?: string | null }>> {
  const parsed = UpdateDesignationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const updated = await withRlsContext(ctx.userId, async (tx) => {
      const existing = await tx.designation.findUnique({
        where: { id: parsed.data.designationId },
      });

      if (!existing || existing.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Designation not found in organization");
      }

      // Check duplicate name
      const duplicate = await tx.designation.findFirst({
        where: {
          organizationId: ctx.organizationId,
          name: { equals: parsed.data.name, mode: "insensitive" },
          id: { not: parsed.data.designationId },
        },
      });

      if (duplicate) {
        throw new ValidationError("Another designation with this name already exists");
      }

      const res = await tx.designation.update({
        where: { id: parsed.data.designationId },
        data: {
          name: parsed.data.name,
          code: parsed.data.code ?? null,
          description: parsed.data.description ?? null,
        },
      });

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.DESIGNATION_UPDATED,
        entityType: "Designation",
        entityId: res.id,
        details: {
          oldName: existing.name,
          newName: res.name,
          oldCode: existing.code,
          newCode: res.code,
        },
      });

      return res;
    });

    revalidateAdminViews();
    return { success: true, data: updated };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update designation" };
  }
}

export async function setDesignationStatusAction(
  input: SetDesignationStatusInput
): Promise<ActionResult<{ status: DesignationStatus }>> {
  const parsed = SetDesignationStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const updated = await withRlsContext(ctx.userId, async (tx) => {
      const existing = await tx.designation.findUnique({
        where: { id: parsed.data.designationId },
      });

      if (!existing || existing.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Designation not found in organization");
      }

      const res = await tx.designation.update({
        where: { id: parsed.data.designationId },
        data: { status: parsed.data.status as DesignationStatus },
      });

      const action =
        parsed.data.status === "ACTIVE"
          ? AuditAction.DESIGNATION_REACTIVATED
          : AuditAction.DESIGNATION_ARCHIVED;

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action,
        entityType: "Designation",
        entityId: res.id,
        details: {
          name: res.name,
          status: res.status,
        },
      });

      return res;
    });

    revalidateAdminViews();
    return { success: true, data: { status: updated.status } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to set designation status" };
  }
}

export async function listDesignationsAction(options?: {
  status?: "ACTIVE" | "ARCHIVED";
}): Promise<ActionResult<{ designations: any[] }>> {
  try {
    const ctx = await getAuthenticatedContext();

    const designations = await withRlsContext(ctx.userId, async (tx) => {
      const whereClause: any = { organizationId: ctx.organizationId };
      if (options?.status) {
        whereClause.status = options.status;
      }

      return tx.designation.findMany({
        where: whereClause,
        include: {
          _count: {
            select: { memberships: true },
          },
        },
        orderBy: { name: "asc" },
      });
    });

    return {
      success: true,
      data: {
        designations: designations.map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code,
          description: d.description,
          status: d.status,
          memberCount: d._count.memberships,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to list designations" };
  }
}

// ==========================================
// 2. Enterprise Employee Onboarding Actions
// ==========================================

export async function createEmployeeAction(
  input: CreateEmployeeInput
): Promise<ActionResult<{ membershipId: string; userId: string; employeeId: string }>> {
  const parsed = CreateEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  let authUserId: string | null = null;

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    // 1. Create Supabase Auth user synchronously (no password, email_confirm: true)
    const supabaseAdmin = getSupabaseAdminClient();
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: parsed.data.email,
        email_confirm: true,
        user_metadata: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
        },
      });

    if (authError || !authData.user) {
      // Check if user already exists in auth
      if (authError?.message?.includes("already been registered") || authError?.message?.includes("already exists")) {
        throw new ValidationError("A user with this email address already exists in authentication");
      }
      throw new Error(authError?.message || "Failed to create Supabase Auth user");
    }

    authUserId = authData.user.id;

    // 2. Generate secure 256-bit activation token & SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 Hours

    let createdEmployeeId = "";
    let createdMembershipId = "";

    // 3. Open PostgreSQL atomic transaction with compensating catch
    try {
      const dbResult = await withRlsContext(ctx.userId, async (tx) => {
        // Verify designation if provided
        if (parsed.data.designationId) {
          const designation = await tx.designation.findUnique({
            where: { id: parsed.data.designationId },
          });
          if (!designation || designation.organizationId !== ctx.organizationId) {
            throw new ValidationError("Selected designation does not belong to this organization");
          }
          if (designation.status !== DesignationStatus.ACTIVE) {
            throw new ValidationError("Cannot assign an ARCHIVED designation to a new employee");
          }
        }

        // Verify reporting manager if provided
        if (parsed.data.reportingManagerId) {
          if (parsed.data.reportingManagerId === authUserId) {
            throw new ValidationError("An employee cannot report to themselves");
          }
          const managerMembership = await tx.membership.findFirst({
            where: {
              organizationId: ctx.organizationId,
              userId: parsed.data.reportingManagerId,
              status: MembershipStatus.ACTIVE,
              role: { in: [Role.EMPLOYEE, Role.ADMIN] },
            },
          });
          if (!managerMembership) {
            throw new ValidationError("Selected reporting manager is not an active staff member in this organization");
          }
        }

        // Create or connect User record
        let targetUser = await tx.user.findUnique({
          where: { id: authUserId! },
        });

        if (!targetUser) {
          targetUser = await tx.user.create({
            data: {
              id: authUserId!,
              email: parsed.data.email,
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
              status: "ACTIVE",
            },
          });
        }

        // Check for existing membership in this organization
        const existingMembership = await tx.membership.findUnique({
          where: {
            org_user_unique: {
              organizationId: ctx.organizationId,
              userId: authUserId!,
            },
          },
        });

        if (existingMembership) {
          throw new ValidationError("User is already a member of this organization");
        }

        // Generate sequential Employee ID
        const employeeId = await generateSequentialEmployeeId(tx, ctx.organizationId);

        // Create Membership in INVITED state
        const membership = await tx.membership.create({
          data: {
            organizationId: ctx.organizationId,
            userId: authUserId!,
            role: parsed.data.role as Role,
            status: MembershipStatus.INVITED,
            employeeId,
            designationId: parsed.data.designationId ?? null,
            department: parsed.data.department ?? null,
            team: parsed.data.team ?? null,
            reportingManagerId: parsed.data.reportingManagerId ?? null,
            isTeamLead: parsed.data.isTeamLead ?? false,
            teamLeadOf: parsed.data.teamLeadOf ?? null,
            employmentType: parsed.data.employmentType ?? null,
            joiningDate: parsed.data.joiningDate ? new Date(parsed.data.joiningDate) : null,
            workLocation: parsed.data.workLocation ?? null,
            workMode: parsed.data.workMode ?? null,
            phone: parsed.data.phone ?? null,
            personalEmail: parsed.data.personalEmail ?? null,
          },
        });

        // Store hashed activation token
        await tx.staffActivationToken.create({
          data: {
            organizationId: ctx.organizationId,
            membershipId: membership.id,
            tokenHash,
            expiresAt: tokenExpiresAt,
          },
        });

        // Emit Audit Events
        await logUserAuditEvent({
          tx,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.EMPLOYEE_CREATED,
          entityType: "Membership",
          entityId: membership.id,
          details: {
            targetUserId: authUserId,
            email: parsed.data.email,
            role: parsed.data.role,
            employeeId,
            designationId: parsed.data.designationId,
            department: parsed.data.department,
            team: parsed.data.team,
            reportingManagerId: parsed.data.reportingManagerId,
            isTeamLead: parsed.data.isTeamLead ?? false,
            teamLeadOf: parsed.data.teamLeadOf ?? null,
          },
        });

        await logUserAuditEvent({
          tx,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.EMPLOYEE_INVITATION_SENT,
          entityType: "StaffActivationToken",
          entityId: membership.id,
          details: {
            targetUserId: authUserId,
            recipientEmail: parsed.data.email,
            expiresAt: tokenExpiresAt.toISOString(),
          },
        });

        return { membership, employeeId };
      });

      createdEmployeeId = dbResult.employeeId;
      createdMembershipId = dbResult.membership.id;
    } catch (dbError: any) {
      // Compensating transaction: Cleanup orphaned Supabase Auth user
      if (authUserId) {
        try {
          const deleteRes = await supabaseAdmin.auth.admin.deleteUser(authUserId);
          if (deleteRes?.error) {
            throw new Error(deleteRes.error.message || "Supabase user deletion failed");
          }
        } catch (cleanupErr: any) {
          await logSystemAuditEvent({
            action: AuditAction.SECURITY_ALERT,
            actorType: "SYSTEM",
            organizationId: ctx.organizationId,
            entityType: "AuthUser",
            entityId: authUserId,
            details: {
              reason: "ORPHANED_AUTH_USER_CLEANUP_FAILED",
              error: "Orphaned Supabase Auth user cleanup failed",
              authUserId,
              email: parsed.data.email,
              cleanupError: cleanupErr.message,
            },
          });
        }
      }
      throw dbError;
    }

    // 4. Post-Commit: Dispatch Welcome Email with single-use activation link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const activationUrl = `${appUrl}/auth/activate?token=${rawToken}`;

    try {
      await emailNotificationService.sendTransactionalNotification({
        organizationId: ctx.organizationId,
        recipientEmail: parsed.data.email,
        templateId: "STAFF_WELCOME_ACTIVATION",
        subject: buildStaffWelcomeEmailSubject(),
        textBody: buildStaffActivationEmailText({
          firstName: parsed.data.firstName,
          employeeId: createdEmployeeId,
          role: parsed.data.role,
          department: parsed.data.department || "Operations",
          activationUrl,
          variant: "welcome",
        }),
        htmlBody: buildStaffActivationEmailHtml({
          firstName: parsed.data.firstName,
          employeeId: createdEmployeeId,
          role: parsed.data.role,
          department: parsed.data.department || "Operations",
          activationUrl,
          variant: "welcome",
        }),
      });
    } catch {
      // Email failure is non-fatal; logged in email_delivery_logs
    }

    revalidateAdminViews();
    return {
      success: true,
      data: {
        membershipId: createdMembershipId,
        userId: authUserId,
        employeeId: createdEmployeeId,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create employee" };
  }
}

export async function resendStaffActivationAction(
  input: ResendStaffActivationInput
): Promise<ActionResult> {
  const parsed = ResendStaffActivationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const target = await withRlsContext(ctx.userId, async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: parsed.data.membershipId },
        include: { user: true, designation: true },
      });

      if (!membership || membership.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Membership not found in organization");
      }

      if (membership.status !== MembershipStatus.INVITED) {
        throw new ValidationError("Can only resend activation for accounts in INVITED status");
      }

      // Invalidate all previous activation tokens for this membership
      await tx.staffActivationToken.updateMany({
        where: {
          membershipId: membership.id,
          usedAt: null,
        },
        data: {
          expiresAt: new Date(), // Immediate expiration
        },
      });

      // Create new activation token
      await tx.staffActivationToken.create({
        data: {
          organizationId: ctx.organizationId,
          membershipId: membership.id,
          tokenHash,
          expiresAt: tokenExpiresAt,
        },
      });

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.EMPLOYEE_INVITATION_RESENT,
        entityType: "StaffActivationToken",
        entityId: membership.id,
        details: {
          targetUserId: membership.userId,
          recipientEmail: membership.user.email,
          expiresAt: tokenExpiresAt.toISOString(),
        },
      });

      return membership;
    });

    // Post-Commit email dispatch
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const activationUrl = `${appUrl}/auth/activate?token=${rawToken}`;

    try {
      await emailNotificationService.sendTransactionalNotification({
        organizationId: ctx.organizationId,
        recipientEmail: target.user.email,
        templateId: "STAFF_WELCOME_ACTIVATION",
        subject: buildStaffResentEmailSubject(),
        textBody: buildStaffActivationEmailText({
          firstName: target.user.firstName || "there",
          employeeId: target.employeeId,
          role: target.role,
          department: target.department || "Operations",
          activationUrl,
          variant: "resent",
        }),
        htmlBody: buildStaffActivationEmailHtml({
          firstName: target.user.firstName || "there",
          employeeId: target.employeeId,
          role: target.role,
          department: target.department || "Operations",
          activationUrl,
          variant: "resent",
        }),
      });
    } catch {
      // Non-fatal
    }

    revalidateAdminViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to resend activation invitation" };
  }
}

export async function updateEmployeeDesignationAction(
  input: UpdateEmployeeDesignationInput
): Promise<ActionResult> {
  const parsed = UpdateEmployeeDesignationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: parsed.data.membershipId },
      });

      if (!membership || membership.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Membership not found in organization");
      }

      if (parsed.data.designationId) {
        const designation = await tx.designation.findUnique({
          where: { id: parsed.data.designationId },
        });
        if (!designation || designation.organizationId !== ctx.organizationId) {
          throw new ValidationError("Selected designation does not belong to this organization");
        }
        if (designation.status !== DesignationStatus.ACTIVE) {
          throw new ValidationError("Cannot assign an ARCHIVED designation");
        }
      }

      const updated = await tx.membership.update({
        where: { id: parsed.data.membershipId },
        data: { designationId: parsed.data.designationId },
      });

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.EMPLOYEE_DESIGNATION_CHANGED,
        entityType: "Membership",
        entityId: updated.id,
        details: {
          targetUserId: updated.userId,
          oldDesignationId: membership.designationId,
          newDesignationId: updated.designationId,
        },
      });
    });

    revalidateAdminViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update employee designation" };
  }
}

export async function updateEmployeeOrganizationAction(
  input: UpdateEmployeeOrganizationInput
): Promise<ActionResult> {
  const parsed = UpdateEmployeeOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    await withRlsContext(ctx.userId, async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: parsed.data.membershipId },
      });

      if (!membership || membership.organizationId !== ctx.organizationId) {
        throw new NotFoundError("Membership not found in organization");
      }

      if (parsed.data.reportingManagerId) {
        if (parsed.data.reportingManagerId === membership.userId) {
          throw new ValidationError("An employee cannot report to themselves");
        }
        const manager = await tx.membership.findFirst({
          where: {
            organizationId: ctx.organizationId,
            userId: parsed.data.reportingManagerId,
            status: MembershipStatus.ACTIVE,
            role: { in: [Role.EMPLOYEE, Role.ADMIN] },
          },
        });
        if (!manager) {
          throw new ValidationError("Selected manager is not an active staff member in this organization");
        }
      }

      const updated = await tx.membership.update({
        where: { id: parsed.data.membershipId },
        data: {
          department: parsed.data.department !== undefined ? parsed.data.department : membership.department,
          team: parsed.data.team !== undefined ? parsed.data.team : membership.team,
          reportingManagerId: parsed.data.reportingManagerId !== undefined ? parsed.data.reportingManagerId : membership.reportingManagerId,
          isTeamLead: parsed.data.isTeamLead !== undefined ? parsed.data.isTeamLead : membership.isTeamLead,
          teamLeadOf: parsed.data.teamLeadOf !== undefined ? parsed.data.teamLeadOf : membership.teamLeadOf,
        },
      });

      if (parsed.data.department !== undefined && parsed.data.department !== membership.department) {
        await logUserAuditEvent({
          tx,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.EMPLOYEE_DEPARTMENT_CHANGED,
          entityType: "Membership",
          entityId: updated.id,
          details: { oldDepartment: membership.department, newDepartment: updated.department },
        });
      }

      if (parsed.data.team !== undefined && parsed.data.team !== membership.team) {
        await logUserAuditEvent({
          tx,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.EMPLOYEE_TEAM_CHANGED,
          entityType: "Membership",
          entityId: updated.id,
          details: { oldTeam: membership.team, newTeam: updated.team },
        });
      }

      if (parsed.data.reportingManagerId !== undefined && parsed.data.reportingManagerId !== membership.reportingManagerId) {
        await logUserAuditEvent({
          tx,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.EMPLOYEE_MANAGER_CHANGED,
          entityType: "Membership",
          entityId: updated.id,
          details: { oldManagerId: membership.reportingManagerId, newManagerId: updated.reportingManagerId },
        });
      }

      const teamLeadChanged =
        (parsed.data.isTeamLead !== undefined && parsed.data.isTeamLead !== membership.isTeamLead) ||
        (parsed.data.teamLeadOf !== undefined && parsed.data.teamLeadOf !== membership.teamLeadOf);

      if (teamLeadChanged) {
        await logUserAuditEvent({
          tx,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: AuditAction.EMPLOYEE_TEAM_LEAD_CHANGED,
          entityType: "Membership",
          entityId: updated.id,
          details: {
            oldIsTeamLead: membership.isTeamLead,
            newIsTeamLead: updated.isTeamLead,
            oldTeamLeadOf: membership.teamLeadOf,
            newTeamLeadOf: updated.teamLeadOf,
          },
        });
      }
    });

    revalidateAdminViews();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update organization details" };
  }
}

export interface WorkloadImpact {
  assignedCandidatesCount: number;
  activeApplicationsCount: number;
  openTasksCount: number;
}

export async function getEmployeeWorkloadImpactAction(
  employeeUserId: string
): Promise<ActionResult<WorkloadImpact>> {
  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const counts = await withRlsContext(ctx.userId, async (tx) => {
      const assignedCandidatesCount = await tx.candidate.count({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: employeeUserId,
        },
      });
      const activeApplicationsCount = await tx.application.count({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: employeeUserId,
          status: {
            notIn: [
              ApplicationStatus.SUBMITTED,
              ApplicationStatus.WITHDRAWN,
              ApplicationStatus.REJECTED,
            ],
          },
        },
      });
      const openTasksCount = await tx.task.count({
        where: {
          organizationId: ctx.organizationId,
          assignedEmployeeId: employeeUserId,
          status: {
            notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED],
          },
        },
      });

      return { assignedCandidatesCount, activeApplicationsCount, openTasksCount };
    });

    return { success: true, data: counts };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to get workload impact" };
  }
}

// ==========================================
// 3. Status & Role Actions
// ==========================================

export async function setEmployeeStatusAction(
  input: SetEmployeeStatusInput
): Promise<ActionResult<{ status: MembershipStatus }>> {
  const parsed = SetEmployeeStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const membership = await tx.membership.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: parsed.data.employeeUserId,
        },
      });

      if (!membership) {
        throw new NotFoundError("Employee membership not found in organization");
      }

      if (membership.userId === ctx.userId) {
        throw new ValidationError("Administrators cannot deactivate their own membership");
      }

      const newStatus =
        parsed.data.status === "ACTIVE"
          ? MembershipStatus.ACTIVE
          : MembershipStatus.DEACTIVATED;

      const updated = await tx.membership.update({
        where: { id: membership.id },
        data: { status: newStatus },
      });

      const action =
        parsed.data.status === "ACTIVE"
          ? AuditAction.EMPLOYEE_ACTIVATED
          : AuditAction.EMPLOYEE_DEACTIVATED;

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action,
        entityType: "Membership",
        entityId: updated.id,
        details: {
          targetUserId: parsed.data.employeeUserId,
          fromStatus: membership.status,
          toStatus: newStatus,
        },
      });

      return { updated, oldStatus: membership.status };
    });

    // Revoke Supabase Auth sessions on deactivation
    if (parsed.data.status === "INACTIVE") {
      try {
        const supabaseAdmin = getSupabaseAdminClient();
        await supabaseAdmin.auth.admin.signOut(parsed.data.employeeUserId);
      } catch {
        // Best effort session revocation
      }
    }

    revalidateAdminViews();
    return { success: true, data: { status: result.updated.status } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update employee status" };
  }
}

export async function updateEmployeeRoleAction(
  input: UpdateEmployeeRoleInput
): Promise<ActionResult<{ role: Role }>> {
  const parsed = UpdateEmployeeRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const membership = await tx.membership.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: parsed.data.employeeUserId,
        },
      });

      if (!membership) {
        throw new NotFoundError("Employee membership not found in organization");
      }

      const updated = await tx.membership.update({
        where: { id: membership.id },
        data: { role: parsed.data.role as Role },
      });

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.EMPLOYEE_ROLE_UPDATED,
        entityType: "Membership",
        entityId: updated.id,
        details: {
          targetUserId: parsed.data.employeeUserId,
          fromRole: membership.role,
          toRole: parsed.data.role,
        },
      });

      return { updated, oldRole: membership.role };
    });

    revalidateAdminViews();
    return { success: true, data: { role: result.updated.role } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update employee role" };
  }
}

// ==========================================
// 4. Operational Work Reassignment & Audit Inspection
// ==========================================

export async function reassignOperationalWorkAction(
  input: ReassignWorkInput
): Promise<ActionResult<{ reassignedApplications: number; reassignedTasks: number; reassignedCandidates: number }>> {
  const parsed = ReassignWorkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const counts = await withRlsContext(ctx.userId, async (tx) => {
      const targetMembership = await tx.membership.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId: parsed.data.targetEmployeeId,
          role: { in: [Role.EMPLOYEE, Role.ADMIN] },
          status: MembershipStatus.ACTIVE,
        },
      });

      if (!targetMembership) {
        throw new ValidationError("Target employee is not an active staff member in this organization");
      }

      let appCount = 0;
      let taskCount = 0;
      let candCount = 0;

      if (parsed.data.sourceEmployeeUserId) {
        if (parsed.data.reassignApplications !== false) {
          const appRes = await tx.application.updateMany({
            where: {
              organizationId: ctx.organizationId,
              assignedEmployeeId: parsed.data.sourceEmployeeUserId,
            },
            data: {
              assignedEmployeeId: parsed.data.targetEmployeeId,
            },
          });
          appCount = appRes.count;
        }

        if (parsed.data.reassignTasks !== false) {
          const taskRes = await tx.task.updateMany({
            where: {
              organizationId: ctx.organizationId,
              assignedEmployeeId: parsed.data.sourceEmployeeUserId,
            },
            data: {
              assignedEmployeeId: parsed.data.targetEmployeeId,
            },
          });
          taskCount = taskRes.count;
        }

        if (parsed.data.reassignCandidates !== false) {
          const candRes = await tx.candidate.updateMany({
            where: {
              organizationId: ctx.organizationId,
              assignedEmployeeId: parsed.data.sourceEmployeeUserId,
            },
            data: {
              assignedEmployeeId: parsed.data.targetEmployeeId,
            },
          });
          candCount = candRes.count;
        }
      } else {
        if (parsed.data.applicationIds && parsed.data.applicationIds.length > 0) {
          const appRes = await tx.application.updateMany({
            where: {
              organizationId: ctx.organizationId,
              id: { in: parsed.data.applicationIds },
            },
            data: {
              assignedEmployeeId: parsed.data.targetEmployeeId,
            },
          });
          appCount = appRes.count;
        }

        if (parsed.data.taskIds && parsed.data.taskIds.length > 0) {
          const taskRes = await tx.task.updateMany({
            where: {
              organizationId: ctx.organizationId,
              id: { in: parsed.data.taskIds },
            },
            data: {
              assignedEmployeeId: parsed.data.targetEmployeeId,
            },
          });
          taskCount = taskRes.count;
        }

        if (parsed.data.candidateIds && parsed.data.candidateIds.length > 0) {
          const candRes = await tx.candidate.updateMany({
            where: {
              organizationId: ctx.organizationId,
              id: { in: parsed.data.candidateIds },
            },
            data: {
              assignedEmployeeId: parsed.data.targetEmployeeId,
            },
          });
          candCount = candRes.count;
        }
      }

      await logUserAuditEvent({
        tx,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        action: AuditAction.OPERATIONAL_WORK_REASSIGNED,
        entityType: "Organization",
        entityId: ctx.organizationId,
        details: {
          targetEmployeeId: parsed.data.targetEmployeeId,
          reassignedApplicationsCount: appCount,
          reassignedTasksCount: taskCount,
          reassignedCandidatesCount: candCount,
        },
      });

      return { appCount, taskCount, candCount };
    });

    revalidateAdminViews();
    return {
      success: true,
      data: {
        reassignedApplications: counts.appCount,
        reassignedTasks: counts.taskCount,
        reassignedCandidates: counts.candCount,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to reassign work" };
  }
}

export async function listAuditLogsAction(
  input?: ListAuditLogsInput
): Promise<ActionResult<{ logs: any[]; totalCount: number; page: number; totalPages: number }>> {
  const parsed = ListAuditLogsSchema.safeParse(input || {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    const ctx = await getAuthenticatedContext();
    requireAdmin(ctx);

    const { page, limit, actorUserId, entityType, entityId, action, startDate, endDate } = parsed.data;
    const skip = (page - 1) * limit;

    const result = await withRlsContext(ctx.userId, async (tx) => {
      const whereClause: any = {
        organizationId: ctx.organizationId,
      };

      if (actorUserId) whereClause.actorId = actorUserId;
      if (entityType) whereClause.entityType = entityType;
      if (entityId) whereClause.entityId = entityId;
      if (action) whereClause.action = action;

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = new Date(startDate);
        if (endDate) whereClause.createdAt.lte = new Date(endDate);
      }

      const logs = await tx.auditEvent.findMany({
        where: whereClause,
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      });
      const totalCount = await tx.auditEvent.count({ where: whereClause });

      return { logs, totalCount };
    });

    const totalPages = Math.ceil(result.totalCount / limit) || 1;

    return {
      success: true,
      data: {
        logs: result.logs,
        totalCount: result.totalCount,
        page,
        totalPages,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to list audit logs" };
  }
}

