// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * /account/verify — Magic link exchange (FEAT-017-B)
 *
 * Reads ?token= from the URL, exchanges it for a session token via the API,
 * stores the session token in sessionStorage, then redirects to /account.
 */

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams }    from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  // Derived directly from the URL during render — no state/effect needed for
  // the "missing token" case.
  const token = params.get("token");
  const [asyncError, setAsyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/saas/account/session`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token }),
        });

        if (cancelled) return;

        const body = await res.json() as { ok: boolean; sessionToken?: string; error?: string };

        if (!body.ok || !body.sessionToken) {
          setAsyncError(body.error ?? "Your link has expired or is invalid. Please request a new one.");
          return;
        }

        // Store in sessionStorage — cleared when browser tab closes
        sessionStorage.setItem("nestfleet_account_token", body.sessionToken);
        router.replace("/account");
      } catch {
        if (!cancelled) setAsyncError("Something went wrong. Please try again.");
      }
    })();

    return () => { cancelled = true; };
  }, [token, router]);

  const error = token
    ? asyncError
    : "No magic link token found. Please request a new link.";

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-900/40 ring-1 ring-red-600">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374l7.028-12.127c.866-1.5 3.032-1.5 3.898 0l7.028 12.127zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
          <h1 className="text-xl font-semibold text-slate-100 mb-2">Link invalid or expired</h1>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <a
            href="/account"
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            Request a new link
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center">
        <svg className="mx-auto h-8 w-8 animate-spin text-violet-400 mb-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="text-sm text-slate-400">Signing you in…</p>
      </div>
    </div>
  );
}

export default function AccountVerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
