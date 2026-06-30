// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Running Tests — NestFleet Docs",
  description: "How to run unit, integration, E2E, and coverage tests for NestFleet.",
}

export default function TestingPage() {
  return (
    <DocsLayout
      prev={{ label: "Contributing", href: "/docs/developer/contributing" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Running Tests
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        NestFleet has four test layers: unit tests (fast, no I/O), integration tests (real PostgreSQL
        via Testcontainers), console type-checking, and end-to-end tests (Playwright, full stack).
        CI runs all of them on every pull request. Locally, you will most often run unit and integration tests.
      </p>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          <strong>Test infrastructure:</strong> Unit and integration tests use Vitest.
          Integration tests use Testcontainers to spin up a real PostgreSQL 16 + pgvector container
          automatically — no manual database setup required. Docker must be running (Colima works on Mac).
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Unit tests</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Unit tests cover services and workers in isolation. All external dependencies (database,
        LLM clients, pg-boss) are mocked. They run in milliseconds and require no running services.
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`npm test`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This runs Vitest in single-run mode, printing a pass/fail summary. Test files follow the
        naming convention <code className="bg-gray-100 px-1 rounded-sm text-xs">*.unit.test.ts</code> and live
        alongside the source files they test.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Watch mode</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        During active development, run tests in watch mode to get instant feedback on each file save:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`npm run test:watch`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Vitest watch mode only re-runs tests affected by the changed file, so even large test suites
        stay fast in watch mode.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Integration tests</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Integration tests exercise the full request path — from the Hono route handler through the
        service and repository layers to a real PostgreSQL database. Testcontainers starts a fresh
        PostgreSQL 16 + pgvector container before the test suite and tears it down afterwards.
        Migrations are applied automatically.
      </p>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          Docker must be running before executing integration tests. On macOS, use{" "}
          <a href="https://github.com/abiosoft/colima" className="text-amber-800 font-medium hover:underline" target="_blank" rel="noopener noreferrer">Colima</a>:{" "}
          <code className="bg-amber-100 px-1 rounded-sm text-xs">colima start</code>. Testcontainers detects the
          Docker socket automatically. First run is slow (~30s) while the PostgreSQL image is pulled;
          subsequent runs use the cached image and start in ~3s.
        </p>
      </div>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`npm run test:integration`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Integration test files use the naming convention{" "}
        <code className="bg-gray-100 px-1 rounded-sm text-xs">*.integration.test.ts</code>.
        They are excluded from the default <code className="bg-gray-100 px-1 rounded-sm text-xs">npm test</code> run
        to keep the fast unit test loop unaffected.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Each integration test file gets its own isolated database schema (unique schema name per
        test file), so tests can run in parallel without interfering with each other.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Console type-check</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The Next.js console is TypeScript-strict. Run the type-checker to catch type errors without
        building:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`cd console && npm run type-check`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This runs <code className="bg-gray-100 px-1 rounded-sm text-xs">tsc --noEmit</code> with the project&apos;s
        strict tsconfig. It is faster than a full Next.js build and catches most errors that would
        break the production build.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Build verification</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        To verify the API builds without TypeScript errors (runs the full tsc compilation):
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`npm run build`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        For the console build:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`cd console && npm run build`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Both must succeed before a PR can be merged. CI runs these as separate steps so you can see
        which one failed.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">E2E tests (Playwright)</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        End-to-end tests use Playwright and require the full stack to be running locally (API +
        console + database). They exercise critical user flows through the browser:
        login, case creation, triage queue, auto-reply approval, and change request workflow.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Before running E2E tests, start the full development stack (see <a href="/docs/developer/contributing" className="text-indigo-600 hover:underline">Contributing</a>).
        Then:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`cd console && npx playwright test`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        To run in headed mode (shows the browser) for debugging:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`cd console && npx playwright test --headed`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        To open the Playwright UI (interactive, with time-travel debugging):
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`cd console && npx playwright test --ui`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        E2E tests are slower (~60–90 seconds for the full suite) and are not required to pass locally
        before submitting a PR. CI runs them automatically against a Docker Compose stack.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Coverage</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Generate a coverage report for unit and integration tests:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`npm run test:coverage`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This produces an HTML report in <code className="bg-gray-100 px-1 rounded-sm text-xs">coverage/</code> and
        prints a summary table to the terminal. Coverage is measured by Vitest&apos;s built-in V8 provider.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The project targets 80% line coverage for the service layer. Coverage is not enforced by CI
        as a hard gate — it is reported as an informational metric on each PR via the coverage summary comment.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Quick reference</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Command</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">What it does</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Docker required?</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["npm test", "Unit tests (fast)", "No"],
            ["npm run test:watch", "Unit tests in watch mode", "No"],
            ["npm run test:integration", "Integration tests (real DB)", "Yes (Colima or Docker Desktop)"],
            ["npm run test:coverage", "Unit + integration with coverage report", "Yes"],
            ["cd console && npm run type-check", "TypeScript type checking (console)", "No"],
            ["npm run build", "API TypeScript compilation", "No"],
            ["cd console && npm run build", "Next.js production build", "No"],
            ["cd console && npx playwright test", "E2E browser tests", "Yes (full stack running)"],
          ].map(([cmd, desc, docker]) => (
            <tr key={cmd}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{cmd}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{docker}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocsLayout>
  )
}
