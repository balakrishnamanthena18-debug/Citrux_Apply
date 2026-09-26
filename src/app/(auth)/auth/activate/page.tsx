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
    setTimeout(() => {
      router.push("/login?activated=true");
    }, 2000);
  }

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm border border-slate-200 text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
          <h2 className="text-lg font-semibold text-slate-900">Validating Activation Invitation...</h2>
          <p className="text-sm text-slate-500">Please wait while we verify your organizational invitation.</p>
        </div>
      </div>
    );
  }

  if (validationError || !tokenData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm border border-slate-200 text-center space-y-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Activation Link Invalid</h2>
            <p className="mt-2 text-sm text-slate-600">{validationError}</p>
          </div>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex w-full justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              Return to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-sm border border-slate-200">
        <div>
          <div className="flex justify-center">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
              {tokenData.organizationName}
            </span>
          </div>
          <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-slate-900">
            Activate Your Staff Account
          </h2>
          <p className="mt-1 text-center text-sm text-slate-600">
            Complete your employee onboarding to access the Operations Operating System.
          </p>
        </div>

        {/* Employee Identity Summary */}
        <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Employee:</span>
            <span className="font-semibold text-slate-900">{tokenData.employeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Work Email:</span>
            <span className="font-mono text-slate-800 text-xs">{tokenData.email}</span>
          </div>
          {tokenData.employeeId && (
            <div className="flex justify-between">
              <span className="text-slate-500">Employee ID:</span>
              <span className="font-mono font-semibold text-slate-900">{tokenData.employeeId}</span>
            </div>
          )}
          {tokenData.designationName && (
            <div className="flex justify-between">
              <span className="text-slate-500">Designation:</span>
              <span className="font-medium text-slate-900">{tokenData.designationName}</span>
            </div>
          )}
          {(tokenData.department || tokenData.team) && (
            <div className="flex justify-between">
              <span className="text-slate-500">Unit:</span>
              <span className="text-slate-800">
                {[tokenData.department, tokenData.team].filter(Boolean).join(" / ")}
              </span>
            </div>
          )}
        </div>

        {submitError && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-200" role="alert">
            {submitError}
          </div>
        )}

        {activatedSuccess ? (
          <div className="rounded-md bg-emerald-50 p-4 text-center text-sm text-emerald-800 border border-emerald-200 space-y-2">
            <p className="font-semibold">Account Activated Successfully!</p>
            <p className="text-xs text-emerald-700">Redirecting to login page...</p>
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
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
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:text-sm"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
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
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:text-sm"
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>

            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
              <p className="font-medium">Security Notice:</p>
              <p className="mt-0.5 text-amber-700">
                By activating your account, you confirm authorization to access internal organizational systems.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50"
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
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
          <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm border border-slate-200 text-center space-y-4">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
            <h2 className="text-lg font-semibold text-slate-900">Loading Activation...</h2>
          </div>
        </div>
      }
    >
      <StaffActivationForm />
    </Suspense>
  );
}
