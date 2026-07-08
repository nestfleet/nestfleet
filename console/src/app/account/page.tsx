// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * /account — Customer account page (FEAT-017-C)
 *
 * Shows plan, status, trial/billing dates, instance URL.
 * "Manage subscription" button opens the Stripe Customer Portal.
 *
 * Auth: reads nestfleet_account_token from sessionStorage.
 * If not present, shows the magic link request form.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useNow } from "@/lib/useNow";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface AccountInfo {
  slug:                 string;
  plan:                 string;
  status:               string;
  instanceUrl:          string;
  provisionedAt:        string | null;
  licenseExpiresAt:     string | null;
  reactivationDeadline: string | null;
}

function getAccountToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("nestfleet_account_token");
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:          { label: "Active",          cls: "bg-emerald-900/40 text-emerald-400 ring-emerald-700" },
    deprovisioning:  { label: "Cancelling",      cls: "bg-amber-900/40 text-amber-400 ring-amber-700" },
    provisioning:    { label: "Provisioning",    cls: "bg-violet-900/40 text-violet-400 ring-violet-700" },
    failed:          { label: "Failed",          cls: "bg-red-900/40 text-red-400 ring-red-700" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-800 text-slate-400 ring-slate-700" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      {label}
    </span>
  );
}

// ── Magic link request form (unauthenticated view) ────────────────────────────

function MagicLinkForm() {
  const [email,       setEmail]       = useState("");
  const [submitted,   setSubmitted]   = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/api/v1/saas/account/magic-link`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true); // always show "if registered" message
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-900/40 ring-1 ring-violet-600">
            <svg className="h-8 w-8 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
        </div>
        <h1 className="text-center text-2xl font-semibold text-slate-100 mb-1">Manage your subscription</h1>
        <p className="text-center text-sm text-slate-400 mb-6">
          Enter your email to receive a login link.
        </p>

        {submitted ? (
          <div className="rounded-lg bg-emerald-900/30 ring-1 ring-emerald-700 px-4 py-4 text-center text-sm text-emerald-300">
            If that email is registered, a link has been sent. Check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              placeholder="you@example.com"
              className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-hidden focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Sending…" : "Send login link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Authenticated account view ────────────────────────────────────────────────

function AccountView({ info, sessionToken }: { info: AccountInfo; sessionToken: string }) {
  const [portalLoading, setPortalLoading] = useState(false);
  const nowMs = useNow();
  const [portalError,   setPortalError]   = useState<string | null>(null);

  const openPortal = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/saas/account/billing-portal`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ return_url: window.location.href }),
      });
      const body = await res.json() as { ok: boolean; portal_url?: string; error?: string };
      if (body.ok && body.portal_url) {
        window.location.href = body.portal_url;
      } else {
        setPortalError(body.error ?? "Failed to open billing portal.");
      }
    } catch {
      setPortalError("Something went wrong. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  const planLabel = info.plan.charAt(0).toUpperCase() + info.plan.slice(1);

  // Reactivation countdown
  const reactivationDeadline = info.reactivationDeadline ? new Date(info.reactivationDeadline) : null;
  const reactivationDaysLeft = reactivationDeadline
    ? Math.max(0, Math.ceil((reactivationDeadline.getTime() - nowMs) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-100">Your NestFleet account</h1>
          <p className="text-sm text-slate-400 mt-1">{info.instanceUrl}</p>
        </div>

        {/* Info card */}
        <div className="rounded-xl bg-slate-900 ring-1 ring-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Plan</span>
            <span className="text-sm font-medium text-slate-100">{planLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Status</span>
            <StatusBadge status={info.status} />
          </div>
          {info.licenseExpiresAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">License expires</span>
              <span className="text-sm text-slate-300">
                {new Date(info.licenseExpiresAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {info.provisionedAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Started</span>
              <span className="text-sm text-slate-300">
                {new Date(info.provisionedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Reactivation window notice */}
        {reactivationDaysLeft !== null && reactivationDaysLeft > 0 && (
          <div className="rounded-lg bg-amber-900/30 ring-1 ring-amber-700 px-4 py-3 text-sm text-amber-300">
            You have {reactivationDaysLeft} day{reactivationDaysLeft === 1 ? "" : "s"} to reactivate.
            Re-subscribe to keep your instance and data.
          </div>
        )}

        {/* Manage button */}
        <button
          onClick={openPortal}
          disabled={portalLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {portalLoading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Opening portal…
            </>
          ) : (
            <>
              Manage subscription
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </>
          )}
        </button>

        {portalError && (
          <p className="text-center text-sm text-red-400">{portalError}</p>
        )}

        {/* Open instance */}
        <a
          href={info.instanceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-slate-100 hover:border-slate-500 transition-colors"
        >
          Open my instance
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>

        <p className="text-center text-xs text-slate-600">
          Questions?{" "}
          <a href="mailto:support@nestfleet.dev" className="text-slate-500 hover:text-slate-400 underline">
            support@nestfleet.dev
          </a>
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [accountInfo,  setAccountInfo]  = useState<AccountInfo | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [authError,    setAuthError]    = useState(false);

  // Reads sessionStorage on mount (client-only, no SSR equivalent) then
  // kicks off an async fetch — not derivable during render.
  useEffect(() => {
    const token = getAccountToken();
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    setSessionToken(token);

    // Fetch account info
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/saas/account/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          sessionStorage.removeItem("nestfleet_account_token");
          setAuthError(true);
          setLoading(false);
          return;
        }
        const body = await res.json() as { ok: boolean } & AccountInfo;
        if (body.ok) setAccountInfo(body);
      } catch {
        setAuthError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <svg className="h-8 w-8 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }

  if (!sessionToken || authError || !accountInfo) {
    return <MagicLinkForm />;
  }

  return <AccountView info={accountInfo} sessionToken={sessionToken} />;
}
