# Phase 4 — Storage Blocker Investigation (READ-ONLY)

**Document type:** READ-ONLY ANOMALY INVESTIGATION  
**Date:** 2026-10-01  
**Scope:** Four DB storage references that blocked Phase 4  
**Constraints honored:** No deletes, no DB writes, no Storage writes/copies, no Auth/Vercel/`.env` changes, no secrets/signed URLs/file bodies, no candidate PII in this report  

**Env loaded:** `.migration-mumbai.env` only  

---

## FINAL STATUS

### 🟡 HUMAN DECISION REQUIRED — references need an explicit business decision

None of the four references resolve to a Seoul Storage object. All four match **seed-script metadata that never uploaded binaries**, with **non-canonical paths** relative to current application invariants. They remain linked to live application rows, so migration integrity cannot be auto-cleared without an explicit decision.

---

## 1. Credential pre-check (presence only)

| Variable | Status |
|---|---|
| `SOURCE_SUPABASE_URL` | **SET** |
| `SOURCE_SUPABASE_SERVICE_ROLE_KEY` | **SET** |
| `TARGET_SUPABASE_URL` | SET |
| `TARGET_SUPABASE_SERVICE_ROLE_KEY` | SET |

Values were not printed.

---

## 2. Authoritative lifecycle rules (repository)

### Candidate documents

| Rule | Source |
|---|---|
| Path format | `tenants/{organizationId}/candidates/{candidateId}/documents/{documentId}-v{version}-{sanitizedFilename}` — `generateCandidateDocumentPath` in `src/lib/storage/index.ts` |
| Canonical check | `isCanonicalCandidateDocumentPath` requires exact org + candidate UUID prefix; rejects `..` and nested filename segments |
| Register | Server derives path; verifies object exists before DB insert (`registerCandidateDocumentSelfAction`) |
| View / Download | Requires canonical path + object existence |
| Delete | Requires canonical path; then deletes DB row then Storage object |
| Soft-delete | **None** — hard delete of row + object |

### Submission evidence

| Rule | Source |
|---|---|
| Path format | `tenants/{organizationId}/applications/{applicationId}/submissions/{submissionId}-{sanitizedFilename}` — `generateSubmissionEvidencePath` |
| `storagePath` | **Optional** on `ApplicationSubmission` (schema + Zod) |
| Text confirmation | Optional `confirmationEvidence` string can exist without a binary |
| Download | Staff-only; fails with NotFound if `storagePath` null |

### Seed script (root cause evidence)

`scripts/seed-realtime-data.js` inserts:

1. A `candidate_documents` row with hardcoded path  
   `tenants/00000000-0000-0000-0000-000000000001/candidates/<NON_UUID_SLUG>/documents/<NONCANONICAL_FILENAME>`  
   and `fileSizeBytes = 245120` — **without any Storage upload**.
2. An `application_submissions` row with path ending in a non-UUID filename stem (`sub-attempt1…`) — **without any Storage upload**.

---

## 3. Seoul Storage baseline (read-only)

| Bucket | DB object count | API list |
|---|---:|---|
| `candidate-documents` | 2 | Root has `tenants/`; healthy UUID candidate folder has **2** objects; seed slug folder has **0** |
| `submission-evidence` | 0 | Empty (0 root entries) |

Healthy present documents (for contrast): **2** rows with UUID candidate segment + `{documentId}-vN-` filename; objects exist; **not** among the blockers.

---

## 4. The four missing references

Paths below use **filename redaction**. UUIDs are included for operator lookup.

### Shared observation (refs 1–3)

All three candidate-document rows:

- Share **one identical** `storagePath` (group size = 3)
- Use **non-UUID** candidate path segment (seed slug)
- Use **non-canonical** filename (not `{documentId}-vN-…`)
- All have `isDefault = true` (invalid multi-default cluster)
- Same `fileSizeBytes = 245120` (exact match to seed script)
- Same mime `application/pdf`, version `1`
- Same candidate UUID; candidate status **ACTIVE**
- Org segment matches organization UUID
- Candidate path segment **≠** current `candidateId`
- **Zero** alternate objects under: exact folder, current-candidate prefix, seed-slug prefix, same filename anywhere
- Storage API list of seed-slug documents folder: **0**
- No audit_events rows for these entity IDs

---

### Reference 1 — Candidate document

| Field | Value |
|---|---|
| Table | `candidate_documents` |
| Record UUID | `31cb2a43-7ccd-448e-93a7-35edbccd8dc1` |
| Bucket | `candidate-documents` |
| Path (redacted) | `tenants/00000000-0000-0000-0000-000000000001/candidates/<NON_UUID_SLUG>/documents/[REDACTED_FILENAME]` |
| Canonical per app rules? | **NO** (non-UUID candidate segment; filename not `{docId}-vN-…`; fails `isCanonicalCandidateDocumentPath`) |
| Exists in Seoul? | **NO** |
| Likely alternate path object? | **NO** (all alternate searches = 0) |
| Lifecycle appearance | Seed insert cluster; `createdAt`/`updatedAt` identical `2026-09-25T04:18:34Z`; not a later soft-delete remnant |
| Other DB rows same path? | **YES** — 2 other `candidate_documents` rows |
| Referenced elsewhere? | **YES** — `application_materials` count **2** (`isCurrent` **2**); apps `5e97e2e1-…`, `806ff614-…` |
| Classification | **C + D** (incorrect path + documented seed anomaly); also **B** relative to current path invariant |
| Evidence | Exact `fileSizeBytes`/path shape match `scripts/seed-realtime-data.js`; no Storage object ever present under that prefix |
| Recommended next action | Human decide: (1) accept Phase 4 integrity **exception** for this seed cluster, or (2) later remediate metadata (out of scope here). Do **not** fabricate a binary. Do **not** assume safe to delete without app-impact review (materials link live apps). |
| Migration can proceed without changing it? | **Object copy of the 2 real objects: YES.** **Phase 4 “DB↔Storage = 0 missing” VERIFIED gate: NO** without an explicit exception or later remediation. |

---

### Reference 2 — Candidate document

| Field | Value |
|---|---|
| Table | `candidate_documents` |
| Record UUID | `f42ae6df-3eca-4441-b5fe-32cba59ec1a2` |
| Bucket | `candidate-documents` |
| Path (redacted) | Same shared seed path as Reference 1 |
| Canonical per app rules? | **NO** |
| Exists in Seoul? | **NO** |
| Likely alternate path object? | **NO** |
| Lifecycle appearance | Seed cluster; `2026-09-25T04:19:14Z` |
| Other DB rows same path? | **YES** (group of 3) |
| Referenced elsewhere? | **YES** — materials **2** / current **2**; apps `0162c800-…`, `5b606e9c-…` |
| Classification | **C + D** (+ **B** vs current invariant) |
| Evidence | Same as Reference 1; duplicate seed re-insert pattern (~40s later) |
| Recommended next action | Same decision as Reference 1 (treat as one seed cluster) |
| Migration can proceed without changing it? | Same as Reference 1 |

---

### Reference 3 — Candidate document

| Field | Value |
|---|---|
| Table | `candidate_documents` |
| Record UUID | `1358b87c-7395-44f8-939a-3d2d7a3a0cbb` |
| Bucket | `candidate-documents` |
| Path (redacted) | Same shared seed path as Reference 1 |
| Canonical per app rules? | **NO** |
| Exists in Seoul? | **NO** |
| Likely alternate path object? | **NO** |
| Lifecycle appearance | Seed cluster; `2026-09-25T04:19:41Z` |
| Other DB rows same path? | **YES** (group of 3) |
| Referenced elsewhere? | **YES** — materials **4** / current **4**; apps `6e43fd7e-…`, `722be583-…`, `c25b9013-…`, `f7466128-…` |
| Classification | **C + D** (+ **B** vs current invariant) |
| Evidence | Same seed path/size; heaviest application linkage of the three |
| Recommended next action | Same decision as Reference 1 |
| Migration can proceed without changing it? | Same as Reference 1 |

---

### Reference 4 — Submission evidence

| Field | Value |
|---|---|
| Table | `application_submissions` |
| Record UUID | `c16151c0-6be9-429d-bef8-907ecaf8c598` |
| Bucket | `submission-evidence` |
| Path (redacted) | `tenants/00000000-0000-0000-0000-000000000001/applications/c25b9013-ad32-4a94-b049-39ce05ada8a9/submissions/[REDACTED_FILENAME]` |
| Canonical per app rules? | **Partial** — org + application UUID segments match; filename stem is **not** `{submissionId}-…` (seed-style name). Fails full generator invariant. |
| Exists in Seoul? | **NO** (bucket has **0** objects total) |
| Likely alternate path object? | **NO** (app folder, submission-id prefix, same filename: all 0) |
| Lifecycle appearance | Seeded submission; application status **SUBMITTED**; attempt **1** / max **1**; has text `confirmationEvidence` (len 133), external ref/url, notes — binary optional in product model |
| Other DB rows same path? | **NO** |
| Referenced elsewhere? | Parent application `c25b9013-ad32-4a94-b049-39ce05ada8a9` (SUBMITTED). No other submissions share path. |
| Classification | **C + D** (incorrect/non-generator filename + seed anomaly). Not pure **A** (never uploaded). Text evidence present so record is not “empty proof.” |
| Evidence | Matches `scripts/seed-realtime-data.js` pattern `…/submissions/sub-attempt1…` with no Storage upload; entire `submission-evidence` bucket empty |
| Recommended next action | Human decide: (1) treat binary path as seed orphan / optional evidence for migration exception, or (2) later clear/null `storagePath` after product review. Do **not** fabricate PNG. Staff download of this path will fail until remediated. |
| Migration can proceed without changing it? | **Copy of existing candidate objects: YES.** **Strict Phase 4F zero-mismatch VERIFIED: NO** without exception/remediation. |

---

## 5. Classification summary

| Ref | Entity | Classification letters | Unexpected live data loss? |
|---|---|---|---|
| 1 | `candidate_documents` `31cb2a43-…` | **C, D** (also B vs current rules) | **No** — seed path, object never existed |
| 2 | `candidate_documents` `f42ae6df-…` | **C, D** (also B) | **No** |
| 3 | `candidate_documents` `1358b87c-…` | **C, D** (also B) | **No** |
| 4 | `application_submissions` `c16151c0-…` | **C, D** | **No** — seed path; bucket empty; text evidence present |

**Not A:** No evidence of a formerly present object that disappeared.  
**Not E:** Root cause is identified in repository seed code + size/path fingerprints.

---

## 6. Linked application impact (counts only; no PII)

Applications currently linking the seed document cluster via `application_materials`:

| Application status | Count linking missing docs |
|---|---:|
| SUBMITTED | 3 |
| READY | 3 |
| AWAITING_APPROVAL | 2 |

View/Download of these three document rows will fail canonical/object checks by design of current app code.

---

## 7. Implications for Phase 4 (no migration executed)

| Question | Answer |
|---|---|
| Can Seoul’s **2** real `candidate-documents` objects be copied as-is? | **Yes** (credentials now present; paths canonical) |
| Can `submission-evidence` copy move any bytes? | **N/A** — source bucket empty |
| Can Phase 4 be marked **VERIFIED** under current absolute integrity rule (DB refs without target object = 0)? | **No** — 3+1 DB refs have no source object to copy |
| Safe to delete these DB rows during investigation? | **Not evaluated as safe** — live material links; investigation forbids modification |
| Safe to invent replacement files? | **No** (forbidden) |

---

## 8. Decision options for humans (investigation only — not executed)

1. **Accept documented exception** for the seed cluster + seed submission path; run Phase 4 copy/verify for **existing** objects only; record known DB↔Storage gaps in the Phase 4 report as pre-accepted anomalies.  
2. **Remediate metadata later** (null optional submission `storagePath`; retire/replace non-canonical document rows) under a separate authorized change — then re-run Phase 4F.  
3. **Block Phase 4 VERIFIED** until remediation — still allows planning, but not a green Phase 4.

This investigation does **not** choose among these.

---

## 9. Safety confirmation

| Action | Performed? |
|---|---|
| Delete anything | **No** |
| Modify DB | **No** |
| Create/copy Storage objects | **No** |
| Modify Seoul/Mumbai Storage | **No** |
| Modify Auth / Vercel / main `.env` | **No** |
| Start Phase 4 migration | **No** |
| Print secrets / signed URLs / file contents / PII filenames | **No** |

---

## FINAL STATUS

### 🟡 HUMAN DECISION REQUIRED — references need an explicit business decision

**STOP.** Do not start Phase 5. Do not re-run Phase 4 migration until a human decision is recorded for the four seed anomalies above.
