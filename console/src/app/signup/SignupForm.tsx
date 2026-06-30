// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { registerApi, saasSignupApi, waitlistApi, ApiError } from "@/lib/api";
import { WAITLIST_MODE } from "@/lib/flags";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter — 14-day free trial",
  growth:  "Growth — 14-day free trial",
  scale:   "Scale — 14-day free trial",
};

// ── Community (self-hosted) signup form ──────────────────────────────────────

function CommunitySignupForm() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace("/cases");
  }, [isLoading, user, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await registerApi({ email: email.trim(), password, displayName: displayName.trim() || undefined });
      localStorage.setItem("nestfleet_token", res.data.token);
      await login(email.trim(), password);
      router.replace("/setup");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError("Public registration is not enabled on this instance. Ask your admin for an invite.");
        } else if (err.status === 409) {
          setError("An account with this email already exists. Try logging in.");
        } else {
          setError(err.message || "Registration failed. Please try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-8 py-8 shadow-xs">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Create your account</h1>
      <p className="text-sm text-gray-500 mb-6">Free forever — no credit card required.</p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="displayName" className="block text-xs font-medium text-gray-700 mb-1">
            Name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="displayName"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Alex Smith"
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1">
            Work email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-xs font-medium text-gray-700 mb-1">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !email || !password || !confirm}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-gray-400">
        By signing up you agree to our{" "}
        <a href="/terms" className="text-indigo-500 hover:underline">Terms of Service</a>
        {" "}and{" "}
        <a href="/privacy" className="text-indigo-500 hover:underline">Privacy Policy</a>.
      </p>
    </div>
  );
}

// ── SaaS managed signup form ─────────────────────────────────────────────────

function SaasSignupForm({ plan }: { plan: string }) {
  const [email,       setEmail]       = useState("");
  const [slug,        setSlug]        = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  // Auto-generate slug from company name
  function handleCompanyChange(value: string) {
    setCompanyName(value);
    const generated = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 32);
    setSlug(generated);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!slug || slug.length < 3) {
      setError("Organisation slug must be at least 3 characters.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError("Slug may only contain lowercase letters, numbers, and hyphens.");
      return;
    }

    setSubmitting(true);
    try {
      const planKey = (plan === "starter" || plan === "growth" || plan === "scale") ? plan : "starter";
      const res = await saasSignupApi({
        email: email.trim(),
        slug: slug.trim(),
        plan: planKey,
        companyName: companyName.trim() || undefined,
      });
      // Redirect to Stripe checkout
      window.location.href = res.checkoutUrl;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError("That organisation slug is already taken. Please choose another.");
        } else if (err.status === 429) {
          setError("Too many requests. Please wait a moment and try again.");
        } else {
          setError(err.message || "Something went wrong. Please try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const planLabel = PLAN_LABELS[plan] ?? "14-day free trial";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-8 py-8 shadow-xs">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Start your free trial</h1>
      <p className="text-sm text-gray-500 mb-1">{planLabel}</p>
      <p className="text-xs text-gray-400 mb-6">
        No credit card charged during trial. Cancel any time.
      </p>

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 mb-5">
        Your managed instance starts fresh. If you have data from a self-hosted install, export it first — migration tooling is coming soon.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="saas-email" className="block text-xs font-medium text-gray-700 mb-1">
            Work email
          </label>
          <input
            id="saas-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
          />
        </div>

        <div>
          <label htmlFor="saas-company" className="block text-xs font-medium text-gray-700 mb-1">
            Company name
          </label>
          <input
            id="saas-company"
            type="text"
            autoComplete="organization"
            value={companyName}
            onChange={(e) => handleCompanyChange(e.target.value)}
            placeholder="Acme Corp"
            maxLength={200}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
          />
        </div>

        <div>
          <label htmlFor="saas-slug" className="block text-xs font-medium text-gray-700 mb-1">
            Organisation slug{" "}
            <span className="text-gray-400 font-normal">(your instance URL)</span>
          </label>
          <div className="flex items-center rounded-lg border border-gray-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-colors overflow-hidden">
            <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-300 select-none whitespace-nowrap">
              nestfleet.dev/
            </span>
            <input
              id="saas-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))}
              placeholder="acme"
              className="flex-1 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-hidden bg-white"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, and hyphens. 3–32 characters.</p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !email || !slug || slug.length < 3}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {submitting ? "Redirecting to checkout…" : "Continue to payment →"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-gray-400">
        By signing up you agree to our{" "}
        <a href="/terms" className="text-indigo-500 hover:underline">Terms of Service</a>
        {" "}and{" "}
        <a href="/privacy" className="text-indigo-500 hover:underline">Privacy Policy</a>.
      </p>
    </div>
  );
}

// ── Waitlist signup (shown instead of Stripe form when WAITLIST_MODE=true) ────

function WaitlistSignupForm({ plan }: { plan: string }) {
  const [email,      setEmail]      = useState("");
  const [name,       setName]       = useState("");
  const [company,    setCompany]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const planLabel = PLAN_LABELS[plan] ?? plan;
  const planKey   = (plan === "starter" || plan === "growth" || plan === "scale") ? plan : undefined;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await waitlistApi({ email: email.trim(), name: name.trim() || undefined, company: company.trim() || undefined, plan: planKey });
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

  if (done) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-8 py-10 shadow-xs text-center">
        <div className="mb-4 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">You&apos;re on the list!</h1>
        <p className="text-sm text-gray-500">
          We&apos;ve saved your interest in the <span className="font-semibold text-indigo-600">{planLabel.split("—")[0]?.trim()}</span> plan.
          We&apos;ll email you at <span className="font-medium">{email}</span> the moment managed hosting launches.
        </p>
        <Link href="/" className="mt-6 inline-flex items-center text-sm text-indigo-600 hover:underline">
          ← Back to homepage
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-8 py-8 shadow-xs">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Reserve your spot</h1>
      <p className="text-sm text-gray-500 mb-1">{planLabel}</p>
      <p className="text-xs text-gray-400 mb-5">
        Managed hosting is getting ready. Be first in line.
      </p>

      <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5 text-xs text-indigo-700 mb-5">
        Leave your details and we&apos;ll email you the moment <span className="font-semibold">managed hosting launches</span> — no spam, one email.
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="wl-email" className="block text-xs font-medium text-gray-700 mb-1">
            Work email <span className="text-red-500">*</span>
          </label>
          <input
            id="wl-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
          />
        </div>

        <div>
          <label htmlFor="wl-name" className="block text-xs font-medium text-gray-700 mb-1">
            Name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="wl-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Smith"
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
          />
        </div>

        <div>
          <label htmlFor="wl-company" className="block text-xs font-medium text-gray-700 mb-1">
            Company <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="wl-company"
            type="text"
            autoComplete="organization"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            maxLength={200}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-colors"
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
    </div>
  );
}

// ── Root component — branches on plan query param ────────────────────────────

export default function SignupForm() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");

  const isSaasFlow = plan !== null && plan in PLAN_LABELS;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-2 group">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white text-base shadow-md group-hover:bg-indigo-700 transition-colors">
          ⚡
        </span>
        <span className="text-lg font-bold text-gray-900">NestFleet</span>
      </Link>

      <div className="w-full max-w-sm">
        {isSaasFlow
          ? WAITLIST_MODE
            ? <WaitlistSignupForm plan={plan} />
            : <SaasSignupForm plan={plan} />
          : <CommunitySignupForm />
        }

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600 font-medium hover:underline">
            Log in
          </Link>
        </p>

        {!isSaasFlow && (
          <p className="mt-3 text-center text-xs text-gray-400">
            Self-hosting?{" "}
            <a
              href="https://github.com/nestfleet/nestfleet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:underline"
            >
              Deploy from source →
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
