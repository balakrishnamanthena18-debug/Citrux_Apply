import { config } from "dotenv";
config({ path: ".env" });

import pg from "pg";

/**
 * Live-DB helper: exercise FORCE RLS as oos_app_runtime with jwt sub.
 * Requires GRANT oos_app_runtime TO the connecting role (applied in test setup).
 */
export function getLiveDbUrl(): string | null {
  return process.env.DIRECT_URL || process.env.DATABASE_URL || null;
}

export async function withBypassClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const url = getLiveDbUrl();
  if (!url) throw new Error("DATABASE_URL/DIRECT_URL required");
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Run fn as oos_app_runtime with request.jwt.claim.sub = userId; always rolls back. */
export async function withRuntimeRlsAsUser<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const url = getLiveDbUrl();
  if (!url) throw new Error("DATABASE_URL/DIRECT_URL required");
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [
      userId,
    ]);
    await client.query("SET LOCAL ROLE oos_app_runtime");
    const result = await fn(client);
    await client.query("ROLLBACK");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function ensureRuntimeRoleGrant(): Promise<void> {
  await withBypassClient(async (client) => {
    await client.query("GRANT oos_app_runtime TO CURRENT_USER");
  });
}
