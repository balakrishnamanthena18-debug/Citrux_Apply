"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  signUpCandidateAction,
  resendVerificationEmailAction,
} from "@/lib/auth/actions";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCheckEmail = searchParams.get("checkEmail") === "true";
  const initialEmail = searchParams.get("email") || "";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(initialCheckEmail);
  const [submittedEmail, setSubmittedEmail] = useState(initialEmail);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(initialCheckEmail ? 60 : 0);
  const [resendFeedback, setResendFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const isSubmittingRef = useRef(false);
  const isResendingRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const enteredEmail = String(formData.get("email") || "").trim().toLowerCase();
      const result = await signUpCandidateAction(formData);

      if (!result.success) {
        setError(result.error || "Registration failed");
        return;
      }

      if (result.data?.emailConfirmationRequired) {
        setSubmittedEmail(result.data.email || enteredEmail);
        setIsSubmitted(true);
        setResendCooldown(60);
      } else if (result.data?.redirectUrl) {
        window.location.assign(result.data.redirectUrl);
      } else {
        setSubmittedEmail(enteredEmail);
        setIsSubmitted(true);
        setResendCooldown(60);
      }
    } catch (err: any) {
      console.error("[REGISTER_CLIENT_ERROR]", err);
      setError(
        err?.message || "An unexpected error occurred during registration. Please try again."
      );
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  }

  async function handleResend() {
    if (isResendingRef.current || resending || resendCooldown > 0 || !submittedEmail) {
      return;
    }
    isResendingRef.current = true;
    setResending(true);
    setResendFeedback(null);

    try {
      const formData = new FormData();
      formData.set("email", submittedEmail);
      const result = await resendVerificationEmailAction(formData);

      if (!result.success) {
        setResendFeedback({
          type: "error",
          message:
            result.error ||
            "Unable to resend verification email right now. Please try again later.",
        });
      } else {
        setResendFeedback({
          type: "success",
          message:
            "A new verification email has been requested. Please check your inbox shortly.",
        });
        setResendCooldown(60);
      }
    } catch {
      setResendFeedback({
        type: "error",
        message:
          "Unable to resend verification email right now. Please check your internet connection.",
      });
    } finally {
      isResendingRef.current = false;
      setResending(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F9F8] px-4 py-12 sm:px-6 lg:px-8">
        {/* Back option to main site */}
        <div className="w-full max-w-md mb-3 flex items-center justify-between">
          <a
            href="https://www.careerbutton.in/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#0B3B2C] transition-colors group"
          >
            <svg
              className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5 text-[#94A3B8] group-hover:text-[#0B3B2C]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to CareerButton
          </a>
        </div>

        <div className="w-full max-w-md space-y-6 rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_18px_rgba(15,23,32,0.04)] border border-[#E5EAE7]">
          {/* Top Brand & Mail Illustration */}
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#E8F8EE] text-[#12A150] border border-[#C3ECD3] relative shadow-2xs">
              <svg
                className="w-7 h-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#12A150] text-white ring-2 ring-white">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
            </div>

            <h2 className="text-center text-2xl font-bold tracking-tight text-[#0F1720]">
              Check your email
            </h2>
            <p className="mt-1 text-center text-sm text-[#64748B]">
              You&apos;re one step away from activating your Operations OS account.
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-center" role="status">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#E8F8EE] px-3.5 py-1.5 text-xs font-semibold text-[#0B3B2C] border border-[#C3ECD3]">
              <span className="w-2 h-2 rounded-full bg-[#12A150] animate-pulse" />
              <span>Status: Verification email requested.</span>
            </div>
          </div>

          {/* Recipient Email Card */}
          <div className="rounded-[12px] bg-[#F7F9F8] p-3.5 border border-[#E5EAE7] text-center">
            <span className="text-xs text-[#64748B] block mb-0.5">Verification link dispatched to:</span>
            <span className="text-sm font-semibold text-[#0F1720] break-all select-all font-mono">
              {submittedEmail}
            </span>
          </div>

          {/* Instructions Card */}
          <div className="rounded-[14px] border border-[#E5EAE7] bg-[#FAFCFB] p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F1720]">
              Instructions:
            </h3>
            <ol className="space-y-2.5 text-xs text-[#334155]">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8F8EE] text-[11px] font-bold text-[#0B3B2C]">
                  1
                </span>
                <span className="pt-0.5">Open the inbox for the email address you registered with.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8F8EE] text-[11px] font-bold text-[#0B3B2C]">
                  2
                </span>
                <span className="pt-0.5">Look for the OOS verification email.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8F8EE] text-[11px] font-bold text-[#0B3B2C]">
                  3
                </span>
                <span className="pt-0.5">If it is missing, check Spam, Junk, and Promotions.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8F8EE] text-[11px] font-bold text-[#0B3B2C]">
                  4
                </span>
                <span className="pt-0.5">Follow the instructions in the email to activate your account.</span>
              </li>
            </ol>
          </div>

          {/* Resend Section */}
          <div className="space-y-3 pt-1">
            {resendFeedback && (
              <div
                className={`rounded-[11px] p-3 text-xs font-medium border ${
                  resendFeedback.type === "success"
                    ? "bg-[#E8F8EE] text-[#0B3B2C] border-[#C3ECD3]"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
                role="alert"
              >
                {resendFeedback.message}
              </div>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={resending || resendCooldown > 0}
              aria-busy={resending}
              className="flex w-full items-center justify-center gap-2 rounded-[11px] border border-[#DDE5E0] bg-white px-4 py-2.5 text-xs font-semibold text-[#0F1720] shadow-2xs hover:bg-[#F8FAF9] hover:border-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#12A150] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {resending ? (
                <span>Sending new verification email...</span>
              ) : resendCooldown > 0 ? (
                <span>Resend email in {resendCooldown}s</span>
              ) : (
                <span>Resend verification email</span>
              )}
            </button>
          </div>

          {/* Return to Sign-in */}
          <div className="text-center text-xs text-[#64748B] pt-2 border-t border-[#F1F5F3]">
            Already confirmed your email?{" "}
            <Link href="/login" className="font-semibold text-[#12A150] hover:text-[#0B3B2C] hover:underline">
              Return to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F9F8] px-4 py-12 sm:px-6 lg:px-8">
      {/* Back option to main site */}
      <div className="w-full max-w-md mb-3 flex items-center justify-between">
        <a
          href="https://www.careerbutton.in/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#0B3B2C] transition-colors group"
        >
          <svg
            className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5 text-[#94A3B8] group-hover:text-[#0B3B2C]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to CareerButton
        </a>
      </div>

      <div className="w-full max-w-md space-y-8 rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_18px_rgba(15,23,32,0.04)] border border-[#E5EAE7]">
        <div>
          <a
            href="https://www.careerbutton.in/"
            title="Back to CareerButton (careerbutton.in)"
            aria-label="Back to CareerButton homepage"
            className="group mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#0B3B2C] text-white shadow-2xs transition-all duration-200 hover:scale-105 hover:bg-[#0E4735] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#12A150] focus:ring-offset-2 relative cursor-pointer"
          >
            <span className="font-bold text-base transition-transform group-hover:scale-105">C</span>
            <span className="w-2 h-2 rounded-full bg-[#C6F432] absolute -top-0.5 -right-0.5 ring-2 ring-white transition-transform group-hover:scale-110" />
          </a>
          <h2 className="text-center text-2xl font-bold tracking-tight text-[#0F1720]">
            Create your Candidate Account
          </h2>
          <p className="mt-1.5 text-center text-xs text-[#64748B] font-medium">
            Operations Operating System (OOS)
          </p>
        </div>

        {error && (
          <div className="rounded-[12px] bg-rose-50 p-4 text-xs font-semibold text-rose-700 border border-rose-200" role="alert">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="firstName" className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  disabled={loading}
                  className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition disabled:opacity-60"
                  placeholder="Jane"
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  disabled={loading}
                  className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition disabled:opacity-60"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={loading}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition disabled:opacity-60"
                placeholder="jane@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                disabled={loading}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition disabled:opacity-60"
                placeholder="••••••••"
              />
              <p className="mt-1 text-[11px] text-[#94A3B8]">Minimum 8 characters</p>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-[11px] bg-[#12A150] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0E8541] focus:outline-none focus:ring-2 focus:ring-[#12A150] focus:ring-offset-2 disabled:opacity-50 transition"
            >
              {loading ? "Registering..." : "Create account"}
            </button>
          </div>
        </form>

        <div className="text-center text-xs text-[#64748B]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#12A150] hover:text-[#0B3B2C] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#12A150] border-t-transparent" />
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
