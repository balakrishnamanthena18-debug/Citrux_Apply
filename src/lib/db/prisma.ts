import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Allow cloud Postgres providers with intermediate/self-signed cert chains (e.g. Supabase, Neon)
if (typeof process !== "undefined") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  adapter: PrismaPg | undefined;
};

function getAdapter(): PrismaPg {
  if (globalForPrisma.adapter) {
    return globalForPrisma.adapter;
  }
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.adapter = adapter;
  }
  return adapter;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: getAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// In dev, if schema models were generated while server was running, ensure client has latest models
export const prisma = (() => {
  if (
    globalForPrisma.prisma &&
    (globalForPrisma.prisma as any).conversation &&
    (globalForPrisma.prisma as any).privacyRequest &&
    (globalForPrisma.prisma as any).taskGovernancePolicy
  ) {
    return globalForPrisma.prisma;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
})();

