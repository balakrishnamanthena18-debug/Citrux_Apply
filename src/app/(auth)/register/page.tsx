"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  signUpCandidateAction,
  resendVerificationEmailAction,
} from "@/lib/auth/actions";
import { CareerButtonLogo } from "@/components/brand/CareerButtonLogo";

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

        <div className="w-full max-w-md space-y-6 rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_24px_rgba(8,47,38,0.06)] border border-[#E5EAE7]">
          {/* Top Brand & Mail Illustration */}
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#EBF2ED] text-[#082F26] border border-[#C3ECD3] relative shadow-2xs">
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
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#082F26] text-white ring-2 ring-white">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
            </div>

            <h2 className="text-center text-2xl font-bold tracking-tight text-[#082F26]">
              Check your email
            </h2>
            <p className="mt-1 text-center text-sm text-[#52605B]">
              You&apos;re one step away from activating your Career Button candidate account.
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-center" role="status">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#EBF2ED] px-3.5 py-1.5 text-xs font-semibold text-[#082F26] border border-[#C3ECD3]">
              <span className="w-2 h-2 rounded-full bg-[#082F26] animate-pulse" />
              <span>Status: Verification email requested.</span>
            </div>
          </div>

          {/* Recipient Email Card */}
          <div className="rounded-[12px] bg-[#FAF9F5] p-3.5 border border-[#E5EAE7] text-center">
            <span className="text-xs text-[#52605B] block mb-0.5">Verification link dispatched to:</span>
            <span className="text-sm font-semibold text-[#081C15] break-all select-all font-mono">
              {submittedEmail}
            </span>
          </div>

          {/* Instructions Card */}
          <div className="rounded-[14px] border border-[#E5EAE7] bg-[#FAFCFB] p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#081C15]">
              Instructions:
            </h3>
            <ol className="space-y-2.5 text-xs text-[#334155]">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EBF2ED] text-[11px] font-bold text-[#082F26]">
                  1
                </span>
                <span className="pt-0.5">Open the inbox for the email address you registered with.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EBF2ED] text-[11px] font-bold text-[#082F26]">
                  2
                </span>
                <span className="pt-0.5">Look for the Career Button verification email.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EBF2ED] text-[11px] font-bold text-[#082F26]">
                  3
                </span>
                <span className="pt-0.5">If it is missing, check Spam, Junk, and Promotions.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EBF2ED] text-[11px] font-bold text-[#082F26]">
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
                    ? "bg-[#EBF2ED] text-[#082F26] border-[#C3ECD3]"
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
              className="flex w-full items-center justify-center gap-2 rounded-[11px] border border-[#DDE5E0] bg-white px-4 py-2.5 text-xs font-semibold text-[#081C15] shadow-2xs hover:bg-[#FAF9F5] hover:border-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#082F26] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
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
          <div className="text-center text-xs text-[#52605B] pt-2 border-t border-[#F1F5F3]">
            Already confirmed your email?{" "}
            <Link href="/login" className="font-semibold text-[#082F26] hover:text-[#0B3D32] hover:underline">
              Return to sign in
            </Link>
          </div>

          {/* Support Link */}
          <div className="text-center text-xs text-[#52605B] space-y-1">
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
              <a href="mailto:support@careerbutton.in" className="font-semibold text-[#082F26] hover:underline">
                support@careerbutton.in
              </a>{" "}
              <span className="text-amber-700">(under activation)</span>
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
          <h1 className="text-center text-2xl font-bold tracking-tight text-[#082F26]">
            Create your Candidate Account
          </h1>
          <p className="mt-1.5 text-center text-xs text-[#52605B] font-medium">
            Career Button Candidate Portal
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
                <label htmlFor="firstName" className="block text-xs font-semibold text-[#081C15] uppercase tracking-wider">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  disabled={loading}
                  className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] text-sm transition disabled:opacity-60"
                  placeholder="Jane"
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block text-xs font-semibold text-[#081C15] uppercase tracking-wider">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  disabled={loading}
                  className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] text-sm transition disabled:opacity-60"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[#081C15] uppercase tracking-wider">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={loading}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] text-sm transition disabled:opacity-60"
                placeholder="jane@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-[#081C15] uppercase tracking-wider">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                disabled={loading}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] text-sm transition disabled:opacity-60"
                placeholder="••••••••"
              />
              <p className="mt-1 text-[11px] text-[#94A3B8]">Minimum 8 characters</p>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="flex w-full justify-center rounded-[11px] bg-[#082F26] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0B3D32] focus:outline-none focus:ring-2 focus:ring-[#082F26] focus:ring-offset-2 disabled:opacity-50 transition active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? "Registering..." : "Create account"}
            </button>
          </div>
        </form>

        <div className="text-center text-xs text-[#52605B]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#082F26] hover:text-[#0B3D32] hover:underline">
            Sign in
          </Link>
        </div>

        <div className="pt-4 border-t border-[#E5EAE7] text-center text-xs text-[#52605B] space-y-1">
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
            </a>{" "}
            <span className="text-amber-700">(under activation)</span>
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

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F5]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#082F26] border-t-transparent" />
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
