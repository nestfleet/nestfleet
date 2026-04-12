// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = { title: "GitHub App Setup — NestFleet Self-Hosting" }

export default function GitHubAppPage() {
  return (
    <DocsLayout
      prev={{ label: "Prerequisites", href: "/docs/self-hosting/prerequisites" }}
      next={{ label: "Environment Variables", href: "/docs/self-hosting/environment" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">GitHub App Setup</h1>
      <p className="text-lg text-gray-500 mb-8 leading-relaxed">
        Create and configure a GitHub App for PR drafting, issue ingestion, and CI status tracking.
      </p>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-3 mb-8 text-sm text-gray-500">
        <strong className="text-gray-700">Optional:</strong> You can skip this section if you don&apos;t need
        GitHub integration. NestFleet works without it — you just won&apos;t get PR drafting or GitHub issue ingestion.
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">1. Create the GitHub App</h2>
      <ol className="list-decimal pl-6 text-gray-600 space-y-2 mb-6 text-sm leading-relaxed">
        <li>Go to <strong>GitHub → Settings → Developer settings → GitHub Apps → New GitHub App</strong>.</li>
        <li>Set <strong>Homepage URL</strong> to your NestFleet domain (e.g. <code className="bg-gray-100 px-1 rounded text-xs">https://ops.yourcompany.com</code>).</li>
        <li>Set <strong>Webhook URL</strong> to <code className="bg-gray-100 px-1 rounded text-xs">https://&lt;your-domain&gt;/api/v1/github/webhook</code>.</li>
        <li>Generate a <strong>Webhook secret</strong> (e.g. <code className="bg-gray-100 px-1 rounded text-xs">openssl rand -hex 32</code>) and save it — you&apos;ll need it for <code className="bg-gray-100 px-1 rounded text-xs">GITHUB_WEBHOOK_SECRET</code>.</li>
        <li>Uncheck <strong>Expire user authorization tokens</strong>.</li>
      </ol>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">2. Set permissions</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Permission</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Level</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Why</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Repository → Contents", "Read & write", "Read files for PR context; create/update files for doc fixes"],
            ["Repository → Issues", "Read & write", "Ingest GitHub issues as cases; comment with triage results"],
            ["Repository → Pull requests", "Read & write", "Draft and update change request PRs"],
            ["Repository → Statuses", "Read", "Track CI status on change request PRs"],
            ["Repository → Metadata", "Read", "Required by GitHub for all apps"],
          ].map(([perm, level, why]) => (
            <tr key={perm}>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium text-xs">{perm}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 text-xs">{level}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-500 text-xs">{why}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">3. Subscribe to webhook events</h2>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-6 text-sm">
        <li><strong>Issues</strong> — opened, edited, closed, labeled</li>
        <li><strong>Issue comment</strong> — created</li>
        <li><strong>Pull request</strong> — opened, closed, synchronize</li>
        <li><strong>Push</strong> — for CI status tracking</li>
        <li><strong>Status</strong> — CI check results on PRs</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">4. Generate a private key</h2>
      <p className="text-gray-600 leading-relaxed mb-2 text-sm">
        After saving the app, scroll to <strong>Private keys</strong> and click{" "}
        <strong>Generate a private key</strong>. A <code className="bg-gray-100 px-1 rounded text-xs">.pem</code>{" "}
        file will download. Keep it safe — you need it for the environment variable below.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">5. Set environment variables</h2>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nMIIE...\\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret`}</pre>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        The private key value must have literal <code className="bg-gray-100 px-1 rounded text-xs">\n</code> newlines
        (not actual line breaks) when set as an environment variable. You can convert it with:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono">{`awk 'NF {sub(/\\r/, ""); printf "%s\\\\n",$0;}' your-app.pem`}</pre>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">6. Install the app on your repositories</h2>
      <p className="text-gray-600 leading-relaxed text-sm">
        In your GitHub App settings, go to <strong>Install App</strong> and install it on the
        repositories you want NestFleet to monitor. You can grant access to all repositories or
        select specific ones.
      </p>
    </DocsLayout>
  )
}
