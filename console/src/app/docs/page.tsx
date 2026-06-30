// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import Link from "next/link"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Documentation — NestFleet",
  description: "NestFleet documentation — AI-native product operations platform.",
}

const NAV_CARDS = [
  {
    title: "Quick Start (SaaS)",
    description: "Get running in minutes on nestfleet.dev. No infrastructure required.",
    href: "/docs/quickstart",
  },
  {
    title: "Self-Hosting",
    description: "Run NestFleet on your own infrastructure. AGPL-3.0 licensed, free forever.",
    href: "/docs/self-hosting",
  },
  {
    title: "User Guide",
    description: "Cases, triage, AI auto-reply, change requests, knowledge base, roles, and settings.",
    href: "/docs/user-guide/cases",
  },
  {
    title: "Developer Guide",
    description: "Architecture, API reference, contributing, and running tests.",
    href: "/docs/developer/architecture",
  },
]

export default function DocsOverview() {
  return (
    <DocsLayout next={{ label: "Quick Start (SaaS)", href: "/docs/quickstart" }}>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        NestFleet Documentation
      </h1>
      <p className="text-lg text-gray-500 mb-8 leading-relaxed">
        Everything you need to deploy, configure, and operate NestFleet.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">What is NestFleet?</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        NestFleet is an AI-native product operations platform. It acts as a supervised virtual team
        for one or more software products — handling support intake, triage, change management,
        AI-assisted replies, and knowledge maintenance in a single governed system.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4">
        Every signal that arrives — from email, Telegram, a GitHub issue, or a webhook — is
        normalised into a <strong>Case</strong>. NestFleet triages it, matches it against known
        issues, routes it to the right queue, and optionally auto-replies or drafts a change
        request — all with a complete audit trail and human approval gates at every step.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Two ways to use NestFleet</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700"> </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">SaaS (nestfleet.dev)</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Self-Hosted (AGPL-3.0)</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Setup", "Sign up, configure LLM — done in minutes", "Clone repo, run Docker Compose, create GitHub App"],
            ["Infrastructure", "Fully managed", "You manage"],
            ["Cost", "Free community tier + paid plans", "Free forever (your infra costs only)"],
            ["Data residency", "EU (Hetzner)", "Wherever you deploy"],
            ["LLM provider", "Bring your own API key", "Bring your own API key"],
          ].map(([label, saas, self]) => (
            <tr key={label}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">{label}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{saas}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{self}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Where to go next</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NAV_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group block border border-gray-200 rounded-lg p-5 hover:border-indigo-300 hover:shadow-xs transition-all"
          >
            <h3 className="text-base font-bold text-gray-900 group-hover:text-indigo-600 transition-colors mb-1">
              {card.title}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
          </Link>
        ))}
      </div>
    </DocsLayout>
  )
}
