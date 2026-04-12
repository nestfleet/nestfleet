// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Docker Compose — NestFleet Docs",
  description: "Deploy NestFleet with Docker Compose in production.",
}

export default function DockerPage() {
  return (
    <DocsLayout
      prev={{ label: "Environment Variables", href: "/docs/self-hosting/environment" }}
      next={{ label: "Backup & Restore", href: "/docs/self-hosting/backup" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Docker Compose
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        The recommended way to self-host NestFleet is with the production Docker Compose stack.
        It starts five services — PostgreSQL, the Hono API, the Next.js console, the pg-boss worker,
        and Caddy as a reverse proxy — and handles TLS automatically via Let&apos;s Encrypt.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Prerequisites</h2>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>A Linux server (or Mac/Windows with Docker Desktop) with Docker Engine 24+ and Docker Compose v2</li>
        <li>A domain name pointed at your server&apos;s public IP (A record) — required for automatic TLS</li>
        <li>Ports 80 and 443 open in your firewall</li>
        <li>Git installed on the server</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Step 1 — Clone the repository</h2>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`git clone https://github.com/nestfleet/nestfleet.git
cd nestfleet`}</pre>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Step 2 — Create your .env file</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Copy the example file and open it in your editor:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`cp .env.example .env
nano .env`}</pre>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Step 3 — Generate secrets</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        You need cryptographically random values for <code className="bg-gray-100 px-1 rounded text-xs">JWT_SECRET</code> and{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">ENCRYPTION_KEY</code>. Run this command twice — once for each:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`openssl rand -hex 32`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This produces 64 hex characters, which is exactly the format both secrets expect.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Step 4 — Set the minimum required variables</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        At minimum, you must set these variables in your <code className="bg-gray-100 px-1 rounded text-xs">.env</code> file
        before starting the stack:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Variable</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Value</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["JWT_SECRET", "64 random hex chars (openssl rand -hex 32)"],
            ["ENCRYPTION_KEY", "64 random hex chars (openssl rand -hex 32)"],
            ["LLM_PROVIDER", "openai, anthropic, ollama, or google"],
            ["LLM_API_KEY", "Your API key for the chosen provider"],
            ["NESTFLEET_DOMAIN", "Your domain, e.g. nestfleet.example.com"],
            ["POSTGRES_PASSWORD", "A strong random password for the database"],
            ["CONSOLE_ORIGIN", "https://your-domain (same as NESTFLEET_DOMAIN with https://)"],
          ].map(([name, val]) => (
            <tr key={name}>
              <td className="px-3 py-2 border border-gray-200 align-top">
                <code className="bg-gray-100 px-1 rounded text-xs">{name}</code>
              </td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          See the <a href="/docs/self-hosting/environment" className="text-indigo-700 font-medium hover:underline">Environment Variables</a> reference
          for the full list of options including email, Telegram, Slack, and Sentry configuration.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Step 5 — Start the stack</h2>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker compose -f docker-compose.prod.yml up -d`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This starts the following services:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Service</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["postgres", "PostgreSQL 16 database. Data is persisted in a named Docker volume."],
            ["api", "The Hono API server. Runs database migrations on startup."],
            ["worker", "pg-boss background worker for AI jobs (triage, auto-reply, change prep)."],
            ["console", "Next.js admin console served on port 3001 internally."],
            ["caddy", "Reverse proxy with automatic Let's Encrypt TLS. Terminates HTTPS and routes traffic to api and console."],
          ].map(([svc, desc]) => (
            <tr key={svc}>
              <td className="px-3 py-2 border border-gray-200 align-top font-medium text-gray-700">
                <code className="bg-gray-100 px-1 rounded text-xs">{svc}</code>
              </td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Step 6 — Create the first admin user</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Self-hosted installs ship with public registration disabled. To create the first admin account:
      </p>
      <ol className="list-decimal pl-6 text-gray-600 space-y-2 mb-4 text-sm leading-relaxed">
        <li>
          Set <code className="bg-gray-100 px-1 rounded text-xs">REGISTRATION_ENABLED=true</code> in your{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">.env</code> file.
        </li>
        <li>
          Restart the API:{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">docker compose -f docker-compose.prod.yml restart api</code>
        </li>
        <li>
          Navigate to <code className="bg-gray-100 px-1 rounded text-xs">https://your-domain/signup</code> and create your account.
        </li>
        <li>
          Assign yourself the Admin role via the database or by promoting your account through the API.
        </li>
        <li>
          Set <code className="bg-gray-100 px-1 rounded text-xs">REGISTRATION_ENABLED=false</code> and restart the API again.
        </li>
      </ol>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          Leave <code className="bg-amber-100 px-1 rounded text-xs">REGISTRATION_ENABLED=false</code> in production.
          With it enabled, anyone who can reach your domain can create an account. Invite additional users
          from Settings → Team Members once you are logged in as admin.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Step 7 — Verify the deployment</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Check the health endpoint to confirm the API and database are running:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`curl https://your-domain/health`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        A healthy instance returns:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`{"status":"ok","db":"ok"}`}</pre>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Viewing logs</h2>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`# Tail all services
docker compose -f docker-compose.prod.yml logs -f

# Tail a specific service
docker compose -f docker-compose.prod.yml logs -f api`}</pre>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Stopping the stack</h2>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker compose -f docker-compose.prod.yml down`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This stops and removes containers but preserves the PostgreSQL data volume. Add{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">-v</code> to also remove volumes (destructive — deletes all data).
      </p>
    </DocsLayout>
  )
}
