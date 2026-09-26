# ADR-001 — Technology Stack and Modular Monolith Architecture

## Status
Accepted

## Date
2026-09-23

## Context
The Operations Operating System (OOS) requires a controlled, low-complexity, enterprise-ready technical foundation for its initial engineering baseline. The architecture must avoid premature distributed-systems complexity while establishing clean layer boundaries for future domain expansion.

## Decision
Adopt a Modular Monolith architecture deployed to Vercel with managed Supabase services, using the following locked technology baseline:

- **Framework**: Next.js `16.3.6` (App Router, Server Components by default)
- **UI Runtime**: React `19.0.0` & React DOM `19.0.0`
- **Language & Type System**: TypeScript `5.7.3`
- **Runtime & Package Management**: Node.js `20.19.4` (LTS), npm `11.6.4`
- **Database & ORM**: Supabase PostgreSQL, Prisma ORM `7.10.0` (`@prisma/client@7.10.0`, `@prisma/adapter-pg@7.10.0`, `pg@8.13.3`)
- **Authentication Infrastructure**: Supabase Auth (`@supabase/supabase-js@2.49.1`, `@supabase/ssr@0.5.2`)
- **Styling**: Tailwind CSS `3.4.17`, PostCSS `8.5.3`, Autoprefixer `10.4.20`
- **Validation**: Zod `3.24.2`
- **Configuration**: dotenv `16.4.7`
- **Testing**: Vitest `2.1.8`
- **Hosting / Compute**: Vercel

The logical layer progression is strictly:
```
Next.js App Router
      ↓
Application / Server Layer
      ↓
Domain Services / Use Cases
      ↓
Repositories / Data Access
      ↓
Prisma 7.10.0
      ↓
@prisma/adapter-pg
      ↓
Supabase PostgreSQL
```

The architecture explicitly excludes:
- Microservices
- Redis
- Kafka
- Message brokers
- Event buses
- API gateways
- Workflow engines
- Separate worker infrastructure

## Consequences
- Single codebase and deployment unit simplifies local development, deployment, and testing.
- Clean architectural boundaries prevent business logic from leaking into UI components.
- Zero premature infrastructure complexity reduces operational maintenance and cost.
- Any future introduction of distributed components requires an approved change-control decision.

## Alternatives Considered
- **Microservices Architecture**: Rejected due to unnecessary operational complexity, network latency, distributed transaction overhead, and premature scaling assumptions.
- **Alternative ORMs (TypeORM, Drizzle, Raw SQL)**: Rejected to preserve type-safe schema management, automated migrations, and official Prisma 7 driver adapter compatibility.
- **Alternative Frameworks (Remix, Vite + Express)**: Rejected in favor of Next.js App Router server/client boundary model and native Vercel deployment support.

## Constraints
- Code must reside within the single modular monolith repository.
- Layer dependencies must flow downward strictly according to the architectural diagram.
- No business-domain functionality may be implemented in Phase 0.
- All dependency versions are locked to the exact versions specified.

## Change Control
This decision may not be changed by an implementation agent. Any change requires explicit human approval, an update to the Phase 0 Engineering Specification, and an affected ADR revision before implementation.
