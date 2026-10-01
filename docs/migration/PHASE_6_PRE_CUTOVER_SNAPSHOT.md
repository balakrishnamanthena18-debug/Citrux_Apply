# Phase 6 — Pre-Cutover Snapshot

**Document type:** PRE-CUTOVER PRODUCTION SNAPSHOT (NO SECRETS)  
**Timestamp (UTC):** 2026-10-01T09:16:00Z  
**Purpose:** Reconstruct Seoul production targeting if rollback is required  
**Cutover status at snapshot time:** **NOT STARTED** (blocked on Vercel project identity)

---

## 1. Application / Git

| Item | Value |
|---|---|
| Repository | `https://github.com/balakrishnamanthena18-debug/Citrux_Apply.git` |
| Local branch | `main` |
| Local HEAD | `9c7ffd97ce188944cb94e40d2506162203ecce1e` |
| Latest local commit message | `feat(perf): Phase 10 navigation Time-to-Usable and perceived latency` |
| Tracking | `main...origin/main` (local also has uncommitted migration docs/scripts) |

---

## 2. Production domain (public observation)

| Item | Value |
|---|---|
| Production URL | `https://citrux-apply.vercel.app` |
| `/api/health` | HTTP 200 · `{"status":"pass","service":"oos","phase":"0"}` |
| `/login` | HTTP 200 |
| HTTPS / HSTS | Present (`strict-transport-security` preload) |
| Security headers observed | `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy`, `permissions-policy` |
| `x-vercel-id` region hint | `bom1` (Mumbai edge) |
| Current DB/Supabase region behind app | **Not readable from health JSON** (no project ref exposed) |

---

## 3. Vercel CLI account available to this agent

| Item | Value |
|---|---|
| CLI user | `balumanthena` |
| Team / scope | `balakrishnas-projects-1cd73668` (“balakrishna's projects”, Hobby) |
| Domain ACL for `citrux-apply.vercel.app` | **403 forbidden** — this account **does not** have access |
| Cutover eligibility under this login | **BLOCKED** |

### Nearby projects under this account (NOT confirmed production OOS)

| Project | ID | Production URL | Note |
|---|---|---|---|
| `citruxapply` | `prj_r673q5O1L1p6NnMNZQfGQ8YEZxw8` | `https://citruxapply.vercel.app` | Different hostname (no hyphen) |
| `citruxapplysite` | `prj_xn5tRqWVDoyCF9na8qYEEhP5ysop` | (none listed) | Created ~4d ago; no prod URL |

**These were NOT modified.** Safety rule: do not change an unverified / wrong project.

---

## 4. Expected Supabase targets (migration context)

| Role | Project ref (public) | Region |
|---|---|---|
| Current intended production source | `auzikqapcgtgqwotnldq` | `ap-northeast-2` (Seoul) |
| Cutover target | `vgrvijugljzlpohsbmjg` | `ap-south-1` (Mumbai) |
| Source ≠ Target | **YES** |

---

## 5. Local developer `.env` fingerprint (Seoul-oriented)

Presence only — **no secret values**.

| Variable | State | Host / target hint |
|---|---|---|
| `DATABASE_URL` | CONFIGURED (`sha256_8=3370274b`) | `aws-0-ap-northeast-2.pooler.supabase.com` (Seoul) |
| `DIRECT_URL` | CONFIGURED (`sha256_8=ff372e71`) | `aws-0-ap-northeast-2.pooler.supabase.com` (Seoul) |
| `NEXT_PUBLIC_SUPABASE_URL` | CONFIGURED (`sha256_8=afc61df6`) | `auzikqapcgtgqwotnldq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | CONFIGURED (`sha256_8=435c903a`) | (key material not shown) |
| `SUPABASE_SERVICE_ROLE_KEY` | **NOT CONFIGURED** in local `.env` | Likely Production-only on Vercel |
| `CRON_SECRET` | **NOT CONFIGURED** in local `.env` | Likely Production-only on Vercel |
| `OPERATING_ORGANIZATION_ID` | CONFIGURED | (UUID org constant) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | CONFIGURED | Reuse for Mumbai (not region-specific) |
| `NODE_ENV` | CONFIGURED | development locally |

**Implication:** Exact Production Vercel env var **values** for Seoul could not be exported from this account. Operator must capture them from the Vercel project that owns `citrux-apply.vercel.app` before cutover.

---

## 6. Mumbai migration env fingerprint (gitignored `.migration-mumbai.env`)

| Variable | State | Host / target hint |
|---|---|---|
| `TARGET_SUPABASE_URL` | CONFIGURED | `vgrvijugljzlpohsbmjg.supabase.co` |
| `TARGET_SUPABASE_ANON_KEY` | CONFIGURED | — |
| `TARGET_SUPABASE_SERVICE_ROLE_KEY` | CONFIGURED | — |
| `NEW_DB_URL` | CONFIGURED | `aws-0-ap-south-1.pooler.supabase.com` |
| `NEW_DIRECT_URL` | CONFIGURED | `aws-0-ap-south-1.pooler.supabase.com` |
| `OOS_APP_RUNTIME_PASSWORD` | CONFIGURED | for `oos_app_runtime` role |

---

## 7. Phase 5 gate (precondition)

| Item | Status |
|---|---|
| Report | `docs/migration/PHASE_5_APPLICATION_VERIFICATION_REPORT.md` |
| Final status | 🟡 VERIFIED WITH WARNINGS |
| Critical blockers | None documented |
| D1 storage exceptions | Documented |
| Tests / typecheck / lint / build | 673/673 · PASS · PASS · PASS |

---

## 8. Snapshot limitations

Because the authenticated Vercel account cannot access `citrux-apply.vercel.app`:

- Production deployment ID — **UNKNOWN**
- Production commit on Vercel — **UNKNOWN**
- Full Production env var name list on Vercel — **UNKNOWN**
- Confirmation that Production still points at Seoul — **INFERRED from migration history, not re-read from Vercel**

Operator action required before cutover can resume.
