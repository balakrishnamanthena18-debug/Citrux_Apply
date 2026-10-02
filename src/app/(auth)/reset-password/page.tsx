"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getPasswordResetSessionAction,
  resetPasswordAction,
} from "@/lib/auth/password-reset-actions";
import { evaluatePasswordStrength } from "@/lib/validation/auth.schemas";
import { clearPasswordResetEmailSession } from "@/lib/auth/password-reset-client";

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
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4">
        <p className="text-sm text-[#64748B]">Checking verification session…</p>
      </div>
    );
  }

  if (sessionState === "missing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12">
        <div className="w-full max-w-md rounded-[20px] bg-white p-8 border border-[#E5EAE7] space-y-4 text-center">
          <h2 className="text-xl font-bold text-[#0F1720]">Session expired</h2>
          <p className="text-sm text-[#64748B]">{sessionError}</p>
          <Link href="/forgot-password" className="inline-block text-sm font-semibold text-[#12A150]">
            Request a new code
          </Link>
        </div>
      </div>
    );
  }

  if (sessionState === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12">
        <div className="w-full max-w-md rounded-[20px] bg-white p-8 sm:p-10 border border-[#E5EAE7] space-y-5 text-center">
          <div className="mx-auto w-10 h-10 rounded-[12px] bg-[#0B3B2C] text-white flex items-center justify-center font-bold text-[10px] tracking-wide relative">
            OOS
            <span className="w-2 h-2 rounded-full bg-[#C6F432] absolute -top-0.5 -right-0.5 ring-2 ring-white" />
          </div>
          <h2 className="text-2xl font-bold text-[#0F1720]">Password updated successfully</h2>
          <p className="text-sm text-[#64748B]">
            Your Operations OS password has been changed.
          </p>
          <Link
            href="/login?message=password_updated"
            className="inline-flex w-full justify-center rounded-[11px] bg-[#0B3B2C] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Return to sign in
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
          <h2 className="text-center text-2xl font-bold tracking-tight text-[#0F1720]">
            Create a new password
          </h2>
          <p className="mt-1.5 text-center text-xs text-[#64748B] font-medium">
            Your email has been verified.
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
                className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider"
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
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
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
                className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider"
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
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
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
            className="flex w-full justify-center rounded-[11px] bg-[#0B3B2C] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0E8541] focus:outline-none focus:ring-2 focus:ring-[#12A150] focus:ring-offset-2 disabled:opacity-50 transition"
          >
            {loading ? "Updating..." : "Update password"}
          </button>

          <div className="text-center text-xs">
            <Link href="/login" className="font-semibold text-[#64748B] hover:text-[#0F1720]">
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
