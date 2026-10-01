# OOS Supabase Seoul → Mumbai
# Phase 1 Target Preparation Report

**Date:** 2026-10-01 (retry)  
**Phase:** 1 — Target Credential Configuration & Final Preflight  
**Migration data transfer:** NOT EXECUTED  

---

## PHASE 1 GATE

### 🔴 BLOCKED

**Reason:** Required Mumbai target environment variables are **MISSING** from the agent/operator session visible to Phase 1 tooling. No target project can be reached or prepared.

This retry did **not** modify Seoul, Vercel, or main `.env`.

---

## Source

| Item | Value |
|---|---|
| Region | `ap-northeast-2` |
| Status | **UNCHANGED** |
| Project (redacted) | `auzikqap…` |

---

## Target

| Item | Value |
|---|---|
| Region | `ap-south-1` (**NOT VERIFIED**) |
| Status | **BLOCKED** |
| Project (redacted) | **UNRESOLVED** |

---

## Project Identity

| Check | Result |
|---|---|
| Source ≠ Target | **FAIL** (target unresolved — cannot complete safety comparison) |
| Catastrophic same-ref risk | N/A — target credentials not loaded |

---

## Step 1 — Discovered variable convention

From repository migration tooling / execution plan:

| Purpose | Established names |
|---|---|
| Storage scripts | `SOURCE_SUPABASE_URL`, `SOURCE_SUPABASE_SERVICE_ROLE_KEY`, `TARGET_SUPABASE_URL`, `TARGET_SUPABASE_SERVICE_ROLE_KEY` |
| DB dump/restore plan | `OLD_DB_URL` / `NEW_DB_URL` (Session `:5432`), optional `NEW_DIRECT_URL` |
| Project refs | `SOURCE_PROJECT_REF` / `TARGET_PROJECT_REF` (or `OLD_PROJECT_REF` / `NEW_PROJECT_REF`) |

Main application `.env` remains Seoul-only (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`). **Not modified.**

---

## Step 2 — Target configuration presence

| Variable | Status |
|---|---|
| `TARGET_PROJECT_REF` | **MISSING** |
| `NEW_PROJECT_REF` | **MISSING** |
| `NEW_DB_URL` | **MISSING** |
| `NEW_DIRECT_URL` | **MISSING** |
| `TARGET_SUPABASE_URL` | **MISSING** |
| `TARGET_SUPABASE_SERVICE_ROLE_KEY` | **MISSING** |
| `TARGET_SUPABASE_ANON_KEY` | **MISSING** |
| `SOURCE_PROJECT_REF` | **MISSING** (derivable from main `.env` URL) |
| `DIRECT_URL` (main Seoul) | **CONFIGURED** |
| `DATABASE_URL` (main Seoul) | **CONFIGURED** |
| `NEXT_PUBLIC_SUPABASE_URL` (main Seoul) | **CONFIGURED** |

**Process environment:** no `TARGET_*` / `NEW_DB_*` / `MUMBAI*` keys.  
**Local files checked:** `.env`, `.env.local`, `.env.migration`, `.env.mumbai`, `scripts/migration/.env`, home candidates — **no Mumbai credential file found**.

Per prompt rule: **STOP** when required target variables are missing. No DB/Supabase target commands executed.

---

## Target Database

| Item | Status |
|---|---|
| Connection | **FAIL** (credentials missing) |
| TLS | **FAIL** (not tested — unreachable) |
| Unexpected data | **NOT INSPECTED** |

---

## Target Auth

| Item | Status |
|---|---|
| Auth service | **FAIL** (not reachable) |
| JWT | Mumbai native (policy unchanged; not modified) |
| User migration | **NOT EXECUTED** |

---

## Target Storage

| Item | Status |
|---|---|
| `candidate-documents` | **FAIL** / not created |
| `submission-evidence` | **FAIL** / not created |
| Privacy | **PRIVATE** (requirement unchanged) |
| Objects | **NOT MIGRATED** |

Policies: deferred — **POLICIES WILL BE APPLIED DURING DATABASE/STORAGE MIGRATION** (not invented here).

---

## Target Realtime

**FAIL** (not reachable)

---

## PostgreSQL Extensions

**FAIL** (target unreachable; `pgcrypto` still REQUIRED when target is available)

---

## oos_app_runtime

**FAIL** (not created — target unreachable; password not generated/printed)

---

## Migration Tests

**16/16 PASS** (`tests/unit/migration/supabase-storage-migrate.test.ts`)

---

## Production Safety

| Item | Status |
|---|---|
| Seoul | **UNCHANGED** |
| Vercel | **UNCHANGED** |
| Main `.env` | **UNCHANGED** (still Seoul / `ap-northeast-2`) |
| Production | **UNCHANGED** |
| Secrets printed | **NO** |
| Secrets committed | **NO** |
| Dump restored | **NO** |
| Production data copied | **NO** |

---

## How to unblock Phase 1

Export Mumbai credentials into the **same shell/session** that runs the agent (or a gitignored file the agent is instructed to load), **without** replacing main `.env`:

```bash
# Example names — supply real values locally; never commit
export TARGET_PROJECT_REF='<mumbai-ref>'
export SOURCE_PROJECT_REF='<seoul-ref>'   # must differ
export NEW_DB_URL='postgresql://postgres.<mumbai-ref>:****@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
export NEW_DIRECT_URL="$NEW_DB_URL"       # or distinct session/direct URL
export TARGET_SUPABASE_URL='https://<mumbai-ref>.supabase.co'
export TARGET_SUPABASE_SERVICE_ROLE_KEY='****'
# optional for later storage scripts:
export SOURCE_SUPABASE_URL='https://<seoul-ref>.supabase.co'
export SOURCE_SUPABASE_SERVICE_ROLE_KEY='****'
```

Then re-run this Phase 1 prompt. The agent will:

1. Confirm `SOURCE_PROJECT_REF != TARGET_PROJECT_REF`  
2. Confirm region `ap-south-1`  
3. Verify empty target / Auth / Storage / Realtime / `pgcrypto` / `oos_app_runtime`  
4. Create private buckets if missing  

**Do not paste secret values into chat.**

---

## Phase 1 Gate

### 🔴 BLOCKED

**Do not start Phase 2.**

---

## FINAL STATUS

**PHASE 1:** BLOCKED  

**TARGET:** Mumbai / `ap-south-1` — NOT VERIFIED  

**SOURCE:** Seoul / `ap-northeast-2`  

**DATABASE MIGRATION:** NOT EXECUTED  

**AUTH MIGRATION:** NOT EXECUTED  

**STORAGE OBJECT MIGRATION:** NOT EXECUTED  

**VERCEL:** UNCHANGED  

**MAIN .env:** UNCHANGED  

**SEOUL:** UNCHANGED  

**STOP.**
