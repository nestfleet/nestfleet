// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "AI Auto-Reply — NestFleet Docs",
  description: "How NestFleet drafts and sends AI-generated replies to customer cases.",
}

export default function AutoReplyPage() {
  return (
    <DocsLayout
      prev={{ label: "Cases & Triage", href: "/docs/user-guide/cases" }}
      next={{ label: "Change Requests", href: "/docs/user-guide/change-requests" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        AI Auto-Reply
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        After triage, NestFleet searches the knowledge base for known issues that match the case.
        When a high-confidence match is found and the case meets the auto-reply criteria, the system
        drafts a response — and either sends it automatically or queues it for team approval,
        depending on the product&apos;s configuration.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">What auto-reply does</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The auto-reply pipeline runs as a pg-boss job after triage completes. It performs three steps:
      </p>
      <ol className="list-decimal pl-6 text-gray-600 space-y-2 mb-4 text-sm leading-relaxed">
        <li>
          <strong>Known-issue matching</strong> — runs a vector similarity search against the product&apos;s knowledge base
          using the case content as the query. Returns the top-k most similar articles and known issues.
        </li>
        <li>
          <strong>Reply generation</strong> — passes the original case and the matched knowledge to the LLM,
          which drafts a contextually accurate response in a helpful, professional tone. The draft respects
          the product&apos;s configured reply style (formal, casual, concise, etc.).
        </li>
        <li>
          <strong>Routing</strong> — depending on the confidence score and the product&apos;s approval mode setting,
          the reply is either sent immediately or placed into an approval queue.
        </li>
      </ol>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Confidence threshold</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The confidence threshold controls how certain the triage agent must be before auto-reply is
        triggered. It is configured per product in <strong>Settings → Triage → Confidence threshold</strong>.
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Threshold range</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Behaviour</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["0.90 – 1.0", "Very conservative. Only the clearest matches trigger auto-reply. Most cases go to awaiting-lead."],
            ["0.75 – 0.89 (default: 0.80)", "Balanced. Handles routine questions and known issues automatically while escalating ambiguous cases."],
            ["0.60 – 0.74", "Aggressive. More cases are auto-handled but risk of incorrect replies increases."],
            ["Below 0.60", "Not recommended. Almost all cases will trigger auto-reply regardless of match quality."],
          ].map(([range, desc]) => (
            <tr key={range}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-gray-700">{range}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Start with the default (0.80) and adjust based on the false-positive rate you observe in your
        rejection logs over the first two weeks of operation.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Known-issue matching</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        NestFleet uses embedding-based vector search (pgvector) to find relevant articles. When a case
        arrives, its content is embedded using the configured embedding model and compared against all
        knowledge base articles, known issues, and resolved past cases for the product.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The top-k results (default: 5) are passed as context to the reply generation step. The LLM
        uses this context to answer accurately without hallucinating — if no relevant context is found,
        the reply generation step is skipped and the case is routed to <code className="bg-gray-100 px-1 rounded-sm text-xs">awaiting-lead</code>.
      </p>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          The quality of auto-replies is directly proportional to the quality of your knowledge base.
          A well-maintained knowledge base with detailed runbooks and FAQs will produce significantly
          better auto-replies. See the <a href="/docs/user-guide/knowledge-base" className="text-indigo-700 font-medium hover:underline">Knowledge Base</a> guide
          for how to build and maintain it.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Approval modes</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Each product can be set to one of two approval modes in <strong>Settings → Triage → Auto-reply mode</strong>:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[180px]">Mode</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Behaviour</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Auto-send", "The reply is sent immediately when confidence meets the threshold. The case moves to auto-resolved. Team is notified but no action is required unless the customer replies."],
            ["Send for approval (default)", "The reply is drafted but held in an approval queue. A team member must review and approve before it is sent. Suitable for teams getting started with auto-reply."],
          ].map(([mode, desc]) => (
            <tr key={mode}>
              <td className="px-3 py-2 border border-gray-200 align-top font-medium text-gray-700">{mode}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Reviewing and editing a pending auto-reply</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        When a reply is pending approval, the case detail view shows a banner with the draft text.
        From there, a Support Lead or Operator can:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Approve as-is</strong> — sends the reply to the customer immediately</li>
        <li><strong>Edit and approve</strong> — modify the draft inline before sending</li>
        <li><strong>Reject</strong> — discard the draft and move the case to <code className="bg-gray-100 px-1 rounded-sm text-xs">awaiting-lead</code></li>
        <li><strong>Regenerate</strong> — ask the LLM to produce a new draft (useful if context has changed)</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        All pending auto-replies are also listed in the Cases queue with the filter
        <strong> Status: auto-resolved (pending approval)</strong>. This gives leads a single view of
        all drafts across all cases without needing to open each one individually.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">What happens on rejection</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        When a pending reply is rejected:
      </p>
      <ol className="list-decimal pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>The draft is archived (visible in the case history but not sent)</li>
        <li>The case state changes to <code className="bg-gray-100 px-1 rounded-sm text-xs">awaiting-lead</code></li>
        <li>The rejecting team member can add an optional note explaining why</li>
        <li>An audit event is recorded with the actor, timestamp, and note</li>
        <li>The assigned Support Lead receives an email notification</li>
      </ol>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Rejection patterns are valuable feedback. If the same type of draft is repeatedly rejected,
        consider updating the relevant knowledge base article or adjusting the triage configuration.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Community tier footer</h2>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          On the Community tier (self-hosted without a license key), auto-replies sent to customers
          include a small footer: <em>&quot;Powered by NestFleet&quot;</em>. This is how NestFleet sustains
          development while remaining free and open-source. Upgrade to a paid license to remove the footer.
        </p>
      </div>
    </DocsLayout>
  )
}
