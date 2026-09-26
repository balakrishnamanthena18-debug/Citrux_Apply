# ADR-002 — Server/Client Boundaries and Security Baseline

## Status
Accepted

## Date
2026-09-23

## Context
Enterprise operations platforms must enforce strict isolation of sensitive credentials and database access. Relying on client-side security or exposing server-side secrets creates severe vulnerability risks. A clear boundary between server execution and client hydration is mandatory from day zero.

## Decision
Enforce strict execution separation and credential protection across server and client boundaries:

1. **Server Components Default**: Next.js Server Components are the default. Client Components are used strictly where client-side interactivity or browser APIs require them.
2. **Credential Isolation**:
   - `DATABASE_URL` is server-only.
   - `DIRECT_URL` is server-only.
   - `SUPABASE_SERVICE_ROLE_KEY` is prohibited in Phase 0 runtime environments.
   - `NEXT_PUBLIC_SUPABASE_URL` is public.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public.
   - Server-only secrets must never be imported into or bundled with Client Components.
3. **Supabase Adapters**:
   - Browser client uses `createBrowserClient` with public variables only.
   - Server client uses `createServerClient` reading cookies via Next.js asynchronous `cookies()`.
4. **Production Database SSL**: Production database connections must verify SSL certificates with `ssl: { rejectUnauthorized: true }`. Disabling certificate verification (`rejectUnauthorized: false`) is strictly prohibited.
5. **Phase 0 Authorization & Authentication Boundary**:
   - Supabase client/server adapters exist strictly as connection infrastructure.
   - Phase 0 does NOT implement authentication workflows (signup, login UI, logout, password reset, session UI).
   - Phase 0 does NOT implement RBAC, roles, permissions, or tenant/organization membership.
   - No route-only authorization assumptions.

**Core Principle**: Credentials are separated by execution boundary, and privileged infrastructure must never be exposed to browser code.

## Consequences
- Prevents secret leakage into client JavaScript bundles.
- Ensures all database queries execute exclusively in privileged server environments.
- Enforces defense-in-depth security before business domain logic is implemented.
- Prevents MITM attacks against database connections in production.

## Alternatives Considered
- **Client-Direct Database Access**: Rejected as an unacceptable security risk that exposes database credentials to the browser.
- **Permissive SSL Verification (`rejectUnauthorized: false`)**: Rejected due to vulnerability to Man-in-the-Middle attacks on database network connections.
- **Premature Auth / RBAC in Phase 0**: Rejected to maintain clean separation between technical infrastructure (Phase 0) and identity/authorization (Phase 1).

## Constraints
- No server secret may use the `NEXT_PUBLIC_` prefix.
- Client components may not import `@prisma/client`, database connection pools, or server environment variables.
- All external inputs must be validated server-side.

## Change Control
This decision may not be changed by an implementation agent. Any change requires explicit human approval, an update to the Phase 0 Engineering Specification, and an affected ADR revision before implementation.
