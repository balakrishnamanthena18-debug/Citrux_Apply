# PHASE 7D — CANDIDATE 360 & CAREER INTELLIGENCE PRODUCT CONTRACT

**Status:** PRODUCT CONTRACT FROZEN  
**Decision Lock:** D1–D20 ACCEPTED  
**Implementation:** AUTHORIZED FOR PHASE 7E  
**Domain:** Candidate 360 & Cross-Domain Career Intelligence Composition  
**Type:** Authoritative Product & Architectural Contract  
**Upstream Dependencies:**
- Phase 2 — Application Intelligence (ACCEPTED / FROZEN)
- Phase 3 — Projects & Career Profile (ACCEPTED / FROZEN)
- Phase 4 — ATS & Resume Intelligence (ACCEPTED / FROZEN)
- Phase 5 — Job Intelligence & Candidate Matching (ACCEPTED / FROZEN)
- Phase 6 — Outcome Ledger & Reporting (ACCEPTED / FROZEN)
- Phase 7A — Candidate Career Intelligence Forensic Audit (ACCEPTED / FROZEN)
- Phase 7B / 7B.1 — Career Intelligence Product Contract & Decision Lock (FROZEN)
- Phase 7C — Deterministic Career Evidence Service (ACCEPTED / FROZEN)

---

## 1. Executive Summary & Purpose

The Operations Operating System (OOS) requires a unified, coherent **Candidate 360** composition layer that answers:
> **"What can a candidate and an authorized staff member reliably, transparently, and comprehensively understand about a candidate's complete career profile, operational progress, and evidence backing from a single surface?"**

### Core Principles
1. **Read-Only Composition Layer:** Candidate 360 does **not** store duplicate career facts, scores, or states. It is a pure, server-side projection that composes facts from underlying authoritative domain subsystems.
2. **Strict Authority Isolation:** Underlying domains remain the sole authoritative systems of record for their respective entities:
   - Profile & Career Facts $\to$ `Candidate` & child tables (`CandidateExperience`, `CandidateSkill`, etc.)
   - Evidence & Capabilities $\to$ Phase 7C Deterministic Career Evidence Service
   - Resume ATS & Representation $\to$ Phase 4 Resume Review Engine
   - Application Readiness & Alignment $\to$ Phase 2 Application Intelligence Engine
   - Pre-Application Fit $\to$ Phase 5 Candidate Job Matching Engine
   - Post-Submission Outcomes $\to$ Phase 6 Immutable Outcome Ledger
3. **No Synthetic Black Boxes:** Zero 0–100 overall career scores, zero artificial percentiles, zero star ratings, and zero AI-generated biographies. All summaries are deterministic and evidence-backed.
4. **Role-Tailored Perspectives:** Clear separation between candidate self-reflection/empowerment views and staff operational readiness/verification views.

---

## 2. Existing Domain Inventory

| Domain / Subsystem | Authoritative Entity Models | Nature of Data | Candidate Visibility | Staff Visibility | Internal / Redacted Items |
|---|---|---|---|---|---|
| **Identity & Contact** | `Candidate`, `User` | Authoritative Truth | Full (Own) | Full (Assigned/Org) | Internal DB IDs |
| **Work Experience** | `CandidateExperience` | Authoritative Truth | Full (Own) | Full (Assigned/Org) | None |
| **Education** | `CandidateEducation` | Authoritative Truth | Full (Own) | Full (Assigned/Org) | None |
| **Skills** | `CandidateSkill` | Authoritative Self-Declaration | Full (Own) | Full (Assigned/Org) | None |
| **Projects** | `CandidateProject` | Authoritative Truth | Full (Own) | Full (Assigned/Org) | None |
| **Certifications** | `CandidateCertification` | Authoritative Truth | Full (Own) | Full (Assigned/Org) | None |
| **Documents / Resumes** | `CandidateDocument` | Authoritative Storage | Full (Own) | Full (Assigned/Org) | Storage paths, raw buckets |
| **Resume Extracts** | `CandidateDocumentExtract` | Derived / Advisory | None (Raw text) | Advisory only | Raw extracted text (`extractedText`) |
| **Resume Review (Phase 4)** | `ResumeReview` | System-Derived Advisory | Summary / Scores | Full Analysis | Debug parser logs |
| **Fact Attestations** | `CandidateFactAttestation` | Authoritative Verification | Verification Badge | Full + Notes | Staff notes, author IDs |
| **App Readiness (Phase 2)** | `ApplicationReadinessResult`, `ApplicationAlignmentResult` | System-Derived Readiness | Readiness Summary | Full Diagnostics | Algorithmic debug payload |
| **Job Matches (Phase 5)** | `CandidateJobMatch`, `Job` | System-Derived Matching | Match Category / Leads | Full Match Context | Internal match rank/scores |
| **Outcome Ledger (Phase 6)** | `ApplicationOutcomeEvent` | Immutable Append-Only Ledger | Safe outcome status | Full + Private notes | Staff internal notes, void reasons |
| **Tasks & Escalations** | `Task` | Operational Workflow | None | Full (Assigned/Org) | Internal task assignments |
| **Messages & Comms** | `Conversation`, `Message` | Operational Communication | Participant only | Full (Org) | Private staff notes |
| **Privacy & GDPR** | `PrivacyRequest` | Compliance Audit | Own Requests | Full (Admin) | Verification hashes |

---

## 3. Domain Authority Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CANDIDATE 360                                    │
│                    (Read-Only Composition Surface)                          │
└──────┬────────────┬────────────┬────────────┬────────────┬───────────┬──────┘
       │            │            │            │            │           │
       ▼            ▼            ▼            ▼            ▼           ▼
┌─────────────┐┌───────────┐┌───────────┐┌───────────┐┌──────────┐┌───────────┐
│   Profile   ││  Career   ││  Resume   ││App Intel  ││Job Match ││  Outcome  │
│  & Truth    ││ Evidence  ││  (Ph 4)   ││  (Ph 2)   ││  (Ph 5)  ││  Ledger   │
│ (Phase 3)   ││ (Phase 7C)││           ││           ││          ││ (Phase 6) │
└─────────────┘└───────────┘└───────────┘└───────────┘└──────────┘└───────────┘
```

- **Conflict Principle:** Candidate 360 never resolves conflicts by overwriting underlying records. If profile data and parsed resume text diverge, Candidate 360 displays the canonical candidate profile truth while presenting resume discrepancies as advisory review guidance.

---

## 4. Candidate Experience Specification

### 4.1 Primary Hierarchy & Navigation
The Candidate experience is structured for clarity, self-knowledge, and actionable empowerment:
1. **Hero & Career Snapshot:** High-level career overview (headline, total years experience, verified credentials badge, top strengths summary).
2. **Career Strengths & Evidence Hub:**
   - Skills categorized into Core Competencies, Strong Capabilities, and Emerging Skills.
   - Expandable evidence cards showing supporting experiences, projects, certifications, and advisory resume matches.
3. **Career Timeline:** Interactive chronological sequence of roles, projects, degrees, and certifications.
4. **Actionable Areas to Strengthen (Gaps):** Constructive, objective gap cards highlighting missing profile details or opportunities to add project evidence for uncorroborated skills.
5. **Career Direction & Preferences:** Stated target roles, locations, remote preferences, and salary expectations (explicitly isolated from past applications).
6. **Active Applications & Outcomes:** Post-submission milestone history (e.g. *"Interview requested"*, *"Offer received"*).

### 4.2 Progressive Disclosure & Copywriting
- Complex evidence provenance is tucked into expandable inline drawers/sheets rather than cluttering initial view.
- Language is strictly positive, objective, and evidence-grounded:
  - *"Corroborated by multiple records"*
  - *"Verified Credential"*
  - *"Missing Profile Information"* / *"Uncorroborated Skills"* (never *"You don't know Docker"*).

---

## 5. Staff Experience Specification

### 5.1 Operational Focus & Capabilities
Authorized staff (Employees, Team Leads, Managers, Admins) view Candidate 360 as an operational candidate assessment and readiness cockpit:
1. **Candidate Verification & Integrity Header:** Verification status badge, work authorization status, assigned specialist, and identity confirmation.
2. **Candidate 360 Evidence Matrix:**
   - Visual breakdown of verified facts vs. evidenced vs. self-declared skills.
   - Direct access to staff fact attestation tools.
3. **Operational Application & Task Overview:** Summary of active staged applications, QA status, assigned tasks, and escalations.
4. **Outcome Intelligence Ledger:** Post-submission interview, offer, and rejection history with internal staff timeline.
5. **Resume & Job Match Overview:** Current default resume ATS readiness score, open matches, and custom opportunities.

### 5.2 Redaction & Safety Boundaries
- Staff see internal notes, task dependencies, and attestation author IDs.
- Candidates **never** see internal staff commentary, task assignment internals, or private diagnostic logs.

---

## 6. Evidence Presentation & Terminology

### 6.1 Terminology Mapping (Decision Lock D5 / D6)

| Authority Level | Candidate-Facing Terminology | Staff-Facing Terminology | Visual Treatment |
|---|---|---|---|
| **`VERIFIED`** | *"Verified Credential"* | *"Verified (Staff Attestation)"* | Emerald Badge with Shield Icon |
| **`EVIDENCED`** | *"Supported by multiple records"* | *"Evidenced ($\ge 2$ Independent Entities)"* | Indigo / Blue Badge with Multi-Link Icon |
| **`SELF_DECLARED`** | *"Added to profile"* | *"Self-Declared (Uncorroborated)"* | Slate / Neutral Badge |
| **`SYSTEM_DERIVED`** | *"Found in resume"* (Advisory) | *"Advisory Extract Match"* | Purple / Amber Dotted Badge |

### 6.2 Prohibitions
- No numeric confidence meters (e.g. *"87% verified"*).
- No 5-star ratings or skill level gauges.
- No cross-candidate relative ranking percentiles.

---

## 7. Strength Presentation

Capabilities are grouped deterministically according to the Phase 7B/7C classification:
- **Core Competencies (`CORE`):** Capabilities supported by $\ge 3$ distinct sources with recent professional application (within 36 months).
  - Copy: *"Core Competencies — Corroborated across work experience and projects with recent active use."*
- **Strong Capabilities (`STRONG`):** Capabilities corroborated across $\ge 2$ distinct sources.
  - Copy: *"Strong Capabilities — Corroborated across multiple profile records."*
- **Emerging Skills (`EMERGING`):** Supported by 1 source (e.g. standalone project or profile entry).
  - Copy: *"Emerging Skills — Recorded in 1 project or profile entry."*

---

## 8. Gap Presentation & Guardrails

Candidate 360 presents gaps strictly as constructive opportunities:
- **`DATA_GAP` (Missing Profile Information):**
  - Example: *"No project portfolio items are currently recorded."*
  - Recommendation: *"Add projects demonstrating technologies and real-world outcomes to strengthen evidence."*
- **`EVIDENCE_GAP` (Uncorroborated Skills):**
  - Example: *"No supporting experience or project evidence was found for Rust in the active profile."*
  - Recommendation: *"Add work experience or a project detailing how Rust was applied in practice."*
- **Strict Copywriting Guardrails:**
  - Forbidden: *"You don't know X"*, *"Missing prerequisite"*, *"Candidate is unqualified"*, *"Weak at X"*.

---

## 9. Career Timeline Specification

- **Composition:** Assembles chronologically descending events across:
  - Work Experience (`startDate`, `endDate`, `isCurrent`, `jobTitle`, `companyName`, `technologies`)
  - Projects (`startDate`, `endDate`, `title`, `role`, `technologies`, `url`)
  - Education (`startDate`, `endDate`, `graduationYear`, `institution`, `degree`, `fieldOfStudy`)
  - Certifications (`issueDate`, `expirationDate`, `doesNotExpire`, `name`, `issuingAuthority`)
- **Guardrails:** Every timeline item links directly to its underlying record. No promotions, seniority leaps, or career arcs are inferred.

---

## 10. Career Direction & Preference Isolation

- **Authoritative Source:** Explicit candidate preferences (`targetRoles`, `targetLocations`, `remotePreference`, `desiredSalaryMin/Max`).
- **Strict Boundary:** Candidate 360 presents career ambition under a dedicated goals section. Past applications, rejections, or job matches must **never** be used to alter or infer target career ambition.

---

## 11. Subsystem Integration Boundaries

| Subsystem | Candidate 360 Interaction & Display Policy |
|---|---|
| **Phase 4 Resume Intelligence** | Displays summary badge of default resume readiness (e.g. *"Resume Readability: Strong"*). Links directly to detailed Resume Review page. Does not duplicate full ATS audit. Detailed Resume Review remains authoritative. |
| **Phase 2 Application Intelligence** | Displays high-level application readiness indicators (e.g. *"Readiness: Ready to Submit"*, *"1 Blocker"*). Links to Application Detail view. Does not recalculate alignment. Detailed Application Intelligence remains authoritative. |
| **Phase 5 Job Matching** | Displays current match count and saved opportunities. Links to Job Matching feed. Does not execute matching queries inline. Detailed matching remains authoritative. |
| **Phase 6 Outcome Ledger** | Displays historical outcome events (`INTERVIEW_REQUESTED`, `OFFER_RECEIVED`, `EMPLOYER_REJECTION`). Strictly forbidden from treating outcomes as technical skill evidence. |

---

## 12. Freshness & Staleness Management

- Reuses the Phase 7C `sourceDataVersion` SHA-256 fingerprint computed across candidate timestamps.
- **Freshness States:**
  - `FRESH`: All underlying records match the latest computed fingerprint.
  - `STALE`: An underlying career entity, resume extract, or attestation has updated since last evaluation.
  - `UNKNOWN`: Insufficient timestamp data.
- UI displays a subtle non-blocking status indicator (e.g., *"Evidence updated 2 hours ago"*).

---

## 13. Conflict Handling Policy

- If a candidate declares a skill in `CandidateSkill` that contradicts extracted resume text or job requirement matching:
  - The canonical profile record remains authoritative candidate truth.
  - The discrepancy is surfaced as an advisory note in the evidence breakdown (*"Skill declared in profile; not detected in current default resume extract"*).
  - The system **never** silently modifies or deletes user-entered facts.

---

## 14. Security & Tenant Authorization (RBAC)

1. **Multi-Tenant Isolation:** All underlying data loaders filter on `organizationId: ctx.organizationId`.
2. **Role Authorization:**
   - **Candidate (`Role.CANDIDATE`):** Access restricted to `candidate.userId === ctx.userId`. Forged IDs return `AuthorizationError`.
   - **Employee (`Role.EMPLOYEE`):** Access restricted to candidates assigned to the employee or with active applications within the organization.
   - **Team Lead / Manager (`Role.EMPLOYEE` with structural lead/manager flags):** Structural team and direct-report scopes.
   - **Admin (`Role.ADMIN`):** Full organizational candidate access.
3. **Data Redaction:**
   - Raw parsed resume text (`CandidateDocumentExtract.extractedText`) is never sent to the client.
   - Internal staff notes (`internalNotes`, `factAttestation.note`, `task` internal assignments) are stripped from candidate payloads.

---

## 15. Mobile & Responsive UX Specification

- **Responsive Viewport Targets:** 320px, 375px, 390px, 430px (mobile) through 1280px, 1440px, 1920px (desktop).
- **Mobile Hierarchy:**
  1. Sticky Candidate Header (Name, Headline, Verification Badge).
  2. Quick Stats Carousel (Total Experience, Core Strengths count, Staged Applications).
  3. Priority Gaps Card (Collapsible).
  4. Core Strengths & Evidenced Skills List.
  5. Chronological Timeline (Vertical Stepper).
  6. Career Direction & Preferences.
- **Progressive Disclosure:** Expandable accordions for detailed evidence sources to avoid endless mobile scrolling.

---

## 16. Accessibility Specification (WCAG 2.1 AA)

- Semantic HTML structure (`<main>`, `<header>`, `<section>`, `<article>`, `<nav>`).
- Heading hierarchy ($H_1 \to H_2 \to H_3$) without skipped levels.
- Non-color-only state communication (every status badge includes explicit text labels and iconography with `aria-label`).
- Keyboard navigability: All expandable evidence drawers and tooltips must be operable via `Tab`, `Enter`, `Space`, and `Escape`.
- High contrast color ratios ($\ge 4.5:1$ for normal text, $\ge 3:1$ for large text and UI components).

---

## 17. Performance & Loading Strategy

- **Selective Server-Side Projection:** Fetch only necessary columns; exclude heavy blobs (`extractedText`, full JD descriptions).
- **Parallel Independent Reads:** Execute underlying model queries in parallel via `Promise.all`.
- **Subsystem Decoupling:** Subsystem details (full Resume Review diagnostics, full Application Readiness breakdowns) are fetched on-demand or behind separate route links.
- **Zero Heavy Graph Databases:** Graph relationships are derived deterministically in memory ($O(N)$ execution time).

---

## 18. Decision Table D1–D20 (Decision Lock)

| ID | Decision Topic | Frozen Product Rule | Rationale |
|---|---|---|---|
| **D1** | Primary Audience | Dual-persona surface: Candidate (Self-Knowledge) and Staff (Operational Assessment). | Maximizes platform utility without creating bifurcated, inconsistent data representations. |
| **D2** | Navigation Placement | Candidate: Candidate Career / Candidate Profile surface; Staff: Employee Candidate detail surface. | Seamlessly integrates into existing dashboard route architectures without inventing unvetted routes. |
| **D3** | Candidate-Facing Sections | Overview, Core Strengths, Evidence Hub, Career Timeline, Actionable Gaps, Career Direction, Outcome History. | Provides a 360-degree holistic career view without overwhelming the candidate. |
| **D4** | Staff-Facing Sections | Candidate sections plus Verification / Attestation tools, Task Overview, Staff Notes, and ATS Readiness. | Equips staff for rapid operational decision-making. |
| **D5** | Evidence Terminology | VERIFIED: *"Verified Credential"*; EVIDENCED: *"Supported by multiple records"*; SELF_DECLARED: *"Added to profile"*; SYSTEM_DERIVED: *"Found in resume"*. | Avoids technical jargon and eliminates artificial AI confidence metrics. |
| **D6** | Strength Terminology | CORE: *"Core Competencies"*; STRONG: *"Strong Capabilities"*; EMERGING: *"Emerging Skills"*. | Provides intuitive, evidence-grounded capability tiers. |
| **D7** | Gap Terminology | DATA_GAP: *"Missing Profile Information"*; EVIDENCE_GAP: *"Uncorroborated Skills"*. Never imply incompetence. | Encourages profile enhancement without implying personal incompetence. |
| **D8** | Timeline Presentation | Chronological vertical timeline combining Experience, Projects, Education, and Certifications. No inferred promotions. | Clear temporal context without fabricating promotion trajectories. |
| **D9** | Career Direction | Dedicated goals section. Only explicit candidate preferences. Never infer ambition from applications, rejections, matches, interviews, or offers. | Separates historical achievements from future ambitions. |
| **D10** | Resume Intel Boundary | Summary only. Candidate 360 does not duplicate Phase 4. Detailed Resume Review remains authoritative. | Avoids duplicating complex ATS scoring and analysis engines. |
| **D11** | App Intel Boundary | Summary/readiness indicator only. Detailed Application Intelligence remains authoritative. | Preserves Phase 2 application-specific evaluation authority. |
| **D12** | Job Match Boundary | Summary of relevant match state. Detailed matching remains authoritative. | Preserves Phase 5 matching pipeline authority. |
| **D13** | Outcome Boundary | Show post-submission outcome history. Never use outcomes as skill evidence. | Prevents hiring market outcomes from being misconstrued as technical proficiency. |
| **D14** | Freshness Policy | Use existing sourceDataVersion/freshness semantics. Do not create another freshness system. | Informs users of data currency without blocking interaction. |
| **D15** | Conflict Policy | Canonical candidate truth remains authoritative. Conflicts with derived/advisory sources are surfaced, never silently overwritten. | Maintains deterministic integrity without silent record overwrites. |
| **D16** | Mobile Hierarchy | Single-column. Progressive disclosure. Target: 320, 375, 390, 430px. Desktop: 1280, 1440, 1920px. | Ensures optimal usability across all screen sizes. |
| **D17** | Progressive Disclosure | Summary first. Evidence/provenance/details on expansion. Do not overload the initial screen. | Prevents cognitive overload while preserving full auditability. |
| **D18** | Redaction Policy | Candidate payload must exclude raw resume extracted text, staff internal notes, security metadata, and unnecessary internal IDs. | Enforces strict role privacy and organizational security. |
| **D19** | Performance Strategy | Bounded reads, selective projections, parallel reads where safe, no graph database, no giant persisted Candidate 360 object, no duplicate domain storage. | Delivers $<100\text{ms}$ server-side response times. |
| **D20** | Read-Only Boundary | **Candidate 360 is strictly READ-ONLY.** It must never directly create, update, or delete candidate facts, skills, experience, projects, certifications, resume intel, matching, or outcomes. | Eliminates data mutation conflicts and parallel truth authoring. |

---

## 19. Explicit Non-Goals

The following items are **strictly excluded** from Candidate 360:
- Writing new truth directly through the Candidate 360 composition layer (mutations happen in domain-specific actions).
- AI/LLM narrative generation or synthetic biography writing.
- Vector embeddings or semantic skill clustering.
- Synthetic 0–100 candidate ranking scores.
- Automated third-party background check integrations.
- New database tables or Prisma migrations.

---

## 20. Acceptance Criteria

1. **100% Read-Only Composition:** Zero persistence or mutation logic within Candidate 360 view models.
2. **Subsystem Decoupling:** Zero interference with Phase 2, 4, 5, or 6 contracts.
3. **Multi-Tenant Security:** 100% isolation across organization boundaries with role-scoped access control.
4. **Data Redaction:** Zero exposure of raw extracted resume strings or internal staff notes to candidates.
5. **Zero Schema Alterations:** Implemented entirely using existing active Prisma models and the Phase 7C service layer.
