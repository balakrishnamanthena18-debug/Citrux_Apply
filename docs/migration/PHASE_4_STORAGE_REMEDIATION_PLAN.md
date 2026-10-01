# Phase 4 — Storage Seed Anomaly Remediation Plan

**Document type:** ANALYSIS ONLY — REMEDIATION PLAN (NO EXECUTION)  
**Date:** 2026-10-01  
**Prerequisite:** `docs/migration/PHASE_4_STORAGE_BLOCKER_INVESTIGATION.md`  
**Seed source:** `scripts/seed-realtime-data.js`  

**Constraints honored:** No DELETE/UPDATE of records, no Storage create/copy/delete, no Auth/Vercel/`.env` changes. This document is the only output.

---

## FINAL STATUS

### 🟡 REMEDIATION PLAN READY

No correction was executed. One schema-aligned fix is recommended for human approval (record 4). Records 1–3 have **no unambiguous automatic remediation** without altering live application material semantics or inventing binaries.

---

## 1. Schema & lifecycle facts (authoritative)

### `candidate_documents`

| Field / rule | Constraint |
|---|---|
| `storagePath` | **NOT NULLABLE** (`String @db.VarChar(1024)`) |
| Soft-delete / archive column | **None** |
| Canonical path | `tenants/{orgId}/candidates/{candidateId}/documents/{documentId}-v{n}-{file}` |
| Register | Object must already exist in Storage before DB insert (self flow) |
| View / Download / Delete | Require `isCanonicalCandidateDocumentPath`; non-canonical → security denial |
| Default resume | At most one logical default intended; seed cluster currently has **3× `isDefault=true`** |

### `application_materials`

| Field / rule | Constraint |
|---|---|
| `candidateDocumentId` | **Nullable** |
| FK to `candidate_documents` | **`ON DELETE RESTRICT`** — cannot delete a document while any material row still points at it |
| Material without document | Allowed (cover letter / screening / notes can stand alone) |
| `updateApplicationMaterialAction` | May set `candidateDocumentId` to a valid candidate doc **or null** |

### `application_submissions`

| Field / rule | Constraint |
|---|---|
| `storagePath` | **Nullable** (optional binary) |
| `confirmationEvidence` | Nullable text; UI renders it when present |
| Zod submit schemas | Both `storagePath` and `confirmationEvidence` optional/nullable |
| Binary download | Only offered when `storagePath` is truthy; missing object → NotFound |

### Product implication

- **Record 4** can be represented correctly as “text evidence only” by setting `storagePath = NULL`.  
- **Records 1–3** cannot be represented as “metadata without binary” under the current schema (`storagePath` required). There is also no archive flag. Any “fix” either changes relationships, requires a schema change, deletes rows, or invents files.

---

## 2. Per-anomaly remediation analysis

### Anomaly 1 — `candidate_documents` `31cb2a43-7ccd-448e-93a7-35edbccd8dc1`

| Item | Detail |
|---|---|
| **Record** | `candidate_documents.id = 31cb2a43-7ccd-448e-93a7-35edbccd8dc1` |
| **Current state** | Seed resume metadata; shared non-canonical slug path; `fileSizeBytes=245120`; no Seoul object; linked via `application_materials` (2 current) to apps including SUBMITTED/READY |
| **Why invalid** | Path fails canonical invariant; Storage object never existed; still presented as a live document |
| **Relevant rule** | Required `storagePath`; canonical path + object existence for view/download; materials FK `ON DELETE RESTRICT` |
| **Proposed correction** | **Do not auto-correct.** Prefer human-chosen option among §3 options **D1–D4**. Least-destructive migration-adjacent option is **D1 (documented integrity exception)** until product owners approve material detach/delete. |
| **Reversible?** | N/A until a correction is chosen; exception approach changes no data |
| **App behavior change?** | Exception: **none** (status quo: View/Download already fail). Detach/delete options: **yes** (resume link removed from materials) |
| **Human approval required?** | **YES** |
| **Fields that would change** | Depends on option — see §3 |

---

### Anomaly 2 — `candidate_documents` `f42ae6df-3eca-4441-b5fe-32cba59ec1a2`

| Item | Detail |
|---|---|
| **Record** | `candidate_documents.id = f42ae6df-3eca-4441-b5fe-32cba59ec1a2` |
| **Current state** | Same shared seed path/size cluster as Anomaly 1; materials → 2 apps |
| **Why invalid** | Same as Anomaly 1 (duplicate seed re-insert) |
| **Relevant rule** | Same as Anomaly 1 |
| **Proposed correction** | Treat as **same seed cluster** as Anomaly 1; single human decision covers 1–3 |
| **Reversible?** | Same as Anomaly 1 |
| **App behavior change?** | Same as Anomaly 1 |
| **Human approval required?** | **YES** |
| **Fields that would change** | Same option set as Anomaly 1 |

---

### Anomaly 3 — `candidate_documents` `1358b87c-7395-44f8-939a-3d2d7a3a0cbb`

| Item | Detail |
|---|---|
| **Record** | `candidate_documents.id = 1358b87c-7395-44f8-939a-3d2d7a3a0cbb` |
| **Current state** | Same seed path cluster; heaviest linkage (4 current materials, including SUBMITTED app that also owns Anomaly 4) |
| **Why invalid** | Same as Anomaly 1 |
| **Relevant rule** | Same as Anomaly 1 |
| **Proposed correction** | Same cluster decision as Anomalies 1–2 |
| **Reversible?** | Same as Anomaly 1 |
| **App behavior change?** | Same as Anomaly 1; highest blast radius if documents are detached/deleted |
| **Human approval required?** | **YES** |
| **Fields that would change** | Same option set as Anomaly 1 |

---

### Anomaly 4 — `application_submissions` `c16151c0-6be9-429d-bef8-907ecaf8c598`

| Item | Detail |
|---|---|
| **Record** | `application_submissions.id = c16151c0-6be9-429d-bef8-907ecaf8c598` |
| **Current state** | SUBMITTED attempt 1; non-generator seed filename in `storagePath`; **0** objects in `submission-evidence`; text `confirmationEvidence` present (len 133); external ref/url present |
| **Why invalid** | `storagePath` points at a nonexistent object; filename does not match `{submissionId}-{file}` generator |
| **Relevant rule** | `storagePath` is **optional**; UI shows text evidence independently; download control only renders when `storagePath` is set |
| **Proposed correction** | **`UPDATE application_submissions SET "storagePath" = NULL WHERE id = 'c16151c0-…'`** (and optionally leave all other columns unchanged). This aligns DB with “text-only confirmation,” which the product already supports. |
| **Reversible?** | **Partially** — the prior dangling path string could be restored from backup/notes, but it never referenced a real object, so restore reintroduces an integrity lie |
| **App behavior change?** | **Minor / corrective:** `EvidenceDownloadButton` stops rendering (it currently cannot succeed). Text evidence, external ref/url, notes **unchanged**. Submission status **unchanged**. |
| **Human approval required?** | **YES** (live SUBMITTED row; not auto-executed in this task). Schema-safe and recommended. |
| **Fields that would change** | `application_submissions.storagePath`: `<seed path>` → `NULL` only. **No Storage changes.** |

---

## 3. Candidate-document option matrix (Anomalies 1–3)

| ID | Correction | What changes | Alters live app semantics? | Clears Phase 4F gap? | Allowed? |
|---|---|---|---|---|---|
| **D1** | Documented Phase 4 integrity **exception** (no DB write) | Nothing | No | No (gap remains; accepted) | **Yes** (process) |
| **D2** | Detach materials then delete the 3 document rows | `application_materials.candidateDocumentId` → `NULL` for linking rows; then `DELETE` the 3 `candidate_documents` | **Yes** — apps lose resume document pointer; “Materials Staged” may still be true via cover letter, but resume link gone | Yes (no remaining bad paths) | Only with **human approval** |
| **D3** | Schema change: make `storagePath` nullable + set NULL on the 3 rows | Prisma/SQL migration + 3 updates; app code must tolerate null paths | **Yes** — product contract change; view/download paths need guards | Yes if integrity rule ignores null paths | Requires **design + human approval**; not a quick migration fix |
| **D4** | Rewrite paths to canonical UUIDs **without** uploading files | `candidate_documents.storagePath` (and maybe sizes) | Path shape “looks” valid but View still fails; worsens honesty | **No** (objects still missing) | **Must NOT** |
| **D5** | Fabricate / upload fake PDFs at seed or canonical paths | Storage objects created | Pretends seed resumes are real | Yes | **Must NOT** |
| **D6** | Delete document rows **without** detaching materials | — | — | — | **Must NOT** (FK `ON DELETE RESTRICT` fails) |
| **D7** | Delete/alter applications or other business rows to “clean” graph | Broad live data | **Yes** | Side-effect only | **Must NOT** |

**Seed-only / demo?** Fingerprint is seed (`scripts/seed-realtime-data.js`), but rows are **wired into live application_materials** across SUBMITTED / READY / AWAITING_APPROVAL apps. They are **not** unused orphans.

**Does `application_materials` require the document?** Schema: **no** (`candidateDocumentId` optional). Product UI treats materials as “resume + cover letter” staging; detaching resume changes operator-visible attachment semantics even if the application status stays the same.

---

## 4. Classification A / B / C

### A. Corrections that can safely be performed automatically

**None in this phase.**

Rationale:

- Anomalies 1–3 have **no** schema-supported “metadata without binary” representation and any delete/detach touches live materials.
- Anomaly 4 is schema-safe, but this task forbids execution without an explicit human decision on a live SUBMITTED submission, and forbids altering data merely to greenwash verification.

*(After written human approval, Anomaly 4’s NULL-out is the only correction that is both schema-aligned and low-risk enough to script.)*

### B. Corrections requiring explicit human approval

1. **Anomaly 4:** `application_submissions.storagePath → NULL` (recommended).  
2. **Anomalies 1–3 option D1:** Accept Phase 4 DB↔Storage integrity exception for the three seed document paths; migrate the **2** real objects only; document residual gaps.  
3. **Anomalies 1–3 option D2:** Detach `application_materials.candidateDocumentId` for all rows pointing at the three IDs, then delete the three `candidate_documents` rows (full cleanup; changes live material semantics).  
4. **Anomalies 1–3 option D3:** Product/schema change to allow nullable `storagePath` (larger than Phase 4).

### C. Corrections that must NOT be performed

| Forbidden action | Why |
|---|---|
| Fabricate or upload replacement binaries | Invents evidence; forbidden by Phase 4 safety rules |
| Rewrite `storagePath` to a canonical path without a real object | Creates a false “valid-looking” reference; View/Download still fail; Phase 4F still fails |
| Delete the three documents while materials still reference them | FK `ON DELETE RESTRICT`; will error or force unsafe cascade |
| Delete applications / materials / candidates to clear blockers | Alters live business data beyond storage integrity |
| Copy/migrate Storage as a “fix” for these four | Objects do not exist; does not remediate |
| Change Auth, Vercel, or main `.env` | Out of scope |
| Auto-delete the four records without approval | Explicitly forbidden |

---

## 5. Recommended human decision package (for later execution)

**Recommended package (still not executed):**

1. **Approve Anomaly 4:** set `storagePath = NULL` on `c16151c0-…`.  
2. **Approve Anomalies 1–3 via D1 for Phase 4:** proceed later with Storage copy of the **2** genuine Seoul objects; record the three seed document paths as **accepted pre-existing integrity exceptions** in the Phase 4 report (not VERIFIED under strict zero-gap rule unless exceptions are formally accepted).  
3. **Defer D2/D3** to a separate product cleanup if operators need real resumes on those applications.

**Alternative stricter package:** Approve D2 (detach + delete seed docs) **and** Anomaly 4 NULL-out → enables strict Phase 4F zero-gap **after** execution, at the cost of removing resume links from eight materials rows.

---

## 6. Exact field change list (if later approved)

### If Anomaly 4 approved

```text
TABLE  application_submissions
WHERE  id = 'c16151c0-6be9-429d-bef8-907ecaf8c598'
SET    storagePath = NULL
# unchanged: confirmationEvidence, externalReference, externalUrl,
#            submissionNotes, applicationId, attemptNumber, status (via application)
STORAGE: no changes
```

### If Anomalies 1–3 option D2 approved (illustrative order)

```text
1) UPDATE application_materials
   SET "candidateDocumentId" = NULL
   WHERE "candidateDocumentId" IN (
     '31cb2a43-7ccd-448e-93a7-35edbccd8dc1',
     'f42ae6df-3eca-4441-b5fe-32cba59ec1a2',
     '1358b87c-7395-44f8-939a-3d2d7a3a0cbb'
   );

2) DELETE FROM candidate_documents
   WHERE id IN (
     '31cb2a43-7ccd-448e-93a7-35edbccd8dc1',
     'f42ae6df-3eca-4441-b5fe-32cba59ec1a2',
     '1358b87c-7395-44f8-939a-3d2d7a3a0cbb'
   );

STORAGE: no changes (nothing to delete)
```

### If D1 only (exception)

```text
NO database fields change
NO storage fields change
Phase 4 report records accepted exceptions for the three paths
```

---

## 7. Safety confirmation

| Action | Performed? |
|---|---|
| DELETE / UPDATE records | **No** |
| CREATE / COPY / DELETE Storage objects | **No** |
| Auth / Vercel / main `.env` | **No** |
| Storage migration | **No** |

---

## FINAL STATUS

### 🟡 REMEDIATION PLAN READY

**STOP.** Await human choice among §4B options before any remediation SQL or Phase 4 Storage copy.
