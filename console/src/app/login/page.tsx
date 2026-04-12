// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/app/resolve-product");
    }
  }, [isLoading, user, router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      router.replace("/app/resolve-product");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Invalid email or password. Please try again.");
        } else {
          setError(`Login failed: ${err.message}`);
        }
      } else {
        setError("An unexpected error occurred. Is the API server running?");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo & Title */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
              />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">NestFleet Console</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your operator account</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Error alert */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100"
              >
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                placeholder="operator@example.com"
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                placeholder="••••••••"
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {isSubmitting ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden="true"
                  />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          First time here?{" "}
          <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Create your account
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-gray-400">
          NestFleet operator console &mdash; authorized access only
        </p>
      </div>
    </div>
  );
}
