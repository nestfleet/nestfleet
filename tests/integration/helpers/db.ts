/**
 * Integration test database helper.
 *
 * Spins up a throwaway PostgreSQL container with pgvector, runs all migrations,
 * and injects the test DB into the application's db client module.
 *
 * Usage:
 *   const ctx = await setupTestDb()
 *   // ... tests ...
 *   await ctx.teardown()
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import postgres from "postgres"
import { setDb, closeDb } from "../../../src/infra/db/client.js"
import { runMigrations } from "../../../src/infra/db/migrate.js"

export interface TestDbContext {
  db: postgres.Sql
  container: StartedPostgreSqlContainer
  teardown: () => Promise<void>
}

export async function setupTestDb(): Promise<TestDbContext> {
  // Use pgvector image to match production (ADR-006)
  const container = await new PostgreSqlContainer("pgvector/pgvector:pg16")
    .withDatabase("nestfleet_test")
    .withUsername("nestfleet_test")
    .withPassword("nestfleet_test")
    .start()

  const connectionUrl = container.getConnectionUri()

  const db = postgres(connectionUrl, {
    max: 5,
    idle_timeout: 10,
  })

  // Inject into app's db singleton so all app code uses the test DB
  setDb(db)

  // Run migrations against the test DB
  await runMigrations(db)

  const teardown = async () => {
    await closeDb()
    await db.end({ timeout: 5 })
    await container.stop()
    // Reset injection so next test gets a fresh state
    setDb(null as unknown as postgres.Sql)
  }

  return { db, container, teardown }
}
