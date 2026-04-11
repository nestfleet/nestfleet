/**
 * Integration tests: Telemetry ping pipeline — NF-INT-TEL-01..04.
 *
 * Uses a real PostgreSQL container (via Testcontainers) with full migrations.
 * No DB mocks — all assertions hit the real test DB through the repository layer.
 *
 * NF-INT-TEL-01  POST /api/v1/telemetry/ping persists a row and it is
 *                  retrievable via getRecentTelemetry
 * NF-INT-TEL-02  GET /api/v1/owner/telemetry returns correct activeInstances
 *                  count for pings within the last 24 h
 * NF-INT-TEL-03  Multiple pings from the same instanceId are stored separately
 *                  (not deduplicated); countDistinctInstances counts distinct IDs
 * NF-INT-TEL-04  POST /api/v1/telemetry/ping returns 400 for a body that is
 *                  missing the required instanceId field
 *
 * Rate-limiter note:
 *   The in-memory rate limiter is keyed by the value of the x-forwarded-for
 *   header (falls back to "unknown"). To prevent cross-test interference each
 *   test that exercises the ping endpoint uses a unique fake IP via that header.
 *   The limit is 10 req / 60 s per key, so a unique IP per test is sufficient.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import type { TestDbContext } from "./helpers/db.js"
import { setupTestDb } from "./helpers/db.js"
import { app } from "../../src/api/index.js"
import {
  getRecentTelemetry,
  countDistinctInstances,
} from "../../src/infra/db/repositories/telemetry.js"

// ── Config mock ───────────────────────────────────────────────────────────────
// Must be declared before any module that reads config at import time.
// Mirrors the pattern from tests/integration/owner-revenue.test.ts.
// NOTE: Do NOT mock db/client or db/migrate — setupTestDb injects the real
// test DB connection via setDb() and calls the real runMigrations().

vi.mock("../../src/shared/config.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/shared/config.js")>()
  return {
    config: {
      ...original.config,
      PROVISIONING_ENABLED:         true,
      OWNER_USER_IDS:               "tel-owner-001",
      JWT_SECRET:                   "integration-test-jwt-secret-minimum-32-chars-xx",
      HETZNER_API_TOKEN:            "test-hetzner-token",
      HETZNER_FIREWALL_ID:          999,
      CLOUDFLARE_API_TOKEN:         "test-cf-token",
      CLOUDFLARE_ZONE_ID:           "test-zone-id",
      CUSTOMER_BASE_DOMAIN:         "nestfleet.io",
      OPS_ALERT_EMAIL:              "ops@nestfleet.io",
      OPS_SSH_PUBLIC_KEY:           "ssh-ed25519 AAAA test",
      BUNDLED_LLM_API_KEY:          "sk-ant-test",
      BUNDLED_EMBEDDING_API_KEY:    "sk-oai-test",
      STRIPE_SECRET_KEY:            "sk_test_fake",
      STRIPE_PRICE_STARTER_MONTHLY: "price_starter_test",
    },
  }
})

// ── Mocks for modules the owner router imports (no real network needed) ───────

vi.mock("../../src/email/sender.js", () => ({
  sendEmail:     vi.fn().mockResolvedValue(true),
  notifyNewCase: vi.fn().mockResolvedValue(undefined),
  sendReply:     vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../src/fleet/provisioning/hetzner-client.js", () => ({
  createHetznerClient: vi.fn().mockReturnValue({ resetServer: vi.fn() }),
}))

vi.mock("../../src/fleet/provisioning/deprovision.js", () => ({
  deprovisionOne:      vi.fn().mockResolvedValue(undefined),
  startDeprovisioning: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../src/fleet/workers/provisioning-worker.js", () => ({
  PROVISION_JOB:              "provision_vps",
  registerProvisioningWorker: vi.fn(),
}))

vi.mock("../../src/fleet/provisioning/cloud-init.js", () => ({
  generateCloudInit: vi.fn().mockResolvedValue("#cloud-config\nruncmd: []"),
}))

vi.mock("../../src/billing/stripe.js", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    subscriptions: {
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    },
  }),
}))

vi.mock("../../src/billing/stripe-revenue.js", () => ({
  aggregateRevenue: vi.fn().mockResolvedValue({
    mrrCents:     0,
    arrCents:     0,
    paidCount:    0,
    trialCount:   0,
    churn30d:     0,
    weeklySeries: [],
  }),
  buildCohorts: vi.fn().mockResolvedValue([]),
}))

vi.mock("stripe", () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: "cs_test_mock", url: "https://checkout.stripe.com/test" }),
      },
    },
  }))
  return { default: MockStripe }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeOwnerToken(): Promise<string> {
  const { signJwt } = await import("../../src/auth/jwt.js")
  return signJwt({ sub: "tel-owner-001", email: "owner@test.com", roles: [], productIds: [] })
}

function ownerAuthHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

/**
 * POST /api/v1/telemetry/ping with a unique x-forwarded-for IP so each test
 * operates in its own rate-limit bucket (10 req / 60 s per IP).
 */
async function postPing(
  body: Record<string, unknown>,
  fakeIp: string,
): Promise<Response> {
  return app.request("/api/v1/telemetry/ping", {
    method:  "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-forwarded-for": fakeIp,
    },
    body: JSON.stringify(body),
  })
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Telemetry ping pipeline (integration)", () => {
  let ctx: TestDbContext

  beforeAll(async () => {
    ctx = await setupTestDb()
  }, 120_000)   // extra time for Docker image pull on first run

  afterAll(async () => {
    await ctx.teardown()
  })

  // ── NF-INT-TEL-01 ──────────────────────────────────────────────────────────

  it(
    "NF-INT-TEL-01: POST /api/v1/telemetry/ping persists a row retrievable via getRecentTelemetry",
    async () => {
      const instanceId = "nf-int-tel-01-instance"
      const version    = "1.2.3"

      const res = await postPing(
        { instanceId, version, payload: { env: "integration-test" } },
        "10.0.0.1",
      )

      expect(res.status).toBe(200)
      const resBody = await res.json() as Record<string, unknown>
      expect(resBody.ok).toBe(true)

      // Verify the row was actually written to the DB
      const since = new Date(Date.now() - 60_000)   // last 60 seconds
      const rows  = await getRecentTelemetry(since)

      const inserted = rows.find((r) => r.instance_id === instanceId && r.version === version)
      expect(inserted).toBeDefined()
      expect(inserted!.payload).toMatchObject({ env: "integration-test" })
    },
  )

  // ── NF-INT-TEL-02 ──────────────────────────────────────────────────────────

  it(
    "NF-INT-TEL-02: GET /api/v1/owner/telemetry returns correct activeInstances for pings within 24 h",
    async () => {
      // Insert two pings from distinct instances so we have a known baseline
      const ip1 = "10.0.0.2"
      const ip2 = "10.0.0.3"

      await postPing({ instanceId: "nf-int-tel-02-instance-A", version: "2.0.0" }, ip1)
      await postPing({ instanceId: "nf-int-tel-02-instance-B", version: "2.0.0" }, ip2)

      // Capture count before the owner API call so we know the minimum expected value
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const directCount = await countDistinctInstances(since)

      const token = await makeOwnerToken()
      const res = await app.request("/api/v1/owner/telemetry", {
        method:  "GET",
        headers: ownerAuthHeader(token),
      })

      expect(res.status).toBe(200)

      const body = await res.json() as {
        ok:   boolean
        data: {
          activeInstances:     number
          versionDistribution: Array<{ version: string; count: number }>
          instances:           Array<{ instanceId: string; lastSeenAt: string }>
          since:               string
        }
      }

      expect(body.ok).toBe(true)
      // The API and the direct count must agree
      expect(body.data.activeInstances).toBe(directCount)
      // Both new instances must appear in the instances list
      const ids = body.data.instances.map((i) => i.instanceId)
      expect(ids).toContain("nf-int-tel-02-instance-A")
      expect(ids).toContain("nf-int-tel-02-instance-B")
    },
  )

  // ── NF-INT-TEL-03 ──────────────────────────────────────────────────────────

  it(
    "NF-INT-TEL-03: multiple pings from the same instanceId are stored as separate rows; countDistinctInstances counts distinct IDs only",
    async () => {
      const instanceId = "nf-int-tel-03-repeated-instance"
      const ip         = "10.0.0.4"

      // Insert three pings from the same instance
      await postPing({ instanceId, version: "3.0.0" }, ip)
      await postPing({ instanceId, version: "3.0.1" }, ip)
      await postPing({ instanceId, version: "3.0.2" }, ip)

      const since = new Date(Date.now() - 60_000)   // last 60 seconds
      const rows  = await getRecentTelemetry(since)

      const rowsForInstance = rows.filter((r) => r.instance_id === instanceId)

      // All three pings must be stored as separate rows (no deduplication)
      expect(rowsForInstance.length).toBeGreaterThanOrEqual(3)

      // The total row count in the window must exceed the distinct instance count,
      // proving that rows are not deduplicated (this instance alone contributes 3 rows
      // but only 1 distinct instance_id).
      const distinctCount = await countDistinctInstances(since)
      const totalRows = rows.length
      expect(totalRows).toBeGreaterThan(distinctCount)
    },
  )

  // ── NF-INT-TEL-04 ──────────────────────────────────────────────────────────

  it(
    "NF-INT-TEL-04: POST /api/v1/telemetry/ping returns 400 when instanceId is missing from the request body",
    async () => {
      // Send a body with version but no instanceId
      const res = await postPing(
        { version: "4.0.0" },
        "10.0.0.5",
      )

      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body.ok).toBe(false)
    },
  )

  // ── Additional edge-case: empty string instanceId is also invalid ───────────

  it(
    "NF-INT-TEL-04b: POST /api/v1/telemetry/ping returns 400 when instanceId is an empty string",
    async () => {
      const res = await postPing(
        { instanceId: "", version: "4.0.0" },
        "10.0.0.6",
      )

      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body.ok).toBe(false)
    },
  )

  // ── Additional edge-case: missing version is also invalid ──────────────────

  it(
    "NF-INT-TEL-04c: POST /api/v1/telemetry/ping returns 400 when version is missing from the request body",
    async () => {
      const res = await postPing(
        { instanceId: "some-valid-instance" },
        "10.0.0.7",
      )

      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body.ok).toBe(false)
    },
  )

  // ── Additional edge-case: completely empty body ────────────────────────────

  it(
    "NF-INT-TEL-04d: POST /api/v1/telemetry/ping returns 400 when the body is an empty object",
    async () => {
      const res = await postPing({}, "10.0.0.8")

      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body.ok).toBe(false)
    },
  )

  // ── Auth guard: owner telemetry endpoint requires a valid owner JWT ─────────

  it(
    "NF-INT-TEL-05: GET /api/v1/owner/telemetry returns 401 when no Authorization header is provided",
    async () => {
      const res = await app.request("/api/v1/owner/telemetry", {
        method: "GET",
      })

      expect(res.status).toBe(401)
    },
  )

  it(
    "NF-INT-TEL-06: GET /api/v1/owner/telemetry returns 403 when the JWT sub is not in OWNER_USER_IDS",
    async () => {
      const { signJwt } = await import("../../src/auth/jwt.js")
      const token = signJwt({ sub: "not-an-owner-999", email: "other@test.com", roles: [], productIds: [] })

      const res = await app.request("/api/v1/owner/telemetry", {
        method:  "GET",
        headers: ownerAuthHeader(token),
      })

      expect(res.status).toBe(403)
    },
  )
})
