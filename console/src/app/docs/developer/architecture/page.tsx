// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Architecture — NestFleet Docs",
  description: "Technical architecture of NestFleet: API, workers, AI pipeline, auth, and data layer.",
}

export default function ArchitecturePage() {
  return (
    <DocsLayout
      prev={{ label: "Settings & LLM Config", href: "/docs/user-guide/settings" }}
      next={{ label: "API Reference", href: "/docs/developer/api-reference" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Architecture
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        NestFleet is a monorepo with a clean separation between the HTTP API, the background worker
        system, and the Next.js console. All state lives in a single PostgreSQL database. There are no
        external message queues — job scheduling is handled by pg-boss, which runs inside PostgreSQL.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">High-level overview</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[160px]">Component</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Technology</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Responsibility</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["API", "Hono (TypeScript)", "HTTP REST API. Handles all inbound requests: auth, case ingestion, channel webhooks, CRUD."],
            ["Console", "Next.js 15 (App Router)", "Operator UI. Server components + client islands. Communicates with the API over HTTP."],
            ["Worker", "Node.js process", "Background job executor. Connects to pg-boss and processes AI pipeline jobs."],
            ["Database", "PostgreSQL 16 + pgvector", "Primary datastore and job queue (via pg-boss). Vector search for KB matching."],
            ["Reverse proxy", "Caddy", "TLS termination, HTTP→HTTPS redirect, routing between API and console."],
          ].map(([component, tech, resp]) => (
            <tr key={component}>
              <td className="px-3 py-2 border border-gray-200 align-top font-semibold text-gray-800">{component}</td>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-gray-700">{tech}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{resp}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Layered architecture</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The API and worker both follow a strict three-layer architecture to separate concerns and
        make individual pieces independently testable:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[140px]">Layer</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">What it does</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Example files</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Route (controller)", "Parses and validates the HTTP request using Zod, calls the service, returns the HTTP response. No business logic.", "src/api/routes/cases.ts"],
            ["Service", "Contains all business logic. Orchestrates calls to one or more repositories, dispatches pg-boss jobs, enforces rules.", "src/api/services/case.service.ts"],
            ["Repository", "Executes SQL queries against the database. Returns typed domain objects. Never called directly from routes.", "src/infra/repositories/case.repo.ts"],
          ].map(([layer, desc, example]) => (
            <tr key={layer}>
              <td className="px-3 py-2 border border-gray-200 align-top font-semibold text-gray-800">{layer}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-gray-500">{example}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This structure is enforced by convention — ESLint rules prevent direct database access from route files.
        Services are unit-tested with mocked repositories. Integration tests exercise the full stack (route → service → real DB).
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Worker system and pg-boss</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        NestFleet uses <a href="https://github.com/timgit/pg-boss" className="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">pg-boss</a> to
        manage background jobs. pg-boss stores job queues as PostgreSQL tables, eliminating the need
        for a separate Redis or RabbitMQ service. Jobs survive process restarts, have built-in retry
        logic, and support at-least-once delivery semantics.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Workers are registered at startup in <code className="bg-gray-100 px-1 rounded text-xs">src/workers/index.ts</code>.
        Each worker is a function that receives a job payload and returns a result. Workers are
        registered with a queue name that corresponds to the job type:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`boss.work("triage", async (job) => {
  await triageWorker(job.data)
})

boss.work("auto_reply", async (job) => {
  await autoReplyWorker(job.data)
})`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Jobs are dispatched from services using the pg-boss client:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`await boss.send("triage", { caseId: newCase.id })`}</pre>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">AI pipeline</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The AI pipeline runs as a chain of pg-boss jobs. Each step is independent and can be retried
        on failure without re-running earlier steps:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[160px]">Job</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">LLM tier</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">What it does</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["triage", "Fast (LLM_MODEL_FAST)", "Classifies the case: type, severity, confidence. Produces the reasoning trace. Dispatches known_issue_match if confidence is high enough."],
            ["known_issue_match", "Fast (embedding)", "Runs a vector similarity search against the knowledge base. Attaches matching articles to the case. Dispatches auto_reply if a close match is found."],
            ["auto_reply", "Standard (LLM_MODEL)", "Generates a reply draft using the matched articles as RAG context. Routes to approval queue or sends immediately based on product settings."],
            ["change_prep", "Complex (LLM_MODEL_COMPLEX)", "Analyses the case and produces a structured PR draft with affected surfaces and risk assessment. Used for novel bugs."],
            ["embed_article", "Embedding model", "Embeds a new or updated KB article and upserts its vector in pgvector. Triggered when an article is created or updated."],
          ].map(([job, tier, desc]) => (
            <tr key={job}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700 bg-indigo-50">{job}</td>
              <td className="px-3 py-2 border border-gray-200 align-top text-xs text-gray-600">{tier}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Auth: JWT + RBAC</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Authentication is JWT-based. The login endpoint issues a signed access token (short-lived)
        and a refresh token (long-lived, stored in an httpOnly cookie). All other API routes require
        a valid Bearer token in the <code className="bg-gray-100 px-1 rounded text-xs">Authorization</code> header.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Authorization is enforced by a <code className="bg-gray-100 px-1 rounded text-xs">requireAuth</code> middleware
        in <code className="bg-gray-100 px-1 rounded text-xs">src/auth/</code>. It:
      </p>
      <ol className="list-decimal pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Verifies the JWT signature using <code className="bg-gray-100 px-1 rounded text-xs">JWT_SECRET</code></li>
        <li>Loads the user and their roles from the database</li>
        <li>Checks the required role(s) for the route</li>
        <li>Attaches the authenticated user to the Hono context for downstream handlers</li>
      </ol>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Every API route calls <code className="bg-gray-100 px-1 rounded text-xs">requireAuth()</code> — there is an ESLint
        rule (<code className="bg-gray-100 px-1 rounded text-xs">no-unprotected-route</code>) that flags routes missing auth middleware
        during CI.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Encryption</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Sensitive values — LLM API keys, webhook secrets, SMTP passwords — are encrypted at rest
        using AES-256-GCM before being stored in the database. Encryption is performed by
        <code className="bg-gray-100 px-1 rounded text-xs ml-1">src/infra/crypto.ts</code> using Node.js&apos;s built-in
        <code className="bg-gray-100 px-1 rounded text-xs ml-1">crypto</code> module with a random IV per value.
        The <code className="bg-gray-100 px-1 rounded text-xs">ENCRYPTION_KEY</code> env var (64 hex chars = 32 bytes)
        is the key material. Without it, secrets are stored in plaintext with a startup warning.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Key directories</h2>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`src/
├── api/
│   ├── routes/          # Hono route handlers (thin controllers)
│   ├── services/        # Business logic
│   └── middleware/      # Auth, logging, error handling
├── workers/
│   ├── index.ts         # Worker registration and pg-boss setup
│   ├── triage/          # Triage agent logic
│   ├── auto-reply/      # Auto-reply generation
│   ├── change-prep/     # Change request preparation
│   └── embed/           # Embedding jobs
├── infra/
│   ├── db/
│   │   ├── migrations/  # SQL migration files (up only, sequential)
│   │   └── client.ts    # postgres.js connection pool
│   ├── repositories/    # SQL query functions
│   └── crypto.ts        # AES-256-GCM encryption helpers
├── auth/
│   ├── jwt.ts           # Token sign / verify
│   └── middleware.ts    # requireAuth(), requireRole()
└── shared/
    ├── config.ts        # Zod-validated env var schema
    └── logger.ts        # Structured JSON logger (pino)`}</pre>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Database migrations</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Migrations are plain SQL files in <code className="bg-gray-100 px-1 rounded text-xs">src/infra/db/migrations/</code>,
        named sequentially: <code className="bg-gray-100 px-1 rounded text-xs">001_initial_schema.sql</code>,
        <code className="bg-gray-100 px-1 rounded text-xs ml-1">002_add_cases.sql</code>, etc.
        The API applies all pending migrations at startup using a simple migration runner — no ORM,
        no migration framework dependency. Migrations are idempotent (applied only once, tracked in a
        <code className="bg-gray-100 px-1 rounded text-xs ml-1">_migrations</code> table).
      </p>
    </DocsLayout>
  )
}
