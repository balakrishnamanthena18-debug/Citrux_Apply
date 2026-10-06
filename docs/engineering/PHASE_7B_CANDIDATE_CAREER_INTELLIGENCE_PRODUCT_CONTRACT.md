# PHASE 7B — CANDIDATE CAREER INTELLIGENCE PRODUCT CONTRACT

**Status:** FROZEN / ACCEPTED (Phase 7B.1 Decision Lock Complete)  
**Domain:** Candidate Career Intelligence & Deterministic Career Evidence Graph  
**Type:** Authoritative Product & Architectural Contract  
**Upstream:** 
- Phase 2 — Application Intelligence (ACCEPTED / FROZEN)
- Phase 3 — Projects & Career Profile (ACCEPTED / FROZEN)
- Phase 4 — ATS & Resume Intelligence (ACCEPTED / FROZEN)
- Phase 5 — Job Intelligence & Candidate Matching (ACCEPTED / FROZEN)
- Phase 6 — Outcome Ledger & Reporting (ACCEPTED / FROZEN)
- Phase 7A — Candidate Career Intelligence Forensic Audit (ACCEPTED / FROZEN)

---

## 1. Purpose & Core Principles

The Operations Operating System (OOS) requires an authoritative, deterministic mechanism to answer:
> **"What do we reliably and provably know about this candidate's career?"**

### Core Principles
1. **Career Intelligence ≠ Profile Completeness:** A candidate profile that is 100% complete in form fields does not imply verified competence or deep evidence.
2. **Never Create Parallel Truth:** Career Intelligence does not author or store duplicate career facts. It is a pure, derived service-layer intelligence view computed deterministically over active, authoritative database entities.
3. **Strict Hierarchy of Truth:**
   $$\text{VERIFIED} \succ \text{EVIDENCED} \succ \text{SELF\_DECLARED}$$
4. **No Generative Inference:** All strengths, evidence links, gaps, timelines, and narratives must be composed from explicit, stored facts. No AI hallucinations, ungrounded LLM claims, or vector embedding black boxes.

---

## 2. Standardized Definitions

- **Career Fact:** An explicit, structured candidate record stored in the primary data model (e.g., a record in `CandidateExperience`, `CandidateEducation`, `CandidateSkill`, `CandidateProject`, `CandidateCertification`, or `Candidate`).
- **Career Evidence:** A stored, verifiable source or artifact that supports or corroborates a career fact (e.g., a technology listed in `CandidateExperience.technologies`, a repository/portfolio link in `CandidateProject.url`, a credential identifier in `CandidateCertification`, or an extracted string in `CandidateDocumentExtract`).
- **Self-Declared Fact (`SELF_DECLARED`):** A career fact entered into the profile that lacks multi-source corroboration or formal staff verification (e.g., a standalone skill entry in `CandidateSkill`).
- **Evidenced Fact (`EVIDENCED`):** A career fact supported by at least two (2) distinct, independent authoritative candidate sources/entities (e.g., `CandidateSkill` + `CandidateExperience`, or `CandidateSkill` + `CandidateProject`). Multiple mentions inside the same entity do NOT constitute independent sources.
- **Verified Fact (`VERIFIED`):** A career fact that has been explicitly reviewed and attested by authorized staff through the `CandidateFactAttestation` system.

---

## 3. Authority & Provenance Hierarchy

Career facts must always reflect their highest applicable authority state:

```
┌─────────────────────────────────────────────────────────┐
│                       VERIFIED                          │
│     Explicit staff attestation via CandidateFactAttestation │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                      EVIDENCED                          │
│     Corroborated across >= 2 independent career sources │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    SELF_DECLARED                        │
│          Declared by candidate without corroboration    │
└─────────────────────────────────────────────────────────┘
```

- When a fact has multiple evidence states, the highest applicable state is the effective authority state.
- A `SELF_DECLARED` skill must never be presented as `VERIFIED` without an explicit attestation record.
- A `SYSTEM_DERIVED` resume extract match provides advisory corroboration towards `EVIDENCED`, but never directly grants `VERIFIED` status.

---

## 4. Evidence Model & Deterministic Normalization

### Evidence Sources
Skill and capability evidence is aggregated from five (5) authoritative data streams:
1. **Profile Skills:** `CandidateSkill.name`
2. **Work Experience:** `CandidateExperience.technologies` and structured accomplishments
3. **Project Portfolio:** `CandidateProject.technologies` and `CandidateProject.url`
4. **Certifications:** `CandidateCertification.name` and `issuingAuthority`
5. **Resume Extracts:** `CandidateDocumentExtract.extractedText` (advisory document mention)

### Conservative Deterministic Normalization Policy
To prevent artificial duplication while strictly preventing non-deterministic semantic drift or false merges:

**Allowed Operations:**
- Lowercase transformation (e.g., `"TypeScript"` → `"typescript"`).
- Trimming leading and trailing whitespace.
- Collapsing internal repeated whitespace sequences to a single space.
- Removing safe cosmetic punctuation where unambiguous (e.g., trailing periods, commas).

**Strictly Forbidden Operations:**
- No fuzzy string matching or Levenshtein distance thresholds.
- No vector embeddings, semantic clustering, or LLM-based equivalencies.
- No arbitrary synonym mapping or automatic technology-family collapsing (e.g., do NOT collapse `"NodeJS"` into `"node"` or `"React.js"` into `"react"` unless governed by an explicit, static, version-controlled lookup table).

**Disambiguation & Preservation Rule:**
If two terms cannot be deterministically proven equivalent via the frozen static normalization table, **they must remain distinct**. The original source string value is always preserved for UI display and provenance auditing.

---

## 5. Logical Career Evidence Graph

The Career Evidence Graph is a **service-layer derived logical structure** (zero dedicated graph tables or graph databases).

### Graph Topology
```
                     ┌───────────────┐
                     │   Candidate   │
                     └───┬───┬───┬───┘
         ┌───────────────┘   │   └────────────────┐
         ▼                   ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Experience    │ │     Project     │ │  Certification  │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────┐   │   ┌───────────────┘
                         ▼   ▼   ▼
                     ┌───────────────┐
                     │     Skill     │
                     └───────┬───────┘
                             │
             ┌───────────────┴───────────────┐
             ▼                               ▼
  ┌─────────────────────┐         ┌─────────────────────┐
  │   Job Requirement   │         │    Resume Review    │
  │ (Phase 2/5 Matching)│         │      (Phase 4)      │
  └──────────┬──────────┘         └─────────────────────┘
             ▼
  ┌─────────────────────┐
  │     Application     │
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │   Outcome Ledger    │
  │      (Phase 6)      │
  └─────────────────────┘
```

### Relational Links
- `Candidate` → `1..N` `Experience`, `Skill`, `Project`, `Education`, `Certification`, `Document`.
- `Experience` → `0..N` `Skill` (derived via normalized technology tokens).
- `Project` → `0..N` `Skill` (derived via normalized technology tokens).
- `Certification` → `0..N` `Skill` (derived via deterministic credential name mapping).
- `ResumeExtract` → `0..N` `Skill` (derived via advisory keyword mention).
- `Skill` → `JobRequirement` (consumed by Phase 2 alignment and Phase 5 matching).
- `Application` → `0..N` `ApplicationOutcomeEvent` (historical external outcome ledger).

---

## 6. Provenance Preservation

Every derived evidence item in Career Intelligence DTOs must carry immutable source tracking:

```typescript
export interface CareerEvidenceSource {
  sourceType: "EXPERIENCE" | "PROJECT" | "CERTIFICATION" | "DOCUMENT_EXTRACT" | "ATTESTATION";
  sourceId: string;
  sourceField: string;
  displayContext: string;
  recordedAt: string;
  isVerified: boolean;
}
```

- Candidates receive human-friendly source descriptions (e.g., *"Used at Acme Corp (2024–2026)"*, *"Demonstrated in Cloud Platform Project"*).
- Internal database UUIDs, raw file paths, and staff-only notes are strictly stripped from candidate payloads.

---

## 7. Evidence Depth & Metrics

- **Evidence Depth (`evidenceDepth`):** The count of **distinct supporting evidence entities/sources** corroborating a specific skill, not raw textual recurrence.
  $$\text{evidenceDepth} = \text{Count}(\text{Distinct Supporting Entities})$$
  *(e.g., 1 Profile Skill + 2 Distinct Experiences + 1 Project + 1 Attestation = Depth of 5)*.
- **Strict Representation Guardrail:**
  - Evidence depth is represented purely as supporting-source breadth.
  - Never convert evidence depth to a 0–100 score, percentage, star rating, or relative candidate percentile.

---

## 8. Deterministic Career Strengths & Recency

### Recency Policy by Evidence Type
Recency is evaluated strictly per evidence type where dates are explicitly known:
- **Time-Sensitive:** `CandidateExperience` (via `startDate`/`endDate`) and `CandidateProject` (via completion date).
- **Non-Recency Signals:** Resume upload timestamp, `CandidateSkill.updatedAt`, and `CandidateCertification.updatedAt` do NOT prove recent skill usage.
- **Rule:** If recency cannot be safely determined from structured date fields, recency must be marked as `UNKNOWN` rather than invented.

### Capability Classification
- **Core Strength (`CORE`):**
  - Corroborated across $\ge 3$ distinct independent evidence sources.
  - Must include qualifying recent experience or project evidence where recency is determinable (e.g., within 36 months).
- **Strong Capability (`STRONG`):**
  - Corroborated across $\ge 2$ distinct independent evidence sources.
- **Emerging Skill (`EMERGING`):**
  - Supported by 1 independent evidence source (e.g., a standalone project or self-declared profile skill).

---

## 9. Career Gaps: Data Gaps vs. Evidence Gaps

1. **Data Gap (Profile Structure):** Missing profile sections (e.g., *"No project portfolio links provided"*, *"No education history added"*).
2. **Evidence Gap (Corroboration Context):** Absence of supporting evidence for a skill (e.g., *"No supporting project or experience evidence found for Docker in active profile"*).
3. **Strict Copywriting Guardrails:**
   - **Allowed:** *"No evidence of Docker was found in the active profile."*
   - **Allowed:** *"No recent evidence of Docker was found."* *(Only if recency is determinable)*.
   - **Strictly Banned:** *"You don't know Docker"* or *"Candidate is incompetent in Docker."*

---

## 10. Chronological Career Timeline

The timeline is a deterministic temporal sequence composed from:
- **Work Experience Events:** Start date, end date, role title, employer name.
- **Project Milestones:** Start date, completion date, project title.
- **Education Milestones:** Start date, graduation year, degree awarded.
- **Certifications:** Issue date, expiration date, issuing authority.

All timeline entries must identify their underlying source entity. No promotions or career trajectories may be inferred from ambiguous titles alone.

---

## 11. Career Direction & Preference Isolation

- **Authoritative Direction Source:** `Candidate.targetRoles`, `Candidate.targetLocations`, `Candidate.remotePreference`, and `Candidate.desiredSalaryMin/Max`.
- **Isolation Principle:** Career ambition is derived **strictly from declared candidate preferences**, never inferred from job applications or outcome events.

---

## 12. Subsystem Boundaries

| Subsystem | Boundary & Responsibility | Career Intelligence Interaction |
|---|---|---|
| **Phase 2 (Application Intelligence)** | Evaluates readiness/alignment for a single Application | Consumes Career Facts; does not author them |
| **Phase 4 (Resume Intelligence)** | Evaluates PDF ATS readability & representation | Produces advisory document insights; does not mutate profile truth |
| **Phase 5 (Job Matching)** | Calculates pre-application match categories | Consumes Career Facts & Preferences; does not alter evidence graph |
| **Phase 6 (Outcome Ledger)** | Immutable post-submission outcome events | Outcomes appear in Candidate 360 as historical facts; **never as skill proofs** |

---

## 13. Data Freshness & Staleness Lifecycle

- **Version Keying:** Career Intelligence responses compute a deterministic `sourceDataVersion` hash combining candidate record timestamps (`Candidate.updatedAt`, `CandidateExperience.updatedAt`, `CandidateProject.updatedAt`, `CandidateCertification.updatedAt`, etc.).
- **Automatic Staleness:** Whenever any underlying career entity changes, cached or derived intelligence representations immediately transition to `IntelligenceResultFreshness.STALE` or recompute on demand.

---

## 14. Security & Tenant Scoping

1. **Tenant Isolation:** All queries enforce `organizationId: ctx.organizationId`.
2. **Role Boundaries:**
   - **Candidate:** Accesses only own career intelligence (`userId = ctx.userId`).
   - **Employee:** Scoped to candidates associated with authorized applications.
   - **Team Lead / Manager:** Scoped to team / direct-report assignment scope.
   - **Admin:** Organization-wide scope.
3. **Data Redaction:**
   - Raw extracted resume text (`CandidateDocumentExtract.extractedText`) is never leaked to the client.
   - Internal staff verification notes, authorization metadata, and internal database IDs are stripped from candidate payloads.

---

## 15. Candidate 360 Specification

Candidate 360 is a **read-only composition surface** for authorized staff combining:
1. **Core Identity & Verification:** Contact info, verification badges, work authorization.
2. **Career Evidence Summary:** Core strengths, evidenced skills, source breadth breakdown.
3. **Experience & Project Timeline:** Structured chronological history.
4. **ATS & Resume Intelligence:** Active default resume readability and representation (Phase 4).
5. **Application & Outcome Ledger:** Total applications submitted, active interviews, offers, and employer outcomes (Phase 6).

Candidate 360 does NOT author or duplicate facts; each domain remains authoritative in its own subsystem.

---

## 16. PHASE 7B.1 DECISION LOCK

The following thirteen (13) semantic decisions are formally locked and frozen for Phase 7:

| Decision ID | Topic | Frozen Rule | Rationale |
|---|---|---|---|
| **D1** | `EVIDENCED` Threshold | Requires support from at least **two (2) independent evidence sources/entities** (e.g., `CandidateSkill` + `CandidateExperience`). Duplicate mentions within the same entity do not count. | Prevents self-reinforcing single-source inflation while establishing robust factual corroboration. |
| **D2** | Evidence Depth Definition | Counts **distinct supporting evidence entities/sources**, never raw text occurrences. Never converted to a score, percentage, percentile, or star rating. | Measures verified factual breadth across entities without creating arbitrary, misleading composite metrics. |
| **D3** | Resume Evidence Boundary | Resume extracts are `SYSTEM_DERIVED` and `ADVISORY`. They contribute to evidence discovery and depth, but **cannot establish `VERIFIED` status** and cannot overwrite canonical candidate truth. | Upholds system-derived advisory safety and preserves candidate data integrity. |
| **D4** | Certification Evidence | A certification contributes as independent evidence **only when its normalized name deterministically maps to a skill**. Never infer unrelated skills. | Prevents credential-based scope creep and ungrounded competence assertions. |
| **D5** | Normalization Policy | Conservative deterministic policy: lowercase, trim, collapse repeated whitespace, remove safe cosmetic punctuation. **No fuzzy matching, embeddings, or synonym collapsing.** Ambiguous terms remain distinct. | Eliminates semantic drift and false equivalence merges across distinct technologies. |
| **D6** | Verified Precedence | Strict precedence: $\text{VERIFIED} \succ \text{EVIDENCED} \succ \text{SELF\_DECLARED}$. The highest applicable state is the effective authority state. | Guarantees clear, monotonic resolution of multiple evidence sources. |
| **D7** | Recency Policy | Recency is evaluated strictly per evidence type (Experience/Project dates). Resume upload or profile update dates do not prove active usage. Unknown recency is marked `UNKNOWN`. | Prevents artificial recency inflation from administrative profile touches. |
| **D8** | Strength Classification | 3-tier breadth model: `CORE` ($\ge 3$ sources + qualifying recent experience/project), `STRONG` ($\ge 2$ sources), `EMERGING` (1 source). | Provides actionable, deterministic segmentation grounded in multi-source breadth. |
| **D9** | Career Gap Copywriting | Career Intelligence distinguishes `DATA_GAP` vs `EVIDENCE_GAP`. It may state *"No evidence found"*, but must **never infer incompetence** (*"You don't know X"* is banned). | Maintains objective, respectful, evidence-backed user communication. |
| **D10** | Outcome Boundary | Post-submission outcomes (`INTERVIEW_REQUESTED`, `OFFER_RECEIVED`, `EMPLOYER_REJECTION`) are historical career context only. **Outcomes never prove technical proficiency.** | Preserves strict separation between external hiring market events and technical evidence. |
| **D11** | Candidate Visibility | Candidates see evidence-backed strengths, constructive evidence gaps, timeline, and verification state. Internal staff notes, scoring mechanics, and internal IDs are redacted. | Ensures transparent candidate self-understanding while protecting internal staff operations. |
| **D12** | Candidate 360 Architecture | Candidate 360 is a **read-only composition view** uniting Profile, Career Evidence, Resume Intel, Application Intel, Matching, and Outcomes. | Avoids creating a duplicate parallel database while providing a unified 360-degree operational surface. |
| **D13** | Zero Schema Policy | Pure service-layer derivation over existing Prisma models. **Zero schema alterations, zero new tables, zero migrations.** | Eliminates database complexity and leverages existing authoritative schema. |

---

## 17. Non-Goals (Explicitly Excluded)

The following capabilities are **strictly prohibited** from Phase 7:
- Generative AI career summaries or synthetic biography generation.
- Vector embeddings or semantic distance clustering.
- Synthetic 0–100 candidate ranking scores.
- Automated third-party credential verification APIs.
- AI career prediction, salary estimation, or no-response classifiers.
- New database tables for graph storage (zero schema changes).

---

## 18. Acceptance Criteria

1. **Deterministic Execution:** The career intelligence service layer must derive evidence depth, strengths, and timelines using 100% deterministic algorithms with identical output for identical inputs.
2. **Zero Schema Alterations:** Implemented entirely using existing Prisma models (`Candidate`, `CandidateExperience`, `CandidateSkill`, `CandidateProject`, `CandidateCertification`, `CandidateDocumentExtract`, `CandidateFactAttestation`).
3. **Cross-Tenant Security:** 100% isolation across organization boundaries.
4. **Candidate Redaction:** Zero exposure of raw extracted resume strings or internal staff notes.
5. **No Regressions:** Zero interference with Phase 2 alignment, Phase 4 resume reviews, Phase 5 matching, or Phase 6 outcome reporting.
