# OOS Phase 1 Engineering Specification: Identity, Tenancy & Access Control (RBAC)

**Document Version:** 1.5.0  
**Status:** DRAFT — PENDING HUMAN APPROVAL  
**Classification:** Controlled Engineering Contract  
**Phase:** Phase 1 (Identity, Tenancy & Access Control)  
**Target Delivery Path:** `docs/engineering/PHASE_01_IDENTITY_RBAC_SPEC.md`  

---

## 1. Document Purpose & Authority

This document establishes the authoritative, mandatory engineering contract for **Phase 1** of the **Operations Operating System (OOS)**.

Phase 1 establishes the multi-tenant organization boundary, user identity mapping, organization membership, role-based access control (RBAC), session management, server-side authorization boundaries, PostgreSQL Row Level Security (RLS) policies, and identity audit logging.

All technical choices, data models, security boundaries, and constraints documented herein derive directly from the approved **OOS Product Vision**, **OOS V1 PRD**, **Phase 0 Engineering Specification**, and **ADR-001 through ADR-005**. No implementation agent is authorized to modify, expand, or deviate from this specification without explicit human change-control approval.

---

## 2. Source Hierarchy & Authority Precedence

In accordance with Section 2 of the Engineering Control Protocol, the source of truth hierarchy is strictly:

1. **Explicit User Instruction**
2. **OOS Product Vision** (`docs/00_PRODUCT_VISION.md`)
3. **OOS V1 Product Requirements Document** (`docs/01_V1_PRD.md`)
4. **Phase 0 Engineering Specification** (`docs/engineering/00_PHASE_0_ENGINEERING_SPEC.md`)
5. **Approved Architecture Decision Records** (`docs/decisions/ADRs/ADR-001` through `ADR-005`)
6. **This Phase 1 Engineering Specification** (`docs/engineering/PHASE_01_IDENTITY_RBAC_SPEC.md`)
7. **Existing accepted Phase 0 code base**

---

## 3. Phase 1 Objective & Scope

### 3.1 Primary Objective
Establish a secure, multi-tenant identity and authorization foundation supporting the three authoritative V1 roles (`CANDIDATE`, `EMPLOYEE`, `ADMIN`), ensuring that all data access and operational actions are authenticated, authorized, tenant-isolated, and auditable server-side before business-domain modules are introduced.

### 3.2 Phase 1 Scope (Included)
1. **Supabase Auth Integration**: Infrastructure integration for user authentication (signup, login, logout, password recovery, session verification).
2. **User Identity Model**: Mapping between Supabase `auth.users` and the application database `User` entity.
3. **Organization Tenancy**: `Organization` model defining the primary tenant boundary with dedicated lifecycle state (`OrganizationStatus`).
4. **Organization Membership & RBAC**: `Membership` entity binding Users, Organizations, and the 3 V1 Roles (`CANDIDATE`, `EMPLOYEE`, `ADMIN`).
5. **Server-Side Authorization Layer**: Centralized `getAuthenticatedContext()` helper and permission guards enforcing tenant isolation and role permissions in Server Components, Server Actions, and Route Handlers using `withRlsContext()`.
6. **PostgreSQL Row Level Security (RLS)**: Enforced database RLS policies with `FORCE ROW LEVEL SECURITY` and hardened `SECURITY DEFINER` helper functions with zero recursion and zero unauthenticated bypasses.
7. **Prisma RLS Context Integration**: Parameterized transaction-scoped `SET LOCAL` session variable propagation (`SELECT set_config('request.jwt.claim.sub', $1, true)`) for Prisma execution through Supavisor.
8. **Employee Deactivation Protocol**: Deterministic employee access revocation with preserved historical action attribution.
9. **Identity & Access Audit Logging**: Append-only audit trail for authentication, membership changes, role assignments, system security events, and access denial events via controlled write boundaries.
10. **Authentication UI & Basic Shell**: Minimal, professional enterprise authentication screens (Login, Registration, Password Reset, Accept Invite) and role-specific shell redirects.
11. **Testing Suite**: Automated unit and integration tests verifying real-path authentication boundaries, organization isolation, role authorization, deactivation mechanics, and RLS policies.

### 3.3 Phase 1 Firewall & Explicit Exclusions (Strictly Prohibited)
The following capabilities belong to Phase 2+ and MUST NOT be implemented in Phase 1:
- **Phase 2 (Candidate & Profile)**: No candidate career profile tables, work experience, education, skills, resume uploads, portfolio generation, or consent workflows.
- **Phase 3 (Jobs & Qualification)**: No job tables, job discovery, manual job creation, or qualification rules.
- **Phase 4 (Applications & Execution)**: No application state machine, application preparation, QA reviews, candidate approvals, submission tracking, or submission evidence.
- **Phase 5+ (Operations & Commercial)**: No task management, in-app messaging, email notification delivery engine, SLA policies, escalations, billing, subscriptions, or payments.
- **Advanced / Out-of-Scope Capabilities**: Zero AI integration, scraping, browser automation, microservices, Redis, Kafka, or worker infrastructure.

---

## 4. Locked Technology Stack & Architecture

Phase 1 operates strictly within the locked Phase 0 technology stack:

- **Framework**: Next.js `16.3.6` (App Router, Server Actions, Route Handlers)
- **UI Runtime**: React `19.0.0` & React DOM `19.0.0`
- **Language**: TypeScript `5.7.3` (`"type": "module"`, `target: ES2023`, `module: ESNext`, `moduleResolution: bundler`)
- **Database**: Supabase PostgreSQL 15+ with Forced Row Level Security (`FORCE ROW LEVEL SECURITY`)
- **ORM**: Prisma ORM `7.10.0` with `@prisma/adapter-pg@7.10.0` and `pg@8.13.3`
- **Authentication**: Supabase Auth (`@supabase/supabase-js@2.49.1`, `@supabase/ssr@0.5.2`)
- **Validation**: Zod `3.24.2`
- **Testing**: Vitest `2.1.8`
- **Styling**: Tailwind CSS `3.4.17` (Restrained enterprise tokens)
- **Architecture**: Modular Monolith

---

## 5. Phase 1 Data Model (Prisma Schema)

The Phase 1 schema defines strictly the identity, organization, membership, and security audit entities.

```prisma
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

enum Role {
  CANDIDATE
  EMPLOYEE
  ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

enum OrganizationStatus {
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

enum MembershipStatus {
  ACTIVE
  INVITED
  SUSPENDED
  DEACTIVATED
}

enum AuditAction {
  USER_REGISTERED
  USER_LOGIN
  USER_LOGOUT
  USER_INVITED
  MEMBERSHIP_CREATED
  ROLE_CHANGED
  MEMBERSHIP_ACTIVATED
  MEMBERSHIP_DEACTIVATED
  ACCESS_DENIED
  SECURITY_ALERT
}

model Organization {
  id          String             @id @default(uuid()) @db.Uuid
  name        String             @db.VarChar(255)
  slug        String             @unique @db.VarChar(100)
  status      OrganizationStatus @default(ACTIVE)
  createdAt   DateTime           @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime           @updatedAt @db.Timestamptz(6)

  memberships Membership[]
  auditEvents AuditEvent[]

  @@map("organizations")
}

model User {
  id          String       @id @db.Uuid // Matches Supabase auth.users.id
  email       String       @unique @db.VarChar(255)
  firstName   String?      @db.VarChar(100)
  lastName    String?      @db.VarChar(100)
  status      UserStatus   @default(ACTIVE)
  createdAt   DateTime     @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime     @updatedAt @db.Timestamptz(6)

  memberships Membership[]
  auditEvents AuditEvent[] @relation("ActorAuditEvents")

  @@map("users")
}

model Membership {
  id             String           @id @default(uuid()) @db.Uuid
  organizationId String           @db.Uuid
  userId         String           @db.Uuid
  role           Role             @default(CANDIDATE)
  status         MembershipStatus @default(ACTIVE)
  createdAt      DateTime         @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime         @updatedAt @db.Timestamptz(6)

  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId], name: "org_user_unique")
  @@index([userId, status])
  @@index([organizationId, role, status])
  @@map("memberships")
}

model AuditEvent {
  id             String       @id @default(uuid()) @db.Uuid
  organizationId String?      @db.Uuid
  actorId        String?      @db.Uuid // Nullable to accommodate system/unauthenticated security events
  actorType      String       @default("USER") @db.VarChar(50) // "USER", "SYSTEM", "ANONYMOUS"
  action         AuditAction
  entityType     String       @db.VarChar(100)
  entityId       String?      @db.VarChar(255)
  details        Json?        @db.JsonB
  ipAddress      String?      @db.VarChar(45)
  userAgent      String?      @db.VarChar(512)
  createdAt      DateTime     @default(now()) @db.Timestamptz(6)

  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  actor          User?         @relation("ActorAuditEvents", fields: [actorId], references: [id], onDelete: Restrict)

  @@index([organizationId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
  @@map("audit_events")
}
```

---

## 6. Supabase Auth & Application Identity Mapping

### 6.1 Authentication Separation of Concerns
1. **Supabase Auth (`auth.users`)**: Authoritative identity provider handling passwords, password hashing, JWT sessions, MFA, email verification tokens, and OAuth credentials. Credential complexity and validation rules are configured directly in Supabase Auth.
2. **Application Database (`public.users`)**: Stores application-level user profile metadata (`firstName`, `lastName`, `status`), organization memberships, and domain relationships.
3. **Primary Key Synchronization**: The `public.users.id` field is a PostgreSQL UUID that directly mirrors the Supabase `auth.users.id`. No separate internal synthetic ID is created.

### 6.2 Authentication Flows
1. **Candidate Registration**:
   - Candidate submits registration credentials via Server Action.
   - Server Action calls Supabase Auth `signUp()`.
   - On successful authentication, creates `public.users` record within `withRlsContext(candidateUser.id)`.
   - Tenant/Organization linkage is established according to the approved organizational registration policy (see Section 18 for pending business rule decision).
   - Records `USER_REGISTERED` and `MEMBERSHIP_CREATED` audit events.
2. **Employee Onboarding (Admin Invite)**:
   - Administrator creates an employee invite specifying email, name, role (`EMPLOYEE` or `ADMIN`), and target organization.
   - Creates a pending `public.users` and `Membership` record with `MembershipStatus = INVITED` within admin's `withRlsContext(adminUser.id)`.
   - Sends invite link via Supabase Auth admin invite endpoint.
   - When the user accepts the invite and sets their password, membership transitions to `ACTIVE`.
3. **Sign In**:
   - Client authenticates via Supabase Auth `signInWithPassword()`.
   - Sets secure HTTP-only cookies managed by `@supabase/ssr`.
   - On redirect, Next.js middleware refreshes the session cookie and verifies active membership.
4. **Sign Out**:
   - Server Action calls Supabase Auth `signOut()`, clearing session cookies.
   - Redirects to `/login`.

---

## 7. Role-Based Access Control (RBAC) & Authorization Model

### 7.1 Authoritative V1 Roles
In strict adherence to Section 8 of the V1 PRD, Phase 1 defines exactly three roles:
1. **`CANDIDATE`**: The job-seeker customer receiving the managed service. Limited to accessing their own profile, applications, approvals, messages, and documents.
2. **`EMPLOYEE`**: Operational staff member responsible for candidate management, job qualification, application preparation, and QA execution.
3. **`ADMIN`**: Operational administrator with privileges for user provisioning, role assignments, employee deactivation, and system audit log access.

*(Note: `TEAM_LEAD` and `MANAGER` roles are explicitly outside V1 scope).*

### 7.2 Permissions Matrix

| Permission Code | Description | `CANDIDATE` | `EMPLOYEE` | `ADMIN` |
| :--- | :--- | :--- | :---: | :---: |
| `auth:read_self` | View own user profile and membership | Yes | Yes | Yes |
| `auth:update_self` | Update own name/preferences | Yes | Yes | Yes |
| `org:read` | View organization metadata | Yes (Scoped) | Yes | Yes |
| `member:read` | View organization members list | No | Yes | Yes |
| `member:invite` | Invite new employees to organization | No | No | Yes |
| `member:update_role` | Change member role | No | No | Yes |
| `member:deactivate` | Deactivate an employee/member | No | No | Yes |
| `audit:read` | View organization audit events | No | No | Yes |

### 7.3 Server-Side Authorization Architecture

Authorization is enforced server-side using a centralized context resolution helper that strictly executes within the PostgreSQL RLS transaction context:

```typescript
// src/lib/auth/context.ts
import { createServerClient } from "@/lib/supabase/server";
import { withRlsContext } from "@/lib/db/rls";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { Role, UserStatus, MembershipStatus } from "@/generated/prisma";

export interface AuthenticatedContext {
  userId: string;
  email: string;
  organizationId: string;
  role: Role;
  status: UserStatus;
  membershipStatus: MembershipStatus;
}

export async function getAuthenticatedContext(): Promise<AuthenticatedContext> {
  // 1. Verify Supabase Session from secure HTTP-only cookies
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationError("User is not authenticated");
  }

  // 2. Query membership strictly through withRlsContext() to enforce database-level RLS
  const membership = await withRlsContext(user.id, async (tx) => {
    return tx.membership.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        organization: { status: "ACTIVE" },
      },
      include: {
        user: true,
        organization: true,
      },
    });
  });

  if (!membership) {
    throw new AuthorizationError("Active organization membership not found or account is deactivated");
  }

  return {
    userId: user.id,
    email: user.email!,
    organizationId: membership.organizationId,
    role: membership.role,
    status: membership.user.status,
    membershipStatus: membership.status,
  };
}
```

### 7.4 Defense-in-Depth Guard Functions
```typescript
export function requireRole(ctx: AuthenticatedContext, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(ctx.role)) {
    throw new AuthorizationError(
      `Access denied: requires one of [${allowedRoles.join(", ")}], user has [${ctx.role}]`
    );
  }
}

export function requireAdmin(ctx: AuthenticatedContext): void {
  requireRole(ctx, ["ADMIN"]);
}

export function requireEmployeeOrAdmin(ctx: AuthenticatedContext): void {
  requireRole(ctx, ["EMPLOYEE", "ADMIN"]);
}
```

---

## 8. Database Role Model, Prisma Execution & PostgreSQL Row Level Security (RLS) Strategy

### 8.1 Database Roles, Runtime Privileges & Execution Boundaries

To enforce defense-in-depth and prevent privilege escalation, database access is strictly partitioned across distinct PostgreSQL roles:

#### Database Role Taxonomy

| Role Name | Purpose | Superuser? | BYPASSRLS? | Direct Table Privileges | Stored Function Privileges |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **`postgres`** (Migration Role) | Schema migrations, DDL, extension setup, `SECURITY DEFINER` function owner | Yes | Yes | Full DDL/DML Ownership | Full Ownership |
| **`oos_app_runtime`** (Application Runtime Role) | Next.js / Prisma runtime query execution via `DATABASE_URL` | **NO** (`NOSUPERUSER`) | **NO** (`NOBYPASSRLS`) | `SELECT, INSERT, UPDATE, DELETE` on `public.*` | `EXECUTE` on designated stored functions |

#### Strict Runtime Prohibitions
1. **No Runtime Superuser**: The Next.js / Prisma application runtime is **strictly prohibited** from connecting as `postgres`, any superuser role, or any role with `BYPASSRLS`.
2. **Enforced Runtime Role (`oos_app_runtime`)**:
   - `oos_app_runtime` is configured with `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`.
   - All Prisma queries routed through Supavisor execute as `oos_app_runtime`.
3. **Row Level Security Enforcement**:
   - **`FORCE ROW LEVEL SECURITY`** is applied to all public tables (`users`, `organizations`, `memberships`, `audit_events`).
   - Because `oos_app_runtime` does not have `BYPASSRLS`, PostgreSQL enforces RLS policies on **every** application query, guaranteeing that queries cannot bypass security policies even on raw queries.

---

### 8.2 Propagating Supabase User Identity to PostgreSQL RLS via Prisma

1. **Transaction Pooling Safety (`SET LOCAL` via Parameterized `set_config`)**:
   - Supavisor operates in transaction pool mode. Session-level `SET` commands (e.g. `SET session ...`) are strictly prohibited because TCP connections in the pool are reused across different client HTTP requests.
   - In contrast, PostgreSQL's built-in `set_config(setting_name, new_value, is_local)` function with `is_local = true` binds the setting strictly to the active transaction. When the transaction commits or rolls back, the parameter is automatically cleared by the PostgreSQL engine.
   - Prisma operations requiring database RLS evaluation execute within an interactive transaction via `withRlsContext()` using Prisma's parameterized tagged template literal:
     ```typescript
     // src/lib/db/rls.ts
     import { prisma } from "@/lib/db/prisma";
     import { Prisma } from "@/generated/prisma";

     export async function withRlsContext<T>(
       userId: string,
       fn: (tx: Prisma.TransactionClient) => Promise<T>
     ): Promise<T> {
       return prisma.$transaction(async (tx) => {
         // Parameterized call to set_config — 100% injection safe and transaction-local
         await tx.$executeRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
         return fn(tx);
       });
     }
     ```
2. **Identity Extraction in RLS (`current_user_id()`)**:
   - The SQL helper `current_user_id()` executes:
     ```sql
     CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
       SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
     $$ LANGUAGE sql STABLE;
     ```
   - When executed inside `withRlsContext()`, `current_setting('request.jwt.claim.sub', true)` returns the transaction-scoped UUID.
   - Outside of `withRlsContext()` (e.g. unauthenticated public operations), the function returns `NULL`.
   - **Crucial Security Invariant**: `NULL` identity denotes an unauthenticated state and MUST NOT grant write or bypass access under any circumstances.
3. **Application Layer & RLS Dual-Defense Architecture**:
   - **Layer 1 (Application Server Guard)**: Server Actions and Route Handlers resolve verified user context via `getAuthenticatedContext()`, perform role checks (`requireRole()`), and include explicit tenant filters (`where: { organizationId: ctx.organizationId }`).
   - **Layer 2 (PostgreSQL Engine RLS)**: The database engine enforces `FORCE ROW LEVEL SECURITY` using `current_user_id()`, guaranteeing that even if an application query omits a filter, cross-tenant or unauthorized row access is blocked at the database kernel level.

---

### 8.3 SECURITY DEFINER Privilege Boundary & Helper Functions

All multi-table permission evaluations and trusted system provisioning operations are encapsulated in hardened **`SECURITY DEFINER`** functions.

#### Privilege & Execution Boundary Specifications

| Function Name | Owner Role | Execution Role | `search_path` | Public Execution | Authorized Invoker | Privilege Escalation Defense |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `current_user_id()` | `postgres` | Caller (STABLE) | `public, pg_temp` | `REVOKE FROM PUBLIC; GRANT TO oos_app_runtime, authenticated` | Application connection | Read-only extraction of transaction UUID. Returns `NULL` if unset. |
| `get_user_active_org_ids(uuid)` | `postgres` | `postgres` (DEFINER) | `public, pg_temp` | `REVOKE FROM PUBLIC; GRANT TO oos_app_runtime, authenticated` | RLS Engine / Application | Scoped strictly to active memberships of `lookup_user_id`. |
| `get_user_co_member_ids(uuid)` | `postgres` | `postgres` (DEFINER) | `public, pg_temp` | `REVOKE FROM PUBLIC; GRANT TO oos_app_runtime, authenticated` | RLS Engine / Application | Returns co-members only if `lookup_user_id` holds active `EMPLOYEE` or `ADMIN` role. |
| `is_org_privileged_member(uuid, uuid)` | `postgres` | `postgres` (DEFINER) | `public, pg_temp` | `REVOKE FROM PUBLIC; GRANT TO oos_app_runtime, authenticated` | RLS Engine / Application | Returns boolean `EXISTS` only for active `EMPLOYEE` or `ADMIN`. |
| `is_org_admin(uuid, uuid)` | `postgres` | `postgres` (DEFINER) | `public, pg_temp` | `REVOKE FROM PUBLIC; GRANT TO oos_app_runtime, authenticated` | RLS Engine / Application | Returns boolean `EXISTS` only for active `ADMIN`. |
| `system_log_audit_event(...)` | `postgres` | `postgres` (DEFINER) | `public, pg_temp` | `REVOKE FROM PUBLIC; GRANT TO oos_app_runtime` | Server-Side Audit Service | Server-only execution; parameters sanitized; append-only write; client cannot call. |
| `system_provision_initial_organization(...)` | `postgres` | `postgres` (DEFINER) | `public, pg_temp` | `REVOKE FROM PUBLIC; GRANT TO oos_app_runtime` | Server-Side Seed / Setup Scripts | Server-only execution during tenant setup; client cannot call. |

#### SQL Function Definitions

```sql
-- 1. Helper to extract authenticated user UUID
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_user_id() TO oos_app_runtime, authenticated;

-- 2. Returns list of active organization IDs for a given user
CREATE OR REPLACE FUNCTION get_user_active_org_ids(lookup_user_id uuid)
RETURNS TABLE(org_id uuid)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT organization_id FROM public.memberships
  WHERE user_id = lookup_user_id
    AND status = 'ACTIVE';
$$;
REVOKE ALL ON FUNCTION get_user_active_org_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_active_org_ids(uuid) TO oos_app_runtime, authenticated;

-- 3. Returns list of co-member user IDs for staff in active organizations
CREATE OR REPLACE FUNCTION get_user_co_member_ids(lookup_user_id uuid)
RETURNS TABLE(member_user_id uuid)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT m2.user_id
  FROM public.memberships m1
  JOIN public.memberships m2 ON m1.organization_id = m2.organization_id
  WHERE m1.user_id = lookup_user_id
    AND m1.status = 'ACTIVE'
    AND m1.role IN ('EMPLOYEE', 'ADMIN')
    AND m2.status = 'ACTIVE';
$$;
REVOKE ALL ON FUNCTION get_user_co_member_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_co_member_ids(uuid) TO oos_app_runtime, authenticated;

-- 4. Verifies if user is an active privileged member (EMPLOYEE or ADMIN) of target org
CREATE OR REPLACE FUNCTION is_org_privileged_member(lookup_org_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = lookup_org_id
      AND user_id = lookup_user_id
      AND status = 'ACTIVE'
      AND role IN ('EMPLOYEE', 'ADMIN')
  );
$$;
REVOKE ALL ON FUNCTION is_org_privileged_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_org_privileged_member(uuid, uuid) TO oos_app_runtime, authenticated;

-- 5. Verifies if user is an active ADMIN of target org
CREATE OR REPLACE FUNCTION is_org_admin(lookup_org_id uuid, lookup_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = lookup_org_id
      AND user_id = lookup_user_id
      AND status = 'ACTIVE'
      AND role = 'ADMIN'
  );
$$;
REVOKE ALL ON FUNCTION is_org_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_org_admin(uuid, uuid) TO oos_app_runtime, authenticated;

-- 6. Trusted system audit logger (used strictly server-side for system/unauthenticated events)
CREATE OR REPLACE FUNCTION system_log_audit_event(
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
    organization_id, actor_id, actor_type, action,
    entity_type, entity_id, details, ip_address, user_agent, created_at
  ) VALUES (
    p_org_id, p_actor_id, COALESCE(p_actor_type, 'SYSTEM'), p_action,
    p_entity_type, p_entity_id, p_details, p_ip, p_user_agent, NOW()
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;
REVOKE ALL ON FUNCTION system_log_audit_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION system_log_audit_event TO oos_app_runtime;

-- 7. Trusted system tenant provisioning (used strictly server-side during initial seed/setup)
CREATE OR REPLACE FUNCTION system_provision_initial_organization(
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
  INSERT INTO public.organizations (name, slug, status, created_at, updated_at)
  VALUES (p_name, p_slug, 'ACTIVE', NOW(), NOW())
  RETURNING id INTO v_org_id;

  IF p_admin_user_id IS NOT NULL THEN
    INSERT INTO public.memberships (organization_id, user_id, role, status, created_at, updated_at)
    VALUES (v_org_id, p_admin_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
  END IF;

  RETURN v_org_id;
END;
$$;
REVOKE ALL ON FUNCTION system_provision_initial_organization FROM PUBLIC;
GRANT EXECUTE ON FUNCTION system_provision_initial_organization TO oos_app_runtime;
```

---

### 8.4 Complete RLS Operation Matrix

This matrix clearly distinguishes between:
1. **Normal Authenticated Database Path**: Evaluated by PostgreSQL Table RLS Policies on direct Prisma/SQL operations executed by `oos_app_runtime`.
2. **Trusted System Function Path**: Executed strictly server-side via privileged `SECURITY DEFINER` stored procedures (`system_provision_initial_organization`, `system_log_audit_event`), which operate within their own dedicated execution boundary rather than direct table RLS write policies.

#### Table 1: `public.users`
*Enforcement*: `ALTER TABLE public.users ENABLE ROW LEVEL SECURITY; ALTER TABLE public.users FORCE ROW LEVEL SECURITY;`

| Operation | Direct Table RLS Policy (Normal Authenticated Path) | Trusted System Function Path | Admin Path | Denied / Prohibited Path | Table Policy SQL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Read own profile; Staff read co-members | N/A (Direct query) | Read org members | Non-members / Cross-tenant | `current_user_id() IS NOT NULL AND (id = current_user_id() OR id IN (SELECT member_user_id FROM get_user_co_member_ids(current_user_id())))` |
| **INSERT** | Self-creation during signup (`id = current_user_id()`) | Admin employee invite | Admin employee invite | Unauthenticated / Spoofed user ID | `current_user_id() IS NOT NULL AND id = current_user_id()` |
| **UPDATE** | Update own profile (`id = current_user_id()`) | N/A | N/A | Cross-user profile modification | `current_user_id() IS NOT NULL AND id = current_user_id()` |
| **DELETE** | Prohibited (Default Deny) | N/A | N/A | All callers | `false` |

```sql
CREATE POLICY users_select ON public.users
  FOR SELECT USING (
    current_user_id() IS NOT NULL AND (
      id = current_user_id() OR
      id IN (SELECT member_user_id FROM get_user_co_member_ids(current_user_id()))
    )
  );

CREATE POLICY users_insert ON public.users
  FOR INSERT WITH CHECK (
    current_user_id() IS NOT NULL AND
    id = current_user_id()
  );

CREATE POLICY users_update ON public.users
  FOR UPDATE USING (
    current_user_id() IS NOT NULL AND
    id = current_user_id()
  );
```

---

#### Table 2: `public.organizations`
*Enforcement*: `ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY; ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;`

| Operation | Direct Table RLS Policy (Normal Authenticated Path) | Trusted System Function Path | Admin Path | Denied / Prohibited Path | Table Policy SQL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Active members read own org | N/A (Direct query) | Org Admins read own org | Non-members / Cross-tenant | `current_user_id() IS NOT NULL AND id IN (SELECT org_id FROM get_user_active_org_ids(current_user_id()))` |
| **INSERT** | Prohibited (Default Deny) | `system_provision_initial_organization(...)` | N/A (Managed via system provisioning) | All direct table callers (Unauthenticated, Candidates, Staff, Admins) | `false` |
| **UPDATE** | Org Admin manages org metadata | N/A | Org Admin manages org metadata | Non-admin / Cross-tenant | `current_user_id() IS NOT NULL AND is_org_admin(id, current_user_id())` |
| **DELETE** | Prohibited (Default Deny) | N/A | N/A | All callers | `false` |

```sql
CREATE POLICY orgs_select ON public.organizations
  FOR SELECT USING (
    current_user_id() IS NOT NULL AND
    id IN (SELECT org_id FROM get_user_active_org_ids(current_user_id()))
  );

CREATE POLICY orgs_insert ON public.organizations
  FOR INSERT WITH CHECK (
    false
  );

CREATE POLICY orgs_update ON public.organizations
  FOR UPDATE USING (
    current_user_id() IS NOT NULL AND
    is_org_admin(id, current_user_id())
  );
```

---

#### Table 3: `public.memberships`
*Enforcement*: `ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;`

| Operation | Direct Table RLS Policy (Normal Authenticated Path) | Trusted System Function Path | Admin Path | Denied / Prohibited Path | Table Policy SQL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Read own membership; Staff read org members | N/A (Direct query) | Org Admin reads org members | Non-members / Cross-tenant | `current_user_id() IS NOT NULL AND (user_id = current_user_id() OR is_org_privileged_member(organization_id, current_user_id()))` |
| **INSERT** | Org Admin invites employees | `system_provision_initial_organization(...)` | Org Admin invites employees | Candidates / Staff / Unauthenticated | `current_user_id() IS NOT NULL AND is_org_admin(organization_id, current_user_id())` |
| **UPDATE** | Org Admin changes role or status | N/A | Org Admin changes role or status | Candidates / Staff / Unauthenticated | `current_user_id() IS NOT NULL AND is_org_admin(organization_id, current_user_id())` |
| **DELETE** | Org Admin removes membership | N/A | Org Admin removes membership | Candidates / Staff / Unauthenticated | `current_user_id() IS NOT NULL AND is_org_admin(organization_id, current_user_id())` |

```sql
CREATE POLICY memberships_select ON public.memberships
  FOR SELECT USING (
    current_user_id() IS NOT NULL AND (
      user_id = current_user_id() OR
      is_org_privileged_member(organization_id, current_user_id())
    )
  );

CREATE POLICY memberships_insert ON public.memberships
  FOR INSERT WITH CHECK (
    current_user_id() IS NOT NULL AND
    is_org_admin(organization_id, current_user_id())
  );

CREATE POLICY memberships_update ON public.memberships
  FOR UPDATE USING (
    current_user_id() IS NOT NULL AND
    is_org_admin(organization_id, current_user_id())
  );

CREATE POLICY memberships_delete ON public.memberships
  FOR DELETE USING (
    current_user_id() IS NOT NULL AND
    is_org_admin(organization_id, current_user_id())
  );
```

---

#### Table 4: `public.audit_events`
*Enforcement*: `ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;`

| Operation | Direct Table RLS Policy (Normal Authenticated Path) | Trusted System Function Path | Admin Path | Denied / Prohibited Path | Table Policy SQL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SELECT** | Prohibited for non-admins | Server logging service query | Org Admin views own org logs | Candidates / Staff / Unauthenticated | `current_user_id() IS NOT NULL AND organization_id IS NOT NULL AND is_org_admin(organization_id, current_user_id())` |
| **INSERT** | Authenticated user logs own action (`actor_id = current_user_id()`, `actor_type = 'USER'`) | `system_log_audit_event(...)` | Admin logs admin actions | Unauthenticated / User spoofing / Manufacturing SYSTEM events | `current_user_id() IS NOT NULL AND actor_id = current_user_id() AND actor_type = 'USER' AND (organization_id IS NULL OR organization_id IN (SELECT org_id FROM get_user_active_org_ids(current_user_id())))` |
| **UPDATE** | Prohibited (Append-only) | Prohibited (Append-only) | Prohibited (Append-only) | All callers | `false` |
| **DELETE** | Prohibited (Append-only) | Prohibited (Append-only) | Prohibited (Append-only) | All callers | `false` |

```sql
CREATE POLICY audit_select ON public.audit_events
  FOR SELECT USING (
    current_user_id() IS NOT NULL AND
    organization_id IS NOT NULL AND
    is_org_admin(organization_id, current_user_id())
  );

CREATE POLICY audit_insert ON public.audit_events
  FOR INSERT WITH CHECK (
    current_user_id() IS NOT NULL AND
    actor_id = current_user_id() AND
    actor_type = 'USER' AND
    (
      organization_id IS NULL OR
      organization_id IN (SELECT org_id FROM get_user_active_org_ids(current_user_id()))
    )
  );
```

---

## 9. Employee Deactivation Protocol

In strict accordance with Section 28 of the V1 PRD, employee deactivation enforces the following invariants:

1. **Immediate Revocation**: An administrator sets `Membership.status = DEACTIVATED` (and optionally `User.status = DEACTIVATED`).
2. **Instant Access Gate**: The next request from the deactivated employee fails at `getAuthenticatedContext()`, throwing `AuthorizationError("Account is deactivated")`. Active sessions cannot access candidate, application, or organizational data.
3. **Immutable Attribution**: Historical completed actions (e.g. past audit events) permanently retain the deactivated employee's `actorId`. Attribution is never reassigned or rewritten to another employee.
4. **Task / Candidate Reassignment Boundary**: Open or in-progress tasks assigned to the deactivated employee become unassigned/reassignable by an administrator (Phase 5 task engine).
5. **Audit Trail**: Produces a mandatory `MEMBERSHIP_DEACTIVATED` audit event recording the actor (Admin), target member ID, and timestamp.

---

## 10. Audit Logging Architecture

All identity, access, and security operations produce structured audit events recorded in `public.audit_events` via an internal audit service enforcing strict actor attribution:

```typescript
// src/lib/audit/index.ts
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import { logger } from "@/lib/logger";
import { AuditAction } from "@/generated/prisma";
import { sanitizeObject } from "@/lib/utils/sanitization";

export interface LogUserAuditParams {
  userId: string;
  organizationId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface LogSystemAuditParams {
  organizationId?: string;
  actorId?: string;
  actorType: "SYSTEM" | "ANONYMOUS";
  action: AuditAction;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Logs an audit event on behalf of an authenticated user inside the user's RLS transaction.
 * RLS enforces that actorId must equal current_user_id() and actorType must be 'USER'.
 */
export async function logUserAuditEvent(params: LogUserAuditParams): Promise<void> {
  const sanitizedDetails = params.details ? sanitizeObject(params.details) : undefined;

  await withRlsContext(params.userId, async (tx) => {
    await tx.auditEvent.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.userId,
        actorType: "USER",
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: sanitizedDetails as any,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  });

  logger.info(`[AUDIT:USER] ${params.action} on ${params.entityType}:${params.entityId ?? "N/A"} by ${params.userId}`, {
    auditAction: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    actorId: params.userId,
  });
}

/**
 * Logs a system-level or unauthenticated audit event (e.g. failed login, security alert)
 * via the secure stored function system_log_audit_event.
 */
export async function logSystemAuditEvent(params: LogSystemAuditParams): Promise<void> {
  const sanitizedDetails = params.details ? JSON.stringify(sanitizeObject(params.details)) : null;

  await prisma.$executeRaw`
    SELECT system_log_audit_event(
      ${params.organizationId ?? null}::uuid,
      ${params.actorId ?? null}::uuid,
      ${params.actorType},
      ${params.action}::public."AuditAction",
      ${params.entityType},
      ${params.entityId ?? null},
      ${sanitizedDetails}::jsonb,
      ${params.ipAddress ?? null},
      ${params.userAgent ?? null}
    )
  `;

  logger.info(`[AUDIT:SYSTEM] ${params.action} on ${params.entityType}:${params.entityId ?? "N/A"} by ${params.actorType}`, {
    auditAction: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    actorType: params.actorType,
  });
}
```

---

## 11. Application Directory Structure & File Map

Phase 1 introduces the following files into the existing Phase 0 modular monolith structure:

```
apply_citrux/
├── prisma/
│   └── schema.prisma                  # Updated with Organization, User, Membership, AuditEvent
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx           # Enterprise login screen
│   │   │   ├── register/
│   │   │   │   └── page.tsx           # Candidate registration screen
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx           # Password recovery request screen
│   │   │   └── reset-password/
│   │   │       └── page.tsx           # Password reset execution screen
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx             # Authenticated shell layout (validates session context)
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx           # Admin member management console
│   │   │   │   └── audit/
│   │   │   │       └── page.tsx       # Admin audit log viewer
│   │   │   ├── employee/
│   │   │   │   └── page.tsx           # Employee workspace home shell
│   │   │   └── candidate/
│   │   │       └── page.tsx           # Candidate portal home shell
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── callback/
│   │   │           └── route.ts       # Supabase OAuth/email confirmation callback handler
│   │   └── middleware.ts              # Next.js session refresh and route gateway
│   └── lib/
│       ├── auth/
│       │   ├── actions.ts             # Server Actions (signIn, signUp, signOut, inviteEmployee, deactivateMember)
│       │   ├── context.ts             # getAuthenticatedContext & guard helpers (RLS-backed)
│       │   └── permissions.ts         # Role and permission matrices
│       ├── audit/
│       │   └── index.ts               # Controlled audit logging service
│       ├── db/
│       │   └── rls.ts                 # Prisma withRlsContext transaction helper (parameterized set_config)
│       └── validation/
│           └── auth.schemas.ts        # Zod schemas for auth inputs
└── tests/
    ├── unit/
    │   ├── auth-guards.test.ts        # Unit tests for requireRole, requireAdmin
    │   ├── auth-schemas.test.ts       # Zod validation schema tests
    │   └── audit.test.ts              # Audit log sanitization and parameter formatting tests
    └── integration/
        ├── rbac-context.test.ts       # Context resolution & deactivation gate tests
        ├── rls-execution.test.ts      # Real-path PostgreSQL RLS isolation & write boundary tests
        ├── rls-security-definer.test.ts # Tests privilege escalation defense on SECURITY DEFINER helpers
        └── rls-recursion.test.ts      # Verifies zero recursion in RLS policy execution
```

---

## 12. Authentication UI & User Experience

Phase 1 provides a clean, restrained, enterprise-grade authentication interface:
- **Design Tokens**: Standard slate/zinc enterprise palette, `#0F172A` primary branding, `0.375rem` rounded corners, zero decorative gradients.
- **Form Feedback**: Inline validation errors, loading state buttons, and accessible error banners.
- **Role Redirection**:
  - `ADMIN` → `/admin`
  - `EMPLOYEE` → `/employee`
  - `CANDIDATE` → `/candidate`

---

## 13. Testing Architecture & Real-Path Verification Requirements

All authorization and RLS tests must execute against the real database connection path to verify production security mechanics.

### 13.1 Required Test Suites
1. **`tests/unit/auth-schemas.test.ts`**:
   - Validates email formatting, required registration fields, and schema parsing error messages.
2. **`tests/unit/auth-guards.test.ts`**:
   - Tests `requireRole()`, `requireAdmin()`, and `requireEmployeeOrAdmin()`.
   - Asserts `AuthorizationError` is thrown when roles do not match.
3. **`tests/integration/rbac-context.test.ts`**:
   - Verifies `getAuthenticatedContext()` retrieves correct User and Membership via `withRlsContext()`.
   - Verifies that deactivated users or users with suspended memberships are rejected immediately.
4. **`tests/integration/rls-execution.test.ts`**:
   - Tests real-path PostgreSQL RLS isolation using `withRlsContext()`:
     - **Unauthenticated Denial**: Connection without active user context cannot INSERT, UPDATE, or SELECT from `users`, `organizations`, `memberships`, or `audit_events`.
     - **Cross-Tenant Isolation**: User A in Organization 1 cannot select or mutate records in Organization 2.
     - **Identity Protection**: Candidate cannot update another user's profile.
     - **Role Boundary**: Employee cannot modify membership roles or deactivate members.
     - **Admin Privilege**: Admin can invite, update roles, and deactivate members in their own organization.
     - **Deactivated Member Rejection**: Deactivated member's queries return empty sets or fail under RLS.
     - **Audit Integrity**: Normal users cannot manufacture `SYSTEM` events or impersonate other users' `actorId`.
     - **Audit Immutability**: Direct `UPDATE` or `DELETE` on `audit_events` fails under RLS default-deny.
     - **Normal Prisma Application Paths**: Normal Prisma queries execute under `FORCE ROW LEVEL SECURITY` and cannot bypass RLS even when connected with the application connection role.
5. **`tests/integration/rls-security-definer.test.ts`**:
   - Verifies that `oos_app_runtime` is configured with `NOSUPERUSER` and `NOBYPASSRLS` in PostgreSQL metadata catalogs.
   - Verifies that unauthenticated or non-admin callers cannot execute `system_provision_initial_organization` or `system_log_audit_event`.
   - Asserts that `get_user_co_member_ids()` returns empty results for candidate users, preventing privilege escalation.
   - Asserts that public execution on privileged functions is completely revoked.
   - Verifies that trusted system provisioning works only through its defined server-side boundary.
6. **`tests/integration/client-boundary-security.test.ts`**:
   - Asserts that browser/client bundles contain zero database credentials, service role keys, or direct database connection strings.
   - Verifies that trusted system functions (`system_provision_initial_organization`, `system_log_audit_event`) are not exposed via any public API route or client-callable endpoint.
7. **`tests/integration/rls-recursion.test.ts`**:
   - Verifies that complex nested queries spanning `users`, `memberships`, and `organizations` complete cleanly without PostgreSQL recursion depth errors.
8. **`tests/unit/audit.test.ts`**:
   - Verifies that `logUserAuditEvent()` and `logSystemAuditEvent()` correctly sanitize payload details, enforce valid action enums, and reject unauthorized parameter sets.

---

## 14. Performance & Query Optimization Standards

1. **Indexed Context Resolution**: `getAuthenticatedContext()` queries against indexed compound keys (`[userId, status]` on `memberships` and `[id, status]` on `users` and `organizations`), verifying single-roundtrip index scans in EXPLAIN query plans.
2. **Optimized Session Middleware**: Next.js `middleware.ts` handles cookie session verification via `@supabase/ssr` without redundant deep-tree database joins on static asset requests.
3. **Connection Pooling**: All Prisma queries execute through Supavisor pooler (port 6543) with connection limits enforced.

---

## 15. Security Baseline Controls

1. **No Client Role Trust**: Role, organization, and permissions are never read from cookies or client input; always resolved server-side from verified database state.
2. **Server-Only Credentials**: `DATABASE_URL`, `DIRECT_URL`, and Supabase service credentials remain strictly server-side.
3. **Deny-By-Default**: Any route or action without explicit role authorization is denied by default.
4. **Audit Trail**: Security-sensitive actions (deactivation, role change, access denial) are logged immediately with actor/system attribution.
5. **Forced RLS**: `FORCE ROW LEVEL SECURITY` guarantees database-level isolation across all connection roles.

---

## 16. Objective Acceptance Criteria (Phase 1 Exit Gate)

Phase 1 implementation will be evaluated against the following binary criteria:

| # | Acceptance Criterion | Verification Method |
| :--- | :--- | :--- |
| 1 | Database schema contains `Organization`, `User`, `Membership`, `AuditEvent` entities with `OrganizationStatus` enum | `npx prisma validate` (exit 0) |
| 2 | Candidate registration creates Supabase Auth user, `public.users` record, and active membership (pending Section 18 decision) | Automated integration test |
| 3 | Admin invite workflow provisions employees and assigns `EMPLOYEE` or `ADMIN` role | Automated integration test |
| 4 | Authentication sessions refresh securely via `@supabase/ssr` cookies | Integration test |
| 5 | `getAuthenticatedContext()` executes through `withRlsContext()` and resolves active tenant and role | Unit & integration test |
| 6 | Deactivated employees are immediately blocked from all authenticated routes and actions | Integration test assertion |
| 7 | Cross-tenant data access is blocked at application level and database RLS level (`withRlsContext`) | Integration test assertion |
| 8 | All 4 Phase 1 tables have `FORCE ROW LEVEL SECURITY` enabled with zero unauthenticated write bypasses | Integration test assertion |
| 9 | Direct `UPDATE` and `DELETE` on `audit_events` are permanently blocked by RLS default-deny | Integration test assertion |
| 10 | Unauthenticated connections cannot create arbitrary users, organizations, memberships, or audit logs | Integration test assertion |
| 11 | Normal users cannot impersonate other actors or manufacture `SYSTEM` audit events | Integration test assertion |
| 12 | `SECURITY DEFINER` helper functions enforce strict search paths and cannot be abused for privilege escalation | Integration test assertion |
| 13 | Browser/client bundles contain zero database credentials or service keys and expose no privileged system functions | Automated build/security inspection |
| 14 | Zero candidate profile, job, application, task, or billing tables exist | Database inspection |
| 15 | TypeScript type check passes cleanly (`npm run typecheck`) | Exit code 0 |
| 16 | ESLint passes cleanly with zero warnings or errors (`npm run lint`) | Exit code 0 |
| 17 | Next.js production build completes cleanly (`npm run build`) | Exit code 0 |
| 18 | Complete Vitest test suite passes (`npm run test`) | Exit code 0 |

---

## 17. Phase Exit Gate Classification

- **PHASE 1 = ACCEPTED**: All 18 acceptance criteria pass and human product review is recorded.
- **PHASE 1 = BLOCKED**: Any security, architectural, or business rule requirement remains unresolved.
- **PHASE 1 = FAILED**: Implementation attempted but any acceptance criterion fails.

> [!IMPORTANT]
> Acceptance of Phase 1 does **NOT** authorize implementation of Phase 2 (Candidate & Profile). Phase 2 requires its own approved Engineering Specification.

---

## 18. Pending Business Rule Decisions for Human Input

The following product/business operational decisions require confirmation before Phase 1 implementation begins:
1. **Candidate Organization Tenancy Model (BLOCKING)**:
   - *Question*: In V1, when a candidate signs up on the public portal, how should the candidate's initial `Membership` be linked to an `Organization` (e.g. attached to the primary operating company organization initialized during seed, or resolved via tenant slug/subdomain URL)?
   - *Status*: **UNRESOLVED — PENDING HUMAN PRODUCT DECISION**.
   - *Impact*: Phase 1 implementation cannot complete the candidate registration acceptance criterion until this product decision is explicitly approved.

---

## 19. Change-Control Protocol

No implementation agent may modify a decision in this specification. Any proposed change requires:
1. Identifying the specific section and rationale.
2. Submitting the proposed revision for human approval.
3. Updating this specification document (`PHASE_01_IDENTITY_RBAC_SPEC.md`).
4. Creating or updating affected ADRs.
5. Proceeding with implementation only after explicit human sign-off.
