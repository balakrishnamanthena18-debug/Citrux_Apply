import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function main() {
  console.log("Setting up admin@citrux.com in Supabase auth.users and public tables...");

  const adminEmail = "admin@citrux.com";
  const adminPassword = "Password123!";
  const orgId = process.env.OPERATING_ORGANIZATION_ID || "00000000-0000-0000-0000-000000000001";

  // Check if admin user exists in auth.users
  const checkAuth = await pool.query(
    `SELECT id, email, email_confirmed_at FROM auth.users WHERE email = $1`,
    [adminEmail]
  );

  let userId;

  if (checkAuth.rows.length > 0) {
    userId = checkAuth.rows[0].id;
    console.log(`Found existing auth.users record: ${userId}. Updating password and confirming email...`);
    await pool.query(
      `
      UPDATE auth.users
      SET
        encrypted_password = crypt($1, gen_salt('bf')),
        email_confirmed_at = NOW(),
        last_sign_in_at = NOW(),
        aud = 'authenticated',
        role = 'authenticated',
        raw_app_meta_data = '{"provider":"email","providers":["email"]}',
        raw_user_meta_data = '{"firstName":"System","lastName":"Admin"}'
      WHERE id = $2
    `,
      [adminPassword, userId]
    );
  } else {
    userId = crypto.randomUUID();
    console.log(`Creating new auth.users record: ${userId}...`);
    await pool.query(
      `
      INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        last_sign_in_at,
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
        $2,
        crypt($3, gen_salt('bf')),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"firstName":"System","lastName":"Admin"}',
        NOW(),
        NOW()
      )
    `,
      [userId, adminEmail, adminPassword]
    );
  }

  // Ensure organization exists
  await pool.query(
    `
    INSERT INTO organizations (id, name, slug, status, "createdAt", "updatedAt")
    VALUES ($1, 'ApplyCitrux Operations', 'apply-citrux', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'
  `,
    [orgId]
  );

  // Ensure public.users record exists
  await pool.query(
    `
    INSERT INTO users (id, email, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES ($1, $2, 'System', 'Admin', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET 
      email = $2,
      "firstName" = 'System',
      "lastName" = 'Admin',
      status = 'ACTIVE'
  `,
    [userId, adminEmail]
  );

  // Ensure ADMIN membership exists
  await pool.query(
    `
    INSERT INTO memberships (id, "organizationId", "userId", role, status, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), $1, $2, 'ADMIN', 'ACTIVE', NOW(), NOW())
    ON CONFLICT ("organizationId", "userId") DO UPDATE SET 
      role = 'ADMIN',
      status = 'ACTIVE'
  `,
    [orgId, userId]
  );

  console.log("\n========================================================");
  console.log("✓ SUCCESS: ADMIN ACCOUNT CONFIGURED & CONFIRMED IN SUPABASE");
  console.log(`URL:      http://localhost:3000/login`);
  console.log(`Email:    ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  console.log(`Role:     ADMIN`);
  console.log("========================================================\n");
}

main()
  .catch((err) => {
    console.error("Error setting up admin:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
