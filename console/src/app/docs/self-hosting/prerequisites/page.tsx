// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import Link from "next/link"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = { title: "Prerequisites — NestFleet Self-Hosting" }

export default function PrerequisitesPage() {
  return (
    <DocsLayout
      prev={{ label: "Self-Hosting", href: "/docs/self-hosting" }}
      next={{ label: "GitHub App Setup", href: "/docs/self-hosting/github-app" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">Prerequisites</h1>
      <p className="text-lg text-gray-500 mb-8 leading-relaxed">
        What you need before deploying NestFleet.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Required</h2>

      <div className="space-y-4 mb-8">
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Docker + Docker Compose v2</h3>
          <p className="text-sm text-gray-500 leading-relaxed mb-2">
            All NestFleet services run in Docker containers. Compose v2 is required (the{" "}
            <code className="bg-gray-100 px-1 rounded-sm text-xs">docker compose</code> sub-command, not the legacy{" "}
            <code className="bg-gray-100 px-1 rounded-sm text-xs">docker-compose</code>).
          </p>
          <p className="text-sm text-gray-400">Docker Engine 24+ · Docker Compose 2.20+</p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">LLM API key</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            NestFleet requires access to a large language model for triage, auto-reply, and change
            request drafting. Supported providers: <strong>Anthropic</strong> (recommended),{" "}
            <strong>OpenAI</strong>, <strong>Google Gemini</strong>, or a locally-running{" "}
            <strong>Ollama</strong> instance. The API key is encrypted at rest using AES-256-GCM.
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">PostgreSQL 16</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            NestFleet uses PostgreSQL with the <code className="bg-gray-100 px-1 rounded-sm text-xs">pgcrypto</code>{" "}
            extension (installed automatically). You can use the bundled PostgreSQL container in{" "}
            <code className="bg-gray-100 px-1 rounded-sm text-xs">docker-compose.prod.yml</code>, or bring your
            own managed database (Hetzner Managed DB, RDS, etc.).
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">A public domain + open ports 80 and 443</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Required for production TLS. Caddy provisions a Let&apos;s Encrypt certificate automatically
            when <code className="bg-gray-100 px-1 rounded-sm text-xs">NESTFLEET_DOMAIN</code> is set and
            the domain resolves to your server. Ports 80 (ACME challenge) and 443 (HTTPS) must be
            reachable from the internet.
          </p>
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Optional</h2>

      <div className="space-y-4 mb-8">
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">GitHub App credentials</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Required only if you want NestFleet to draft pull requests and ingest GitHub issues.
            See <Link href="/docs/self-hosting/github-app" className="text-indigo-600 hover:underline">GitHub App Setup</Link>.
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">SMTP / email provider</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            For inbound email ingestion and outbound auto-replies. Supported:{" "}
            <strong>Postmark</strong> (<code className="bg-gray-100 px-1 rounded-sm text-xs">POSTMARK_API_KEY</code>),{" "}
            <strong>Resend</strong> (<code className="bg-gray-100 px-1 rounded-sm text-xs">RESEND_API_KEY</code>),
            or any SMTP relay (<code className="bg-gray-100 px-1 rounded-sm text-xs">SMTP_HOST</code> /
            <code className="bg-gray-100 px-1 rounded-sm text-xs">SMTP_USER</code> /
            <code className="bg-gray-100 px-1 rounded-sm text-xs">SMTP_PASS</code>).
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">Telegram Bot token</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            For Telegram channel ingestion. Create a bot via <strong>@BotFather</strong> and set{" "}
            <code className="bg-gray-100 px-1 rounded-sm text-xs">TELEGRAM_BOT_TOKEN</code>.
          </p>
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Minimum server specs</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Use case</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">CPU</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">RAM</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Disk</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Dev / single product", "2 vCPU", "2 GB", "20 GB SSD"],
            ["Production (1–3 products)", "2 vCPU", "4 GB", "40 GB SSD"],
            ["Production (5+ products)", "4 vCPU", "8 GB", "80 GB SSD"],
          ].map(([uc, cpu, ram, disk]) => (
            <tr key={uc}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{uc}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{cpu}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{ram}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600">{disk}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-gray-400">
        Hetzner CAX21 (Arm64, 4 vCPU / 8 GB / 80 GB, ~€7/mo) is a cost-effective choice for production.
      </p>
    </DocsLayout>
  )
}
