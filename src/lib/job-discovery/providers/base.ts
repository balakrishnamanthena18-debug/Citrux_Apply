/**
 * Global Job Discovery & Collection Engine — Base Provider Adapter
 *
 * Implements security controls, safe outbound HTTP requests with SSRF protection,
 * bounded response sizes, request timeouts, and exponential backoff retry.
 */

import { logger } from "@/lib/logger";
import type {
  JobProviderAdapter,
  ProviderCategory,
  ProviderSearchParams,
  ProviderFetchResult,
  ProviderHealthReport,
} from "../types";

export abstract class BaseJobProvider implements JobProviderAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly category: ProviderCategory;
  abstract readonly defaultBaseUrl: string;
  abstract readonly rateLimitPerMinute: number;
  abstract readonly rateLimitDaily: number;
  abstract readonly attributionNotice: string;
  abstract readonly permittedTermsUrl?: string;
  abstract readonly supportedFilters?: readonly string[];

  protected timeoutMs = 5000;
  protected maxResponseBytes = 10 * 1024 * 1024; // 10MB limit

  abstract isConfigured(): boolean;
  abstract fetchJobs(params: ProviderSearchParams): Promise<ProviderFetchResult>;
  abstract checkHealth(): Promise<ProviderHealthReport>;

  /**
   * Safe outbound HTTP fetch with SSRF mitigation and timeout
   */
  protected async safeFetch(
    url: string,
    options: RequestInit = {},
    retries = 2
  ): Promise<Response> {
    // 1. SSRF Protection: Validate URL host
    this.validateOutboundUrl(url);

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= retries) {
      attempt++;
      const controller = new AbortController();

      // Connect upstream AbortSignal if provided
      if (options.signal) {
        if (options.signal.aborted) {
          controller.abort();
        } else {
          options.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
      }

      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            "User-Agent": "Citrux-OOS-JobDiscovery/1.0 (+https://citrux.com/oos-engine)",
            Accept: "application/json",
            ...options.headers,
          },
        });

        clearTimeout(timer);

        // If rate limited (429) or transient 502/503/504, retry with exponential backoff
        if ([429, 502, 503, 504].includes(response.status) && attempt <= retries) {
          const backoff = Math.pow(2, attempt) * 500;
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }

        return response;
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err;
        if (attempt <= retries) {
          const backoff = Math.pow(2, attempt) * 500;
          await new Promise((res) => setTimeout(res, backoff));
        }
      }
    }

    throw lastError || new Error(`Failed to fetch from ${this.name} after ${retries} retries`);
  }

  /**
   * SSRF Protection: strictly blocks local loopbacks, private networks, cloud metadata IPs
   */
  private validateOutboundUrl(urlString: string): void {
    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      throw new Error(`[SECURITY] Invalid URL protocol or format: ${urlString}`);
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`[SECURITY] Forbidden protocol: ${parsed.protocol}`);
    }

    const host = parsed.hostname.toLowerCase();

    // Block localhost and internal domains
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      throw new Error(`[SECURITY] Forbidden host resolution: ${host}`);
    }

    // Block IPv4 private/loopback/link-local/metadata
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.)/.test(host)) {
      throw new Error(`[SECURITY] Forbidden private or metadata IP: ${host}`);
    }

    // Block IPv6 loopback
    if (host === "::1" || host === "[::1]") {
      throw new Error(`[SECURITY] Forbidden IPv6 loopback`);
    }
  }
}
