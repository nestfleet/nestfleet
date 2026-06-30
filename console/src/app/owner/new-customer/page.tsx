// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useRef, useCallback } from "react";
import clsx from "clsx";
import {
  getOwnerSlugCheckApi,
  postOwnerNewCustomerApi,
  type NewCustomerRequest,
} from "@/lib/owner-api";

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLANS: { id: "starter" | "growth"; label: string; price: string; description: string }[] = [
  {
    id:          "starter",
    label:       "Starter",
    price:       "$99 / mo",
    description: "3 products · 1 000 OUs/mo · 5 users",
  },
  {
    id:          "growth",
    label:       "Growth",
    price:       "$499 / mo",
    description: "10 products · 10 000 OUs/mo · 25 users",
  },
];

// ─── Slug availability state ──────────────────────────────────────────────────

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; error: string }
  | { status: "invalid"; error: string };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewCustomerPage() {
  const [email, setEmail]             = useState("");
  const [slug, setSlug]               = useState("");
  const [plan, setPlan]               = useState<"starter" | "growth">("starter");
  const [companyName, setCompanyName] = useState("");
  const [slugState, setSlugState]     = useState<SlugState>({ status: "idle" });
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [result, setResult]           = useState<{ checkoutUrl: string; intentId: string } | null>(null);
  const [copied, setCopied]           = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Slug field handler with debounced availability check ──────────────────

  const handleSlugChange = useCallback((value: string) => {
    setSlug(value);
    setSlugState({ status: "idle" });

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value) return;

    debounceRef.current = setTimeout(async () => {
      setSlugState({ status: "checking" });
      try {
        const res = await getOwnerSlugCheckApi(value);
        if (res.available) {
          setSlugState({ status: "available" });
        } else {
          setSlugState({ status: "taken", error: res.error ?? "Slug is not available" });
        }
      } catch {
        setSlugState({ status: "invalid", error: "Could not check slug availability" });
      }
    }, 400);
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slugState.status !== "available") return;
    setError(null);
    setSubmitting(true);

    try {
      const body: NewCustomerRequest = {
        email,
        slug,
        plan,
        ...(companyName ? { companyName } : {}),
      };
      const res = await postOwnerNewCustomerApi(body);
      setResult({ checkoutUrl: res.checkoutUrl, intentId: res.intentId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout session");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Copy to clipboard ─────────────────────────────────────────────────────

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Slug indicator icon ───────────────────────────────────────────────────

  function SlugIndicator() {
    if (slugState.status === "idle" || !slug) return null;
    if (slugState.status === "checking") {
      return (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </span>
      );
    }
    if (slugState.status === "available") {
      return (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400" aria-label="Slug available">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </span>
      );
    }
    return (
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" aria-label="Slug not available">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }

  // ── Result panel ──────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">Checkout link ready</h1>
        <p className="text-sm text-slate-400 mb-6">
          Send this link to the client. Once they complete payment, the VPS will be provisioned automatically.
        </p>

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Stripe Checkout URL</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={result.checkoutUrl}
                className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono truncate"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className={clsx(
                  "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  copied
                    ? "bg-emerald-700 text-emerald-100"
                    : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                )}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">Intent ID</p>
            <p className="font-mono text-xs text-slate-400">{result.intentId}</p>
          </div>

          <a
            href={result.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
          >
            Open in Stripe
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>

        <button
          onClick={() => {
            setResult(null);
            setEmail("");
            setSlug("");
            setCompanyName("");
            setPlan("starter");
            setSlugState({ status: "idle" });
          }}
          className="mt-4 text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          ← Create another
        </button>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  const canSubmit = !!email && slugState.status === "available" && !submitting;

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-slate-100 mb-1">New customer</h1>
      <p className="text-sm text-slate-400 mb-6">
        Generate a Stripe checkout link to send to the client. Payment triggers automatic VPS provisioning.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
            Client email <span className="text-red-400">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@company.com"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-hidden focus:ring-1 focus:ring-violet-500"
          />
        </div>

        {/* Company name */}
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-slate-300 mb-1.5">
            Company name <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-hidden focus:ring-1 focus:ring-violet-500"
          />
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-slate-300 mb-1.5">
            Subdomain slug <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              id="slug"
              type="text"
              required
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="acme-corp"
              autoComplete="off"
              className={clsx(
                "w-full rounded-md border bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:ring-1",
                slugState.status === "available"
                  ? "border-emerald-600 focus:border-emerald-500 focus:ring-emerald-500"
                  : slugState.status === "taken" || slugState.status === "invalid"
                  ? "border-red-600 focus:border-red-500 focus:ring-red-500"
                  : "border-slate-700 focus:border-violet-500 focus:ring-violet-500"
              )}
            />
            <SlugIndicator />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Instance URL: <span className="text-slate-400">{slug || "your-slug"}.nestfleet.dev</span>
          </p>
          {(slugState.status === "taken" || slugState.status === "invalid") && (
            <p className="mt-1 text-xs text-red-400" role="alert">{slugState.error}</p>
          )}
        </div>

        {/* Plan */}
        <div>
          <p className="text-sm font-medium text-slate-300 mb-2">Plan <span className="text-red-400">*</span></p>
          <div className="grid grid-cols-2 gap-3">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlan(p.id)}
                className={clsx(
                  "rounded-lg border p-3 text-left transition-colors",
                  plan === p.id
                    ? "border-violet-500 bg-violet-900/30 ring-1 ring-violet-500"
                    : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                )}
              >
                <p className="text-sm font-semibold text-slate-100">{p.label}</p>
                <p className="text-sm text-violet-400 font-medium">{p.price}</p>
                <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-md border border-red-800 bg-red-900/20 px-3 py-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className={clsx(
            "w-full rounded-md px-4 py-2.5 text-sm font-semibold transition-colors",
            canSubmit
              ? "bg-violet-600 text-white hover:bg-violet-500"
              : "bg-slate-700 text-slate-500 cursor-not-allowed"
          )}
        >
          {submitting ? "Creating checkout session…" : "Generate checkout link"}
        </button>
      </form>
    </div>
  );
}
