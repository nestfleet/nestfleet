"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import { AppLayout } from "@/components/AppLayout";

import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { SearchInput } from "@/components/SearchInput";
import { getCasesApi, sendToChangeApi, resolveCaseApi, forwardToTeamApi } from "@/lib/api";
import { useProductIdWithFallback, useProductSafe } from "@/lib/product-context";
import type { CaseRow } from "@/lib/types";


// ─── Modal state ──────────────────────────────────────────────────────────────

type ModalMode = "send-to-change" | "resolve" | "forward-to-team";
type ForwardTeam = "sales" | "support" | "legal" | "billing";

const FORWARD_TEAM_LABELS: Record<ForwardTeam, string> = {
  sales:   "Sales",
  support: "Support",
  legal:   "Legal",
  billing: "Billing",
};

interface ActiveModal {
  mode: ModalMode;
  caseId: string;
  caseTitle: string;
  /** Pre-selected team derived from triage category (forward-to-team modal only) */
  suggestedTeam?: ForwardTeam;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Human label for the last event that sent this case to the lead queue */
function viaLabel(action: string | null | undefined): string {
  if (!action) return "Opened";
  switch (action) {
    case "case.created":           return "Opened";
    case "case.triaged":
    case "agent.triage_complete":  return "Triage done";
    case "case.routed":            return "Routed";
    case "case.escalated":         return "Escalated";
    case "agent.abstained":        return "Agent abstained";
    case "cr.rejected":             return "CR rejected";
    case "cr.completed":            return "CR completed";
    case "case.forwarded_to_team":  return "Forwarded to team";
    default:
      return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function personaLabel(persona: string | null | undefined): string | null {
  switch (persona) {
    case "frontline": return "Frontline";
    case "steward":   return "Steward";
    case "change":    return "Change";
    default:          return null;
  }
}

/** Categories that map to non-engineering team routing */
const NON_ENG_CATEGORIES = new Set(["sales_inquiry", "billing_inquiry"]);

/** Derive the suggested forward-to-team from triage output category */
function categoryToTeam(category: string | undefined): ForwardTeam | undefined {
  if (category === "sales_inquiry")   return "sales";
  if (category === "billing_inquiry") return "billing";
  return undefined;
}

/** Which action is most likely the right next step based on context */
function primaryAction(c: CaseRow): "route" | "resolve" | "forward" {
  // Forwarded cases are awaiting external team response — Lead's job is to resolve once they hear back
  if (c.last_event_action === "case.forwarded_to_team") return "resolve";
  if (c.last_event_action === "cr.rejected")            return "resolve";
  if (c.type === "user_feedback")                       return "resolve";
  const category = (c.triage_output?.category as string | undefined) ?? "";
  if (NON_ENG_CATEGORIES.has(category))                 return "forward";
  return "route";
}

const TERMINAL_STATUSES = new Set(["resolved", "closed"]);

// ─── Status badge for Live Chats tab ──────────────────────────────────────────

function ChatStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    "new":           { label: "New",          cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    "enriching":     { label: "Enriching",    cls: "bg-purple-50 text-purple-700 ring-purple-200" },
    "triaged":       { label: "Triaged",      cls: "bg-yellow-50 text-yellow-700 ring-yellow-200" },
    "awaiting-lead": { label: "Awaiting you", cls: "bg-orange-50 text-orange-700 ring-orange-200" },
    "in-resolution": { label: "In progress",  cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
    "awaiting-user": { label: "User reply",   cls: "bg-gray-50 text-gray-600 ring-gray-200" },
  };
  const info = map[status] ?? { label: status, cls: "bg-gray-50 text-gray-600 ring-gray-200" };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${info.cls}`}>
      {info.label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "lead-review" | "live-chats";

export default function QueuePage() {
  const productId = useProductIdWithFallback();
  const router = useRouter();
  const productCtx = useProductSafe();
  const basePath = productCtx ? `/p/${productCtx.product.slug}` : "";
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("lead-review");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Lead Review queue ────────────────────────────────────────────────────────
  const { data: leadData, error: leadError, isLoading: leadLoading, mutate: mutateLead } = useSWR(
    productId ? ["queue-awaiting-lead", productId] : null,
    () => getCasesApi(productId, { status: "awaiting-lead" }),
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  // ── Pending Handoff: in-resolution cases forwarded to an external team ───────
  const { data: handoffData, mutate: mutateHandoff } = useSWR(
    productId ? ["queue-pending-handoff", productId] : null,
    () => getCasesApi(productId, { status: "in-resolution" }),
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  // ── Live Chats ───────────────────────────────────────────────────────────────
  const { data: chatData, error: chatError, isLoading: chatLoading, mutate: mutateChat } = useSWR(
    productId ? ["queue-live-chats", productId] : null,
    () => getCasesApi(productId, { channel: "chat" }),
    { refreshInterval: 10_000, revalidateOnFocus: true }
  );

  const allLeadCases: CaseRow[] = (leadData?.data ?? []).filter((c) => !TERMINAL_STATUSES.has(c.status));
  const pendingHandoffCases: CaseRow[] = (handoffData?.data ?? []).filter(
    (c) => c.last_event_action === "case.forwarded_to_team",
  );
  const allChatCases: CaseRow[] = (chatData?.data ?? []).filter(
    (c) => !TERMINAL_STATUSES.has(c.status)
  );

  const q = searchQuery.trim().toLowerCase();
  const matchCase = (c: CaseRow) =>
    !q || c.title.toLowerCase().includes(q) || c.case_id.toLowerCase().includes(q);
  const filteredLeadCases    = allLeadCases.filter(matchCase);
  const filteredHandoffCases = pendingHandoffCases.filter(matchCase);
  const filteredChatCases    = allChatCases.filter(matchCase);

  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [resolution, setResolution] = useState("");
  const [forwardTeam, setForwardTeam] = useState<ForwardTeam | "">("");
  const [forwardNote, setForwardNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openSendToChange = (c: CaseRow) => {
    setActiveModal({ mode: "send-to-change", caseId: c.case_id, caseTitle: c.title });
  };

  const openResolve = (c: CaseRow) => {
    setResolution("");
    setActiveModal({ mode: "resolve", caseId: c.case_id, caseTitle: c.title });
  };

  const openForwardToTeam = (c: CaseRow) => {
    const category = (c.triage_output?.category as string | undefined) ?? "";
    const suggested = categoryToTeam(category);
    setForwardTeam(suggested ?? "");
    setForwardNote("");
    setActiveModal({
      mode: "forward-to-team",
      caseId: c.case_id,
      caseTitle: c.title,
      suggestedTeam: suggested,
    });
  };

  const closeModal = () => {
    if (!isSubmitting) setActiveModal(null);
  };

  const handleSendToChange = async () => {
    if (!activeModal) return;
    setIsSubmitting(true);
    try {
      await sendToChangeApi(productId, activeModal.caseId);
      toast("Sent to engineering", "success");
      setActiveModal(null);
      await mutateLead();
    } catch (err) {
      toast(`Failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async () => {
    if (!activeModal) return;
    if (resolution.trim().length < 5) {
      toast("Resolution note must be at least 5 characters", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await resolveCaseApi(productId, activeModal.caseId, resolution.trim());
      toast("Case resolved", "success");
      setActiveModal(null);
      await Promise.all([mutateLead(), mutateHandoff()]);
    } catch (err) {
      toast(`Failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForwardToTeam = async () => {
    if (!activeModal || !forwardTeam) return;
    if (forwardNote.trim().length < 10) {
      toast("Context note must be at least 10 characters", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await forwardToTeamApi(productId, activeModal.caseId, forwardTeam, forwardNote.trim());
      toast(`Forwarded to ${FORWARD_TEAM_LABELS[forwardTeam]}`, "success");
      setActiveModal(null);
      await mutateLead();
    } catch (err) {
      toast(`Failed: ${(err as Error).message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">.env.local</code> to load the queue.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Page header */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Queue</h1>
        </div>

        {/* Search */}
        <div className="flex items-center">
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search queue…" />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6" aria-label="Queue tabs">
            <button
              onClick={() => setActiveTab("lead-review")}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "lead-review"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Lead Review
              {(allLeadCases.length + pendingHandoffCases.length) > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-semibold text-indigo-700">
                  {allLeadCases.length + pendingHandoffCases.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("live-chats")}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "live-chats"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Live Chats
              {allChatCases.length > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-teal-100 px-1.5 text-[11px] font-semibold text-teal-700">
                  {allChatCases.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === "lead-review" ? (
          <LeadReviewPanel
            cases={filteredLeadCases}
            pendingHandoffCases={filteredHandoffCases}
            isLoading={leadLoading}
            error={leadError}
            basePath={basePath}
            onSendToChange={openSendToChange}
            onResolve={openResolve}
            onForward={openForwardToTeam}
            onViewCase={(c) => router.push(`${basePath}/cases/${c.case_id}`)}
          />
        ) : (
          <LiveChatsPanel
            cases={filteredChatCases}
            isLoading={chatLoading}
            error={chatError}
            basePath={basePath}
            onViewCase={(c) => router.push(`${basePath}/cases/${c.case_id}`)}
          />
        )}

        {/* Auto-refresh hint */}
        {activeTab === "lead-review" && !leadLoading && !leadError && (allLeadCases.length + pendingHandoffCases.length) > 0 && (
          <p className="text-xs text-gray-400 text-right">Auto-refreshes every 30s</p>
        )}
        {activeTab === "live-chats" && !chatLoading && !chatError && allChatCases.length > 0 && (
          <p className="text-xs text-gray-400 text-right">Auto-refreshes every 10s</p>
        )}
      </div>

      {/* ── Send to Change modal ── */}
      <Modal
        isOpen={activeModal?.mode === "send-to-change"}
        onClose={closeModal}
        title="Send to Engineering"
      >
        {activeModal?.mode === "send-to-change" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will create a change request and dispatch the Change Prep agent for:{" "}
              <span className="font-medium text-gray-900">{activeModal.caseTitle}</span>
            </p>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendToChange}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {isSubmitting && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                )}
                Send to Change
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Forward to Team modal ── */}
      <Modal
        isOpen={activeModal?.mode === "forward-to-team"}
        onClose={closeModal}
        title="Forward to Team"
      >
        {activeModal?.mode === "forward-to-team" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Forwarding:{" "}
              <span className="font-medium text-gray-900">{activeModal.caseTitle}</span>
            </p>

            {/* Team selector */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Team <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(FORWARD_TEAM_LABELS) as ForwardTeam[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForwardTeam(t)}
                    disabled={isSubmitting}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left ${
                      forwardTeam === t
                        ? "border-amber-500 bg-amber-50 text-amber-800 ring-1 ring-amber-400"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    } disabled:opacity-50`}
                  >
                    {FORWARD_TEAM_LABELS[t]}
                  </button>
                ))}
              </div>
              {activeModal.suggestedTeam && (
                <p className="text-[11px] text-amber-600">
                  Suggested based on triage category.
                </p>
              )}
            </div>

            {/* Context note */}
            <div className="space-y-1.5">
              <label htmlFor="forward-note" className="block text-sm font-medium text-gray-700">
                Context for the team <span className="text-red-500">*</span>
              </label>
              <textarea
                id="forward-note"
                rows={3}
                value={forwardNote}
                onChange={(e) => setForwardNote(e.target.value)}
                placeholder="Key details — customer name, org size, requirements, urgency, follow-up owner…"
                disabled={isSubmitting}
                required
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-gray-50 resize-none"
              />
              {forwardNote.trim().length < 10 && (
                <p className="text-xs text-gray-400">
                  {forwardNote.trim().length === 0
                    ? "A context note is required."
                    : `${10 - forwardNote.trim().length} more character${10 - forwardNote.trim().length === 1 ? "" : "s"} needed.`}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleForwardToTeam}
                disabled={isSubmitting || !forwardTeam || forwardNote.trim().length < 10}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {isSubmitting && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                )}
                Forward
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Resolve modal ── */}
      <Modal
        isOpen={activeModal?.mode === "resolve"}
        onClose={closeModal}
        title="Resolve Case"
      >
        {activeModal?.mode === "resolve" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Resolving:{" "}
              <span className="font-medium text-gray-900">{activeModal.caseTitle}</span>
            </p>

            <div className="space-y-1.5">
              <label htmlFor="resolve-note" className="block text-sm font-medium text-gray-700">
                Resolution note <span className="text-red-500">*</span>
              </label>
              <textarea
                id="resolve-note"
                rows={3}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Explain why no engineering change is needed..."
                disabled={isSubmitting}
                required
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-gray-50 resize-none"
              />
              {resolution.trim().length < 5 && (
                <p className="text-xs text-gray-400">
                  {resolution.trim().length === 0
                    ? "A resolution note is required."
                    : `${5 - resolution.trim().length} more character${5 - resolution.trim().length === 1 ? "" : "s"} needed.`}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={isSubmitting || resolution.trim().length < 5}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {isSubmitting && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                )}
                Resolve
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

// ─── Lead Review panel ────────────────────────────────────────────────────────

interface LeadReviewPanelProps {
  cases:                CaseRow[];
  pendingHandoffCases:  CaseRow[];
  isLoading:            boolean;
  error:                unknown;
  basePath:             string;
  onSendToChange:       (c: CaseRow) => void;
  onResolve:            (c: CaseRow) => void;
  onForward:            (c: CaseRow) => void;
  onViewCase:           (c: CaseRow) => void;
}

function LeadReviewPanel({ cases, pendingHandoffCases, isLoading, error, onSendToChange, onResolve, onForward, onViewCase }: LeadReviewPanelProps) {
  const total = cases.length + pendingHandoffCases.length;

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
      {isLoading && total === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-gray-400">Loading queue...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900">Failed to load queue</p>
          <p className="mt-1 text-xs text-gray-500">{(error as Error).message}</p>
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
            <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900">Queue is clear</p>
          <p className="mt-1 text-xs text-gray-500">No cases awaiting lead review.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Case</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Via</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Waiting</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cases.map((c) => (
                <QueueRow
                  key={c.case_id}
                  c={c}
                  onViewCase={() => onViewCase(c)}
                  onSendToChange={() => onSendToChange(c)}
                  onResolve={() => onResolve(c)}
                  onForward={() => onForward(c)}
                />
              ))}

              {/* ── Pending Handoff section ── */}
              {pendingHandoffCases.length > 0 && (
                <>
                  <tr>
                    <td colSpan={4} className="px-4 py-2 bg-amber-50/60 border-t border-amber-100">
                      <div className="flex items-center gap-2">
                        <svg className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
                        </svg>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          Pending Handoff — awaiting response from external team
                        </span>
                        <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-200 px-1 text-[10px] font-bold text-amber-800">
                          {pendingHandoffCases.length}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {pendingHandoffCases.map((c) => (
                    <QueueRow
                      key={c.case_id}
                      c={c}
                      onViewCase={() => onViewCase(c)}
                      onSendToChange={() => onSendToChange(c)}
                      onResolve={() => onResolve(c)}
                      onForward={() => onForward(c)}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Live Chats panel ─────────────────────────────────────────────────────────

interface LiveChatsPanelProps {
  cases:      CaseRow[];
  isLoading:  boolean;
  error:      unknown;
  basePath:   string;
  onViewCase: (c: CaseRow) => void;
}

function LiveChatsPanel({ cases, isLoading, error, onViewCase }: LiveChatsPanelProps) {
  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
      {isLoading && cases.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
            <p className="text-sm text-gray-400">Loading chats...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <p className="text-sm font-medium text-gray-900">Failed to load chats</p>
          <p className="mt-1 text-xs text-gray-500">{(error as Error).message}</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
            <svg className="h-6 w-6 text-teal-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900">No active chats</p>
          <p className="mt-1 text-xs text-gray-500">New chat sessions will appear here in real time.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Case</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Started</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cases.map((c) => (
                <LiveChatRow key={c.case_id} c={c} onOpen={() => onViewCase(c)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── LiveChatRow sub-component ────────────────────────────────────────────────

interface LiveChatRowProps {
  c:      CaseRow;
  onOpen: () => void;
}

function LiveChatRow({ c, onOpen }: LiveChatRowProps) {
  const age = (() => {
    try { return formatDistanceToNow(new Date(c.created_at), { addSuffix: true }); }
    catch { return c.created_at; }
  })();
  const shortId = c.case_id.length > 17 ? c.case_id.slice(0, 16) + "…" : c.case_id;
  const type    = typeLabel(c.type);
  const subtitleTokens = [shortId, type].filter(Boolean) as string[];

  return (
    <tr className="hover:bg-gray-50/80 transition-colors">
      {/* Case: title + subtitle (ID · type) */}
      <td className="px-4 py-3 max-w-sm">
        <button
          onClick={onOpen}
          className="truncate font-medium text-gray-900 hover:text-teal-600 transition-colors text-left block focus:outline-none focus:underline"
        >
          {c.title}
        </button>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
          {subtitleTokens.map((token, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-200">·</span>}
              <span className={i === 0 ? "font-mono" : ""}>{token}</span>
            </span>
          ))}
        </div>
      </td>

      {/* Status badge */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <ChatStatusBadge status={c.status} />
      </td>

      {/* Started */}
      <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
        <p className="text-xs text-gray-500">{age}</p>
      </td>

      {/* Reply button */}
      <td className="px-4 py-3">
        <div className="flex justify-end">
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            Open chat
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── QueueRow sub-component ───────────────────────────────────────────────────

interface QueueRowProps {
  c: CaseRow;
  onViewCase: () => void;
  onSendToChange: () => void;
  onResolve: () => void;
  onForward: () => void;
}

function QueueRow({ c, onViewCase, onSendToChange, onResolve, onForward }: QueueRowProps) {
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const age = (() => {
    try { return formatDistanceToNow(new Date(c.created_at), { addSuffix: true }); }
    catch { return c.created_at; }
  })();

  const shortId  = c.case_id.length > 17 ? c.case_id.slice(0, 16) + "…" : c.case_id;
  const primary  = primaryAction(c);
  const via      = viaLabel(c.last_event_action);
  const persona  = personaLabel(c.current_persona);
  const type     = typeLabel(c.type);
  const severity = c.severity ? c.severity.charAt(0).toUpperCase() + c.severity.slice(1) : null;
  const subtitleTokens = [shortId, type, severity].filter(Boolean) as string[];

  // Colour scheme keyed by primary action
  const theme = {
    route:   { ring: "ring-indigo-200",  bg: "bg-indigo-50",  text: "text-indigo-700",  hover: "hover:bg-indigo-100",  div: "border-indigo-200",  chev: "text-indigo-400 hover:text-indigo-600"  },
    resolve: { ring: "ring-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", hover: "hover:bg-emerald-100", div: "border-emerald-200", chev: "text-emerald-400 hover:text-emerald-600" },
    forward: { ring: "ring-amber-200",   bg: "bg-amber-50",   text: "text-amber-700",   hover: "hover:bg-amber-100",   div: "border-amber-200",   chev: "text-amber-400 hover:text-amber-600"   },
  }[primary];

  const primaryLabel = primary === "route" ? "Route to Eng" : primary === "forward" ? "Forward to Team" : "Resolve";
  const primaryHandler = primary === "route" ? onSendToChange : primary === "forward" ? onForward : onResolve;

  return (
    <tr className="hover:bg-gray-50/80 transition-colors">

      {/* Case: title + subtitle (ID · type · severity) */}
      <td className="px-4 py-3 max-w-sm">
        <button
          onClick={onViewCase}
          className="truncate font-medium text-gray-900 hover:text-indigo-600 transition-colors text-left block focus:outline-none focus:underline"
        >
          {c.title}
        </button>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
          {subtitleTokens.map((token, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-200">·</span>}
              <span className={i === 0 ? "font-mono" : ""}>{token}</span>
            </span>
          ))}
        </div>
      </td>

      {/* Via: last event → persona */}
      <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">
        <p className="text-xs text-gray-700">{via}</p>
        {persona && <p className="text-[11px] text-gray-400 mt-0.5">{persona}</p>}
      </td>

      {/* Age */}
      <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
        <p className="text-xs text-gray-500">{age}</p>
      </td>

      {/* Action — context-aware split button */}
      <td className="px-4 py-3">
        <div ref={dropRef} className="relative flex justify-end">

          {/* Split button */}
          <div className={`inline-flex rounded-md ring-1 ring-inset ${theme.ring}`}>
            <button
              onClick={primaryHandler}
              className={`rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors ${theme.bg} ${theme.text} ${theme.hover}`}
            >
              {primaryLabel}
            </button>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="More actions"
              className={`rounded-r-md border-l px-2 py-1.5 transition-colors ${theme.bg} ${theme.div} ${theme.chev} ${theme.hover}`}
            >
              <svg
                className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          </div>

          {/* Dropdown — always offers the full set of alternate actions */}
          {open && (
            <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5">
              {primary !== "route" && (
                <button
                  onClick={() => { onSendToChange(); setOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                  Route to Engineering
                </button>
              )}
              {primary !== "forward" && (
                <button
                  onClick={() => { onForward(); setOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12zm0 0h7.5" />
                  </svg>
                  Forward to Team
                </button>
              )}
              {primary !== "resolve" && (
                <button
                  onClick={() => { onResolve(); setOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Resolve directly
                </button>
              )}
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => { onViewCase(); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m0 0-6.75-6.75M20.25 12l-6.75 6.75" />
                </svg>
                View lineage
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
