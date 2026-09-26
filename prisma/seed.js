import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const operatingOrgId =
  process.env.OPERATING_ORGANIZATION_ID ??
  "00000000-0000-0000-0000-000000000001";

async function main() {
  console.log(`Connecting to database to seed operating organization...`);
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const query = `
    INSERT INTO public.organizations (id, name, slug, status, "createdAt", "updatedAt")
    VALUES ($1, 'ApplyCitrux Operations', 'apply-citrux', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET status = 'ACTIVE', "updatedAt" = NOW()
    RETURNING id, name, slug, status;
  `;

  const res = await client.query(query, [operatingOrgId]);
  console.log("Operating organization seeded successfully:", res.rows[0]);

  await client.end();
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
