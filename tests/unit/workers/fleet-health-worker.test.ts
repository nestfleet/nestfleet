/**
 * Unit tests: FleetHealthWorker — NF-OPS-01 Phase 3.
 *
 * Covers:
 *   NF-UNIT-FHW-01: healthy instance (/health 200) → updateProvisioning called with last_health_status "ok"
 *   NF-UNIT-FHW-02: degraded instance (/health 503) → last_health_status "degraded"
 *   NF-UNIT-FHW-03: unreachable instance (fetch throws) → last_health_status "unreachable"
 *   NF-UNIT-FHW-04: unreachable for >2h → alert email sent to OPS_ALERT_EMAIL
 *   NF-UNIT-FHW-05: unreachable but <2h → no alert email sent
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports by vitest) ───────────────────────────

vi.mock("../../../src/infra/db/repositories/provisionings.js", () => ({
  listProvisionings:  vi.fn(),
  updateProvisioning: vi.fn(),
}))

vi.mock("../../../src/email/sender.js", () => ({
  sendEmail: vi.fn(),
}))

vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss: vi.fn(),
}))

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    PROVISIONING_ENABLED:  true,
    CUSTOMER_BASE_DOMAIN:  "nestfleet.dev",
    OPS_ALERT_EMAIL:       "ops@nestfleet.dev",
  },
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { checkInstanceHealth } from "../../../src/fleet/workers/fleet-health-worker.js"
import { updateProvisioning } from "../../../src/infra/db/repositories/provisionings.js"
import { sendEmail } from "../../../src/email/sender.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_DOMAIN = "nestfleet.dev"
const NOW = new Date("2026-04-05T12:00:00.000Z")

/** A provisioning that was last checked at a given ISO string, with a given health status. */
function makeProv(overrides: {
  last_health_status?: string | null
  last_health_check_at?: Date | null
} = {}) {
  return {
    id:                   "prov-1",
    org_slug:             "acme",
    customer_email:       "customer@acme.com",
    last_health_check_at: overrides.last_health_check_at ?? null,
    last_health_status:   overrides.last_health_status ?? null,
  }
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateProvisioning).mockResolvedValue({} as never)
  vi.mocked(sendEmail).mockResolvedValue(true)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkInstanceHealth()", () => {

  // NF-UNIT-FHW-01 ─────────────────────────────────────────────────────────────

  describe("NF-UNIT-FHW-01: healthy instance returns 200", () => {
    it("calls updateProvisioning with last_health_status 'ok'", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }))

      await checkInstanceHealth(makeProv(), BASE_DOMAIN, NOW)

      expect(updateProvisioning).toHaveBeenCalledOnce()
      expect(updateProvisioning).toHaveBeenCalledWith(
        "prov-1",
        expect.objectContaining({ last_health_status: "ok" }),
      )
    })

    it("returns 'ok'", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }))

      const result = await checkInstanceHealth(makeProv(), BASE_DOMAIN, NOW)

      expect(result).toBe("ok")
    })

    it("does not send an alert email when healthy", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }))

      await checkInstanceHealth(makeProv(), BASE_DOMAIN, NOW)

      expect(sendEmail).not.toHaveBeenCalled()
    })
  })

  // NF-UNIT-FHW-02 ─────────────────────────────────────────────────────────────

  describe("NF-UNIT-FHW-02: degraded instance returns 5xx", () => {
    it("calls updateProvisioning with last_health_status 'degraded' on 503", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }))

      await checkInstanceHealth(makeProv(), BASE_DOMAIN, NOW)

      expect(updateProvisioning).toHaveBeenCalledWith(
        "prov-1",
        expect.objectContaining({ last_health_status: "degraded" }),
      )
    })

    it("returns 'degraded' on 500", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))

      const result = await checkInstanceHealth(makeProv(), BASE_DOMAIN, NOW)

      expect(result).toBe("degraded")
    })
  })

  // NF-UNIT-FHW-03 ─────────────────────────────────────────────────────────────

  describe("NF-UNIT-FHW-03: unreachable instance — fetch throws", () => {
    it("calls updateProvisioning with last_health_status 'unreachable'", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

      await checkInstanceHealth(makeProv(), BASE_DOMAIN, NOW)

      expect(updateProvisioning).toHaveBeenCalledWith(
        "prov-1",
        expect.objectContaining({ last_health_status: "unreachable" }),
      )
    })

    it("returns 'unreachable' when fetch throws", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")))

      const result = await checkInstanceHealth(makeProv(), BASE_DOMAIN, NOW)

      expect(result).toBe("unreachable")
    })

    it("persists last_health_check_at as the 'now' argument", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

      await checkInstanceHealth(makeProv(), BASE_DOMAIN, NOW)

      expect(updateProvisioning).toHaveBeenCalledWith(
        "prov-1",
        expect.objectContaining({ last_health_check_at: NOW }),
      )
    })
  })

  // NF-UNIT-FHW-04 ─────────────────────────────────────────────────────────────

  describe("NF-UNIT-FHW-04: unreachable for > 2 hours → alert email sent", () => {
    it("calls sendEmail when unreachable and previously unreachable for >2h", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

      // last_health_check_at was 3 hours ago, was already unreachable
      const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000)
      const prov = makeProv({
        last_health_status:   "unreachable",
        last_health_check_at: threeHoursAgo,
      })

      await checkInstanceHealth(prov, BASE_DOMAIN, NOW)

      expect(sendEmail).toHaveBeenCalledOnce()
    })

    it("alert email is addressed to OPS_ALERT_EMAIL", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

      const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000)
      const prov = makeProv({
        last_health_status:   "unreachable",
        last_health_check_at: threeHoursAgo,
      })

      await checkInstanceHealth(prov, BASE_DOMAIN, NOW)

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "ops@nestfleet.dev" }),
      )
    })

    it("alert email subject includes the org_slug", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

      const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000)
      const prov = makeProv({
        last_health_status:   "unreachable",
        last_health_check_at: threeHoursAgo,
      })

      await checkInstanceHealth(prov, BASE_DOMAIN, NOW)

      const call = vi.mocked(sendEmail).mock.calls[0][0]
      expect(call.subject).toContain("acme")
    })
  })

  // NF-UNIT-FHW-05 ─────────────────────────────────────────────────────────────

  describe("NF-UNIT-FHW-05: unreachable but < 2 hours → no alert email", () => {
    it("does not call sendEmail when down for only 30 minutes", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

      const thirtyMinsAgo = new Date(NOW.getTime() - 30 * 60 * 1000)
      const prov = makeProv({
        last_health_status:   "unreachable",
        last_health_check_at: thirtyMinsAgo,
      })

      await checkInstanceHealth(prov, BASE_DOMAIN, NOW)

      expect(sendEmail).not.toHaveBeenCalled()
    })

    it("does not call sendEmail on first-ever unreachable check (no prior check_at)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

      const prov = makeProv({
        last_health_status:   null,
        last_health_check_at: null,
      })

      await checkInstanceHealth(prov, BASE_DOMAIN, NOW)

      expect(sendEmail).not.toHaveBeenCalled()
    })

    it("does not call sendEmail when previous status was 'ok' (first transition to unreachable)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

      // Even if last_health_check_at was 3 hours ago, if previous status was 'ok'
      // the downMs calculation yields 0 (wasAlreadyUnreachable is false)
      const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000)
      const prov = makeProv({
        last_health_status:   "ok",
        last_health_check_at: threeHoursAgo,
      })

      await checkInstanceHealth(prov, BASE_DOMAIN, NOW)

      expect(sendEmail).not.toHaveBeenCalled()
    })
  })
})
