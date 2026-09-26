import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function main() {
  const email = process.argv[2];
  const targetRole = process.argv[3] || "ADMIN";

  if (!email) {
    console.log("Usage: node scripts/promote-user.js <email> [ADMIN|EMPLOYEE|CANDIDATE]");
    console.log("\nExisting users in database:");
    const res = await pool.query(`
      SELECT u.id, u.email, u."firstName", u."lastName", m.role, m.status, m."organizationId"
      FROM users u
      LEFT JOIN memberships m ON m."userId" = u.id
      ORDER BY u."createdAt" DESC
    `);
    console.table(res.rows);
    return;
  }

  console.log(`Updating role for ${email} to ${targetRole}...`);
  const userRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (userRes.rows.length === 0) {
    console.error(`User with email "${email}" not found in database.`);
    return;
  }

  const userId = userRes.rows[0].id;
  await pool.query(
    `UPDATE memberships SET role = $1, status = 'ACTIVE' WHERE "userId" = $2`,
    [targetRole, userId]
  );

  console.log(`✓ Successfully updated ${email} to role: ${targetRole}`);
}

main()
  .catch(console.error)
  .finally(() => pool.end());
