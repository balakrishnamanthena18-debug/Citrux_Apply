/**
 * Lightweight Bot & Automated Scanner Detector (Edge-Compatible)
 *
 * Safe to import in Edge Middleware, Server Actions, and Route Handlers.
 */

const MALICIOUS_BOT_SIGNATURES = [
  "sqlmap",
  "nikto",
  "masscan",
  "acunetix",
  "dirbuster",
  "nmap",
  "zgrab",
  "gobuster",
  "wpscan",
  "hydra",
  "metasploit",
  "havij",
  "nessus",
  "arachni",
  "openvas",
  "netsparker",
  "qualys",
];

/**
 * Checks whether the incoming User-Agent matches known malicious automated scanners or exploit tools.
 */
export function isKnownMaliciousBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const normalized = userAgent.toLowerCase().trim();
  return MALICIOUS_BOT_SIGNATURES.some((sig) => normalized.includes(sig));
}
