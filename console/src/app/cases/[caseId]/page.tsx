"use client";

import { useState, use, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { StatusBadge, SeverityBadge } from "@/components/Badge";
import { LineageTimeline } from "@/components/LineageTimeline";
import { LineageGraph } from "@/components/lineage-graph";
import { getLineageApi, getCaseConversationApi, getCaseApi, sendChatReplyApi, sendDraftReplyApi, retryCaseApi, ApiError } from "@/lib/api";
import { useProductIdWithFallback, useProductBasePath } from "@/lib/product-context";
import type { ConversationMessage } from "@/lib/api";

// ── Chat Reply Panel ──────────────────────────────────────────────────────────

const CHAT_EXPANDED_KEY  = "nestfleet:chat-panel-expanded";
const EMAIL_EXPANDED_KEY = "nestfleet:email-panel-expanded";

function ChatReplyPanel({
  caseId,
  messages,
  onReplySent,
}: {
  caseId: string;
  messages: ConversationMessage[];
  onReplySent: () => void;
}) {
  const productId = useProductIdWithFallback();
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CHAT_EXPANDED_KEY) === "true";
  });
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to latest message when expanded or new message arrives
  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, expanded]);

  function toggle() {
    setExpanded((v) => {
      const next = !v;
      localStorage.setItem(CHAT_EXPANDED_KEY, String(next));
      if (next) setTimeout(() => textareaRef.current?.focus(), 120);
      return next;
    });
  }

  function openAndFocus() {
    if (!expanded) {
      setExpanded(true);
      localStorage.setItem(CHAT_EXPANDED_KEY, "true");
      setTimeout(() => textareaRef.current?.focus(), 120);
    } else {
      textareaRef.current?.focus();
    }
  }

  async function handleSend() {
    const text = replyText.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendChatReplyApi(productId, caseId, text);
      if (res.ok) {
        setReplyText("");
        onReplySent();
      } else {
        setError(res.error ?? "Failed to send reply");
      }
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const lastMsg = messages.at(-1);
  const lastSender = lastMsg
    ? lastMsg.direction === "outbound" ? "You" : (lastMsg.from_email?.split("@")[0] ?? "User")
    : null;
  const lastSnippet = lastMsg?.body
    ? lastMsg.body.length > 72 ? lastMsg.body.slice(0, 72) + "…" : lastMsg.body
    : null;

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
      {/* ── Collapsed / expanded header ── */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-gray-50/60 transition-colors select-none"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(); }}
        aria-expanded={expanded}
      >
        {/* Live indicator */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>

        <span className="text-sm font-medium text-gray-800">Live chat</span>

        {/* Message count chip */}
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-inset ring-gray-200">
          {messages.length}
        </span>

        {/* Last message preview — only when collapsed */}
        {!expanded && lastSender && lastSnippet && (
          <span className="ml-1 min-w-0 flex-1 truncate text-xs text-gray-400">
            <span className="font-medium text-gray-500">{lastSender}:</span> {lastSnippet}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Reply CTA — only when collapsed */}
          {!expanded && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openAndFocus(); }}
              className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Reply →
            </button>
          )}

          {/* Chevron */}
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>

      {/* ── Expanded: thread + input ── */}
      {expanded && (
        <>
          {/* Message thread */}
          <div className="max-h-72 overflow-y-auto border-t border-gray-100 px-4 py-3 space-y-3">
            {messages.map((msg) => {
              const isOperator = msg.direction === "outbound";
              return (
                <div key={msg.signal_id} className={`flex ${isOperator ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      isOperator
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    {!isOperator && msg.from_email && (
                      <p className="text-[10px] font-semibold text-gray-500 mb-0.5">{msg.from_email}</p>
                    )}
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p className={`mt-1 text-[10px] ${isOperator ? "text-indigo-200" : "text-gray-400"}`}>
                      {(() => { try { return formatDistanceToNow(new Date(msg.received_at), { addSuffix: true }); } catch { return ""; } })()}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Reply input */}
          <div className="border-t border-gray-100 px-3 py-3">
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply… (Enter to send, Shift+Enter for newline)"
                rows={2}
                className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !replyText.trim()}
                className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Email Reply Panel (DEFERRED-24) ──────────────────────────────────────────
// Shown on awaiting-lead email cases — lets the Lead edit the AI draft and
// send it to the customer. Case stays in awaiting-lead after sending.

function EmailReplyPanel({
  caseId,
  draft,
  onSent,
}: {
  caseId: string;
  draft: string | null;
  onSent: () => void;
}) {
  const productId = useProductIdWithFallback();
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(EMAIL_EXPANDED_KEY);
    return stored === null ? true : stored === "true";
  });
  const [replyText, setReplyText] = useState(draft ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function toggle() {
    setExpanded((v) => {
      const next = !v;
      localStorage.setItem(EMAIL_EXPANDED_KEY, String(next));
      if (next) setTimeout(() => textareaRef.current?.focus(), 120);
      return next;
    });
  }

  function openAndFocus() {
    if (!expanded) {
      setExpanded(true);
      localStorage.setItem(EMAIL_EXPANDED_KEY, "true");
      setTimeout(() => textareaRef.current?.focus(), 120);
    } else {
      textareaRef.current?.focus();
    }
  }

  async function handleSend() {
    const text = replyText.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendDraftReplyApi(productId, caseId, text);
      if (res.ok) {
        setSent(true);
        onSent();
      } else {
        setError(res.error ?? "Failed to send reply");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error — please retry");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Reply sent to customer. Case remains open — resolve when the issue is confirmed fixed.
      </div>
    );
  }

  const draftSnippet = replyText.trim()
    ? (replyText.length > 72 ? replyText.slice(0, 72) + "…" : replyText)
    : null;

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
      {/* ── Collapsed / expanded header ── */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-gray-50/60 transition-colors select-none"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggle(); }}
        aria-expanded={expanded}
      >
        {/* Email icon */}
        <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>

        <span className="text-sm font-medium text-gray-800">Draft Reply</span>

        {/* Awaiting review badge */}
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
          Awaiting Lead Review
        </span>

        {/* Draft snippet preview — only when collapsed */}
        {!expanded && draftSnippet && (
          <span className="ml-1 min-w-0 flex-1 truncate text-xs text-gray-400 italic">
            {draftSnippet}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Send CTA — only when collapsed */}
          {!expanded && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openAndFocus(); }}
              className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Send Reply →
            </button>
          )}

          {/* Chevron */}
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>

      {/* ── Expanded: textarea + send button ── */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-y"
            placeholder="AI draft will appear here once generated…"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-gray-400">
              Sending will email the customer directly. Case stays open — resolve separately once confirmed.
            </p>
            <button
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending…
                </>
              ) : "Send Reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Processing Failed Panel (QE-05) ──────────────────────────────────────────

function ProcessingFailedPanel({
  caseId,
  processingError,
  onRetried,
}: {
  caseId: string;
  processingError: { jobName: string; jobId: string; error: string } | null | undefined;
  onRetried: () => void;
}) {
  const productId = useProductIdWithFallback();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryDone, setRetryDone] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryCaseApi(productId, caseId);
      setRetryDone(true);
      onRetried();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Failed to retry");
    } finally {
      setRetrying(false);
    }
  }

  if (retryDone) {
    return (
      <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Re-triage dispatched. The case is now back in the enriching queue.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-red-50 ring-1 ring-red-200 shadow-sm px-4 py-4">
      <div className="flex items-start gap-3">
        {/* Error icon */}
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Processing Failed</p>
              <p className="mt-0.5 text-sm text-red-900 leading-relaxed">
                This case failed during automated processing and requires manual intervention.
              </p>
            </div>

            <button
              onClick={handleRetry}
              disabled={retrying}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              {retrying ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Retrying…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Retry Processing
                </>
              )}
            </button>
          </div>

          {retryError && (
            <p className="mt-2 text-xs text-red-600">{retryError}</p>
          )}

          {/* Error details */}
          {processingError && (
            <div className="mt-3 rounded-lg bg-red-100/60 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Failure Details</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-red-800">
                <span className="font-medium text-red-600">Job</span>
                <span className="font-mono">{processingError.jobName}</span>
                <span className="font-medium text-red-600">Job ID</span>
                <span className="font-mono break-all">{processingError.jobId}</span>
                <span className="font-medium text-red-600">Error</span>
                <span className="break-words">{processingError.error}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface PageProps {
  params: Promise<{ caseId: string }>;
}

export default function CaseDetailPage({ params }: PageProps) {
  const { caseId } = use(params);
  const router = useRouter();
  const productId = useProductIdWithFallback();
  const basePath  = useProductBasePath();
  const [viewMode, setViewMode] = useState<"timeline" | "graph">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("nestfleet:lineage-view") as "timeline" | "graph") ?? "timeline";
    }
    return "timeline";
  });

  const {
    data: lineage,
    error,
    isLoading,
    mutate,
  } = useSWR(
    productId && caseId ? ["lineage", productId, caseId] : null,
    () => getLineageApi(productId, caseId),
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  const [signalExpanded,       setSignalExpanded]       = useState(false);
  const [conversationExpanded, setConversationExpanded] = useState(false);

  const { data: conversationData, mutate: mutateConversation } = useSWR(
    productId && caseId ? ["conversation", productId, caseId] : null,
    () => getCaseConversationApi(productId, caseId),
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );
  const messages: ConversationMessage[] = conversationData?.data ?? [];

  // DEFERRED-24: fetch case row directly to get draft_reply and current status
  const { data: caseRow, mutate: mutateCase } = useSWR(
    productId && caseId ? ["case", productId, caseId] : null,
    () => getCaseApi(productId, caseId),
    { refreshInterval: 15_000, revalidateOnFocus: true }
  );

  const isAwaitingLead  = caseRow?.status === "awaiting-lead";
  const isEmailCase     = messages.length > 0 && !messages.some((m) => m.source_type === "chat");
  const isProcessingFailed = caseRow?.status === "processing-failed";

  const relativeUpdated = lineage
    ? (() => {
        // Use the latest node's occurredAt or fall back to now
        const times = lineage.nodes.map((n) => n.occurredAt).filter(Boolean);
        const latest = times.sort().at(-1);
        if (!latest) return null;
        try {
          return formatDistanceToNow(new Date(latest), { addSuffix: true });
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <AppLayout>
      {/* Back button */}
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-gray-400">Loading case lineage...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-6 w-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">Failed to load case lineage</p>
          <p className="mt-1 text-sm text-gray-500">{(error as Error).message}</p>
        </div>
      ) : !lineage ? null : (
        <div className="space-y-5">
          {/* ── Header card ── */}
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                {/* Title: email subject from signal > case_created metadata > fallback */}
                <h1 className="text-xl font-semibold text-gray-900 leading-snug">
                  {lineage.signal?.subject ||
                    (lineage.nodes.find((n) => n.type === "case_created")?.metadata?.subject as string | undefined) ||
                    `Case ${lineage.caseId}`}
                </h1>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Status from lineage.currentStatus cast as CaseStatus */}
                  <StatusBadge status={lineage.currentStatus as import("@/lib/types").CaseStatus} />

                  {/* Severity from triage node metadata if available */}
                  {(() => {
                    const triageNode = lineage.nodes.find((n) => n.type === "triage");
                    const sev = triageNode?.metadata?.severity;
                    if (typeof sev === "string") {
                      return (
                        <SeverityBadge severity={sev as import("@/lib/types").CaseSeverity} />
                      );
                    }
                    return null;
                  })()}

                  {/* Type from triage node metadata */}
                  {(() => {
                    const triageNode = lineage.nodes.find((n) => n.type === "triage");
                    const rawType = triageNode?.metadata?.type;
                    if (typeof rawType !== "string") return null;
                    const label = (
                      rawType === "user_request"  ? "Request"  :
                      rawType === "bug_report"    ? "Bug"      :
                      rawType === "outage_report" ? "Outage"   :
                      rawType === "user_feedback" ? "Feedback" :
                      rawType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                    );
                    return (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 ring-1 ring-inset ring-gray-200">
                        {label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-1">
                <code className="rounded bg-gray-100 px-2 py-1 text-xs font-mono text-gray-500 break-all">
                  {lineage.caseId}
                </code>
                {relativeUpdated && (
                  <span className="text-xs text-gray-400">Updated {relativeUpdated}</span>
                )}
              </div>
            </div>
          </div>

          {/* ── QE-05: Processing Failed panel ── */}
          {isProcessingFailed && (
            <ProcessingFailedPanel
              caseId={caseId}
              processingError={caseRow?.processing_error}
              onRetried={() => { mutate(); mutateCase(); }}
            />
          )}

          {/* ── Triage summary card ── */}
          {(() => {
            const triageNode = lineage.nodes.find((n) => n.type === "triage");
            const summary    = triageNode?.metadata?.summary;
            const confidence = triageNode?.metadata?.confidence;
            if (typeof summary !== "string" || !summary.trim()) return null;
            return (
              <div className="rounded-xl bg-violet-50 ring-1 ring-violet-100 shadow-sm px-4 py-3.5 flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">AI Triage Summary</p>
                    {typeof confidence === "number" && (
                      <span className="text-[10px] text-violet-400">{Math.round(confidence * 100)}% confidence</span>
                    )}
                  </div>
                  <p className="text-sm text-violet-900 leading-relaxed">{summary}</p>
                </div>
              </div>
            );
          })()}

          {/* ── Artifacts card (CR / GitHub Issue / PR) ── */}
          {lineage.changeRequests.length > 0 && (
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 px-4 py-3.5 space-y-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked Artifacts</p>
              {lineage.changeRequests.map((cr) => (
                <div key={cr.changeRequestId} className="flex flex-wrap items-center gap-2">
                  <a
                    href={`${basePath}/approvals/${cr.changeRequestId}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    CR · {cr.changeRequestId.slice(-8)}
                  </a>

                  {cr.githubIssueUrl && (
                    <a
                      href={cr.githubIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                      </svg>
                      Issue #{cr.githubIssueNumber}
                    </a>
                  )}

                  {cr.githubPrUrl && (
                    <a
                      href={cr.githubPrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                      </svg>
                      PR #{cr.githubPrNumber}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Signal card ── */}
          {lineage.signal && (
            <div className="rounded-xl bg-blue-50 ring-1 ring-blue-100 shadow-sm overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold text-blue-900">{lineage.signal.subject}</p>
                    <p className="text-xs text-blue-500">{lineage.signal.fromEmail}</p>
                  </div>
                  <p className="text-sm text-blue-700 leading-relaxed">
                    {signalExpanded || lineage.signal.body.length <= 200
                      ? lineage.signal.body
                      : `${lineage.signal.body.slice(0, 200)}…`}
                  </p>
                  {lineage.signal.body.length > 200 && (
                    <button
                      onClick={() => setSignalExpanded((v) => !v)}
                      className="text-xs font-medium text-blue-600 hover:underline focus:outline-none focus:underline"
                    >
                      {signalExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Live chat reply panel (chat channel cases only) ── */}
          {messages.some((m) => m.source_type === "chat") && (
            <ChatReplyPanel
              caseId={caseId}
              messages={messages}
              onReplySent={() => { mutate(); mutateConversation(); }}
            />
          )}

          {/* ── Email draft reply panel (DEFERRED-24) ── */}
          {/* Only shown when there is an actual draft to review; hidden once draft is cleared after sending */}
          {isAwaitingLead && isEmailCase && caseRow?.draft_reply && (
            <EmailReplyPanel
              caseId={caseId}
              draft={caseRow.draft_reply}
              onSent={() => { mutate(); mutateCase(); mutateConversation(); }}
            />
          )}

          {/* ── Conversation thread (only shown for non-chat cases with >1 message) ── */}
          {messages.length > 1 && !messages.some((m) => m.source_type === "chat") && (
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
              <button
                onClick={() => setConversationExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors focus:outline-none"
                aria-expanded={conversationExpanded}
              >
                <span className="text-sm font-medium text-gray-900">
                  Conversation thread ({messages.length} messages)
                </span>
                <svg
                  className={`h-4 w-4 text-gray-400 transition-transform ${conversationExpanded ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {conversationExpanded && (
                <div className="divide-y divide-gray-50 border-t border-gray-100">
                  {messages.map((msg) => (
                    <div
                      key={msg.signal_id}
                      className={`px-4 py-3 ${msg.direction === "outbound" ? "bg-gray-50/50" : ""}`}
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className={`text-xs font-semibold ${msg.direction === "outbound" ? "text-indigo-700" : "text-gray-700"}`}>
                          {msg.direction === "outbound" ? "NestFleet (reply)" : (msg.from_email ?? "User")}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {(() => { try { return formatDistanceToNow(new Date(msg.received_at), { addSuffix: true }); } catch { return ""; } })()}
                        </span>
                      </div>
                      {msg.subject && (
                        <p className="text-[11px] text-gray-500 mb-1">{msg.subject}</p>
                      )}
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {msg.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Lineage view toggle ── */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Case Lineage</h2>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => { setViewMode("timeline"); localStorage.setItem("nestfleet:lineage-view", "timeline"); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "timeline" ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                title="Timeline view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </button>
              <button
                onClick={() => { setViewMode("graph"); localStorage.setItem("nestfleet:lineage-view", "graph"); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${viewMode === "graph" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}
                title="Graph view"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Lineage content ── */}
          {viewMode === "timeline" ? (
            <LineageTimeline
              response={lineage}
              productId={productId}
              onActionComplete={() => mutate()}
            />
          ) : (
            <LineageGraph
              response={lineage}
              productId={productId}
              onActionComplete={() => mutate()}
            />
          )}

          {/* ── Cross-product identity links (BEF-20) ── */}
          {lineage.crossProductLinks.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
                Same reporter in other products
              </p>
              <ul className="space-y-2">
                {lineage.crossProductLinks.map((link) => (
                  <li key={link.caseId} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-gray-700 truncate">
                      {link.title ?? link.caseId}
                    </span>
                    <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {link.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
