// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Cases & Triage — NestFleet Docs",
  description: "Understand NestFleet cases: lifecycle, severity, confidence scores, and the triage agent.",
}

export default function CasesPage() {
  return (
    <DocsLayout
      prev={{ label: "Upgrading", href: "/docs/self-hosting/upgrading" }}
      next={{ label: "AI Auto-Reply", href: "/docs/user-guide/auto-reply" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Cases & Triage
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        A <strong>Case</strong> is the central unit of work in NestFleet. Every signal that arrives
        — an email, a Telegram message, a GitHub issue, a webhook event — is normalised into a case
        before any AI processing occurs. This normalisation ensures consistent triage, routing, and
        audit regardless of where the signal originated.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">What is a Case?</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        A case captures the essential information from a customer or user signal:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Source channel</strong> — where it arrived (email, Telegram, GitHub, webhook)</li>
        <li><strong>Raw content</strong> — the original message text, preserved for the audit log</li>
        <li><strong>Type</strong> — classified by the triage agent (see below)</li>
        <li><strong>Severity</strong> — P0 through P4, assigned by the triage agent based on urgency signals</li>
        <li><strong>Confidence</strong> — how certain the triage agent is about its classification</li>
        <li><strong>Status</strong> — where the case is in its lifecycle</li>
        <li><strong>Product</strong> — which product this case belongs to</li>
        <li><strong>Assignee</strong> — the team member responsible for the case (optional)</li>
        <li><strong>Notes</strong> — internal team notes added during investigation</li>
        <li><strong>Linked known issues and change requests</strong></li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Case lifecycle</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Cases move through a defined set of states. Transitions are logged to the audit trail with
        the actor (user or system) and timestamp.
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[160px]">State</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["new", "Just arrived. The triage job has been enqueued but has not yet run."],
            ["triaged", "The triage agent has completed. Severity, type, and confidence have been assigned. The case is waiting to be routed."],
            ["awaiting-lead", "Triage confidence was below the auto-reply threshold, or the case was escalated. A human lead needs to review."],
            ["open", "Acknowledged and actively being worked on by the team."],
            ["auto-resolved", "The triage agent determined the case matches a known issue and sent an auto-reply. Pending human confirmation."],
            ["closed", "Resolved and closed by a team member. Can be reopened if the customer replies."],
          ].map(([state, desc]) => (
            <tr key={state}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700 bg-indigo-50">{state}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Severity badges (P0 – P4)</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The triage agent assigns a severity based on urgency signals in the case content —
        words like &quot;down&quot;, &quot;broken&quot;, &quot;urgent&quot;, and &quot;production&quot; push severity higher.
        Operators can override the AI assignment from the case detail view.
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[60px]">Level</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[120px]">Name</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Definition</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Typical response target</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["P0", "Critical", "Active outage or data loss. Revenue-impacting, all users affected.", "Immediate — escalate now"],
            ["P1", "High", "Major feature broken, significant subset of users affected, no workaround.", "Within 1 hour"],
            ["P2", "Medium", "Important feature degraded, workaround exists, or a subset of users affected.", "Within 4 hours"],
            ["P3", "Low", "Minor issue, cosmetic bug, or inconvenience. Most feature requests.", "Within 1 business day"],
            ["P4", "Negligible", "Nice-to-have, typos, documentation issues, speculative ideas.", "Best-effort"],
          ].map(([level, name, def, target]) => (
            <tr key={level}>
              <td className="px-3 py-2 border border-gray-200 align-top font-bold text-gray-900">{level}</td>
              <td className="px-3 py-2 border border-gray-200 align-top font-medium text-gray-700">{name}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{def}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        P0 and P1 cases trigger immediate Telegram and/or Slack alerts to the configured team channels
        (see <a href="/docs/user-guide/notifications" className="text-indigo-600 hover:underline">Notifications</a>).
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Case types</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The triage agent classifies each case into one of the following types. Type influences routing
        — a <code className="bg-gray-100 px-1 rounded-sm text-xs">feature-request</code> is routed to the Product Lead queue;
        an <code className="bg-gray-100 px-1 rounded-sm text-xs">outage</code> is escalated immediately regardless of confidence.
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">bug</code> — A defect in existing behaviour</li>
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">feature-request</code> — A request for new or changed functionality</li>
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">question</code> — A &quot;how do I&quot; or &quot;does it support&quot; inquiry</li>
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">outage</code> — A reported system-wide or widespread failure</li>
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">sales-inquiry</code> — Pre-sales or pricing question</li>
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">feedback</code> — General praise, criticism, or suggestion</li>
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">security</code> — Potential security vulnerability report</li>
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">spam</code> — Automated or irrelevant noise</li>
        <li><code className="bg-gray-100 px-1 rounded-sm text-xs">other</code> — Catch-all for unclassified signals</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Confidence score</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The confidence score (0.0 – 1.0) represents the triage agent&apos;s certainty about its classification.
        It is derived from the LLM output and calibrated against the agent&apos;s reasoning trace.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Confidence affects routing in two ways:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>
          <strong>Auto-reply gate</strong> — If confidence meets or exceeds the product&apos;s configured threshold
          (default: 0.80), and a matching known issue is found, NestFleet proceeds to auto-reply.
          Below the threshold, the case moves to <code className="bg-gray-100 px-1 rounded-sm text-xs">awaiting-lead</code>.
        </li>
        <li>
          <strong>Visual indicator</strong> — In the queue view, cases with confidence below 0.60 display
          a yellow badge to signal they need human review even if they are not yet escalated.
        </li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        You can adjust the auto-reply confidence threshold per product in Settings → Triage.
        See <a href="/docs/user-guide/auto-reply" className="text-indigo-600 hover:underline">AI Auto-Reply</a> for details.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">The triage agent</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        When a new case arrives, a <code className="bg-gray-100 px-1 rounded-sm text-xs">triage</code> job is enqueued via pg-boss.
        The triage agent performs the following steps in a single LLM call with structured output:
      </p>
      <ol className="list-decimal pl-6 text-gray-600 space-y-2 mb-4 text-sm leading-relaxed">
        <li>Reads the case content and any available context (product description, recent similar cases)</li>
        <li>Classifies the case type and severity</li>
        <li>Produces a concise one-paragraph reasoning trace (stored on the case for review)</li>
        <li>Assigns a confidence score based on how unambiguous the classification is</li>
        <li>Determines whether to proceed to known-issue matching or route to the awaiting-lead queue</li>
      </ol>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The reasoning trace is visible in the case detail view under the <strong>Triage</strong> tab.
        It is stored verbatim and is never edited by the system. This gives your team full visibility
        into why the AI made a particular decision.
      </p>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          The triage model uses the fast LLM tier (<code className="bg-indigo-100 px-1 rounded-sm text-xs">LLM_MODEL_FAST</code>)
          when configured. For high-volume products, set this to a cheaper model (e.g. claude-haiku) to reduce costs
          while reserving the standard model for auto-reply generation.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Queue view</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The Cases queue is the primary operational view. It shows all cases for the selected product,
        filterable by:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Status</strong> — filter to open, awaiting-lead, auto-resolved, etc.</li>
        <li><strong>Severity</strong> — filter to P0/P1 for on-call monitoring</li>
        <li><strong>Type</strong> — separate bugs from feature requests from questions</li>
        <li><strong>Assignee</strong> — view your own queue or another team member&apos;s</li>
        <li><strong>Channel</strong> — filter by source (email, Telegram, GitHub)</li>
        <li><strong>Date range</strong> — narrow to a specific time window</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The queue sorts by severity (highest first) and then by arrival time (oldest first) by default.
        You can change the sort order from the column headers.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        <strong>Bulk actions</strong> — select multiple cases with the checkboxes to:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Assign to a team member</li>
        <li>Change status (e.g. bulk-close resolved cases)</li>
        <li>Change severity</li>
        <li>Link to a known issue</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Escalation</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Any team member can escalate a case to move it to the <code className="bg-gray-100 px-1 rounded-sm text-xs">awaiting-lead</code> state
        and notify a Support Lead or Change Lead. Escalation is appropriate when:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>The case requires a decision beyond the responder&apos;s authority (e.g. a refund, a breaking change)</li>
        <li>The customer is expressing significant frustration and needs senior attention</li>
        <li>Triage classified the case as P0 or P1 and the on-call lead has not yet acknowledged it</li>
        <li>The case is complex and you need help from the engineering team</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        To escalate: open the case detail, click <strong>Escalate</strong>, optionally add a note explaining why,
        and select the target lead. The lead receives an email notification and a Telegram alert if configured.
      </p>
    </DocsLayout>
  )
}
