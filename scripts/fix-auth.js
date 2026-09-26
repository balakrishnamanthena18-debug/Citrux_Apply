import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function main() {
  console.log("Checking and confirming auth.users in Supabase...");

  // Check auth.users
  const authUsers = await pool.query(`
    SELECT id, email, email_confirmed_at, encrypted_password
    FROM auth.users
  `);
  console.log("Current Supabase Auth users:");
  console.table(authUsers.rows);

  // Ensure pgcrypto extension exists
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Update staff@citrux.com password and email_confirmed_at
  const staffRes = await pool.query(`
    UPDATE auth.users
    SET 
      encrypted_password = crypt('Password123!', gen_salt('bf')),
      email_confirmed_at = NOW(),
      last_sign_in_at = NOW(),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}',
      raw_user_meta_data = '{"firstName":"Sarah","lastName":"Chen"}'
    WHERE email = 'staff@citrux.com'
    RETURNING id, email, email_confirmed_at
  `);

  if (staffRes.rows.length === 0) {
    console.log("Creating staff@citrux.com directly in auth.users...");
    const newId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'staff@citrux.com',
        crypt('Password123!', gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"firstName":"Sarah","lastName":"Chen"}',
        NOW(),
        NOW()
      )
    `, [newId]);

    // Link in users table
    await pool.query(`
      INSERT INTO users ("id", "email", "firstName", "lastName", "status", "createdAt", "updatedAt")
      VALUES ($1, 'staff@citrux.com', 'Sarah', 'Chen', 'ACTIVE', NOW(), NOW())
      ON CONFLICT ("id") DO UPDATE SET "status" = 'ACTIVE'
    `, [newId]);

    await pool.query(`
      INSERT INTO memberships ("id", "organizationId", "userId", "role", "status", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', $1, 'EMPLOYEE', 'ACTIVE', NOW(), NOW())
      ON CONFLICT ("organizationId", "userId") DO UPDATE SET "role" = 'EMPLOYEE', "status" = 'ACTIVE'
    `, [newId]);
  } else {
    console.log("✓ staff@citrux.com password and email confirmation updated successfully!");
  }

  // Also confirm alex.rivera@gmail.com
  await pool.query(`
    UPDATE auth.users
    SET 
      encrypted_password = crypt('Password123!', gen_salt('bf')),
      email_confirmed_at = NOW(),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}',
      raw_user_meta_data = '{"firstName":"Alex","lastName":"Rivera"}'
    WHERE email = 'alex.rivera@gmail.com'
  `);
  console.log("✓ alex.rivera@gmail.com confirmed and password reset to Password123!");

  // Verify
  const verified = await pool.query(`
    SELECT a.id, a.email, a.email_confirmed_at, m.role
    FROM auth.users a
    JOIN users u ON u.id = a.id
    JOIN memberships m ON m."userId" = u.id
  `);
  console.log("\nVerified Auth & Application Users:");
  console.table(verified.rows);
}

main()
  .catch(console.error)
  .finally(() => pool.end());
