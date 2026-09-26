# ADR-005 — Structured Logging and Sensitive Data Sanitization

## Status
Accepted

## Date
2026-09-23

## Context
Enterprise operational platforms must provide reliable, structured observability while strictly preventing the exposure of credentials, access tokens, connection strings, or user secrets in application logs. Heavy third-party logging frameworks introduce external dependency risk and supply-chain vulnerabilities.

## Decision
Implement a zero-dependency structured JSON logger (`src/lib/logger/index.ts`) with mandatory automated secret sanitization:

1. **Architecture**:
   - Zero external logging libraries.
   - Standard output (`stdout`) for `DEBUG` / `INFO` / `WARN`; standard error (`stderr`) for `ERROR`.
   - Single-line JSON objects per log event.
   - ISO 8601 timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`).
   - Log levels: `DEBUG`, `INFO`, `WARN`, `ERROR`.
   - Structured context metadata support.
2. **Automated Secret Sanitization Engine**:
   - Recursively inspects all context objects before serialization.
   - Automatically redacts keys matching sensitive patterns:
     - `password`
     - `token`
     - `access_token`
     - `refresh_token`
     - `authorization`
     - `cookie`
     - `apiKey`
     - `secret`
     - `serviceRoleKey`
     - `databaseUrl`
     - `directUrl`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `DATABASE_URL`
     - `DIRECT_URL`
   - Replaces matched values with `"[REDACTED]"`.

**Core Principle**: No secret, credential, connection string, authentication token, or privileged key may appear in application logs.

## Consequences
- Guarantees compliance with enterprise security and audit requirements.
- Zero runtime overhead from heavy third-party logging libraries.
- Uniform log ingestion format compatible with Vercel and cloud observability platforms.
- Eliminates risk of secret leaks in build, deployment, or runtime logs.

## Alternatives Considered
- **Third-Party Logging Libraries (Pino, Winston, Bunyan)**: Rejected in Phase 0 to eliminate external dependencies, minimize bundle size, and maintain complete control over redaction logic.
- **Unstructured `console.log` Calls**: Rejected because unstructured logs prevent automated parsing, log-level filtering, and centralized security sanitization.

## Constraints
- All application modules must route logging through `src/lib/logger/index.ts`.
- Direct un-sanitized `console.log` statements in application code are prohibited.
- No business or candidate data may be logged during Phase 0.

## Change Control
This decision may not be changed by an implementation agent. Any change requires explicit human approval, an update to the Phase 0 Engineering Specification, and an affected ADR revision before implementation.
