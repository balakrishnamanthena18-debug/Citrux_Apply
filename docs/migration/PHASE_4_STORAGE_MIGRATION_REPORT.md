# Phase 4 — Storage Migration Report (Seoul → Mumbai)

**Document type:** CONTROLLED EXECUTION REPORT — STORAGE OBJECT COPY + VERIFICATION  
**Date:** 2026-10-01  
**Env:** `.migration-mumbai.env` only (gitignored)  
**Prerequisites:** Phase 1–3 VERIFIED; Phase 4 remediation VERIFIED (`PHASE_4_STORAGE_EXCEPTIONS.md`)

---

## FINAL STATUS

### 🟢 PHASE 4 STORAGE MIGRATION — VERIFIED

---

## 1. Identity / region

| Item | Value |
|---|---|
| Source project | Seoul `auzikqapcgtgqwotnldq` |
| Source region | `ap-northeast-2` (production; unchanged) |
| Target project | Mumbai `vgrvijugljzlpohsbmjg` |
| Target region | **`ap-south-1`** |
| Source ≠ Target | **PASS** |
| Main `.env` | **UNCHANGED** |
| Vercel | **UNCHANGED** |
| Auth | **UNCHANGED** |
| DB schema / `candidate_documents` / `application_materials` | **UNCHANGED** (except prior approved submission NULL) |

---

## 2. Tooling note (migration script)

Seoul service-role can **list/download objects** but `listBuckets` / `getBucket` return empty / not found.  
Copy proceeded under **`CONFIRM_SOURCE_BUCKETS_PRIVATE=YES`** after out-of-band confirmation that Seoul `storage.buckets.public = false` for both OOS buckets.

Script hardening applied in-repo (unit-tested):

- Object-plane fallback when bucket admin APIs are unavailable  
- **`BLOCKED_TARGET_CONFLICT`** — refuse overwrite of differing target objects (`upsert: false`)

---

## 3. Pre-copy inventory

| Bucket | Source objects | Target objects (before) |
|---|---:|---:|
| `candidate-documents` | **2** | **0** |
| `submission-evidence` | **0** | **0** |

Source object shapes (no filenames): both paths use UUID candidate segment (6 segments); sizes **88569** (`image/jpeg`) and **37544** (DOCX MIME).

---

## 4. Copy result

| Metric | Result |
|---|---|
| Script | `scripts/migration/supabase-storage-migrate.ts` |
| `candidate-documents` copied | **2** (`COPIED`) |
| `submission-evidence` copied | **0** (none to copy) |
| Fabricated seed binaries | **None** |
| Source deletes / renames | **None** |
| Conflicts | **0** |

---

## 5. Post-copy verification (`supabase-storage-verify.ts`)

| Bucket | Source | Target | MISSING | EXTRA | MISMATCH | MATCH |
|---|---:|---:|---:|---:|---:|---:|
| `candidate-documents` | 2 | 2 | 0 | 0 | 0 | **2** |
| `submission-evidence` | 0 | 0 | 0 | 0 | 0 | — |

| Check | Result |
|---|---|
| Exact paths preserved | **PASS** (verify path-set identity) |
| Sizes match | **PASS** |
| Content types match | **PASS** |
| SHA-256 body hashes (download both sides) | **2 / 2 MATCH** |
| Unexpected target objects | **0** |

---

## 6. DB ↔ Storage integrity (Mumbai) with D1 exception

**Documented exceptions (D1)** — excluded from completeness failures:

| `candidate_documents.id` |
|---|
| `31cb2a43-7ccd-448e-93a7-35edbccd8dc1` |
| `f42ae6df-3eca-4441-b5fe-32cba59ec1a2` |
| `1358b87c-7395-44f8-939a-3d2d7a3a0cbb` |

Reason: seed artifacts from `scripts/seed-realtime-data.js`; binaries never existed in Seoul. Records preserved unchanged. See `PHASE_4_STORAGE_EXCEPTIONS.md`.

| Check | Expected | Actual |
|---|---:|---:|
| Non-exception CD refs missing Mumbai object | 0 | **0** |
| Non-exception CD refs with object present | 2 | **2** |
| Documented exceptions still without object | 3 | **3** |
| Unexpected DB→Storage mismatches | 0 | **0** |
| Submissions with non-null path missing object | 0 | **0** |
| `c16151c0-…` `storagePath` | NULL | **NULL** (no object required) |

---

## 7. Bucket privacy / security

| Check | Result |
|---|---|
| Mumbai `candidate-documents` private | **PASS** (`public=false`) |
| Mumbai `submission-evidence` private | **PASS** (`public=false`) |
| Seoul buckets private (DB) | **PASS** |
| Anon download of migrated object | **Blocked** (no data) |
| SDK public URL string shape | Present as helper only; download not granted |
| Source object counts after copy | CD **2**, SE **0** (unchanged) |

---

## 8. Source immutability

| Check | Result |
|---|---|
| Seoul CD object count | **2** (unchanged) |
| Seoul SE object count | **0** (unchanged) |
| Source objects deleted/renamed | **No** |
| Source buckets publicized | **No** |

---

## 9. Tests

| Suite | Result |
|---|---|
| `tests/unit/migration/supabase-storage-migrate.test.ts` | **18 PASS** |
| `tests/integration/candidate-storage.test.ts` | **19 PASS** |
| `tests/integration/submission-storage.test.ts` | **5 PASS** |
| `tests/integration/client-boundary-security.test.ts` | **4 PASS** |
| **Total this run** | **46 / 46 PASS** |

---

## 10. Summary counts

| Metric | Value |
|---|---:|
| Source `candidate-documents` | 2 |
| Target `candidate-documents` | 2 |
| Source `submission-evidence` | 0 |
| Target `submission-evidence` | 0 |
| Copied objects | 2 |
| Path verification | PASS |
| Content verification (size/MIME/SHA-256) | PASS |
| Known D1 exceptions | 3 |
| Unexpected DB↔Storage mismatches | 0 |

---

## 11. Explicit non-actions

- Phase 5 **not** started  
- Vercel **not** modified  
- Main `.env` **not** modified  
- Production cutover **not** performed  
- Seoul project **not** deleted  
- Three seed `candidate_documents` **not** altered  
- No fabricated files created  

---

## FINAL STATUS

### 🟢 PHASE 4 STORAGE MIGRATION — VERIFIED

**STOP.** Do not begin Phase 5 automatically.
