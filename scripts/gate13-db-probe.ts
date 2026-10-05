import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  try {
    const orgs = await prisma.organization.count();
    const runs = await prisma.applicationIntelligenceRun.count();
    const snaps = await prisma.jobDescriptionSnapshot.count();
    const apps = await prisma.application.count();
    const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'application_%' ORDER BY 1`
    );
    console.log(
      JSON.stringify({
        ok: true,
        orgs,
        runs,
        snaps,
        apps,
        tables: tables.map((t) => t.tablename),
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({ ok: false, error: msg.slice(0, 400) }));
    process.exitCode = 1;
  } finally {
    const { prisma } = await import("../src/lib/db/prisma");
    await prisma.$disconnect();
  }
}

main();
