-- ==============================================================================
-- Migration: 20260924000000_phase1_identity_rbac
-- Description: Establishes Phase 1 Identity, Tenancy, RBAC, RLS, and Audit Infrastructure
-- ==============================================================================

-- 1. Create Enums
CREATE TYPE "Role" AS ENUM ('CANDIDATE', 'EMPLOYEE', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE "AuditAction" AS ENUM (
  'USER_REGISTERED',
  'USER_LOGIN',
  'USER_LOGOUT',
  'USER_INVITED',
  'MEMBERSHIP_CREATED',
  'ROLE_CHANGED',
  'MEMBERSHIP_ACTIVATED',
  'MEMBERSHIP_DEACTIVATED',
  'ACCESS_DENIED',
  'SECURITY_ALERT'
);

-- 2. Create Application Tables
CREATE TABLE "public"."organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizations_slug_key" UNIQUE ("slug")
);

CREATE TABLE "public"."users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "firstName" VARCHAR(100),
  "lastName" VARCHAR(100),
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);

CREATE TABLE "public"."memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'CANDIDATE',
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_user_unique" UNIQUE ("organizationId", "userId"),
  CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "public"."audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID,
  "actorId" UUID,
  "actorType" VARCHAR(50) NOT NULL DEFAULT 'USER',
  "action" "AuditAction" NOT NULL,
  "entityType" VARCHAR(100) NOT NULL,
  "entityId" VARCHAR(255),
  "details" JSONB,
  "ipAddress" VARCHAR(45),
  "userAgent" VARCHAR(512),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 3. Create Indexes
CREATE INDEX "memberships_userId_status_idx" ON "public"."memberships"("userId", "status");
CREATE INDEX "memberships_organizationId_role_status_idx" ON "public"."memberships"("organizationId", "role", "status");
CREATE INDEX "audit_events_organizationId_createdAt_idx" ON "public"."audit_events"("organizationId", "createdAt");
CREATE INDEX "audit_events_actorId_createdAt_idx" ON "public"."audit_events"("actorId", "createdAt");
CREATE INDEX "audit_events_action_createdAt_idx" ON "public"."audit_events"("action", "createdAt");

-- 4. Create Runtime Role (oos_app_runtime)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oos_app_runtime') THEN
    CREATE ROLE oos_app_runtime WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO oos_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oos_app_runtime;

-- 5. Enable and Force Row Level Security (FORCE ROW LEVEL SECURITY)
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memberships" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_events" FORCE ROW LEVEL SECURITY;

-- 6. Create SECURITY DEFINER Helper & System Functions
-- 6.1 current_user_id()
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION public.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO oos_app_runtime, authenticated;

-- 6.2 get_user_active_org_ids(lookup_user_id uuid)
CREATE OR REPLACE FUNCTION public.get_user_active_org_ids(lookup_user_id uuid)
RETURNS TABLE(org_id uuid)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT "organizationId" FROM public.memberships
  WHERE "userId" = lookup_user_id
    AND status = 'ACTIVE';
$$;
REVOKE ALL ON FUNCTION public.get_user_active_org_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_active_org_ids(uuid) TO oos_app_runtime, authenticated;

-- 6.3 get_user_co_member_ids(lookup_user_id uuid)
CREATE OR REPLACE FUNCTION public.get_user_co_member_ids(lookup_user_id uuid)
RETURNS TABLE(member_user_id uuid)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT m2."userId"
  FROM public.memberships m1
  JOIN public.memberships m2 ON m1."organizationId" = m2."organizationId"
  WHERE m1."userId" = lookup_user_id
    AND m1.status = 'ACTIVE'
    AND m1.role IN ('EMPLOYEE', 'ADMIN')
    AND m2.status = 'ACTIVE';
$$;
REVOKE ALL ON FUNCTION public.get_user_co_member_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_co_member_ids(uuid) TO oos_app_runtime, authenticated;

-- 6.4 is_org_privileged_member(lookup_org_id uuid, lookup_user_id uuid)
CREATE OR REPLACE FUNCTION public.is_org_privileged_member(lookup_org_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE "organizationId" = lookup_org_id
      AND "userId" = lookup_user_id
      AND status = 'ACTIVE'
      AND role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION public.is_org_privileged_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_privileged_member(uuid, uuid) TO oos_app_runtime, authenticated;

-- 6.5 is_org_admin(lookup_org_id uuid, lookup_user_id uuid)
CREATE OR REPLACE FUNCTION public.is_org_admin(lookup_org_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE "organizationId" = lookup_org_id
      AND "userId" = lookup_user_id
      AND status = 'ACTIVE'
      AND role = 'ADMIN'
  );
$$;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO oos_app_runtime, authenticated;

-- 6.6 system_log_audit_event(...)
CREATE OR REPLACE FUNCTION public.system_log_audit_event(
  p_org_id uuid,
  p_actor_id uuid,
  p_actor_type text,
  p_action public."AuditAction",
  p_entity_type text,
  p_entity_id text,
  p_details jsonb,
  p_ip text,
  p_user_agent text
)
RETURNS uuid
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.audit_events (
    "organizationId", "actorId", "actorType", "action",
    "entityType", "entityId", "details", "ipAddress", "userAgent", "createdAt"
  ) VALUES (
    p_org_id, p_actor_id, COALESCE(p_actor_type, 'SYSTEM'), p_action,
    p_entity_type, p_entity_id, p_details, p_ip, p_user_agent, NOW()
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.system_log_audit_event(uuid, uuid, text, public."AuditAction", text, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_log_audit_event(uuid, uuid, text, public."AuditAction", text, text, jsonb, text, text) TO oos_app_runtime;

-- 6.7 system_provision_initial_organization(...)
CREATE OR REPLACE FUNCTION public.system_provision_initial_organization(
  p_name text,
  p_slug text,
  p_admin_user_id uuid
)
RETURNS uuid
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql AS $$
DECLARE
  v_org_id uuid;
BEGIN
  INSERT INTO public.organizations (name, slug, status, "createdAt", "updatedAt")
  VALUES (p_name, p_slug, 'ACTIVE', NOW(), NOW())
  RETURNING id INTO v_org_id;

  IF p_admin_user_id IS NOT NULL THEN
    INSERT INTO public.memberships ("organizationId", "userId", role, status, "createdAt", "updatedAt")
    VALUES (v_org_id, p_admin_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
  END IF;

  RETURN v_org_id;
END;
$$;
REVOKE ALL ON FUNCTION public.system_provision_initial_organization(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_provision_initial_organization(text, text, uuid) TO oos_app_runtime;

-- 7. Define Row Level Security Policies
-- 7.1 Users
CREATE POLICY users_select ON public.users
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      id = public.current_user_id() OR
      id IN (SELECT member_user_id FROM public.get_user_co_member_ids(public.current_user_id()))
    )
  );

CREATE POLICY users_insert ON public.users
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    id = public.current_user_id()
  );

CREATE POLICY users_update ON public.users
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    id = public.current_user_id()
  );

-- 7.2 Organizations
CREATE POLICY orgs_select ON public.organizations
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND
    id IN (SELECT org_id FROM public.get_user_active_org_ids(public.current_user_id()))
  );

CREATE POLICY orgs_insert ON public.organizations
  FOR INSERT WITH CHECK (
    false
  );

CREATE POLICY orgs_update ON public.organizations
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_admin(id, public.current_user_id())
  );

-- 7.3 Memberships
CREATE POLICY memberships_select ON public.memberships
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND (
      "userId" = public.current_user_id() OR
      public.is_org_privileged_member("organizationId", public.current_user_id())
    )
  );

CREATE POLICY memberships_insert ON public.memberships
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    public.is_org_admin("organizationId", public.current_user_id())
  );

CREATE POLICY memberships_update ON public.memberships
  FOR UPDATE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_admin("organizationId", public.current_user_id())
  );

CREATE POLICY memberships_delete ON public.memberships
  FOR DELETE USING (
    public.current_user_id() IS NOT NULL AND
    public.is_org_admin("organizationId", public.current_user_id())
  );

-- 7.4 Audit Events
CREATE POLICY audit_select ON public.audit_events
  FOR SELECT USING (
    public.current_user_id() IS NOT NULL AND
    "organizationId" IS NOT NULL AND
    public.is_org_admin("organizationId", public.current_user_id())
  );

CREATE POLICY audit_insert ON public.audit_events
  FOR INSERT WITH CHECK (
    public.current_user_id() IS NOT NULL AND
    "actorId" = public.current_user_id() AND
    "actorType" = 'USER' AND
    (
      "organizationId" IS NULL OR
      "organizationId" IN (SELECT org_id FROM public.get_user_active_org_ids(public.current_user_id()))
    )
  );
