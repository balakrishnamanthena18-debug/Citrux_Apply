export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /access_token/i,
  /refresh_token/i,
  /authorization/i,
  /cookie/i,
  /apikey/i,
  /api_key/i,
  /secret/i,
  /servicerolekey/i,
  /service_role_key/i,
  /database_url/i,
  /databaseurl/i,
  /direct_url/i,
  /directurl/i,
];

export function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  for (const pattern of SENSITIVE_KEY_PATTERNS) {
    if (pattern.test(key)) {
      return "[REDACTED]";
    }
  }

  if (typeof value === "object") {
    return sanitizeObject(value);
  }

  return value;
}

export function sanitizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      sanitized[k] = sanitizeValue(k, v);
    }
    return sanitized;
  }

  return obj;
}

export class Logger {
  private formatLog(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = sanitizeObject(context) as Record<string, unknown>;
    }

    return JSON.stringify(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      process.stdout.write(this.formatLog("DEBUG", message, context) + "\n");
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    process.stdout.write(this.formatLog("INFO", message, context) + "\n");
  }

  warn(message: string, context?: Record<string, unknown>): void {
    process.stdout.write(this.formatLog("WARN", message, context) + "\n");
  }

  error(message: string, context?: Record<string, unknown>): void {
    process.stderr.write(this.formatLog("ERROR", message, context) + "\n");
  }
}

export const logger = new Logger();
