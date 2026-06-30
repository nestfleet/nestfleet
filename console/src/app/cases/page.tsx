// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { StatusDot, SeverityDot } from "@/components/Badge";
import { SearchInput } from "@/components/SearchInput";
import { getCasesApi, retryCaseApi } from "@/lib/api";
import { useProductIdWithFallback, useProductSafe } from "@/lib/product-context";
import { usePendingNotificationRefs } from "@/lib/usePendingNotificationRefs";
import type { CaseRow, CaseStatus, CaseSeverity } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns "hot" (< 2h), "warm" (< 24h), or null for older events */
function freshnessLevel(
  eventAt: string | null | undefined,
  createdAt: string,
): "hot" | "warm" | null {
  try {
    const t       = eventAt ? new Date(eventAt).getTime() : new Date(createdAt).getTime();
    const created = new Date(createdAt).getTime();
    if (t - created < 60_000) return null;
    const ageMs = Date.now() - t;
    if (ageMs < 2  * 60 * 60 * 1000) return "hot";
    if (ageMs < 24 * 60 * 60 * 1000) return "warm";
    return null;
  } catch {
    return null;
  }
}

/** Maps an audit event action string → short human label for the Last Event column */
function lastEventLabel(action: string | null | undefined): string {
  if (!action) return "Opened";
  switch (action) {
    case "case.created":        return "Opened";
    case "case.triaged":        return "Triaged";
    case "case.routed":         return "Routed";
    case "case.status_changed": return "Status changed";
    case "case.escalated":      return "Escalated";
    case "case.sent_to_change": return "Sent to change";
    case "case.auto_replied":   return "Auto-replied";
    case "case.reply_drafted":  return "Reply drafted";
    case "case.pr_drafted":     return "Implementation pending";
    case "case.resolved":       return "Resolved";
    case "case.reopened":       return "Reopened";
    case "case.followup_sent":  return "Follow-up sent";
    case "case.closed":         return "Closed";
    case "case.retried":        return "Retry dispatched";
    case "agent.triage_complete":      return "Triage complete";
    case "agent.change_prep_complete": return "Change prep done";
    case "agent.abstained":            return "Agent abstained";
    case "cr.analysis_started":   return "Analysis started";
    case "cr.approval_requested": return "Awaiting approval";
    case "cr.approved":           return "CR Approved";
    case "cr.rejected":           return "CR Rejected";
    case "cr.pr_drafted":         return "Implementation pending";
    case "cr.completed":            return "CR Completed";
    case "case.forwarded_to_team":  return "Forwarded to team";
    default:
      return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** Human-readable label for case type */
function typeLabel(type: string | null): string | null {
  switch (type) {
    case "user_request":  return "Request";
    case "bug_report":    return "Bug";
    case "outage_report": return "Outage";
    case "user_feedback": return "Feedback";
    case "sales_inquiry": return "Sales";
    default:              return type ?? null;
  }
}

/** Human-readable label for current persona */
function personaLabel(persona: string | null): string | null {
  switch (persona) {
    case "frontline": return "Frontline";
    case "steward":   return "Steward";
    case "change":    return "Change";
    default:          return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATUSES: CaseStatus[] = [
  "new", "enriching", "triaged", "in-resolution",
  "awaiting-lead", "in-change", "resolved", "closed",
  "processing-failed",
];

const ALL_SEVERITIES: CaseSeverity[] = ["critical", "high", "normal", "low"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CasesPage() {
  const router = useRouter();
  const productId = useProductIdWithFallback();
  const productCtx = useProductSafe();
  const basePath = productCtx ? `/p/${productCtx.product.slug}` : "";

  const [statusFilter, setStatusFilter]         = useState<string>(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem("nf:cases:statusFilter") ?? "") : ""
  );
  const [severityFilter, setSeverityFilter]     = useState<string>(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem("nf:cases:severityFilter") ?? "") : ""
  );
  const [pendingHandoffFilter, setPendingHandoffFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, error, isLoading, mutate } = useSWR(
    productId ? ["cases", productId, statusFilter, severityFilter] : null,
    () => getCasesApi(productId, {
      status:   statusFilter   || undefined,
      severity: severityFilter || undefined,
    }),
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );

  const pendingRefs = usePendingNotificationRefs(productId);

  const sorted: CaseRow[] = (data?.data ?? []).slice().sort((a, b) => {
    const tA = a.last_event_at ? new Date(a.last_event_at).getTime() : new Date(a.created_at).getTime();
    const tB = b.last_event_at ? new Date(b.last_event_at).getTime() : new Date(b.created_at).getTime();
    return tB - tA;
  });

  const pendingHandoffCount = sorted.filter(
    (c) => c.status === "in-resolution" && c.last_event_action === "case.forwarded_to_team",
  ).length;

  const cases: CaseRow[] = pendingHandoffFilter
    ? sorted.filter((c) => c.status === "in-resolution" && c.last_event_action === "case.forwarded_to_team")
    : sorted;

  const q = searchQuery.trim().toLowerCase();
  const visibleCases = q
    ? cases.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.case_id.toLowerCase().includes(q)
      )
    : cases;

  if (!productId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-50">
            <svg className="h-7 w-7 text-yellow-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-900">No product configured</h2>
          <p className="mt-1 text-sm text-gray-500">
            Set{" "}
            <code className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-mono">NEXT_PUBLIC_PRODUCT_ID</code>
            {" "}in your{" "}
            <code className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-mono">.env.local</code>
            {" "}to load cases.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-3">
        {/* Page header */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Cases</h1>
            <p className="text-sm text-gray-500">
              {isLoading
                ? "Loading…"
                : `${visibleCases.length} case${visibleCases.length !== 1 ? "s" : ""}${statusFilter || severityFilter || pendingHandoffFilter || searchQuery ? " (filtered)" : ""}`}
            </p>
          </div>

          {/* Quick-filter + popover row */}
          <div className="flex items-center gap-2">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search cases…"
            />
            {/* Pending Handoff quick-filter pill */}
            {(pendingHandoffCount > 0 || pendingHandoffFilter) && (
              <button
                onClick={() => setPendingHandoffFilter((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 ${
                  pendingHandoffFilter
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-50"
                }`}
                aria-pressed={pendingHandoffFilter}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
                </svg>
                Pending Handoff
                <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  pendingHandoffFilter ? "bg-amber-600 text-white" : "bg-amber-200 text-amber-800"
                }`}>
                  {pendingHandoffCount}
                </span>
              </button>
            )}

            {/* Filter button + popover */}
            <FilterPopover
              statusFilter={statusFilter}
              severityFilter={severityFilter}
              onStatusChange={(v) => { setStatusFilter(v); sessionStorage.setItem("nf:cases:statusFilter", v); }}
              onSeverityChange={(v) => { setSeverityFilter(v); sessionStorage.setItem("nf:cases:severityFilter", v); }}
              statuses={ALL_STATUSES}
              severities={ALL_SEVERITIES}
            />
          </div>
        </div>

        {/* Active filter chips */}
        {(statusFilter || severityFilter || pendingHandoffFilter) && (
          <div className="flex flex-wrap items-center gap-2">
            {pendingHandoffFilter && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                Pending Handoff
                <button onClick={() => setPendingHandoffFilter(false)} className="ml-0.5 hover:text-amber-900" aria-label="Remove pending handoff filter">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {statusFilter && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                {"Status: " + statusFilter.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                <button onClick={() => { setStatusFilter(""); sessionStorage.setItem("nf:cases:statusFilter", ""); }} className="ml-0.5 hover:text-indigo-900" aria-label="Remove status filter">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {severityFilter && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                {"Severity: " + severityFilter.charAt(0).toUpperCase() + severityFilter.slice(1)}
                <button onClick={() => { setSeverityFilter(""); sessionStorage.setItem("nf:cases:severityFilter", ""); }} className="ml-0.5 hover:text-indigo-900" aria-label="Remove severity filter">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            <button onClick={() => { setStatusFilter(""); setSeverityFilter(""); setPendingHandoffFilter(false); sessionStorage.setItem("nf:cases:statusFilter", ""); sessionStorage.setItem("nf:cases:severityFilter", ""); }} className="text-xs text-gray-400 hover:text-gray-600">
              Clear all
            </button>
          </div>
        )}

        {/* Table card */}
        <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 overflow-hidden">
          {isLoading && visibleCases.length === 0 ? (
            <div className="flex items-center justify-center py-14">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                <p className="text-sm text-gray-400">Loading cases…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
                <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">Failed to load cases</p>
              <p className="mt-1 text-xs text-gray-500">{(error as Error).message}</p>
            </div>
          ) : visibleCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">No cases found</p>
              <p className="mt-1 text-xs text-gray-500">
                {statusFilter || severityFilter || searchQuery ? "Try removing filters or clearing the search." : "No cases have been created yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Case
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Severity
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                      Last Event
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleCases.map((c) => (
                    <CaseTableRow
                      key={c.case_id}
                      caseItem={c}
                      hasPendingNotif={pendingRefs.has(c.case_id)}
                      productId={productId}
                      onClick={() => router.push(`${basePath}/cases/${c.case_id}`)}
                      onRetried={() => mutate()}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!isLoading && !error && visibleCases.length > 0 && (
          <p className="text-xs text-gray-400 text-right">Auto-refreshes every 30s</p>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface CaseTableRowProps {
  caseItem:          CaseRow;
  hasPendingNotif:   boolean;
  productId:         string;
  onClick:           () => void;
  onRetried:         () => void;
}

function CaseTableRow({ caseItem, hasPendingNotif, productId, onClick, onRetried }: CaseTableRowProps) {
  const lastEventAtRaw = caseItem.last_event_at ?? caseItem.updated_at;

  const lastEventAtStr = (() => {
    try { return formatDistanceToNow(new Date(lastEventAtRaw), { addSuffix: true }); }
    catch { return lastEventAtRaw; }
  })();

  const freshness = freshnessLevel(lastEventAtRaw, caseItem.created_at);

  // Short ID: first 16 chars of the raw id (e.g. "case_01kkyb7ksb…")
  const shortId = caseItem.case_id.length > 17
    ? caseItem.case_id.slice(0, 16) + "…"
    : caseItem.case_id;

  const type    = typeLabel(caseItem.type);
  const persona = personaLabel(caseItem.current_persona);

  // Build subtitle tokens: ID · type · persona (plain text, no colored backgrounds)
  const subtitleTokens = [
    shortId,
    type,
    persona,
  ].filter(Boolean);

  const isFailed = caseItem.status === "processing-failed";
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    setRetrying(true);
    setRetryError(null);
    try {
      await retryCaseApi(productId, caseItem.case_id);
      onRetried();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Failed to retry");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer hover:bg-gray-50/80 transition-colors ${freshness === "hot" ? "bg-amber-50/20" : ""} ${isFailed ? "bg-red-50/30" : ""}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      role="button"
      aria-label={`View case: ${caseItem.title}`}
    >
      {/* Case cell: title + subtitle */}
      <td className="px-4 py-3 max-w-sm">
        {/* Title line */}
        <div className="flex items-center gap-2 min-w-0">
          {hasPendingNotif && (
            <span className="group relative shrink-0 flex items-center" aria-label="Pending notification">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 whitespace-nowrap rounded-md bg-gray-600/95 px-2 py-1 text-[10px] text-white shadow-xs opacity-0 group-hover:opacity-100 transition-opacity z-10">
                Unacknowledged notification — action may be needed
              </span>
            </span>
          )}
          {freshness === "hot" && (
            <span className="group relative shrink-0 flex items-center" aria-label="Active in the last 2 hours">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" aria-hidden="true" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
              </span>
              <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 whitespace-nowrap rounded-md bg-gray-600/95 px-2 py-1 text-[10px] text-white shadow-xs opacity-0 group-hover:opacity-100 transition-opacity z-10">
                Last activity &lt; 2 hours ago
              </span>
            </span>
          )}
          {freshness === "warm" && (
            <span className="group relative shrink-0 flex items-center" aria-label="Active in the last 24 hours">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 whitespace-nowrap rounded-md bg-gray-600/95 px-2 py-1 text-[10px] text-white shadow-xs opacity-0 group-hover:opacity-100 transition-opacity z-10">
                Last activity &lt; 24 hours ago
              </span>
            </span>
          )}
          <span className="truncate text-sm font-medium text-gray-900">{caseItem.title}</span>
          {caseItem.ai_resolved && (
            <span
              className="group relative inline-flex items-center shrink-0"
              title="Resolved automatically by AI — no human intervention"
            >
              <svg className="h-3 w-3 text-violet-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l2.09 6.26L20.18 9.27l-4.64 4.53L16.54 20 12 16.77 7.46 20l1-6.2L3.82 9.27l6.09-1.01L12 2z" />
              </svg>
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
                AI-resolved
              </span>
            </span>
          )}
        </div>

        {/* Subtitle: ID · type · persona — all plain text, no backgrounds */}
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
          {subtitleTokens.map((token, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-200">·</span>}
              <span className={i === 0 ? "font-mono" : ""}>{token}</span>
            </span>
          ))}
        </div>

        {/* QE-05: Retry button for failed cases */}
        {isFailed && (
          <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors focus:outline-hidden focus:ring-1 focus:ring-red-400"
              aria-label="Retry processing"
            >
              {retrying ? (
                <>
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Retrying…
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Retry
                </>
              )}
            </button>
            {retryError && (
              <span className="text-[10px] text-red-600">{retryError}</span>
            )}
          </div>
        )}
      </td>

      {/* Status — dot + text */}
      <td className="px-3 py-3">
        <StatusDot status={caseItem.status} />
      </td>

      {/* Severity — colored square + text */}
      <td className="px-3 py-3">
        <SeverityDot severity={caseItem.severity} />
      </td>

      {/* Last Event */}
      <td className="px-3 py-2 hidden sm:table-cell whitespace-nowrap">
        <p className={`text-xs font-medium ${
          freshness === "hot"  ? "text-amber-700" :
          freshness === "warm" ? "text-gray-700"  : "text-gray-400"
        }`}>
          {lastEventLabel(caseItem.last_event_action)}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{lastEventAtStr}</p>
      </td>
    </tr>
  );
}

// ─── Filter Popover ───────────────────────────────────────────────────────────

interface FilterPopoverProps {
  statusFilter:    string;
  severityFilter:  string;
  onStatusChange:  (v: string) => void;
  onSeverityChange:(v: string) => void;
  statuses:        CaseStatus[];
  severities:      CaseSeverity[];
}

function FilterPopover({ statusFilter, severityFilter, onStatusChange, onSeverityChange, statuses, severities }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const activeCount = (statusFilter ? 1 : 0) + (severityFilter ? 1 : 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
          activeCount > 0
            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
        </svg>
        Filter
        {activeCount > 0 && (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5">
          <div className="p-3 space-y-4">
            {/* Status */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Status</p>
              <div className="space-y-0.5">
                {[{ label: "All statuses", value: "" }, ...statuses.map((s) => ({
                  label: s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
                  value: s,
                }))].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { onStatusChange(opt.value); }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      statusFilter === opt.value
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {statusFilter === opt.value && (
                      <svg className="h-3.5 w-3.5 shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                    <span className={statusFilter === opt.value ? "" : "ml-5"}>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Severity</p>
              <div className="space-y-0.5">
                {[{ label: "All severities", value: "" }, ...severities.map((s) => ({
                  label: s.charAt(0).toUpperCase() + s.slice(1),
                  value: s,
                }))].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { onSeverityChange(opt.value); }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      severityFilter === opt.value
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {severityFilter === opt.value && (
                      <svg className="h-3.5 w-3.5 shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                    <span className={severityFilter === opt.value ? "" : "ml-5"}>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
