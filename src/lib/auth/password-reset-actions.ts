"use server";

/**
 * Dedicated password-reset recovery actions.
 * Kept in a separate "use server" module from general auth actions so the
 * /verify-reset-otp client form cannot accidentally bind the wrong action ID
 * when co-importing requestPasswordResetAction from the same module.
 */

import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { logUserAuditEvent, logSystemAuditEvent } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma";
import {
  VerifyRecoveryOtpSchema,
  ResetPasswordSchema,
} from "@/lib/validation/auth.schemas";
import {
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  extractClientIp,
} from "@/lib/auth/rate-limiter";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type VerifyRecoveryOtpState = {
  error: string | null;
  redirectUrl: string | null;
};

async function getClientIp(): Promise<string> {
  try {
    const headerStore = await headers();
    return extractClientIp(headerStore);
  } catch {
    return "127.0.0.1";
  }
}

function mapRecoveryOtpError(message: string | undefined): string {
  const normalized = (message || "").toLowerCase();
  if (normalized.includes("expired")) {
    return "That verification code has expired. Request a new code.";
  }
  if (normalized.includes("already") || normalized.includes("used") || normalized.includes("consumed")) {
    return "That verification code has already been used. Request a new code.";
  }
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "Too many attempts. Please wait before trying again.";
  }
  if (
    normalized.includes("invalid") ||
    normalized.includes("otp") ||
    normalized.includes("token") ||
    normalized.includes("credentials")
  ) {
    return "That verification code is incorrect. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Verifies a Supabase Auth recovery OTP and establishes a recovery session.
 * Never logs the OTP value.
 */
export async function verifyRecoveryOtpAction(
  formData: FormData
): Promise<ActionResult<{ redirectUrl: string }>> {
  console.info("[AUTH_ACTION] verifyRecoveryOtpAction");

  const parsed = VerifyRecoveryOtpSchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const clientIp = await getClientIp();
  const rateLimitParams = { email: normalizedEmail, ip: clientIp };

  const rateLimitCheck = await checkRateLimit("RECOVERY_OTP", rateLimitParams);
  if (!rateLimitCheck.allowed) {
    await logSystemAuditEvent({
      action: AuditAction.SECURITY_ALERT,
      actorType: "ANONYMOUS",
      entityType: "User",
      details: { reason: "Recovery OTP rate limit exceeded", email: normalizedEmail, ip: clientIp },
    });
    return { success: false, error: "Too many attempts. Please wait before trying again." };
  }

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: parsed.data.token,
      type: "recovery",
    });

    if (error || !data.session || !data.user) {
      await recordFailedAttempt("RECOVERY_OTP", rateLimitParams);
      return { success: false, error: mapRecoveryOtpError(error?.message) };
    }

    await recordSuccessfulAttempt("RECOVERY_OTP", rateLimitParams);
    return { success: true, data: { redirectUrl: "/reset-password" } };
  } catch {
    await recordFailedAttempt("RECOVERY_OTP", rateLimitParams);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * useActionState-compatible wrapper for the verify-reset-otp form.
 * Bound exclusively via <form action={verifyRecoveryOtpFormAction}>.
 */
export async function verifyRecoveryOtpFormAction(
  _prev: VerifyRecoveryOtpState,
  formData: FormData
): Promise<VerifyRecoveryOtpState> {
  const result = await verifyRecoveryOtpAction(formData);
  if (!result.success) {
    return { error: result.error ?? "Something went wrong. Please try again.", redirectUrl: null };
  }
  return {
    error: null,
    redirectUrl: result.data?.redirectUrl ?? "/reset-password",
  };
}

export async function getPasswordResetSessionAction(): Promise<
  ActionResult<{ email: string | null }>
> {
  console.info("[AUTH_ACTION] getPasswordResetSessionAction");
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        success: false,
        error: "Your verification session is no longer valid. Please request a new code.",
      };
    }

    return { success: true, data: { email: user.email ?? null } };
  } catch {
    return {
      success: false,
      error: "Your verification session is no longer valid. Please request a new code.",
    };
  }
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  console.info("[AUTH_ACTION] resetPasswordAction");

  const rawData = {
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const parsed = ResetPasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      success: false,
      error: "Your verification session is no longer valid. Please request a new code.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    const normalized = (error.message || "").toLowerCase();
    if (normalized.includes("same") || normalized.includes("different")) {
      return { success: false, error: "Choose a password you have not used recently." };
    }
    return { success: false, error: "Something went wrong. Please try again." };
  }

  await logUserAuditEvent({
    userId: user.id,
    action: AuditAction.USER_LOGIN,
    entityType: "User",
    entityId: user.id,
    details: { event: "PASSWORD_UPDATED" },
  });

  try {
    await supabase.auth.signOut();
  } catch {
    // Non-fatal: password already updated
  }

  return { success: true };
}
