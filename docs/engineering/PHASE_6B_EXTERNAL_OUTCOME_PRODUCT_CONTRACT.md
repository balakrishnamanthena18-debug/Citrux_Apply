# PHASE 6B / 6B.1 — EXTERNAL OUTCOME PRODUCT CONTRACT

**Status:** ACCEPTED / FROZEN (Decision Lock 6B.1)  
**Domain:** Post-submission Application Outcome Ledger  
**Type:** Product contract only — not an implementation specification for runtime code  

**Upstream:**
- Phase 6A — External Outcome & Post-Submission Lifecycle Forensic Audit (ACCEPTED / FROZEN)
- Phase 6B — External Outcome Product Contract (ACCEPTED / FROZEN)
- Phase 6B.1 — Product Contract Decision Lock (this artifact)

**Downstream:**
- Phase 6C — Application Outcome Ledger Foundation is **AUTHORIZED TO PROCEED** only while O1–O7 remain **FROZEN** as recorded below.

---

## 1. Three Separate Truths

| Layer | Question | Authority |
|-------|----------|-----------|
| Application lifecycle | Where is our operational work? | `ApplicationStatus` + transitions |
| Submission evidence | Did we actually apply externally? | `ApplicationSubmission` + evidence |
| Outcome ledger | What did the outside world do afterward? | Append-only Application Outcome Events |

Never collapse these into one status field.

---

## 2. Architectural Decision (FROZEN)

Outcomes are **append-only Application Outcome Events**, not new `ApplicationStatus` values.

- Source of truth: the event ledger (not `Application.currentOutcome`)
- Multiple chronological events are allowed
- Corrections: VOIDED and/or SUPERSEDED_BY — never silent overwrite, never hard-delete in V1

---

## 3. V1 Outcome Taxonomy (FROZEN)

Exact set only:

| Outcome Type | Meaning |
|--------------|---------|
| `EMPLOYER_REJECTION` | Employer/process declined after external submission |
| `RECRUITER_CONTACT` | Recruiter/employer contacted candidate about this Application |
| `INTERVIEW_REQUESTED` | Interview invited/requested (ledger only) |
| `INTERVIEW_SCHEDULED` | Interview time agreed/scheduled (ledger only) |
| `OFFER_RECEIVED` | Offer communicated (ledger only; not offer management) |
| `OTHER` | Material external update not covered above |

**Not in V1:**

`NO_RESPONSE`, `ASSESSMENT_REQUESTED`, `APPLICATION_WITHDRAWN`, `EMPLOYER_RESPONSE`, `FOLLOW_UP_REQUIRED`, `STUCK`, `SYSTEM_DERIVED`

---

## 4. V1 Provenance (FROZEN)

| Provenance | Role |
|------------|------|
| `EMPLOYEE_RECORDED` | Staff-created authoritative record |
| `CANDIDATE_REPORTED` | Candidate-reported; unverified |
| `STAFF_VERIFIED` | Staff verification of a candidate report (or explicit verify path) |

**Out of V1 (O7):** `IMPORTED`, `EXTERNAL_VERIFIED`, `SYSTEM_DERIVED`

---

## 5. Decision Lock — O1–O7

### O1 — Candidate-safe outcome labels

**Status: FROZEN**

| Outcome Type | Candidate-facing label |
|--------------|------------------------|
| `EMPLOYER_REJECTION` | Employer declined |
| `RECRUITER_CONTACT` | Recruiter contacted you |
| `INTERVIEW_REQUESTED` | Interview requested |
| `INTERVIEW_SCHEDULED` | Interview scheduled |
| `OFFER_RECEIVED` | Offer received |
| `OTHER` | Other update |

- Candidate UI must not expose raw enum names.
- Staff UI may use precise operational terminology.
- Do not add additional outcome types.

### O2 — Admin delete policy

**Status: FROZEN**

- **VOID-ONLY** in V1.
- No hard deletion of Application Outcome Events for Candidate, Employee, Team Lead, Manager, or Admin.
- Corrections preserve the original event via **VOIDED** and/or **SUPERSEDED_BY**.

### O3 — OTHER candidate visibility

**Status: FROZEN**

- `OTHER` is **hidden from candidates by default**.
- Becomes candidate-visible only when authorized staff explicitly sets `candidateVisible = true`.
- Candidate cannot set `candidateVisible = true` for OTHER.
- Candidate-reported OTHER does not automatically become candidate-visible.
- When visible, presentation remains human-readable (“Other update”).

### O4 — Employer rejection coupling

**Status: FROZEN**

- **ATOMIC COUPLING** for authoritative `EMPLOYER_REJECTION`.
- Same transaction must:
  1. create the Application Outcome Event
  2. transition `Application.status` to `REJECTED`
  3. create normal `ApplicationStateHistory`
  4. create required AuditEvent records
- No separate confirmation checkbox.
- No half-state: authoritative `EMPLOYER_REJECTION` while Application remains `SUBMITTED`.
- Any failed write → full rollback.
- `ApplicationStatus.REJECTED` does **not** imply `EMPLOYER_REJECTION`.
- `DISCOVERED → REJECTED` and `QUALIFIED → REJECTED` must **not** fabricate employer outcomes.
- Candidate approval denial remains `AWAITING_APPROVAL → PREPARING` / `REVISION_REQUESTED` and must **not** create `EMPLOYER_REJECTION`.

### O5 — Outcome evidence storage / residency

**Status: FROZEN**

- Dedicated **private application-outcome evidence** area (application/outcome-specific).
- Do **not** place outcome evidence in the candidate’s general career-document vault.
- Reuse existing secure private-storage infrastructure and security patterns where possible.
- Requirements: private access, org isolation, application/outcome authorization, candidate visibility enforcement, auditability, no public URLs, no secret URL logging.
- Do not expose storage paths directly to clients.
- Evidence remains optional unless a specific outcome rule later requires it (no expansion beyond 6B contract in V1).

### O6 — INTERVIEW_SCHEDULED occurredAt

**Status: FROZEN**

- `INTERVIEW_SCHEDULED` **requires** `occurredAt`.
- If missing → **reject the operation**.
- Do not default to `recordedAt`, `createdAt`, Application timestamps, message/task times, or fabricate dates.
- `INTERVIEW_REQUESTED` follows general optional `occurredAt` semantics (nullable allowed).

### O7 — Imported / external verified provenance

**Status: FROZEN**

- `IMPORTED` — **OUT OF V1**
- `EXTERNAL_VERIFIED` — **OUT OF V1**
- `SYSTEM_DERIVED` — **OUT OF V1**
- V1 provenance remains only: `EMPLOYEE_RECORDED`, `CANDIDATE_REPORTED`, `STAFF_VERIFIED`

---

## 6. Candidate reporting (FROZEN summary)

Candidate may report (as `CANDIDATE_REPORTED` only):

- `RECRUITER_CONTACT`
- `INTERVIEW_REQUESTED`
- `INTERVIEW_SCHEDULED` (subject to O6 if scheduled)
- `OFFER_RECEIVED`
- `EMPLOYER_REJECTION`

Candidate report does **not** automatically change `ApplicationStatus`, create `EMPLOYEE_RECORDED` / `STAFF_VERIFIED`, or mark employer rejection authoritative.

`OTHER` — staff-created in V1 for authoritative ledger use; visibility per O3.

---

## 7. Timestamps (FROZEN)

| Field | Rule |
|-------|------|
| `recordedAt` | Always server-generated |
| `occurredAt` | Optional except O6 for `INTERVIEW_SCHEDULED` |
| Unknown | `NULL` — never invent |

---

## 8. Evidence policy (FROZEN summary)

- Optional for V1 outcomes unless later tightened
- Recommended for `EMPLOYER_REJECTION` and `OFFER_RECEIVED` (product guidance; not a hard schema mandate beyond O5 residency)
- Free-text note ≠ verified external fact
- Messages / tasks / NLP are not evidence sources

---

## 9. Explicit V1 non-goals (FROZEN)

Do not build in outcome V1:

- Interview entity / calendar / interviewer / meeting links
- Offer entity / compensation / negotiation / acceptance workflow
- Recruiter CRM
- Employer integrations / inbound employer email
- NLP / AI outcome inference
- No-response classifier
- SLA / follow-up / escalation / notifications / Action Center

`INTERVIEW_*` and `OFFER_RECEIVED` remain ledger events only.

---

## 10. Authorization (conceptual, FROZEN)

Reuse existing Application operational scope (Employee / Team Lead / Manager / Admin) and candidate self-scope. Never trust client-supplied organization/candidate/employee/team/manager IDs.

---

## 11. Phase 6C authorization

| Decision | Status |
|----------|--------|
| O1 | **FROZEN** |
| O2 | **FROZEN** |
| O3 | **FROZEN** |
| O4 | **FROZEN** |
| O5 | **FROZEN** |
| O6 | **FROZEN** |
| O7 | **FROZEN** |

**PHASE 6C AUTHORIZED TO PROCEED** when engineering is explicitly started under a separate Phase 6C authorization that cites this artifact.

Phase 6B.1 itself implements **no** runtime code.

---

## 12. Change control

Any change to O1–O7, taxonomy, provenance, or coupling rules requires a new numbered product-contract amendment (e.g. 6B.2). Do not silently reopen frozen decisions inside an implementation PR.
