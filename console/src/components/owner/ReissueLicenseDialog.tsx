// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * ReissueLicenseDialog — FEAT-012
 *
 * Modal for owner to change a customer VPS license tier + expiry.
 * Used from both the Fleet list (quick action) and Fleet detail page.
 */

import { useState } from "react";
import clsx from "clsx";
import { postReissueLicenseApi, getLicenseJwtBlobUrl, type ReissueLicenseRequest } from "@/lib/owner-api";

export type LicenseTier = "starter" | "growth" | "scale";

const TIER_RANK: Record<string, number> = { starter: 1, growth: 2, scale: 3 };

const TIER_OPTIONS: { value: LicenseTier; label: string }[] = [
  { value: "starter", label: "Starter" },
  { value: "growth",  label: "Growth" },
  { value: "scale",   label: "Scale" },
];

function defaultExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

interface Props {
  slug: string;
  currentTier: string | null;
  currentExpiresAt: string | null;
  hasPendingJwt?: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export function ReissueLicenseDialog({
  slug,
  currentTier,
  hasPendingJwt = false,
  onSuccess,
  onClose,
}: Props) {
  const safeCurrentTier = (currentTier ?? "starter") as LicenseTier;
  const availableTiers = TIER_OPTIONS.filter((opt) => opt.value !== safeCurrentTier);

  const [tier, setTier] = useState<LicenseTier>(availableTiers[0]?.value ?? "growth");
  const [expiresDate, setExpiresDate] = useState<string>(defaultExpiry());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ jobId: string; reissueId: string } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const isDowngrade =
    (TIER_RANK[tier] ?? 0) < (TIER_RANK[safeCurrentTier] ?? 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError("Reason must be at least 10 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: ReissueLicenseRequest = {
        tier,
        expiresAt: new Date(expiresDate + "T00:00:00.000Z").toISOString(),
        reason: reason.trim(),
      };
      const res = await postReissueLicenseApi(slug, body);
      setSuccess({ jobId: res.jobId, reissueId: res.reissueId });
      onSuccess();
    } catch (err) {
      setError((err as Error).message ?? "Failed to queue reissue job.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadJwt() {
    setDownloading(true);
    try {
      const url = await getLicenseJwtBlobUrl(slug);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-license.jwt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message ?? "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reissue-dialog-title"
    >
      <div className="bg-white rounded-xl shadow-2xl ring-1 ring-black/10 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2
            id="reissue-dialog-title"
            className="text-base font-semibold text-gray-900"
          >
            Reissue License
            <span className="ml-2 font-mono text-sm font-normal text-gray-500">
              {slug}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Pending JWT warning */}
          {hasPendingJwt && (
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <svg className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-800">Previous reissue failed</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  A signed JWT is available to apply manually.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadJwt}
                  disabled={downloading}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                >
                  {downloading ? "Downloading..." : "Download license.jwt"}
                </button>
              </div>
            </div>
          )}

          {/* Success state */}
          {success ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                <svg className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-emerald-800">Reissue job queued</p>
                  <p className="mt-0.5 text-xs text-emerald-700 font-mono break-all">
                    Job: {success.jobId}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Current tier info */}
              {currentTier && (
                <p className="text-xs text-gray-500">
                  Current tier:{" "}
                  <span className="font-semibold text-gray-700 capitalize">{currentTier}</span>
                </p>
              )}

              {/* Tier */}
              <div>
                <label htmlFor="reissue-tier" className="block text-sm font-medium text-gray-700 mb-1">
                  New tier
                </label>
                <select
                  id="reissue-tier"
                  value={tier}
                  onChange={(e) => setTier(e.target.value as LicenseTier)}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {/* Exclude the current tier — reissue is a tier change, not a renewal.
                      To restore all options: replace availableTiers with TIER_OPTIONS. */}
                  {availableTiers.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Downgrade warning */}
              {isDowngrade && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <svg className="h-4 w-4 shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p className="text-xs text-red-700">
                    <strong>Downgrade:</strong> Features above {tier} tier will be disabled on the customer&apos;s VPS after reissue.
                  </p>
                </div>
              )}

              {/* Expires At */}
              <div>
                <label htmlFor="reissue-expires" className="block text-sm font-medium text-gray-700 mb-1">
                  Expires on
                </label>
                <input
                  id="reissue-expires"
                  type="date"
                  required
                  value={expiresDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setExpiresDate(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Reason */}
              <div>
                <label htmlFor="reissue-reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                  <span className="ml-1 text-xs font-normal text-gray-400">(min 10 chars)</span>
                </label>
                <textarea
                  id="reissue-reason"
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Customer requested upgrade to Growth tier"
                  className={clsx(
                    "block w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow-xs resize-none focus:ring-1 focus:ring-indigo-500",
                    reason.length > 0 && reason.trim().length < 10
                      ? "border-red-300 focus:border-red-400"
                      : "border-gray-300 focus:border-indigo-500"
                  )}
                />
                {reason.length > 0 && reason.trim().length < 10 && (
                  <p className="mt-1 text-xs text-red-500">
                    {10 - reason.trim().length} more character{10 - reason.trim().length !== 1 ? "s" : ""} needed
                  </p>
                )}
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || reason.trim().length < 10}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting && (
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                  {submitting ? "Reissuing..." : "Reissue License"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
