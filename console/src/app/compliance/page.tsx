// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import {
  dsarSearchApi,
  dsarExportUrl,
  runRetentionSweepApi,
  updateSettingsApi,
  getSettingsApi,
  ApiError,
  type DsarSearchResult,
  type RetentionSweepResult,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useProductIdWithFallback } from "@/lib/product-context";
import useSWR from "swr";

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionCard({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-xs">
      <div className="px-6 py-4 border-b border-zinc-100">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-zinc-500 mt-0.5">{description}</p>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}


// ── DSAR Section ──────────────────────────────────────────────────────────────

// ── DSAR result table (shared between history entries) ────────────────────────

function DsarResultTable({
  result,
  token,
  productId,
}: {
  result: DsarSearchResult;
  token: string;
  productId: string;
}) {
  const { toast } = useToast();

  const handleExport = (format: "json" | "csv") => {
    const url = dsarExportUrl(productId, result.identity, format);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.setAttribute("download", "");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast("Export failed", "error"));
  };

  const total = Object.values(result.summary).reduce((s, v) => s + v, 0);
  const rows: { label: string; value: number }[] = [
    { label: "Identities",      value: result.summary.identities },
    { label: "Cases",           value: result.summary.cases },
    { label: "Signals",         value: result.summary.signals },
    { label: "Conversations",   value: result.summary.conversations },
    { label: "Notifications",   value: result.summary.notifications },
    { label: "Audit Events",    value: result.summary.auditEvents },
    { label: "Change Requests", value: result.summary.changeRequests },
  ];

  return (
    <div className="space-y-3 pt-1">
      <div className="rounded-lg border border-zinc-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Entity</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">Records</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.label} className={row.value > 0 ? "bg-white" : "bg-zinc-50"}>
                <td className="px-4 py-2.5 font-medium text-zinc-700">{row.label}</td>
                <td className="px-4 py-2.5 text-right font-mono text-zinc-800">{row.value}</td>
                <td className="px-4 py-2.5 text-right">
                  {row.value > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">Found</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-50 border-t border-zinc-200">
              <td className="px-4 py-2.5 text-xs font-medium text-zinc-500">Total</td>
              <td className="px-4 py-2.5 text-right font-mono font-semibold text-zinc-800">{total}</td>
              <td className="px-4 py-2.5 text-right">
                {total === 0 ? (
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">No data</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">Data found</span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-500">Export:</span>
        <button
          onClick={() => handleExport("json")}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          JSON
        </button>
        <button
          onClick={() => handleExport("csv")}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          CSV
        </button>
      </div>
    </div>
  );
}

// ── DSAR history entry ────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number;
  result: DsarSearchResult;
}

function DsarHistoryEntry({
  entry,
  isOpen,
  onToggle,
  onRemove,
  token,
  productId,
}: {
  entry: HistoryEntry;
  isOpen: boolean;
  onToggle: () => void;
  onRemove: () => void;
  token: string;
  productId: string;
}) {
  const total = Object.values(entry.result.summary).reduce((s, v) => s + v, 0);

  return (
    <div className="rounded-lg border border-zinc-200 overflow-hidden">
      {/* Collapsible header — click anywhere to toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Chevron */}
          <svg
            className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {/* Identity */}
          <span className="font-mono text-sm font-medium text-zinc-800 truncate">{entry.result.identity}</span>
          {entry.result.query && entry.result.query !== entry.result.identity && (
            <span className="text-xs text-zinc-400 truncate hidden sm:block">({entry.result.query})</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {/* Record count badge */}
          {total > 0 ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              {total} record{total !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
              No data
            </span>
          )}
          <span className="text-xs text-zinc-400">{new Date(entry.result.generatedAt).toLocaleTimeString()}</span>
          {/* Remove button — stop propagation so it doesn't toggle */}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRemove(); } }}
            className="ml-1 rounded-sm p-0.5 text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100 cursor-pointer"
            title="Remove from history"
            aria-label="Remove"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        </div>
      </button>

      {/* Expandable body */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-zinc-100">
          <DsarResultTable result={entry.result} token={token} productId={productId} />
        </div>
      )}
    </div>
  );
}

// ── DSAR Section ──────────────────────────────────────────────────────────────

function DsarSection({ productId, token }: { productId: string; token: string }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const nextId = useState(0);

  const handleSearch = async () => {
    if (!email) return;
    if (email.trim().length < 2) {
      toast("Enter at least 2 characters to search", "error");
      return;
    }
    setSearching(true);
    try {
      const res = await dsarSearchApi(productId, email);
      const total = Object.values(res.data.summary).reduce((s, v) => s + (v as number), 0);
      if (total === 0) {
        toast(`No data found for "${email}"`, "info");
        setEmail("");
        setSearching(false);
        return;
      }
      const id = ++nextId[0];
      setHistory((prev) => [{ id, result: res.data }, ...prev]);
      setOpenIds((prev) => new Set([id, ...prev]));  // auto-expand new entry
      setEmail("");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "DSAR search failed", "error");
    } finally {
      setSearching(false);
    }
  };

  const toggleEntry = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const removeEntry = (id: number) => {
    setHistory((prev) => prev.filter((e) => e.id !== id));
    setOpenIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  return (
    <SectionCard
      title="Data Subject Access Request (DSAR)"
      description="Search and export all records associated with an identity. Required for GDPR Articles 15–20 compliance."
    >
      <div className="space-y-4">
        {/* Search input */}
        <div className="flex gap-3">
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="email, name, or @telegram"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={handleSearch}
            disabled={!email || searching}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Search history ({history.length})
              </p>
              <button
                onClick={() => { setHistory([]); setOpenIds(new Set()); }}
                className="text-xs text-zinc-400 hover:text-zinc-600"
              >
                Clear all
              </button>
            </div>

            {history.map((entry) => (
              <DsarHistoryEntry
                key={entry.id}
                entry={entry}
                isOpen={openIds.has(entry.id)}
                onToggle={() => toggleEntry(entry.id)}
                onRemove={() => removeEntry(entry.id)}
                token={token}
                productId={productId}
              />
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Retention Section ─────────────────────────────────────────────────────────

function RetentionSection({ productId }: { productId: string }) {
  const { toast } = useToast();
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<RetentionSweepResult | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: settingsData, mutate } = useSWR(
    ["settings", productId],
    () => getSettingsApi(productId),
  );

  const retention = settingsData?.data?.retention;
  const [retentionDays, setRetentionDays] = useState<number | "">("");
  const [autoCloseDays, setAutoCloseDays] = useState<number | "">("");

  // Sync once loaded
  const effectiveRetentionDays = retentionDays !== "" ? retentionDays : (retention?.retentionDays ?? 365);
  const effectiveAutoCloseDays = autoCloseDays !== "" ? autoCloseDays : (retention?.autoCloseDays ?? 7);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettingsApi(productId, {
        retention: {
          retentionDays: effectiveRetentionDays,
          autoCloseDays: effectiveAutoCloseDays,
        },
      });
      await mutate();
      toast("Retention policy saved", "success");
    } catch {
      toast("Failed to save retention policy", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSweep = async () => {
    setSweeping(true);
    setSweepResult(null);
    try {
      const res = await runRetentionSweepApi(productId);
      setSweepResult(res.data);
      toast(
        res.data.casesDeleted > 0
          ? `Sweep complete — ${res.data.casesDeleted} case(s) deleted`
          : "Sweep complete — no expired cases found",
        "success",
      );
    } catch {
      toast("Retention sweep failed", "error");
    } finally {
      setSweeping(false);
    }
  };

  return (
    <SectionCard
      title="Data Retention"
      description="Configure retention windows and run a sweep to delete closed cases past their retention period. Required for GDPR Article 5(1)(e) and Article 17."
    >
      <div className="space-y-6">
        {/* Config */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Retention period (days)
            </label>
            <input
              type="number"
              min={30}
              max={3650}
              value={retentionDays !== "" ? retentionDays : (retention?.retentionDays ?? 365)}
              onChange={(e) => setRetentionDays(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-zinc-400 mt-1">Closed cases older than this are eligible for deletion (min 30, max 3650).</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Auto-close after resolved (days)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={autoCloseDays !== "" ? autoCloseDays : (retention?.autoCloseDays ?? 7)}
              onChange={(e) => setAutoCloseDays(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            <p className="text-xs text-zinc-400 mt-1">Days of inactivity after resolved before auto-close triggers.</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Policy"}
        </button>

        {/* Sweep */}
        <div className="border-t border-zinc-100 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-zinc-800">Run Retention Sweep</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Deletes all closed cases older than {effectiveRetentionDays} days, including linked signals, conversations, notifications, and change requests. Audit events are anonymised (structure preserved, PII removed).
              </p>
            </div>
            <button
              onClick={handleSweep}
              disabled={sweeping}
              className="ml-6 shrink-0 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {sweeping ? "Running…" : "Run Sweep"}
            </button>
          </div>

          {sweepResult && (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 space-y-2">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-zinc-600">Found: <strong>{sweepResult.casesFound}</strong></span>
                <span className="text-zinc-600">Deleted: <strong className="text-green-700">{sweepResult.casesDeleted}</strong></span>
                {sweepResult.errors > 0 && (
                  <span className="text-red-600">Errors: <strong>{sweepResult.errors}</strong></span>
                )}
              </div>
              {sweepResult.details.length > 0 && (
                <details className="text-xs text-zinc-500 cursor-pointer">
                  <summary className="hover:text-zinc-700">Show details ({sweepResult.details.length} cases)</summary>
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {sweepResult.details.map((d) => (
                      <div key={d.caseId} className="font-mono">
                        {d.caseId}: {d.notificationsDeleted} notifs, {d.signalsDeleted} signals,{" "}
                        {d.conversationsDeleted} convs, {d.changeRequestsDeleted} CRs,{" "}
                        {d.auditEventsAnonymised} audit events anonymised
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const { user, token } = useAuth();
  const productIdFromContext = useProductIdWithFallback();
  const isAdmin = user?.roles.includes("admin") ?? false;

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-zinc-500">Admin access required.</p>
        </div>
      </AppLayout>
    );
  }

  const productId = productIdFromContext || user?.productIds?.[0];
  if (!productId) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-zinc-500">No product configured.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Compliance</h1>
          <p className="text-sm text-zinc-500 mt-1">GDPR data subject rights and retention controls. Admin only.</p>
        </div>

        <DsarSection productId={productId} token={token ?? ""} />
        <RetentionSection productId={productId} />
      </div>
    </AppLayout>
  );
}
