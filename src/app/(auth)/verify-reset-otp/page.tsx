"use client";

import { Suspense, useActionState, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  verifyRecoveryOtpFormAction,
  type VerifyRecoveryOtpState,
} from "@/lib/auth/password-reset-actions";
import {
  maskEmailAddress,
  normalizeRecoveryOtpInput,
  RECOVERY_OTP_LENGTH,
} from "@/lib/validation/auth.schemas";
import {
  PASSWORD_RESET_EMAIL_STORAGE_KEY,
  clearPasswordResetEmailSession,
  readPasswordResetEmailFromSession,
} from "@/lib/auth/password-reset-client";
import { ResendRecoveryCodeButton } from "./ResendRecoveryCodeButton";

const INITIAL_STATE: VerifyRecoveryOtpState = {
  error: null,
  redirectUrl: null,
};

const OTP_PLACEHOLDER = "•".repeat(RECOVERY_OTP_LENGTH);

function VerifyResetOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = (() => {
    const fromQuery = (searchParams.get("email") || "").trim().toLowerCase();
    const fromSession = readPasswordResetEmailFromSession();
    return fromQuery || fromSession || "";
  })();
  const [email] = useState(initialEmail);
  const [token, setToken] = useState("");
  const [state, formAction, pending] = useActionState(
    verifyRecoveryOtpFormAction,
    INITIAL_STATE
  );

  useEffect(() => {
    if (!email) return;
    try {
      sessionStorage.setItem(PASSWORD_RESET_EMAIL_STORAGE_KEY, email);
    } catch {
      // ignore
    }
  }, [email]);

  useEffect(() => {
    if (state.redirectUrl) {
      router.push(state.redirectUrl);
    }
  }, [state.redirectUrl, router]);

  const masked = useMemo(() => (email ? maskEmailAddress(email) : ""), [email]);

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12">
        <div className="w-full max-w-md rounded-[20px] bg-white p-8 border border-[#E5EAE7] space-y-4 text-center">
          <h2 className="text-xl font-bold text-[#0F1720]">Verify your email</h2>
          <p className="text-sm text-[#64748B]">
            Start from the forgot password page to receive a verification code.
          </p>
          <Link href="/forgot-password" className="text-sm font-semibold text-[#12A150]">
            Request a code
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_18px_rgba(15,23,32,0.04)] border border-[#E5EAE7]">
        <div>
          <div className="mx-auto w-10 h-10 rounded-[12px] bg-[#0B3B2C] text-white flex items-center justify-center font-bold text-[10px] tracking-wide shadow-2xs mb-4 relative">
            <span>OOS</span>
            <span className="w-2 h-2 rounded-full bg-[#C6F432] absolute -top-0.5 -right-0.5 ring-2 ring-white" />
          </div>
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#12A150]">
            Security
          </p>
          <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-[#0F1720]">
            Verify your email
          </h2>
          <p className="mt-1.5 text-center text-xs text-[#64748B] font-medium">
            Enter the verification code we sent to
          </p>
          <p className="mt-1 text-center text-sm font-semibold text-[#0F1720]">{masked}</p>
          <p className="mt-3 text-center text-xs text-[#64748B]">
            If an account exists for this email, we&apos;ve sent a verification code.
            You can type or paste the full code.
          </p>
        </div>

        {state.error && (
          <div
            className="rounded-[12px] bg-rose-50 p-4 text-xs font-semibold text-rose-700 border border-rose-200"
            role="alert"
          >
            {state.error}
          </div>
        )}

        <form className="mt-2 space-y-5" action={formAction}>
          <input type="hidden" name="email" value={email} />
          <div>
            <label
              htmlFor="token"
              className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider"
            >
              Verification code
            </label>
            <input
              id="token"
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern={`\\d{${RECOVERY_OTP_LENGTH}}`}
              minLength={RECOVERY_OTP_LENGTH}
              maxLength={RECOVERY_OTP_LENGTH}
              required
              aria-label="Verification code"
              aria-describedby="recovery-otp-hint"
              value={token}
              onChange={(e) => {
                const next = normalizeRecoveryOtpInput(e.target.value);
                if (next !== null) setToken(next);
              }}
              className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-3 text-center text-2xl tracking-[0.35em] font-semibold text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] transition"
              placeholder={OTP_PLACEHOLDER}
            />
            <p id="recovery-otp-hint" className="sr-only">
              Enter the verification code from your email. Typing and paste are supported.
            </p>
          </div>

          <button
            type="submit"
            disabled={pending || token.length !== RECOVERY_OTP_LENGTH}
            className="flex w-full justify-center rounded-[11px] bg-[#0B3B2C] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0E8541] focus:outline-none focus:ring-2 focus:ring-[#12A150] focus:ring-offset-2 disabled:opacity-50 transition"
          >
            {pending ? "Verifying..." : "Verify code"}
          </button>
        </form>

        <div className="space-y-3">
          <ResendRecoveryCodeButton email={email} />
          <div className="text-center text-xs">
            <Link
              href="/forgot-password"
              onClick={() => clearPasswordResetEmailSession()}
              className="font-semibold text-[#64748B] hover:text-[#0F1720]"
            >
              Use a different email
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyResetOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12">
          <p className="text-sm text-[#64748B]">Loading verification…</p>
        </div>
      }
    >
      <VerifyResetOtpForm />
    </Suspense>
  );
}
