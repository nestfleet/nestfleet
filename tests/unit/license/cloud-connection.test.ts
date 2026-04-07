/**
 * NF-PIVOT Phase 1: Simplified CloudConnection tests.
 *
 * After NF-PIVOT-02 the CloudConnection:
 *  - Has no dependency on platformcloud-client SDK (no PlanLockLoop, no HeartbeatSender)
 *  - Exposes only fetchUpdateManifest() as its primary method
 *  - startBackgroundSync() only calls fetchUpdateManifest()
 *  - pushCapabilities(), reportOuUsage(), and refreshLicense() are REMOVED
 *  - Constructor accepts no writePlan callback
 *
 * These tests FAIL against the current codebase and PASS after the rewrite.
 *
 * NF-PIV-10  CloudConnection has no pushCapabilities method
 * NF-PIV-11  CloudConnection has no reportOuUsage method
 * NF-PIV-12  CloudConnection has no refreshLicense method
 * NF-PIV-13  fetchUpdateManifest fetches from NESTFLEET_CLOUD_URL (not PLATFORM_CLOUD_URL)
 * NF-PIV-14  fetchUpdateManifest returns null on network error (never throws)
 * NF-PIV-15  fetchUpdateManifest returns null on non-200 response
 * NF-PIV-16  fetchUpdateManifest returns null on malformed JSON shape
 * NF-PIV-17  fetchUpdateManifest returns UpdateManifest on valid response
 * NF-PIV-18  startBackgroundSync only triggers fetchUpdateManifest (no PlanLockLoop)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { CloudConnection } from "../../../src/license/cloud-connection.js"

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("../../../src/shared/config.js", () => ({
  config: {
    NESTFLEET_CLOUD_URL: "https://cloud.nestfleet.test",
    NESTFLEET_LICENSE_KEY: undefined,
    TELEMETRY_ENABLED: false,
    NODE_ENV: "test",
  },
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeManifestResponse(overrides: Record<string, unknown> = {}) {
  return {
    latestVersion: "0.2.0",
    releaseNotes: "Bug fixes",
    updateUrl: "https://github.com/nestfleet/nestfleet/releases/tag/v0.2.0",
    securityAlert: false,
    ...overrides,
  }
}

function makeFetch(status = 200, body: unknown = makeManifestResponse()): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  })
}

describe("CloudConnection (simplified — NF-PIVOT-02)", () => {
  let conn: CloudConnection
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    conn = new CloudConnection()
    mockFetch = makeFetch()
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(() => {
    conn.stop()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ── NF-PIV-10: pushCapabilities removed ───────────────────────────────────
  it("NF-PIV-10: does not expose pushCapabilities method", () => {
    expect((conn as unknown as Record<string, unknown>)["pushCapabilities"]).toBeUndefined()
  })

  // ── NF-PIV-11: reportOuUsage removed ──────────────────────────────────────
  it("NF-PIV-11: does not expose reportOuUsage method", () => {
    expect((conn as unknown as Record<string, unknown>)["reportOuUsage"]).toBeUndefined()
  })

  // ── NF-PIV-12: refreshLicense removed ─────────────────────────────────────
  it("NF-PIV-12: does not expose refreshLicense method", () => {
    expect((conn as unknown as Record<string, unknown>)["refreshLicense"]).toBeUndefined()
  })

  // ── NF-PIV-13: fetchUpdateManifest uses NESTFLEET_CLOUD_URL ───────────────
  it("NF-PIV-13: fetchUpdateManifest fetches from NESTFLEET_CLOUD_URL, not PLATFORM_CLOUD_URL", async () => {
    await conn.fetchUpdateManifest()

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain("cloud.nestfleet.test")
    expect(url).not.toContain("platform.test")
  })

  // ── NF-PIV-14: never throws on network failure ────────────────────────────
  it("NF-PIV-14: fetchUpdateManifest returns null on network error (never throws)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("connection refused"))
    await expect(conn.fetchUpdateManifest()).resolves.toBeNull()
  })

  // ── NF-PIV-15: non-200 → null ─────────────────────────────────────────────
  it("NF-PIV-15: fetchUpdateManifest returns null on non-200 response", async () => {
    vi.stubGlobal("fetch", makeFetch(503))
    await expect(conn.fetchUpdateManifest()).resolves.toBeNull()
  })

  // ── NF-PIV-16: malformed shape → null ────────────────────────────────────
  it("NF-PIV-16: fetchUpdateManifest returns null when response shape is wrong", async () => {
    vi.stubGlobal("fetch", makeFetch(200, { unexpected: "shape" }))
    await expect(conn.fetchUpdateManifest()).resolves.toBeNull()
  })

  // ── NF-PIV-17: valid response → UpdateManifest ───────────────────────────
  it("NF-PIV-17: fetchUpdateManifest returns parsed UpdateManifest on valid response", async () => {
    const manifest = await conn.fetchUpdateManifest()

    expect(manifest).not.toBeNull()
    expect(manifest!.latestVersion).toBe("0.2.0")
    expect(manifest!.releaseNotes).toBe("Bug fixes")
    expect(manifest!.securityAlert).toBe(false)
    expect(typeof manifest!.updateUrl).toBe("string")
  })

  // ── NF-PIV-17b: securityMessage included when present ────────────────────
  it("NF-PIV-17b: fetchUpdateManifest includes securityMessage when present", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(200, makeManifestResponse({ securityAlert: true, securityMessage: "CVE-2026-XXXX" })),
    )

    const manifest = await conn.fetchUpdateManifest()
    expect(manifest!.securityAlert).toBe(true)
    expect(manifest!.securityMessage).toBe("CVE-2026-XXXX")
  })

  // ── NF-PIV-18: startBackgroundSync only triggers manifest fetch ───────────
  it("NF-PIV-18: startBackgroundSync triggers fetchUpdateManifest and nothing else", async () => {
    await conn.startBackgroundSync()

    // Should have called fetch once (manifest) — no capability push, no license refresh
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain("/api/v1/updates/manifest")
  })
})
