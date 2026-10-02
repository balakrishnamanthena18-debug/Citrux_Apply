# GLOBAL SMTP AUTH EMAIL HARDENING

**Document type:** Forensic audit + implementation report (corrected)  
**Date (UTC):** 2026-10-02  
**Production app:** `citrux-apply-mrgx` · `https://citrux-apply-mrgx.vercel.app/`  
**Production Supabase:** Mumbai `vgrvijugljzlpohsbmjg` (`ap-south-1`)  
**Excluded:** Seoul `auzikqapcgtgqwotnldq` (must not be modified)

---

## FINAL STATUS

### IMPLEMENTATION PRESENT IN WORKING TREE — NOT COMMITTED TO `origin/main` — PRODUCTION SMTP CONFIGURATION PENDING

| Layer | Status |
|---|---|
| Branded Supabase Auth templates (`src/lib/email/supabase-auth/`) | Present in **local working tree** |
| Applicator (`scripts/apply-supabase-auth-smtp.ts`) | Present in **local working tree** |
| npm scripts `email:apply-supabase-auth-smtp*` | Present in **local `package.json`** (uncommitted vs HEAD) |
| Committed on `main` / `origin/main` | **NO** (as of forensic check) |
| Mumbai Auth custom SMTP applied | **NO** (not run; no token used in this remediation) |
| Production inbox From = OOS/Gmail | **NOT VERIFIED** |

---

## FORENSIC CORRECTION — REPORT / REPO MISMATCH

### Symptom

```text
npm run email:apply-supabase-auth-smtp:dry-run
→ npm error Missing script: "email:apply-supabase-auth-smtp:dry-run"
```

### Evidence gathered (2026-10-02)

| Check | Result |
|---|---|
| `pwd` | `/Users/balakrishna/apply_citrux` |
| Branch | `main` tracking `origin/main` |
| `HEAD` commit | `c4b8613` (OOS transactional email design system only) |
| `git show HEAD:package.json` scripts | **No** `email:apply-supabase-auth-smtp*` entries |
| `git ls-tree origin/main` for applicator / supabase-auth / docs/email | **Absent** |
| Working tree | `M package.json`, `?? scripts/apply-supabase-auth-smtp.ts`, `?? src/lib/email/supabase-auth/`, `?? docs/email/`, `?? tests/unit/supabase-auth-email-templates.test.ts` |
| First dry-run after locating scripts | Script found, then `sh: tsx: command not found` (`tsx` not in `node_modules`) |

### Classification

**D + E (with secondary runner defect):**

- **D** — Changes were generated in the agent session but **never persisted** via git commit / push.
- **E** — The prior report described those local artifacts as “shipped,” which overstated repository durability (they were not on `origin/main`).
- Secondary: even in the working tree, scripts invoked bare `tsx`, which is **not** an installed dependency (migration CLIs use `npx tsx` shebang convention).

This is **not** “script missing while package.json has scripts,” and **not** “wrong branch” for this workspace — the files existed only as **uncommitted** local files.

---

## 1. Existing email architecture

### PATH A — OOS application emails (Gmail SMTP via Nodemailer)

```
OOS Server Action
  → emailNotificationService
  → GmailSmtpAdapter (Nodemailer)
  → smtp.gmail.com
  → EMAIL_FROM
```

Committed on `main` since `c4b8613`.

### PATH B — Supabase Auth emails

```
requestPasswordResetAction → supabase.auth.resetPasswordForEmail
  → Supabase Auth (token authority unchanged)
  → [still default until Mumbai custom SMTP is applied]
  → noreply@mail.app.supabase.io
```

Target after Auth SMTP apply (separate future step):

```
Supabase Auth → Mumbai custom SMTP → Gmail → OOS sender
```

---

## 2. Auth flows in repo (unchanged)

| Flow | Mechanism |
|---|---|
| Password reset | `resetPasswordForEmail` |
| Password update | `updateUser({ password })` |
| Candidate signup | `signUp` |
| Staff activation | **OOS** Nodemailer template (not Supabase invite mailer) |
| OTP / magic link in app UI | Not used |

---

## 3–4. Gmail / applicator (local)

Applicator: `scripts/apply-supabase-auth-smtp.ts`

Guards:

- Target **only** Mumbai `vgrvijugljzlpohsbmjg`
- **Refuse** Seoul `auzikqapcgtgqwotnldq`
- Never print `SMTP_PASS` or `SUPABASE_ACCESS_TOKEN`
- `--dry-run` performs **no** Management API mutation

npm scripts (local `package.json`):

```json
"email:apply-supabase-auth-smtp": "npx --yes tsx scripts/apply-supabase-auth-smtp.ts",
"email:apply-supabase-auth-smtp:dry-run": "npx --yes tsx scripts/apply-supabase-auth-smtp.ts --dry-run"
```

Uses `npx --yes tsx` to match migration script convention (`#!/usr/bin/env npx tsx`) without requiring a committed `tsx` dependency.

---

## 5. Templates (local working tree)

`src/lib/email/supabase-auth/` — branded Go templates preserving:

- `{{ .ConfirmationURL }}`
- `{{ .Token }}`
- other official Supabase Auth variables

---

## 6. Verification (this remediation)

| Check | Result |
|---|---|
| `npm run email:apply-supabase-auth-smtp:dry-run` | **PASS** — Mumbai target + `NO MUTATION PERFORMED: true` |
| Live apply / `SUPABASE_ACCESS_TOKEN` | **Not used** in this remediation |
| Vercel / Mumbai / Seoul mutation | **None** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm test` | **PASS** — 106 files / 687 tests (current working tree) |
| `npm run build` | **PASS** |
| Production inbox verification | **Still pending** |

---

## 7. Operator next steps (separate from this forensic fix)

1. **Commit** these working-tree files so `origin/main` matches the report (ask explicitly before push).
2. Later, with Owner/Admin Management API token (separate task): apply Mumbai Auth SMTP.
3. Trigger production forgot-password and confirm From is not `noreply@mail.app.supabase.io`.

Do **not** claim `ACCEPTED / VERIFIED / FROZEN` until inbox proof exists after Auth SMTP apply.
