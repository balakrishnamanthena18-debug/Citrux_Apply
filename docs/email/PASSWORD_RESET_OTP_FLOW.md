# Password reset — Email OTP flow

## Root cause of prior `otp_expired`

1. Recovery emails used Supabase `{{ .ConfirmationURL }}`.
2. Email security scanners prefetch that one-time link and consume the recovery token.
3. Site URL / redirect often resolved to `localhost:3000`, producing:
   `/?error=access_denied&error_code=otp_expired`.

## Implemented app flow

```
/forgot-password
  → requestPasswordResetAction (resetPasswordForEmail)
  → /verify-reset-otp
  → verifyRecoveryOtpAction (verifyOtp type=recovery)
  → /reset-password (requires recovery session)
  → resetPasswordAction (updateUser password + signOut)
  → /login
```

## Supabase recovery template (repo)

OTP-first template in `src/lib/email/supabase-auth/templates.ts`:

- Subject: `Your OOS password reset code`
- Body uses `{{ .Token }}` only (no ConfirmationURL CTA)

### Apply to Mumbai (separate step; requires Management API token)

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...
npx tsx scripts/apply-supabase-auth-smtp.ts --templates-only
```

Or paste the recovery HTML from the template builder in the Mumbai Auth dashboard.

Until the Mumbai recovery template is updated, production emails may still show the old link-based content even though the app OTP screens work.
