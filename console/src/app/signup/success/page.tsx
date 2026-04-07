"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type ProvisioningStatus =
  | "pending_payment"
  | "pending"
  | "provisioning"
  | "active"
  | "failed";

interface StatusResponse {
  ok: boolean;
  status: ProvisioningStatus;
  slug: string;
  provisionedAt?: string;
  error?: string;
}

const STATUS_MESSAGES: Record<ProvisioningStatus, string> = {
  pending_payment: "Payment received — preparing your instance…",
  pending:         "Queued — your instance will start shortly…",
  provisioning:    "Provisioning your VPS — this takes 5–7 minutes…",
  active:          "Your NestFleet instance is live!",
  failed:          "Provisioning failed — our team has been alerted.",
};

export default function SignupSuccessPage() {
  return (
    <Suspense>
      <SignupSuccessContent />
    </Suspense>
  );
}

function SignupSuccessContent() {
  const params    = useSearchParams();
  const intentId  = params.get("intent");
  const [status, setStatus]   = useState<ProvisioningStatus>("pending_payment");
  const [slug, setSlug]       = useState<string>("");
  const [error, setError]     = useState<string | null>(null);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    if (!intentId) return;

    const poll = async () => {
      try {
        const res  = await fetch(`/api/v1/saas/status/${intentId}`);
        const body = await res.json() as StatusResponse;
        if (!body.ok) return;
        setStatus(body.status);
        setSlug(body.slug ?? "");
        if (body.error) setError(body.error);
        if (body.status === "active" || body.status === "failed") {
          setDone(true);
        }
      } catch {
        // network hiccup — keep polling
      }
    };

    poll();
    const interval = setInterval(() => { if (!done) poll(); }, 5000);
    return () => clearInterval(interval);
  }, [intentId, done]);

  const instanceUrl = slug ? `https://${slug}.nestfleet.dev` : null;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">

        {/* Icon */}
        <div className="flex justify-center mb-6">
          {status === "active" ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-900/40 ring-1 ring-emerald-600">
              <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          ) : status === "failed" ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-900/40 ring-1 ring-red-600">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-900/40 ring-1 ring-violet-600">
              <svg className="h-8 w-8 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
          )}
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-semibold text-slate-100 mb-2">
          {status === "active"  ? "You're all set!" :
           status === "failed"  ? "Something went wrong" :
           "Payment confirmed!"}
        </h1>

        {/* Status message */}
        <p className="text-slate-400 mb-6">
          {STATUS_MESSAGES[status]}
        </p>

        {/* Active: show instance URL */}
        {status === "active" && instanceUrl && (
          <a
            href={instanceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-500 transition-colors mb-4"
          >
            Open your NestFleet instance
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        )}

        {/* Failed: error detail */}
        {status === "failed" && error && (
          <p className="rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300 mb-4 text-left">
            {error}
          </p>
        )}

        {/* Polling status indicator */}
        {!done && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-600 animate-pulse" />
            Checking status every 5 seconds…
          </div>
        )}

        {/* Support */}
        <p className="mt-8 text-xs text-slate-600">
          Questions?{" "}
          <a href="mailto:support@nestfleet.dev" className="text-slate-500 hover:text-slate-400 underline">
            support@nestfleet.dev
          </a>
        </p>
      </div>
    </div>
  );
}
