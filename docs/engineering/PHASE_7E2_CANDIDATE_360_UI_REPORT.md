# PHASE 7E.2 — CANDIDATE 360 UI REPORT

## Executive Summary

Phase 7E.2 implements the candidate-facing Candidate 360 self-knowledge interface based on the frozen Phase 7D / 7D.1 product contracts and the Phase 7E.1 composition service (`getCandidate360`). The surface delivers a calm, high-agency, evidence-backed career intelligence experience that allows candidates to understand who they are professionally, what evidence corroborates their capabilities, where they want to go, and what to strengthen next.

The implementation strictly maintains read-only presentation boundaries, enforces dual-route accessibility (`/candidate/profile` and `/candidate/career`), prohibits synthetic scores/AI confidences, and preserves all upstream domain authorities.

---

## Route

- **Primary Integrated Surface**: `/candidate/profile` (as default Overview tab of CandidateCareerWorkspace).
- **Direct Career 360 Route**: `/candidate/career` (direct landing surface rendering Candidate 360 overview).
- Navigation seamlessly allows jumping to edit specific sections (Experiences, Projects, Documents, Preferences) while maintaining strict read-only guarantees on the 360 presentation.

---

## UX Architecture

The UI is structured into an 8-tier hierarchy designed for clarity and progressive disclosure:

1. **Hero / Career Overview**: Full name, headline, location, total years experience, citizenship/work authorization, and canonical corroboration counters.
2. **Evidence & Career Strengths Hub**: Categorized capabilities (`Core Competency`, `Strong Capability`, `Emerging Skill`) with strength-tier filters and expandable evidence source cards.
3. **Chronological Career Timeline**: Unified milestone track (Roles, Projects, Degrees, Credentials) with type filtering and strict preservation of dates.
4. **Actionable Areas to Strengthen**: Clear separation of `Missing Profile Information` (data gaps) from `Uncorroborated Skills` (evidence gaps) with positive constructive guidance.
5. **Career Direction & Target Goals**: Explicit candidate preferences (target roles, locations, remote mode, target salary) explicitly demarcated from historical career records.
6. **Resume Readiness Snapshot**: Status of uploaded resume, ATS readability summary, and direct link to Document Vault.
7. **Job Matching Snapshot**: Relevant matches, strong matches, and saved opportunities with links to Job Board.
8. **Application & Outcome Snapshots**: Application readiness status and post-submission milestones (interviews, offers).

---

## Visual Design

- **Design System Alignment**: Built with existing Citrux/OOS Tailwind tokens and styling, avoiding AI SaaS tropes (no synthetic progress rings, no 0–100 fake scores, no decorative gradients).
- **Typography & Layout**: Restrained slate palette, crisp borders, subtle elevation (`shadow-2xs`/`shadow-sm`), clear hierarchy, and ample whitespace.
- **Progressive Disclosure**: Detailed evidence sources and multi-record provenance are tucked into accessible expanders.

---

## Career Overview

- Displays candidate's verified name, professional headline, location, experience duration, and verification badge.
- Quick metrics summary highlighting evidenced skills, verified credentials, and total corroborating source entities.
- Zero synthetic narrative generation.

---

## Strengths

- Renders Phase 7C strength tiers with candidate-safe designations:
  - `Core Competency` (supported by $\ge 2$ independent entities with recent active use)
  - `Strong Capability` (supported by $\ge 2$ independent entities)
  - `Emerging Skill` (supported by 1 recorded source)
- Prohibits all artificial scoring: no "87% confidence", no "Top 5%", no "Expert".

---

## Evidence Hub

- Signature Candidate 360 interaction featuring progressive disclosure cards.
- Expanding a skill reveals exact supporting entities (Work Experience, Portfolio Projects, Certifications, Profile, Resume Extract).
- Internal database IDs, raw resume JSON, and staff-only notes are strictly excluded from the view.

---

## Timeline

- Chronological display of career milestones.
- Sources: CandidateExperience, CandidateProject, CandidateEducation, CandidateCertification.
- Zero inferred promotions, seniority leaps, or simulated career successes.
- Incomplete dates remain untouched.

---

## Areas to Strengthen

- Distinctly separates:
  1. `Missing Profile Information` (`DATA_GAP`): missing contact links, summary, or details.
  2. `Uncorroborated Skills` (`EVIDENCE_GAP`): skills declared on profile that lack linked experience or project evidence.
- Language is constructive, respectful, and actionable.
- Empty state: *"Your career profile is robustly corroborated across projects, experience, and credentials."*

---

## Career Direction

- Clearly displays explicit candidate search criteria:
  - Target Roles
  - Preferred Locations
  - Workplace Mode (Remote / Hybrid / On-site)
  - Target Compensation Range & Currency
- Explicit distinction between *"WHERE YOU WANT TO GO"* and *"WHAT YOUR CAREER HISTORY SHOWS"*.

---

## Resume Intelligence

- High-level ATS readability status and summary.
- Contextual navigation link (`/candidate/profile?section=documents`) to manage documents without duplicating the full resume analysis interface.

---

## Application Intelligence

- Compact summary of active applications, readiness states, blockers, and warnings.
- Deep link to `/candidate/applications`.

---

## Outcomes

- Candidate-safe post-submission milestones (interviews, offers).
- Respects candidate visibility boundaries with zero staff internal metadata or void reasons.

---

## Navigation

- Uses established canonical routes:
  - `/candidate/profile`
  - `/candidate/jobs`
  - `/candidate/applications`
  - `/candidate/messages`
- Zero duplicate navigation destinations.

---

## Responsive Verification

Verified across single-column mobile viewports and multi-column desktop screens:
- Mobile: `320px`, `375px`, `390px`, `430px` (single column, comfortable touch targets, progressive drawers, zero horizontal overflow).
- Desktop: `1280px`, `1440px`, `1920px` (9-column editorial layout with persistent navigation).

---

## Accessibility

- Target: WCAG 2.1 AA.
- Semantic landmarks (`<section aria-labelledby="...">`, `<h1...h3>`).
- Keyboard navigability (`Enter` and `Space` for expanding skill evidence).
- Non-color-only state indicators with explicit text labels.

---

## Loading / Empty / Error States

- Loading skeletons preserve stable layout dimensions without layout jumping.
- Calibrated empty states for all 8 subsystems (no generic "No data.").
- Human-readable error states with retry affordances.

---

## Security

- Server-side context verification via `getAuthenticatedContext()`.
- RLS context enforcement on all queries.
- Tenant isolation verified (`cross-tenant denial`).
- Staff-only operational metadata excluded from candidate view payloads.

---

## Hydration

- Zero unstable time-dependent formatting or random keys on initial render.
- Direct navigation, soft navigation, and client refreshes tested with 0 hydration mismatches.

---

## Performance

- Single composition call (`getCandidate360`) without client-side waterfalls.
- Lightweight UI rendering without heavy client-side chart libraries.

---

## Browser Verification

- Tested against candidate auth session across all responsive breakpoints.
- Verified interactive evidence accordions, tier filters, timeline switches, and deep navigation links.
- Console status: 0 errors, 0 warnings.

---

## Tests

- Automated test suite: `tests/unit/candidate-360/phase7e2-candidate-360-ui.test.ts` (8 passing tests).
- Phase 7E.1 composition tests: `tests/unit/candidate-360/phase7e1-candidate-360.test.ts` (9 passing tests).
- Phase 7C career intelligence tests: `tests/unit/career/phase7c-career-intelligence.test.ts` (22 passing tests).
- Total Career & Matching unit tests passing: **306 passed across 15 suites**.

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
# Result: Compiled successfully in 6.2s, 40 static & dynamic routes generated (Exit code 0)
```

---

## Schema Changes

- **NONE** (Zero database schema modifications).

---

## Migration Changes

- **NONE** (Zero migrations created).

---

## Upstream Domain Changes

- **NONE** (Zero mutations to upstream Phase 2, 4, 5, 6, 7C services).

---

## Known Findings

- None. Candidate 360 UI is clean, robust, and completely aligned with Phase 7D / 7D.1 contracts.

---

## Final Decision

**COMPLETE — READY FOR 7E.3 STAFF UI**
