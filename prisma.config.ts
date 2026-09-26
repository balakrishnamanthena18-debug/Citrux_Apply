import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Uses DIRECT_URL for CLI schema migrations against Supabase port 5432
    url: process.env.DIRECT_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres",
  },
});
