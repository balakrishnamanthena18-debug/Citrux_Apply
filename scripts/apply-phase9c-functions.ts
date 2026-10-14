import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  console.log("Applying updated OPOS functions and policies to PostgreSQL database...");

  // Update functions
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.is_org_member(lookup_org_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m."organizationId" = lookup_org_id
          AND m."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
          AND m.status = 'ACTIVE'
          AND m.role IN ('EMPLOYEE', 'ADMIN')
      );
    $$;
    REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO oos_app_runtime, authenticated;

    CREATE OR REPLACE FUNCTION public.is_offer_candidate_owner(lookup_candidate_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM public.candidates c
        WHERE c.id = lookup_candidate_id
          AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
      );
    $$;
    REVOKE ALL ON FUNCTION public.is_offer_candidate_owner(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.is_offer_candidate_owner(uuid) TO oos_app_runtime, authenticated;

    CREATE OR REPLACE FUNCTION public.is_offer_version_candidate_owner(lookup_offer_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM public.offers o
        JOIN public.candidates c ON c.id = o."candidateId"
        WHERE o.id = lookup_offer_id
          AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
      );
    $$;
    REVOKE ALL ON FUNCTION public.is_offer_version_candidate_owner(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.is_offer_version_candidate_owner(uuid) TO oos_app_runtime, authenticated;

    CREATE OR REPLACE FUNCTION public.is_negotiation_candidate_owner(lookup_negotiation_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM public.negotiations n
        JOIN public.offers o ON o.id = n."offerId"
        JOIN public.candidates c ON c.id = o."candidateId"
        WHERE n.id = lookup_negotiation_id
          AND c."userId" = COALESCE((SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid), public.current_user_id())
      );
    $$;
    REVOKE ALL ON FUNCTION public.is_negotiation_candidate_owner(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.is_negotiation_candidate_owner(uuid) TO oos_app_runtime, authenticated;
  `);

  // Drop and re-create offers policies
  await prisma.$executeRawUnsafe(`
    DROP POLICY IF EXISTS "offers_select" ON "public"."offers";
    DROP POLICY IF EXISTS "offers_insert" ON "public"."offers";
    DROP POLICY IF EXISTS "offers_update" ON "public"."offers";

    CREATE POLICY "offers_select"
    ON "public"."offers"
    FOR SELECT
    USING (
      public.is_org_member("organizationId")
      OR public.is_offer_candidate_owner("candidateId")
    );

    CREATE POLICY "offers_insert"
    ON "public"."offers"
    FOR INSERT
    WITH CHECK (
      public.is_org_member("organizationId")
      OR public.is_offer_candidate_owner("candidateId")
    );

    CREATE POLICY "offers_update"
    ON "public"."offers"
    FOR UPDATE
    USING (
      public.is_org_member("organizationId")
      OR public.is_offer_candidate_owner("candidateId")
    )
    WITH CHECK (
      public.is_org_member("organizationId")
      OR public.is_offer_candidate_owner("candidateId")
    );
  `);

  console.log("✔ OPOS functions and policies successfully applied live.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
