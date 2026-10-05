import { describe, it, expect } from "vitest";
import { parseEnv } from "@/lib/env";

describe("Environment Validation (src/lib/env.ts)", () => {
  const validMockEnv = {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://postgres:password@localhost:6543/postgres?pgbouncer=true",
    DIRECT_URL: "postgresql://postgres:password@localhost:5432/postgres",
    NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-123",
  };

  it("successfully validates a complete and valid environment configuration", () => {
    const result = parseEnv(validMockEnv);
    expect(result.NODE_ENV).toBe("test");
    expect(result.DATABASE_URL).toBe(validMockEnv.DATABASE_URL);
    expect(result.DIRECT_URL).toBe(validMockEnv.DIRECT_URL);
    expect(result.NEXT_PUBLIC_SUPABASE_URL).toBe(validMockEnv.NEXT_PUBLIC_SUPABASE_URL);
    expect(result.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(validMockEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  });

  it("throws an explicit error when required variables are missing", () => {
    const incompleteEnv = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:password@localhost:6543/postgres",
    };

    expect(() => parseEnv(incompleteEnv)).toThrow(/Environment configuration validation failed/);
  });

  it("throws an explicit error when NEXT_PUBLIC_SUPABASE_URL is not a valid URL", () => {
    const invalidUrlEnv = {
      ...validMockEnv,
      NEXT_PUBLIC_SUPABASE_URL: "not-a-valid-url",
    };

    expect(() => parseEnv(invalidUrlEnv)).toThrow(/NEXT_PUBLIC_SUPABASE_URL must be a valid URL/);
  });

  it("prohibits implicit fallback to fake production credentials", () => {
    const emptyEnv = {};
    expect(() => parseEnv(emptyEnv)).toThrow();
  });

  it("validates OPERATING_ORGANIZATION_ID when provided as a valid UUID", () => {
    const envWithOrg = {
      ...validMockEnv,
      OPERATING_ORGANIZATION_ID: "123e4567-e89b-12d3-a456-426614174000",
    };
    const result = parseEnv(envWithOrg);
    expect(result.OPERATING_ORGANIZATION_ID).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("rejects invalid UUID formats for OPERATING_ORGANIZATION_ID", () => {
    const invalidOrgEnv = {
      ...validMockEnv,
      OPERATING_ORGANIZATION_ID: "invalid-not-a-uuid",
    };
    expect(() => parseEnv(invalidOrgEnv)).toThrow(/OPERATING_ORGANIZATION_ID must be a valid UUID/);
  });

  it("accepts optional NVIDIA server-only credentials without requiring them", () => {
    expect(parseEnv(validMockEnv).NVIDIA_API_KEY).toBeUndefined();
    const withNvidia = parseEnv({
      ...validMockEnv,
      NVIDIA_API_KEY: "nvapi-test-placeholder",
    });
    expect(withNvidia.NVIDIA_API_KEY).toBe("nvapi-test-placeholder");
  });
});
