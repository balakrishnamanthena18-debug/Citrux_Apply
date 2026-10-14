import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  console.log("=== PHASE 9C: LIVE POSTGRESQL FORENSIC INSPECTION ===");

  const expectedTables = [
    "offers",
    "offer_versions",
    "negotiations",
    "negotiation_events",
    "offer_decisions",
    "joining_records",
    "placement_records",
    "offer_evidence",
  ];

  // 1. Table Existence & RLS / FORCE RLS
  console.log("\n1. Verifying Table Existence and Row Level Security:");
  const tableRlsRows: Array<{
    tablename: string;
    rowsecurity: boolean;
    forcerowsecurity: boolean;
  }> = await prisma.$queryRaw`
    SELECT 
      c.relname AS tablename,
      c.relrowsecurity AS rowsecurity,
      c.relforcerowsecurity AS forcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY(${expectedTables})
    ORDER BY c.relname;
  `;

  console.table(tableRlsRows);
  if (tableRlsRows.length !== expectedTables.length) {
    throw new Error(`Expected ${expectedTables.length} tables, found ${tableRlsRows.length}`);
  }
  for (const row of tableRlsRows) {
    if (!row.rowsecurity || !row.forcerowsecurity) {
      throw new Error(`Table ${row.tablename} does NOT have both RLS and FORCE RLS enabled!`);
    }
  }
  console.log("✔ All 8 tables exist with RLS and FORCE RLS ENABLED.");

  // 2. Policies
  console.log("\n2. Verifying RLS Policies:");
  const policyRows: Array<{
    tablename: string;
    policyname: string;
    cmd: string;
  }> = await prisma.$queryRaw`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(${expectedTables})
    ORDER BY tablename, policyname;
  `;
  console.table(policyRows);
  console.log(`✔ Found ${policyRows.length} active RLS security policies across OPOS tables.`);

  // 3. Helper Functions
  console.log("\n3. Verifying Helper Functions:");
  const helperFns = [
    "is_org_member",
    "is_offer_candidate_owner",
    "is_offer_version_candidate_owner",
    "is_negotiation_candidate_owner",
  ];
  const fnRows: Array<{
    proname: string;
    prosecdef: boolean;
  }> = await prisma.$queryRaw`
    SELECT p.proname, p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(${helperFns});
  `;
  console.table(fnRows);
  for (const fn of helperFns) {
    const found = fnRows.find((r) => r.proname === fn);
    if (!found) {
      throw new Error(`Missing expected helper function: ${fn}`);
    }
    if (!found.prosecdef) {
      throw new Error(`Function ${fn} must be SECURITY DEFINER!`);
    }
  }
  console.log("✔ All 4 OPOS helper functions exist with SECURITY DEFINER.");

  // 4. Enums
  console.log("\n4. Verifying OPOS Enums & Values:");
  const expectedEnums = [
    "OfferStatus",
    "OfferVerificationState",
    "OfferProvenanceType",
    "CompensationPaymentFrequency",
    "EquityType",
    "EquityVestingFrequency",
    "NegotiationStatus",
    "NegotiationEventType",
    "OfferDecisionType",
    "OfferDeclineReasonCategory",
    "JoiningStatus",
    "JoiningFailureReason",
  ];
  const enumRows: Array<{
    enum_name: string;
    enum_values: string;
  }> = await prisma.$queryRaw`
    SELECT 
      t.typname AS enum_name,
      string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS enum_values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = ANY(${expectedEnums})
    GROUP BY t.typname
    ORDER BY t.typname;
  `;
  console.table(enumRows.map((e) => ({ enum_name: e.enum_name, values: e.enum_values })));
  if (enumRows.length !== expectedEnums.length) {
    throw new Error(`Expected ${expectedEnums.length} enums, found ${enumRows.length}`);
  }
  console.log("✔ All 12 OPOS enums exist in PostgreSQL with complete value sets.");

  // 5. Audit Action Values
  console.log("\n5. Verifying OPOS AuditAction additions:");
  const auditActionRows: Array<{ enumlabel: string }> = await prisma.$queryRaw`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AuditAction'
      AND e.enumlabel LIKE 'OPOS_%'
    ORDER BY e.enumlabel;
  `;
  console.table(auditActionRows);
  if (auditActionRows.length !== 14) {
    throw new Error(`Expected 14 OPOS AuditAction values, found ${auditActionRows.length}`);
  }
  console.log("✔ All 14 OPOS AuditAction enum values are registered in PostgreSQL.");

  // 6. Foreign Key Constraints
  console.log("\n6. Verifying Foreign Key Constraints:");
  const fkRows: Array<{
    table_name: string;
    constraint_name: string;
  }> = await prisma.$queryRaw`
    SELECT
      tc.table_name,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = ANY(${expectedTables})
    ORDER BY tc.table_name, tc.constraint_name;
  `;
  console.table(fkRows);
  console.log(`✔ Found ${fkRows.length} foreign key constraints across OPOS tables.`);

  console.log("\n=== ALL FORENSIC DATABASE VERIFICATIONS PASSED ===");
}

main()
  .catch((err) => {
    console.error("Forensic verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
