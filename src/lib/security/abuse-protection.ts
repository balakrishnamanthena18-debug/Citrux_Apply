/**
 * Abuse Protection & Anti-Scraping Defense Module
 *
 * Provides comprehensive defenses against:
 * 1. Malicious automated scanners & scrapers (bot fingerprinting)
 * 2. API endpoint brute-force and resource exhaustion
 * 3. AI generation request flooding
 * 4. Account creation / authentication abuse
 */

import { NextResponse } from "next/server";
import {
  consumeRateLimit,
  extractClientIp,
  RATE_LIMIT_POLICIES,
  type RateLimitAction,
  type RateLimitResult,
} from "@/lib/auth/rate-limiter";
import { logger } from "@/lib/logger";
import { isKnownMaliciousBot } from "./bot-detector";

export { isKnownMaliciousBot };

export interface AbuseCheckOptions {
  action?: RateLimitAction;
  userId?: string | null;
  endpoint?: string;
  customMaxAttempts?: number;
}

export interface AbuseCheckResult {
  allowed: boolean;
  status?: number;
  error?: string;
  headers: Record<string, string>;
  rateLimitResult?: RateLimitResult;
}

/**
 * Validates an incoming request against bot signatures and rate-limiting policies.
 */
export async function verifyAbuseProtection(
  request: Request,
  options: AbuseCheckOptions = {}
): Promise<AbuseCheckResult> {
  const headersObj: Record<string, string> = {};
  const userAgent = request.headers.get("user-agent");

  // 1. Detect malicious scanner bots
  if (isKnownMaliciousBot(userAgent)) {
    logger.security("SUSPICIOUS_BOT_BLOCKED", {
      reason: "Matched malicious bot user-agent signature",
      userAgent: userAgent?.slice(0, 100),
    });

    return {
      allowed: false,
      status: 403,
      error: "Access denied by abuse protection filter.",
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  // 2. Extract Client IP
  const ip = extractClientIp(request.headers);
  const action: RateLimitAction = options.action || "API_REQUEST";
  const policy = RATE_LIMIT_POLICIES[action];

  // 3. Atomically evaluate and consume rate limit
  const rateLimitResult = await consumeRateLimit(action, {
    ip,
    userId: options.userId,
    endpoint: options.endpoint,
  });

  const maxAttempts = options.customMaxAttempts || policy.maxAttempts;
  const remaining = Math.max(0, rateLimitResult.remaining);
  const resetSeconds = Math.ceil(policy.windowMs / 1000);

  headersObj["X-RateLimit-Limit"] = String(maxAttempts);
  headersObj["X-RateLimit-Remaining"] = String(remaining);
  headersObj["X-RateLimit-Reset"] = String(resetSeconds);

  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds || Math.ceil(policy.blockDurationMs / 1000);
    headersObj["Retry-After"] = String(retryAfter);

    logger.security("API_RATE_LIMIT_EXCEEDED", {
      action,
      endpoint: options.endpoint || "general",
      retryAfterSeconds: retryAfter,
    });

    return {
      allowed: false,
      status: 429,
      error: rateLimitResult.error || `Too many requests. Please try again in ${retryAfter} seconds.`,
      headers: headersObj,
      rateLimitResult,
    };
  }

  return {
    allowed: true,
    headers: headersObj,
    rateLimitResult,
  };
}

/**
 * Specifically protects AI generation endpoints from request flooding and abuse.
 */
export async function checkAiGenerationRateLimit(params: {
  userId?: string | null;
  ip: string;
}): Promise<RateLimitResult> {
  const result = await consumeRateLimit("AI_GENERATION", {
    userId: params.userId,
    ip: params.ip,
  });

  if (!result.allowed) {
    logger.security("AI_RATE_LIMIT_EXCEEDED", {
      userId: params.userId || "anonymous",
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  return result;
}

/**
 * Creates a standard JSON NextResponse for a rate-limited or blocked request.
 */
export function createAbuseProtectionResponse(check: AbuseCheckResult): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: check.error || "Rate limit exceeded.",
    },
    {
      status: check.status || 429,
      headers: check.headers,
    }
  );
}
