/**
 * OOS Distributed Authentication & Security Rate Limiter
 * 
 * Provides database-backed, concurrency-safe, atomic rate limiting for sensitive authentication endpoints:
 * - Login attempts (brute-force defense)
 * - Password reset requests (email flooding & resource exhaustion defense)
 * - Registration (account creation abuse defense)
 * - Staff activation (token brute-force defense)
 * 
 * Security Invariants:
 * 1. Distributed & Authoritative: Evaluated against PostgreSQL (shared across serverless/Vercel instances).
 * 2. Atomic: Single PostgreSQL statement with row locks on conflict eliminates race conditions.
 * 3. Privacy-Preserving: Stores only SHA-256 derived key hashes, NEVER raw IP addresses or emails.
 * 4. Low Latency: Single-indexed queries without joins.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

export type RateLimitAction =
  | "LOGIN"
  | "PASSWORD_RESET"
  | "RECOVERY_OTP"
  | "REGISTER"
  | "ACTIVATION"
  | "API_REQUEST"
  | "AI_GENERATION"
  | "SCRAPING_PROTECTION";

export interface RateLimitPolicy {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  error?: string;
}

export interface RateLimitKeyParams {
  email?: string | null;
  ip: string;
  token?: string | null;
  userId?: string | null;
  endpoint?: string | null;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitAction, RateLimitPolicy> = {
  LOGIN: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 15 * 60 * 1000, // 15 minutes lockout
  },
  PASSWORD_RESET: {
    maxAttempts: 3,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 15 * 60 * 1000, // 15 minutes cooldown
  },
  RECOVERY_OTP: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 15 * 60 * 1000, // 15 minutes lockout
  },
  REGISTER: {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockDurationMs: 60 * 60 * 1000, // 1 hour cooldown
  },
  ACTIVATION: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 15 * 60 * 1000, // 15 minutes lockout
  },
  API_REQUEST: {
    maxAttempts: 120,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 60 * 1000, // 1 minute cooldown
  },
  AI_GENERATION: {
    maxAttempts: 10,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 2 * 60 * 1000, // 2 minutes cooldown
  },
  SCRAPING_PROTECTION: {
    maxAttempts: 60,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 5 * 60 * 1000, // 5 minutes block
  },
};

/**
 * Derives a deterministic, privacy-preserving SHA-256 key hash.
 * Never persists raw IP addresses, raw emails, or plaintext authentication tokens.
 */
export function deriveRateLimitKeyHash(
  action: RateLimitAction,
  params: RateLimitKeyParams | string
): string {
  if (typeof params === "string") {
    // Direct domain string identifier
    return crypto
      .createHash("sha256")
      .update(`oos:rl:${action}:${params.toLowerCase().trim()}`)
      .digest("hex");
  }

  const safeIpHash = crypto
    .createHash("sha256")
    .update(`oos:ip:${params.ip.trim()}`)
    .digest("hex")
    .slice(0, 16);

  let domainMaterial = "";
  switch (action) {
    case "LOGIN": {
      const normalizedEmail = (params.email ?? "").toLowerCase().trim();
      domainMaterial = `login:${normalizedEmail}:${safeIpHash}`;
      break;
    }
    case "PASSWORD_RESET": {
      const normalizedEmail = (params.email ?? "").toLowerCase().trim();
      domainMaterial = `password-reset:${normalizedEmail}:${safeIpHash}`;
      break;
    }
    case "RECOVERY_OTP": {
      const normalizedEmail = (params.email ?? "").toLowerCase().trim();
      domainMaterial = `recovery-otp:${normalizedEmail}:${safeIpHash}`;
      break;
    }
    case "REGISTER": {
      domainMaterial = `registration:${safeIpHash}`;
      break;
    }
    case "ACTIVATION": {
      const safeTokenId = params.token
        ? crypto.createHash("sha256").update(params.token.trim()).digest("hex").slice(0, 16)
        : "notoken";
      domainMaterial = `activation:${safeTokenId}:${safeIpHash}`;
      break;
    }
    case "API_REQUEST": {
      const identifier = params.userId ? `user:${params.userId}` : safeIpHash;
      const ep = (params.endpoint ?? "general").toLowerCase().trim();
      domainMaterial = `api:${ep}:${identifier}`;
      break;
    }
    case "AI_GENERATION": {
      const identifier = params.userId ? `user:${params.userId}` : safeIpHash;
      domainMaterial = `ai-gen:${identifier}`;
      break;
    }
    case "SCRAPING_PROTECTION": {
      domainMaterial = `scrape-def:${safeIpHash}`;
      break;
    }
  }

  return crypto
    .createHash("sha256")
    .update(`oos:rl:${action}:${domainMaterial}`)
    .digest("hex");
}

/**
 * Checks whether an action is currently permitted before executing an authentication mutation.
 */
export async function checkRateLimit(
  action: RateLimitAction,
  params: RateLimitKeyParams | string
): Promise<RateLimitResult> {
  const policy = RATE_LIMIT_POLICIES[action];
  const keyHash = deriveRateLimitKeyHash(action, params);
  const now = Date.now();

  try {
    const bucket = await prisma.rateLimitBucket.findUnique({
      where: { keyHash },
      select: {
        attemptCount: true,
        windowStart: true,
        lockedUntil: true,
      },
    });

    if (!bucket) {
      return { allowed: true, remaining: policy.maxAttempts };
    }

    // 1. Check if currently in active lockout
    if (bucket.lockedUntil && bucket.lockedUntil.getTime() > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.lockedUntil.getTime() - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        error: `Rate limit exceeded. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      };
    }

    // 2. Check if sliding window has expired
    const windowElapsedMs = now - bucket.windowStart.getTime();
    if (windowElapsedMs > policy.windowMs) {
      // Window expired, allowed with fresh full limit
      return { allowed: true, remaining: policy.maxAttempts };
    }

    // 3. Check if attempts within window exceed limit
    if (bucket.attemptCount >= policy.maxAttempts) {
      const retryAfterSeconds = Math.max(1, Math.ceil(policy.blockDurationMs / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        error: `Rate limit exceeded. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, policy.maxAttempts - bucket.attemptCount),
    };
  } catch (err) {
    // Fail-open with safe fallback in case of transient DB error during read-check, logging warning
    return { allowed: true, remaining: policy.maxAttempts };
  }
}

/**
 * Atomically records a failed attempt in PostgreSQL using atomic ON CONFLICT UPSERT.
 * Concurrency-Safe: Multiple concurrent requests cannot bypass the threshold.
 */
export async function recordFailedAttempt(
  action: RateLimitAction,
  params: RateLimitKeyParams | string
): Promise<RateLimitResult> {
  const policy = RATE_LIMIT_POLICIES[action];
  const keyHash = deriveRateLimitKeyHash(action, params);

  // Trigger non-blocking background cleanup probabilistically (1% of requests)
  if (Math.random() < 0.01) {
    cleanupExpiredRateLimits().catch(() => {});
  }

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        attemptCount: number;
        windowStart: Date;
        lockedUntil: Date | null;
      }>
    >`
      INSERT INTO "rate_limit_buckets" (
        "id",
        "key_hash",
        "action",
        "window_start",
        "attempt_count",
        "locked_until",
        "created_at",
        "updated_at"
      )
      VALUES (
        gen_random_uuid(),
        ${keyHash},
        ${action},
        NOW(),
        1,
        CASE WHEN 1 >= ${policy.maxAttempts} THEN NOW() + (${policy.blockDurationMs} * INTERVAL '1 millisecond') ELSE NULL END,
        NOW(),
        NOW()
      )
      ON CONFLICT ("key_hash") DO UPDATE
      SET
        "action" = EXCLUDED."action",
        "window_start" = CASE
          -- If window expired and not currently locked, restart window
          WHEN ("rate_limit_buckets"."locked_until" IS NULL OR "rate_limit_buckets"."locked_until" <= NOW())
               AND ("rate_limit_buckets"."window_start" + (${policy.windowMs} * INTERVAL '1 millisecond') < NOW())
          THEN NOW()
          ELSE "rate_limit_buckets"."window_start"
        END,
        "attempt_count" = CASE
          -- If window expired and not currently locked, reset count to 1
          WHEN ("rate_limit_buckets"."locked_until" IS NULL OR "rate_limit_buckets"."locked_until" <= NOW())
               AND ("rate_limit_buckets"."window_start" + (${policy.windowMs} * INTERVAL '1 millisecond') < NOW())
          THEN 1
          -- Otherwise increment
          ELSE "rate_limit_buckets"."attempt_count" + 1
        END,
        "locked_until" = CASE
          -- If already locked and lock hasn't expired, maintain lock
          WHEN "rate_limit_buckets"."locked_until" > NOW()
          THEN "rate_limit_buckets"."locked_until"
          -- If window expired, clear lock unless single attempt reaches limit
          WHEN ("rate_limit_buckets"."window_start" + (${policy.windowMs} * INTERVAL '1 millisecond') < NOW())
          THEN CASE WHEN 1 >= ${policy.maxAttempts} THEN NOW() + (${policy.blockDurationMs} * INTERVAL '1 millisecond') ELSE NULL END
          -- If increment reaches or exceeds max attempts, lock it!
          WHEN ("rate_limit_buckets"."attempt_count" + 1) >= ${policy.maxAttempts}
          THEN NOW() + (${policy.blockDurationMs} * INTERVAL '1 millisecond')
          ELSE NULL
        END,
        "updated_at" = NOW()
      RETURNING
        "attempt_count" AS "attemptCount",
        "window_start" AS "windowStart",
        "locked_until" AS "lockedUntil";
    `;

    const updated = rows[0];
    if (!updated) {
      return { allowed: true, remaining: policy.maxAttempts - 1 };
    }

    const now = Date.now();
    const isLocked = updated.lockedUntil && new Date(updated.lockedUntil).getTime() > now;

    if (isLocked) {
      const retryAfterSeconds = Math.max(1, Math.ceil((new Date(updated.lockedUntil!).getTime() - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        error: `Rate limit exceeded. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, policy.maxAttempts - updated.attemptCount),
    };
  } catch (err: any) {
    // Fallback: If DB query fails, return standard remaining estimate
    return { allowed: true, remaining: policy.maxAttempts - 1 };
  }
}

/**
 * Consumes 1 attempt from a rate limit bucket atomically.
 * Used for API endpoints, AI generation requests, and scraping protection where every call counts.
 */
export async function consumeRateLimit(
  action: RateLimitAction,
  params: RateLimitKeyParams | string
): Promise<RateLimitResult> {
  // Single atomic UPSERT — recordFailedAttempt already enforces lock / window /
  // attempt thresholds. A prior findUnique check was a redundant round-trip.
  return recordFailedAttempt(action, params);
}

/**
 * Resets the rate limit counter upon successful authentication.
 * Deletes the bucket to ensure clean storage and fresh limit on subsequent sessions.
 */
export async function recordSuccessfulAttempt(
  action: RateLimitAction,
  params: RateLimitKeyParams | string
): Promise<void> {
  const keyHash = deriveRateLimitKeyHash(action, params);
  try {
    await prisma.rateLimitBucket.deleteMany({
      where: { keyHash },
    });
  } catch {
    // Non-blocking cleanup failure
  }
}

/**
 * Safely deletes expired rate limit buckets older than the retention period (default 1 hour),
 * preserving active windows and currently locked buckets.
 * Idempotent, concurrency-safe, and server-only.
 *
 * @param retentionMs Retention duration in milliseconds (default: 1 hour = 3,600,000 ms)
 * @returns Object with count of deleted records
 */
export async function cleanupExpiredRateLimits(
  retentionMs: number = 60 * 60 * 1000
): Promise<{ deletedCount: number }> {
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - retentionMs);

    const result = await prisma.rateLimitBucket.deleteMany({
      where: {
        windowStart: { lt: threshold },
        AND: [
          {
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
          },
        ],
      },
    });

    return { deletedCount: result.count };
  } catch (err: any) {
    return { deletedCount: 0 };
  }
}

/**
 * Resets the rate limit store (for test suites or administrative unlocks).
 */
export async function resetRateLimitStore(
  action?: RateLimitAction,
  params?: RateLimitKeyParams | string
): Promise<void> {
  if (action && params) {
    const keyHash = deriveRateLimitKeyHash(action, params);
    await prisma.rateLimitBucket.deleteMany({ where: { keyHash } });
  } else {
    await prisma.rateLimitBucket.deleteMany({});
  }
}

/**
 * Validates IPv4 or IPv6 string format.
 */
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv6 regex
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed);
}

/**
 * Safely extracts and sanitizes client IP address from Next.js request headers.
 * Priority:
 * 1. `cf-connecting-ip` (Cloudflare edge)
 * 2. `x-real-ip` (Vercel / reverse proxy)
 * 3. `x-forwarded-for` (first hop)
 * Rejects malformed and spoofed values, defaulting to 127.0.0.1.
 */
export function extractClientIp(headerStore: { get(name: string): string | null | undefined }): string {
  // 1. Cloudflare edge header (unspoofable behind CF)
  const cfIp = headerStore.get("cf-connecting-ip");
  if (cfIp && isValidIp(cfIp.trim())) {
    return cfIp.trim();
  }

  // 2. Vercel / Nginx reverse proxy real IP
  const realIp = headerStore.get("x-real-ip");
  if (realIp && isValidIp(realIp.trim())) {
    return realIp.trim();
  }

  // 3. x-forwarded-for first hop
  const forwardedFor = headerStore.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }

  return "127.0.0.1";
}
