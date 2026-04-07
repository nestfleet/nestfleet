/**
 * Unit tests: GET /.well-known/security.txt — NF-BETA-01 §14.3
 *
 * NF-UNIT-489 through NF-UNIT-492
 */

import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    JWT_SECRET:          "test-secret-32-chars-minimum-ok!",
    ENCRYPTION_KEY:      "a".repeat(64),
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
vi.mock("../../../src/infra/telemetry.js", () => ({ initTelemetry: vi.fn() }))

describe("GET /.well-known/security.txt (unit)", () => {
  let app: Awaited<ReturnType<typeof import("../../../src/api/index.js").default>>

  beforeAll(async () => {
    const mod = await import("../../../src/api/index.js")
    app = mod.app
  })

  it("NF-UNIT-489: returns 200 OK", async () => {
    const res = await app.request("/.well-known/security.txt")
    expect(res.status).toBe(200)
  })

  it("NF-UNIT-490: Content-Type is text/plain", async () => {
    const res = await app.request("/.well-known/security.txt")
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/)
  })

  it("NF-UNIT-491: contains Contact field with security email", async () => {
    const res = await app.request("/.well-known/security.txt")
    const text = await res.text()
    expect(text).toContain("Contact: mailto:security@nestfleet.dev")
  })

  it("NF-UNIT-492: Expires field is in the future (within 366 days)", async () => {
    const res = await app.request("/.well-known/security.txt")
    const text = await res.text()
    const match = text.match(/Expires: (.+)/)
    expect(match).not.toBeNull()
    const expiresDate = new Date(match![1])
    expect(expiresDate.getTime()).toBeGreaterThan(Date.now())
    const maxFuture = Date.now() + 366 * 24 * 60 * 60 * 1000
    expect(expiresDate.getTime()).toBeLessThan(maxFuture)
  })
})
