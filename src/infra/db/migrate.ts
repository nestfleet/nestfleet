/**
 * Migration runner.
 *
 * Reads all *.sql files from the migrations/ directory, sorted by filename.
 * Tracks applied migrations in the `nestfleet_migrations` table.
 * Idempotent: skips already-applied migrations.
 *
 * Run standalone: tsx src/infra/db/migrate.ts
 * Called on server startup in src/index.ts
 */

import { readdir, readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"
import { getDb } from "./client.js"
import { logger } from "../../shared/logger.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, "../../../migrations")

const TRACKING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS nestfleet_migrations (
    id         SERIAL PRIMARY KEY,
    filename   TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`

export async function runMigrations(db?: postgres.Sql): Promise<void> {
  const sql = db ?? getDb()
  const migrationLogger = logger.child({ component: "migrate" })

  // Ensure tracking table exists
  await sql.unsafe(TRACKING_TABLE_SQL)

  // Read migration files
  let files: string[]
  try {
    const entries = await readdir(MIGRATIONS_DIR)
    files = entries.filter((f) => f.endsWith(".sql")).sort()
  } catch (err) {
    migrationLogger.warn({ err }, "No migrations directory found — skipping")
    return
  }

  if (files.length === 0) {
    migrationLogger.info("No migration files found")
    return
  }

  // Find already-applied migrations
  const applied = await sql<{ filename: string }[]>`
    SELECT filename FROM nestfleet_migrations
  `
  const appliedSet = new Set(applied.map((r) => r.filename))

  // Apply pending migrations in order
  for (const file of files) {
    if (appliedSet.has(file)) {
      migrationLogger.debug({ file }, "Migration already applied — skipping")
      continue
    }

    const filePath = join(MIGRATIONS_DIR, file)
    const sql_content = await readFile(filePath, "utf-8")

    migrationLogger.info({ file }, "Applying migration")

    // Migrations containing CONCURRENTLY (or marked -- no-transaction) must run
    // outside a transaction block. Track them separately after execution.
    const noTransaction =
      sql_content.includes("CONCURRENTLY") ||
      sql_content.includes("-- no-transaction")

    if (noTransaction) {
      await sql.unsafe(sql_content)
      await sql`INSERT INTO nestfleet_migrations (filename) VALUES (${file})`
    } else {
      await sql.begin(async (tx) => {
        const typedTx = tx as unknown as postgres.Sql
        await typedTx.unsafe(sql_content)
        await typedTx`INSERT INTO nestfleet_migrations (filename) VALUES (${file})`
      })
    }

    migrationLogger.info({ file }, "Migration applied successfully")
  }
}

// Run standalone
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  runMigrations()
    .then(() => {
      logger.info("All migrations complete")
      process.exit(0)
    })
    .catch((err) => {
      logger.error({ err }, "Migration failed")
      process.exit(1)
    })
}
