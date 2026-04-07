"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { RiskDot, Badge } from "@/components/Badge";
import { getPrDraftedChangeRequestsApi } from "@/lib/api";
import { useProductIdWithFallback, useProductSafe } from "@/lib/product-context";
import { usePendingNotificationRefs } from "@/lib/usePendingNotificationRefs";
import type { ChangeRequest } from "@/lib/types";


function shortId(id: string) {
  return id.slice(0, 14) + "…";
}

function stageVariant(status: ChangeRequest["status"]): "green" | "blue" | "gray" {
  if (status === "pr-drafted")          return "green";
  if (status === "implementation-prep") return "blue";
  return "gray";
}

function stageLabel(status: ChangeRequest["status"]): string {
  if (status === "pr-drafted")          return "PR Ready";
  if (status === "implementation-prep") return "Preparing";
  return status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ageText(dateStr: string): string {
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true }); }
  catch { return dateStr; }
}

export default function PrDraftsPage() {
  const productId = useProductIdWithFallback();
  const router = useRouter();
  const productCtx = useProductSafe();
  const basePath = productCtx ? `/p/${productCtx.product.slug}` : "";

  const { data, error, isLoading } = useSWR(
    productId ? ["pr-drafted", productId] : null,
    () => getPrDraftedChangeRequestsApi(productId),
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  const changeRequests: ChangeRequest[] = data?.data ?? [];
  const ready  = changeRequests.filter((cr) => cr.status === "pr-drafted");
  const inPrep = changeRequests.filter((cr) => cr.status === "implementation-prep");
  const pendingRefs = usePendingNotificationRefs(productId);

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
            Set <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">NEXT_PUBLIC_PRODUCT_ID</code> in your{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">.env.local</code>.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">PR Drafts</h1>
            <p className="text-sm text-gray-500">
              {isLoading
                ? "Loading…"
                : `${ready.length} ready for review${inPrep.length > 0 ? `, ${inPrep.length} preparing` : ""}`}
            </p>
          </div>
          {!isLoading && ready.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {ready.length} ready for review
            </span>
          )}
        </div>

        {/* Workflow hint — shown only when ready PRs exist */}
        {!isLoading && ready.length > 0 && (
          <div className="rounded-xl bg-indigo-50 ring-1 ring-indigo-200 px-5 py-3.5 flex items-start gap-3">
            <svg className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-indigo-700 leading-relaxed">
              <span className="font-semibold">How PR Drafts work:</span>{" "}
              NestFleet generated a starting-point PR for each item below.{" "}
              Click <span className="font-medium">Review</span> → open the PR in GitHub → edit the code there → return and click <span className="font-medium">Accept &amp; Complete</span>.{" "}
              GitHub is your editor — NestFleet just handles the loop.
            </p>
          </div>
        )}

        {/* Table card */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
          {isLoading && changeRequests.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                <p className="text-sm text-gray-400">Loading PR drafts…</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">Failed to load PR drafts</p>
              <p className="mt-1 text-xs text-gray-500">{(error as Error).message}</p>
            </div>
          ) : changeRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
                <svg className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">No PR drafts</p>
              <p className="mt-1 text-xs text-gray-500">Approved change requests will appear here once the agent prepares them.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Change Request</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Stage</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">GitHub PR</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Age</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {changeRequests.map((cr) => (
                    <PrDraftRow
                      key={cr.change_request_id}
                      cr={cr}
                      hasPendingNotif={pendingRefs.has(cr.change_request_id)}
                      onView={() => router.push(`${basePath}/pr-drafts/${cr.change_request_id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!isLoading && !error && changeRequests.length > 0 && (
          <p className="text-xs text-gray-400 text-right">Auto-refreshes every 30s</p>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Row sub-component ────────────────────────────────────────────────────────

function PrDraftRow({ cr, hasPendingNotif, onView }: { cr: ChangeRequest; hasPendingNotif: boolean; onView: () => void }) {
  const isPreparing = cr.status === "implementation-prep";

  return (
    <tr className={`transition-colors ${isPreparing ? "hover:bg-gray-50/80" : "hover:bg-green-50/30"}`}>
      {/* Change Request cell — title + subtitle */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {hasPendingNotif && (
            <span
              className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400"
              title="Has pending or unacknowledged notification"
              aria-label="Pending notification"
            />
          )}
          <button
            onClick={isPreparing ? undefined : onView}
            className="font-medium text-gray-900 hover:text-indigo-600 transition-colors text-left truncate block max-w-xs focus:outline-none focus:underline"
          >
            {cr.title}
          </button>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500 flex-wrap">
          <code className="font-mono">{shortId(cr.change_request_id)}</code>
          <span className="text-gray-300">·</span>
          <Link
            href={`/cases/${cr.case_id}`}
            className="text-indigo-500 hover:underline font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {shortId(cr.case_id)}
          </Link>
          <span className="text-gray-300">·</span>
          <RiskDot riskLevel={cr.risk_level} />
        </div>
      </td>

      {/* Stage */}
      <td className="px-3 py-2 hidden sm:table-cell">
        <div className="flex flex-wrap items-center gap-1.5">
          {isPreparing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-400" aria-hidden="true" />
              Preparing
            </span>
          ) : (
            <Badge variant={stageVariant(cr.status)}>{stageLabel(cr.status)}</Badge>
          )}
          {cr.ci_details?.["pr_human_edited"] === true && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              PR changed
            </span>
          )}
        </div>
      </td>

      {/* GitHub PR — always visible */}
      <td className="px-3 py-2 whitespace-nowrap">
        {cr.github_pr_url ? (
          <a
            href={cr.github_pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs focus:outline-none focus:underline"
          >
            #{cr.github_pr_number}
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        ) : (
          <span className="text-xs text-gray-300">{isPreparing ? "Preparing…" : "—"}</span>
        )}
      </td>

      {/* Age */}
      <td className="px-3 py-2 text-gray-400 hidden md:table-cell whitespace-nowrap text-xs">
        {ageText(cr.created_at)}
      </td>

      {/* Action */}
      <td className="px-3 py-2 text-right">
        {isPreparing ? (
          <span className="text-xs text-gray-300">—</span>
        ) : (
          <button
            onClick={onView}
            className="rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            Review
          </button>
        )}
      </td>
    </tr>
  );
}
