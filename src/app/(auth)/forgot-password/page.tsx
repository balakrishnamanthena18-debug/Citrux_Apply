"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { PASSWORD_RESET_EMAIL_STORAGE_KEY } from "@/lib/auth/password-reset-client";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") || "")
        .trim()
        .toLowerCase();
      const result = await requestPasswordResetAction(formData);

      if (!result.success) {
        setError(result.error || "Something went wrong. Please try again.");
        return;
      }

      try {
        sessionStorage.setItem(PASSWORD_RESET_EMAIL_STORAGE_KEY, email);
      } catch {
        // sessionStorage may be unavailable; query param is a non-secret fallback
      }

      router.push(`/verify-reset-otp?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
            Reset your password
          </h2>
          <p className="mt-1.5 text-center text-xs text-[#64748B] font-medium">
            Enter your email and we&apos;ll send a verification code.
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
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-[#0F1720] uppercase tracking-wider"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-[11px] bg-[#0B3B2C] px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-[#0E8541] focus:outline-none focus:ring-2 focus:ring-[#12A150] focus:ring-offset-2 disabled:opacity-50 transition"
            >
              {loading ? "Sending..." : "Send verification code"}
            </button>
          </div>

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
