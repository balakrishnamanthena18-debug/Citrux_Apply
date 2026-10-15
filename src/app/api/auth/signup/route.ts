import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import { logger } from "@/lib/logger";
import { buildAppUrl, getTrustedOriginFromHost } from "@/lib/url";
import {
  CandidateRegisterSchema,
  GENERIC_SIGNUP_VALIDATION_ERROR,
} from "@/lib/validation/auth.schemas";
import {
  checkRateLimit,
  recordFailedAttempt,
  extractClientIp,
} from "@/lib/auth/rate-limiter";
import { logSystemAuditEvent, logUserAuditEvent } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signup
 *
 * Server-side route handler for candidate registration.
 * Enforces strict Zod schema validation, password integrity preservation (no mutation),
 * distributed rate limiting, and generic error masking.
 */
export async function POST(request: NextRequest) {
  const clientIp = extractClientIp(request.headers);
  const rateLimitParams = { ip: clientIp };

  // 1. Enforce Registration Rate Limiting
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

    return NextResponse.json(
      { success: false, error: "Registration rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  // Enforce body size limit (64KB max for auth payload to prevent memory exhaustion DoS)
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 64 * 1024) {
    logger.warn("[AUTH_SECURITY_ALERT] Auth request payload exceeded 64KB limit", {
      endpoint: "/api/auth/signup",
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
      const rawDisplayName = formData.get("displayName")?.toString().trim();
      let rawFirstName = formData.get("firstName")?.toString().trim();
      let rawLastName = formData.get("lastName")?.toString().trim();

      if (!rawFirstName && rawDisplayName) {
        const parts = rawDisplayName.split(" ");
        rawFirstName = parts[0] || "Candidate";
        rawLastName = parts.slice(1).join(" ") || "User";
      }

      rawBody = {
        email: formData.get("email"),
        password: formData.get("password"),
        username: formData.get("username") || undefined,
        displayName: rawDisplayName || undefined,
        firstName: rawFirstName,
        lastName: rawLastName,
      };
    } else {
      rawBody = await request.json().catch(() => ({}));
    }
  } catch {
    logger.warn("[AUTH_VALIDATION_FAILURE] Malformed request body on registration", {
      endpoint: "/api/auth/signup",
      ip: clientIp,
    });
    return NextResponse.json(
      { success: false, error: GENERIC_SIGNUP_VALIDATION_ERROR },
      { status: 400 }
    );
  }

  // Handle case where JSON payload includes displayName but not firstName/lastName
  if (!rawBody.firstName && rawBody.displayName && typeof rawBody.displayName === "string") {
    const parts = rawBody.displayName.trim().split(" ");
    rawBody.firstName = parts[0] || "Candidate";
    rawBody.lastName = parts.slice(1).join(" ") || "User";
  }

  // 2. Server-Side Schema Validation and Sanitization via Zod
  const parsed = CandidateRegisterSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.warn("[AUTH_VALIDATION_FAILURE] Registration input validation rejected", {
      endpoint: "/api/auth/signup",
      ip: clientIp,
      failedFields: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        code: issue.code,
      })),
    });

    return NextResponse.json(
      { success: false, error: GENERIC_SIGNUP_VALIDATION_ERROR },
      { status: 400 }
    );
  }

  // 3. Resolve operating organization strictly via explicit OPERATING_ORGANIZATION_ID configuration
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

    return NextResponse.json(
      { success: false, error: "Operating organization configuration is missing. Registration is disabled." },
      { status: 500 }
    );
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

    return NextResponse.json(
      { success: false, error: "Operating organization is unavailable or inactive. Registration is disabled." },
      { status: 503 }
    );
  }

  // 4. Pre-check database to prevent redundant Supabase Auth calls and email quota burn if user already exists
  const existingUser = prisma.user?.findUnique
    ? await prisma.user.findUnique({
        where: { email: parsed.data.email },
        select: { id: true },
      })
    : null;
  if (existingUser) {
    return NextResponse.json(
      { success: false, error: "A user with this email address already exists" },
      { status: 409 }
    );
  }

  // 5. Create user in Supabase Auth
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto");
  const requestOrigin = getTrustedOriginFromHost(host, proto);

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
        username: parsed.data.username,
        displayName: parsed.data.displayName,
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
        endpoint: "/api/auth/signup",
        status,
        code,
        message: authError?.message,
        ip: clientIp,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Too many registration or verification email requests. Please wait a few minutes before trying again, or contact support if the issue persists.",
        },
        { status: 429 }
      );
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

      return NextResponse.json(
        {
          success: false,
          error: "Registration service is temporarily unavailable. Please try again later.",
        },
        { status: 503 }
      );
    }

    try {
      await recordFailedAttempt("REGISTER", rateLimitParams);
    } catch {}

    if (
      rawMessage.includes("already registered") ||
      rawMessage.includes("already exists") ||
      rawMessage.includes("user already exists")
    ) {
      return NextResponse.json(
        { success: false, error: "A user with this email address already exists" },
        { status: 409 }
      );
    }

    logger.warn("[AUTH_FLOW] Supabase Auth error during registration", {
      endpoint: "/api/auth/signup",
      status,
      code,
      message: authError?.message,
      ip: clientIp,
    });

    return NextResponse.json(
      { success: false, error: authError?.message ?? "Registration failed" },
      { status: 400 }
    );
  }

  // Check if Supabase returned user with empty identities (email enumeration protection enabled)
  if (authData.user.identities && authData.user.identities.length === 0) {
    return NextResponse.json(
      { success: false, error: "A user with this email address already exists" },
      { status: 409 }
    );
  }

  const userId = authData.user.id;

  // 6. Create User record and Candidate Membership within user's RLS context
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

    return NextResponse.json(
      {
        success: true,
        data: {
          redirectUrl: "/candidate",
          emailConfirmationRequired,
          email: parsed.data.email,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err?.code === "P2002" || err?.message?.toLowerCase().includes("unique constraint")) {
      return NextResponse.json(
        { success: false, error: "A user with this email address already exists" },
        { status: 409 }
      );
    }

    logger.error("[AUTH_FLOW] Failed to initialize user and candidate membership in database", {
      userId,
      error: err?.message,
    });

    return NextResponse.json(
      {
        success: false,
        error: "Failed to initialize candidate account profile. Please try logging in or contact support.",
      },
      { status: 500 }
    );
  }
}
