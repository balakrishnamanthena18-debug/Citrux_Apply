# Phase 4 — Storage Exceptions & Remediation Record

**Document type:** MIGRATION EXCEPTION + REMEDIATION RECORD  
**Phase:** Phase 4 — Storage (pre-copy remediation)  
**Timestamp (UTC):** 2026-10-01T08:42:00Z (approximate execution window)  
**Authorization:** Human-approved path **D1 + NULL**  
**Env:** `.migration-mumbai.env` (gitignored)  

**Status:** 🟢 PHASE 4 REMEDIATION — VERIFIED

---

## 1. Scope of this record

| Item | Action taken |
|---|---|
| Three seed `candidate_documents` | **Preserved unchanged** (D1 exception) |
| One `application_submissions` row | **`storagePath` set to `NULL` only** |
| Storage objects (Seoul / Mumbai) | **Unchanged** — none created, deleted, or copied |
| Auth / Vercel / main `.env` | **Unchanged** |
| Storage object migration (Phase 4 copy) | **Not started** |

**Explicit statement:** No fabricated Storage files were created. No binaries were uploaded to invent missing seed objects.

---

## 2. Exception — three candidate_documents (D1)

### Records (UUIDs only; no PII)

| # | `candidate_documents.id` |
|---|---|
| 1 | `31cb2a43-7ccd-448e-93a7-35edbccd8dc1` |
| 2 | `f42ae6df-3eca-4441-b5fe-32cba59ec1a2` |
| 3 | `1358b87c-7395-44f8-939a-3d2d7a3a0cbb` |

### Why no binary exists

These rows were inserted by `scripts/seed-realtime-data.js`, which wrote database metadata (including a shared non-canonical Storage path and `fileSizeBytes = 245120`) **without uploading** any object to the `candidate-documents` bucket.

### Source investigation result

| Check | Result |
|---|---|
| Exact object at recorded path (Seoul DB + Storage API) | **Missing** |
| Alternate/historical objects for same folder, slug, or filename | **None** |
| Path canonical under app rules (`tenants/{org}/candidates/{candidateUUID}/documents/{docId}-vN-…`) | **No** (non-UUID candidate segment; non-generator filename) |
| Linked `application_materials` | **8** links total across the three docs (relationships preserved) |
| Seoul Storage object count (`candidate-documents`) | **2** (unrelated healthy objects; not these three paths) |

Evidence baseline: `docs/migration/PHASE_4_STORAGE_BLOCKER_INVESTIGATION.md`,  
plan: `docs/migration/PHASE_4_STORAGE_REMEDIATION_PLAN.md`.

### Why records were preserved

Human-approved **D1**:

- Keep the three document rows and all `application_materials` relationships.
- Do **not** detach materials.
- Do **not** delete documents.
- Do **not** rewrite paths.
- Do **not** fabricate files.

Preserving them avoids altering live application material semantics solely to greenwash migration verification.

### Exclusion from DB↔Storage completeness invariant

For Phase 4 Storage verification, these three `storagePath` values are **documented pre-existing anomalies** and are **excluded** from the strict rule:

> DB storage references without a corresponding Storage object = 0

**Exclusion predicate (operational):**

```text
candidate_documents.id IN (
  '31cb2a43-7ccd-448e-93a7-35edbccd8dc1',
  'f42ae6df-3eca-4441-b5fe-32cba59ec1a2',
  '1358b87c-7395-44f8-939a-3d2d7a3a0cbb'
)
```

All other `candidate_documents.storagePath` values remain subject to the completeness invariant.

### Fields unchanged (confirmed post-remediation)

For each of the three IDs on **Seoul** and **Mumbai**:

- record UUID  
- `candidateId`  
- `storagePath` (md5 fingerprint unchanged)  
- document metadata (`documentType`, `fileSizeBytes`, `mimeType`, `versionNumber`, `isDefault`, title length)  
- `createdAt` / `updatedAt` (not rewritten by this remediation)  
- `application_materials` rows still point at these document IDs (link count = **8**)

---

## 3. Remediation — submission `storagePath` NULL

### Record

| Field | Value |
|---|---|
| Table | `application_submissions` |
| ID | `c16151c0-6be9-429d-bef8-907ecaf8c598` |
| Parent application | `c25b9013-ad32-4a94-b049-39ce05ada8a9` |

### Before

| Field | State |
|---|---|
| `storagePath` | Non-null seed path (leaf class `sub-attempt1.*`; object never existed in `submission-evidence`) |
| `confirmationEvidence` | Present (length **133**) |
| `attemptNumber` | 1 |
| Other submissions with non-null `storagePath` | 0 |

### After (Seoul + Mumbai)

| Field | State |
|---|---|
| `storagePath` | **`NULL`** |
| `confirmationEvidence` | Unchanged (length **133**) |
| `attemptNumber` | Unchanged (1) |
| `applicationId` | Unchanged |
| All other columns | Unchanged |
| Other submission rows | Unchanged |

### Why this correction is valid

- Schema: `storagePath` is **nullable**.  
- Product: text confirmation evidence is independently displayed; binary download is optional.  
- The prior path referenced a nonexistent object; NULL accurately represents current reality.  
- Removes an invalid download/storage reference from the UI (`storagePath && EvidenceDownloadButton`).

### SQL semantics executed (guarded)

```sql
UPDATE application_submissions
SET "storagePath" = NULL
WHERE id = 'c16151c0-6be9-429d-bef8-907ecaf8c598'
  AND "storagePath" IS NOT NULL
  AND md5("storagePath") = '<preflight fingerprint>'
  AND "confirmationEvidence" IS NOT NULL
  AND length(trim("confirmationEvidence")) > 0;
```

**Rows updated:** 1 on Seoul, 1 on Mumbai.

---

## 4. Storage / infrastructure immutability

| Surface | Result |
|---|---|
| Seoul `candidate-documents` object count | **2** (unchanged) |
| Seoul `submission-evidence` object count | **0** (unchanged) |
| Mumbai `candidate-documents` object count | **0** (unchanged; buckets exist, no copy yet) |
| Mumbai `submission-evidence` object count | **0** (unchanged) |
| Fabricated files | **None** |
| Object copy migration | **Not run** |
| Auth | Unchanged |
| Vercel | Unchanged |
| Main `.env` | Unchanged |

---

## 5. Tests run (no test weakening)

| Suite | Result |
|---|---|
| `tests/unit/migration/supabase-storage-migrate.test.ts` | PASS (16) |
| `tests/integration/candidate-storage.test.ts` | PASS (19) |
| `tests/integration/submission-storage.test.ts` | PASS (5) |
| `tests/integration/submission-workflow.test.ts` | PASS (3) |
| `tests/integration/submission-immutability.test.ts` | PASS (4) |
| `tests/integration/client-boundary-security.test.ts` | PASS (4) |
| **Total** | **51 / 51 PASS** |

---

## 6. What Phase 4 Storage copy may do next (NOT authorized here)

When Storage migration is later authorized:

1. Copy the **2** genuine Seoul `candidate-documents` objects to Mumbai with exact paths.  
2. Expect `submission-evidence` copy set to be empty (0 objects).  
3. Apply completeness checks with the **§2 exclusion** for the three seed document IDs.  
4. Expect **0** remaining non-excluded DB↔Storage mismatches for submissions after this NULL remediation.

---

## FINAL STATUS

### 🟢 PHASE 4 REMEDIATION — VERIFIED

**STOP.** Do not begin Storage object copying automatically. Do not begin Phase 5. Do not perform Vercel cutover.
