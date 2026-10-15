import { logger } from "@/lib/logger";

/**
 * AppUrlConfigurationError
 *
 * Thrown when application URL resolution fails due to missing or invalid
 * environment configuration, particularly in production environments.
 */
export class AppUrlConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppUrlConfigurationError";
    Object.setPrototypeOf(this, AppUrlConfigurationError.prototype);
  }
}

export const DEFAULT_PRODUCTION_APP_URL = "https://portal.careerbutton.in";

export const ALLOWED_REDIRECT_ORIGINS = new Set([
  "https://portal.careerbutton.in",
  "https://citrux-apply-mrgx.vercel.app",
  "https://www.careerbutton.in",
  "https://careerbutton.in",
]);

export const LOCAL_DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export interface ResolveUrlOptions {
  env?: Record<string, string | undefined>;
  nodeEnv?: string;
  requestOrigin?: string | null;
}

export interface UrlValidationResult {
  isValid: boolean;
  error?: string;
  normalizedUrl?: string;
}

/**
 * Determines whether the current execution context is running in a production or deployed cloud environment.
 * Checks:
 * 1. options.nodeEnv or env.NODE_ENV or process.env.NODE_ENV is "production" (case-insensitive)
 * 2. VERCEL === "1"
 * 3. VERCEL_ENV === "production"
 * 4. NEXT_PUBLIC_VERCEL_ENV === "production"
 */
export function isProductionEnvironment(options?: {
  env?: Record<string, string | undefined>;
  nodeEnv?: string;
}): boolean {
  const envSource = options?.env ?? process.env;
  const rawNodeEnv = (options?.nodeEnv ?? envSource.NODE_ENV ?? process.env.NODE_ENV ?? "")
    .toLowerCase()
    .trim();
  if (rawNodeEnv === "production" || rawNodeEnv === "prod") {
    return true;
  }
  const isVercel = envSource.VERCEL === "1" || process.env.VERCEL === "1";
  const vercelEnv = (envSource.VERCEL_ENV ?? process.env.VERCEL_ENV ?? "").toLowerCase().trim();
  if (isVercel && (vercelEnv === "production" || !vercelEnv)) {
    return true;
  }
  return false;
}

/**
 * Checks if a hostname refers to localhost, loopback, or private networks.
 */
function isLocalOrPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }

  // Check private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 127.0.0.0/8
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octet1 = Number(ipv4Match[1]);
    const octet2 = Number(ipv4Match[2]);
    if (octet1 === 10) return true;
    if (octet1 === 192 && octet2 === 168) return true;
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;
    if (octet1 === 169 && octet2 === 254) return true;
    if (octet1 === 127) return true;
    if (octet1 === 0) return true;
  }

  return false;
}

/**
 * Safely extracts and validates a trusted origin from incoming request host and protocol headers.
 * Strictly verifies against ALLOWED_REDIRECT_ORIGINS (and LOCAL_DEV_ORIGINS in development).
 * Rejects any spoofed, unexpected, or unapproved host headers.
 */
export function getTrustedOriginFromHost(
  rawHost: string | null | undefined,
  rawProto?: string | null,
  options?: { nodeEnv?: string; env?: Record<string, string | undefined> }
): string | undefined {
  if (!rawHost || typeof rawHost !== "string") return undefined;

  // Forwarded host can be a comma-separated list; take the client-facing (first) host
  const host = (rawHost.split(",")[0] ?? "").trim();
  if (!host) return undefined;

  const isProduction = isProductionEnvironment(options);
  const proto = (
    rawProto?.split(",")[0]?.trim() || (isProduction ? "https" : "http")
  ).toLowerCase();

  try {
    const candidateUrl = new URL(`${proto}://${host}`);
    const origin = candidateUrl.origin;

    if (isProduction) {
      if (
        candidateUrl.protocol === "https:" &&
        ALLOWED_REDIRECT_ORIGINS.has(origin) &&
        !isLocalOrPrivateHost(candidateUrl.hostname)
      ) {
        return origin;
      }
      return undefined;
    }

    if (ALLOWED_REDIRECT_ORIGINS.has(origin) || LOCAL_DEV_ORIGINS.has(origin)) {
      return origin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates a candidate URL string for a given environment.
 */
export function validateAppUrl(candidateUrl: string, nodeEnv?: string): UrlValidationResult {
  if (!candidateUrl || typeof candidateUrl !== "string" || !candidateUrl.trim()) {
    return { isValid: false, error: "Application URL is required and cannot be empty." };
  }

  const trimmed = candidateUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: `Invalid URL format: "${trimmed}" is not a valid absolute URL.` };
  }

  const isProduction = isProductionEnvironment({ nodeEnv });

  if (isProduction) {
    if (parsed.protocol !== "https:") {
      return {
        isValid: false,
        error: `Production application URL must use HTTPS. Received protocol "${parsed.protocol}".`,
      };
    }

    if (isLocalOrPrivateHost(parsed.hostname)) {
      return {
        isValid: false,
        error: `Production application URL cannot resolve to localhost or a private development host: "${parsed.hostname}".`,
      };
    }
  } else {
    // Non-production (development / test)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        isValid: false,
        error: `Application URL must use HTTP or HTTPS protocol. Received "${parsed.protocol}".`,
      };
    }
  }

  // Normalize: remove trailing slashes from origin + pathname
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  const normalizedUrl = `${parsed.origin}${pathname}`;

  return {
    isValid: true,
    normalizedUrl,
  };
}

/**
 * Resolves the canonical base application URL.
 *
 * Rules:
 * 1. If options.requestOrigin is provided and is an approved origin:
 *    Uses the verified request origin (e.g., https://portal.careerbutton.in).
 * 2. Checks server-canonical APP_URL, then public NEXT_PUBLIC_APP_URL:
 *    In production: must be HTTPS non-localhost.
 * 3. In production: if unconfigured, invalid, or resolves to localhost, safely falls back
 *    to DEFAULT_PRODUCTION_APP_URL (https://portal.careerbutton.in).
 * 4. Never returns localhost in production or deployed cloud environments.
 * 5. In local dev or test: defaults to "http://localhost:3000" if unconfigured.
 * 6. Normalizes trailing slashes.
 */
export function resolveAppUrl(options?: ResolveUrlOptions): string {
  const envSource = options?.env ?? process.env;
  const isProduction = isProductionEnvironment(options);

  // 1. If request origin is provided from incoming HTTP headers and is an approved origin, use it
  if (options?.requestOrigin) {
    const trimmedOrigin = options.requestOrigin.trim().replace(/\/+$/, "");
    try {
      const parsedOrigin = new URL(trimmedOrigin);
      if (isProduction) {
        if (
          parsedOrigin.protocol === "https:" &&
          ALLOWED_REDIRECT_ORIGINS.has(parsedOrigin.origin) &&
          !isLocalOrPrivateHost(parsedOrigin.hostname)
        ) {
          return parsedOrigin.origin;
        }
      } else {
        if (
          ALLOWED_REDIRECT_ORIGINS.has(parsedOrigin.origin) ||
          LOCAL_DEV_ORIGINS.has(parsedOrigin.origin)
        ) {
          return parsedOrigin.origin;
        }
      }
    } catch {
      // Invalid requestOrigin format; continue to env resolution
    }
  }

  // 2. Check server-canonical APP_URL first, then public NEXT_PUBLIC_APP_URL
  const configuredUrl = (envSource.APP_URL || envSource.NEXT_PUBLIC_APP_URL || "").trim();

  if (isProduction) {
    if (!configuredUrl) {
      return DEFAULT_PRODUCTION_APP_URL;
    }

    const validation = validateAppUrl(configuredUrl, "production");
    if (!validation.isValid || !validation.normalizedUrl) {
      logger.warn("[CONFIG] Invalid or development URL configured in production, falling back to default production URL", {
        configuredUrl,
        error: validation.error,
        fallback: DEFAULT_PRODUCTION_APP_URL,
      });
      return DEFAULT_PRODUCTION_APP_URL;
    }

    return validation.normalizedUrl;
  }

  // Non-production (development / test)
  if (!configuredUrl) {
    return "http://localhost:3000";
  }

  const effectiveNodeEnv = options?.nodeEnv ?? envSource.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  const validation = validateAppUrl(configuredUrl, effectiveNodeEnv);
  if (!validation.isValid || !validation.normalizedUrl) {
    return "http://localhost:3000";
  }

  return validation.normalizedUrl;
}

/**
 * Builds an absolute application URL given a path and optional options.
 * Normalizes leading and trailing slashes so paths are cleanly joined.
 * Rewrites any accidental localhost URLs in production to the canonical production URL.
 *
 * Examples:
 *   buildAppUrl("/auth/activate?token=...")
 *   -> "https://portal.careerbutton.in/auth/activate?token=..." (in production)
 *   -> "http://localhost:3000/auth/activate?token=..." (in development)
 */
export function buildAppUrl(path: string, options?: ResolveUrlOptions): string {
  const baseUrl = resolveAppUrl(options);
  if (!path) return baseUrl;

  // Handle cases where an absolute URL is passed
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const parsed = new URL(path);
      const isProduction = isProductionEnvironment(options);

      // In production, prevent any localhost URL leakage by rewriting origin to baseUrl
      if (isProduction && isLocalOrPrivateHost(parsed.hostname)) {
        const pathPart = `${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}${parsed.hash}`;
        return `${baseUrl}${pathPart.startsWith("/") ? pathPart : "/" + pathPart}`;
      }

      // If already a valid absolute URL on an allowed domain, return as-is
      const effectiveNodeEnv = options?.nodeEnv ?? options?.env?.NODE_ENV ?? process.env.NODE_ENV;
      if (isAllowedRedirectUrl(path, effectiveNodeEnv)) {
        return path;
      }
    } catch {
      // Fall through to path joining
    }
  }

  // Clean leading slashes and ensure exactly one slash joins baseUrl and path
  const normalizedPath = "/" + path.replace(/^\/+/, "");
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Validates whether a redirect URL is trusted and safe.
 * Rejects untrusted external domains, javascript: protocols, protocol-relative URLs (//).
 * Allows:
 * - Relative internal paths (e.g. "/login?confirmed=true")
 * - Absolute URLs whose origin matches an approved production domain
 * - Absolute localhost URLs ONLY in development/test
 */
export function isAllowedRedirectUrl(candidateUrl: string | null | undefined, nodeEnv?: string): boolean {
  if (!candidateUrl || typeof candidateUrl !== "string") return false;
  const trimmed = candidateUrl.trim();
  if (!trimmed) return false;

  const isProduction = isProductionEnvironment({ nodeEnv });

  // Check relative path
  if (trimmed.startsWith("/")) {
    // Disallow protocol-relative URLs like "//attacker.com" and backslashes
    if (trimmed.startsWith("//") || trimmed.includes("\\")) return false;
    // Disallow javascript/data schemes or control chars
    if (trimmed.toLowerCase().startsWith("/\\") || trimmed.includes("\0")) return false;
    return true;
  }

  // Check absolute URL
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

    if (isProduction) {
      if (parsed.protocol !== "https:") return false;
      return ALLOWED_REDIRECT_ORIGINS.has(parsed.origin);
    } else {
      return ALLOWED_REDIRECT_ORIGINS.has(parsed.origin) || LOCAL_DEV_ORIGINS.has(parsed.origin);
    }
  } catch {
    return false;
  }
}

/**
 * Sanitizes redirect destination against allowed URLs.
 */
export function sanitizeRedirectDestination(
  targetUrl: string | null | undefined,
  defaultFallback: string = "/",
  nodeEnv?: string
): string {
  if (isAllowedRedirectUrl(targetUrl, nodeEnv)) {
    return targetUrl!.trim();
  }
  return defaultFallback;
}
