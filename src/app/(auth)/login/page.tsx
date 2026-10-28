"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { signInAction } from "@/lib/auth/actions";
import { CareerButtonLogo } from "@/components/brand/CareerButtonLogo";

const REMEMBERED_EMAIL_KEY = "cb_candidate_remembered_email";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isConfirmed = searchParams.get("confirmed") === "true";
  const callbackError = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    callbackError === "auth_callback_failed"
      ? "Verification link expired or invalid. Please try signing in or request a new code."
      : null
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const rememberCheckboxRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);

  // Restore non-sensitive remembered email on mount without touching Supabase session tokens
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (savedEmail) {
        if (emailInputRef.current) {
          emailInputRef.current.value = savedEmail;
        }
        if (rememberCheckboxRef.current) {
          rememberCheckboxRef.current.checked = true;
        }
      }
    } catch {
      // Graceful fallback for restricted storage / private browsing modes
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current || loading) return;
    isSubmittingRef.current = true;
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const enteredEmail = String(formData.get("email") || "").trim();
      const isRememberChecked = formData.get("rememberMe") === "on";

      // Manage client-side email prefill preference (stores zero credentials or tokens)
      if (isRememberChecked && enteredEmail) {
        try {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, enteredEmail);
        } catch {
          // Ignore storage errors
        }
      } else {
        try {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        } catch {
          // Ignore storage errors
        }
      }

      const result = await signInAction(formData);

      if (!result.success) {
        setError(result.error || "Failed to sign in");
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      if (result.data?.redirectUrl) {
        // Guaranteed document-level navigation with fresh session cookies
        window.location.assign(result.data.redirectUrl);
      } else {
        setError("Login succeeded but no redirect destination was provided.");
        setLoading(false);
        isSubmittingRef.current = false;
      }
    } catch (err: any) {
      console.error("[LOGIN_CLIENT_ERROR]", err);
      const friendlyMessage =
        err?.message &&
        !err.message.includes("Postgres") &&
        !err.message.includes("prisma") &&
        !err.message.includes("at ")
          ? err.message
          : "An unexpected network or server error occurred. Please check your connection and try again.";
      setError(friendlyMessage);
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF9F5] px-4 py-10 sm:px-6 lg:px-8">
      {/* Top bar with back link to marketing site and portal badge */}
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
            Sign in to your account
          </h1>
          <p className="mt-1.5 text-center text-xs text-[#52605B] font-medium">
            Access your Career Button candidate portal
          </p>
        </div>

        {isConfirmed && (
          <div
            className="rounded-[12px] bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 border border-emerald-200"
            role="status"
          >
            Email confirmed successfully! You can now sign in with your credentials.
          </div>
        )}

        {error && (
          <div
            className="rounded-[12px] bg-rose-50 p-4 text-xs font-semibold text-rose-700 border border-rose-200"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-[#081C15] uppercase tracking-wider">
                Email address
              </label>
              <input
                ref={emailInputRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={loading}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] text-sm transition disabled:opacity-60"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-[#081C15] uppercase tracking-wider">
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  aria-required="true"
                  aria-invalid={!!error}
                  className="block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 pr-11 text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] text-sm transition disabled:opacity-60"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  disabled={loading}
                  tabIndex={0}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#52605B] hover:text-[#082F26] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#082F26] rounded-r-[11px] disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <span className="sr-only" aria-live="polite">
                {showPassword ? "Password is currently visible" : "Password is currently hidden"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="rememberMe" className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                ref={rememberCheckboxRef}
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                disabled={loading}
                className="h-4 w-4 rounded border-[#DDE5E0] text-[#082F26] focus:ring-[#082F26] focus:ring-offset-0 cursor-pointer accent-[#082F26] disabled:opacity-50"
              />
              <span className="text-xs font-medium text-[#52605B]">Remember me</span>
            </label>

            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-[#082F26] hover:text-[#0B3D32] hover:underline transition"
            >
              Forgot your password?
            </Link>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="flex w-full items-center justify-center rounded-[11px] bg-[#082F26] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0B3D32] focus:outline-none focus:ring-2 focus:ring-[#082F26] focus:ring-offset-2 disabled:opacity-50 transition active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Signing in...</span>
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </div>
        </form>

        <div className="text-center text-xs text-[#52605B]">
          Candidate without an account?{" "}
          <Link href="/register" className="font-semibold text-[#082F26] hover:text-[#0B3D32] hover:underline">
            Register here
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
              className="font-medium text-[#082F26] hover:underline"
            >
              support@careerbutton.in
            </a>
          </div>
        </div>
      </div>

      {/* Portal footer */}
      <footer className="mt-8 text-center text-xs text-[#52605B] space-y-1">
        <p>© {new Date().getFullYear()} Career Button. All rights reserved.</p>
        <p className="text-[11px] text-[#718096]">
          Candidate Client Portal •{" "}
          <a
            href="https://www.careerbutton.in"
            className="hover:underline text-[#082F26]"
          >
            careerbutton.in
          </a>
        </p>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
