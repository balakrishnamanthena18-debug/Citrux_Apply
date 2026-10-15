import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { buildAppUrl, isAllowedRedirectUrl } from "@/lib/url";
import { type EmailOtpType } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/callback
 *
 * Production-hardened auth callback handler:
 * 1. Handles Supabase email confirmation via token_hash + type (verifyOtp).
 * 2. Handles PKCE code exchanges via code (exchangeCodeForSession).
 * 3. Validates redirect destination strictly against approved application URLs.
 * 4. Resolves destination using buildAppUrl to prevent open redirects and localhost leakage in production.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next");

  // Validate redirect destination against approved origins/paths; default to confirmed login
  const next = isAllowedRedirectUrl(rawNext) ? rawNext!.trim() : "/login?confirmed=true";

  const supabase = await createServerClient();

  // 1. Verify OTP for token_hash links (direct email confirmation link)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      return NextResponse.redirect(buildAppUrl(next));
    }
  }

  // 2. Exchange authorization code for authenticated session (PKCE)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(buildAppUrl(next));
    }
  }

  return NextResponse.redirect(buildAppUrl("/login?error=auth_callback_failed"));
}
