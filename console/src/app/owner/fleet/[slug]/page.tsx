// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState } from "react";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import clsx from "clsx";
import { useNow } from "@/lib/useNow";
import {
  getOwnerFleetItemApi,
  getLicenseHistoryApi,
  getLicenseJwtBlobUrl,
  postOwnerFleetResetApi,
  postOwnerFleetDeprovisionApi,
  type FleetItemResponse,
  type LicenseReissue,
  type LicenseHistoryResponse,
} from "@/lib/owner-api";
import { FleetStatusBadge } from "@/components/owner/FleetStatusBadge";
import { DetailRow } from "@/components/DetailRow";
import { ReissueLicenseDialog } from "@/components/owner/ReissueLicenseDialog";

interface FleetDetailPageProps {
  params: Promise<{ slug: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
  starter:   "bg-slate-100 text-slate-700 ring-slate-200",
  growth:    "bg-blue-100  text-blue-700  ring-blue-200",
  scale:     "bg-purple-100 text-purple-700 ring-purple-200",
};

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-sm text-gray-400">—</span>;
  const cls = TIER_BADGE[tier] ?? "bg-gray-100 text-gray-600 ring-gray-200";
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset", cls)}>
      {tier}
    </span>
  );
}

// ── Reissue status badge ──────────────────────────────────────────────────────

function ReissueStatusBadge({ status }: { status: string | null }) {
  if (!status || status === "idle") {
    return <span className="text-sm text-gray-500">Idle</span>;
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium">
        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-red-600 font-medium">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      Last failed
    </span>
  );
}

// ── Expiry display ────────────────────────────────────────────────────────────

function ExpiryDisplay({ iso }: { iso: string | null }) {
  const now = useNow();
  if (!iso) return <span className="text-sm text-gray-400">—</span>;
  const exp  = new Date(iso).getTime();
  const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return (
      <span className="text-sm font-medium text-red-600">
        {formatDate(iso)} <span className="text-xs font-normal">(expired)</span>
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="text-sm font-medium text-amber-600">
        {formatDate(iso)} <span className="text-xs font-normal">({days}d left)</span>
      </span>
    );
  }
  return <span className="text-sm text-gray-700">{formatDate(iso)}</span>;
}

// ── License history panel ─────────────────────────────────────────────────────

function ReissueStatusPill({ status }: { status: LicenseReissue["status"] }) {
  const map = {
    pending:  "bg-amber-100 text-amber-700",
    complete: "bg-emerald-100 text-emerald-700",
    failed:   "bg-red-100 text-red-700",
  };
  return (
    <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", map[status])}>
      {status}
    </span>
  );
}

interface LicenseHistoryPanelProps {
  slug: string;
  onDownloadJwt: (reissueId: string) => void;
}

function LicenseHistoryPanel({ slug, onDownloadJwt }: LicenseHistoryPanelProps) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useSWR<LicenseHistoryResponse>(
    open ? ["license-history", slug] : null,
    () => getLicenseHistoryApi(slug)
  );

  const records: LicenseReissue[] = data?.data ?? [];

  return (
    <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-gray-800">License History</span>
        <svg
          className={clsx("h-4 w-4 text-gray-400 transition-transform", open && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 w-full bg-gray-100 rounded-sm animate-pulse" />
              ))}
            </div>
          )}
          {error && (
            <p className="text-sm text-red-500">{(error as Error).message ?? "Failed to load history."}</p>
          )}
          {!isLoading && !error && records.length === 0 && (
            <p className="text-sm text-gray-400">No reissue history yet.</p>
          )}
          {records.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs divide-y divide-gray-100">
                <thead>
                  <tr className="text-gray-500 uppercase tracking-wide">
                    <th className="pb-2 pr-4 text-left font-medium">Date</th>
                    <th className="pb-2 pr-4 text-left font-medium">Tier change</th>
                    <th className="pb-2 pr-4 text-left font-medium">New expiry</th>
                    <th className="pb-2 pr-4 text-left font-medium">Status</th>
                    <th className="pb-2 pr-4 text-left font-medium">Reason</th>
                    <th className="pb-2 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <span className="text-gray-500 capitalize">{r.previous_tier}</span>
                        <span className="mx-1 text-gray-400">→</span>
                        <span className="font-semibold text-gray-800 capitalize">{r.new_tier}</span>
                      </td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">
                        {formatDate(r.new_expires_at)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <ReissueStatusPill status={r.status} />
                      </td>
                      <td className="py-2 pr-4 text-gray-600 max-w-[200px] truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        {r.status === "failed" && r.pending_jwt && (
                          <button
                            type="button"
                            onClick={() => onDownloadJwt(r.id)}
                            className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            JWT
                          </button>
                        )}
                        {r.status === "failed" && r.failed_reason && (
                          <span className="ml-1 text-red-500 text-[10px]" title={r.failed_reason}>
                            ⓘ
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Deprovision confirm ───────────────────────────────────────────────────────

interface ConfirmDeprovisionDialogProps {
  slug: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}

function ConfirmDeprovisionDialog({ slug, onConfirm, onCancel, pending }: ConfirmDeprovisionDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="deprovision-dialog-title">
      <div className="bg-white rounded-xl shadow-2xl ring-1 ring-black/10 p-6 max-w-xs w-full mx-4">
        <h2 id="deprovision-dialog-title" className="text-base font-semibold text-gray-900">
          Deprovision{" "}
          <span className="break-all font-mono text-sm text-gray-600">{slug}</span>?
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Are you sure? This will start a 30-day grace period before the server is permanently deprovisioned.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
            {pending ? "Deprovisioning..." : "Deprovision"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FleetDetailPage({ params }: FleetDetailPageProps) {
  const { slug } = use(params);

  const { data, error, isLoading, mutate } = useSWR<FleetItemResponse>(
    ["owner-fleet-item", slug],
    () => getOwnerFleetItemApi(slug)
  );

  const [resetting, setResetting]         = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [deprovisioning, setDeprovisioning] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showReissue, setShowReissue]     = useState(false);
  const [downloading, setDownloading]     = useState(false);

  async function handleReset() {
    setResetting(true);
    setActionMessage(null);
    try {
      const res = await postOwnerFleetResetApi(slug);
      setActionMessage(res.message ?? "Reset initiated.");
      void mutate();
    } catch (err) {
      setActionMessage((err as Error).message ?? "Reset failed.");
    } finally {
      setResetting(false);
    }
  }

  async function handleDeprovisionConfirm() {
    setDeprovisioning(true);
    setActionMessage(null);
    try {
      const res = await postOwnerFleetDeprovisionApi(slug, { graceDays: 30 });
      setActionMessage(res.message ?? "Deprovision started.");
      setShowConfirm(false);
      void mutate();
    } catch (err) {
      setActionMessage((err as Error).message ?? "Deprovision failed.");
    } finally {
      setDeprovisioning(false);
    }
  }

  async function handleDownloadJwt(_reissueId?: string) {
    setDownloading(true);
    try {
      const url = await getLicenseJwtBlobUrl(slug);
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `${slug}-license.jwt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionMessage((err as Error).message ?? "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  const p = data?.data;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Back */}
      <Link href="/owner/fleet" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to Fleet
      </Link>

      {/* Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-100 font-mono">{slug}</h1>
        {p && <FleetStatusBadge status={p.status} />}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg bg-red-950/60 border border-red-700/40 px-4 py-3">
          <p className="text-sm text-red-300">{(error as Error).message ?? "Failed to load provisioning details."}</p>
        </div>
      )}

      {/* Action message */}
      {actionMessage && (
        <div role="status" className="rounded-lg bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-slate-300">
          {actionMessage}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !p && (
        <div className="bg-white rounded-xl shadow-xs ring-1 ring-black/5 p-6 animate-pulse" aria-hidden="true">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="h-2.5 w-16 bg-gray-200 rounded-sm mb-2" />
                <div className="h-4 w-32 bg-gray-200 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {p && (
        <>
          {/* Failed error */}
          {p.status === "failed" && p.error_message && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Provisioning Error</p>
              <p className="text-sm text-red-700 font-mono">{p.error_message}</p>
            </div>
          )}

          {/* Reissue failed warning + download */}
          {p.reissue_status === "failed" && (
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <svg className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-800">License reissue failed</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  The last reissue job could not apply the license to the VPS. A signed JWT may be available to apply manually.
                </p>
                <button
                  type="button"
                  onClick={() => handleDownloadJwt()}
                  disabled={downloading}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                >
                  {downloading ? "Downloading..." : "Download license.jwt"}
                </button>
              </div>
            </div>
          )}

          {/* Provisioning detail card */}
          <div className="bg-white rounded-xl shadow-xs ring-1 ring-black/5 p-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <DetailRow label="ID">
                <span className="font-mono text-xs text-gray-700">{p.id}</span>
              </DetailRow>
              <DetailRow label="Org Slug">
                <span className="font-mono text-sm text-gray-900">{p.org_slug}</span>
              </DetailRow>
              <DetailRow label="Customer Email">
                <span className="text-sm text-gray-900">{p.customer_email}</span>
              </DetailRow>
              <DetailRow label="Plan">
                <span className="text-sm text-gray-900 capitalize">{p.plan}</span>
              </DetailRow>
              <DetailRow label="Status">
                <FleetStatusBadge status={p.status} />
              </DetailRow>
              <DetailRow label="Server IP">
                <span className="font-mono text-sm text-gray-700">{p.hetzner_server_ip ?? "—"}</span>
              </DetailRow>
              <DetailRow label="Provisioned At">
                <span className="text-sm text-gray-700">{formatDateTime(p.provisioned_at)}</span>
              </DetailRow>
              <DetailRow label="Created At">
                <span className="text-sm text-gray-700">{formatDateTime(p.created_at)}</span>
              </DetailRow>
              <DetailRow label="Last Health Check">
                <span className="text-sm text-gray-700">{formatDateTime(p.last_health_check_at)}</span>
              </DetailRow>
              <DetailRow label="Health Status">
                <span className={clsx("text-sm font-medium capitalize", {
                  "text-emerald-600": p.last_health_status === "healthy" || p.last_health_status === "ok",
                  "text-red-600": p.last_health_status !== null && p.last_health_status !== "healthy" && p.last_health_status !== "ok",
                  "text-gray-400": p.last_health_status === null,
                })}>
                  {p.last_health_status ?? "Unknown"}
                </span>
              </DetailRow>
            </dl>
          </div>

          {/* License card */}
          <div className="bg-white rounded-xl shadow-xs ring-1 ring-black/5 p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">License</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <DetailRow label="License Tier">
                <TierBadge tier={p.license_tier ?? p.plan} />
              </DetailRow>
              <DetailRow label="Provisioning Plan">
                <span className="text-sm text-gray-700 capitalize">{p.plan}</span>
              </DetailRow>
              <DetailRow label="Expires">
                <ExpiryDisplay iso={p.license_expires_at ?? null} />
              </DetailRow>
              <DetailRow label="Reissue Status">
                <ReissueStatusBadge status={p.reissue_status ?? null} />
              </DetailRow>
            </dl>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {p.status === "active" && (
              <button
                onClick={() => setShowReissue(true)}
                disabled={p.reissue_status === "in_progress"}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {p.reissue_status === "in_progress" ? "Reissuing..." : "Reissue License"}
              </button>
            )}
            <button
              onClick={handleReset}
              disabled={resetting}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              {resetting ? "Resetting..." : "Reset"}
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={p.status === "deprovisioned" || p.status === "deprovisioning" || deprovisioning}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Deprovision
            </button>
          </div>

          {/* License history */}
          <LicenseHistoryPanel slug={slug} onDownloadJwt={handleDownloadJwt} />
        </>
      )}

      {/* Deprovision confirm */}
      {showConfirm && (
        <ConfirmDeprovisionDialog
          slug={slug}
          onConfirm={handleDeprovisionConfirm}
          onCancel={() => setShowConfirm(false)}
          pending={deprovisioning}
        />
      )}

      {/* Reissue license dialog */}
      {showReissue && p && (
        <ReissueLicenseDialog
          slug={slug}
          currentTier={p.license_tier ?? p.plan}
          currentExpiresAt={p.license_expires_at ?? null}
          hasPendingJwt={p.reissue_status === "failed"}
          onSuccess={() => void mutate()}
          onClose={() => setShowReissue(false)}
        />
      )}
    </div>
  );
}
