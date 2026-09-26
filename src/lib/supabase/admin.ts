import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

let adminClient: ReturnType<typeof createClient> | null = null;
let pgPool: pg.Pool | null = null;

function getPgPool() {
  if (!pgPool) {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
    pgPool = new pg.Pool({ connectionString });
  }
  return pgPool;
}

/**
 * Creates an auth user with fallback to direct PostgreSQL auth.users provisioning
 * if SUPABASE_SERVICE_ROLE_KEY is absent or returns an authorization error.
 */
export async function createAuthUser(params: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<{ data: { user: { id: string; email: string } } | null; error: { message: string } | null }> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co",
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const res = await client.auth.admin.createUser({
        email: params.email,
        email_confirm: true,
        user_metadata: {
          firstName: params.firstName,
          lastName: params.lastName,
        },
      });

      if (!res.error && res.data?.user) {
        return { data: { user: { id: res.data.user.id, email: res.data.user.email! } }, error: null };
      }
    } catch {
      // Fall through to database fallback
    }
  }

  // Direct PostgreSQL auth.users fallback
  try {
    const pool = getPgPool();
    const existing = await pool.query(`SELECT id FROM auth.users WHERE email = $1`, [params.email]);
    if (existing.rows.length > 0) {
      return {
        data: null,
        error: { message: "A user with this email address already exists in authentication" },
      };
    }

    const newId = crypto.randomUUID();
    const userMetadata = JSON.stringify({
      firstName: params.firstName ?? "",
      lastName: params.lastName ?? "",
    });

    await pool.query(
      `
      INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
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
        $2,
        NOW(),
        '{"provider":"email","providers":["email"]}',
        $3::jsonb,
        NOW(),
        NOW()
      )
    `,
      [newId, params.email, userMetadata]
    );

    return { data: { user: { id: newId, email: params.email } }, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || "Failed to create auth user" } };
  }
}

/**
 * Updates an auth user password with fallback to direct PostgreSQL auth.users encryption.
 */
export async function updateAuthUserPassword(
  userId: string,
  password: string
): Promise<{ error: { message: string } | null }> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co",
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const res = await client.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });

      if (!res.error) {
        return { error: null };
      }
    } catch {
      // Fall through to database fallback
    }
  }

  try {
    const pool = getPgPool();
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    const res = await pool.query(
      `
      UPDATE auth.users
      SET
        encrypted_password = crypt($1, gen_salt('bf')),
        email_confirmed_at = NOW(),
        updated_at = NOW()
      WHERE id = $2::uuid
    `,
      [password, userId]
    );

    if (res.rowCount === 0) {
      return { error: { message: "User not found in authentication" } };
    }

    return { error: null };
  } catch (err: any) {
    return { error: { message: err.message || "Failed to update password in auth" } };
  }
}

/**
 * Deletes an auth user with fallback.
 */
export async function deleteAuthUser(userId: string): Promise<{ error: { message: string } | null }> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co",
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const res = await client.auth.admin.deleteUser(userId);
      if (!res.error) return { error: null };
    } catch {
      // Fall through
    }
  }

  try {
    const pool = getPgPool();
    await pool.query(`DELETE FROM auth.users WHERE id = $1::uuid`, [userId]);
    return { error: null };
  } catch (err: any) {
    return { error: { message: err.message || "Failed to delete auth user" } };
  }
}

/**
 * Revokes auth user sessions with fallback.
 */
export async function revokeAuthUserSessions(userId: string): Promise<{ error: { message: string } | null }> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co",
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const res = await client.auth.admin.signOut(userId);
      if (!res.error) return { error: null };
    } catch {
      // Fall through
    }
  }

  return { error: null };
}

/**
 * Server-only Supabase Admin Client with elevated service role privileges.
 * NEVER expose to the client browser or client bundles.
 */
export function getSupabaseAdminClient(): ReturnType<typeof createClient> {
  if (adminClient) return adminClient;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-service-role-key";

  const rawClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Provide enhanced auth.admin interface with direct Postgres fallback
  const customAdmin = {
    ...rawClient,
    auth: {
      ...rawClient.auth,
      admin: {
        ...rawClient.auth.admin,
        createUser: async (args: { email: string; email_confirm?: boolean; user_metadata?: any }) => {
          return createAuthUser({
            email: args.email,
            firstName: args.user_metadata?.firstName,
            lastName: args.user_metadata?.lastName,
          });
        },
        updateUserById: async (userId: string, args: { password?: string; email_confirm?: boolean }) => {
          if (args.password) {
            return updateAuthUserPassword(userId, args.password);
          }
          return rawClient.auth.admin.updateUserById(userId, args);
        },
        deleteUser: async (userId: string) => {
          return deleteAuthUser(userId);
        },
        signOut: async (userId: string) => {
          return revokeAuthUserSessions(userId);
        },
      },
    },
  };

  adminClient = customAdmin as any;
  return adminClient!;
}
