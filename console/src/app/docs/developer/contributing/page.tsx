// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import Link from "next/link"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Contributing — NestFleet Docs",
  description: "How to contribute to NestFleet: local setup, code conventions, TDD, and PR guidelines.",
}

export default function ContributingPage() {
  return (
    <DocsLayout
      prev={{ label: "API Reference", href: "/docs/developer/api-reference" }}
      next={{ label: "Running Tests", href: "/docs/developer/testing" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Contributing
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        NestFleet is open-source under AGPL-3.0. Contributions — bug fixes, features, documentation
        improvements, and tests — are welcome. This page covers everything you need to get a working
        local development environment and submit a pull request.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Fork and clone</h2>
      <ol className="list-decimal pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Fork the repository on GitHub: <a href="https://github.com/nestfleet/nestfleet" className="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">github.com/nestfleet/nestfleet</a></li>
        <li>Clone your fork locally:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`git clone https://github.com/YOUR_USERNAME/nestfleet.git
cd nestfleet`}</pre>
          </div>
        </li>
        <li>Add the upstream remote:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`git remote add upstream https://github.com/nestfleet/nestfleet.git`}</pre>
          </div>
        </li>
      </ol>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Local setup</h2>
      <ol className="list-decimal pl-6 text-gray-600 space-y-2 mb-4 text-sm leading-relaxed">
        <li>Install dependencies from the repo root (this installs both API and console dependencies):
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`npm install
cd console && npm install && cd ..`}</pre>
          </div>
        </li>
        <li>Copy the example env file and fill in the minimum vars:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`cp .env.example .env
# Set JWT_SECRET and DATABASE_URL at minimum`}</pre>
          </div>
        </li>
        <li>Start a local PostgreSQL instance. The easiest way is via Docker:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker run -d --name nestfleet-dev \
  -e POSTGRES_PASSWORD=nestfleet \
  -e POSTGRES_USER=nestfleet \
  -e POSTGRES_DB=nestfleet \
  -p 5434:5432 \
  pgvector/pgvector:pg16`}</pre>
          </div>
        </li>
        <li>Start the API (migrations run automatically on first start):
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`npm run dev`}</pre>
          </div>
        </li>
        <li>In a second terminal, start the Next.js console:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`cd console && npm run dev`}</pre>
          </div>
        </li>
      </ol>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The API starts on <code className="bg-gray-100 px-1 rounded-sm text-xs">http://localhost:3000</code> and the console
        on <code className="bg-gray-100 px-1 rounded-sm text-xs">http://localhost:3001</code> by default.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Code conventions</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        These conventions are enforced by ESLint and are checked in CI. PRs that fail lint will not be merged.
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>
          <strong>Layered architecture</strong> — routes call services; services call repositories.
          No database access from routes. No HTTP logic in services.
        </li>
        <li>
          <strong>Zod validation on every route</strong> — request body, query params, and path params
          must be validated with a Zod schema before use.
        </li>
        <li>
          <strong>Auth on every route</strong> — call <code className="bg-gray-100 px-1 rounded-sm text-xs">requireAuth()</code> on
          every route handler. The ESLint rule <code className="bg-gray-100 px-1 rounded-sm text-xs">no-unprotected-route</code> will
          catch violations.
        </li>
        <li>
          <strong>Structured logging</strong> — use the <code className="bg-gray-100 px-1 rounded-sm text-xs">logger</code> from
          <code className="bg-gray-100 px-1 rounded-sm text-xs ml-1">src/shared/logger.ts</code> (pino). Always include
          <code className="bg-gray-100 px-1 rounded-sm text-xs ml-1">requestId</code>,{" "}
          <code className="bg-gray-100 px-1 rounded-sm text-xs">userId</code>, and{" "}
          <code className="bg-gray-100 px-1 rounded-sm text-xs">caseId</code> (where applicable) in log fields.
          Never use <code className="bg-gray-100 px-1 rounded-sm text-xs">console.log</code>.
        </li>
        <li>
          <strong>No liteLLM</strong> — use provider SDKs directly:
          <code className="bg-gray-100 px-1 rounded-sm text-xs ml-1">@anthropic-ai/sdk</code>,
          <code className="bg-gray-100 px-1 rounded-sm text-xs ml-1">openai</code>,
          <code className="bg-gray-100 px-1 rounded-sm text-xs ml-1">@google/generative-ai</code>.
          liteLLM is a banned dependency.
        </li>
        <li>
          <strong>TypeScript strict mode</strong> — no <code className="bg-gray-100 px-1 rounded-sm text-xs">any</code> types
          without an explicit comment explaining why. Prefer <code className="bg-gray-100 px-1 rounded-sm text-xs">unknown</code> with
          a type guard.
        </li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">TDD policy</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        NestFleet follows a hybrid TDD approach: write tests first for backend logic, write them
        alongside for frontend components. The policy for PRs:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>
          <strong>New API routes</strong> require both a unit test (service layer, mocked repo) and an
          integration test (full route → real DB). PRs without these will be asked to add them.
        </li>
        <li>
          <strong>New service logic</strong> must have unit tests covering the happy path and the main
          error cases (invalid input, not found, permission denied).
        </li>
        <li>
          <strong>New worker jobs</strong> require unit tests for the job handler with mocked LLM clients.
        </li>
        <li>
          <strong>Bug fixes</strong> must include a test that reproduces the bug and passes after the fix.
        </li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        See <Link href="/docs/developer/testing" className="text-indigo-600 hover:underline">Running Tests</Link> for how to run the test suite.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">PR guidelines</h2>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>One feature or fix per PR</strong> — small PRs are reviewed faster and are easier to revert if needed</li>
        <li><strong>Explain the why, not the what</strong> — the code diff shows what changed; the PR description should explain why the change is necessary and what alternatives were considered</li>
        <li><strong>Update docs</strong> — if your change adds a new environment variable, config option, or user-facing feature, update the relevant documentation page. See the <Link href="/docs/developer/architecture" className="text-indigo-600 hover:underline">Architecture</Link> doc for the key files.</li>
        <li><strong>Link the issue</strong> — reference the GitHub issue your PR resolves with <code className="bg-gray-100 px-1 rounded-sm text-xs">Closes #123</code> in the PR description</li>
        <li><strong>Keep the diff focused</strong> — avoid bundling unrelated refactors with bug fixes</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Commit style</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        NestFleet uses <a href="https://www.conventionalcommits.org/" className="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">Conventional Commits</a>.
        Each commit message must start with a type prefix:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[120px]">Prefix</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Use for</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["feat:", "A new user-facing feature"],
            ["fix:", "A bug fix"],
            ["docs:", "Documentation changes only"],
            ["refactor:", "Code restructuring with no behaviour change"],
            ["test:", "Adding or correcting tests"],
            ["chore:", "Build process, dependencies, tooling"],
            ["perf:", "Performance improvements"],
          ].map(([prefix, use]) => (
            <tr key={prefix}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{prefix}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{use}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Example: <code className="bg-gray-100 px-1 rounded-sm text-xs">feat: add per-product confidence threshold to triage settings</code>
      </p>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          <strong>Do not install liteLLM.</strong> It is a banned dependency in this project.
          Use provider SDKs directly: <code className="bg-amber-100 px-1 rounded-sm text-xs">@anthropic-ai/sdk</code>,
          <code className="bg-amber-100 px-1 rounded-sm text-xs ml-1">openai</code>,
          <code className="bg-amber-100 px-1 rounded-sm text-xs ml-1">@google/generative-ai</code>.
          PRs that add liteLLM as a dependency will be closed.
        </p>
      </div>
    </DocsLayout>
  )
}
