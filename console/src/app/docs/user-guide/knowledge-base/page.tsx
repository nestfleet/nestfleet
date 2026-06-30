// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Knowledge Base — NestFleet Docs",
  description: "Build and maintain the NestFleet knowledge base that powers AI triage and auto-reply.",
}

export default function KnowledgeBasePage() {
  return (
    <DocsLayout
      prev={{ label: "Change Requests", href: "/docs/user-guide/change-requests" }}
      next={{ label: "Roles & Permissions", href: "/docs/user-guide/roles" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Knowledge Base
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        The knowledge base is the long-term memory of NestFleet. It stores articles, runbooks,
        FAQs, known issues, and resolved case summaries. Every auto-reply and triage decision is
        grounded in this knowledge — keeping it accurate and up to date directly improves AI quality.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">What belongs in the knowledge base</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The knowledge base accepts several types of content:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[160px]">Type</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Article", "A free-form document: FAQ entry, how-to guide, configuration reference, or troubleshooting runbook. Supports Markdown formatting."],
            ["Known Issue", "A documented bug or limitation with a known workaround or fix. Linked to one or more cases and optionally to a change request."],
            ["Resolved Case (auto)", "A summary of a resolved case captured automatically. Includes the original issue, the resolution steps, and the final reply sent to the customer."],
            ["GitHub File (sync)", "A file from the product's GitHub repository (e.g. README, CHANGELOG, runbook) synced periodically and indexed for search."],
          ].map(([type, desc]) => (
            <tr key={type}>
              <td className="px-3 py-2 border border-gray-200 align-top font-medium text-gray-700">{type}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">How the knowledge base feeds triage</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        All knowledge base content is embedded using the configured embedding model and stored as
        vectors in PostgreSQL (via the pgvector extension). When a new case arrives, the triage and
        auto-reply agents perform a vector similarity search to find the most relevant articles.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This retrieval-augmented generation (RAG) approach keeps AI responses grounded in your actual
        product documentation rather than the model&apos;s general training data. The quality of the search
        results — and therefore the auto-replies — depends directly on:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>The accuracy and completeness of your articles</li>
        <li>The granularity of known issues (one issue per article, not dozens per article)</li>
        <li>The freshness of resolved case summaries</li>
        <li>The quality of the embedding model (see <a href="/docs/self-hosting/environment" className="text-indigo-600 hover:underline">Environment Variables</a> for embedding config)</li>
      </ul>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          A newly deployed NestFleet instance has an empty knowledge base. Auto-reply will not trigger
          for cases until at least some articles or known issues exist. Start by importing your existing
          FAQ, adding your most common support scenarios, and enabling resolved-case capture.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Creating articles manually</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Navigate to <strong>Knowledge Base</strong> in the sidebar, then click <strong>New Article</strong>.
        Each article has:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Title</strong> — used in search results and in AI-generated reply citations</li>
        <li><strong>Content</strong> — Markdown body. Be specific and include the exact error messages and workaround steps that a customer would need.</li>
        <li><strong>Tags</strong> — optional labels for filtering and grouping (e.g. &quot;authentication&quot;, &quot;billing&quot;, &quot;api&quot;)</li>
        <li><strong>Visibility</strong> — Internal only (team-facing) or Public (can be linked in replies to customers)</li>
        <li><strong>Product scope</strong> — articles are scoped to a specific product or shared across all products</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Once saved, the article is re-embedded in the background (a pg-boss job). It becomes searchable
        within 30–60 seconds on most configurations.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Known issues</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        A <strong>Known Issue</strong> is a special article type that represents a confirmed bug or limitation.
        It has additional fields compared to a standard article:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Status</strong> — open, in-progress, resolved, won&apos;t-fix</li>
        <li><strong>Workaround</strong> — if a workaround exists, describe it here; this is injected into auto-replies</li>
        <li><strong>Fix version</strong> — once resolved, the version in which it was fixed</li>
        <li><strong>Linked cases</strong> — all cases that have been matched to this known issue</li>
        <li><strong>Linked change request</strong> — the CR tracking the fix, if one exists</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        To link a case to a known issue, open the case detail, click <strong>Link Known Issue</strong>, and
        search for the relevant issue. Once linked, future cases that match the same known issue will
        automatically inherit the workaround text in their auto-reply.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Auto-update proposals</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        When a case is closed with a resolution note, NestFleet compares the resolution to existing
        knowledge base articles and known issues. If the resolution contains new information not captured
        in any existing article, the system creates a <strong>Knowledge Update Proposal</strong> — a
        suggested edit to an existing article or a draft for a new article.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Proposals appear in the <strong>Knowledge Base → Pending Updates</strong> view. A team member with
        Knowledge Lead access reviews the proposal and can:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Accept</strong> — apply the proposed changes to the article or create the new article</li>
        <li><strong>Edit and accept</strong> — revise the proposal before applying</li>
        <li><strong>Reject</strong> — discard the proposal (e.g. if the resolution was one-off or already documented)</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This feedback loop means the knowledge base grows richer with every case resolved, without
        requiring manual curation effort for routine cases.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Importing from GitHub</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        If your product has a GitHub repository connected, you can configure NestFleet to periodically
        sync specific files or directories into the knowledge base. Go to <strong>Settings → Knowledge Sources → GitHub Sync</strong> and
        specify the file paths to import (e.g. <code className="bg-gray-100 px-1 rounded-sm text-xs">docs/**/*.md</code>,
        <code className="bg-gray-100 px-1 rounded-sm text-xs">CHANGELOG.md</code>, <code className="bg-gray-100 px-1 rounded-sm text-xs">README.md</code>).
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Synced files are re-embedded every 24 hours (or on webhook push if the GitHub App is configured).
        Changes to the source files in the repository are reflected in the knowledge base automatically.
      </p>
    </DocsLayout>
  )
}
