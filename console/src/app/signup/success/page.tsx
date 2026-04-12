// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type ProvisioningStatus =
  | "pending_payment"
  | "pending"
  | "provisioning"
  | "active"
  | "failed";

interface HealthDetail {
  status: string;
  db:     string;
  queue:  string;
}

interface StatusResponse {
  ok:               boolean;
  status:           ProvisioningStatus;
  slug:             string;
  step?:            number;
  healthDetail?:    string;   // JSON string or "ok"/"unreachable"/etc.
  lastHealthCheckAt?: string;
  provisionedAt?:   string;
  error?:           string;
}

interface ProvStep {
  label:    string;
  detail:   string;
}

const STEPS: ProvStep[] = [
  { label: "Payment confirmed",  detail: "Preparing your instance…" },
  { label: "Creating VPS",       detail: "Spinning up your server on Hetzner…" },
  { label: "Configuring DNS",    detail: "Pointing your subdomain to the server…" },
  { label: "Health check",       detail: "Waiting for NestFleet to come online…" },
];

// Returns which step index (0-based) is currently active, or -1 if not in provisioning
function activeStepIndex(status: ProvisioningStatus, step: number | undefined): number {
  if (status === "pending")      return 0;
  if (status === "provisioning") return (step ?? 2) - 1; // step 2-4 → index 1-3
  return -1;
}

function parseHealthDetail(raw: string | null): HealthDetail | null {
  if (!raw || raw === "ok" || raw === "unreachable") return null;
  try { return JSON.parse(raw) as HealthDetail; } catch { return null; }
}

function HealthBadge({ label, value }: { label: string; value: string }) {
  const ok = value === "ok" || value === "started";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${ok ? "text-emerald-400" : "text-amber-400"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
      {label}: {value}
    </span>
  );
}

function StepList({ status, step, healthDetail }: { status: ProvisioningStatus; step?: number; healthDetail?: string | null }) {
  const activeIdx = activeStepIndex(status, step);
  const isDone    = status === "active";
  const isFailed  = status === "failed";

  return (
    <ol className="mt-6 space-y-3 text-left">
      {STEPS.map((s, i) => {
        const completed = isDone || i < activeIdx;
        const active    = !isDone && !isFailed && i === activeIdx;
        const upcoming  = !isDone && !isFailed && i > activeIdx && activeIdx !== -1;

        return (
          <li key={i} className="flex items-start gap-3">
            {/* Step indicator */}
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {completed ? (
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : active ? (
                <svg className="h-4 w-4 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              ) : (
                <span className={`h-2 w-2 rounded-full ${upcoming ? "bg-slate-600" : "bg-slate-700"}`} />
              )}
            </span>

            {/* Step text */}
            <div>
              <p className={`text-sm font-medium leading-5 ${
                completed ? "text-emerald-400" :
                active    ? "text-slate-100"   :
                            "text-slate-600"
              }`}>
                {s.label}
              </p>
              {active && (
                <p className="text-xs text-slate-500 mt-0.5">{s.detail}</p>
              )}
              {active && i === 3 && (() => {
                const detail = parseHealthDetail(healthDetail ?? null);
                return detail ? (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    <HealthBadge label="API"   value={detail.status} />
                    <HealthBadge label="DB"    value={detail.db} />
                    <HealthBadge label="Queue" value={detail.queue} />
                  </div>
                ) : null;
              })()}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function SignupSuccessPage() {
  return (
    <Suspense>
      <SignupSuccessContent />
    </Suspense>
  );
}

function SignupSuccessContent() {
  const params   = useSearchParams();
  const intentId = params.get("intent");

  const [status,       setStatus]       = useState<ProvisioningStatus>("pending_payment");
  const [step,         setStep]         = useState<number | undefined>(undefined);
  const [slug,         setSlug]         = useState<string>("");
  const [healthDetail, setHealthDetail] = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [done,         setDone]         = useState(false);

  useEffect(() => {
    if (!intentId) return;

    const poll = async () => {
      try {
        const res  = await fetch(`/api/v1/saas/status/${intentId}`);
        const body = await res.json() as StatusResponse;
        if (!body.ok) return;
        setStatus(body.status);
        setStep(body.step);
        setSlug(body.slug ?? "");
        setHealthDetail(body.healthDetail ?? null);
        if (body.error) setError(body.error);
        if (body.status === "active" || body.status === "failed") setDone(true);
      } catch {
        // network hiccup — keep polling
      }
    };

    poll();
    const interval = setInterval(() => { if (!done) poll(); }, 5000);
    return () => clearInterval(interval);
  }, [intentId, done]);

  const instanceUrl = slug ? `https://${slug}.nestfleet.dev` : null;
  const inProgress  = !done && status !== "pending_payment";

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

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
              <svg className="h-8 w-8 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
              </svg>
            </div>
          )}
        </div>

        {/* Heading */}
        <h1 className="text-center text-2xl font-semibold text-slate-100 mb-1">
          {status === "active"  ? "You're all set!" :
           status === "failed"  ? "Something went wrong" :
           "Payment confirmed!"}
        </h1>

        {/* Sub-heading */}
        <p className="text-center text-sm text-slate-400 mb-2">
          {status === "active"
            ? `Your instance is live at ${slug}.nestfleet.dev`
            : status === "failed"
            ? "Our team has been alerted."
            : status === "pending_payment"
            ? "Your instance will start provisioning shortly."
            : "This takes about 8 minutes — you can leave this page open."}
        </p>

        {/* Step list — shown while provisioning */}
        {inProgress && <StepList status={status} step={step} healthDetail={healthDetail} />}

        {/* All steps done checkmark when active */}
        {status === "active" && <StepList status="active" step={undefined} />}

        {/* Active: open instance button */}
        {status === "active" && instanceUrl && (
          <a
            href={instanceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            Open your NestFleet instance
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        )}

        {/* Failed: error detail */}
        {status === "failed" && error && (
          <p className="mt-4 rounded-md border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300 text-left">
            {error}
          </p>
        )}

        {/* Polling indicator */}
        {!done && (
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-600 animate-pulse" />
            Checking status every 5 seconds…
          </div>
        )}

        {/* Support */}
        <p className="mt-8 text-center text-xs text-slate-600">
          Questions?{" "}
          <a href="mailto:support@nestfleet.dev" className="text-slate-500 hover:text-slate-400 underline">
            support@nestfleet.dev
          </a>
        </p>
      </div>
    </div>
  );
}
