/**
 * Integration tests: GET /health
 *
 * Tests the health endpoint against a real PostgreSQL container.
 * Verifies: response shape, DB connectivity, correct status codes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"

describe("GET /health (integration)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
  })

  afterAll(async () => {
    await ctx.teardown()
  })

  it("NF-INT-01: returns 200 with status ok when DB is reachable", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body.status).toBe("ok")
    expect(body.service).toBe("nestfleet")
    expect(body.version).toBe("0.1.0")
    expect(body.db).toBe("ok")
    expect(typeof body.timestamp).toBe("string")
    // Timestamp must be a valid ISO date
    expect(() => new Date(body.timestamp as string)).not.toThrow()
  })

  it("NF-INT-02: migrations table exists after startup", async () => {
    const rows = await ctx.db<{ filename: string }[]>`
      SELECT filename FROM nestfleet_migrations ORDER BY filename
    `
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0]?.filename).toBe("0001_init.sql")
  })

  it("NF-INT-03: pgvector extension is enabled", async () => {
    const rows = await ctx.db<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `
    expect(rows.length).toBe(1)
    expect(rows[0]?.extname).toBe("vector")
  })

  it("NF-INT-04: uuid-ossp extension is enabled", async () => {
    const rows = await ctx.db<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'
    `
    expect(rows.length).toBe(1)
    expect(rows[0]?.extname).toBe("uuid-ossp")
  })
})
