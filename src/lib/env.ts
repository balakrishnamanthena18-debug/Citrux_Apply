import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),
  DIRECT_URL: z
    .string()
    .min(1, "DIRECT_URL is required"),
  OPERATING_ORGANIZATION_ID: z
    .string()
    .uuid("OPERATING_ORGANIZATION_ID must be a valid UUID")
    .optional(),
  SMTP_HOST: z
    .string()
    .default("smtp.gmail.com"),
  SMTP_PORT: z
    .string()
    .default("465"),
  SMTP_USER: z
    .string()
    .optional(),
  SMTP_PASS: z
    .string()
    .optional(),
  EMAIL_FROM: z
    .string()
    .default("notifications@citrux.com"),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

export const envSchema = serverEnvSchema.merge(publicEnvSchema);

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `[CRITICAL] Environment configuration validation failed:\n${errorDetails}`
    );
  }

  return parsed.data;
}

// Runtime validated environment object (lazily evaluated or startup validated)
let validatedEnv: Env | undefined;

export function getEnv(): Env {
  if (!validatedEnv) {
    validatedEnv = parseEnv(process.env);
  }
  return validatedEnv;
}
