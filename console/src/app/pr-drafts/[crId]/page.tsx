// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow, format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { RiskBadge, Badge } from "@/components/Badge";
import { DetailRow } from "@/components/DetailRow";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { getPrDraftApi, completeChangeRequestApi } from "@/lib/api";
import { useProductIdWithFallback, useProductBasePath } from "@/lib/product-context";
import { broadcastInvalidation } from "@/lib/useSWRBroadcast";
import { useAuth } from "@/lib/auth";
import { canPerformAction } from "@/lib/permissions";


interface PageProps {
  params: Promise<{ crId: string }>;
}

export default function PrDraftDetailPage({ params }: PageProps) {
  const productId = useProductIdWithFallback();
  const basePath  = useProductBasePath();
  const { crId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const canComplete = canPerformAction(user?.roles ?? [], "pr_draft.complete");

  const { data: cr, error, isLoading, mutate } = useSWR(
    productId && crId ? ["pr-draft", productId, crId] : null,
    () => getPrDraftApi(productId, crId),
    { revalidateOnFocus: true }
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await completeChangeRequestApi(productId, crId);
      toast("PR draft accepted — case resolved", "success");
      setConfirmOpen(false);
      await mutate();
      broadcastInvalidation(productId, ["pr-drafts", "pr-drafts-badge"]);
    } catch (err) {
      toast(`Failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${format(d, "MMM d, yyyy 'at' HH:mm")} (${formatDistanceToNow(d, { addSuffix: true })})`;
    } catch {
      return dateStr;
    }
  };

  const isPrDrafted   = cr?.status === "pr-drafted";
  const isPreparing   = cr?.status === "implementation-prep";
  const isCompleted   = cr?.status === "completed";

  // BEF-19: Auto-navigate to the case view 1.5s after CR reaches completed state
  useEffect(() => {
    if (!isCompleted || !cr?.case_id) return;
    const timer = setTimeout(() => {
      router.push(`${basePath}/cases/${cr.case_id}`);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isCompleted, cr?.case_id, basePath, router]);

  // Parse implementation_notes — agent stores JSON here when available
  let implData: Record<string, unknown> | null = null;
  if (cr?.implementation_notes) {
    try {
      implData = JSON.parse(cr.implementation_notes) as Record<string, unknown>;
    } catch {
      // plain text — render as-is
    }
  }

  return (
    <AppLayout>
      {/* Navigation */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500 rounded-sm"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>

        {cr?.case_id && (
          <>
            <span className="text-gray-300" aria-hidden="true">|</span>
            <Link
              href={`${basePath}/cases/${cr.case_id}`}
              className="inline-flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500 rounded-sm"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              View Case
            </Link>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-gray-400">Loading PR draft...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">Failed to load PR draft</p>
          <p className="mt-1 text-sm text-gray-500">{(error as Error).message}</p>
        </div>
      ) : !cr ? null : (
        <div className="space-y-4">

          {/* Header card */}
          <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2 min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 leading-snug">{cr.title}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge riskLevel={cr.risk_level} />
                  <Badge
                    variant={
                      isCompleted   ? "green"
                      : isPrDrafted ? "blue"
                      : isPreparing ? "yellow"
                      : "gray"
                    }
                  >
                    {cr.status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Badge>
                  {isPreparing && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-400" aria-hidden="true" />
                      Agent is preparing implementation context…
                    </span>
                  )}
                  {cr.ci_details?.["pr_human_edited"] === true && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      PR changed in GitHub
                      {typeof cr.ci_details?.["pr_push_count"] === "number" && cr.ci_details["pr_push_count"] > 1
                        ? ` · ${cr.ci_details["pr_push_count"] as number} pushes`
                        : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* GitHub PR link + Accept button */}
              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                {cr.github_pr_url && (
                  <a
                    href={cr.github_pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 focus:outline-hidden focus:ring-2 focus:ring-gray-400 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                    View PR #{cr.github_pr_number}
                  </a>
                )}
                {isPrDrafted && canComplete && (
                  <button
                    onClick={() => setConfirmOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Accept & Complete
                  </button>
                )}
                {isCompleted && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Completed
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Option C workflow banner — shown whenever PR is ready for review ── */}
          {isPrDrafted && (
            <div className="rounded-xl overflow-hidden ring-1 ring-indigo-200">
              {/* Banner header */}
              <div className="bg-indigo-600 px-5 py-3 flex items-center gap-2.5">
                <svg className="h-4 w-4 text-indigo-200 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <p className="text-sm font-semibold text-white">How to review and finalise this change</p>
              </div>

              {/* Steps */}
              <div className="bg-indigo-50 px-5 py-4">
                <ol className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white mt-0.5">1</span>
                    <div>
                      <p className="text-sm font-medium text-indigo-900">NestFleet generated a draft PR in GitHub</p>
                      <p className="text-xs text-indigo-600 mt-0.5">
                        The AI produced a starting point based on the approved change request. It is intentionally a <em>draft</em> — not yet merged.
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white mt-0.5">2</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-indigo-900">
                        Review and refine the code in GitHub
                        {cr.ci_details?.["pr_human_edited"] === true && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            {typeof cr.ci_details?.["pr_push_count"] === "number" && cr.ci_details["pr_push_count"] > 1
                              ? `${cr.ci_details["pr_push_count"] as number} pushes recorded`
                              : "changes pushed"}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-indigo-600 mt-0.5 mb-2">
                        Open the PR, review the diff, push commits, request reviews. GitHub is your editor — make any corrections directly there.
                      </p>
                      {cr.github_pr_url ? (
                        <a
                          href={cr.github_pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                          </svg>
                          Open PR #{cr.github_pr_number} in GitHub
                          <svg className="h-3 w-3 opacity-70" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                          GitHub PR not yet created — create it manually using the notes below
                        </span>
                      )}
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white mt-0.5">3</span>
                    <div>
                      <p className="text-sm font-medium text-indigo-900">Return here and click <span className="font-bold">&quot;Accept &amp; Complete&quot;</span></p>
                      <p className="text-xs text-indigo-600 mt-0.5">
                        Once you are satisfied with the code, confirm here. This closes the case and records the outcome in the audit log.
                      </p>
                    </div>
                  </li>
                </ol>

                <div className="mt-4 pt-3.5 border-t border-indigo-200 flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-indigo-500">
                    <span className="font-medium text-indigo-700">You own the final code.</span>{" "}
                    NestFleet generated a starting point — your review and any edits in GitHub are the authoritative version that ships.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* GitHub not yet wired notice */}
          {isPrDrafted && !cr.github_pr_url && (
            <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-4 flex items-start gap-3">
              <svg className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">GitHub PR not yet created</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  The agent prepared the implementation context but GitHub integration is not yet wired (<code className="font-mono">GITHUB_TOKEN</code> not configured). Review the implementation notes below and create the PR manually.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left — metadata */}
            <div className="space-y-4">
              <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">Details</h2>
                <dl className="space-y-3 text-sm">
                  <DetailRow label="CR ID">
                    <code className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600 break-all">
                      {cr.change_request_id}
                    </code>
                  </DetailRow>
                  <DetailRow label="Risk">
                    <RiskBadge riskLevel={cr.risk_level} />
                  </DetailRow>
                  <DetailRow label="Case">
                    {cr.case_id ? (
                      <Link
                        href={`${basePath}/cases/${cr.case_id}`}
                        className="font-mono text-xs text-indigo-600 hover:underline focus:outline-hidden focus:underline"
                      >
                        {cr.case_id}
                      </Link>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </DetailRow>
                  {cr.github_issue_number !== null && (
                    <DetailRow label="GitHub Issue">
                      {cr.github_issue_url ? (
                        <a
                          href={cr.github_issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-sm"
                        >
                          #{cr.github_issue_number}
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      ) : (
                        <span>#{cr.github_issue_number}</span>
                      )}
                    </DetailRow>
                  )}
                  {cr.github_pr_number !== null && (
                    <DetailRow label="GitHub PR">
                      {cr.github_pr_url ? (
                        <a
                          href={cr.github_pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-sm"
                        >
                          #{cr.github_pr_number}
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      ) : (
                        <span>#{cr.github_pr_number}</span>
                      )}
                    </DetailRow>
                  )}
                  <DetailRow label="Created">
                    <span className="text-gray-700">{formatDate(cr.created_at)}</span>
                  </DetailRow>
                  <DetailRow label="Updated">
                    <span className="text-gray-700">{formatDate(cr.updated_at)}</span>
                  </DetailRow>
                </dl>
              </div>

              {/* Affected surfaces */}
              {cr.affected_surfaces.length > 0 && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                  <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wide">Affected Surfaces</h2>
                  <div className="flex flex-wrap gap-2">
                    {cr.affected_surfaces.map((s) => (
                      <Badge key={s} variant="blue">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Impact summary */}
              {cr.impact_summary && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">Impact Summary</h2>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{cr.impact_summary}</p>
                </div>
              )}
            </div>

            {/* Right — implementation content */}
            <div className="space-y-4">
              {/* Proposed scope */}
              {cr.proposed_scope && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">Proposed Scope</h2>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{cr.proposed_scope}</p>
                </div>
              )}

              {/* Implementation notes — structured if JSON, plain if text */}
              {cr.implementation_notes && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">Implementation Notes</h2>
                  {implData ? (
                    <StructuredImplNotes data={implData} />
                  ) : (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {cr.implementation_notes}
                    </p>
                  )}
                </div>
              )}

              {/* Empty state when preparing */}
              {isPreparing && !cr.implementation_notes && (
                <div className="rounded-xl bg-white shadow-xs ring-1 ring-black/5 p-5 flex flex-col items-center justify-center py-10 text-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600 mb-3" />
                  <p className="text-sm text-gray-500">Agent is assembling implementation context…</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Accept & Complete modal ── */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => { if (!isSubmitting) setConfirmOpen(false); }}
        title="Accept PR Draft"
      >
        {cr && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Accepting this PR draft will mark the change request as{" "}
              <span className="font-medium text-gray-900">completed</span> and
              resolve the originating case. This confirms the implementation is ready for engineering handoff.
            </p>
            <p className="text-sm text-gray-600">
              Change request: <span className="font-medium text-gray-900">{cr.title}</span>
            </p>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                {isSubmitting && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                )}
                Accept & Complete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

// ─── Structured implementation notes renderer ─────────────────────────────────

function StructuredImplNotes({ data }: { data: Record<string, unknown> }) {
  const sections: Array<{ label: string; key: string }> = [
    { label: "Diff Summary",               key: "diffSummary" },
    { label: "Implementation Context",     key: "implementationContext" },
    { label: "Affected Components",        key: "affectedComponents" },
    { label: "Affected Doc Sections",      key: "affectedDocSections" },
    { label: "Implementation Considerations", key: "implementationConsiderations" },
    { label: "Testing Notes",              key: "testingNotes" },
    { label: "Missing Context",            key: "missingContextAreas" },
    { label: "PR Body",                    key: "prBody" },
  ];

  return (
    <div className="space-y-4">
      {sections.map(({ label, key }) => {
        const value = data[key];
        if (!value) return null;

        if (Array.isArray(value) && value.length > 0) {
          return (
            <div key={key}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>
              <ul className="space-y-1">
                {(value as string[]).map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-gray-400 shrink-0 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (typeof value === "string" && value.trim()) {
          return (
            <div key={key}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{value}</p>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

