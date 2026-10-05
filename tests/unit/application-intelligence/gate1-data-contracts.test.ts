import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseEnv } from "@/lib/env";
import {
  GATE1_ASYNC_MECHANISM,
  GATE1_PROVIDER_LOCK,
  GATE1_PROVENANCE_LOCK,
  GATE1_REQUIRED_ENUMS,
  GATE1_REQUIRED_MODELS,
  assertGate1DataContracts,
} from "@/lib/application-intelligence/data-contract";
import {
  resolveCareerFactProvenance,
  assertAttestationNotAiInferred,
  isAttestationProvenanceAllowed,
} from "@/lib/application-intelligence/provenance";
import {
  isCandidateVisible,
  isInternalSystem,
  isStaffOnly,
  CREDENTIALS_NEVER_EXPOSED,
} from "@/lib/application-intelligence/visibility-contract";
import {
  EXPERIMENTAL_MODEL_ID,
  EXPERIMENTAL_PROVIDER_ENV_KEY,
} from "@/lib/application-intelligence/constants";

const ROOT = process.cwd();

describe("Phase 2 Gate 1 — final schema / data contracts", () => {
  it("locks Gate 1 data contracts without authorizing feature execution", () => {
    expect(() => assertGate1DataContracts()).not.toThrow();
    expect(GATE1_ASYNC_MECHANISM.primary).toBe(
      "db_queued_runs_plus_vercel_cron_worker"
    );
    expect(GATE1_PROVIDER_LOCK.experimentalModelId).toBe(EXPERIMENTAL_MODEL_ID);
    expect(GATE1_PROVENANCE_LOCK.shape).toBe("candidate_fact_attestations");
    expect(CREDENTIALS_NEVER_EXPOSED).toBe(true);
  });

  it("persists required models and enums in prisma schema", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    for (const model of GATE1_REQUIRED_MODELS) {
      expect(schema).toContain(`model ${model}`);
    }
    for (const enumName of GATE1_REQUIRED_ENUMS) {
      expect(schema).toContain(`enum ${enumName}`);
    }
    expect(schema).toContain('@@map("candidate_fact_attestations")');
  });

  it("ships attestation migration forbidding AI_INFERRED rows", () => {
    const sql = readFileSync(
      join(
        ROOT,
        "prisma/migrations/20261004140000_phase2_gate1_fact_attestations/migration.sql"
      ),
      "utf8"
    );
    expect(sql).toContain("candidate_fact_attestations");
    expect(sql).toContain("provenance_not_ai_inferred");
    expect(sql).toContain("AI_INFERRED");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("resolves attestation rows and keeps default CANDIDATE_PROVIDED", () => {
    const verified = resolveCareerFactProvenance({
      entityType: "CandidateSkill",
      entityId: "00000000-0000-4000-8000-000000000001",
      field: "name",
      valuePresent: true,
      attestation: { provenance: "VERIFIED" },
    });
    expect(verified.provenance).toBe("VERIFIED");
    expect(verified.fieldVerified).toBe(true);

    const defaults = resolveCareerFactProvenance({
      entityType: "CandidateSkill",
      entityId: "00000000-0000-4000-8000-000000000001",
      field: "name",
      valuePresent: true,
    });
    expect(defaults.provenance).toBe("CANDIDATE_PROVIDED");
    expect(defaults.fieldVerified).toBe(false);

    expect(isAttestationProvenanceAllowed("AI_INFERRED")).toBe(false);
    expect(() => assertAttestationNotAiInferred("AI_INFERRED")).toThrow(
      /candidate_fact_attestations/i
    );
  });

  it("locks visibility classes from the design lock", () => {
    expect(isCandidateVisible("alignmentOverallScore")).toBe(true);
    expect(isStaffOnly("qaNotes")).toBe(true);
    expect(isInternalSystem("rawProviderPayload")).toBe(true);
    expect(isInternalSystem("prompts")).toBe(true);
  });

  it("accepts optional NVIDIA env keys as server-only and rejects NEXT_PUBLIC misuse by contract", () => {
    const base = {
      NODE_ENV: "test",
      DATABASE_URL:
        "postgresql://postgres:password@localhost:6543/postgres?pgbouncer=true",
      DIRECT_URL: "postgresql://postgres:password@localhost:5432/postgres",
      NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-123",
    };
    const withoutKey = parseEnv(base);
    expect(withoutKey.NVIDIA_API_KEY).toBeUndefined();

    const withKey = parseEnv({
      ...base,
      NVIDIA_API_KEY: "nvapi-test-placeholder-not-real",
      NVIDIA_API_BASE_URL: "https://integrate.api.nvidia.com/v1",
    });
    expect(withKey.NVIDIA_API_KEY).toBe("nvapi-test-placeholder-not-real");
    expect(withKey.NVIDIA_API_BASE_URL).toBe(
      "https://integrate.api.nvidia.com/v1"
    );
    expect(EXPERIMENTAL_PROVIDER_ENV_KEY).toBe("NVIDIA_API_KEY");
    expect(EXPERIMENTAL_PROVIDER_ENV_KEY.startsWith("NEXT_PUBLIC_")).toBe(false);

    const envSrc = readFileSync(join(ROOT, "src/lib/env.ts"), "utf8");
    expect(envSrc).toMatch(/NVIDIA_API_KEY/);
    expect(envSrc).not.toMatch(/NEXT_PUBLIC_NVIDIA/);
  });

  it("keeps default AIService on Null provider (no vendor SDK imports)", () => {
    const providerDir = join(ROOT, "src/lib/application-intelligence/providers");
    for (const f of ["null-provider.ts", "interface.ts", "types.ts"]) {
      const src = readFileSync(join(providerDir, f), "utf8");
      expect(src).not.toMatch(
        /from\s+["']openai["']|from\s+["']@anthropic|require\(["']openai["']\)/i
      );
    }
    const service = readFileSync(join(providerDir, "service.ts"), "utf8");
    expect(service).toMatch(/NullAIProvider/);
    expect(service).not.toMatch(/NEXT_PUBLIC_/);
  });
});
