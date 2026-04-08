/**
 * License reissue worker — FEAT-012.
 *
 * Executes a license tier change for a customer VPS:
 *   1. Load provisioning row + decrypt secrets
 *   2. Sign new license JWT
 *   3. Store pending_jwt in DB (download fallback if SSH fails)
 *   4. SFTP-write JWT to /opt/nestfleet/license.jwt on the VPS
 *   5. SSH: docker compose restart api
 *   6. Poll GET /api/v1/license/status until tier matches (or timeout)
 *   7. Mark complete / failed + update provisioning license columns
 */

import type { Job } from "pg-boss"
import { getBoss } from "../infra/queue/boss.js"
import { logger } from "../shared/logger.js"
import { config, getFleetSshPrivateKey } from "../shared/config.js"
import { decryptSecret } from "../shared/crypto.js"
import {
  findProvisioningBySlug,
  updateProvisioning,
} from "../infra/db/repositories/provisionings.js"
import {
  findLicenseReissueById,
  updateLicenseReissue,
} from "../infra/db/repositories/license-reissues.js"
import { issueLicenseToken } from "../license/issuer.js"
import { sshWriteFile, sshExec } from "../fleet/ssh-exec.js"

// ── Job name + payload ────────────────────────────────────────────────────────

export const LICENSE_REISSUE_JOB = "license_reissue"

export interface LicenseReissuePayload {
  reissueId:       string
  provisioningId:  string
  slug:            string
  newTier:         "starter" | "growth" | "scale"
  newExpiresAt:    string   // ISO 8601
  /** Override poll interval in ms — for tests only. Default: 15_000. */
  pollIntervalMs?: number
  /** Override max poll attempts — for tests only. Default: 12. */
  pollMaxAttempts?: number
}

// ── Core execution (exported for unit tests) ──────────────────────────────────

export async function executeLicenseReissue(payload: LicenseReissuePayload): Promise<void> {
  const {
    reissueId,
    slug,
    newTier,
    newExpiresAt,
    pollIntervalMs  = 15_000,
    pollMaxAttempts = 12,
  } = payload

  const log = logger.child({ reissueId, slug, newTier })

  // ── Step 1: Load provisioning ──────────────────────────────────────────────
  const prov = await findProvisioningBySlug(slug)

  if (!prov) {
    log.error("LicenseReissueWorker: provisioning not found")
    await updateLicenseReissue(reissueId, {
      status:       "failed",
      failed_reason: `Provisioning not found for slug: ${slug}`,
      completed_at: new Date(),
    })
    return
  }

  if (prov.status !== "active") {
    log.warn({ status: prov.status }, "LicenseReissueWorker: provisioning not active")
    await updateLicenseReissue(reissueId, {
      status:       "failed",
      failed_reason: `Provisioning is not active (status: ${prov.status})`,
      completed_at: new Date(),
    })
    await updateProvisioning(prov.id, { reissue_status: "failed" })
    return
  }

  // ── Step 2: Decrypt secrets + sign JWT ────────────────────────────────────
  const secretsJson = decryptSecret(prov.secrets_enc!) ?? prov.secrets_enc!
  const secrets     = JSON.parse(secretsJson) as { licenseSecret: string }

  const signedJwt = issueLicenseToken({
    slug,
    plan:          newTier,
    licenseSecret: secrets.licenseSecret,
    customerEmail: prov.customer_email,
    expiresAt:     new Date(newExpiresAt),
  })

  // ── Step 3: Store pending_jwt for fallback download ───────────────────────
  await updateLicenseReissue(reissueId, { pending_jwt: signedJwt })

  // ── Step 4 + 5: SSH write + restart ───────────────────────────────────────
  const privateKey = getFleetSshPrivateKey()
  if (!privateKey) {
    log.error("LicenseReissueWorker: FLEET_SSH_PRIVATE_KEY / FLEET_SSH_PRIVATE_KEY_B64 not configured")
    await updateLicenseReissue(reissueId, {
      status:       "failed",
      failed_reason: "SSH private key not configured on this instance",
      completed_at: new Date(),
    })
    await updateProvisioning(prov.id, { reissue_status: "failed" })
    return
  }

  const sshOpts = {
    host:       prov.hetzner_server_ip!,
    username:   config.FLEET_SSH_USER,
    privateKey,
    timeoutMs:  60_000,
  }

  try {
    await sshWriteFile(sshOpts, "/opt/nestfleet/license.jwt", signedJwt)
    await sshExec(sshOpts, "docker compose -f /opt/nestfleet/docker-compose.prod.yml restart api")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err }, "LicenseReissueWorker: SSH step failed")
    await updateLicenseReissue(reissueId, {
      status:       "failed",
      failed_reason: `SSH error: ${msg}`,
      pending_jwt:  signedJwt,
      completed_at: new Date(),
    })
    await updateProvisioning(prov.id, { reissue_status: "failed" })
    return
  }

  // ── Step 6: Poll /api/v1/license/status ───────────────────────────────────
  const domain  = `${slug}.${config.CUSTOMER_BASE_DOMAIN}`
  const pollUrl = `https://${domain}/api/v1/license/tier`

  let verified = false
  for (let attempt = 0; attempt < pollMaxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }
    try {
      const res  = await fetch(pollUrl)
      const body = await res.json() as { ok: boolean; data?: { tier?: string } }
      if (body?.data?.tier === newTier) {
        verified = true
        break
      }
    } catch {
      // transient — keep polling
    }
    log.debug({ attempt: attempt + 1, pollMaxAttempts }, "LicenseReissueWorker: poll attempt")
  }

  // ── Step 7: Finalize ──────────────────────────────────────────────────────
  if (!verified) {
    log.warn("LicenseReissueWorker: poll timed out waiting for tier change")
    await updateLicenseReissue(reissueId, {
      status:       "failed",
      failed_reason: `License verification timed out after ${pollMaxAttempts} attempts`,
      pending_jwt:  signedJwt,
      completed_at: new Date(),
    })
    await updateProvisioning(prov.id, { reissue_status: "failed" })
    return
  }

  await updateLicenseReissue(reissueId, {
    status:      "complete",
    pending_jwt: null,
    completed_at: new Date(),
  })
  await updateProvisioning(prov.id, {
    license_tier:        newTier,
    license_expires_at:  new Date(newExpiresAt),
    reissue_status:      "idle",
  })

  log.info("LicenseReissueWorker: complete")
}

// ── Worker registration ───────────────────────────────────────────────────────

export async function registerLicenseReissueWorker(): Promise<void> {
  const boss = await getBoss()

  await boss.createQueue(LICENSE_REISSUE_JOB, {
    retryLimit:      0,           // operator-driven retry via UI
    expireInSeconds: 300,         // 5 min hard timeout
  })

  await boss.work<LicenseReissuePayload>(
    LICENSE_REISSUE_JOB,
    { localConcurrency: 3 },
    async (jobs: Job<LicenseReissuePayload>[]) => {
      await Promise.all(jobs.map(async (job) => {
        try {
          await executeLicenseReissue(job.data)
        } catch (err) {
          logger.error({ err, jobId: job.id }, "LicenseReissueWorker: unhandled error")
          throw err
        }
      }))
    },
  )

  logger.info("LicenseReissueWorker: registered")
}
