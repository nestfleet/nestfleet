/**
 * pg-boss singleton — AE-04.
 * ADR-025: pg-boss (PostgreSQL-backed job queue), pg-boss v12.
 *
 * Provides a lazily-initialized pg-boss instance used by the dispatcher
 * and all workers. The same PG connection string is used as the main DB
 * (zero new infrastructure).
 */

import { PgBoss } from "pg-boss"
import { config } from "../../shared/config.js"
import { logger } from "../../shared/logger.js"

let _boss: PgBoss | null = null
// Promise-based init lock: all concurrent callers await the same Promise,
// guaranteeing exactly one PgBoss instance even under parallel worker registration.
let _initPromise: Promise<PgBoss> | null = null

/**
 * Return the pg-boss singleton, starting it on first call.
 * Safe to call multiple times concurrently — the Promise lock ensures
 * exactly one instance is created even when called from parallel worker registration.
 */
export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    const boss = new PgBoss({
      connectionString: config.DATABASE_URL,
      // Reduce polling interval to keep queue responsive
      monitorIntervalSeconds: 30,
      // Let pg-boss manage its own schema migrations
      migrate: true,
    })

    boss.on("error", (err: Error) => {
      logger.error({ err: err.message }, "pg-boss error")
    })

    await boss.start()
    _boss = boss

    logger.info("pg-boss started")
    return boss
  })()

  return _initPromise
}

/**
 * Graceful shutdown — call on SIGTERM/SIGINT.
 */
export async function stopBoss(): Promise<void> {
  if (!_boss) return
  logger.info("pg-boss stopping...")
  await _boss.stop()
  _boss = null
  _initPromise = null
  logger.info("pg-boss stopped")
}
