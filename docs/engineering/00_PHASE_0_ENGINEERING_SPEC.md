# OOS Phase 0 Engineering Specification

**Document Version:** 2.0.0  
**Status:** APPROVED — READY FOR PHASE 0 IMPLEMENTATION  
**Classification:** Controlled Engineering Contract  
**Phase:** Phase 0 (Engineering Foundation)  

---

## 1. Document Purpose & Authority

This document defines the authoritative, mandatory engineering contract for **Phase 0** of the **Operations Operating System (OOS)**.

Phase 0 establishes solely the foundational technical infrastructure, build system, typing, database configuration, security boundaries, error handling, logging, testing, and deployment setup.

All technical choices, architectural boundaries, and constraints documented herein are **locked and human-approved**. No implementation agent is authorized to modify, substitute, or expand upon these specifications without explicit human change-control approval.

---

## 2. Human-Controlled Version Baseline & Security Change Control

### 2.1 Baseline Principles
- The version baseline is strictly **human-controlled and locked**.
- Antigravity may **never** independently upgrade or downgrade dependencies, select "latest" tags, or infer compatible version sets based on ecosystem conventions or AI judgment.
- Any dependency change or addition requires prior explicit human approval.

### 2.2 Security Vulnerability Change Control Protocol
- A known security vulnerability (CVE / security advisory) affecting any deployed or specified dependency creates a **mandatory human review and change-control event**.
- Security remediation is never blocked merely because a version was labeled "frozen" or "baseline."
- When a vulnerability is identified, the implementation agent must report the advisory and the affected package to the human reviewer.
- The implementation agent is **prohibited** from independently selecting or upgrading to a replacement version without an explicit human directive.

---

## 3. Locked Technology Baseline & Dependency Allowlist

The following dependency matrix represents the human-approved, verified, production-grade technical baseline locked for Phase 0. Every dependency and configuration has been verified against official vendor documentation.

### 3.1 Runtime & Engines

| Technology | Exact Version | Official Source | Status |
| :--- | :--- | :--- | :--- |
| **Node.js** | `20.19.4` (LTS; engines: `>=20.18.0 <21.0.0`) | [nodejs.org/en/about/releases](https://nodejs.org/en/about/releases) | Locked Baseline |
| **npm** | `11.6.4` (engines: `>=10.0.0`) | [docs.npmjs.com](https://docs.npmjs.com) | Locked Baseline |

### 3.2 Production Dependencies (`dependencies`)

| Package | Exact Version | Purpose / Boundary | Official Source | Status |
| :--- | :--- | :--- | :--- | :--- |
| `next` | `16.3.6` | Core React framework (App Router) | [nextjs.org/docs](https://nextjs.org/docs) | Locked Baseline |
| `react` | `19.0.0` | UI runtime library | [react.dev](https://react.dev) | Locked Baseline |
| `react-dom` | `19.0.0` | DOM renderer for React | [react.dev](https://react.dev) | Locked Baseline |
| `@prisma/client` | `7.10.0` | Type-safe ORM runtime | [prisma.io/docs/orm/v7](https://www.prisma.io/docs/orm/v7) | Locked Baseline |
| `@prisma/adapter-pg` | `7.10.0` | Official PostgreSQL Driver Adapter for Prisma 7 | [prisma.io/docs/orm/v7](https://www.prisma.io/docs/orm/v7) | Locked Baseline |
| `pg` | `8.13.3` | PostgreSQL connection pool and client driver | [node-postgres.com](https://node-postgres.com) | Locked Baseline |
| `@supabase/supabase-js` | `2.49.1` | Supabase JavaScript client SDK | [supabase.com/docs/reference/javascript](https://supabase.com/docs) | Locked Baseline |
| `@supabase/ssr` | `0.5.2` | Supabase Server-Side Rendering client utilities | [supabase.com/docs/guides/auth/server-side/nextjs](https://supabase.com/docs) | Locked Baseline |
| `zod` | `3.24.2` | Schema validation for environment and input | [zod.dev](https://zod.dev) | Locked Baseline |
| `dotenv` | `16.4.7` | Environment loader for Prisma CLI configuration | [npmjs.com/package/dotenv](https://www.npmjs.com/package/dotenv) | Locked Baseline |

### 3.3 Development Dependencies (`devDependencies`)

| Package | Exact Version | Purpose / Boundary | Official Source | Status |
| :--- | :--- | :--- | :--- | :--- |
| `typescript` | `5.7.3` | Static type checker & compiler | [typescriptlang.org](https://www.typescriptlang.org) | Locked Baseline |
| `@types/node` | `20.17.19` | Type definitions for Node.js | [npmjs.com/package/@types/node](https://www.npmjs.com/package/@types/node) | Locked Baseline |
| `@types/react` | `19.0.10` | Type definitions for React 19 | [npmjs.com/package/@types/react](https://www.npmjs.com/package/@types/react) | Locked Baseline |
| `@types/react-dom` | `19.0.4` | Type definitions for React DOM 19 | [npmjs.com/package/@types/react-dom](https://www.npmjs.com/package/@types/react-dom) | Locked Baseline |
| `@types/pg` | `8.11.11` | Type definitions for node-postgres | [npmjs.com/package/@types/pg](https://www.npmjs.com/package/@types/pg) | Locked Baseline |
| `prisma` | `7.10.0` | Prisma CLI for schema management and migrations | [prisma.io/docs/orm/v7](https://www.prisma.io/docs/orm/v7) | Locked Baseline |
| `tailwindcss` | `3.4.17` | Utility-first CSS framework | [tailwindcss.com/docs](https://tailwindcss.com/docs) | Locked Baseline |
| `postcss` | `8.5.3` | CSS post-processing pipeline | [postcss.org](https://postcss.org) | Locked Baseline |
| `autoprefixer` | `10.4.20` | CSS vendor prefixer | [github.com/postcss/autoprefixer](https://github.com/postcss/autoprefixer) | Locked Baseline |
| `eslint` | `9.21.0` | Direct CLI linter engine | [eslint.org](https://eslint.org) | Locked Baseline |
| `eslint-config-next` | `16.3.6` | ESLint configuration for Next.js 16 | [nextjs.org/docs](https://nextjs.org/docs) | Locked Baseline |
| `vitest` | `2.1.8` | Unit & integration test runner | [vitest.dev](https://vitest.dev) | Locked Baseline |

### 3.4 Package JSON Module Configuration
`package.json` explicitly declares native ECMAScript module support for Prisma 7 and Next.js:
```json
{
  "type": "module"
}
```

*Rule: Any package not present on this allowlist is strictly prohibited without prior human approval.*

---

## 4. Scope & Boundaries

### 4.1 Phase 0 Scope (Included)
1. **Next.js App Router & TypeScript Foundation**: Configuration, strict type checking, project root layout, and server/client boundary enforcement.
2. **Styling Foundation**: Tailwind CSS with a restrained enterprise design system baseline (typography, colors, spacing, elevation).
3. **Database & ORM Foundation**: Supabase PostgreSQL connectivity and Prisma ORM v7.10.0 with `@prisma/adapter-pg` driver adapter, `prisma.config.ts`, and `output = "../src/generated/prisma"`.
4. **Supabase Client Infrastructure**: SSR and browser client adapters strictly as infrastructure connectors (no auth flows).
5. **Environment Configuration & Validation**: Zod-based runtime environment validation with strict error reporting.
6. **Error Taxonomy & Handling**: Standardized, secure domain error classes with user-safe sanitization and HTTP status mapping.
7. **Structured Logging**: Zero-dependency structured JSON logger with mandatory secret sanitization.
8. **Health Endpoint**: Minimal unprivileged `GET /api/health` verification endpoint with dynamic request-time timestamp.
9. **Engineering Verification Screen**: Minimal static landing screen verifying foundation readiness.
10. **Testing & Quality Tooling**: Vitest unit test harness, direct ESLint 9 CLI execution, TypeScript compiler checks, and build verification.

### 4.2 Phase 0 Non-Goals & Future-Phase Firewall (Strictly Prohibited)
Phase 0 strictly creates **zero** business-domain entities, logic, workflows, or UI. The following capabilities are explicitly firewalled and MUST NOT be implemented in Phase 0:

- **Authentication & Authorization Flows**: No signup, login UI, logout workflow, password reset, session UI, protected routes, RBAC tables, roles, or permissions.
- **Tenancy & Membership**: No `Organization`, `User`, `Membership`, or tenant provisioning workflows.
- **Core Domain Entities**: No `Candidate`, `Employee`, `Job`, `Application`, `Task`, `Workflow`, `QA Review`, `Message`, `Notification`, `Interview`, `Offer`.
- **Operational & Commercial Systems**: No billing, payments, subscriptions, invoices, SLA engines, escalations, workforce operations, or analytics.
- **Automation & External Integrations**: No AI workflows, automated job discovery, job ingestion, automated applications, or scraping.
- **Complex Infrastructure**: No microservices, Redis, Kafka, message brokers, worker processes, event buses, or API gateways.

---

## 5. Fixed Architectural Model

The OOS is architected as a **Modular Monolith** deployed to Vercel with Supabase managed services.

```
┌────────────────────────────────────────────────────────┐
│                   Next.js App Router                   │
│   (Server Components default / Client Components opt-in)│
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│              Application / Server Layer                │
│    (Route Handlers, Server Actions [Phase 1+], Auth)    │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│             Domain Services & Use Cases                │
│      (Pure business logic - deferred to Phase 1+)       │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│             Repositories / Data Access Layer           │
│        (Prisma Client / Data access abstractions)      │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│        Prisma ORM v7.10.0 (@prisma/adapter-pg)         │
│       (Client generated at: src/generated/prisma)      │
└───────────────────────────┬────────────────────────────┘
                            │ (Pooled 6543 / Direct 5432)
┌───────────────────────────▼────────────────────────────┐
│            Supabase PostgreSQL Database                │
└────────────────────────────────────────────────────────┘
```

---

## 6. TypeScript Configuration

TypeScript is configured with strict compiler flags to guarantee compile-time safety across server and client boundaries.

### 6.1 Compiler Flags (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", "prisma.config.ts"],
  "exclude": ["node_modules"]
}
```

---

## 7. Tailwind CSS & Design System Baseline

Phase 0 establishes a restrained, professional design baseline. Decorative visual noise (excessive gradients, glassmorphism, animated glow effects) is prohibited.

### 7.1 Tailwind Configuration (`tailwind.config.ts`)
- **Version**: Tailwind CSS v3.4.17
- **PostCSS**: `postcss.config.mjs` with `tailwindcss` and `autoprefixer`
- **Content Paths**: `./src/**/*.{js,ts,jsx,tsx,mdx}`
- **Color Palette**: Neutral enterprise palette based on `slate` / `zinc` with semantic functional tokens:
  - `brand`: `#0F172A` (Slate 900)
  - `surface`: `#FFFFFF` / `#F8FAFC` (Slate 50)
  - `border`: `#E2E8F0` (Slate 200)
  - `text-primary`: `#0F172A` (Slate 900)
  - `text-muted`: `#64748B` (Slate 500)
  - `status-success`: `#15803D` (Green 700)
  - `status-error`: `#B91C1C` (Red 700)
  - `status-warning`: `#B45309` (Amber 700)
- **Typography**: System font stack / Inter-fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- **Radius**: Restrained `0.375rem` (`rounded-md`) standard.

---

## 8. Database Architecture & Prisma 7.10.0 Authoritative Configuration

### 8.1 Database Engine
- **Engine**: PostgreSQL 15+ hosted on Supabase.
- **ORM**: Prisma ORM v7.10.0.

### 8.2 Prisma 7 Authoritative Schema Contract (`prisma/schema.prisma`)
In Prisma 7, connection URLs (`url` and `directUrl`) are managed in `prisma.config.ts`. The schema strictly defines provider and client generator with custom output path:

```prisma
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

### 8.3 Prisma 7 CLI & Migration Configuration (`prisma.config.ts`)
Prisma 7 centralizes datasource connection, schema path, and migration settings in `prisma.config.ts` using `defineConfig` from `prisma/config`:

```typescript
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Uses direct URL for CLI schema migrations against Supabase port 5432
    url: process.env.DIRECT_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres",
  },
});
```

### 8.4 Generated Client Import & Prisma Client Singleton (`src/lib/db/prisma.ts`)
In Prisma 7 with `output = "../src/generated/prisma"`, the generated client entrypoint is located at `src/generated/prisma/client`. The client receives the `@prisma/adapter-pg` driver adapter.

Mandatory production SSL configuration verifies server certificates (`rejectUnauthorized: true`):

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const pool =
  globalForPrisma.pool ??
  new Pool({
    // Runtime queries route through Supavisor connection pooler on port 6543
    connectionString: process.env.DATABASE_URL,
    max: 10,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
  });

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}
```

---

## 9. Supabase Infrastructure Scope & Configuration

Phase 0 implements client and server adapters using `@supabase/ssr` strictly as technical infrastructure adapters.

### 9.1 Boundary & Scope Rules
- **Infrastructure Only**: The Supabase adapters exist solely as connection infrastructure.
- **No Auth Workflows**: Phase 0 must NOT implement signup, login UI, logout flows, password reset, session management UI, or protected routes.
- **No Authorization**: Phase 0 must NOT implement RBAC, roles, permissions, or organization context.
- **No Browser-Side Privileged Access**: Browser clients have zero administrative privileges.

### 9.2 Browser Client (`src/lib/supabase/client.ts`)
- Utilizes `createBrowserClient` from `@supabase/ssr`.
- Consumes only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Executes strictly in browser context.

### 9.3 Server Client (`src/lib/supabase/server.ts`)
- Utilizes `createServerClient` from `@supabase/ssr`.
- Reads and writes cookies using Next.js asynchronous `await cookies()` from `next/headers`.

### 9.4 Service-Role Key Classification
- `SUPABASE_SERVICE_ROLE_KEY` is **NOT required in Phase 0** (Required: `false`).
- Phase 0 usage: **Prohibited**.
- Introduced only in later phases through an approved specification when an explicit privileged server-side use case exists.
- Must remain strictly server-only and never be prefixed with `NEXT_PUBLIC_` or bundled into client code.

---

## 10. Environment Variable Contract & Validation

All runtime environment variables must be declared and validated at startup using Zod.

### 10.1 Environment Variables Specification

| Variable Name | Required in Phase 0 | Scope | Purpose | Allowed Contexts |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | System | Runtime environment (`development`, `production`, `test`) | Server & Client |
| `DATABASE_URL` | Yes | Server-Only | Pooled connection string for Prisma runtime queries (port 6543) | Server |
| `DIRECT_URL` | Yes | Server-Only | Direct connection string for Prisma CLI migrations (port 5432) | Server / CLI |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public | URL endpoint for Supabase project | Server & Client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public | Public anonymous key for Supabase client requests | Server & Client |
| `SUPABASE_SERVICE_ROLE_KEY` | **No (Prohibited in Phase 0)** | Server-Only | Privileged admin key (deferred to later phase) | Server |

### 10.2 Environment Validation Architecture (`src/lib/env.ts`)
- **Production**: Invalid or missing required configuration causes process startup to fail explicitly.
- **Development**: Invalid or missing required configuration produces an explicit, formatted `ConfigurationError`.
- **Test**: Tests may explicitly inject mock environment variables or test fixtures. Silent mock-safe credential fallbacks and silent fake infrastructure configurations are **prohibited**.

---

## 11. Error Handling Architecture

The system implements a structured error hierarchy. Internal system details, stack traces, and database connection strings are never returned to clients.

### 11.1 Error Taxonomy (`src/lib/errors/index.ts`)

| Error Class | Error Code | HTTP Status | Description |
| :--- | :--- | :--- | :--- |
| `ValidationError` | `VALIDATION_ERROR` | 400 | Invalid external input or schema parsing failure |
| `AuthenticationError` | `AUTHENTICATION_ERROR` | 401 | Unauthenticated access attempt or invalid credentials |
| `AuthorizationError` | `AUTHORIZATION_ERROR` | 403 | Authenticated user lacks required permission/scope |
| `NotFoundError` | `NOT_FOUND` | 404 | Target entity or resource does not exist |
| `ConflictError` | `CONFLICT` | 409 | State conflict or unique constraint collision |
| `InvalidStateTransitionError`| `INVALID_STATE_TRANSITION` | 422 | Disallowed workflow or domain state change |
| `DatabaseError` | `DATABASE_ERROR` | 500 | Database connectivity or query execution failure |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` | 502 | Upstream third-party service failure |
| `UnexpectedError` | `INTERNAL_SERVER_ERROR` | 500 | Unhandled system exception |

### 11.2 Error Serialization Contract
Every user-facing API error response follows a strict, safe JSON shape:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The provided input did not meet validation requirements.",
    "details": []
  }
}
```

---

## 12. Structured Logging Architecture

A zero-dependency structured JSON logger provides consistent log formatting and automated secret sanitization.

### 12.1 Logger Specification (`src/lib/logger/index.ts`)
- **Format**: Single-line JSON objects to standard output (`stdout`) / standard error (`stderr`).
- **Fields**:
  - `timestamp`: ISO 8601 string (`YYYY-MM-DDTHH:mm:ss.sssZ`)
  - `level`: `"DEBUG"` | `"INFO"` | `"WARN"` | `"ERROR"`
  - `message`: Human-readable summary string
  - `context`: Optional structured metadata object
- **Sanitization Engine**: Automatically redacts matching keys before serialization:
  - `password`, `token`, `access_token`, `refresh_token`, `authorization`, `cookie`, `apiKey`, `secret`, `serviceRoleKey`, `databaseUrl`, `directUrl`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`.
  - Redacted value replacement: `"[REDACTED]"`.

---

## 13. Health Endpoint Specification

### 13.1 Route Handler (`src/app/api/health/route.ts`)
- **Method**: `GET`
- **Path**: `/api/health`
- **Cache Policy**: `no-store` (`export const dynamic = 'force-dynamic'`)
- **HTTP Status**: `200 OK`
- **Response Headers**: `Content-Type: application/json`, `Cache-Control: no-store, max-age=0`
- **Dynamic Timestamp**: The `timestamp` field is dynamically generated at request time using `new Date().toISOString()`. It must **never** be hardcoded.
- **Response Payload**:
```json
{
  "status": "pass",
  "timestamp": "<dynamically-generated-ISO-8601-timestamp>",
  "service": "oos",
  "phase": "0"
}
```
- **Diagnostics Isolation**: The endpoint acts strictly as a lightweight liveness/readiness verification point. It intentionally does **not** expose database connection diagnostics, environment variables, secret presence, or internal server metrics.

---

## 14. Phase 0 Verification Screen

### 14.1 Page Component (`src/app/page.tsx`)
- **Component Type**: Next.js Server Component.
- **Purpose**: Minimal engineering verification screen to confirm build and styling pipeline functionality.
- **UI Content**:
  - Title: `Operations Operating System (OOS)`
  - Subtitle: `Phase 0 — Engineering Foundation`
  - System Status: `Foundation Verified`
  - Disclaimer: `Authoritative Product Vision and V1 PRD documents required before business feature implementation.`
- **Prohibition**: Must not contain mock dashboards, candidate cards, navigation bars, application trackers, or speculative product features.

---

## 15. Repository Directory Structure

```
apply_citrux/
├── docs/
│   ├── 00_PRODUCT_VISION.md       # Product Vision (authored by product leadership)
│   ├── 01_V1_PRD.md               # V1 PRD (authored by product leadership)
│   ├── engineering/
│   │   └── 00_PHASE_0_ENGINEERING_SPEC.md  # This authoritative specification
│   └── decisions/
│       └── ADRs/                  # Architecture Decision Records (Must precede implementation)
│           ├── ADR-001-modular-monolith-tech-stack.md
│           ├── ADR-002-server-client-boundary-security.md
│           ├── ADR-003-database-connection-prisma-strategy.md
│           ├── ADR-004-testing-strategy.md
│           └── ADR-005-logging-observability-foundation.md
├── prisma/
│   └── schema.prisma              # Datasource (provider only) & generator (output -> src/generated/prisma)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── health/
│   │   │       └── route.ts       # Minimal health check endpoint
│   │   ├── globals.css            # Tailwind directives and base layer tokens
│   │   ├── layout.tsx             # Root server layout
│   │   └── page.tsx               # Minimal verification screen
│   ├── generated/
│   │   └── prisma/                # Prisma 7 generated client output directory (.gitignored)
│   └── lib/
│       ├── db/
│       │   └── prisma.ts          # Prisma v7.10.0 client singleton with pg Driver Adapter
│       ├── env.ts                 # Zod environment schema & validation
│       ├── errors/
│       │   └── index.ts           # Standardized error classes & serialization
│       ├── logger/
│       │   └── index.ts           # Structured JSON logger with sanitization
│       ├── supabase/
│       │   ├── client.ts          # Browser client adapter (infrastructure only)
│       │   └── server.ts          # Server client adapter (infrastructure only)
│       └── validation/
│           └── index.ts           # Shared validation utilities
├── tests/
│   └── unit/
│       ├── env.test.ts            # Environment validation unit tests
│       ├── errors.test.ts         # Error taxonomy unit tests
│       ├── logger.test.ts         # Logger & sanitization unit tests
│       └── health.test.ts         # Health endpoint dynamic payload tests
├── .env.example                   # Template environment file
├── .gitignore                     # Git ignore rules (includes src/generated/prisma)
├── eslint.config.mjs              # ESLint 9 flat configuration (direct CLI execution)
├── next.config.ts                 # Next.js TypeScript configuration
├── package.json                   # Locked dependencies ("type": "module") and scripts
├── postcss.config.mjs             # PostCSS configuration
├── prisma.config.ts               # Prisma 7 configuration file (schema path, migrations, datasource)
├── tailwind.config.ts             # Tailwind CSS configuration
├── tsconfig.json                  # Strict TypeScript compiler configuration (ES2023, ESNext)
└── vitest.config.ts               # Vitest test runner configuration
```

---

## 16. Testing Architecture

### 16.1 Test Runner & Configuration (`vitest.config.ts`)
- **Framework**: Vitest v2.1.8.
- **Environment**: `node` for backend/utility tests.
- **Path Aliasing**: Resolves `@/*` to `./src/*`.
- **Test File Pattern**: `tests/**/*.test.ts`.

### 16.2 Required Phase 0 Test Suites
1. `tests/unit/env.test.ts`: Verifies schema parsing, valid variable acceptance, explicit error throwing on invalid/missing variables, and prohibition of implicit fallbacks.
2. `tests/unit/errors.test.ts`: Verifies error hierarchy, HTTP status codes, and user-safe JSON serialization.
3. `tests/unit/logger.test.ts`: Verifies log level formatting and mandatory secret redaction across nested objects.
4. `tests/unit/health.test.ts`: Verifies `/api/health` returns status `pass`, generates dynamic ISO 8601 timestamps, and contains no secret or environment leaks.

---

## 17. NPM Scripts & Tooling Commands

Direct CLI invocation is used for linting with ESLint 9:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "prisma:generate": "prisma generate",
  "prisma:validate": "prisma validate"
}
```

---

## 18. Security Baseline Controls

1. **Strict Credential Separation**: Client code never imports or accesses server-only variables (`DATABASE_URL`, `DIRECT_URL`).
2. **Service Role Key Prohibited**: `SUPABASE_SERVICE_ROLE_KEY` is not required and is prohibited from Phase 0 runtime environments.
3. **Repository Hygiene (`.gitignore`)**:
   - `.env`, `.env.local`, `.env.*.local` excluded.
   - `src/generated/prisma` excluded.
   - `node_modules`, `.next`, `dist`, `coverage` excluded.
4. **Log Sanitization**: Proactive redaction of credentials in all logs.
5. **Input Validation**: All future API inputs must parse through Zod schemas.
6. **No Route-Only Authorization Assumptions**: Infrastructure is prepared for defense-in-depth server-side authorization in Phase 1.

---

## 19. Architecture Decision Records (ADRs) Governance

The architectural decisions frozen herein govern the mandatory Architecture Decision Records. The five ADR files must be created and verified prior to Phase 0 implementation:

- **ADR-001**: `Technology Stack and Modular Monolith Architecture` — Records the approved Next.js 16.3.6 + React 19.0.0 + TypeScript 5.7.3 + Prisma 7.10.0 + Supabase modular monolith baseline.
- **ADR-002**: `Server/Client Boundaries and Security Baseline` — Records Server Component defaults, secret separation, and credential boundaries.
- **ADR-003**: `Database Connection Pooling and Prisma 7 Configuration Strategy` — Records `prisma.config.ts`, Supavisor port 6543 pooled runtime with `@prisma/adapter-pg`, custom output generator (`src/generated/prisma/client`), and port 5432 direct migration URLs.
- **ADR-004**: `Testing Strategy and Vitest Harness` — Records unit testing conventions and verification standards.
- **ADR-005**: `Structured Logging and Sensitive Data Sanitization` — Records zero-dependency JSON logger and sanitization rules.

---

## 20. Change-Control Protocol

No implementation agent may modify a decision in this specification. Any proposed change requires:
1. Identifying the specific section and rationale.
2. Submitting the proposed revision for human approval.
3. Updating this specification document (`00_PHASE_0_ENGINEERING_SPEC.md`).
4. Creating or updating the affected ADR.
5. Executing implementation only after explicit human sign-off.

---

## 21. Objective Acceptance Criteria (Phase 0 Exit Gate)

Phase 0 implementation is evaluated against the following binary criteria:

| # | Acceptance Criterion | Verification Method |
| :--- | :--- | :--- |
| 1 | Directory structure matches Section 15 exactly (including `prisma.config.ts` and `src/generated/prisma`) | Directory inspection |
| 2 | `package.json` contains `"type": "module"` and only human-approved dependencies and exact versions | `npm ls` / file review |
| 3 | TypeScript passes cleanly with strict configuration (`target: ES2023`, `module: ESNext`, `moduleResolution: bundler`) | `npm run typecheck` (exit 0) |
| 4 | Direct ESLint 9 CLI passes cleanly with zero warnings or errors | `npm run lint` (exit 0) |
| 5 | Vitest unit test suite passes cleanly | `npm run test` (exit 0) |
| 6 | Next.js 16 production build completes cleanly | `npm run build` (exit 0) |
| 7 | `/api/health` returns `200 OK` with dynamic timestamp and sanitized status | Test assertion |
| 8 | Zero business-domain models exist in `schema.prisma` | File inspection |
| 9 | `SUPABASE_SERVICE_ROLE_KEY` is not required and zero server credentials exist in client bundles | Static inspection |
| 10 | The five mandatory ADRs (ADR-001 through ADR-005) are approved and present | File inspection |

---

## 22. Phase Exit Gate Classification

- **PHASE 0 = ACCEPTED**: All 10 acceptance criteria pass.
- **PHASE 0 = BLOCKED**: Any architectural, security, or version requirement remains unresolved.
- **PHASE 0 = FAILED**: Implementation attempted but any acceptance criterion fails.

> [!IMPORTANT]
> Acceptance of Phase 0 does **NOT** authorize implementation of Phase 1. Phase 1 requires its own approved Engineering Specification.
