# ADR-004 — Testing Strategy and Vitest Harness

## Status
Accepted

## Date
2026-09-23

## Context
A rigorous engineering baseline requires fast, deterministic automated testing for runtime configuration, error handling, secret sanitization, and health endpoints. The test framework must integrate seamlessly with TypeScript, ESM, and Next.js path aliases without bloated dependencies.

## Decision
Adopt **Vitest `2.1.8`** as the unified unit and integration test runner for Phase 0:

1. **Test Environment**: `node` environment in `vitest.config.ts`.
2. **Path Aliasing**: Resolves `@/*` to `./src/*`.
3. **Test File Convention**: `tests/**/*.test.ts`.
4. **Mandatory Phase 0 Test Suites**:
   - `tests/unit/env.test.ts`: Verifies Zod schema parsing, valid configuration acceptance, explicit failure on missing/invalid variables, and prohibition of silent mock fallbacks.
   - `tests/unit/errors.test.ts`: Verifies the domain error taxonomy, error codes, HTTP status mapping, and sanitized JSON serialization.
   - `tests/unit/logger.test.ts`: Verifies structured JSON format, log levels, and automatic redaction of sensitive credentials.
   - `tests/unit/health.test.ts`: Verifies `GET /api/health` returns HTTP 200, status `pass`, dynamic request-time ISO timestamps, and zero secret leakage.
5. **Quality & Acceptance Commands**:
   - `npm run typecheck` (`tsc --noEmit`)
   - `npm run lint` (`eslint .`)
   - `npm run test` (`vitest run`)
   - `npm run build` (`next build`)

Phase 0 exit requires all four verification commands to pass with exit code 0.

## Consequences
- Fast, ESM-native test execution with zero configuration overhead.
- Objective verification of foundation reliability and security sanitization.
- Clean separation between pure TypeScript unit testing and future browser/UI testing.
- Prohibits introducing heavier E2E frameworks (Playwright, Cypress) during Phase 0.

## Alternatives Considered
- **Jest**: Rejected due to complex ESM configuration, slower execution, and heavier transform overhead compared to Vitest.
- **Playwright / Cypress in Phase 0**: Rejected because Phase 0 contains zero user-facing business UI or authentication flows requiring browser automation.
- **`@vitejs/plugin-react`**: Evaluated and removed as Phase 0 tests pure TypeScript modules without interactive JSX component testing requirements.

## Constraints
- Tests must use `tests/**/*.test.ts` naming and directory structure.
- Unit tests must not require a live database or external network connections.
- No business-domain tests may be created in Phase 0.

## Change Control
This decision may not be changed by an implementation agent. Any change requires explicit human approval, an update to the Phase 0 Engineering Specification, and an affected ADR revision before implementation.
