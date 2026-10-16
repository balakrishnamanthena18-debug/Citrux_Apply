"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import { getAuthenticatedContext, requireAdmin } from "@/lib/auth/context";
import { logUserAuditEvent, logSystemAuditEvent } from "@/lib/audit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAppUrl, getTrustedOriginFromHost, getRequestOrigin } from "@/lib/url";
import { logger } from "@/lib/logger";
import { AuditAction, Role } from "@/generated/prisma";
import {
  LoginSchema,
  CandidateRegisterSchema,
  EmployeeInviteSchema,
  UpdateMemberRoleSchema,
  DeactivateMemberSchema,
  ForgotPasswordSchema,
  ActivateStaffAccountSchema,
  ResendVerificationEmailSchema,
  GENERIC_LOGIN_VALIDATION_ERROR,
  GENERIC_SIGNUP_VALIDATION_ERROR,
} from "@/lib/validation/auth.schemas";
import {
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  extractClientIp,
} from "@/lib/auth/rate-limiter";
import { AuthorizationError, ValidationError } from "@/lib/errors";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Helper to safely extract client IP in server action context
 */
async function getClientIp(): Promise<string> {
  try {
    const headerStore = await headers();
    return extractClientIp(headerStore);
  } catch {
    return "127.0.0.1";
  }
}

/**
 * Signs in a user with email and password, setting secure HTTP-only Supabase auth cookies.
 * Enforces rate limiting against brute-force attacks and logs audit events.
 */
export async function signInAction(formData: FormData): Promise<ActionResult<{ redirectUrl: string }>> {
  let stage = "STAGE_0_START";
  try {
    stage = "STAGE_1_PARSE_INPUT";
    const clientIp = await getClientIp();
    const rawData = {
      email: formData.get("email"),
      password: formData.get("password"),
      username: formData.get("username") || undefined,
    };

    const parsed = LoginSchema.safeParse(rawData);
    if (!parsed.success) {
      logger.warn("[AUTH_VALIDATION_FAILURE] Login input validation rejected", {
        endpoint: "signInAction",
        ip: clientIp,
        failedFields: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          code: issue.code,
        })),
      });
      return { success: false, error: GENERIC_LOGIN_VALIDATION_ERROR };
    }

    const normalizedEmail = parsed.data.email.toLowerCase().trim();
    const rateLimitParams = { email: normalizedEmail, ip: clientIp };

    console.log(`[AUTH_FLOW] LOGIN_START email_domain=${normalizedEmail.split("@")[1] ?? "unknown"}`);

    // 1. Enforce Distributed Database-Backed Rate Limiting against Brute-Force Attacks
    stage = "STAGE_2_RATE_LIMIT_CHECK";
    let rateLimitCheck;
    try {
      rateLimitCheck = await checkRateLimit("LOGIN", rateLimitParams);
    } catch (rlErr: any) {
      console.error("[AUTH_FLOW] Rate limiter check error (graceful fallback):", rlErr?.message);
      rateLimitCheck = { allowed: true, remaining: 5 };
    }

    if (!rateLimitCheck.allowed) {
      try {
        await logSystemAuditEvent({
          action: AuditAction.SECURITY_ALERT,
          actorType: "ANONYMOUS",
          entityType: "User",
          details: {
            reason: "Login rate limit exceeded",
            email: normalizedEmail,
            ip: clientIp,
            retryAfterSeconds: rateLimitCheck.retryAfterSeconds,
          },
        });
      } catch (auditErr) {
        console.error("[AUTH_FLOW] Audit logging failed:", auditErr);
      }

      const retryMin = Math.ceil((rateLimitCheck.retryAfterSeconds || 60) / 60);
      return {
        success: false,
        error: `Too many failed login attempts. Please try again in ${retryMin} minute(s).`,
      };
    }

    console.log("[AUTH_FLOW] RATE_LIMIT_CHECK_COMPLETE");

    stage = "STAGE_3_SUPABASE_CLIENT_CREATE";
    const supabase = await createServerClient();

    stage = "STAGE_4_SUPABASE_AUTH_SIGN_IN";
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: parsed.data.password,
    });

    console.log(`[AUTH_FLOW] SUPABASE_AUTH_COMPLETE success=${!error && !!data?.user}`);

    if (error || !data.user) {
      const rawMessage = (error?.message || "").toLowerCase();
      const isInternalError =
        (error?.status !== undefined && error.status >= 500) ||
        (error as any)?.code === "unexpected_failure" ||
        rawMessage.includes("database error") ||
        rawMessage.includes("scan error") ||
        rawMessage.includes("internal server error") ||
        rawMessage.includes("connection");

      if (isInternalError) {
        console.error(`[AUTH_FLOW] Supabase Auth internal error during sign in for domain [${normalizedEmail.split("@")[1]}]:`, {
          status: error?.status,
          code: (error as any)?.code,
          message: error?.message,
        });

        try {
          await logSystemAuditEvent({
            action: AuditAction.SECURITY_ALERT,
            actorType: "SYSTEM",
            entityType: "User",
            details: {
              email: normalizedEmail,
              ip: clientIp,
              reason: "Supabase Auth service internal error during sign in",
              errorStatus: error?.status,
            },
          });
        } catch (auditErr: any) {
          console.error("[AUTH_FLOW] Failed to record system audit for auth server error:", auditErr?.message);
        }

        return {
          success: false,
          error: "Authentication service is temporarily unavailable. Please try again later.",
        };
      }

      // Record failed attempt atomically in PostgreSQL only for true credential failures
      try {
        await recordFailedAttempt("LOGIN", rateLimitParams);
      } catch (e: any) {
        console.error("[AUTH_FLOW] recordFailedAttempt error:", e?.message);
      }

      try {
        await logSystemAuditEvent({
          action: AuditAction.ACCESS_DENIED,
          actorType: "ANONYMOUS",
          entityType: "User",
          details: {
            email: normalizedEmail,
            ip: clientIp,
            reason: error?.message ?? "Invalid credentials",
          },
        });
      } catch (e: any) {
        console.error("[AUTH_FLOW] logSystemAuditEvent error:", e?.message);
      }

      const errorMessage = rawMessage.includes("email not confirmed")
        ? "Email not confirmed. Please verify your email address before signing in."
        : "Invalid email or password";

      return { success: false, error: errorMessage };
    }

    // 2. Resolve membership within transaction-local RLS context to verify active status
    stage = "STAGE_5_RLS_MEMBERSHIP_LOOKUP";
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

      console.log(`[AUTH_FLOW] MEMBERSHIP_RESOLVED found=${!!membership} role=${membership?.role ?? "none"}`);

      if (!membership) {
        try {
          await recordFailedAttempt("LOGIN", rateLimitParams);
          await supabase.auth.signOut();
        } catch (e: any) {
          console.error("[AUTH_FLOW] signOut on inactive membership error:", e?.message);
        }
        return { success: false, error: "Account is inactive or pending organization approval" };
      }

      // 3. Reset rate limit counter on successful authentication
      stage = "STAGE_6_RATE_LIMIT_RESET";
      try {
        await recordSuccessfulAttempt("LOGIN", rateLimitParams);
      } catch (e: any) {
        console.error("[AUTH_FLOW] recordSuccessfulAttempt error:", e?.message);
      }

      stage = "STAGE_7_AUDIT_LOG_SUCCESS";
      try {
        await logUserAuditEvent({
          userId: data.user.id,
          organizationId: membership.organizationId,
          action: AuditAction.USER_LOGIN,
          entityType: "User",
          entityId: data.user.id,
          details: { ip: clientIp },
        });
      } catch (e: any) {
        console.error("[AUTH_FLOW] logUserAuditEvent error:", e?.message);
      }

      stage = "STAGE_8_REDIRECT_RESOLUTION";
      let redirectUrl = "/candidate";
      if (membership.role === "ADMIN") redirectUrl = "/admin";
      else if (membership.role === "EMPLOYEE") redirectUrl = "/employee";

      console.log(`[AUTH_FLOW] LOGIN_SUCCESS redirectUrl=${redirectUrl}`);

      return { success: true, data: { redirectUrl } };
    } catch (err: any) {
      console.error("[AUTH_FLOW] Membership resolution error:", err?.message || err);
      try {
        await supabase.auth.signOut();
      } catch {}
      return { success: false, error: "Failed to establish user context. Please try again." };
    }
  } catch (globalErr: any) {
    console.error(`[AUTH_FLOW] Unexpected signInAction exception at stage [${stage}]:`, {
      name: globalErr?.name,
      message: globalErr?.message,
    });
    const isConnError =
      globalErr?.message?.toLowerCase().includes("fetch") ||
      globalErr?.message?.toLowerCase().includes("connect") ||
      globalErr?.message?.toLowerCase().includes("network");

    return {
      success: false,
      error: isConnError
        ? "Unable to connect to the authentication service. Please check your network and try again."
        : "An unexpected error occurred during sign in. Please try again.",
    };
  }
}

/**
 * Registers a new Candidate.
 * Tenancy: Candidates belong to the company's operating organization as customer records.
 * Distributed rate limiting by client IP to prevent account creation abuse.
 */
export async function signUpCandidateAction(
  formData: FormData
): Promise<
  ActionResult<{
    redirectUrl: string;
    emailConfirmationRequired?: boolean;
    email?: string;
  }>
> {
  try {
    const clientIp = await getClientIp();
    const rateLimitParams = { ip: clientIp };
    
    let rateLimitCheck;
    try {
      rateLimitCheck = await checkRateLimit("REGISTER", rateLimitParams);
    } catch {
      rateLimitCheck = { allowed: true, remaining: 10 };
    }

    if (!rateLimitCheck.allowed) {
      try {
        await logSystemAuditEvent({
          action: AuditAction.SECURITY_ALERT,
          actorType: "ANONYMOUS",
          entityType: "User",
          details: { reason: "Registration rate limit exceeded", ip: clientIp },
        });
      } catch {}
      return { success: false, error: "Registration rate limit exceeded. Please try again later." };
    }

    const rawDisplayName = formData.get("displayName")?.toString().trim();
    let rawFirstName = formData.get("firstName")?.toString().trim();
    let rawLastName = formData.get("lastName")?.toString().trim();

    if (!rawFirstName && rawDisplayName) {
      const parts = rawDisplayName.split(" ");
      rawFirstName = parts[0] || "Candidate";
      rawLastName = parts.slice(1).join(" ") || "User";
    }

    const rawData = {
      email: formData.get("email"),
      password: formData.get("password"),
      username: formData.get("username") || undefined,
      displayName: rawDisplayName || undefined,
      firstName: rawFirstName,
      lastName: rawLastName,
    };

    const parsed = CandidateRegisterSchema.safeParse(rawData);
    if (!parsed.success) {
      logger.warn("[AUTH_VALIDATION_FAILURE] Registration input validation rejected", {
        endpoint: "signUpCandidateAction",
        ip: clientIp,
        failedFields: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          code: issue.code,
        })),
      });
      return { success: false, error: GENERIC_SIGNUP_VALIDATION_ERROR };
    }

    // 1. Resolve operating organization strictly via explicit OPERATING_ORGANIZATION_ID configuration
    const operatingOrgId = process.env.OPERATING_ORGANIZATION_ID;
    if (!operatingOrgId) {
      try {
        await logSystemAuditEvent({
          action: AuditAction.SECURITY_ALERT,
          actorType: "SYSTEM",
          entityType: "Organization",
          details: { error: "Missing OPERATING_ORGANIZATION_ID server configuration" },
        });
      } catch {}
      return { success: false, error: "Operating organization configuration is missing. Registration is disabled." };
    }

    const operatingOrg = await prisma.organization.findUnique({
      where: { id: operatingOrgId },
    });

    if (!operatingOrg || operatingOrg.status !== "ACTIVE") {
      try {
        await logSystemAuditEvent({
          action: AuditAction.SECURITY_ALERT,
          actorType: "SYSTEM",
          entityType: "Organization",
          entityId: operatingOrgId,
          details: { error: "Configured OPERATING_ORGANIZATION_ID is not found or not active" },
        });
      } catch {}
      return { success: false, error: "Operating organization is unavailable or inactive. Registration is disabled." };
    }

    // 2. Pre-check database to prevent redundant Supabase Auth calls and email quota burn if user already exists
    const existingUser = prisma.user?.findUnique
      ? await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true },
        })
      : null;
    if (existingUser) {
      return { success: false, error: "A user with this email address already exists" };
    }

    // 3. Create user in Supabase Auth
    const requestOrigin = await getRequestOrigin();
    const supabase = await createServerClient();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: buildAppUrl(`/api/auth/callback?next=${encodeURIComponent("/login?confirmed=true")}`, {
          requestOrigin,
        }),
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
        },
      },
    });

    if (authError || !authData.user) {
      const rawMessage = (authError?.message || "").toLowerCase();
      const status = authError?.status;
      const code = (authError as any)?.code;

      const isRateLimited =
        status === 429 ||
        code === "over_email_send_rate_limit" ||
        code === "over_request_rate_limit" ||
        rawMessage.includes("rate limit") ||
        rawMessage.includes("too many requests") ||
        rawMessage.includes("email rate limit");

      if (isRateLimited) {
        logger.warn("[AUTH_FLOW] Supabase Auth email rate limit exceeded during registration", {
          endpoint: "signUpCandidateAction",
          status,
          code,
          message: authError?.message,
          ip: clientIp,
        });

        return {
          success: false,
          error: "Too many registration or verification email requests. Please wait a few minutes before trying again, or contact support if the issue persists.",
        };
      }

      const isInternalError =
        (status !== undefined && status >= 500) ||
        code === "unexpected_failure" ||
        rawMessage.includes("database error") ||
        rawMessage.includes("scan error") ||
        rawMessage.includes("internal server error") ||
        rawMessage.includes("connection");

      if (isInternalError) {
        logger.error("[AUTH_FLOW] Supabase Auth internal error during registration:", {
          status,
          code,
          message: authError?.message,
        });

        try {
          await logSystemAuditEvent({
            action: AuditAction.SECURITY_ALERT,
            actorType: "SYSTEM",
            entityType: "User",
            details: {
              email: parsed.data.email,
              ip: clientIp,
              reason: "Supabase Auth upstream error during registration",
              errorStatus: status,
            },
          });
        } catch {}

        return {
          success: false,
          error: "Registration service is temporarily unavailable. Please try again later.",
        };
      }

      try {
        await recordFailedAttempt("REGISTER", rateLimitParams);
      } catch {}

      if (
        rawMessage.includes("already registered") ||
        rawMessage.includes("already exists") ||
        rawMessage.includes("user already exists")
      ) {
        return { success: false, error: "A user with this email address already exists" };
      }

      logger.warn("[AUTH_FLOW] Supabase Auth error during registration", {
        endpoint: "signUpCandidateAction",
        status,
        code,
        message: authError?.message,
        ip: clientIp,
      });

      return { success: false, error: authError?.message ?? "Registration failed" };
    }

    // Check if Supabase returned user with empty identities (email enumeration protection enabled)
    if (authData.user.identities && authData.user.identities.length === 0) {
      return { success: false, error: "A user with this email address already exists" };
    }

    const userId = authData.user.id;

    // 4. Create User record and Candidate Membership within user's RLS context
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

      try {
        await logUserAuditEvent({
          userId,
          organizationId: operatingOrg.id,
          action: AuditAction.USER_REGISTERED,
          entityType: "User",
          entityId: userId,
          details: { role: "CANDIDATE", ip: clientIp },
        });
      } catch {}

      const emailConfirmationRequired = !authData.session || !authData.user.email_confirmed_at;

      return {
        success: true,
        data: {
          redirectUrl: "/candidate",
          emailConfirmationRequired,
          email: parsed.data.email,
        },
      };
    } catch (err: any) {
      if (err?.code === "P2002" || err?.message?.toLowerCase().includes("unique constraint")) {
        return { success: false, error: "A user with this email address already exists" };
      }
      return { success: false, error: err.message || "Failed to initialize candidate account" };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "An unexpected error occurred during registration." };
  }
}

/**
 * Resends the candidate account verification / signup confirmation email.
 * Enforces distributed rate limiting by IP and email, with neutral response against enumeration.
 */
export async function resendVerificationEmailAction(
  formData: FormData
): Promise<ActionResult<{ resent: boolean }>> {
  try {
    const rawEmail = formData.get("email");
    const parsed = ResendVerificationEmailSchema.safeParse({ email: rawEmail });

    if (!parsed.success) {
      return { success: false, error: "Please provide a valid email address." };
    }

    const normalizedEmail = parsed.data.email;
    const clientIp = await getClientIp();
    const rateLimitParams = { email: normalizedEmail, ip: clientIp };

    // 1. Enforce rate limiting against verification email flooding
    const rateLimitCheck = await checkRateLimit("REGISTER", rateLimitParams);
    if (!rateLimitCheck.allowed) {
      try {
        await logSystemAuditEvent({
          action: AuditAction.SECURITY_ALERT,
          actorType: "ANONYMOUS",
          entityType: "User",
          details: { reason: "Resend verification rate limit exceeded", ip: clientIp },
        });
      } catch {}

      return {
        success: false,
        error: "Too many email requests. Please wait a few minutes before trying again.",
      };
    }

    // 2. Call Supabase Auth resend
    try {
      const requestOrigin = await getRequestOrigin();
      const supabase = await createServerClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: {
          emailRedirectTo: buildAppUrl(`/api/auth/callback?next=${encodeURIComponent("/login?confirmed=true")}`, {
            requestOrigin,
          }),
        },
      });

      if (resendError) {
        const rawMessage = (resendError.message || "").toLowerCase();
        const status = resendError.status;
        const code = (resendError as any)?.code;

        const isRateLimited =
          status === 429 ||
          code === "over_email_send_rate_limit" ||
          code === "over_request_rate_limit" ||
          rawMessage.includes("rate limit") ||
          rawMessage.includes("too many requests") ||
          rawMessage.includes("email rate limit");

        if (isRateLimited) {
          logger.warn("[AUTH_FLOW] Supabase Auth rate limit on verification resend", {
            status,
            code,
            message: resendError.message,
            ip: clientIp,
          });

          return {
            success: false,
            error: "Too many verification email attempts. Please wait a few minutes before trying again.",
          };
        }

        logger.warn("[AUTH_FLOW] Supabase Auth error during verification resend", {
          status,
          code,
          message: resendError.message,
          ip: clientIp,
        });
      }
    } catch (err: any) {
      logger.error("[AUTH_FLOW] Unexpected error during verification email resend", {
        error: err?.message,
      });
      return {
        success: false,
        error: "Unable to resend verification email right now. Please try again later.",
      };
    }

    // Neutral success response to protect against account enumeration
    return { success: true, data: { resent: true } };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "An unexpected error occurred while requesting verification email.",
    };
  }
}

/**
 * Signs out the current user, logs audit event, and clears session cookies.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    try {
      await logUserAuditEvent({
        userId: user.id,
        action: AuditAction.USER_LOGOUT,
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

  if (parsed.data.organizationId && parsed.data.organizationId !== ctx.organizationId) {
    throw new AuthorizationError("Cannot invite employees to a different organization");
  }

  // Execute within Admin's RLS context
  try {
    await withRlsContext(ctx.userId, async (tx) => {
      let targetUser = await tx.user.findUnique({
        where: { email: parsed.data.email },
      });

      if (!targetUser) {
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
      action: AuditAction.USER_INVITED,
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
      action: AuditAction.ROLE_CHANGED,
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
 * Access is revoked immediately, active sessions terminated, and audit logged.
 */
export async function deactivateMemberAction(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthenticatedContext();
  requireAdmin(ctx);

  const parsed = DeactivateMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  try {
    let targetUserId = "";

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

      targetUserId = membership.userId;

      await tx.membership.update({
        where: { id: parsed.data.membershipId },
        data: { status: "DEACTIVATED" },
      });
    });

    // Invalidate active authentication sessions for the deactivated user
    if (targetUserId) {
      try {
        const supabaseAdmin = getSupabaseAdminClient();
        await supabaseAdmin.auth.admin.signOut(targetUserId);
      } catch {
        // Fallback or non-blocking session termination
      }
    }

    await logUserAuditEvent({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: AuditAction.MEMBERSHIP_DEACTIVATED,
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
 * Sends a password reset recovery email via Supabase Auth.
 * Protected against account enumeration and email flooding rate limits.
 * Recovery email is OTP-first ({{ .Token }}); link prefetch is not required.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<ActionResult> {
  const rawEmail = formData.get("email");
  const parsed = ForgotPasswordSchema.safeParse({ email: rawEmail });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const clientIp = await getClientIp();
  const rateLimitParams = { email: normalizedEmail, ip: clientIp };

  // 1. Rate limiting against password reset spam / email flooding
  const rateLimitCheck = await checkRateLimit("PASSWORD_RESET", rateLimitParams);
  if (!rateLimitCheck.allowed) {
    await logSystemAuditEvent({
      action: AuditAction.SECURITY_ALERT,
      actorType: "ANONYMOUS",
      entityType: "User",
      details: { reason: "Password reset rate limit exceeded", email: normalizedEmail, ip: clientIp },
    });
    return { success: false, error: "Too many attempts. Please wait before requesting another code." };
  }

  await recordFailedAttempt("PASSWORD_RESET", rateLimitParams);

  try {
    console.info("[AUTH_ACTION] requestPasswordResetAction");
    const requestOrigin = await getRequestOrigin();
    const supabase = await createServerClient();
    const redirectTo = buildAppUrl("/reset-password", { requestOrigin });
    // redirectTo is retained for Auth URL allow-list compliance; OTP flow does not require clicking it.
    await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });
  } catch {
    // Non-leaking catch
  }

  // Always return success to prevent account enumeration
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
  role?: string | null;
}

/**
 * Validates a staff activation token for the unauthenticated activation page.
 * Returns non-sensitive details needed to present the activation screen.
 * Rate limited to prevent token brute-forcing.
 */
export async function validateStaffActivationTokenAction(
  token: string
): Promise<ActionResult<ValidatedActivationTokenData>> {
  if (!token || typeof token !== "string" || !token.trim()) {
    return { success: false, error: "Invalid activation token." };
  }

  const clientIp = await getClientIp();
  const rateLimitParams = { token, ip: clientIp };
  const rateLimitCheck = await checkRateLimit("ACTIVATION", rateLimitParams);
  if (!rateLimitCheck.allowed) {
    return { success: false, error: "Too many activation attempts. Please try again later." };
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
      await recordFailedAttempt("ACTIVATION", rateLimitParams);
      return { success: false, error: "This activation link is invalid or has expired." };
    }

    if (activationToken.usedAt) {
      return { success: false, error: "This activation link has already been used. Please sign in." };
    }

    if (activationToken.expiresAt < new Date()) {
      return { success: false, error: "This activation link has expired. Please contact your administrator for a new invitation." };
    }

    if (!activationToken.membership) {
      return { success: false, error: "This activation link is invalid or has expired." };
    }

    if (activationToken.organizationId !== activationToken.membership.organizationId) {
      logger.security("CROSS_TENANT_ACTIVATION_ATTEMPT", {
        tokenId: activationToken.id,
        tokenOrgId: activationToken.organizationId,
        membershipOrgId: activationToken.membership.organizationId,
      });
      return { success: false, error: "Cross-tenant activation is strictly prohibited." };
    }

    if (activationToken.membership.status !== "INVITED") {
      return { success: false, error: "This account has already been activated or is not eligible for activation." };
    }

    const { user, organization, designation } = activationToken.membership;

    if (!user || !organization) {
      return { success: false, error: "Activation account records are incomplete." };
    }

    return {
      success: true,
      data: {
        employeeName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || (activationToken.membership.role === "CANDIDATE" ? "Candidate" : "Staff Member"),
        email: user.email,
        organizationName: organization.name,
        employeeId: activationToken.membership.employeeId,
        designationName: designation?.name ?? null,
        department: activationToken.membership.department,
        team: activationToken.membership.team,
        role: activationToken.membership.role,
      },
    };
  } catch (err: any) {
    logger.error("[ACTIVATION_VALIDATION_ERROR] Unexpected error during activation token validation", {
      errorMessage: err?.message || String(err),
      errorName: err?.name,
    });
    return { success: false, error: "An unexpected error occurred while validating the activation link." };
  }
}

/**
 * Executes the secure 3-Phase Staff Account Activation Protocol.
 * 
 * Invariants:
 * - Passwords are secure (validated for minimum 8, max 128 characters).
 * - Zero database locks during external Supabase Auth network calls.
 * - Activation tokens are single-use, hashed with SHA-256, and atomically consumed.
 */
export async function activateStaffAccountAction(
  input: unknown
): Promise<ActionResult<{ redirectUrl: string }>> {
  const parsed = ActivateStaffAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const clientIp = await getClientIp();
  const rateLimitParams = { token: parsed.data.token, ip: clientIp };
  const rateLimitCheck = await checkRateLimit("ACTIVATION", rateLimitParams);
  if (!rateLimitCheck.allowed) {
    return { success: false, error: "Too many activation attempts. Please try again later." };
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
    role?: string;
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

      if (token.organizationId !== token.membership.organizationId) {
        throw new ValidationError("Cross-tenant activation is strictly prohibited.");
      }

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
        role: token.membership.role,
      };
    });
  } catch (err: any) {
    await recordFailedAttempt("ACTIVATION", rateLimitParams);
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
    await logSystemAuditEvent({
      action: AuditAction.ACCESS_DENIED,
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

      if (token.organizationId !== token.membership.organizationId) {
        throw new ValidationError("Cross-tenant activation is strictly prohibited.");
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
      const isCandidate = reservation.role === Role.CANDIDATE;
      await tx.auditEvent.create({
        data: {
          organizationId: reservation.organizationId,
          actorType: "USER",
          actorId: reservation.userId,
          action: isCandidate ? AuditAction.MEMBERSHIP_ACTIVATED : AuditAction.EMPLOYEE_ACTIVATED,
          entityType: "Membership",
          entityId: reservation.membershipId,
          details: {
            activatedAt: activationDate.toISOString(),
            role: reservation.role,
          },
        },
      });
    });

    await recordSuccessfulAttempt("ACTIVATION", rateLimitParams);

    return {
      success: true,
      data: {
        redirectUrl: "/login?activated=true",
      },
    };
  } catch (err: any) {
    await logSystemAuditEvent({
      action: AuditAction.ACCESS_DENIED,
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
