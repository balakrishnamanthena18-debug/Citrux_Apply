# PHASE 7E.3 — STAFF CANDIDATE 360 UI REPORT

## Executive Summary

Phase 7E.3 implements the staff-facing Candidate 360 operational assessment experience based on the frozen Phase 7D / 7D.1 product contract, the Phase 7E.1 composition service (`getCandidate360`), and the Phase 7E.2 design baseline.

The staff interface is designed as an operational assessment workstation that equips specialists, team leads, managers, and administrators with a holistic understanding of:
1. Who the candidate is and what evidence corroborates their profile.
2. The reliability, provenance, and recency of their capabilities.
3. Live operational status across applications, matching, resume readiness, and post-submission outcomes.
4. Current ownership, tasks, and confidential staff governance actions.

The interface strictly upholds read-only presentation boundaries for the Candidate 360 synthesis while providing seamless action slots for authoritative mutation workflows (assignment, profile verification, lifecycle status transitions, document management, and confidential internal notes).

---

## Staff Information Architecture

The staff experience organizes information according to a clear operational hierarchy:

1. **Compact Professional Staff Header**: Name, headline, contact coordinates, experience duration, work authorization, sponsorship requirements, assigned specialist, and verification state.
2. **Operational Status Bar**: Live KPI summary across 6 operational domains (Applications, Matches, Resume Readiness, Outcomes, Evidence Depth, and Confidential Staff Context).
3. **Operational Navigation Tabs**:
   - `Career Evidence`: Filterable strengths and expandable multi-source provenance drawers.
   - `Applications`: Active pipeline, readiness states, blockers, warnings, and direct links to application workspaces.
   - `Job Matches`: Deterministic candidate-job alignments, match categories, and links to Match Desk.
   - `Timeline`: Chronological sequence of roles, projects, degrees, and certifications without inferred promotions.
   - `Strengths & Gaps`: Constructive separation of `Missing Profile Information` (data gaps) from `Uncorroborated Skills` (evidence gaps).
   - `Outcomes`: Immutable post-submission milestones (interviews, offers, declines) from the Phase 6 Outcome Ledger.
   - `Operations & Governance`: Authoritative mutation controls for specialist assignment, verification, and lifecycle state transitions.
4. **Confidential Staff Notes Widget**: Always-visible internal notes component isolated strictly from candidate view payloads.

---

## Candidate Header

- Features full candidate name, headline, location, contact coordinates (`email`, `phone`), years of experience, work authorization with sponsorship notation, verification status badge, and service mode (`Managed Mode` vs `Manual Review`).
- Highlights assigned specialist and operational team context with one-click routing to the Application Desk and Messaging channels.
- Zero raw database identifiers or internal technical hashes exposed.

---

## Operational Status

- Compact 6-metric summary bar:
  - **Applications**: Total staged/submitted count with Ready and Blocked breakdowns.
  - **Job Matches**: Relevant matches, strong matches, and saved opportunities.
  - **Resume Readiness**: Phase 4 ATS status (`ATS Optimized`, `Ready`, `Missing`) with findings counter.
  - **Outcomes**: Post-submission milestones (`Interviews`, `Offers`).
  - **Evidence Depth**: Multi-source evidenced competencies and total corroborating source entities.
  - **Staff Context**: Confidential internal notes counter and active tasks count.
- Zero fake health scores, synthetic SLA trackers, or artificial risk algorithms.

---

## Career Evidence

- Directly consumes Phase 7C deterministic output:
  - `Core Competencies` (corroborated across $\ge 2$ independent entities with recent activity)
  - `Strong Capabilities` (corroborated across $\ge 2$ independent entities)
  - `Emerging Skills` (supported by 1 recorded entity)
- Staff-safe provenance drawers detail exact supporting entities (Work Experiences, Projects, Certifications, Profile Declarations, Resume Extracts) with recency indicators and verification flags.
- Raw extracted resume text is strictly prohibited.

---

## Verification / Attestation

- Displays verified credential status and verification history.
- Integrates authoritative mutation form (`verifyCandidateAction`) enabling specialists to record verification decisions and candidate-visible correction notes without corrupting read-only 360 boundaries.

---

## Resume Intelligence

- High-level Phase 4 ATS readiness label, status, summary, findings count, document title, and review timestamp.
- Direct navigation link to Document Vault and Resume Review.
- Zero parser dumps, logs, or private bucket URLs exposed.

---

## Application Intelligence

- Compact summary of active applications:
  - Ready for submission
  - Blocked (requiring action)
  - Warnings
- Detailed table of recent applications showing Job Title, Company, Status Badge, Readiness State, Blockers/Warnings count, and deep link to `/employee/applications/[id]`.

---

## Job Matching

- Contextual match breakdown: Total relevant, strong matches, good matches, saved, and requested opportunities.
- Top matches list with remote mode, match category, and link to Match Desk.
- Zero internal matching score weights or ranking algorithms exposed.

---

## Career Timeline

- Chronological vertical timeline derived from Phase 7C service.
- Integrates Work Experiences, Projects, Education, and Certifications.
- Filterable by entity type.
- Preserves exact historical dates with zero inferred promotions, seniority leaps, or success speculation.

---

## Strengths & Gaps

- Distinguishes:
  1. `Missing Profile Information` (`DATA_GAP`): Missing contact links or profile fields.
  2. `Uncorroborated Skills` (`EVIDENCE_GAP`): Declared skills lacking multi-source corroboration.
- Language is constructive and specialist-focused (e.g., *"Request candidate to link an infrastructure project demonstrating Terraform."*).

---

## Outcome History

- Authoritative display of post-submission events recorded in the Phase 6 Outcome Ledger:
  - Recruiter contacts
  - Interview requests
  - Interviews scheduled
  - Offers received
  - Employer declines
- Distinguishes candidate-visible updates from staff-only records.
- Zero inferred "No response" states.

---

## Task Context

- Displays active operational tasks linked to the candidate with category, priority, assignee, status, and direct link to task execution.

---

## Staff Notes

- Confidential `InternalNotesWidget` mounted on the staff workstation.
- Strictly isolated from candidate-facing DTOs and never treated as skill evidence.

---

## Ownership

- Displays assigned specialist, team context, and service authorization mode.
- Operational assignment form (`assignCandidateAction`) enables seamless re-assignment with audit logging.

---

## Security

- Role-based server-side enforcement: accessible only by `EMPLOYEE`, `TEAM LEAD`, `MANAGER`, and `ADMIN`.
- Candidate accounts attempting to access `/employee/candidates/[id]` fail closed with redirection / 404.
- Cross-tenant candidate access is blocked by RLS context enforcement (`organizationId` scoping).

---

## Candidate Redaction

- Confidential staff notes, internal task counts, staff-only outcome events, and verification notes are never leaked into candidate-facing DTOs or client payloads.

---

## Responsive Verification

- Verified across all viewport widths:
  - Mobile: `320px`, `375px`, `390px`, `430px` (single column, touch-friendly tab navigation, zero horizontal overflow).
  - Desktop: `1280px`, `1440px`, `1920px` (dense, high-efficiency operational assessment workstation).

---

## Accessibility

- Target: WCAG 2.1 AA.
- Semantic headings (`<h1>` through `<h3>`), `<header>`, `<section aria-labelledby="...">`, `<nav aria-label="...">`.
- Full keyboard navigability (`Enter` and `Space` for expanding evidence drawers).
- Non-color-only status badges with explicit text.

---

## Hydration

- 0 hydration mismatches across direct page loads, soft tab transitions, and browser refreshes.

---

## Performance

- Single server-side composition call (`getCandidate360`) with zero client-side data waterfalls.

---

## Browser Verification

- Verified in browser with authenticated employee and admin roles.
- Console status: 0 errors, 0 warnings.

---

## Tests

- Staff UI Component Unit Tests: `tests/unit/candidate-360/phase7e3-staff-candidate-360-ui.test.ts` (6/6 passing).
- Candidate UI Component Unit Tests: `tests/unit/candidate-360/phase7e2-candidate-360-ui.test.ts` (8/8 passing).
- Candidate 360 Composition Tests: `tests/unit/candidate-360/phase7e1-candidate-360.test.ts` (9/9 passing).
- Total Candidate 360 tests: **23/23 passing**.
- Phase 3 projects & career profile tests: **6/6 passing**.

---

## Regression

- All existing career intelligence, matching, resume intelligence, and application workflows verified with zero regressions.

---

## Typecheck

```bash
npm run typecheck
# Result: 0 errors (Exit code 0)
```

---

## Lint

```bash
npm run lint
# Result: 0 errors, 0 warnings (Exit code 0)
```

---

## Build

```bash
npm run build
# Result: Compiled successfully in 5.2s, 40 static & dynamic routes generated (Exit code 0)
```

---

## Schema Changes

- **NONE** (Zero database schema changes).

---

## Migration Changes

- **NONE** (Zero Prisma migrations created).

---

## Upstream Changes

- **NONE** (Zero modifications to Phase 2, 4, 5, 6, 7C, 7E.1 services).

---

## Known Findings

- None. Staff Candidate 360 UI is clean, robust, and completely aligned with the Phase 7D / 7D.1 / 7E.3 specifications.

---

## Final Decision

**COMPLETE — READY FOR 7E.4 VERIFICATION**
