# ADR-003 — Database Connection Pooling and Prisma 7 Configuration Strategy

## Status
Accepted

## Date
2026-09-23

## Context
Deploying Prisma ORM within serverless architectures (Vercel) against Supabase PostgreSQL requires a robust connection management strategy to avoid exhausting database connection limits while supporting schema migrations. Furthermore, Prisma 7 introduces a modernized configuration and driver adapter model that replaces legacy Prisma 5/6 patterns.

## Decision
Implement the Prisma 7 driver adapter and connection pooling architecture:

1. **ORM Version**: Prisma `7.10.0` (`@prisma/client@7.10.0`, `prisma@7.10.0`, `@prisma/adapter-pg@7.10.0`, `pg@8.13.3`).
2. **Schema Configuration (`prisma/schema.prisma`)**:
   - `provider = "postgresql"` in `datasource db` block.
   - Connection URLs (`url` and `directUrl`) are **removed** from `schema.prisma`.
   - `generator client` uses `provider = "prisma-client"` with explicit `output = "../src/generated/prisma"`.
3. **CLI Configuration (`prisma.config.ts`)**:
   - Centralizes CLI datasource and migration paths using `defineConfig` from `prisma/config`.
   - CLI migrations use `DIRECT_URL` targeting Supabase direct session connection on port `5432`.
4. **Runtime Query Execution**:
   - Runtime Prisma queries use `DATABASE_URL` targeting Supabase Supavisor connection pooler on port `6543` (transaction mode with `?pgbouncer=true`).
   - Uses `@prisma/adapter-pg` backed by `pg.Pool` with `max: 10` and `ssl: { rejectUnauthorized: true }` in production.
5. **Client Import & Singleton**:
   - Client is imported from `@/generated/prisma/client`.
   - Singleton pattern in `src/lib/db/prisma.ts` preserves client and connection pool across development hot-reloads.

**Rationale**:
- Pooled runtime connections protect database connection limits in serverless execution.
- Direct connection is reserved strictly for migration and CLI DDL operations.
- Prisma 7 TypeScript Query Compiler eliminates Rust binary overhead.
- Explicit custom output path provides deterministic client code location.

## Consequences
- Prevents database connection exhaustion under serverless load spikes.
- Ensures zero database migration failures caused by connection poolers disallowing DDL transactions.
- Replaces Rust binaries with lightweight TypeScript query execution.
- Generates client files into `src/generated/prisma/` which is excluded via `.gitignore`.

## Alternatives Considered
- **Direct Database URLs for Runtime Queries**: Rejected because serverless connection concurrency will rapidly exhaust PostgreSQL connection limits.
- **Legacy Prisma 5/6 Binary Architecture**: Rejected in favor of official Prisma 7 driver adapters and TypeScript query compilation.
- **Putting Connection URLs in `schema.prisma`**: Rejected because Prisma 7 deprecates connection URLs in `schema.prisma` in favor of `prisma.config.ts`.
- **External Connection Bouncers / Redis**: Rejected to avoid unnecessary infrastructure complexity.

## Constraints
- No connection URLs inside `prisma/schema.prisma`.
- `DIRECT_URL` must only be used for CLI and migrations.
- Production SSL must strictly enforce `rejectUnauthorized: true`.
- Zero business models in `schema.prisma` during Phase 0.

## Change Control
This decision may not be changed by an implementation agent. Any change requires explicit human approval, an update to the Phase 0 Engineering Specification, and an affected ADR revision before implementation.
