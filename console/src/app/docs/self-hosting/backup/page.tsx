// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Backup & Restore — NestFleet Docs",
  description: "How to back up and restore a NestFleet self-hosted installation.",
}

export default function BackupPage() {
  return (
    <DocsLayout
      prev={{ label: "Docker Compose", href: "/docs/self-hosting/docker" }}
      next={{ label: "Upgrading", href: "/docs/self-hosting/upgrading" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Backup & Restore
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        NestFleet stores all state in PostgreSQL. A full backup consists of a compressed
        database dump. The included <code className="bg-gray-100 px-1 rounded-sm text-xs">scripts/backup.sh</code> script
        automates this and rotates old backups automatically.
      </p>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          All NestFleet data lives in the database — cases, knowledge base articles, change requests,
          audit logs, and encrypted secrets. There are no files on disk that need to be backed up separately.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">The backup script</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        <code className="bg-gray-100 px-1 rounded-sm text-xs">scripts/backup.sh</code> does the following:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Runs <code className="bg-gray-100 px-1 rounded-sm text-xs">pg_dump</code> against the running PostgreSQL container using <code className="bg-gray-100 px-1 rounded-sm text-xs">docker compose exec</code></li>
        <li>Compresses the dump with gzip (typically 5–20x compression for text-heavy data)</li>
        <li>Names the file with a timestamp: <code className="bg-gray-100 px-1 rounded-sm text-xs">backups/nestfleet_YYYYMMDD_HHMMSS.sql.gz</code></li>
        <li>Rotates the backup directory to keep only the most recent 7 backups, deleting older ones automatically</li>
        <li>Exits with a non-zero status code on failure, making it safe to use in cron with error logging</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Backup location</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Backups are written to the <code className="bg-gray-100 px-1 rounded-sm text-xs">backups/</code> directory
        at the root of the repository. This directory is listed in <code className="bg-gray-100 px-1 rounded-sm text-xs">.gitignore</code> and
        will never be committed to version control.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        For off-site durability, sync this directory to object storage (S3, Backblaze B2, Hetzner Object Storage)
        after each backup run. A simple approach is to pipe the script output into{" "}
        <code className="bg-gray-100 px-1 rounded-sm text-xs">rclone</code> or use a cron job that runs{" "}
        <code className="bg-gray-100 px-1 rounded-sm text-xs">rclone sync backups/ remote:bucket/nestfleet-backups/</code> after the dump.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Run a backup manually</h2>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`bash scripts/backup.sh`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The script must be run from the root of the NestFleet repository directory, where
        the <code className="bg-gray-100 px-1 rounded-sm text-xs">docker-compose.prod.yml</code> file is located.
        It reads the <code className="bg-gray-100 px-1 rounded-sm text-xs">POSTGRES_PASSWORD</code> from your
        <code className="bg-gray-100 px-1 rounded-sm text-xs">.env</code> file automatically.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Automate with cron</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Add a cron entry to run backups nightly at 02:00 local time. Edit your crontab with{" "}
        <code className="bg-gray-100 px-1 rounded-sm text-xs">crontab -e</code> and add:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`0 2 * * * /path/to/nestfleet/scripts/backup.sh >> /var/log/nestfleet-backup.log 2>&1`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Replace <code className="bg-gray-100 px-1 rounded-sm text-xs">/path/to/nestfleet</code> with the absolute
        path to your cloned repository. The script output (including errors) is appended to the log file.
        Monitor that file or configure a log rotation policy with{" "}
        <code className="bg-gray-100 px-1 rounded-sm text-xs">logrotate</code> to prevent it from growing unbounded.
      </p>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          Test that the cron job runs as expected by running it manually first with the full path, under the
          same user account that cron uses. Cron jobs run with a minimal PATH, so using absolute paths is
          critical — the script handles this internally.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Restore procedure</h2>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          <strong>Stop the API and worker before restoring.</strong> Restoring while the API is running can
          result in partial writes, foreign key violations, and pg-boss queue corruption. Take the stack down
          first, restore, then bring it back up.
        </p>
      </div>

      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Follow these steps to restore from a backup:
      </p>
      <ol className="list-decimal pl-6 text-gray-600 space-y-2 mb-6 text-sm leading-relaxed">
        <li>Stop all services except the database:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker compose -f docker-compose.prod.yml stop api worker console`}</pre>
          </div>
        </li>
        <li>Decompress the backup file:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`gunzip backups/nestfleet_20260401_020000.sql.gz`}</pre>
          </div>
        </li>
        <li>Drop and recreate the database schema, then restore:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`# Drop and recreate the database
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -c "DROP DATABASE nestfleet; CREATE DATABASE nestfleet;"

# Restore from the dump
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres nestfleet < backups/nestfleet_20260401_020000.sql`}</pre>
          </div>
        </li>
        <li>Restart all services:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker compose -f docker-compose.prod.yml up -d`}</pre>
          </div>
        </li>
        <li>Verify health:
          <div className="bg-gray-900 rounded-lg p-3 mt-2 mb-1 overflow-x-auto">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`curl https://your-domain/health`}</pre>
          </div>
        </li>
      </ol>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Verifying a backup without restoring</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        To verify a backup is readable without touching the production database, restore it into a
        temporary container:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`docker run --rm -e POSTGRES_PASSWORD=test -d --name pg-verify postgres:16
gunzip -c backups/nestfleet_20260401_020000.sql.gz | \
  docker exec -i pg-verify psql -U postgres
docker stop pg-verify`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        If the restore completes without errors, the backup is valid. Run this check monthly or after
        any significant data change.
      </p>
    </DocsLayout>
  )
}
