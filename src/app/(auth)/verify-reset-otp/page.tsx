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
import { CareerButtonLogo } from "@/components/brand/CareerButtonLogo";
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
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F5] px-4 py-12">
        <div className="w-full max-w-md rounded-[20px] bg-white p-8 border border-[#E5EAE7] shadow-[0_4px_24px_rgba(8,47,38,0.06)] space-y-4 text-center">
          <h2 className="text-xl font-bold text-[#082F26]">Password Reset</h2>
          <p className="text-sm text-[#52605B]">
            Start from the forgot password page to receive a verification code.
          </p>
          <Link href="/forgot-password" className="text-sm font-semibold text-[#082F26] hover:text-[#0B3D32] hover:underline">
            Request a code
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF9F5] px-4 py-12 sm:px-6 lg:px-8">
      {/* Back option to main site */}
      <div className="w-full max-w-md mb-3 flex items-center justify-between">
        <a
          href="https://www.careerbutton.in/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52605B] hover:text-[#082F26] transition-colors group"
        >
          <svg
            className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5 text-[#52605B] group-hover:text-[#082F26]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Career Button
        </a>
        <span className="text-[11px] font-medium text-[#082F26] bg-[#EBF2ED] px-2.5 py-0.5 rounded-full">
          Candidate Portal
        </span>
      </div>

      <div className="w-full max-w-md space-y-7 rounded-[20px] bg-white p-6 sm:p-10 shadow-[0_4px_24px_rgba(8,47,38,0.06)] border border-[#E5EAE7]">
        <div>
          <a
            href="https://www.careerbutton.in/"
            title="Career Button Homepage"
            aria-label="Career Button — Return to homepage"
            className="group mx-auto mb-5 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#082F26] focus-visible:ring-offset-2 rounded-lg py-1 transition-opacity hover:opacity-90"
          >
            <CareerButtonLogo className="h-7 sm:h-8 w-auto text-[#082F26]" />
          </a>
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#082F26]">
            Security
          </p>
          <h1 className="mt-2 text-center text-2xl font-bold tracking-tight text-[#082F26]">
            Enter password reset code
          </h1>
          <p className="mt-1.5 text-center text-xs text-[#52605B] font-medium">
            Enter the 8-digit verification code sent to
          </p>
          <p className="mt-1 text-center text-sm font-semibold text-[#081C15]">{masked}</p>
          <p className="mt-3 text-center text-xs text-[#52605B]">
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
              className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-3 text-center text-2xl tracking-[0.35em] font-semibold text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] transition"
              placeholder={OTP_PLACEHOLDER}
            />
            <p id="recovery-otp-hint" className="sr-only">
              Enter the verification code from your email. Typing and paste are supported.
            </p>
          </div>

          <button
            type="submit"
            disabled={pending || token.length !== RECOVERY_OTP_LENGTH}
            aria-busy={pending}
            className="flex w-full justify-center rounded-[11px] bg-[#082F26] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0B3D32] focus:outline-none focus:ring-2 focus:ring-[#082F26] focus:ring-offset-2 disabled:opacity-50 transition active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed"
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
              className="font-semibold text-[#52605B] hover:text-[#082F26]"
            >
              Use a different email
            </Link>
          </div>

          <div className="pt-2 border-t border-[#E5EAE7] text-center text-xs text-[#52605B] space-y-1">
            <div>
              Need candidate assistance?{" "}
              <a
                href="https://wa.me/919110543176"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#082F26] hover:underline"
              >
                Contact on WhatsApp (+91 91105 43176)
              </a>
            </div>
            <div className="text-[11px] text-[#718096]">
              Email:{" "}
              <a
                href="mailto:support@careerbutton.in"
                className="font-semibold text-[#082F26] hover:underline"
              >
                support@careerbutton.in
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Portal footer */}
      <footer className="mt-8 text-center text-xs text-[#52605B] space-y-1">
        <p>© {new Date().getFullYear()} Career Button. All rights reserved.</p>
        <p className="text-[11px] text-[#718096]">
          Candidate Client Portal •{" "}
          <a href="https://www.careerbutton.in" className="hover:underline text-[#082F26]">
            careerbutton.in
          </a>
        </p>
      </footer>
    </div>
  );
}

export default function VerifyResetOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F5] px-4 py-12">
          <p className="text-sm text-[#52605B]">Loading verification…</p>
        </div>
      }
    >
      <VerifyResetOtpForm />
    </Suspense>
  );
}
