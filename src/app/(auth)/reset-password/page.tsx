"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getPasswordResetSessionAction,
  resetPasswordAction,
} from "@/lib/auth/password-reset-actions";
import { evaluatePasswordStrength } from "@/lib/validation/auth.schemas";
import { clearPasswordResetEmailSession } from "@/lib/auth/password-reset-client";
import { CareerButtonLogo } from "@/components/brand/CareerButtonLogo";

type SessionState = "loading" | "ready" | "missing" | "success";

function RequirementRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`text-[11px] font-medium ${ok ? "text-[#12A150]" : "text-[#94A3B8]"}`}>
      {ok ? "✓" : "○"} {label}
    </li>
  );
}

export default function ResetPasswordPage() {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getPasswordResetSessionAction();
      if (cancelled) return;
      if (!result.success) {
        setSessionState("missing");
        setSessionError(
          result.error ||
            "Your verification session is no longer valid. Please request a new code."
        );
        return;
      }
      setSessionState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit = strength.isValid && passwordsMatch && !loading;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await resetPasswordAction(formData);

      if (!result.success) {
        setError(result.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      clearPasswordResetEmailSession();
      setSessionState("success");
      setLoading(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (sessionState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F5] px-4">
        <p className="text-sm text-[#52605B]">Checking verification session…</p>
      </div>
    );
  }

  if (sessionState === "missing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F5] px-4 py-12">
        <div className="w-full max-w-md rounded-[20px] bg-white p-8 border border-[#E5EAE7] shadow-[0_4px_24px_rgba(8,47,38,0.06)] space-y-4 text-center">
          <h2 className="text-xl font-bold text-[#082F26]">Session expired</h2>
          <p className="text-sm text-[#52605B]">{sessionError}</p>
          <Link href="/forgot-password" className="inline-block text-sm font-semibold text-[#082F26] hover:text-[#0B3D32] hover:underline">
            Request a new code
          </Link>
        </div>
      </div>
    );
  }

  if (sessionState === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F5] px-4 py-12">
        <div className="w-full max-w-md rounded-[20px] bg-white p-8 sm:p-10 border border-[#E5EAE7] shadow-[0_4px_24px_rgba(8,47,38,0.06)] space-y-5 text-center">
          <a
            href="https://www.careerbutton.in/"
            title="Career Button Homepage"
            aria-label="Career Button — Return to homepage"
            className="group mx-auto flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#082F26] focus-visible:ring-offset-2 rounded-lg py-1 transition-opacity hover:opacity-90"
          >
            <CareerButtonLogo className="h-7 sm:h-8 w-auto text-[#082F26]" />
          </a>
          <h2 className="text-2xl font-bold text-[#082F26]">Password updated successfully</h2>
          <p className="text-sm text-[#52605B]">
            Your Career Button password has been changed.
          </p>
          <Link
            href="/login?message=password_updated"
            className="inline-flex w-full justify-center rounded-[11px] bg-[#082F26] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0B3D32] focus:outline-none focus:ring-2 focus:ring-[#082F26] focus:ring-offset-2 transition"
          >
            Return to sign in
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
          <h1 className="text-center text-2xl font-bold tracking-tight text-[#082F26]">
            Create a new password
          </h1>
          <p className="mt-1.5 text-center text-xs text-[#52605B] font-medium">
            Your verification has been confirmed.
          </p>
        </div>

        {error && (
          <div
            className="rounded-[12px] bg-rose-50 p-4 text-xs font-semibold text-rose-700 border border-rose-200"
            role="alert"
          >
            {error}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-[#081C15] uppercase tracking-wider"
              >
                New password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] text-sm transition"
                placeholder="••••••••"
              />
              <ul className="mt-2 space-y-1">
                <RequirementRow ok={strength.minLength} label="Minimum 8 characters" />
                <RequirementRow ok={strength.uppercase} label="Uppercase letter" />
                <RequirementRow ok={strength.lowercase} label="Lowercase letter" />
                <RequirementRow ok={strength.number} label="Number" />
                <RequirementRow ok={strength.special} label="Special character" />
              </ul>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold text-[#081C15] uppercase tracking-wider"
              >
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#081C15] placeholder-[#94A3B8] shadow-2xs focus:border-[#082F26] focus:outline-none focus:ring-1 focus:ring-[#082F26] text-sm transition"
                placeholder="••••••••"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-[11px] font-medium text-rose-600">Passwords do not match</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            aria-busy={loading}
            className="flex w-full justify-center rounded-[11px] bg-[#082F26] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0B3D32] focus:outline-none focus:ring-2 focus:ring-[#082F26] focus:ring-offset-2 disabled:opacity-50 transition active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? "Updating..." : "Update password"}
          </button>

          <div className="text-center text-xs">
            <Link href="/login" className="font-semibold text-[#082F26] hover:text-[#0B3D32] hover:underline">
              Back to sign in
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
        </form>
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
