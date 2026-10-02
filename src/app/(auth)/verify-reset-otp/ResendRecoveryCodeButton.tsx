"use client";

/**
 * Resend lives in its own client module and only imports requestPasswordResetAction.
 * This prevents Next.js from co-binding the wrong server-action ID onto the Verify form.
 */
import { useEffect, useState } from "react";
import { requestPasswordResetAction } from "@/lib/auth/actions";

const RESEND_COOLDOWN_SECONDS = 60;

export function ResendRecoveryCodeButton({ email }: { email: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = window.setInterval(() => {
      setResendSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendSeconds]);

  async function handleResend() {
    if (!email || resendSeconds > 0 || loading) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("email", email);
      const result = await requestPasswordResetAction(formData);
      if (!result.success) {
        setError(result.error || "Something went wrong. Please try again.");
        return;
      }
      setInfo("If an account exists for this email, we've sent a verification code.");
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 text-center text-xs">
      {error && (
        <div
          className="rounded-[12px] bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200"
          role="alert"
        >
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-[12px] bg-[#12A150]/[0.08] p-3 text-xs font-semibold text-[#0B3B2C] border border-[#12A150]/20">
          {info}
        </div>
      )}
      <p className="text-[#64748B]">Didn&apos;t receive the code?</p>
      <button
        type="button"
        disabled={loading || resendSeconds > 0}
        onClick={handleResend}
        className="font-semibold text-[#12A150] disabled:text-[#94A3B8] disabled:cursor-not-allowed"
      >
        {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
      </button>
    </div>
  );
}
