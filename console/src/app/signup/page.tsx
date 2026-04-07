"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { registerApi, ApiError } from "@/lib/api";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter — 30-day free trial",
  growth:  "Growth — 14-day free trial",
};

export default function SignupPage() {
  const { user, isLoading, login } = useAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const plan         = searchParams.get("plan") ?? null;

  const [displayName, setDisplayName] = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  // Redirect if already authenticated
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
      // Store token and redirect to setup wizard
      localStorage.setItem("nestfleet_token", res.data.token);
      // Use login to sync auth context, then redirect to setup
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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-2 group">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white text-base shadow-md group-hover:bg-indigo-700 transition-colors">
          ⚡
        </span>
        <span className="text-lg font-bold text-gray-900">NestFleet</span>
      </Link>

      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-gray-200 bg-white px-8 py-8 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-6">
            {plan && PLAN_LABELS[plan]
              ? `You're signing up for the ${PLAN_LABELS[plan]}.`
              : "Free forever — no credit card required."}
          </p>

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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-colors"
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

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600 font-medium hover:underline">
            Log in
          </Link>
        </p>

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
      </div>
    </div>
  );
}
