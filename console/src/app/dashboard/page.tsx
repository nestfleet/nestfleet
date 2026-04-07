"use client";

import Link from "next/link";
import useSWR from "swr";
import { AppLayout } from "@/components/AppLayout";
import { getDashboardApi, type DashboardActivity } from "@/lib/api";
import { useProductIdWithFallback } from "@/lib/product-context";
import { useProductSafe } from "@/lib/product-context";

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  href,
  color = "indigo",
}: {
  label: string;
  value: number | undefined;
  href?: string;
  color?: "indigo" | "amber" | "emerald" | "violet";
}) {
  const colorMap = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    amber:  "bg-amber-50  text-amber-700  ring-amber-200",
    emerald:"bg-emerald-50 text-emerald-700 ring-emerald-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  };

  const inner = (
    <div className={`rounded-xl p-5 ring-1 ${colorMap[color]} ${href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      {value === undefined ? (
        <div className="mt-1 h-8 w-16 animate-pulse rounded bg-current opacity-10" />
      ) : (
        <p className="mt-1 text-3xl font-bold">{value}</p>
      )}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

// ── Activity row ──────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  "case.created":        "Case created",
  "case.status_changed": "Case status changed",
  "case.triaged":        "Case triaged",
  "case.resolved":       "Case resolved",
  "case.reopened":       "Case reopened",
  "case.followup_sent":  "Follow-up email sent",
  "case.closed":         "Case closed",
  "case.chat_reply":     "Operator chat reply",
  "cr.created":          "Change request created",
  "cr.approved":         "Change request approved",
  "cr.rejected":         "Change request rejected",
  "cr.completed":        "Change request completed",
  "cr.analysis_started": "CR analysis started",
  "cr.approval_requested": "Approval requested",
  "cr.pr_drafted":       "Implementation pending",
  "signal.received":     "Signal received",
  "signal.linked":       "Signal linked to case",
};

function activityLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ActivityRow({ event }: { event: DashboardActivity }) {
  const label = activityLabel(event.action);
  const actor = event.actorType === "agent"
    ? `AI (${event.actorRef})`
    : event.actorRef;

  return (
    <li className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50">
        <span className="h-2 w-2 rounded-full bg-indigo-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
        <p className="text-xs text-gray-500 truncate">
          {event.entityType} · <span className="font-mono">{event.entityRef.slice(0, 12)}</span>
          {" · "}{actor}
        </p>
      </div>
      <span className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">{timeAgo(event.occurredAt)}</span>
    </li>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const productId = useProductIdWithFallback();
  const productCtx = useProductSafe();
  const basePath = productCtx ? `/p/${productCtx.product.slug}` : "";

  const { data, isLoading, error } = useSWR(
    productId ? `dashboard:${productId}` : null,
    () => getDashboardApi(productId!),
    { refreshInterval: 30_000 },
  );

  const loading = isLoading && !error;
  const kpis = data?.kpis;
  const activity = data?.recentActivity ?? [];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Live overview — refreshes every 30 s</p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="Open Cases"
            value={loading ? undefined : (kpis?.openCases ?? 0)}
            href={`${basePath}/cases`}
            color="indigo"
          />
          <KpiCard
            label="Change Approvals"
            value={loading ? undefined : (kpis?.pendingApprovals ?? 0)}
            href={`${basePath}/approvals`}
            color="amber"
          />
          <KpiCard
            label="Ready PR Drafts"
            value={loading ? undefined : (kpis?.readyPrDrafts ?? 0)}
            href={`${basePath}/pr-drafts`}
            color="emerald"
          />
          <KpiCard
            label="Unread Notifications"
            value={loading ? undefined : (kpis?.unreadNotifications ?? 0)}
            href={`${basePath}/notifications`}
            color="violet"
          />
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
          </div>

          {loading ? (
            <div className="space-y-3 px-5 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No activity yet.</p>
          ) : (
            <ul className="px-5 py-2">
              {activity.map((e) => (
                <ActivityRow key={e.id} event={e} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
