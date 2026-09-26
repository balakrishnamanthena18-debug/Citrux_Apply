import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Server/Client Boundary Security Inspection (tests/integration/client-boundary-security.test.ts)", () => {
  const srcDir = path.resolve(__dirname, "../../src");

  function getAllFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (!file.startsWith(".") && file !== "generated") {
          getAllFiles(fullPath, fileList);
        }
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const allFiles = getAllFiles(srcDir);

  it("ensures Client Components (use client) never import Prisma or database runtime modules", () => {
    const clientFiles = allFiles.filter((file) => {
      const content = fs.readFileSync(file, "utf-8");
      return content.startsWith('"use client"') || content.startsWith("'use client'");
    });

    expect(clientFiles.length).toBeGreaterThan(0);

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content).not.toContain("@/lib/db/prisma");
      expect(content).not.toContain("@/lib/db/rls");
      expect(content).not.toContain("@prisma/client");
      expect(content).not.toContain("@prisma/adapter-pg");
      expect(content).not.toContain("process.env.DATABASE_URL");
      expect(content).not.toContain("process.env.DIRECT_URL");
    }
  });

  it("ensures no secret environment variables use the NEXT_PUBLIC_ prefix", () => {
    const envSchemaPath = path.join(srcDir, "lib/env.ts");
    const envSchemaContent = fs.readFileSync(envSchemaPath, "utf-8");

    // Only approved public variables are allowed
    const publicVarMatches = envSchemaContent.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) || [];
    const allowedPublicVars = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ];

    for (const v of publicVarMatches) {
      expect(allowedPublicVars).toContain(v);
    }
  });

  it("ensures public directory and static assets contain no credentials or migration SQL", () => {
    const publicDir = path.resolve(__dirname, "../../public");
    if (fs.existsSync(publicDir)) {
      const publicFiles = fs.readdirSync(publicDir);
      for (const file of publicFiles) {
        expect(file).not.toMatch(/\.env/);
        expect(file).not.toMatch(/\.sql$/);
        expect(file).not.toMatch(/\.pem$/);
        expect(file).not.toMatch(/\.key$/);
      }
    }
  });
});
