import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import { logger } from "@/lib/logger";
import {
  LoginSchema,
  GENERIC_LOGIN_VALIDATION_ERROR,
} from "@/lib/validation/auth.schemas";
import {
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  extractClientIp,
} from "@/lib/auth/rate-limiter";
import { logSystemAuditEvent, logUserAuditEvent } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 *
 * Server-side route handler for user authentication.
 * Enforces strict Zod schema validation, password integrity preservation (no mutation),
 * distributed rate limiting, and generic error masking.
 */
export async function POST(request: NextRequest) {
  const clientIp = extractClientIp(request.headers);

  // Enforce body size limit (64KB max for auth payload to prevent memory exhaustion DoS)
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 64 * 1024) {
    logger.warn("[AUTH_SECURITY_ALERT] Auth request payload exceeded 64KB limit", {
      endpoint: "/api/auth/login",
      ip: clientIp,
      contentLength,
    });
    return NextResponse.json(
      { success: false, error: "Payload too large" },
      { status: 413 }
    );
  }

  let rawBody: Record<string, unknown> = {};
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      rawBody = await request.json();
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const formData = await request.formData();
      rawBody = {
        email: formData.get("email"),
        password: formData.get("password"),
        username: formData.get("username") || undefined,
      };
    } else {
      // Fallback attempt to parse JSON
      rawBody = await request.json().catch(() => ({}));
    }
  } catch {
    logger.warn("[AUTH_VALIDATION_FAILURE] Malformed request body on login", {
      endpoint: "/api/auth/login",
      ip: clientIp,
    });
    return NextResponse.json(
      { success: false, error: GENERIC_LOGIN_VALIDATION_ERROR },
      { status: 400 }
    );
  }

  // 1. Server-Side Schema Validation and Sanitization via Zod
  const parsed = LoginSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.warn("[AUTH_VALIDATION_FAILURE] Login input validation rejected", {
      endpoint: "/api/auth/login",
      ip: clientIp,
      failedFields: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        code: issue.code,
      })),
    });

    return NextResponse.json(
      { success: false, error: GENERIC_LOGIN_VALIDATION_ERROR },
      { status: 400 }
    );
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const rateLimitParams = { email: normalizedEmail, ip: clientIp };

  // 2. Distributed Rate Limiting Check
  let rateLimitCheck;
  try {
    rateLimitCheck = await checkRateLimit("LOGIN", rateLimitParams);
  } catch (rlErr: any) {
    logger.error("[AUTH_FLOW] Rate limiter check error (graceful fallback):", { error: rlErr?.message });
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
    } catch {}

    const retryMin = Math.ceil((rateLimitCheck.retryAfterSeconds || 60) / 60);
    return NextResponse.json(
      {
        success: false,
        error: `Too many failed login attempts. Please try again in ${retryMin} minute(s).`,
      },
      { status: 429 }
    );
  }

  // 3. Supabase Auth Verification
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: parsed.data.password,
  });

  if (error || !data?.user) {
    const rawMessage = (error?.message || "").toLowerCase();
    const isInternalError =
      (error?.status !== undefined && error.status >= 500) ||
      (error as any)?.code === "unexpected_failure" ||
      rawMessage.includes("database error") ||
      rawMessage.includes("scan error") ||
      rawMessage.includes("internal server error") ||
      rawMessage.includes("connection");

    if (isInternalError) {
      logger.error("[AUTH_FLOW] Supabase Auth internal server error during sign in", {
        status: error?.status,
        code: (error as any)?.code,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Authentication service is temporarily unavailable. Please try again later.",
        },
        { status: 503 }
      );
    }

    try {
      await recordFailedAttempt("LOGIN", rateLimitParams);
    } catch {}

    if (rawMessage.includes("email not confirmed")) {
      return NextResponse.json(
        {
          success: false,
          error: "Email not confirmed. Please verify your email address before signing in.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Invalid email or password",
      },
      { status: 401 }
    );
  }

  // 4. Reset rate limit counter on success
  try {
    await recordSuccessfulAttempt("LOGIN", rateLimitParams);
  } catch {}

  const user = data.user;
  let redirectUrl = "/candidate";

  try {
    const membership = await withRlsContext(user.id, async (tx) => {
      return tx.membership.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        select: { role: true },
      });
    });

    if (membership?.role === "ADMIN") {
      redirectUrl = "/admin";
    } else if (membership?.role === "EMPLOYEE") {
      redirectUrl = "/employee";
    }

    try {
      await logUserAuditEvent({
        userId: user.id,
        action: AuditAction.USER_LOGIN,
        entityType: "User",
        entityId: user.id,
        details: { role: membership?.role ?? "UNKNOWN", ip: clientIp },
      });
    } catch {}
  } catch {}

  return NextResponse.json({
    success: true,
    data: {
      redirectUrl,
      user: {
        id: user.id,
        email: user.email,
      },
    },
  });
}
