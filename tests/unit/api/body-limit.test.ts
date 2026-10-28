/**
 * Unit tests: request body size limits — OPS-M-09
 *
 * Bounds the zod 3 array-validation memory DoS (GHSA-mrhx-c7xc-m3w5) on the
 * routes that parse array schemas, plus a global /api/* cap.
 *
 * NF-UNIT-493 through NF-UNIT-499
 */

import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:          "test-secret-32-chars-minimum-ok!",
    SECRET_ENCRYPTION_KEY:      "a".repeat(64),
    DATABASE_URL:        "postgres://localhost/nestfleet_test",
    LLM_PROVIDER:        "anthropic",
    LLM_API_KEY:         "sk-ant-test",
    NODE_ENV:            "test",
    PORT:                3001,
    BCRYPT_ROUNDS:       12,
    REGISTRATION_ENABLED: false,
    BILLING_ENABLED:     false,
    NESTFLEET_CLOUD_URL: "https://cloud.nestfleet.dev",
  },
}))
vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
vi.mock("../../../src/infra/db/client.js", () => ({
  db: {},
  setDb: vi.fn(),
  closeDb: vi.fn(),
}))
vi.mock("../../../src/infra/db/migrate.js", () => ({ runMigrations: vi.fn() }))
vi.mock("../../../src/infra/queue/boss.js", () => ({ getBoss: vi.fn(), initBoss: vi.fn() }))

const KB = 1024
const MB = 1024 * KB

/** JSON body of roughly `bytes` size: a large array, the shape the advisory abuses. */
function bodyOfSize(bytes: number): string {
  return JSON.stringify({ roles: new Array(Math.ceil(bytes / 2)).fill(0) })
}

describe("request body limits (unit)", () => {
  let app: Awaited<typeof import("../../../src/api/index.js")>["app"]

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  const post = (path: string, body: string, method = "POST") =>
    app.request(path, { method, body, headers: { "Content-Type": "application/json" } })

  it("NF-UNIT-493: POST /api/v1/users over 64 KB → 413 JSON error", async () => {
    const res = await post("/api/v1/users", bodyOfSize(100 * KB))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: "PAYLOAD_TOO_LARGE", message: "Request body too large" })
  })

  it("NF-UNIT-494: PUT /api/v1/users/:id over 64 KB → 413", async () => {
    const res = await post("/api/v1/users/u1", bodyOfSize(100 * KB), "PUT")
    expect(res.status).toBe(413)
  })

  it("NF-UNIT-495: PUT notification-preferences over 64 KB → 413", async () => {
    const res = await post("/api/v1/products/p1/notification-preferences", bodyOfSize(100 * KB), "PUT")
    expect(res.status).toBe(413)
  })

  it("NF-UNIT-496: POST knowledge-assets over 1 MB → 413, under 1 MB passes the limit", async () => {
    expect((await post("/api/v1/products/p1/knowledge-assets", bodyOfSize(2 * MB))).status).toBe(413)
    expect((await post("/api/v1/products/p1/knowledge-assets", bodyOfSize(200 * KB))).status).not.toBe(413)
  })

  it("NF-UNIT-497: any /api/* route over 5 MB → 413", async () => {
    const res = await post("/api/v1/products/p1/cases", bodyOfSize(6 * MB))
    expect(res.status).toBe(413)
  })

  it("NF-UNIT-498: /api/* route between 64 KB and 5 MB is not limited (e.g. product memory content)", async () => {
    const res = await post("/api/v1/products/p1/memory/ingest", JSON.stringify({ content: "x".repeat(2 * MB) }))
    expect(res.status).not.toBe(413)
  })

  it("NF-UNIT-499: small body on a limited route reaches the handler (auth rejects, not the limit)", async () => {
    const res = await post("/api/v1/users", JSON.stringify({ roles: ["viewer"] }))
    expect(res.status).not.toBe(413)
    expect(res.status).toBe(401)
  })
})
