import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  console.log("Applying Phase 10D / 10E CBOS migration SQL to database...");
  const migrationPath = path.join(process.cwd(), "prisma/migrations/20261008000000_phase10d_cbos_data_model/migration.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  // Execute the migration SQL
  await prisma.$executeRawUnsafe(sql);
  console.log("Successfully applied Phase 10D / 10E CBOS migration SQL.");
}

main()
  .catch((err) => {
    console.error("Migration execution error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
