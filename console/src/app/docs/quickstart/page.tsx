// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = { title: "Quick Start (SaaS) — NestFleet Docs" }

export default function QuickStartPage() {
  return (
    <DocsLayout
      prev={{ label: "Overview", href: "/docs" }}
      next={{ label: "Self-Hosting", href: "/docs/self-hosting" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">Quick Start (SaaS)</h1>
      <p className="text-lg text-gray-500 mb-8 leading-relaxed">
        Get your first case processed on nestfleet.dev in under 15 minutes.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">1. Create your account</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Go to <a href="https://nestfleet.dev/signup" className="text-indigo-600 hover:underline">nestfleet.dev/signup</a> and
        create a free account. No credit card required for the Community tier.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">2. Create your first product</h2>
      <p className="text-gray-600 leading-relaxed mb-2">
        After login you will be taken through the setup wizard. You need:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Product name</strong> — a human-readable name for your software product.</li>
        <li><strong>LLM provider + API key</strong> — Anthropic, OpenAI, Google, or Ollama. The key is encrypted at rest and never leaves your account.</li>
        <li><strong>Timezone</strong> — used for SLA windows and scheduled digests.</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">3. Connect a signal source</h2>
      <p className="text-gray-600 leading-relaxed mb-2">
        Navigate to <strong>Settings → Channels</strong> and connect at least one inbound channel:
      </p>
      <div className="space-y-3 mb-4">
        {[
          { name: "Email", desc: "Configure an inbound webhook from Postmark, SendGrid, or any SMTP relay that supports webhook forwarding." },
          { name: "GitHub", desc: "Install the NestFleet GitHub App on your repository. Issues and PR events will flow in as cases." },
          { name: "Telegram", desc: "Provide a Telegram Bot token. Users can message the bot to submit support requests." },
          { name: "Webhook", desc: "POST JSON payloads to the generic webhook endpoint from any source." },
        ].map((ch) => (
          <div key={ch.name} className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-1">{ch.name}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{ch.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">4. Send a test signal</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        From <strong>Settings → Channels</strong>, click <strong>Send test signal</strong> on your
        connected channel. A synthetic case will appear in your queue within a few seconds with a
        triage result and confidence score.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">5. Review your first case</h2>
      <p className="text-gray-600 leading-relaxed mb-2">
        Open the <strong>Queue</strong> view. Your test case will show:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Severity badge (P0–P4) assigned by the triage agent</li>
        <li>Case type (bug, question, feature request, outage, …)</li>
        <li>Confidence score and reasoning trace</li>
        <li>Suggested routing (which queue / team lead)</li>
        <li>Known issue matches (if any exist in your knowledge base)</li>
      </ul>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          <strong>Next step:</strong> Add your product documentation to the knowledge base under{" "}
          <strong>Knowledge → Sources</strong>. The more context NestFleet has, the higher the
          auto-reply confidence and the better the known-issue matching.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">What&apos;s included in the free tier</h2>
      <table className="w-full text-sm border-collapse mb-4">
        <tbody>
          {[
            ["Products", "1 active product"],
            ["Outcome Units", "100 / month"],
            ["Signal sources", "Email, GitHub, Telegram, Webhook"],
            ["AI triage", "✓ Included"],
            ["Auto-reply", "✓ Included (requires confidence threshold)"],
            ["Change requests", "✓ Included"],
            ["Audit trail", "✓ Full history"],
            ["Support", "Community (GitHub Issues)"],
          ].map(([k, v]) => (
            <tr key={k}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium w-48">{k}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocsLayout>
  )
}
