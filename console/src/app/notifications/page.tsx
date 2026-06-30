// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * Notifications page — UX principles:
 *
 *  TWO CLOCKS: A notification has two separate timestamps that mean very
 *  different things. Conflating them causes confusion.
 *    - created_at  = when the *event happened* (e.g. CR completed 45m ago)
 *    - scheduled_for = when the *email will send* (e.g. next digest in 5h)
 *  We always show "event time" (created_at) as the primary time, and
 *  delivery info as a secondary, clearly-labelled hint.
 *
 *  GROUP BY: any attribute, not just source_ref.
 */

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { formatDistanceToNow, format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/Badge";
import { SearchInput } from "@/components/SearchInput";
import { getNotificationsApi, ackNotificationApi } from "@/lib/api";
import { useProductIdWithFallback } from "@/lib/product-context";
import { useNotificationBadge } from "@/lib/useNotificationBadge";
import type { Notification } from "@/lib/types";


// ─── Source-type filter pills ─────────────────────────────────────────────────

type SourceTypeFilter = "" | "case" | "change_request" | "product";

const SOURCE_TYPE_PILLS: { value: SourceTypeFilter; label: string }[] = [
  { value: "",                label: "All"              },
  { value: "case",            label: "Cases"            },
  { value: "change_request",  label: "Change Requests"  },
  { value: "product",         label: "Products"         },
];

// ─── Group-by options ─────────────────────────────────────────────────────────

type GroupByKey = "entity" | "kind" | "status" | "priority" | "audience_type" | "none";

interface GroupByOption {
  key:   GroupByKey;
  label: string;
}

const GROUP_BY_OPTIONS: GroupByOption[] = [
  { key: "none",          label: "No grouping"   },
  { key: "entity",        label: "By entity"     },
  { key: "kind",          label: "By type"       },
  { key: "status",        label: "By status"     },
  { key: "priority",      label: "By priority"   },
  { key: "audience_type", label: "By audience"   },
];

// ─── Grouping logic ───────────────────────────────────────────────────────────

function extractGroupKey(n: Notification, by: GroupByKey): string {
  switch (by) {
    case "entity":
      return n.source_ref ? `${n.source_type}|${n.source_ref}` : `${n.source_type}|__unknown__`;
    case "kind":          return n.kind;
    case "status":        return n.status;
    case "priority":      return n.priority;
    case "audience_type": return n.audience_type;
    default:              return "__all__";
  }
}

function entityTypePrefix(sourceType: string): string {
  switch (sourceType) {
    case "case":            return "Case";
    case "change_request":  return "CR";
    case "product":         return "Product";
    default:                return sourceType;
  }
}

function groupLabel(key: string, by: GroupByKey, n: Notification): string {
  if (key === "__all__") return "All notifications";
  switch (by) {
    case "entity": {
      const [sourceType, sourceRef] = key.split("|") as [string, string];
      const prefix = entityTypePrefix(sourceType);
      const shortRef = sourceRef === "__unknown__" ? "unknown" : sourceRef.slice(0, 14) + "…";
      return `${prefix} · ${shortRef}`;
    }
    case "kind":          return n.kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    case "status":        return key.charAt(0).toUpperCase() + key.slice(1);
    case "priority":      return key.charAt(0).toUpperCase() + key.slice(1) + " priority";
    case "audience_type": return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    default:              return key;
  }
}

/** Priority order for sorting groups */
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const STATUS_ORDER:   Record<string, number> = { failed: 0, pending: 1, sent: 2, suppressed: 3 };

function groupSortKey(key: string, by: GroupByKey): number | string {
  if (by === "priority") return PRIORITY_ORDER[key] ?? 99;
  if (by === "status")   return STATUS_ORDER[key] ?? 99;
  return key;
}

function applyGroupBy(
  notifications: Notification[],
  by: GroupByKey,
): { key: string; label: string; items: Notification[] }[] {
  const map = new Map<string, Notification[]>();

  for (const n of notifications) {
    const k = extractGroupKey(n, by);
    const existing = map.get(k) ?? [];
    existing.push(n);
    map.set(k, existing);
  }

  // Sort items within each group by created_at desc (event time)
  for (const items of map.values()) {
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const entries = [...map.entries()].map(([k, items]) => ({
    key:   k,
    label: groupLabel(k, by, items[0]!),
    items,
    sortKey: groupSortKey(k, by),
    latestEvent: Math.max(...items.map((n) => new Date(n.created_at).getTime())),
  }));

  // Sort groups: by defined order for priority/status, otherwise by most recent event
  entries.sort((a, b) => {
    if (typeof a.sortKey === "number" && typeof b.sortKey === "number") {
      return a.sortKey - b.sortKey;
    }
    return b.latestEvent - a.latestEvent;
  });

  // Keep __other__ last
  const otherIdx = entries.findIndex((e) => e.key === "__other__");
  if (otherIdx > 0) {
    const [other] = entries.splice(otherIdx, 1);
    entries.push(other!);
  }

  return entries;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

type PriorityVariant = "red" | "yellow" | "blue" | "gray";
type StatusVariant   = "green" | "yellow" | "red" | "gray";

function priorityVariant(priority: Notification["priority"]): PriorityVariant {
  if (priority === "critical") return "red";
  if (priority === "high")     return "yellow";
  if (priority === "normal")   return "blue";
  return "gray";
}

function statusVariant(status: Notification["status"]): StatusVariant {
  if (status === "sent")       return "green";
  if (status === "pending")    return "yellow";
  if (status === "failed")     return "red";
  return "gray";
}

function formatKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(str: string | null, max: number): string {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function recipientAlias(ref: string): string {
  const atIdx = ref.indexOf("@");
  return atIdx > 0 ? ref.slice(0, atIdx) : ref;
}

/**
 * eventTime: the primary "when did this happen" time — always created_at.
 * This is what users care about: "when was I notified about X?"
 */
function eventTime(n: Notification): string {
  try { return formatDistanceToNow(new Date(n.created_at), { addSuffix: true }); }
  catch { return n.created_at; }
}

/**
 * deliveryHint: a secondary label showing when the email sends/sent.
 * Only meaningful when it differs from eventTime.
 * Returns null for "sent" (redundant) or when times are close.
 */
function deliveryHint(n: Notification): string | null {
  if (n.status === "sent" && n.sent_at) {
    // Only show sent-at if it differs meaningfully from created_at
    const sentMs    = new Date(n.sent_at).getTime();
    const createdMs = new Date(n.created_at).getTime();
    if (Math.abs(sentMs - createdMs) < 5 * 60 * 1000) return null; // same window
    try {
      return `sent ${formatDistanceToNow(new Date(n.sent_at), { addSuffix: true })}`;
    } catch { return null; }
  }
  if (n.status === "pending") {
    try {
      const scheduled = new Date(n.scheduled_for);
      const now = new Date();
      if (scheduled <= now) return "email due now";
      return `email ${formatDistanceToNow(scheduled, { addSuffix: true })}`;
    } catch { return null; }
  }
  if (n.status === "failed") {
    return n.error_message ? `failed: ${n.error_message}` : "delivery failed";
  }
  return null;
}

function countSummary(notifications: Notification[]): string {
  const counts: Record<string, number> = {};
  for (const n of notifications) {
    counts[n.status] = (counts[n.status] ?? 0) + 1;
  }
  const parts: string[] = [];
  if (counts.sent)       parts.push(`${counts.sent} sent`);
  if (counts.pending)    parts.push(`${counts.pending} queued`);
  if (counts.failed)     parts.push(`${counts.failed} failed`);
  if (counts.suppressed) parts.push(`${counts.suppressed} suppressed`);
  return parts.length > 0 ? parts.join(" · ") : "No notifications";
}

function isNewNotification(n: Notification, lastSeenAt: Date | null): boolean {
  if (lastSeenAt === null) return false;
  return new Date(n.created_at).getTime() > lastSeenAt.getTime();
}

// ─── Group-by Popover ─────────────────────────────────────────────────────────

function GroupByPopover({ groupBy, onChange }: { groupBy: GroupByKey; onChange: (v: GroupByKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const currentLabel = GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label ?? "Group by";
  const isNonDefault = groupBy !== "entity";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
          isNonDefault
            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
        {currentLabel}
        <svg className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-48 rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5">
          <div className="p-2 space-y-0.5">
            {GROUP_BY_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => { onChange(o.key); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  groupBy === o.key
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {groupBy === o.key ? (
                  <svg className="h-3.5 w-3.5 shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" />
                )}
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Status/Priority Filter Popover ───────────────────────────────────────────

function NotifFilterPopover({
  statusFilter,
  priorityFilter,
  onStatusChange,
  onPriorityChange,
}: {
  statusFilter:    string;
  priorityFilter:  string;
  onStatusChange:  (v: string) => void;
  onPriorityChange:(v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const activeCount = (statusFilter ? 1 : 0) + (priorityFilter ? 1 : 0);

  const statusOptions = [
    { label: "All statuses", value: "" },
    { label: "Queued",       value: "pending" },
    { label: "Sent",         value: "sent" },
    { label: "Failed",       value: "failed" },
    { label: "Suppressed",   value: "suppressed" },
    { label: "Acknowledged", value: "acked" },
  ];

  const priorityOptions = [
    { label: "All priorities", value: "" },
    { label: "Critical",       value: "critical" },
    { label: "High",           value: "high" },
    { label: "Normal",         value: "normal" },
    { label: "Low",            value: "low" },
  ];

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
        <div className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5">
          <div className="p-3 space-y-4">
            {/* Status */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Status</p>
              <div className="space-y-0.5">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onStatusChange(opt.value)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      statusFilter === opt.value
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {statusFilter === opt.value ? (
                      <svg className="h-3.5 w-3.5 shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Priority</p>
              <div className="space-y-0.5">
                {priorityOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onPriorityChange(opt.value)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      priorityFilter === opt.value
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {priorityFilter === opt.value ? (
                      <svg className="h-3.5 w-3.5 shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {opt.label}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const productId = useProductIdWithFallback();
  const [statusFilter,     setStatusFilter]     = useState<string>("");
  const [priorityFilter,   setPriorityFilter]   = useState<string>("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceTypeFilter>("");
  const [groupBy,          setGroupBy]          = useState<GroupByKey>("entity");
  const [searchQuery,      setSearchQuery]      = useState("");

  const { lastSeenAt, markSeen } = useNotificationBadge();

  useEffect(() => {
    // Mark all current notifications as seen when this page is opened
    markSeen();
  }, [markSeen]);

  const swrKey = productId
    ? ["notifications", productId, statusFilter, priorityFilter]
    : null;

  const { data, error, isLoading } = useSWR(
    swrKey,
    () => getNotificationsApi(productId, {
      status:   statusFilter   || undefined,
      priority: priorityFilter || undefined,
    }),
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  const allNotifications: Notification[] = data?.data ?? [];
  const sourceFiltered = sourceTypeFilter
    ? allNotifications.filter((n) => n.source_type === sourceTypeFilter)
    : allNotifications;

  const nq = searchQuery.trim().toLowerCase();
  const notifications = nq
    ? sourceFiltered.filter((n) =>
        (n.subject ?? "").toLowerCase().includes(nq) ||
        n.kind.toLowerCase().includes(nq) ||
        n.source_ref.toLowerCase().includes(nq) ||
        n.recipient_ref.toLowerCase().includes(nq)
      )
    : sourceFiltered;

  if (!productId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm font-medium text-gray-900">No product configured</p>
          <p className="mt-1 text-xs text-gray-500">Set <code className="rounded-sm bg-gray-100 px-1.5 py-0.5">NEXT_PUBLIC_PRODUCT_ID</code> in <code className="rounded-sm bg-gray-100 px-1.5 py-0.5">.env.local</code>.</p>
        </div>
      </AppLayout>
    );
  }

  const groups = groupBy !== "none" ? applyGroupBy(notifications, groupBy) : [];

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Page header */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">
            {isLoading ? "Loading…" : countSummary(notifications)}
          </p>
        </div>

        {/* Source-type filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {SOURCE_TYPE_PILLS.map((pill) => (
            <button
              key={pill.value}
              onClick={() => setSourceTypeFilter(pill.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                sourceTypeFilter === pill.value
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {pill.label}
              {pill.value !== "" && (
                <span className={`ml-1.5 tabular-nums ${sourceTypeFilter === pill.value ? "text-indigo-200" : "text-gray-400"}`}>
                  {allNotifications.filter((n) => n.source_type === pill.value).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter + Group bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search notifications…" />
          <GroupByPopover groupBy={groupBy} onChange={setGroupBy} />
          <NotifFilterPopover
            statusFilter={statusFilter}
            priorityFilter={priorityFilter}
            onStatusChange={setStatusFilter}
            onPriorityChange={setPriorityFilter}
          />

          {/* Active filter chips */}
          {(statusFilter || priorityFilter) && (
            <div className="flex flex-wrap gap-1.5">
              {statusFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {statusFilter === "pending" ? "Queued" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                  <button onClick={() => setStatusFilter("")} className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-100 focus:outline-hidden" aria-label="Remove status filter">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 8 8" fill="currentColor"><path d="M6.5 1.5l-5 5M1.5 1.5l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </span>
              )}
              {priorityFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {priorityFilter.charAt(0).toUpperCase() + priorityFilter.slice(1)} priority
                  <button onClick={() => setPriorityFilter("")} className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-100 focus:outline-hidden" aria-label="Remove priority filter">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 8 8" fill="currentColor"><path d="M6.5 1.5l-5 5M1.5 1.5l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-16 rounded-xl bg-white shadow-xs ring-1 ring-black/5">
            <div className="flex flex-col items-center gap-3">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="text-sm text-gray-400">Loading notifications…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4 rounded-xl bg-white shadow-xs ring-1 ring-black/5">
            <p className="text-sm font-medium text-gray-900">Failed to load notifications</p>
            <p className="mt-1 text-xs text-gray-500">{(error as Error).message}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl bg-white shadow-xs ring-1 ring-black/5">
            <p className="text-sm font-medium text-gray-900">No notifications</p>
            <p className="mt-1 text-xs text-gray-500">
              {statusFilter || priorityFilter || searchQuery ? "Try removing filters or clearing the search." : "Notifications will appear here as events occur."}
            </p>
          </div>
        ) : groupBy === "none" ? (
          /* ── Flat view ── */
          <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 overflow-hidden divide-y divide-gray-50">
            {notifications
              .slice()
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((n) => (
                <NotificationCardRow
                  key={n.notification_id}
                  notification={n}
                  isNew={isNewNotification(n, lastSeenAt)}
                />
              ))}
          </div>
        ) : (
          /* ── Grouped view ── */
          <div className="space-y-3">
            {groups.map((group) => (
              <NotificationGroup
                key={group.key}
                group={group}
                lastSeenAt={lastSeenAt}
                groupBy={groupBy}
              />
            ))}
          </div>
        )}

        {!isLoading && !error && notifications.length > 0 && (
          <p className="text-xs text-gray-400 text-right">Auto-refreshes every 30s</p>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function NotificationGroup({
  group,
  lastSeenAt,
  groupBy,
}: {
  group: { key: string; label: string; items: Notification[] };
  lastSeenAt: Date | null;
  groupBy: GroupByKey;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const counts = { sent: 0, pending: 0, failed: 0, suppressed: 0 };
  for (const n of group.items) {
    if (n.status in counts) counts[n.status as keyof typeof counts]++;
  }
  const newCount = group.items.filter((n) => isNewNotification(n, lastSeenAt)).length;

  // Most recent event in this group
  const latestEvent = group.items.reduce<Notification | null>((best, n) =>
    best === null || new Date(n.created_at) > new Date(best.created_at) ? n : best, null
  );
  const latestEventTime = latestEvent
    ? formatDistanceToNow(new Date(latestEvent.created_at), { addSuffix: true })
    : null;

  return (
    <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-indigo-500"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-900 truncate">{group.label}</span>
            {latestEventTime && (
              <span className="text-xs text-gray-400 shrink-0">· {latestEventTime}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {newCount > 0 && (
            <span className="relative inline-flex items-center rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              {newCount} new
            </span>
          )}
          {counts.failed > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
              {counts.failed} failed
            </span>
          )}
          {counts.pending > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700 ring-1 ring-inset ring-yellow-200">
              {counts.pending} queued
            </span>
          )}
          {counts.sent > 0 && (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
              {counts.sent} sent
            </span>
          )}
          <span className="text-xs text-gray-400 tabular-nums">{group.items.length}</span>
        </div>
      </button>

      {/* Group rows */}
      {!collapsed && (
        <div className="divide-y divide-gray-50 border-t border-gray-100">
          {group.items.map((n) => (
            <NotificationCardRow
              key={n.notification_id}
              notification={n}
              isNew={isNewNotification(n, lastSeenAt)}
              hideGroupField={groupBy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Notification card row ────────────────────────────────────────────────────

/**
 * A notification row with two-clock clarity:
 *   PRIMARY time  = created_at  — "when the event happened"
 *   SECONDARY hint = delivery status — "when email sends/sent"
 */
function NotificationCardRow({
  notification: n,
  isNew,
  hideGroupField,
}: {
  notification: Notification;
  isNew: boolean;
  hideGroupField?: GroupByKey;
}) {
  const productId = useProductIdWithFallback();
  const [expanded, setExpanded]   = useState(false);
  const [acking,   setAcking]     = useState(false);
  const [ackedAt,  setAckedAt]    = useState<string | null>(n.acked_at ?? null);

  const handleAck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (acking || ackedAt) return;
    setAcking(true);
    try {
      const res = await ackNotificationApi(productId, n.notification_id);
      setAckedAt(res.data.acked_at);
    } catch {
      // silently ignore — user can retry
    } finally {
      setAcking(false);
    }
  };

  const hint = deliveryHint(n);
  const happened = eventTime(n);

  // When email sends, as a human-readable time-of-day (for pending)
  const scheduledForClock = (() => {
    if (n.status !== "pending") return null;
    try { return format(new Date(n.scheduled_for), "HH:mm"); }
    catch { return null; }
  })();

  return (
    <div className={isNew ? "bg-indigo-50/25" : ""}>
      <div
        className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/40 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v); }}
        aria-expanded={expanded}
      >
        {/* New indicator dot */}
        <div className="shrink-0 flex items-center pt-2">
          {isNew ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" aria-hidden="true" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
            </span>
          ) : (
            <span className="h-2 w-2" aria-hidden="true" />
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          <Badge variant={priorityVariant(n.priority)}>
            {n.priority.charAt(0).toUpperCase()}
          </Badge>
          <Badge variant={statusVariant(n.status)}>
            {n.status === "pending" ? "Queued" : n.status === "acked" ? "Acked" : n.status.charAt(0).toUpperCase() + n.status.slice(1)}
          </Badge>
          {n.escalation_level > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
              Escalated ×{n.escalation_level}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Row 1: kind + recipient (suppress the grouped field if redundant) */}
          <div className="flex items-baseline gap-1.5 flex-wrap">
            {hideGroupField !== "kind" && (
              <span className={`text-xs font-semibold ${isNew ? "text-indigo-700" : "text-gray-800"}`}>
                {formatKind(n.kind)}
              </span>
            )}
            {hideGroupField !== "audience_type" && (
              <span className="text-xs text-gray-400">→ {recipientAlias(n.recipient_ref)}</span>
            )}
          </div>

          {/* Row 2: subject */}
          {n.subject && (
            <p className="text-xs text-gray-600 truncate mt-0.5" title={n.subject}>
              {n.subject}
            </p>
          )}

          {/* Row 3: delivery hint — clearly separate from event time */}
          {hint && (
            <p className={`text-[10px] mt-0.5 ${
              n.status === "failed"  ? "text-red-500" :
              n.status === "pending" ? "text-amber-600" : "text-gray-400"
            }`}>
              {n.status === "pending" ? `📬 ${hint}${scheduledForClock ? ` (${scheduledForClock} UTC)` : ""}` : hint}
            </p>
          )}
        </div>

        {/* Primary time: when the event happened */}
        <div className="shrink-0 text-right pt-0.5">
          <p className="text-xs text-gray-500 whitespace-nowrap">{happened}</p>
        </div>

        {/* Ack button — only for ack-required, unacked notifications */}
        {n.ack_required && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {ackedAt ? (
              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                Acked {formatDistanceToNow(new Date(ackedAt), { addSuffix: true })}
              </span>
            ) : (
              <button
                onClick={handleAck}
                disabled={acking}
                className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-100 disabled:opacity-50 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              >
                {acking ? "…" : "Acknowledge"}
              </button>
            )}
          </div>
        )}

        {/* Expand chevron */}
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-gray-300 transition-transform mt-0.5 ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-1.5 bg-gray-50/50 border-t border-gray-100 space-y-2.5">
          {n.body && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Message</p>
              <pre className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed font-sans bg-white rounded-lg p-2.5 ring-1 ring-black/5">
                {n.body}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Event time</p>
              <p className="text-gray-700">{happened}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                {n.status === "sent" ? "Sent at" : "Scheduled for"}
              </p>
              <p className={n.status === "pending" ? "text-amber-700" : "text-gray-700"}>
                {n.status === "sent" && n.sent_at
                  ? formatDistanceToNow(new Date(n.sent_at), { addSuffix: true })
                  : (() => { try { return format(new Date(n.scheduled_for), "dd MMM HH:mm 'UTC'"); } catch { return n.scheduled_for; } })()}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Audience</p>
              <p className="text-gray-700">{n.audience_type.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Source</p>
              <p className="text-gray-700 font-mono text-[10px]">{n.source_type} · {n.source_ref?.slice(0, 16)}…</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Priority</p>
              <p className="text-gray-700 capitalize">{n.priority}</p>
            </div>
            {n.status === "pending" && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Why queued?</p>
                <p className="text-amber-700 text-xs">
                  Normal/low priority notifications are batched into digest windows (09:00 &amp; 14:00 UTC) to avoid noise.
                  This event happened {happened} and the email will deliver{" "}
                  {(() => { try { return formatDistanceToNow(new Date(n.scheduled_for), { addSuffix: true }); } catch { return "soon"; } })()}.
                </p>
              </div>
            )}
            {n.error_message && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Error</p>
                <p className="text-red-600 text-xs">{n.error_message}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
