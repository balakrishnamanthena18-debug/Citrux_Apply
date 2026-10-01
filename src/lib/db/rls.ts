import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma";

export interface WithRlsOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Executes a callback within a PostgreSQL interactive transaction with the authenticated
 * user's UUID injected into the transaction-local setting 'request.jwt.claim.sub'.
 * 
 * Uses PostgreSQL's parameterized set_config(setting, value, is_local=true) to prevent
 * SQL injection and ensure the context automatically clears upon COMMIT or ROLLBACK.
 *
 * Configures resilient connection wait and shorter transaction timeouts so
 * session-mode pooler slots are released quickly under concurrent RSC loads.
 */
export async function withRlsContext<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: WithRlsOptions
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
      return fn(tx);
    },
    {
      maxWait: options?.maxWait ?? 8000,
      timeout: options?.timeout ?? 12000,
      isolationLevel: options?.isolationLevel,
    }
  );
}

