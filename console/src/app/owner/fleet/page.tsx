"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import clsx from "clsx";
import {
  getOwnerFleetApi,
  postOwnerFleetResetApi,
  postOwnerFleetRetryApi,
  postOwnerFleetDeprovisionApi,
  postReissueLicenseBulkApi,
  type FleetResponse,
  type Provisioning,
} from "@/lib/owner-api";
import { FleetStatusBadge } from "@/components/owner/FleetStatusBadge";
import { ReissueLicenseDialog } from "@/components/owner/ReissueLicenseDialog";

const PAGE_LIMIT = 20;

type StatusFilter = "all" | "active" | "failed" | "provisioning" | "deprovisioned";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
  starter:   "bg-slate-100 text-slate-700",
  growth:    "bg-blue-100 text-blue-700",
  scale:     "bg-purple-100 text-purple-700",
  community: "bg-gray-100 text-gray-500",
};

function TierBadge({ tier, reissueStatus }: { tier: string | null; reissueStatus: string | null }) {
  const label = tier ?? "—";
  const colorClass = tier ? (TIER_BADGE[tier] ?? "bg-gray-100 text-gray-500") : "bg-gray-100 text-gray-400";

  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", colorClass)}>
        {label}
      </span>
      {reissueStatus === "in_progress" && (
        <span title="Reissue in progress" aria-label="Reissue in progress">
          <svg className="h-3.5 w-3.5 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </span>
      )}
      {reissueStatus === "failed" && (
        <span title="Last reissue failed" aria-label="Last reissue failed">
          <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </span>
      )}
    </div>
  );
}

// ── Expiry cell ───────────────────────────────────────────────────────────────

function ExpiryCell({ isoDate }: { isoDate: string | null }) {
  if (!isoDate) return <span className="text-gray-400">—</span>;

  const now   = Date.now();
  const exp   = new Date(isoDate).getTime();
  const days  = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600" title={formatDate(isoDate)}>
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        Expired
      </span>
    );
  }

  if (days <= 30) {
    return (
      <span className="text-xs font-medium text-amber-600" title={formatDate(isoDate)}>
        {days}d left
      </span>
    );
  }

  return (
    <span className="text-xs text-gray-500">{formatDate(isoDate)}</span>
  );
}

// ── Health dot ────────────────────────────────────────────────────────────────

function HealthDot({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" title="Unknown" aria-label="Health unknown" />
    );
  }
  const healthy = status === "healthy" || status === "ok";
  return (
    <span
      className={clsx("inline-block h-2.5 w-2.5 rounded-full", healthy ? "bg-emerald-400" : "bg-red-400")}
      title={status}
      aria-label={`Health: ${status}`}
    />
  );
}

// ── Deprovision confirm dialog ────────────────────────────────────────────────

interface ConfirmDeprovisionDialogProps {
  slug: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}

function ConfirmDeprovisionDialog({ slug, onConfirm, onCancel, pending }: ConfirmDeprovisionDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="deprovision-dialog-title">
      <div className="bg-white rounded-xl shadow-2xl ring-1 ring-black/10 p-6 max-w-sm w-full mx-4">
        <h2 id="deprovision-dialog-title" className="text-base font-semibold text-gray-900 min-w-0">
          Deprovision{" "}
          <span className="font-mono text-sm text-gray-600 break-all">{slug}</span>?
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          This will <strong className="text-gray-700">immediately</strong> delete the VPS and remove the DNS record. This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onCancel} disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
            {pending ? "Deprovisioning..." : "Deprovision"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk renew dialog ─────────────────────────────────────────────────────────

interface BulkRenewDialogProps {
  slugs: string[];
  onSuccess: () => void;
  onClose: () => void;
}

function BulkRenewDialog({ slugs, onSuccess, onClose }: BulkRenewDialogProps) {
  function defaultExpiry() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  const [expiresDate, setExpiresDate] = useState(defaultExpiry());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) { setError("Reason must be at least 10 characters."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await postReissueLicenseBulkApi({
        slugs,
        expiresAt: new Date(expiresDate + "T00:00:00.000Z").toISOString(),
        reason: reason.trim(),
      });
      setQueued(res.queued);
      onSuccess();
    } catch (err) {
      setError((err as Error).message ?? "Bulk renew failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-renew-title">
      <div className="bg-white rounded-xl shadow-2xl ring-1 ring-black/10 w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 id="bulk-renew-title" className="text-base font-semibold text-gray-900">
            Bulk Renewal
            <span className="ml-2 text-sm font-normal text-gray-500">({slugs.length} customers)</span>
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {queued !== null ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                <svg className="h-5 w-5 flex-shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-emerald-800">
                  <strong>{queued}</strong> renewal job{queued !== 1 ? "s" : ""} queued successfully.
                </p>
              </div>
              <div className="flex justify-end">
                <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Close</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="max-h-24 overflow-y-auto rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                {slugs.map((s) => (
                  <span key={s} className="inline-block mr-2 mb-1 font-mono text-xs text-gray-700 bg-white rounded px-1.5 py-0.5 border border-gray-200">{s}</span>
                ))}
              </div>
              <p className="text-xs text-gray-500">Each VPS keeps its current tier. Only the expiry date is updated.</p>
              <div>
                <label htmlFor="bulk-expires" className="block text-sm font-medium text-gray-700 mb-1">Expires on</label>
                <input
                  id="bulk-expires"
                  type="date"
                  required
                  value={expiresDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setExpiresDate(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="bulk-reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-xs font-normal text-gray-400">(min 10 chars)</span>
                </label>
                <textarea
                  id="bulk-reason"
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Annual renewal for all active customers"
                  className={clsx(
                    "block w-full rounded-lg border bg-white px-3 py-2 text-sm resize-none shadow-sm focus:ring-1 focus:ring-indigo-500",
                    reason.length > 0 && reason.trim().length < 10 ? "border-red-300 focus:border-red-400" : "border-gray-300 focus:border-indigo-500"
                  )}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors">Cancel</button>
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
                  {submitting ? "Queuing..." : `Renew ${slugs.length} Licenses`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Row actions ───────────────────────────────────────────────────────────────

interface FleetRowActionsProps {
  row: Provisioning;
  onActionDone: () => void;
  onReissue: (row: Provisioning) => void;
}

function FleetRowActions({ row, onActionDone, onReissue }: FleetRowActionsProps) {
  const [resetting, setResetting]       = useState(false);
  const [retrying, setRetrying]         = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [deprovisioning, setDeprovisioning] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try { await postOwnerFleetRetryApi(row.org_slug); onActionDone(); } catch { /* ignore */ } finally { setRetrying(false); }
  }

  async function handleReset() {
    setResetting(true);
    try { await postOwnerFleetResetApi(row.org_slug); onActionDone(); } catch { /* ignore */ } finally { setResetting(false); }
  }

  async function handleDeprovisionConfirm() {
    setDeprovisioning(true);
    try {
      await postOwnerFleetDeprovisionApi(row.org_slug, { immediate: true });
      onActionDone();
      setShowConfirm(false);
    } catch { /* ignore */ } finally { setDeprovisioning(false); }
  }

  return (
    <>
      {showConfirm && (
        <ConfirmDeprovisionDialog
          slug={row.org_slug}
          onConfirm={handleDeprovisionConfirm}
          onCancel={() => setShowConfirm(false)}
          pending={deprovisioning}
        />
      )}
      <div className="flex items-center justify-end gap-2">
        {row.status === "failed" && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="rounded px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            aria-label={`Retry provisioning ${row.org_slug}`}
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
        )}
        {row.status === "active" && (
          <button
            onClick={() => onReissue(row)}
            disabled={row.reissue_status === "in_progress"}
            className="rounded px-2 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label={`Reissue license for ${row.org_slug}`}
          >
            Reissue
          </button>
        )}
        <button
          onClick={handleReset}
          disabled={resetting}
          className="rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          aria-label={`Reset ${row.org_slug}`}
        >
          {resetting ? "Resetting..." : "Reset"}
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={row.status === "deprovisioned" || row.status === "deprovisioning"}
          className="rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={`Deprovision ${row.org_slug}`}
        >
          Deprovision
        </button>
      </div>
    </>
  );
}

// ── Row class ─────────────────────────────────────────────────────────────────

function rowClass(status: string): string {
  return clsx(
    "transition-colors",
    status === "failed"         && "bg-red-50 hover:bg-red-100",
    status === "provisioning"   && "bg-amber-50 hover:bg-amber-100",
    status === "deprovisioned"  && "bg-gray-50 opacity-50",
    status === "active"         && "bg-white hover:bg-gray-50",
    status === "deprovisioning" && "bg-amber-50 opacity-70",
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All",           value: "all" },
  { label: "Active",        value: "active" },
  { label: "Failed",        value: "failed" },
  { label: "Provisioning",  value: "provisioning" },
  { label: "Deprovisioned", value: "deprovisioned" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FleetPage() {
  const [offset, setOffset]               = useState(0);
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [reissueTarget, setReissueTarget] = useState<Provisioning | null>(null);
  const [showBulkRenew, setShowBulkRenew] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<FleetResponse>(
    ["owner-fleet", offset],
    () => getOwnerFleetApi({ limit: PAGE_LIMIT, offset }),
    { keepPreviousData: true }
  );

  const allRows: Provisioning[] = data?.data ?? [];
  const rows = statusFilter === "all"
    ? allRows
    : allRows.filter((r) => r.status === statusFilter);

  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

  const counts = allRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  function onActionDone() { void mutate(); }

  // Bulk select helpers
  const activeRows = rows.filter((r) => r.status === "active");
  const allActiveSelected = activeRows.length > 0 && activeRows.every((r) => selected.has(r.org_slug));

  function toggleSelectAll() {
    if (allActiveSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        activeRows.forEach((r) => next.delete(r.org_slug));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        activeRows.forEach((r) => next.add(r.org_slug));
        return next;
      });
    }
  }

  function toggleRow(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  }

  const selectedSlugs = Array.from(selected);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Fleet</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {total} total provisioning{total !== 1 ? "s" : ""}
          </p>
        </div>
        {selectedSlugs.length > 0 && (
          <button
            onClick={() => setShowBulkRenew(true)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Renew Selected ({selectedSlugs.length})
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ label, value }) => {
          const count  = value === "all" ? allRows.length : (counts[value] ?? 0);
          const active = statusFilter === value;
          return (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                active ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              )}
            >
              {label}
              <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none", active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg bg-red-950/60 border border-red-700/40 px-4 py-3">
          <p className="text-sm text-red-300">{(error as Error).message ?? "Failed to load fleet data."}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th scope="col" className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allActiveSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Select all active rows"
                    title="Select all active"
                  />
                </th>
                {(["Slug", "Status", "License Tier", "Expires", "IP", "Health"] as const).map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && allRows.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {statusFilter === "all" ? "No fleet entries found." : `No ${statusFilter} instances.`}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isActive    = row.status === "active";
                  const isSelected  = selected.has(row.org_slug);
                  return (
                    <tr
                      key={row.id}
                      className={clsx(rowClass(row.status), isSelected && "ring-inset ring-2 ring-indigo-200")}
                    >
                      <td className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(row.org_slug)}
                          disabled={!isActive}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30"
                          aria-label={`Select ${row.org_slug}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-900 whitespace-nowrap">
                        <Link
                          href={`/owner/fleet/${row.org_slug}`}
                          className="text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {row.org_slug}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <FleetStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <TierBadge
                          tier={row.license_tier ?? row.plan}
                          reissueStatus={row.reissue_status ?? null}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ExpiryCell isoDate={row.license_expires_at ?? null} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                        {row.hetzner_server_ip ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <HealthDot status={row.status === "active" ? row.last_health_status : null} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <FleetRowActions row={row} onActionDone={onActionDone} onReissue={setReissueTarget} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_LIMIT && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-500">
              Page {currentPage} of {totalPages} &mdash; {total} total
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
                disabled={offset === 0}
                className="rounded px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + PAGE_LIMIT)}
                disabled={offset + PAGE_LIMIT >= total}
                className="rounded px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reissue license dialog */}
      {reissueTarget && (
        <ReissueLicenseDialog
          slug={reissueTarget.org_slug}
          currentTier={reissueTarget.license_tier ?? reissueTarget.plan}
          currentExpiresAt={reissueTarget.license_expires_at ?? null}
          hasPendingJwt={reissueTarget.reissue_status === "failed"}
          onSuccess={onActionDone}
          onClose={() => setReissueTarget(null)}
        />
      )}

      {/* Bulk renew dialog */}
      {showBulkRenew && (
        <BulkRenewDialog
          slugs={selectedSlugs}
          onSuccess={() => { setSelected(new Set()); onActionDone(); }}
          onClose={() => setShowBulkRenew(false)}
        />
      )}
    </div>
  );
}
