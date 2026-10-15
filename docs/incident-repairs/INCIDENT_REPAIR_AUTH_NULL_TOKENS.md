# Incident Repair Document: Supabase GoTrue Auth Scan Error (`confirmation_token`)

## 1. Executive Summary

- **Incident**: Production users experiencing HTTP 500 `unexpected_failure` during registration and login on `portal.careerbutton.in`.
- **Root Cause**: Seven rows in `auth.users` contain PostgreSQL `NULL` in `confirmation_token`, `recovery_token`, `email_change_token_new`, and `email_change`. Supabase Auth (GoTrue) scans these fields into Go `string` struct members. Go's `database/sql` driver fails to scan SQL `NULL` into a Go `string`, raising:
  `sql: Scan error on column index 3, name "confirmation_token": converting NULL to string is unsupported`
- **Application Flaws Identified & Addressed**:
  1. `src/lib/supabase/admin.ts:createAuthUser` executed a direct PostgreSQL fallback query omitting token columns, defaulting them to `NULL`. (Fixed: token columns now set to `''`, and direct DB fallback is disabled when `SUPABASE_SERVICE_ROLE_KEY` is present).
  2. `src/lib/auth/actions.ts:signInAction` classified all non-unconfirmed errors as `"Invalid email or password"` and penalized the client's rate limit counter even during internal database/upstream outages. (Fixed: 500/database outages now return safe generic unavailable message without rate limit penalty).
  3. `src/lib/auth/actions.ts:signUpCandidateAction` surfaced raw database errors (`"Database error finding user"`) directly to end users. (Fixed: masked with safe user-friendly message).
- **Remediation Status**:
  - Application code fixes implemented and verified via automated test suite.
  - Programmatic, self-asserting database repair SQL prepared at `scripts/repairs/fix-null-auth-tokens.sql`.
  - Database repair **AWAITING EXPLICIT HUMAN APPROVAL** prior to production execution.

---

## 2. Affected Records Audit

Read-only inspection of the production database (`vgrvijugljzlpohsbmjg.supabase.co`) confirmed:
- Total `auth.users` rows: **16**
- Rows with NULL tokens: **Exactly 7**
- Healthy rows with empty string `''` tokens: **9**

| User ID | Email | Role | Status | Created At | Has Password |
|---|---|---|---|---|---|
| `8804c640-ca28-44a5-be55-ec53c9ab9051` | `ruralgreek4@gmail.com` | EMPLOYEE | ACTIVE | 2026-09-26T10:31:40Z | Yes |
| `33d4a773-e32e-44a0-ba59-11796b3974eb` | `balumanthena18@gmail.com` | EMPLOYEE | INVITED | 2026-10-01T12:20:50Z | No |
| `5bfb100a-39dd-42c8-b74e-d0e831bf4c64` | `saddiashrutha@gmail.com` | EMPLOYEE | INVITED | 2026-10-05T08:26:30Z | No |
| `e93b589f-e23e-4d6b-b808-6935f09850c9` | `prashanthjkr@gmail.com` | EMPLOYEE | INVITED | 2026-10-14T06:49:27Z | No |
| `058a57c3-0c31-41dd-aaf1-703da30ae3b0` | `soujanyakarike28@gmail.com` | EMPLOYEE | INVITED | 2026-10-14T09:10:45Z | No |
| `66959197-6955-4b99-b452-75012509cfcf` | `t9250csite@lnovic.com` | CANDIDATE | ACTIVE | 2026-10-14T13:20:02Z | Yes |
| `a4c2346a-6afd-4274-918f-978dfff326f9` | `karikesoujanya2000@gmali.com` | CANDIDATE | INVITED | 2026-10-15T05:32:13Z | No |

---

## 3. Preconditions, In-Flight Assertions & Rollback / Recovery Strategy

### Precondition Check (Read-Only)
```sql
SELECT COUNT(*) FROM auth.users 
WHERE confirmation_token IS NULL 
   OR recovery_token IS NULL 
   OR email_change_token_new IS NULL 
   OR email_change IS NULL;
-- Must return exactly 7
```

### Transactional Execution with Self-Asserting DO Block
The script `scripts/repairs/fix-null-auth-tokens.sql` executes inside a `BEGIN; ... COMMIT;` block utilizing an anonymous PL/pgSQL block with three strict guards:
1. **Precondition assertion**: Confirms exactly 7 rows have NULL tokens before updating; raises exception if count != 7.
2. **Rowcount assertion**: Confirms exactly 7 rows are updated by the query; raises exception if rowcount != 7.
3. **Post-condition assertion**: Confirms 0 rows have NULL tokens; raises exception if remaining > 0.
Any exception immediately aborts the transaction, guaranteeing that no partial or unverified change is committed.

### Rollback vs Recovery
- **Rollback before COMMIT (In-Flight Transaction)**:
  If running interactively outside the DO block and any unexpected condition occurs before `COMMIT;`, issue:
  `ROLLBACK;`
  This cancels all pending changes. The DO block automatically aborts and rolls back on any assertion failure.
- **Recovery after COMMIT (Post-Commit Restoration)**:
  Once `COMMIT;` completes, the transaction is finalized; `ROLLBACK` has no effect. Recovery requires either:
  1. Restoring the pre-repair database snapshot taken before execution.
  2. Executing the documented compensating update reverting the 7 IDs to NULL (note: reverting to NULL re-introduces the GoTrue scan error).
