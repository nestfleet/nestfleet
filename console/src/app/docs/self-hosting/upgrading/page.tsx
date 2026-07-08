// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import Link from "next/link"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Upgrading — NestFleet Docs",
  description: "How to upgrade a self-hosted NestFleet installation to a new version.",
}

export default function UpgradingPage() {
  return (
    <DocsLayout
      prev={{ label: "Backup & Restore", href: "/docs/self-hosting/backup" }}
      next={{ label: "Cases & Triage", href: "/docs/user-guide/cases" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Upgrading
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        NestFleet follows semantic versioning. Minor and patch releases are backward-compatible —
        upgrading is a pull, rebuild, and restart. Major releases include a migration guide in the
        release notes. Always take a backup before upgrading.
      </p>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          <strong>Always back up before upgrading.</strong> Run{" "}
          <code className="bg-amber-100 px-1 rounded-sm text-xs">bash scripts/backup.sh</code> and verify the backup
          file exists in <code className="bg-amber-100 px-1 rounded-sm text-xs">backups/</code> before proceeding.
          See the <Link href="/docs/self-hosting/backup" className="text-amber-800 font-medium hover:underline">Backup & Restore</Link> guide.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Standard upgrade procedure</h2>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">1. Pull the latest code</h3>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`git pull origin main`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        If you track a specific release tag rather than <code className="bg-gray-100 px-1 rounded-sm text-xs">main</code>,
        fetch and check out the new tag:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`git fetch --tags
git checkout v1.5.0`}</pre>
      </div>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">2. Rebuild the Docker images</h3>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker compose -f docker-compose.prod.yml build`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        This rebuilds the <code className="bg-gray-100 px-1 rounded-sm text-xs">api</code>,{" "}
        <code className="bg-gray-100 px-1 rounded-sm text-xs">worker</code>, and{" "}
        <code className="bg-gray-100 px-1 rounded-sm text-xs">console</code> images from the updated source.
        The <code className="bg-gray-100 px-1 rounded-sm text-xs">postgres</code> and{" "}
        <code className="bg-gray-100 px-1 rounded-sm text-xs">caddy</code> images are pulled from their registries
        and do not need a build step.
      </p>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">3. Apply database migrations</h3>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          <strong>Migrations run automatically on API startup.</strong> You do not need to run any migration
          command manually. When the <code className="bg-indigo-100 px-1 rounded-sm text-xs">api</code> container starts,
          it applies all pending migrations from <code className="bg-indigo-100 px-1 rounded-sm text-xs">src/infra/db/migrations/</code> in
          order before accepting traffic. This is safe because migrations are idempotent — already-applied
          migrations are skipped.
        </p>
      </div>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">4. Restart the stack</h3>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker compose -f docker-compose.prod.yml up -d`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Docker Compose performs a rolling restart — it stops and replaces each container with the new image
        while keeping the PostgreSQL data volume intact. The <code className="bg-gray-100 px-1 rounded-sm text-xs">--detach</code> flag
        returns immediately; use <code className="bg-gray-100 px-1 rounded-sm text-xs">docker compose logs -f api</code> to watch
        the startup and migration output.
      </p>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">5. Verify health</h3>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`curl https://your-domain/health`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Expected response after a successful upgrade:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`{"status":"ok","db":"ok"}`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Also log in to the console and confirm your data is intact. Check the API logs for any
        warnings from the migration runner.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Rollback procedure</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        If the new version has a critical regression, you can roll back to the previous release. The
        rollback process restores both the code and the database to the pre-upgrade state.
      </p>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          Rolling back is only safe if the migration is reversible and you have a clean backup from before the upgrade.
          Some migrations (e.g. dropping a column) cannot be undone by simply reverting the code. Always consult the
          release notes for the version you are rolling back from.
        </p>
      </div>
      <ol className="list-decimal pl-6 text-gray-600 space-y-2 mb-6 text-sm leading-relaxed">
        <li>Stop the stack:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker compose -f docker-compose.prod.yml down`}</pre>
          </div>
        </li>
        <li>Restore the database from your pre-upgrade backup (see{" "}
          <Link href="/docs/self-hosting/backup" className="text-indigo-600 hover:underline">Backup & Restore</Link>).
        </li>
        <li>Check out the previous release tag:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`git checkout v1.4.2`}</pre>
          </div>
        </li>
        <li>Rebuild and restart:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d`}</pre>
          </div>
        </li>
        <li>Verify health and open a GitHub issue describing the regression so it can be fixed in the next release.</li>
      </ol>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Checking the installed version</h2>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`curl https://your-domain/health | jq .version`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The health endpoint includes the running version string. Compare this against
        the latest release on the{" "}
        <a href="https://github.com/nestfleet/nestfleet/releases" className="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">GitHub Releases page</a>.
      </p>
    </DocsLayout>
  )
}
