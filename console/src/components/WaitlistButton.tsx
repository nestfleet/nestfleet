"use client";

/**
 * WaitlistButton — FEAT-019
 *
 * A self-contained button that opens a modal pre-registration form.
 * Used wherever upgrade CTAs appear while WAITLIST_MODE is active.
 *
 * Props:
 *   planHint  — pre-selects the plan of interest in the form
 *   label     — button label (default: "Join waitlist →")
 *   variant   — "primary" (indigo filled) | "secondary" (border) | "link" (text underline)
 *   className — additional classes for the trigger button
 */

import { useState, useEffect, useRef, type FormEvent } from "react";
import { waitlistApi } from "@/lib/api";
import { ApiError } from "@/lib/api";

interface WaitlistButtonProps {
  planHint?: "starter" | "growth" | "scale";
  label?:    string;
  variant?:  "primary" | "secondary" | "link";
  className?: string;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth:  "Growth",
  scale:   "Scale",
};

export function WaitlistButton({
  planHint,
  label     = "Join waitlist →",
  variant   = "primary",
  className = "",
}: WaitlistButtonProps) {
  const [open,       setOpen]       = useState(false);
  const [email,      setEmail]      = useState("");
  const [name,       setName]       = useState("");
  const [company,    setCompany]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus email input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => emailRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await waitlistApi({
        email:   email.trim(),
        name:    name.trim() || undefined,
        company: company.trim() || undefined,
        plan:    planHint,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Something went wrong. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setOpen(false);
    // Reset after close animation
    setTimeout(() => {
      setDone(false);
      setEmail("");
      setName("");
      setCompany("");
      setError(null);
    }, 200);
  }

  const buttonClass = variant === "primary"
    ? `inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 ${className}`
    : variant === "secondary"
    ? `inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 ${className}`
    : `text-xs font-medium text-indigo-600 underline underline-offset-2 hover:opacity-75 transition-opacity ${className}`;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wl-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {done ? (
              /* ── Success state ── */
              <div className="flex flex-col items-center text-center py-4">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                  <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-2">You&apos;re on the list!</h2>
                <p className="text-sm text-gray-500">
                  We&apos;ll email you the moment managed hosting launches.
                  {planHint && (
                    <> We&apos;ve noted your interest in the <span className="font-semibold text-indigo-600">{PLAN_LABELS[planHint]}</span> plan.</>
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-6 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              /* ── Form state ── */
              <>
                <div className="mb-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                    <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                  <h2 id="wl-title" className="text-lg font-bold text-gray-900 mb-1">
                    Be first when we launch
                  </h2>
                  <p className="text-sm text-gray-500">
                    Managed hosting is getting ready.
                    {planHint && (
                      <> We&apos;ll save your interest in the <span className="font-semibold">{PLAN_LABELS[planHint]}</span> plan.</>
                    )}{" "}
                    Leave your details and we&apos;ll email you the moment it&apos;s live.
                  </p>
                </div>

                <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3" noValidate>
                  <div>
                    <label htmlFor="wl-email" className="block text-xs font-medium text-gray-700 mb-1">
                      Work email <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={emailRef}
                      id="wl-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label htmlFor="wl-name" className="block text-xs font-medium text-gray-700 mb-1">
                      Name <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="wl-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Smith"
                      maxLength={100}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label htmlFor="wl-company" className="block text-xs font-medium text-gray-700 mb-1">
                      Company <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="wl-company"
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Acme Corp"
                      maxLength={200}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
                    />
                  </div>

                  {error && (
                    <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !email}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                  >
                    {submitting ? "Saving…" : "Reserve my spot →"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
