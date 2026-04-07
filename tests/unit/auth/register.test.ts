/**
 * Unit tests: POST /api/v1/auth/register — NF-BETA-01 §14.1 + §14.3
 *
 * Tests the register endpoint in isolation using mocked DB and config.
 * No real DB or HTTP server required.
 *
 * NF-UNIT-476 through NF-UNIT-488
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Shared mocks ──────────────────────────────────────────────────────────────

const LOGGER_MOCK = {
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}

const BCRYPT_MOCK = {
  default: {
    hash:    vi.fn().mockResolvedValue("$2b$12$hashedpassword"),
    compare: vi.fn(),
  },
}

function makeApp(opts: {
  registrationEnabled: boolean
  existingUser?: Record<string, unknown> | null
  createUser?: Record<string, unknown>
}) {
  return async () => {
    // Set process.env directly — register route reads this at request time (not config singleton)
    process.env.REGISTRATION_ENABLED = opts.registrationEnabled ? "true" : "false"
    vi.doMock("../../../src/shared/config.js", () => ({
      config: {
        REGISTRATION_ENABLED: opts.registrationEnabled,
        BCRYPT_ROUNDS: 12,
        JWT_SECRET: "test-secret-32-chars-minimum-ok!",
      },
    }))
    vi.doMock("../../../src/shared/logger.js", () => LOGGER_MOCK)
    vi.doMock("bcryptjs", () => BCRYPT_MOCK)
    vi.doMock("../../../src/infra/db/repositories/operator-users.js", () => ({
      findOperatorUserByEmail: vi.fn().mockResolvedValue(opts.existingUser ?? null),
      createOperatorUser: vi.fn().mockResolvedValue(
        opts.createUser ?? {
          user_id:       "usr_01TESTID",
          email:         "test@example.com",
          roles:         ["admin"],
          product_ids:   [],
          display_name:  "test",
          password_hash: "$2b$12$hashedpassword",
          created_at:    new Date(),
          updated_at:    new Date(),
        }
      ),
    }))
    vi.doMock("../../../src/auth/jwt.js", () => ({
      signJwt: vi.fn().mockReturnValue("mock.jwt.token"),
    }))

    const { registerRouter } = await import("../../../src/api/v1/register.js")
    const { Hono } = await import("hono")
    const app = new Hono()
    app.route("/api/v1", registerRouter)
    return app
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function post(app: Awaited<ReturnType<ReturnType<typeof makeApp>>>, body: unknown) {
  return app.request("/api/v1/auth/register", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/auth/register (unit)", () => {

  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.restoreAllMocks(); delete process.env.REGISTRATION_ENABLED })

  // ── Registration disabled ──────────────────────────────────────────────────

  it("NF-UNIT-476: REGISTRATION_ENABLED=false → 404 REGISTRATION_DISABLED", async () => {
    const app = await makeApp({ registrationEnabled: false })()
    const res = await post(app, { email: "a@b.com", password: "password123" })
    expect(res.status).toBe(404)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe("REGISTRATION_DISABLED")
  })

  it("NF-UNIT-477: disabled returns 404 not 401 or 403", async () => {
    const app = await makeApp({ registrationEnabled: false })()
    const res = await post(app, { email: "a@b.com", password: "password123" })
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
    expect(res.status).toBe(404)
  })

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("NF-UNIT-478: valid registration → 201 with token and user", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { email: "new@example.com", password: "securePass1" })
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(typeof data.token).toBe("string")
    expect(data.user).toBeDefined()
  })

  it("NF-UNIT-479: new user always gets roles: [\"admin\"]", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { email: "admin@example.com", password: "securePass1" })
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    const user = data.user as Record<string, unknown>
    expect(user.roles).toEqual(["admin"])
  })

  it("NF-UNIT-480: displayName is optional — omitting it does not cause an error", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { email: "nodisplay@example.com", password: "securePass1" })
    expect(res.status).toBe(201)
  })

  it("NF-UNIT-481: displayName accepted when provided", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { email: "named@example.com", password: "securePass1", displayName: "Alice" })
    expect(res.status).toBe(201)
  })

  // ── Validation errors ──────────────────────────────────────────────────────

  it("NF-UNIT-482: password < 8 chars → 400 VALIDATION_ERROR", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { email: "a@b.com", password: "short" })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe("VALIDATION_ERROR")
  })

  it("NF-UNIT-483: invalid email format → 400 VALIDATION_ERROR", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { email: "not-an-email", password: "password123" })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe("VALIDATION_ERROR")
  })

  it("NF-UNIT-484: missing email → 400", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { password: "password123" })
    expect(res.status).toBe(400)
  })

  it("NF-UNIT-485: missing password → 400", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { email: "a@b.com" })
    expect(res.status).toBe(400)
  })

  it("NF-UNIT-486: invalid JSON body → 400 INVALID_BODY", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await app.request("/api/v1/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    "not json {{{",
    })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe("INVALID_BODY")
  })

  // ── Conflict ───────────────────────────────────────────────────────────────

  it("NF-UNIT-487: duplicate email → 409 CONFLICT", async () => {
    const app = await makeApp({
      registrationEnabled: true,
      existingUser: { user_id: "existing", email: "taken@example.com", roles: ["admin"], product_ids: [] },
    })()
    const res = await post(app, { email: "taken@example.com", password: "password123" })
    expect(res.status).toBe(409)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe("CONFLICT")
  })

  // ── Response shape ─────────────────────────────────────────────────────────

  it("NF-UNIT-488: response never includes password_hash", async () => {
    const app = await makeApp({ registrationEnabled: true })()
    const res = await post(app, { email: "safe@example.com", password: "securePass1" })
    const text = await res.text()
    expect(text).not.toContain("password_hash")
    expect(text).not.toContain("$2b$")
  })
})
