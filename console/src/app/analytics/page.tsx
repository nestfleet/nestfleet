"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppLayout } from "@/components/AppLayout";
import {
  getAnalyticsOverviewApi,
  getAnalyticsCostApi,
  getAnalyticsAgentsApi,
  getAnalyticsCasesApi,
  getAnalyticsMemoryApi,
  getAnalyticsOperationsApi,
  type AnalyticsOverview,
  type AnalyticsCost,
  type AnalyticsAgents,
  type AnalyticsCases,
  type AnalyticsMemory,
  type AnalyticsOperations,
} from "@/lib/api";
import { useLicense, type ProductTier } from "@/lib/useLicense";
import { useProductIdWithFallback } from "@/lib/product-context";
import { TierGate } from "@/components/TierGate";


type Tab = "overview" | "cost" | "agents" | "cases" | "memory" | "operations";

/** Minimum tier required to access each tab's data */
const TAB_MIN_TIER: Record<Tab, ProductTier> = {
  overview:   "community",
  cost:       "starter",
  agents:     "growth",
  cases:      "growth",
  memory:     "growth",
  operations: "growth",
};

const TABS: { key: Tab; label: string }[] = [
  { key: "overview",   label: "Overview" },
  { key: "cost",       label: "Cost & Tokens" },
  { key: "agents",     label: "Agent Performance" },
  { key: "cases",      label: "Cases" },
  { key: "memory",     label: "Memory Health" },
  { key: "operations", label: "Operations" },
];

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "indigo" }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
    gray: "bg-gray-50 text-gray-700 ring-gray-200",
  };
  return (
    <div className={`rounded-xl p-4 ring-1 ${colorMap[color] ?? colorMap.gray}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

// ── Bar ──────────────────────────────────────────────────────────────────────

function Bar({ label, value, max, color = "bg-indigo-500" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-32 truncate text-gray-600 font-medium">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-gray-500 font-mono">{value.toLocaleString()}</span>
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: AnalyticsOverview }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Cases" value={data.cases.total} sub={`${data.cases.open} open`} />
        <StatCard label="AI Resolved" value={data.cases.aiResolved} sub={`${data.cases.automationRate}% automation`} color="emerald" />
        <StatCard label="Total Tokens" value={formatNumber(data.tokens.total)} sub={`${data.tokens.agentCalls} agent calls`} color="violet" />
        <StatCard label="Est. Cost (USD)" value={`$${data.tokens.estimatedCostUsd.toFixed(4)}`} sub={`Period: ${data.period}`} color="amber" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Resolved" value={data.cases.resolved} color="emerald" />
        <StatCard label="Closed" value={data.cases.closed} color="gray" />
        <StatCard label="Change Requests" value={data.changeRequests} color="indigo" />
        <StatCard label="Notifications Sent" value={data.notifications} color="violet" />
      </div>

      <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Token Distribution</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Input Tokens</p>
            <p className="text-lg font-bold text-indigo-700">{formatNumber(data.tokens.input)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Output Tokens</p>
            <p className="text-lg font-bold text-violet-700">{formatNumber(data.tokens.output)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cost tab ─────────────────────────────────────────────────────────────────

function CostTab({ data }: { data: AnalyticsCost }) {
  return (
    <div className="space-y-5">
      {/* Monthly totals */}
      {data.monthlyTotals.map((m) => (
        <div key={m.month} className="rounded-xl bg-white p-4 ring-1 ring-black/5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">{m.month}</h3>
            <span className="text-lg font-bold text-amber-700">${m.estimatedCostUsd.toFixed(4)}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-gray-500">Input</span><br /><strong>{formatNumber(m.inputTokens)}</strong></div>
            <div><span className="text-gray-500">Output</span><br /><strong>{formatNumber(m.outputTokens)}</strong></div>
            <div><span className="text-gray-500">Calls</span><br /><strong>{m.agentCalls}</strong></div>
          </div>
        </div>
      ))}

      {/* Breakdown by action type */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Cost by Agent</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Agent</th>
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium text-right">Calls</th>
                <th className="pb-2 font-medium text-right">Tokens</th>
                <th className="pb-2 font-medium text-right">Avg/Call</th>
                <th className="pb-2 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.breakdown.map((r, i) => (
                <tr key={i}>
                  <td className="py-1.5 font-medium text-gray-700">{formatAgentName(r.actionType)}</td>
                  <td className="py-1.5 text-gray-500 font-mono">{r.modelId.length > 20 ? r.modelId.slice(0, 20) + "…" : r.modelId}</td>
                  <td className="py-1.5 text-right">{r.callCount}</td>
                  <td className="py-1.5 text-right font-mono">{formatNumber(r.totalTokens)}</td>
                  <td className="py-1.5 text-right font-mono">{formatNumber(r.avgTokensPerCall)}</td>
                  <td className="py-1.5 text-right font-bold text-amber-700">${r.estimatedCostUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Agents tab ───────────────────────────────────────────────────────────────

function AgentsTab({ data }: { data: AnalyticsAgents }) {
  const agents = Object.entries(data.agents);
  const maxRuns = Math.max(...agents.map(([, a]) => a.totalRuns), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map(([name, a]) => (
          <div key={name} className="rounded-xl bg-white p-4 ring-1 ring-black/5">
            <div className="flex items-baseline justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">{formatAgentName(name)}</h4>
              <span className={`text-xs font-bold ${a.successRate >= 80 ? "text-emerald-600" : a.successRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                {a.successRate}% success
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs text-center mb-3">
              <div><span className="text-gray-500">Runs</span><br /><strong>{a.totalRuns}</strong></div>
              <div><span className="text-emerald-500">OK</span><br /><strong>{a.successCount}</strong></div>
              <div><span className="text-red-500">Error</span><br /><strong>{a.errorCount}</strong></div>
              <div><span className="text-amber-500">Abstain</span><br /><strong>{a.abstainCount}</strong></div>
            </div>
            <Bar label="Run volume" value={a.totalRuns} max={maxRuns} color="bg-indigo-400" />
            <div className="mt-2 text-xs text-gray-500">
              Avg duration: {a.avgDurationMs > 0 ? `${(a.avgDurationMs / 1000).toFixed(1)}s` : "—"} · Tokens: {formatNumber(a.totalInputTokens + a.totalOutputTokens)}
            </div>
          </div>
        ))}
      </div>

      {/* Recent errors */}
      {data.recentErrors.length > 0 && (
        <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Errors</h3>
          <div className="space-y-2">
            {data.recentErrors.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 mt-0.5 h-1.5 w-1.5 rounded-full bg-red-400" />
                <div>
                  <span className="font-medium text-gray-700">{formatAgentName(e.actionType)}</span>
                  <span className="text-gray-400 mx-1">·</span>
                  <span className="text-red-600">{e.errorCode ?? "UNKNOWN"}</span>
                  {e.errorMessage && <p className="text-gray-500 mt-0.5 truncate max-w-md">{e.errorMessage}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cases tab ────────────────────────────────────────────────────────────────

function CasesTab({ data }: { data: AnalyticsCases }) {
  const maxStatus = Math.max(...data.byStatus.map((s) => s.count), 1);
  const maxType = Math.max(...data.byType.map((t) => t.count), 1);

  return (
    <div className="space-y-5">
      {data.avgResolutionHours != null && (
        <StatCard label="Avg Resolution Time" value={`${data.avgResolutionHours}h`} sub="from creation to resolved" color="emerald" />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">By Status</h3>
          <div className="space-y-2">
            {data.byStatus.map((s) => (
              <Bar key={s.status} label={s.status} value={s.count} max={maxStatus} color="bg-indigo-400" />
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">By Type</h3>
          <div className="space-y-2">
            {data.byType.map((t) => (
              <Bar key={t.type} label={t.type} value={t.count} max={maxType} color="bg-violet-400" />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">By Severity</h3>
        <div className="flex gap-3">
          {data.bySeverity.map((s) => {
            const colorMap: Record<string, string> = {
              critical: "bg-red-100 text-red-700",
              high: "bg-orange-100 text-orange-700",
              normal: "bg-blue-100 text-blue-700",
              low: "bg-gray-100 text-gray-600",
            };
            return (
              <div key={s.severity} className={`rounded-lg px-3 py-2 text-center ${colorMap[s.severity] ?? "bg-gray-100 text-gray-600"}`}>
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-xs">{s.severity}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily volume */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Volume (30 days)</h3>
        <div className="flex items-end gap-px h-24">
          {data.daily.map((d) => {
            const maxDaily = Math.max(...data.daily.map((x) => Math.max(x.created, x.resolved)), 1);
            const hCreated = Math.max((d.created / maxDaily) * 100, d.created > 0 ? 8 : 0);
            const hResolved = Math.max((d.resolved / maxDaily) * 100, d.resolved > 0 ? 8 : 0);
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-px" title={`${d.day}: ${d.created} created, ${d.resolved} resolved`}>
                <div className="w-full bg-indigo-300 rounded-t" style={{ height: `${hCreated}%` }} />
                <div className="w-full bg-emerald-300 rounded-b" style={{ height: `${hResolved}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-gray-400">
          <span>{data.daily[0]?.day?.slice(5) ?? ""}</span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-indigo-300 rounded" /> created
            <span className="inline-block h-2 w-2 bg-emerald-300 rounded" /> resolved
          </span>
          <span>{data.daily[data.daily.length - 1]?.day?.slice(5) ?? ""}</span>
        </div>
      </div>
    </div>
  );
}

// ── Memory tab ───────────────────────────────────────────────────────────────

function MemoryTab({ data }: { data: AnalyticsMemory }) {
  const maxSource = Math.max(...data.bySourceType.map((s) => s.count), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Chunks" value={formatNumber(data.totalChunks)} />
        <StatCard label="Sources" value={data.totalSources} color="violet" />
        <StatCard label="Embedding Coverage" value={`${data.embeddingCoverage}%`} color={data.embeddingCoverage > 80 ? "emerald" : "amber"} />
        <StatCard label="Conflicts" value={data.conflictChunks} color={data.conflictChunks > 0 ? "red" : "emerald"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tier Distribution</h3>
          <div className="space-y-2">
            <Bar label="T1 (docs)" value={data.tierDistribution.t1} max={data.totalChunks} color="bg-indigo-500" />
            <Bar label="T2 (issues)" value={data.tierDistribution.t2} max={data.totalChunks} color="bg-violet-500" />
            <Bar label="T3 (history)" value={data.tierDistribution.t3} max={data.totalChunks} color="bg-gray-400" />
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">By Source Type</h3>
          <div className="space-y-2">
            {data.bySourceType.map((s) => (
              <Bar key={s.sourceType} label={s.sourceType} value={s.count} max={maxSource} color="bg-emerald-400" />
            ))}
          </div>
        </div>
      </div>

      {data.avgFreshness != null && (
        <StatCard label="Avg Freshness Score" value={data.avgFreshness.toFixed(2)} sub="1.0 = freshest" color="emerald" />
      )}
    </div>
  );
}

// ── Operations tab ───────────────────────────────────────────────────────────

function OperationsTab({ data }: { data: AnalyticsOperations }) {
  return (
    <div className="space-y-5">
      {/* KPI cards row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Avg Approval Response"
          value={data.approvalResponseTime.avgHours != null ? `${data.approvalResponseTime.avgHours}h` : "—"}
          sub="from request to decision"
          color="indigo"
        />
        <StatCard
          label="Queue Depth"
          value={data.queue.currentDepth}
          sub="CRs awaiting approval now"
          color={data.queue.currentDepth > 5 ? "amber" : "emerald"}
        />
        <StatCard
          label="Rejection Rate"
          value={`${data.rejectionRate.rate}%`}
          sub={`${data.rejectionRate.rejected} rejected / ${data.rejectionRate.total} decisions`}
          color={data.rejectionRate.rate > 30 ? "red" : "emerald"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Manual Triage Rate"
          value={`${data.manualTriage.rate}%`}
          sub={`${data.manualTriage.manual} manual / ${data.manualTriage.total} total`}
          color={data.manualTriage.rate > 20 ? "amber" : "emerald"}
        />
        <StatCard
          label="Escalation Rate"
          value={`${data.escalation.rate}%`}
          sub={`${data.escalation.escalated} escalated / ${data.escalation.totalCases} cases`}
          color="violet"
        />
        <StatCard
          label="First Human Response"
          value={data.firstHumanResponseTime.avgHours != null ? `${data.firstHumanResponseTime.avgHours}h` : "—"}
          sub="after AI escalation"
          color="indigo"
        />
      </div>

      {/* Queue flow chart (30 days) */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-black/5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Approval Queue Flow (30 days)</h3>
        <div className="flex items-end gap-px h-24">
          {data.queue.daily.map((d) => {
            const maxDaily = Math.max(...data.queue.daily.map((x) => Math.max(x.requested, x.acted)), 1);
            const hReq = Math.max((d.requested / maxDaily) * 100, d.requested > 0 ? 8 : 0);
            const hAct = Math.max((d.acted / maxDaily) * 100, d.acted > 0 ? 8 : 0);
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-px" title={`${d.day}: ${d.requested} requested, ${d.acted} acted`}>
                <div className="w-full bg-amber-300 rounded-t" style={{ height: `${hReq}%` }} />
                <div className="w-full bg-emerald-300 rounded-b" style={{ height: `${hAct}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-gray-400">
          <span>{data.queue.daily[0]?.day?.slice(5) ?? ""}</span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-amber-300 rounded" /> requested
            <span className="inline-block h-2 w-2 bg-emerald-300 rounded" /> acted
          </span>
          <span>{data.queue.daily[data.queue.daily.length - 1]?.day?.slice(5) ?? ""}</span>
        </div>
      </div>

      {/* Interpretation guide */}
      <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Reading Guide</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
          <div><strong>High rejection rate</strong> — AI may be producing low-quality CRs, or approval criteria may be too strict.</div>
          <div><strong>High manual triage</strong> — AI triage is being overridden frequently. Review triage agent accuracy.</div>
          <div><strong>Growing queue depth</strong> — Leads are not keeping up with incoming CRs. Consider adding reviewers.</div>
          <div><strong>Slow first response</strong> — Cases sit in awaiting-lead too long. Review lead notification settings.</div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatAgentName(actionType: string): string {
  const map: Record<string, string> = {
    triage: "Triage",
    auto_reply: "Auto-Reply",
    known_issue_match: "Known Issue Match",
    change_prep: "Change Prep",
    pr_draft_prep: "PR Draft Prep",
    outage_routing: "Outage Routing",
  };
  return map[actionType] ?? actionType;
}

// ── Page ─────────────────────────────────────────────────────────────────────

const TAB_FEATURE_NAME: Record<Tab, string> = {
  overview:   "Analytics Overview",
  cost:       "Cost & Token Analytics",
  agents:     "Agent Performance Analytics",
  cases:      "Case Analytics",
  memory:     "Memory Health Analytics",
  operations: "Operations Analytics",
};

const TIER_BADGE: Record<ProductTier, string> = {
  community: "",
  starter:   "Starter+",
  growth:    "Growth+",
  scale:     "Scale",
};

export default function AnalyticsPage() {
  const productId = useProductIdWithFallback();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { tier, tierAtLeast, isLoading: licenseLoading } = useLicense();

  const { data: overviewData } = useSWR(
    productId ? ["analytics-overview", productId] : null,
    () => getAnalyticsOverviewApi(productId),
    { refreshInterval: 60_000 },
  );
  const { data: costData } = useSWR(
    activeTab === "cost" && productId && tierAtLeast("starter") ? ["analytics-cost", productId] : null,
    () => getAnalyticsCostApi(productId),
  );
  const { data: agentsData } = useSWR(
    activeTab === "agents" && productId && tierAtLeast("growth") ? ["analytics-agents", productId] : null,
    () => getAnalyticsAgentsApi(productId),
  );
  const { data: casesData } = useSWR(
    activeTab === "cases" && productId && tierAtLeast("growth") ? ["analytics-cases", productId] : null,
    () => getAnalyticsCasesApi(productId),
  );
  const { data: memoryData } = useSWR(
    activeTab === "memory" && productId && tierAtLeast("growth") ? ["analytics-memory", productId] : null,
    () => getAnalyticsMemoryApi(productId),
  );
  const { data: operationsData } = useSWR(
    activeTab === "operations" && productId && tierAtLeast("growth") ? ["analytics-operations", productId] : null,
    () => getAnalyticsOperationsApi(productId),
  );

  return (
    <AppLayout>
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500">Cost, performance, and operational metrics</p>
          </div>
          {!licenseLoading && tier && (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium capitalize text-indigo-700 ring-1 ring-indigo-200">
              {tier} plan
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-px">
          {TABS.map((t) => {
            const minTier = TAB_MIN_TIER[t.key];
            const locked = !tierAtLeast(minTier);
            const badge = TIER_BADGE[minTier];

            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === t.key
                    ? "bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600"
                    : locked
                    ? "text-gray-400 hover:text-gray-500 hover:bg-gray-50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {t.label}
                {locked && badge && (
                  <span className="relative -top-1.5 text-[9px] font-semibold bg-amber-100 text-amber-700 rounded px-1 py-0.5 leading-none">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="py-2">
          {activeTab === "overview" && (
            overviewData?.data ? <OverviewTab data={overviewData.data} /> : <Loading />
          )}
          {activeTab === "cost" && (
            <TierGate currentTier={tier} requiredTier="starter" featureName={TAB_FEATURE_NAME.cost}>
              {costData?.data ? <CostTab data={costData.data} /> : <Loading />}
            </TierGate>
          )}
          {activeTab === "agents" && (
            <TierGate currentTier={tier} requiredTier="growth" featureName={TAB_FEATURE_NAME.agents}>
              {agentsData?.data ? <AgentsTab data={agentsData.data} /> : <Loading />}
            </TierGate>
          )}
          {activeTab === "cases" && (
            <TierGate currentTier={tier} requiredTier="growth" featureName={TAB_FEATURE_NAME.cases}>
              {casesData?.data ? <CasesTab data={casesData.data} /> : <Loading />}
            </TierGate>
          )}
          {activeTab === "memory" && (
            <TierGate currentTier={tier} requiredTier="growth" featureName={TAB_FEATURE_NAME.memory}>
              {memoryData?.data ? <MemoryTab data={memoryData.data} /> : <Loading />}
            </TierGate>
          )}
          {activeTab === "operations" && (
            <TierGate currentTier={tier} requiredTier="growth" featureName={TAB_FEATURE_NAME.operations}>
              {operationsData?.data ? <OperationsTab data={operationsData.data} /> : <Loading />}
            </TierGate>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
    </div>
  );
}
