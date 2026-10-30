import "dotenv/config";
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
  const poolMax = process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 5;
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Per-instance pool allows concurrent worker/RSC transactions while respecting session limits
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 5,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  });
  globalForPrisma.adapter = adapter;
  return adapter;
}

function createPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    if (!("interview" in globalForPrisma.prisma)) {
      globalForPrisma.prisma = undefined;
    } else {
      return globalForPrisma.prisma;
    }
  }
  const client = new PrismaClient({
    adapter: getAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  globalForPrisma.prisma = client;
  return client;
}

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma && !("interview" in globalForPrisma.prisma)) {
    globalForPrisma.prisma = undefined;
  }
  return globalForPrisma.prisma ?? createPrismaClient();
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

