# PHASE 7D.1 — DECISION LOCK REPORT

## Contract
- **Authoritative Contract:** [`docs/engineering/PHASE_7D_CANDIDATE_360_PRODUCT_CONTRACT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_7D_CANDIDATE_360_PRODUCT_CONTRACT.md)
- **Status:** `PRODUCT CONTRACT FROZEN`
- **Decision Lock:** `D1–D20 ACCEPTED`
- **Implementation Status:** `AUTHORIZED FOR PHASE 7E`

---

## Decisions D1–D20

| ID | Topic | Locked Rule |
|---|---|---|
| **D1** | Primary Audience | Dual-persona: Candidate (Self-Knowledge) & Staff (Operational Assessment). |
| **D2** | Navigation Placement | Candidate: Candidate Career / Candidate Profile surface; Staff: Employee Candidate detail surface. |
| **D3** | Candidate Sections | Overview, Core Strengths, Evidence Hub, Career Timeline, Actionable Gaps, Career Direction, Outcome History. |
| **D4** | Staff Sections | Candidate sections plus Verification / Attestation, Task Overview, Staff Notes, ATS Readiness. |
| **D5** | Evidence Terminology | VERIFIED: *"Verified Credential"*; EVIDENCED: *"Supported by multiple records"*; SELF_DECLARED: *"Added to profile"*; SYSTEM_DERIVED: *"Found in resume"*. |
| **D6** | Strength Terminology | CORE: *"Core Competencies"*; STRONG: *"Strong Capabilities"*; EMERGING: *"Emerging Skills"*. |
| **D7** | Gap Terminology | DATA_GAP: *"Missing Profile Information"*; EVIDENCE_GAP: *"Uncorroborated Skills"*. Never imply incompetence. |
| **D8** | Timeline | Chronological vertical timeline combining Experience, Projects, Education, and Certifications. No inferred promotions. |
| **D9** | Career Direction | Dedicated goals section. Only explicit candidate preferences. Never infer ambition from applications, rejections, matches, interviews, or offers. |
| **D10** | Resume Intelligence | Summary only. Candidate 360 does not duplicate Phase 4. Detailed Resume Review remains authoritative. |
| **D11** | Application Intelligence | Summary/readiness indicator only. Detailed Application Intelligence remains authoritative. |
| **D12** | Job Matching | Summary of relevant match state. Detailed matching remains authoritative. |
| **D13** | Outcomes | Show post-submission outcome history. Never use outcomes as skill evidence. |
| **D14** | Freshness | Use existing sourceDataVersion/freshness semantics. Do not create another freshness system. |
| **D15** | Conflict | Canonical candidate truth remains authoritative. Conflicts with derived/advisory sources are surfaced, never silently overwritten. |
| **D16** | Mobile | Single-column. Progressive disclosure. Target viewports: 320px, 375px, 390px, 430px; Desktop: 1280px, 1440px, 1920px. |
| **D17** | Progressive Disclosure | Summary first. Evidence/provenance/details on expansion. Do not overload initial screen. |
| **D18** | Redaction | Candidate payload must exclude raw resume extracted text, staff internal notes, security metadata, and unnecessary internal IDs. |
| **D19** | Performance | Bounded reads, selective projections, parallel reads where safe, no graph database, no giant persisted Candidate 360 object, no duplicate domain storage. |
| **D20** | Read-Only Boundary | **Candidate 360 is strictly READ-ONLY.** It must never directly create, update, or delete candidate facts, skills, experience, projects, certifications, resume intel, matching, or outcomes. |

---

## Authority Boundaries
- **Profile & Career Facts:** Authoritative in Candidate domain (`Candidate`, `CandidateExperience`, `CandidateSkill`, etc.).
- **Career Evidence:** Authoritative in Phase 7C (`src/lib/career/`).
- **ATS Resume Intelligence:** Authoritative in Phase 4 (`ResumeReview`).
- **Application Readiness & Alignment:** Authoritative in Phase 2 (`ApplicationReadinessResult`).
- **Job Matching:** Authoritative in Phase 5 (`CandidateJobMatch`).
- **Outcome Ledger:** Authoritative in Phase 6 (`ApplicationOutcomeEvent`).
- **Candidate 360:** Composition and presentation layer only.

---

## Security Boundary
- Multi-tenant isolation enforced via `organizationId: ctx.organizationId`.
- Role-based scoping: Candidate (own record only via `userId`), Employee/Admin (authorized organizational scopes).
- Strict data redaction: raw parsed resume text and internal staff commentary are never leaked in candidate payloads.

---

## Read-Only Boundary
- Candidate 360 is 100% read-only.
- Zero mutation endpoints or direct database writes through the Candidate 360 composition layer.

---

## Performance Boundary
- Parallel bounded reads via `withRlsContext` and `Promise.all`.
- Selective field projections avoiding heavy text blobs.
- Zero graph databases or duplicate persisted models ($<100\text{ms}$ execution target).

---

## Explicit Non-Goals
- Zero database tables, zero migrations, zero schema changes.
- Zero AI narrative generation, synthetic biographies, or ungrounded assertions.
- Zero vector embeddings or semantic distance clustering.
- Zero synthetic 0–100 candidate ranking scores.
- Zero mutation of candidate facts through Candidate 360 view models.

---

## Repository Changes
- Created: [`docs/engineering/PHASE_7D_CANDIDATE_360_PRODUCT_CONTRACT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_7D_CANDIDATE_360_PRODUCT_CONTRACT.md)
- Created: [`docs/engineering/PHASE_7D1_DECISION_LOCK_REPORT.md`](file:///Users/balakrishna/apply_citrux/docs/engineering/PHASE_7D1_DECISION_LOCK_REPORT.md)

---

## Schema Changes
NONE

---

## Migration Changes
NONE

---

## Code Changes
NONE

---

## UI Changes
NONE

---

## Verification
- Phase 7B contract remains unchanged.
- Phase 7C implementation remains unchanged.
- Phase 7D contract contains complete D1–D20 decision lock.
- `git diff --check` executed with zero errors.
- `git status --short` verified.

---

## Final Decision
**PHASE 7D.1 — ACCEPTED / FROZEN**

**NEXT:**
**PHASE 7E — CANDIDATE 360 IMPLEMENTATION**
