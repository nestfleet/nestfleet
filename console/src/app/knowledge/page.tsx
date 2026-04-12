// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { AppLayout } from "@/components/AppLayout";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { useProductIdWithFallback } from "@/lib/product-context";
import {
  listKnowledgeAssetsApi,
  getKnowledgeAssetStatsApi,
  approveKnowledgeAssetApi,
  rejectKnowledgeAssetApi,
  publishKnowledgeAssetApi,
  getMemorySourcesApi,
  getMemoryHealthApi,
  ingestMemoryApi,
  deleteMemorySourceApi,
  searchMemoryApi,
  getCasesApi,
  type KnowledgeAsset,
  type KnowledgeAssetStatus,
  type MemorySource,
  type MemorySourceType,
  type MemorySearchResult,
  type HealthLevel,
  type CapabilityStatus,
  type IngestMemoryPayload,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  faq:            "FAQ",
  known_issue:    "Known Issue",
  runbook_update: "Runbook Update",
  docs_update:    "Docs Update",
};

const STATUS_STYLES: Record<KnowledgeAssetStatus, string> = {
  proposed:  "bg-amber-50 text-amber-700 ring-amber-200",
  approved:  "bg-blue-50 text-blue-700 ring-blue-200",
  rejected:  "bg-red-50 text-red-700 ring-red-200",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const TIER_STYLES: Record<number, { label: string; cls: string }> = {
  1: { label: "T1", cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  2: { label: "T2", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  3: { label: "T3", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  4: { label: "T4", cls: "bg-gray-100 text-gray-600 ring-gray-200" },
};

const SOURCE_TYPES_BY_TIER: Record<string, MemorySourceType[]> = {
  "T1 — Authoritative": ["product_spec", "feature_spec", "faq", "known_issues", "api_docs"],
  "T2 — Supporting":    ["architecture_overview", "technical_spec", "deployment_guide", "troubleshooting_guide", "runbook", "changelog", "readme"],
};

const SOURCE_TYPE_LABEL: Record<MemorySourceType, string> = {
  product_spec:          "Product Spec",
  feature_spec:          "Feature Spec",
  faq:                   "FAQ",
  known_issues:          "Known Issues",
  api_docs:              "API Docs",
  openapi_spec:          "OpenAPI Spec",
  architecture_overview: "Architecture Overview",
  technical_spec:        "Technical Spec",
  deployment_guide:      "Deployment Guide",
  troubleshooting_guide: "Troubleshooting Guide",
  runbook:               "Runbook",
  changelog:             "Changelog",
  readme:                "README",
  github_issue_filtered: "GitHub Issue (Filtered)",
  github_pr_merged:      "GitHub PR (Merged)",
  github_issue_raw:      "GitHub Issue (Raw)",
  commit_message:        "Commit Message",
};

const HEALTH_DIMENSION_LABELS: Record<string, string> = {
  t1Coverage:    "T1 Source Coverage",
  faqCoverage:   "FAQ Coverage",
  knownIssues:   "Known Issues",
  architecture:  "Architecture",
  technicalSpec: "Technical Spec",
  freshness:     "Content Freshness",
  conflicts:     "Conflict-Free",
  language:      "Language Quality",
};

const GATE_LABELS: Record<string, string> = {
  autoReply:       "Auto-Reply",
  knownIssueMatch: "Known Issue Match",
  changePrep:      "Change Prep",
  prDraft:         "PR Draft",
  outageRouting:   "Outage Routing",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-500";
  return <span className={`text-xs font-medium ${color}`}>{pct}%</span>;
}

function FreshnessBar({ value }: { value: number }) {
  const pct = Math.round(parseFloat(String(value)) * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

const LEVEL_STYLES: Record<HealthLevel, { cls: string; label: string }> = {
  good: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Good" },
  warn: { cls: "bg-amber-50  text-amber-700  ring-amber-200",  label: "Warn" },
  fail: { cls: "bg-red-50    text-red-600    ring-red-200",    label: "Fail" },
};

const CAP_STYLES: Record<CapabilityStatus, { cls: string; dot: string; label: string }> = {
  enabled:  { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", label: "Enabled" },
  degraded: { cls: "bg-amber-50  text-amber-700  ring-amber-200",  dot: "bg-amber-400",  label: "Degraded" },
  disabled: { cls: "bg-gray-50   text-gray-500   ring-gray-200",   dot: "bg-gray-400",   label: "Disabled" },
};

function levelScore(l: HealthLevel): number {
  return l === "good" ? 1 : l === "warn" ? 0.5 : 0;
}

function overallScore(dims: Record<string, HealthLevel>): number {
  const vals = Object.values(dims).map(levelScore);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

// ── Knowledge Assets — Review Modal ──────────────────────────────────────────

function ReviewModal({
  asset,
  onClose,
  onApprove,
  onReject,
  onPublish,
}: {
  asset: KnowledgeAsset;
  onClose: () => void;
  onApprove: (note: string) => Promise<void>;
  onReject: (note: string) => Promise<void>;
  onPublish: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); onClose(); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {TYPE_LABELS[asset.assetType] ?? asset.assetType}
              </span>
              <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${STATUS_STYLES[asset.status]}`}>
                {asset.status}
              </span>
              <ConfidenceBadge value={asset.confidence} />
            </div>
            <h2 className="text-base font-semibold text-gray-900 truncate">{asset.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Case: {asset.caseId}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Content</p>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
              {asset.content}
            </div>
          </div>

          {asset.sourceRefs && asset.sourceRefs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Source references</p>
              <ul className="space-y-1">
                {asset.sourceRefs.map((ref, i) => (
                  <li key={i} className="text-xs text-indigo-600 bg-indigo-50 rounded px-2 py-1 font-mono">{ref}</li>
                ))}
              </ul>
            </div>
          )}

          {asset.reviewNote && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Previous review note</p>
              <p className="text-sm text-gray-700 bg-amber-50 rounded-lg px-3 py-2 ring-1 ring-amber-100">
                {asset.reviewNote}
              </p>
            </div>
          )}

          {asset.status === "proposed" && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Review note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Add context for the decision…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100">
            Close
          </button>
          {asset.status === "proposed" && (
            <>
              <button disabled={busy} onClick={() => handle(() => onReject(note))}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg ring-1 ring-red-200 disabled:opacity-50">
                {busy ? "…" : "Reject"}
              </button>
              <button disabled={busy} onClick={() => handle(() => onApprove(note))}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
                {busy ? "…" : "Approve"}
              </button>
            </>
          )}
          {asset.status === "approved" && (
            <button disabled={busy} onClick={() => handle(onPublish)}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
              {busy ? "Publishing…" : "Publish to Memory"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Memory Sources — Upload Slide-Over ────────────────────────────────────────

function UploadPanel({
  onClose,
  onSuccess,
  productId,
}: {
  onClose: () => void;
  onSuccess: () => void;
  productId: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Partial<IngestMemoryPayload>>({
    audience: "public",
    language: "en",
  });

  function set<K extends keyof IngestMemoryPayload>(key: K, value: IngestMemoryPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.sourceType || !form.sourceUri || !form.content || !form.sourceUpdatedAt) {
      toast("Fill in all required fields.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await ingestMemoryApi(productId, form as IngestMemoryPayload);
      toast(
        `Ingested ${result.data.chunksIngested} chunks (${result.data.chunksSkipped} skipped), tier T${result.data.tier}.`,
        "success",
      );
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ingestion failed.";
      toast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Upload Memory Source</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Source Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Source Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.sourceType ?? ""}
              onChange={(e) => set("sourceType", e.target.value as MemorySourceType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="" disabled>Select source type…</option>
              {Object.entries(SOURCE_TYPES_BY_TIER).map(([group, types]) => (
                <optgroup key={group} label={group}>
                  {types.map((t) => (
                    <option key={t} value={t}>{SOURCE_TYPE_LABEL[t]}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Source URI */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Source URI <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.sourceUri ?? ""}
              onChange={(e) => set("sourceUri", e.target.value)}
              placeholder="docs://product-spec-v2.md or https://…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-xs text-gray-400 mt-1">Unique identifier for this document. Used for dedup on re-ingest.</p>
          </div>

          {/* Last Updated */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Last Updated <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={form.sourceUpdatedAt ? form.sourceUpdatedAt.slice(0, 16) : ""}
              onChange={(e) => set("sourceUpdatedAt", new Date(e.target.value).toISOString())}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-xs text-gray-400 mt-1">Used to compute freshness score. More recent = higher score.</p>
          </div>

          {/* Audience + Version row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Audience</label>
              <select
                value={form.audience ?? "public"}
                onChange={(e) => set("audience", e.target.value as IngestMemoryPayload["audience"])}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="developer">Developer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Product Version</label>
              <input
                type="text"
                value={form.productVersion ?? ""}
                onChange={(e) => set("productVersion", e.target.value || undefined)}
                placeholder="e.g. 2.4.0 (leave blank for *)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Content (Markdown) <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.content ?? ""}
              onChange={(e) => set("content", e.target.value)}
              rows={12}
              placeholder="Paste your markdown document here…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {form.content ? `${form.content.length.toLocaleString()} chars` : "Up to 500,000 characters."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
          >
            {busy ? "Ingesting…" : "Ingest Document"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Memory Sources — Search Probe ─────────────────────────────────────────────

function SearchProbe({ productId }: { productId: string }) {
  const [query, setQuery] = useState("");
  const [actionType, setActionType] = useState("");
  const [topN, setTopN] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MemorySearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await searchMemoryApi(productId, {
        query: query.trim(),
        ...(actionType ? { actionType } : {}),
        topN,
      });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Search Probe</h3>
        <p className="text-xs text-gray-500 mt-0.5">Test what the AI retrieves for a query before it runs on real cases.</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter a test query…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">Any action</option>
            <option value="auto_reply">Auto Reply</option>
            <option value="triage">Triage</option>
            <option value="known_issue_match">Known Issue Match</option>
            <option value="change_prep">Change Prep</option>
            <option value="pr_draft_prep">PR Draft</option>
            <option value="outage_routing">Outage Routing</option>
          </select>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          >
            {[3, 5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>Top {n}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
          >
            {loading ? "…" : "Search"}
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{result.chunks.length} chunks returned</span>
              {result.abstain && (
                <span className="text-amber-600 font-medium">Abstained — {result.abstainReason}</span>
              )}
              {result.hasConflicts && (
                <span className="text-red-500">⚠ Conflicting sources detected</span>
              )}
            </div>

            {result.chunks.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No chunks matched.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {result.chunks.map((chunk) => (
                  <div key={chunk.chunkId} className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 ${TIER_STYLES[chunk.tier]?.cls}`}>
                          {TIER_STYLES[chunk.tier]?.label}
                        </span>
                        <span className="text-xs text-gray-500 font-mono truncate max-w-48">{chunk.sourceUri}</span>
                        <span className="text-xs text-gray-400 font-mono">{chunk.sectionPath}</span>
                      </div>
                      <span className="text-xs font-medium text-indigo-600">score {chunk.score}</span>
                    </div>
                    <p className="text-xs text-gray-700 line-clamp-3">{chunk.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Memory Sources — Help Panel ───────────────────────────────────────────────

const HELP_ITEMS: { icon: string; title: string; body: string; highlight?: boolean }[] = [
  {
    icon: "🧠",
    title: "This is what the AI reads before it acts",
    body: "Before drafting a reply, routing an outage, or preparing a change — the AI searches this index. No documents here = the AI guesses.",
  },
  {
    icon: "T1",
    title: "T1 sources are non-negotiable",
    body: "Product Spec, FAQ, Known Issues. If your FAQ is 6 months old, the AI will quote your old pricing. If Known Issues is missing, the AI won't recognise a recurring bug.",
    highlight: true,
  },
  {
    icon: "📉",
    title: "Low freshness = stale answers",
    body: "A red freshness bar means the document hasn't been re-ingested since it changed. The AI doesn't know about updates until you re-upload.",
  },
  {
    icon: "⚡",
    title: "Conflicts block the AI",
    body: "If two sources say contradictory things (\"limit is 100 MB\" vs \"limit is 500 MB\"), the AI will abstain rather than guess wrong. Delete the outdated source to unblock it.",
  },
  {
    icon: "🚦",
    title: "Capability gates show what's live right now",
    body: "\"Auto-Reply: Disabled\" means zero automated replies are going out — not degraded, fully off — until T1 coverage meets the threshold.",
  },
  {
    icon: "🔄",
    title: "After every release: re-ingest",
    body: "Ship a feature → upload the updated spec → done. The AI picks it up on the next case. Skip this and it will describe the old behaviour.",
  },
];

function MemoryHelpPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-indigo-800">
          <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
          How does this affect my product?
        </span>
        <svg
          className={`h-4 w-4 text-indigo-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-indigo-100 px-4 py-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {HELP_ITEMS.map((item) => (
            <div
              key={item.title}
              className={`rounded-lg px-4 py-3 space-y-1 ${item.highlight ? "bg-indigo-100 ring-1 ring-indigo-200" : "bg-white ring-1 ring-indigo-100"}`}
            >
              <p className="flex items-center gap-2 text-xs font-semibold text-gray-900">
                <span className="text-sm">{item.icon}</span>
                {item.title}
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Memory Sources Tab ────────────────────────────────────────────────────────

function MemorySourcesTab({ productId, isAdmin }: { productId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [deletingUri, setDeletingUri] = useState<string | null>(null);

  const sourcesKey  = productId ? ["memory-sources", productId] : null;
  const healthKey   = productId ? ["memory-health",  productId] : null;
  const casesPeekKey = productId ? ["cases-peek", productId] : null;

  const { data: sourcesData, isLoading: sourcesLoading, error: sourcesError } =
    useSWR(sourcesKey, () => getMemorySourcesApi(productId), { refreshInterval: 30_000 });
  const { data: healthData } =
    useSWR(healthKey, () => getMemoryHealthApi(productId), { refreshInterval: 60_000 });
  const { data: casesPeekData } =
    useSWR(casesPeekKey, () => getCasesApi(productId), { revalidateOnFocus: false });

  const sources  = sourcesData?.data?.sources ?? [];
  const hasCases = (casesPeekData?.data?.length ?? 0) > 0;
  const health  = healthData?.data;

  async function handleDelete(sourceUri: string) {
    if (!confirm(`Delete all chunks from "${sourceUri}"?`)) return;
    setDeletingUri(sourceUri);
    try {
      const res = await deleteMemorySourceApi(productId, sourceUri);
      toast(`Deleted ${res.data.deletedChunks} chunks.`, "success");
      mutate(sourcesKey);
      mutate(healthKey);
    } catch {
      toast("Delete failed.", "error");
    } finally {
      setDeletingUri(null);
    }
  }

  return (
    <div className="space-y-6">
      <MemoryHelpPanel />

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {sources.length} source{sources.length !== 1 ? "s" : ""} indexed
        </p>
        {isAdmin && (
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Upload Document
          </button>
        )}
      </div>

      {/* Source list */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {sourcesLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : sourcesError ? (
          <div className="py-16 text-center text-sm text-red-500">Failed to load sources.</div>
        ) : sources.length === 0 ? (
          <div className="py-10 px-6 space-y-4">
            {/* Amber nudge — shown when cases exist but KB is empty */}
            {hasCases && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                <svg className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">Agents are handling cases without product context</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Add docs, FAQs, or known issues to improve triage accuracy and auto-reply quality.
                  </p>
                </div>
              </div>
            )}
            <div className="text-center space-y-2 py-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mx-auto h-8 w-8 text-gray-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-sm text-gray-500">No knowledge sources yet</p>
              {isAdmin && (
                <p className="text-xs text-gray-400">Upload a document to populate the product memory index.</p>
              )}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Source URI</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-32">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-14">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-16 text-center">Chunks</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-40">Avg Freshness</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-20 text-center">Conflicts</th>
                {isAdmin && <th className="px-4 py-3 w-16" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sources.map((src: MemorySource) => (
                <tr key={src.sourceUri} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-gray-800 line-clamp-1">{src.sourceUri}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Last ingested {new Date(src.lastIngestedAt).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                      {SOURCE_TYPE_LABEL[src.sourceType] ?? src.sourceType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 ${TIER_STYLES[src.tier]?.cls}`}>
                      {TIER_STYLES[src.tier]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-medium text-gray-700">{src.chunkCount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <FreshnessBar value={parseFloat(src.avgFreshness)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {src.hasConflicts ? (
                      <span className="text-[11px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded ring-1 ring-red-200">Yes</span>
                    ) : (
                      <span className="text-[11px] text-gray-400">—</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        disabled={deletingUri === src.sourceUri}
                        onClick={() => handleDelete(src.sourceUri)}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        {deletingUri === src.sourceUri ? "…" : "Delete"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Health Panel */}
      {health && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Documentation Health</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Generated {new Date(health.computedAt).toLocaleString()}
              </p>
            </div>
            {/* Overall score derived from dimension levels */}
            {health.dimensions && (() => {
              const pct = Math.round(overallScore(health.dimensions as unknown as Record<string, HealthLevel>) * 100);
              const color = pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500";
              const ring  = pct >= 80 ? "ring-emerald-200 bg-emerald-50" : pct >= 50 ? "ring-amber-200 bg-amber-50" : "ring-red-200 bg-red-50";
              return (
                <div className={`inline-flex flex-col items-center justify-center rounded-2xl ring-1 px-6 py-4 ${ring}`}>
                  <span className={`text-3xl font-bold ${color}`}>{pct}</span>
                  <span className="text-xs text-gray-500 mt-0.5">/ 100</span>
                </div>
              );
            })()}
          </div>
          <div className="px-5 py-4 space-y-5">
            {/* Dimensions */}
            {health.dimensions && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Dimensions</p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  {(Object.entries(health.dimensions) as [string, HealthLevel][]).map(([key, level]) => {
                    const s = LEVEL_STYLES[level] ?? LEVEL_STYLES.fail;
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">{HEALTH_DIMENSION_LABELS[key] ?? key}</span>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ring-1 ${s.cls}`}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Capability Gates */}
            {health.capabilities && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Capability Gates</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(health.capabilities) as [string, CapabilityStatus][]).map(([key, status]) => {
                    const s = CAP_STYLES[status] ?? CAP_STYLES.disabled;
                    return (
                      <span key={key} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${s.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        {GATE_LABELS[key] ?? key}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {health.recommendedActions?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recommendations</p>
                <ul className="space-y-1.5">
                  {health.recommendedActions.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Probe */}
      <SearchProbe productId={productId} />

      {/* Upload panel */}
      {showUpload && (
        <UploadPanel
          productId={productId}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            mutate(sourcesKey);
            mutate(healthKey);
          }}
        />
      )}
    </div>
  );
}

// ── Knowledge Assets Tab ──────────────────────────────────────────────────────

function KnowledgeAssetsTab({ productId, isKnowledgeLead }: { productId: string; isKnowledgeLead: boolean }) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<KnowledgeAssetStatus | "all">("all");
  const [selected, setSelected] = useState<KnowledgeAsset | null>(null);

  const swrKey = productId ? ["knowledge-assets", productId, statusFilter] : null;
  const { data, isLoading, error } = useSWR(
    swrKey,
    () => listKnowledgeAssetsApi(productId, statusFilter === "all" ? undefined : statusFilter),
    { refreshInterval: 30_000 },
  );

  const { data: statsData } = useSWR(
    productId ? ["knowledge-stats", productId] : null,
    () => getKnowledgeAssetStatsApi(productId),
    { refreshInterval: 30_000 },
  );

  const assets = data?.data?.assets ?? [];
  const stats  = statsData?.data;

  async function handleApprove(assetId: string, note: string) {
    try {
      await approveKnowledgeAssetApi(productId, assetId, note || undefined);
      toast("Asset approved.", "success");
      mutate(swrKey);
      mutate(["knowledge-stats", productId]);
    } catch {
      toast("Failed to approve asset.", "error");
      throw new Error("approve failed");
    }
  }

  async function handleReject(assetId: string, note: string) {
    try {
      await rejectKnowledgeAssetApi(productId, assetId, note || undefined);
      toast("Asset rejected.", "success");
      mutate(swrKey);
      mutate(["knowledge-stats", productId]);
    } catch {
      toast("Failed to reject asset.", "error");
      throw new Error("reject failed");
    }
  }

  async function handlePublish(assetId: string) {
    try {
      await publishKnowledgeAssetApi(productId, assetId);
      toast("Asset published to product memory.", "success");
      mutate(swrKey);
      mutate(["knowledge-stats", productId]);
    } catch {
      toast("Failed to publish asset.", "error");
      throw new Error("publish failed");
    }
  }

  const FILTERS: { label: string; value: KnowledgeAssetStatus | "all"; count?: number }[] = [
    { label: "All",       value: "all" },
    { label: "Proposed",  value: "proposed",  count: stats?.proposed },
    { label: "Approved",  value: "approved",  count: stats?.approved },
    { label: "Published", value: "published", count: stats?.published },
    { label: "Rejected",  value: "rejected",  count: stats?.rejected },
  ];

  return (
    <div className="space-y-5">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Proposed",  value: stats.proposed,  color: "text-amber-600" },
            { label: "Approved",  value: stats.approved,  color: "text-blue-600" },
            { label: "Published", value: stats.published, color: "text-emerald-600" },
            { label: "Rejected",  value: stats.rejected,  color: "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium border transition-colors ${
              statusFilter === f.value
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800 shadow-sm"
            }`}
          >
            {f.label}
            {f.count != null && f.count > 0 && (
              <span className="ml-1.5 text-[11px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">Failed to load assets.</div>
        ) : assets.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mx-auto h-8 w-8 text-gray-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            <p className="text-sm text-gray-500">No knowledge assets found</p>
            <p className="text-xs text-gray-400">Assets are created automatically when cases are resolved.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-24">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">AI Confidence</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">Created</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assets.map((asset) => (
                <tr key={asset.assetId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 line-clamp-1">{asset.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">case: {asset.caseId.slice(-8)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                      {TYPE_LABELS[asset.assetType] ?? asset.assetType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${STATUS_STYLES[asset.status]}`}>
                      {asset.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceBadge value={asset.confidence} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(asset.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(asset)}
                      className="px-3 py-1 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors"
                    >
                      {isKnowledgeLead && asset.status === "proposed" ? "Review" :
                       isKnowledgeLead && asset.status === "approved" ? "Publish" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <ReviewModal
          asset={selected}
          onClose={() => setSelected(null)}
          onApprove={(note) => handleApprove(selected.assetId, note)}
          onReject={(note) => handleReject(selected.assetId, note)}
          onPublish={() => handlePublish(selected.assetId)}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "assets" | "sources";

export default function KnowledgePage() {
  const productId = useProductIdWithFallback();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("assets");

  const isKnowledgeLead = user?.roles?.some((r) => ["knowledge_lead", "admin"].includes(r)) ?? false;
  const isAdmin         = user?.roles?.includes("admin") ?? false;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Knowledge</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage AI-generated knowledge assets and the product memory index.
            </p>
          </div>
          {!isKnowledgeLead && (
            <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg ring-1 ring-amber-200">
              Read-only — knowledge_lead or admin role required to edit
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {([
            { id: "assets",  label: "Knowledge Assets" },
            { id: "sources", label: "Memory Sources" },
          ] as { id: Tab; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "assets" ? (
          <KnowledgeAssetsTab productId={productId} isKnowledgeLead={isKnowledgeLead} />
        ) : (
          <MemorySourcesTab productId={productId} isAdmin={isAdmin} />
        )}

        <p className="text-xs text-gray-400 text-center">Auto-refreshes every 30s</p>
      </div>
    </AppLayout>
  );
}
