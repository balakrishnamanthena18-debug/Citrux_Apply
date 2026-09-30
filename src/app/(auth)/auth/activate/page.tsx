"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  validateStaffActivationTokenAction,
  activateStaffAccountAction,
  type ValidatedActivationTokenData,
} from "@/lib/auth/actions";

function StaffActivationForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [isValidating, setIsValidating] = useState(true);
  const [tokenData, setTokenData] = useState<ValidatedActivationTokenData | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activatedSuccess, setActivatedSuccess] = useState(false);

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setValidationError("Missing activation token. Please use the link provided in your welcome email.");
        setIsValidating(false);
        return;
      }

      const res = await validateStaffActivationTokenAction(token);
      if (!res.success || !res.data) {
        setValidationError(res.error || "This activation link is invalid or has expired.");
      } else {
        setTokenData(res.data);
      }
      setIsValidating(false);
    }

    validateToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await activateStaffAccountAction({
        token,
        password,
        confirmPassword,
      });

      if (!res.success) {
        setSubmitError(res.error || "Activation failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setActivatedSuccess(true);
      router.push("/login?activated=true");
    } catch (err: any) {
      setSubmitError(err?.message || "An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  }

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_18px_rgba(15,23,32,0.04)] border border-[#E5EAE7] text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#E5EAE7] border-t-[#12A150]" />
          <h2 className="text-lg font-bold text-[#0F1720]">Validating Activation Invitation...</h2>
          <p className="text-xs text-[#64748B]">Please wait while we verify your organizational invitation.</p>
        </div>
      </div>
    );
  }

  if (validationError || !tokenData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_18px_rgba(15,23,32,0.04)] border border-[#E5EAE7] text-center space-y-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-200">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#0F1720]">Activation Link Invalid</h2>
            <p className="mt-2 text-xs text-[#64748B]">{validationError}</p>
          </div>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex w-full justify-center rounded-[11px] bg-[#12A150] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0E8541] transition"
            >
              Return to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_18px_rgba(15,23,32,0.04)] border border-[#E5EAE7]">
        <div>
          <div className="flex justify-center">
            <span className="inline-flex items-center rounded-full bg-[#12A150]/[0.08] px-3.5 py-1 text-xs font-semibold text-[#0B3B2C] border border-[#12A150]/20">
              {tokenData.organizationName}
            </span>
          </div>
          <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-[#0F1720]">
            Activate Your Staff Account
          </h2>
          <p className="mt-1 text-center text-xs text-[#64748B]">
            Complete your employee onboarding to access the Operations Operating System.
          </p>
        </div>

        {/* Employee Identity Summary */}
        <div className="rounded-[14px] bg-[#F7F9F8] p-4 border border-[#E5EAE7] space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#64748B]">Employee:</span>
            <span className="font-semibold text-[#0F1720]">{tokenData.employeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748B]">Work Email:</span>
            <span className="font-mono text-[#0F1720] text-xs">{tokenData.email}</span>
          </div>
          {tokenData.employeeId && (
            <div className="flex justify-between">
              <span className="text-[#64748B]">Employee ID:</span>
              <span className="font-mono font-semibold text-[#0F1720]">{tokenData.employeeId}</span>
            </div>
          )}
          {tokenData.designationName && (
            <div className="flex justify-between">
              <span className="text-[#64748B]">Designation:</span>
              <span className="font-medium text-[#0F1720]">{tokenData.designationName}</span>
            </div>
          )}
          {(tokenData.department || tokenData.team) && (
            <div className="flex justify-between">
              <span className="text-[#64748B]">Unit:</span>
              <span className="text-[#0F1720]">
                {[tokenData.department, tokenData.team].filter(Boolean).join(" / ")}
              </span>
            </div>
          )}
        </div>

        {submitError && (
          <div className="rounded-[12px] bg-rose-50 p-4 text-xs font-semibold text-rose-700 border border-rose-200" role="alert">
            {submitError}
          </div>
        )}

        {activatedSuccess ? (
          <div className="rounded-[12px] bg-[#12A150]/[0.08] p-4 text-center text-xs text-[#0B3B2C] border border-[#12A150]/20 space-y-2 font-semibold">
            <p className="font-bold">Account Activated Successfully!</p>
            <p className="text-[11px] text-[#12A150]">Redirecting to login page...</p>
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider">
                Create Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>

            <div className="rounded-[12px] bg-amber-50/70 p-3.5 text-xs text-amber-900 border border-amber-200">
              <p className="font-bold">Security Notice:</p>
              <p className="mt-0.5 text-amber-800">
                By activating your account, you confirm authorization to access internal organizational systems.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full justify-center rounded-[11px] bg-[#12A150] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0E8541] focus:outline-none focus:ring-2 focus:ring-[#12A150] focus:ring-offset-2 disabled:opacity-50 transition"
            >
              {submitting ? "Activating Account..." : "Set Password & Complete Activation"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function StaffActivationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12 sm:px-6 lg:px-8">
          <div className="w-full max-w-md rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_18px_rgba(15,23,32,0.04)] border border-[#E5EAE7] text-center space-y-4">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#E5EAE7] border-t-[#12A150]" />
            <h2 className="text-lg font-bold text-[#0F1720]">Loading Activation...</h2>
          </div>
        </div>
      }
    >
      <StaffActivationForm />
    </Suspense>
  );
}
