"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUpCandidateAction } from "@/lib/auth/actions";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await signUpCandidateAction(formData);

      if (!result.success) {
        setError(result.error || "Registration failed");
        setLoading(false);
        return;
      }

      if (result.data?.redirectUrl) {
        window.location.assign(result.data.redirectUrl);
      } else {
        setError("Account created, but redirect destination was missing.");
        setLoading(false);
      }
    } catch (err: any) {
      console.error("[REGISTER_CLIENT_ERROR]", err);
      setError(err?.message || "An unexpected error occurred during registration. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9F8] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-[20px] bg-white p-8 sm:p-10 shadow-[0_4px_18px_rgba(15,23,32,0.04)] border border-[#E5EAE7]">
        <div>
          <div className="mx-auto w-10 h-10 rounded-[12px] bg-[#0B3B2C] text-white flex items-center justify-center font-bold text-base shadow-2xs mb-4 relative">
            <span>C</span>
            <span className="w-2 h-2 rounded-full bg-[#C6F432] absolute -top-0.5 -right-0.5 ring-2 ring-white" />
          </div>
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
                  className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
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
                  className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
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
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
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
                className="mt-1.5 block w-full rounded-[11px] border border-[#DDE5E0] px-3.5 py-2.5 text-[#0F1720] placeholder-[#94A3B8] shadow-2xs focus:border-[#12A150] focus:outline-none focus:ring-1 focus:ring-[#12A150] text-sm transition"
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
