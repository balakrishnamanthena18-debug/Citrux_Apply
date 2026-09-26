"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { logUserAuditEvent, logSystemAuditEvent } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { AuditAction } from "@/generated/prisma";
import {
  LoginSchema,
  CandidateRegisterSchema,
  EmployeeInviteSchema,
  UpdateMemberRoleSchema,
  DeactivateMemberSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ActivateStaffAccountSchema,
} from "@/lib/validation/auth.schemas";
import { AuthenticationError, AuthorizationError, ValidationError } from "@/lib/errors";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Signs in a user with email and password, setting secure Supabase auth cookies.
 */
export async function signInAction(formData: FormData): Promise<ActionResult<{ redirectUrl: string }>> {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = LoginSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await logSystemAuditEvent({
      action: "ACCESS_DENIED",
      actorType: "ANONYMOUS",
      entityType: "User",
      details: { email: parsed.data.email, reason: error?.message ?? "Invalid credentials" },
    });
    return { success: false, error: "Invalid email or password" };
  }

  // Resolve membership to determine redirect target and verify active status
  try {
    const membership = await withRlsContext(data.user.id, async (tx) => {
      return tx.membership.findFirst({
        where: {
          userId: data.user.id,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          organization: { status: "ACTIVE" },
        },
      });
    });

    if (!membership) {
      await supabase.auth.signOut();
      return { success: false, error: "Account is inactive or pending organization approval" };
    }

    await logUserAuditEvent({
      userId: data.user.id,
      organizationId: membership.organizationId,
      action: "USER_LOGIN",
      entityType: "User",
      entityId: data.user.id,
    });

    let redirectUrl = "/candidate";
    if (membership.role === "ADMIN") redirectUrl = "/admin";
    else if (membership.role === "EMPLOYEE") redirectUrl = "/employee";

    return { success: true, data: { redirectUrl } };
  } catch (err: any) {
    await supabase.auth.signOut();
    return { success: false, error: err.message || "Failed to establish user context" };
  }
}

/**
 * Registers a new Candidate.
 * Tenancy: Candidates belong to the company's operating organization as customer records.
 */
export async function signUpCandidateAction(formData: FormData): Promise<ActionResult<{ redirectUrl: string }>> {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  };

  const parsed = CandidateRegisterSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  // 1. Resolve operating organization strictly via explicit OPERATING_ORGANIZATION_ID configuration
  const operatingOrgId = process.env.OPERATING_ORGANIZATION_ID;
  if (!operatingOrgId) {
    await logSystemAuditEvent({
      action: "SECURITY_ALERT",
      actorType: "SYSTEM",
      entityType: "Organization",
      details: { error: "Missing OPERATING_ORGANIZATION_ID server configuration" },
    });
    return { success: false, error: "Operating organization configuration is missing. Registration is disabled." };
  }

  const operatingOrg = await prisma.organization.findUnique({
    where: { id: operatingOrgId },
  });

  if (!operatingOrg || operatingOrg.status !== "ACTIVE") {
    await logSystemAuditEvent({
      action: "SECURITY_ALERT",
      actorType: "SYSTEM",
      entityType: "Organization",
      entityId: operatingOrgId,
      details: { error: "Configured OPERATING_ORGANIZATION_ID is not found or not active" },
    });
    return { success: false, error: "Operating organization is unavailable or inactive. Registration is disabled." };
  }

  // 2. Create user in Supabase Auth
  const supabase = await createServerClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
      },
    },
  });

  if (authError || !authData.user) {
    return { success: false, error: authError?.message ?? "Registration failed" };
  }

  const userId = authData.user.id;

  // 3. Create User record and Candidate Membership within user's RLS context
  try {
    await withRlsContext(userId, async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: parsed.data.email,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          status: "ACTIVE",
        },
      });

      await tx.membership.create({
        data: {
          organizationId: operatingOrg.id,
          userId: userId,
          role: "CANDIDATE",
          status: "ACTIVE",
        },
      });
    });

    await logUserAuditEvent({
      userId,
      organizationId: operatingOrg.id,
      action: "USER_REGISTERED",
      entityType: "User",
      entityId: userId,
      details: { role: "CANDIDATE" },
    });

    return { success: true, data: { redirectUrl: "/candidate" } };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to initialize candidate account" };
  }
}

/**
 * Signs out the current user and clears session cookies.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    try {
      await logUserAuditEvent({
        userId: user.id,
        action: "USER_LOGOUT",
        entityType: "User",
        entityId: user.id,
      });
    } catch {
      // Best-effort audit on logout
    }
  }

  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Admin Action: Invites a new Employee or Admin to the organization.
 */
export async function inviteEmployeeAction(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const parsed = EmployeeInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  if (parsed.data.organizationId !== ctx.organizationId) {
    throw new AuthorizationError("Cannot invite employees to a different organization");
  }

  // Execute within Admin's RLS context
  try {
    await withRlsContext(ctx.userId, async (tx) => {
      // Find or create User record
      let targetUser = await tx.user.findUnique({
        where: { email: parsed.data.email },
      });

      if (!targetUser) {
        // Generate placeholder user UUID until Supabase auth acceptance
        const syntheticUserId = crypto.randomUUID();
        targetUser = await tx.user.create({
          data: {
            id: syntheticUserId,
            email: parsed.data.email,
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            status: "ACTIVE",
          },
        });
      }

      await tx.membership.create({
        data: {
          organizationId: ctx.organizationId,
          userId: targetUser.id,
          role: parsed.data.role,
          status: "INVITED",
        },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "USER_INVITED",
      entityType: "Membership",
      details: { email: parsed.data.email, role: parsed.data.role },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to invite employee" };
  }
}

/**
 * Admin Action: Updates a member's role within the organization.
 */
export async function updateMemberRoleAction(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const parsed = UpdateMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    await withRlsContext(ctx.userId, async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: parsed.data.membershipId },
      });

      if (!membership || membership.organizationId !== ctx.organizationId) {
        throw new AuthorizationError("Target membership not found in this organization");
      }

      await tx.membership.update({
        where: { id: parsed.data.membershipId },
        data: { role: parsed.data.role },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "ROLE_CHANGED",
      entityType: "Membership",
      entityId: parsed.data.membershipId,
      details: { newRole: parsed.data.role },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update role" };
  }
}

/**
 * Admin Action: Deactivates an employee or candidate membership.
 * Access is revoked immediately; historical attribution remains intact.
 */
export async function deactivateMemberAction(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const parsed = DeactivateMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    await withRlsContext(ctx.userId, async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: parsed.data.membershipId },
      });

      if (!membership || membership.organizationId !== ctx.organizationId) {
        throw new AuthorizationError("Target membership not found in this organization");
      }

      if (membership.userId === ctx.userId) {
        throw new ValidationError("Administrators cannot deactivate their own membership");
      }

      await tx.membership.update({
        where: { id: parsed.data.membershipId },
        data: { status: "DEACTIVATED" },
      });
    });

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: "MEMBERSHIP_DEACTIVATED",
      entityType: "Membership",
      entityId: parsed.data.membershipId,
      details: { reason: parsed.data.reason },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to deactivate member" };
  }
}

/**
 * Sends a password reset email via Supabase Auth.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<ActionResult> {
  const rawEmail = formData.get("email");
  const parsed = ForgotPasswordSchema.safeParse({ email: rawEmail });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Resets user password.
 */
export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const rawData = {
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const parsed = ResetPasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export interface ValidatedActivationTokenData {
  employeeName: string;
  email: string;
  organizationName: string;
  employeeId?: string | null;
  designationName?: string | null;
  department?: string | null;
  team?: string | null;
}

/**
 * Validates a staff activation token for the unauthenticated activation page.
 * Returns non-sensitive details needed to present the activation screen.
 */
export async function validateStaffActivationTokenAction(
  token: string
): Promise<ActionResult<ValidatedActivationTokenData>> {
  if (!token || typeof token !== "string" || !token.trim()) {
    return { success: false, error: "Invalid activation token." };
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");

    const activationToken = await prisma.staffActivationToken.findUnique({
      where: { tokenHash },
      include: {
        membership: {
          include: {
            user: true,
            organization: true,
            designation: true,
          },
        },
      },
    });

    if (!activationToken) {
      return { success: false, error: "This activation link is invalid or has expired." };
    }

    if (activationToken.usedAt) {
      return { success: false, error: "This activation link has already been used. Please sign in." };
    }

    if (activationToken.expiresAt < new Date()) {
      return { success: false, error: "This activation link has expired. Please contact your administrator for a new invitation." };
    }

    if (activationToken.membership.status !== "INVITED") {
      return { success: false, error: "This account has already been activated or is not eligible for activation." };
    }

    const { user, organization, designation } = activationToken.membership;

    return {
      success: true,
      data: {
        employeeName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Staff Member",
        email: user.email,
        organizationName: organization.name,
        employeeId: activationToken.membership.employeeId,
        designationName: designation?.name ?? null,
        department: activationToken.membership.department,
        team: activationToken.membership.team,
      },
    };
  } catch (err: any) {
    return { success: false, error: "An unexpected error occurred while validating the activation link." };
  }
}

/**
 * Executes the secure 3-Phase Staff Account Activation Protocol.
 * 
 * Invariant: Zero database locks are held during external Supabase Auth network calls.
 * 
 * Phase 1: PostgreSQL Reservation (atomic, 60s timeout, short tx)
 * Phase 2: Supabase Auth Password Update (outside all DB transactions)
 * Phase 3: PostgreSQL Finalization (consume token, activate membership, audit event, short tx)
 */
export async function activateStaffAccountAction(
  input: unknown
): Promise<ActionResult<{ redirectUrl: string }>> {
  const parsed = ActivateStaffAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const tokenHash = crypto.createHash("sha256").update(parsed.data.token.trim()).digest("hex");
  const now = new Date();

  // =========================================================================
  // PHASE 1: PostgreSQL Reservation Transaction (SHORT TRANSACTION ONLY)
  // =========================================================================
  let reservation: {
    tokenId: string;
    membershipId: string;
    userId: string;
    organizationId: string;
  };

  try {
    reservation = await prisma.$transaction(async (tx) => {
      const token = await tx.staffActivationToken.findUnique({
        where: { tokenHash },
        include: {
          membership: true,
        },
      });

      if (!token) {
        throw new ValidationError("Invalid or expired activation link.");
      }

      if (token.usedAt) {
        throw new ValidationError("This activation link has already been used. Please sign in.");
      }

      if (token.expiresAt < now) {
        throw new ValidationError("This activation link has expired. Please request a new invitation.");
      }

      if (token.membership.status !== "INVITED") {
        throw new ValidationError("This account has already been activated or is not eligible for activation.");
      }

      // Check if another activation request has an active reservation
      if (token.reservedUntil && token.reservedUntil > now) {
        throw new ValidationError("Activation is already being processed. Please try again in a moment.");
      }

      // Atomically reserve for 60 seconds
      const reservationExpiry = new Date(Date.now() + 60 * 1000);
      await tx.staffActivationToken.update({
        where: { id: token.id },
        data: {
          reservedUntil: reservationExpiry,
        },
      });

      return {
        tokenId: token.id,
        membershipId: token.membership.id,
        userId: token.membership.userId,
        organizationId: token.organizationId,
      };
    });
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to initiate activation" };
  }

  // =========================================================================
  // PHASE 2: Supabase Auth Password Update (OUTSIDE ALL DATABASE TRANSACTIONS)
  // =========================================================================
  const supabaseAdmin = getSupabaseAdminClient();
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    reservation.userId,
    {
      password: parsed.data.password,
      email_confirm: true,
    }
  );

  if (authError) {
    // If Supabase Auth fails, the DB record is untouched: usedAt remains null and reservedUntil expires in 60s.
    await logSystemAuditEvent({
      action: "ACCESS_DENIED",
      actorType: "SYSTEM",
      entityType: "Membership",
      entityId: reservation.membershipId,
      organizationId: reservation.organizationId,
      details: {
        reason: "Supabase Auth password update failed during activation",
        error: authError.message,
      },
    });

    return {
      success: false,
      error: authError.message || "Failed to set account password. Please try again shortly.",
    };
  }

  // =========================================================================
  // PHASE 3: PostgreSQL Finalization Transaction (SHORT TRANSACTION ONLY)
  // =========================================================================
  try {
    await prisma.$transaction(async (tx) => {
      const token = await tx.staffActivationToken.findUnique({
        where: { id: reservation.tokenId },
        include: { membership: true },
      });

      if (!token || token.usedAt) {
        throw new ValidationError("Activation state invalid or token already consumed.");
      }

      if (token.membership.status !== "INVITED") {
        throw new ValidationError("Membership is not in an invitable state.");
      }

      const activationDate = new Date();

      // Mark token consumed
      await tx.staffActivationToken.update({
        where: { id: reservation.tokenId },
        data: {
          usedAt: activationDate,
        },
      });

      // Activate membership
      await tx.membership.update({
        where: { id: reservation.membershipId },
        data: {
          status: "ACTIVE",
          activatedAt: activationDate,
        },
      });

      // Activate user record
      await tx.user.update({
        where: { id: reservation.userId },
        data: {
          status: "ACTIVE",
        },
      });

      // Authoritative audit event
      await tx.auditEvent.create({
        data: {
          organizationId: reservation.organizationId,
          actorType: "USER",
          actorId: reservation.userId,
          action: AuditAction.EMPLOYEE_ACTIVATED,
          entityType: "Membership",
          entityId: reservation.membershipId,
          details: {
            activatedAt: activationDate.toISOString(),
          },
        },
      });
    });

    return {
      success: true,
      data: {
        redirectUrl: "/login?activated=true",
      },
    };
  } catch (err: any) {
    // If Phase 3 crashes, Supabase password was updated, but token.usedAt is still null.
    // The user can retry after reservedUntil expires, safely converging state.
    await logSystemAuditEvent({
      action: "ACCESS_DENIED",
      actorType: "SYSTEM",
      entityType: "Membership",
      entityId: reservation.membershipId,
      organizationId: reservation.organizationId,
      details: {
        reason: "PostgreSQL finalization failed after Supabase Auth success",
        error: err.message,
      },
    });

    return {
      success: false,
      error: "Account password updated, but final activation recorded a temporary issue. Please try submitting again.",
    };
  }
}
