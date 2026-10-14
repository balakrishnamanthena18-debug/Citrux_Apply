"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createCandidateAction } from "@/lib/candidate/actions";
import type { CandidateDirectoryItem } from "./EmployeeCandidatesWorkbench";

export interface StaffOption {
  id: string; // userId
  name: string;
  email: string;
  role: string;
}

interface AddCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (
    candidate: CandidateDirectoryItem,
    invitation?: { attempted: boolean; sent: boolean; error?: string }
  ) => void;
  availableStaff?: StaffOption[];
}

export function AddCandidateModal({
  isOpen,
  onClose,
  onSuccess,
  availableStaff = [],
}: AddCandidateModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [headline, setHeadline] = useState("");
  const [country, setCountry] = useState("US");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState("");
  const [status, setStatus] = useState<"ONBOARDING" | "ACTIVE">("ONBOARDING");
  const [sendInvitation, setSendInvitation] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setHeadline("");
    setCountry("US");
    setCity("");
    setState("");
    setAssignedEmployeeId("");
    setStatus("ONBOARDING");
    setSendInvitation(false);
    setError(null);
    setFieldErrors({});
  };

  const handleClose = useCallback(() => {
    if (loading) return;
    resetForm();
    onClose();
  }, [loading, onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, handleClose]);

  if (!isOpen) return null;

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!firstName.trim()) {
      errors.firstName = "First name is required";
    }
    if (!lastName.trim()) {
      errors.lastName = "Last name is required";
    }
    if (!email.trim()) {
      errors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (!validate()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await createCandidateAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        headline: headline.trim() || null,
        country: country.trim() || "US",
        city: city.trim() || null,
        state: state.trim() || null,
        assignedEmployeeId: assignedEmployeeId || null,
        status,
        sendInvitation,
      });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to create candidate");
        setLoading(false);
        return;
      }

      setLoading(false);
      resetForm();
      onSuccess(res.data.candidate as CandidateDirectoryItem, res.data.invitation);
      onClose();
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while creating candidate");
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-candidate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1720]/50 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          handleClose();
        }
      }}
    >
      <div className="w-full max-w-xl rounded-[16px] bg-white shadow-2xl border border-[#E5EAE7] overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EDF1EF] bg-[#FCFDFC] flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 id="add-candidate-title" className="text-base font-semibold text-[#0F1720] tracking-[-0.02em]">
              Add Candidate
            </h2>
            <p className="text-xs text-[#64748B]">
              Register a new candidate in the organizational talent directory.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}

            disabled={loading}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-[#94A3B8] hover:text-[#0F1720] hover:bg-[#F7F9F8] transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-[10px] bg-rose-50 text-rose-800 border border-rose-200/80 flex items-start gap-2.5"
            >
              <svg className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Section: Candidate Identity */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              1. Candidate Identity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="candidate-first-name" className="block font-semibold text-[#0F1720] mb-1">
                  First Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="candidate-first-name"
                  type="text"
                  required
                  disabled={loading}
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (fieldErrors.firstName) {
                      setFieldErrors((prev) => ({ ...prev, firstName: "" }));
                    }
                  }}
                  placeholder="e.g. Jane"
                  className={`w-full rounded-[8px] border px-3 py-2 text-xs text-[#0F1720] placeholder-[#94A3B8] focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.firstName
                      ? "border-rose-300 bg-rose-50/30 focus:ring-rose-400"
                      : "border-[#DDE5E0] bg-white focus:border-[#12A150]/60 focus:ring-[#12A150]/20"
                  }`}
                />
                {fieldErrors.firstName && (
                  <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.firstName}</p>
                )}
              </div>

              <div>
                <label htmlFor="candidate-last-name" className="block font-semibold text-[#0F1720] mb-1">
                  Last Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="candidate-last-name"
                  type="text"
                  required
                  disabled={loading}
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (fieldErrors.lastName) {
                      setFieldErrors((prev) => ({ ...prev, lastName: "" }));
                    }
                  }}
                  placeholder="e.g. Doe"
                  className={`w-full rounded-[8px] border px-3 py-2 text-xs text-[#0F1720] placeholder-[#94A3B8] focus:outline-none focus:ring-2 transition-all ${
                    fieldErrors.lastName
                      ? "border-rose-300 bg-rose-50/30 focus:ring-rose-400"
                      : "border-[#DDE5E0] bg-white focus:border-[#12A150]/60 focus:ring-[#12A150]/20"
                  }`}
                />
                {fieldErrors.lastName && (
                  <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.lastName}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="candidate-email" className="block font-semibold text-[#0F1720] mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                id="candidate-email"
                type="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: "" }));
                  }
                }}
                placeholder="e.g. jane.doe@example.com"
                className={`w-full rounded-[8px] border px-3 py-2 text-xs text-[#0F1720] placeholder-[#94A3B8] focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.email
                    ? "border-rose-300 bg-rose-50/30 focus:ring-rose-400"
                    : "border-[#DDE5E0] bg-white focus:border-[#12A150]/60 focus:ring-[#12A150]/20"
                }`}
              />
              {fieldErrors.email ? (
                <p className="mt-1 text-[11px] text-rose-600">{fieldErrors.email}</p>
              ) : (
                <p className="mt-1 text-[11px] text-[#94A3B8]">
                  Used for account authentication, identification, and candidate communications.
                </p>
              )}
            </div>
          </div>

          {/* Section: Professional Details & Assignment */}
          <div className="space-y-3 pt-2 border-t border-[#EDF1EF]">
            <h3 className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              2. Professional Profile & Specialist Assignment
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="candidate-headline" className="block font-semibold text-[#0F1720] mb-1">
                  Professional Headline (Optional)
                </label>
                <input
                  id="candidate-headline"
                  type="text"
                  disabled={loading}
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Senior Frontend Engineer"
                  className="w-full rounded-[8px] border border-[#DDE5E0] bg-white px-3 py-2 text-xs text-[#0F1720] placeholder-[#94A3B8] focus:border-[#12A150]/60 focus:outline-none focus:ring-2 focus:ring-[#12A150]/20"
                />
              </div>

              <div>
                <label htmlFor="candidate-phone" className="block font-semibold text-[#0F1720] mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  id="candidate-phone"
                  type="tel"
                  disabled={loading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 012-3456"
                  className="w-full rounded-[8px] border border-[#DDE5E0] bg-white px-3 py-2 text-xs text-[#0F1720] placeholder-[#94A3B8] focus:border-[#12A150]/60 focus:outline-none focus:ring-2 focus:ring-[#12A150]/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="candidate-city" className="block font-medium text-[#334155] mb-1">
                  City
                </label>
                <input
                  id="candidate-city"
                  type="text"
                  disabled={loading}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. San Francisco"
                  className="w-full rounded-[8px] border border-[#DDE5E0] bg-white px-3 py-2 text-xs text-[#0F1720] placeholder-[#94A3B8] focus:border-[#12A150]/60 focus:outline-none focus:ring-2 focus:ring-[#12A150]/20"
                />
              </div>

              <div>
                <label htmlFor="candidate-state" className="block font-medium text-[#334155] mb-1">
                  State / Region
                </label>
                <input
                  id="candidate-state"
                  type="text"
                  disabled={loading}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. CA"
                  className="w-full rounded-[8px] border border-[#DDE5E0] bg-white px-3 py-2 text-xs text-[#0F1720] placeholder-[#94A3B8] focus:border-[#12A150]/60 focus:outline-none focus:ring-2 focus:ring-[#12A150]/20"
                />
              </div>

              <div>
                <label htmlFor="candidate-country" className="block font-medium text-[#334155] mb-1">
                  Country
                </label>
                <input
                  id="candidate-country"
                  type="text"
                  disabled={loading}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. US"
                  className="w-full rounded-[8px] border border-[#DDE5E0] bg-white px-3 py-2 text-xs text-[#0F1720] placeholder-[#94A3B8] focus:border-[#12A150]/60 focus:outline-none focus:ring-2 focus:ring-[#12A150]/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="candidate-assigned-specialist" className="block font-semibold text-[#0F1720] mb-1">
                Assigned Specialist (Optional)
              </label>
              <select
                id="candidate-assigned-specialist"
                disabled={loading}
                value={assignedEmployeeId}
                onChange={(e) => setAssignedEmployeeId(e.target.value)}
                className="w-full rounded-[8px] border border-[#DDE5E0] bg-white px-3 py-2 text-xs text-[#0F1720] focus:border-[#12A150]/60 focus:outline-none focus:ring-2 focus:ring-[#12A150]/20"
              >
                <option value="">Unassigned (Open Roster)</option>
                {availableStaff.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} ({staff.email}) — {staff.role}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#94A3B8]">
                Operational ownership for application management and candidate tracking.
              </p>
            </div>
          </div>

          {/* Section: Status & Governance Invariants */}
          <div className="space-y-3 pt-2 border-t border-[#EDF1EF]">
            <h3 className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              3. Governance & Account Access
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="candidate-status" className="block font-semibold text-[#0F1720] mb-1">
                  Initial Status
                </label>
                <select
                  id="candidate-status"
                  disabled={loading}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "ONBOARDING" | "ACTIVE")}
                  className="w-full rounded-[8px] border border-[#DDE5E0] bg-white px-3 py-2 text-xs text-[#0F1720] focus:border-[#12A150]/60 focus:outline-none focus:ring-2 focus:ring-[#12A150]/20"
                >
                  <option value="ONBOARDING">ONBOARDING (Profile setup in progress)</option>
                  <option value="ACTIVE">ACTIVE (Ready for job matching & applications)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#64748B] mb-1">
                  Verification State
                </label>
                <div className="rounded-[8px] border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 font-medium flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  <span>UNVERIFIED (Requires Inspect 360 Review)</span>
                </div>
              </div>
            </div>

            {/* Account Invitation Option */}
            <div className="p-3.5 rounded-[10px] border border-[#E5EAE7] bg-[#F7F9F8]/60 space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={loading}
                  checked={sendInvitation}
                  onChange={(e) => setSendInvitation(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[#DDE5E0] text-[#0B3B2C] focus:ring-[#12A150]/40"
                />
                <div>
                  <span className="font-semibold text-[#0F1720]">
                    Invite candidate to activate their portal account
                  </span>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    When enabled, marks the account membership as INVITED. When disabled, the candidate record is created for operational tracking without sending credentials.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Dialog Action Buttons */}
          <div className="pt-4 border-t border-[#EDF1EF] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="rounded-[8px] border border-[#DDE5E0] bg-white px-4 py-2 text-xs font-semibold text-[#334155] hover:bg-[#F7F9F8] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-[8px] bg-[#0B3B2C] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#0a3226] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150]/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  <span>Creating Candidate…</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span>Create Candidate</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
