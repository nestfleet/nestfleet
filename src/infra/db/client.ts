import postgres from "postgres"
import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"

/**
 * PostgreSQL client (postgres.js).
 *
 * Lazy-initialised singleton. In tests, call setDb() to inject a test instance.
 * The module never auto-connects at import time — only when getDb() is first called.
 */

let _db: postgres.Sql | null = null

export function getDb(): postgres.Sql {
  if (!_db) {
    const opts: postgres.Options<Record<string, never>> = {
      // INFRA-02: 25 connections supports full concurrent worker load (triage=10,
      // auto_reply=5, change_prep=3, outage_routing=2) plus API request handlers
      // without exhausting the pool under multi-product parallel load.
      max: 25,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: (notice) => logger.debug({ notice }, "PostgreSQL notice"),
    }
    if (config.NODE_ENV === "development") {
      opts.debug = (_connection, query, params) => logger.trace({ query, params }, "SQL")
    }
    _db = postgres(config.DATABASE_URL, opts)
  }
  return _db
}

/** Replace the singleton — used exclusively in integration tests. */
export function setDb(db: postgres.Sql): void {
  _db = db
}

/** Close all connections — call on graceful shutdown. */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.end()
    _db = null
  }
}

/** Ping the database. Returns true on success, false on failure. */
export async function pingDb(): Promise<boolean> {
  try {
    const db = getDb()
    await db`SELECT 1`
    return true
  } catch {
    return false
  }
}
