/**
 * Unit tests: license-reissue-worker — FEAT-012.
 *
 * NF-UNIT-REISSUE-01  happy path: signs JWT, SSH writes file, restarts API, polls, marks complete
 * NF-UNIT-REISSUE-02  SSH write failure → marks reissue failed, retains pending_jwt
 * NF-UNIT-REISSUE-03  SSH exec (restart) failure → marks failed
 * NF-UNIT-REISSUE-04  poll timeout → marks failed after max attempts
 * NF-UNIT-REISSUE-05  provisioning not active → marks failed immediately, no SSH
 * NF-UNIT-REISSUE-06  provisioning not found → marks failed
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../../src/infra/db/repositories/provisionings.js", () => ({
  findProvisioningBySlug: vi.fn(),
  updateProvisioning:     vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/infra/db/repositories/license-reissues.js", () => ({
  findLicenseReissueById: vi.fn(),
  updateLicenseReissue:   vi.fn().mockResolvedValue(undefined),
  createLicenseReissue:   vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../src/license/issuer.js", () => ({
  issueLicenseToken: vi.fn().mockReturnValue("signed.jwt.token"),
}))

vi.mock("../../../src/fleet/ssh-exec.js", () => ({
  sshWriteFile: vi.fn().mockResolvedValue(undefined),
  sshExec:      vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
}))

vi.mock("../../../src/shared/crypto.js", () => ({
  decryptSecret: vi.fn().mockImplementation((s: string) => s),
}))

vi.mock("../../../src/shared/config.js", () => ({
  config: {
    ENCRYPTION_KEY:        "0".repeat(64),
    FLEET_SSH_PRIVATE_KEY: "fake-private-key",
    FLEET_SSH_USER:        "root",
    CUSTOMER_BASE_DOMAIN:  "nestfleet.dev",
  },
  getFleetSshPrivateKey: vi.fn().mockReturnValue("fake-private-key"),
}))

vi.mock("../../../src/shared/logger.js", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

vi.mock("../../../src/infra/queue/boss.js", () => ({
  getBoss: vi.fn(),
}))

// Mock global fetch for poll
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Import after mocks
import {
  findProvisioningBySlug,
  updateProvisioning,
} from "../../../src/infra/db/repositories/provisionings.js"
import {
  findLicenseReissueById,
  updateLicenseReissue,
} from "../../../src/infra/db/repositories/license-reissues.js"
import { issueLicenseToken } from "../../../src/license/issuer.js"
import { sshWriteFile, sshExec } from "../../../src/fleet/ssh-exec.js"
import { executeLicenseReissue } from "../../../src/fleet/workers/license-reissue-worker.js"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROV_ID   = "prov_abc123"
const REISSUE_ID = "reissue_xyz789"
const SLUG      = "acme"

const SECRETS_JSON = JSON.stringify({
  postgresPassword: "a".repeat(64),
  jwtSecret:        "b".repeat(64),
  encryptionKey:    "c".repeat(64),
  licenseSecret:    "d".repeat(32),
})

const mockProv = {
  id:                PROV_ID,
  org_slug:          SLUG,
  customer_email:    "ops@acme.com",
  plan:              "starter",
  status:            "active",
  hetzner_server_ip: "10.0.0.1",
  license_tier:      "starter",
  license_expires_at: new Date("2026-12-31"),
  reissue_status:    "in_progress",
  secrets_enc:       SECRETS_JSON,
}

const mockReissue = {
  id:                  REISSUE_ID,
  provisioning_id:     PROV_ID,
  performed_by:        "owner_user_1",
  previous_tier:       "starter",
  new_tier:            "growth",
  new_expires_at:      new Date("2027-04-08"),
  reason:              "Upgrade requested by customer",
  status:              "pending",
  pending_jwt:         null,
}

const PAYLOAD = {
  reissueId:      REISSUE_ID,
  provisioningId: PROV_ID,
  slug:           SLUG,
  newTier:        "growth" as const,
  newExpiresAt:   "2027-04-08T00:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findProvisioningBySlug).mockResolvedValue(mockProv as never)
  vi.mocked(findLicenseReissueById).mockResolvedValue(mockReissue as never)
  vi.mocked(issueLicenseToken).mockReturnValue("signed.jwt.token")
  vi.mocked(sshWriteFile).mockResolvedValue(undefined)
  vi.mocked(sshExec).mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" })
  // Default poll: returns new tier immediately
  mockFetch.mockResolvedValue({
    ok:   true,
    json: async () => ({ ok: true, data: { tier: "growth" } }),
  })
})

describe("executeLicenseReissue", () => {
  it("NF-UNIT-REISSUE-01: happy path — signs, SSH write, restart, poll, mark complete", async () => {
    await executeLicenseReissue(PAYLOAD)

    // JWT was signed with new tier + expiry
    expect(issueLicenseToken).toHaveBeenCalledWith(expect.objectContaining({
      slug:  SLUG,
      plan:  "growth",
    }))

    // JWT written to VPS
    expect(sshWriteFile).toHaveBeenCalledWith(
      expect.objectContaining({ host: "10.0.0.1" }),
      "/opt/nestfleet/license.jwt",
      "signed.jwt.token",
    )

    // API restarted
    expect(sshExec).toHaveBeenCalledWith(
      expect.objectContaining({ host: "10.0.0.1" }),
      expect.stringContaining("restart api"),
    )

    // DB: reissue marked complete
    expect(updateLicenseReissue).toHaveBeenCalledWith(
      REISSUE_ID,
      expect.objectContaining({ status: "complete", pending_jwt: null }),
    )

    // DB: provisioning license_tier updated
    expect(updateProvisioning).toHaveBeenCalledWith(
      PROV_ID,
      expect.objectContaining({ license_tier: "growth", reissue_status: "idle" }),
    )
  })

  it("NF-UNIT-REISSUE-02: SSH write failure → marks failed, retains pending_jwt", async () => {
    vi.mocked(sshWriteFile).mockRejectedValue(new Error("Permission denied"))

    await executeLicenseReissue(PAYLOAD)

    expect(updateLicenseReissue).toHaveBeenCalledWith(
      REISSUE_ID,
      expect.objectContaining({
        status:       "failed",
        failed_reason: expect.stringContaining("Permission denied"),
        pending_jwt:  "signed.jwt.token",
      }),
    )
    expect(updateProvisioning).toHaveBeenCalledWith(
      PROV_ID,
      expect.objectContaining({ reissue_status: "failed" }),
    )
    // No restart attempted
    expect(sshExec).not.toHaveBeenCalled()
  })

  it("NF-UNIT-REISSUE-03: SSH exec (restart) failure → marks failed", async () => {
    vi.mocked(sshExec).mockRejectedValue(new Error("exited with code 1"))

    await executeLicenseReissue(PAYLOAD)

    expect(updateLicenseReissue).toHaveBeenCalledWith(
      REISSUE_ID,
      expect.objectContaining({
        status:       "failed",
        failed_reason: expect.stringContaining("exited with code 1"),
        pending_jwt:  "signed.jwt.token",
      }),
    )
  })

  it("NF-UNIT-REISSUE-04: poll timeout → marks failed after max attempts", async () => {
    // Poll always returns old tier
    mockFetch.mockResolvedValue({
      ok:   true,
      json: async () => ({ ok: true, data: { tier: "starter" } }),
    })

    await executeLicenseReissue({ ...PAYLOAD, pollIntervalMs: 10, pollMaxAttempts: 3 })

    expect(updateLicenseReissue).toHaveBeenCalledWith(
      REISSUE_ID,
      expect.objectContaining({
        status:       "failed",
        failed_reason: expect.stringContaining("timed out"),
        pending_jwt:  "signed.jwt.token",
      }),
    )
  })

  it("NF-UNIT-REISSUE-05: provisioning not active → marks failed, no SSH", async () => {
    vi.mocked(findProvisioningBySlug).mockResolvedValue({ ...mockProv, status: "deprovisioned" } as never)

    await executeLicenseReissue(PAYLOAD)

    expect(sshWriteFile).not.toHaveBeenCalled()
    expect(updateLicenseReissue).toHaveBeenCalledWith(
      REISSUE_ID,
      expect.objectContaining({ status: "failed", failed_reason: expect.stringContaining("not active") }),
    )
  })

  it("NF-UNIT-REISSUE-06: provisioning not found → marks failed", async () => {
    vi.mocked(findProvisioningBySlug).mockResolvedValue(null)

    await executeLicenseReissue(PAYLOAD)

    expect(sshWriteFile).not.toHaveBeenCalled()
    expect(updateLicenseReissue).toHaveBeenCalledWith(
      REISSUE_ID,
      expect.objectContaining({ status: "failed", failed_reason: expect.stringContaining("not found") }),
    )
  })
})
