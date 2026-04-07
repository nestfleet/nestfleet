/**
 * Provisioning saga — FEAT-001.
 *
 * Implements the Saga pattern for VPS provisioning. Each step writes its result
 * to the provisionings table before proceeding. On pg-boss retry after a crash,
 * completed steps are detected via DB state and skipped — the saga is fully idempotent.
 *
 * Compensation (rollback) is applied in reverse on failure:
 *   Step 4 (DNS) fails  → delete Hetzner VPS
 *   Step 3 (VPS) fails  → (nothing to undo, VPS not created)
 *   Step 5 (health) times out → do NOT delete VPS (ops investigates via SSH)
 *
 * Steps:
 *   1. Idempotency guard + mark status='provisioning'
 *   2. Generate per-customer secrets + store encrypted
 *   3. Create Hetzner VPS (skip if hetzner_server_id already set)
 *   4. Create Cloudflare DNS record (skip if cloudflare_record_id already set)
 *   5. Poll /health until ready (skip if status='active')
 *   6. Mark status='active' + send welcome email
 */

import { randomBytes } from "node:crypto"
import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"
import { encryptSecret, decryptSecret } from "../shared/crypto.js"
import { sendEmail } from "../email/sender.js"
import {
  findProvisioningByIntentId,
  findSignupIntentById,
  createProvisioning,
  updateProvisioning,
} from "../infra/db/repositories/provisionings.js"
import { createHetznerClient } from "./hetzner-client.js"
import { createCloudflareClient } from "./cloudflare-client.js"
import { generateCloudInit, type CloudInitOpts } from "./cloud-init.js"
import { pollUntilHealthy } from "./health-poller.js"

// ── Secrets ───────────────────────────────────────────────────────────────────

interface VpsSecrets {
  postgresPassword: string
  jwtSecret:        string
  encryptionKey:    string
}

function generateSecrets(): VpsSecrets {
  return {
    postgresPassword: randomBytes(32).toString("hex"),
    jwtSecret:        randomBytes(32).toString("hex"),
    encryptionKey:    randomBytes(32).toString("hex"),
  }
}

function encryptSecrets(secrets: VpsSecrets): string {
  return encryptSecret(JSON.stringify(secrets))
}

function decryptSecrets(enc: string): VpsSecrets {
  const plain = decryptSecret(enc) ?? enc
  return JSON.parse(plain) as VpsSecrets
}

// ── Ops alert ─────────────────────────────────────────────────────────────────

async function sendOpsAlert(subject: string, body: string): Promise<void> {
  const to = config.OPS_ALERT_EMAIL
  if (!to) {
    logger.warn({ subject }, "Provisioning ops alert: OPS_ALERT_EMAIL not configured — alert not sent")
    return
  }
  await sendEmail({ to, subject, text: body }).catch((err) => {
    logger.error({ err, subject }, "Provisioning ops alert: email send failed")
  })
}

// ── Main saga ─────────────────────────────────────────────────────────────────

/**
 * Run the provisioning saga for a given intent ID.
 * Throws on unrecoverable failure after marking status='failed' and alerting ops.
 * Safe to retry — all steps are idempotent via DB state guards.
 */
export async function runProvisioningSaga(intentId: string): Promise<void> {
  const hetzner   = createHetznerClient(config.HETZNER_API_TOKEN!)
  const cloudflare = createCloudflareClient(config.CLOUDFLARE_API_TOKEN!)
  const baseDomain = config.CUSTOMER_BASE_DOMAIN

  // ── Step 1: Idempotency guard + get/create provisioning row ─────────────────

  const intent = await findSignupIntentById(intentId)
  if (!intent) {
    throw new Error(`ProvisioningSaga: signup_intent not found: ${intentId}`)
  }

  let prov = await findProvisioningByIntentId(intentId)

  if (!prov) {
    prov = await createProvisioning({
      intentId,
      orgSlug:       intent.org_slug,
      customerEmail: intent.email,
      plan:          intent.plan,
    })
    logger.info({ intentId, slug: intent.org_slug }, "ProvisioningSaga: row created")
  }

  // Already active — idempotent success (Stripe webhook retry)
  if (prov.status === "active") {
    logger.info({ intentId, slug: prov.org_slug }, "ProvisioningSaga: already active, skipping")
    return
  }

  // Already deprovisioned / failed — don't re-run automatically
  if (prov.status === "deprovisioned" || prov.status === "deprovisioning") {
    throw new Error(`ProvisioningSaga: slug ${prov.org_slug} is in terminal status '${prov.status}' — manual intervention required`)
  }

  // Mark provisioning in progress
  if (prov.status === "pending" || prov.status === "failed") {
    prov = await updateProvisioning(prov.id, { status: "provisioning" })
  }

  const slug = prov.org_slug

  logger.info({ intentId, slug }, "ProvisioningSaga: starting")

  // ── Step 2: Generate + store secrets (skip if already stored) ───────────────

  let secrets: VpsSecrets
  if (prov.secrets_enc) {
    secrets = decryptSecrets(prov.secrets_enc)
    logger.info({ slug }, "ProvisioningSaga: secrets already generated, reusing")
  } else {
    secrets = generateSecrets()
    prov = await updateProvisioning(prov.id, { secrets_enc: encryptSecrets(secrets) })
    logger.info({ slug }, "ProvisioningSaga: secrets generated and stored")
  }

  // ── Step 3: Create Hetzner VPS (skip if already created) ────────────────────

  if (!prov.hetzner_server_id) {
    logger.info({ slug }, "ProvisioningSaga: creating Hetzner VPS")

    const cloudInitOpts: CloudInitOpts = {
      slug,
      baseDomain:             baseDomain,
      postgresPassword:       secrets.postgresPassword,
      jwtSecret:              secrets.jwtSecret,
      encryptionKey:          secrets.encryptionKey,
      bundledLlmApiKey:       config.BUNDLED_LLM_API_KEY ?? "",
      bundledEmbeddingApiKey: config.BUNDLED_EMBEDDING_API_KEY ?? "",
      opsPublicKey:           config.OPS_SSH_PUBLIC_KEY ?? "",
      backupS3Bucket:         config.BACKUP_S3_BUCKET,
      // Optional S3 fields: only set when the config value is defined so that
      // exactOptionalPropertyTypes is satisfied (undefined !== absent key).
      ...(config.BACKUP_S3_ENDPOINT   !== undefined && { backupS3Endpoint:   config.BACKUP_S3_ENDPOINT }),
      ...(config.BACKUP_S3_ACCESS_KEY !== undefined && { backupS3AccessKey:  config.BACKUP_S3_ACCESS_KEY }),
      ...(config.BACKUP_S3_SECRET_KEY !== undefined && { backupS3SecretKey:  config.BACKUP_S3_SECRET_KEY }),
    }

    const userData = await generateCloudInit(cloudInitOpts)

    let server: { id: number; ip: string }
    try {
      server = await hetzner.createServer({
        name:       `nestfleet-${slug}`,
        serverType: "cx21",
        image:      "ubuntu-22.04",
        location:   "nbg1",
        userData,
        firewallId: config.HETZNER_FIREWALL_ID!,
      })
    } catch (err) {
      logger.error({ err, slug }, "ProvisioningSaga: Hetzner VPS creation failed")
      await updateProvisioning(prov.id, {
        status:        "failed",
        error_message: `Hetzner VPS creation failed: ${String(err)}`,
      })
      await sendOpsAlert(
        `[NestFleet] Provisioning failed: ${slug}`,
        `VPS creation failed for ${slug} (intent: ${intentId}).\n\nError: ${String(err)}\n\nNo VPS was created. Safe to retry from owner console.`,
      )
      throw err
    }

    prov = await updateProvisioning(prov.id, {
      hetzner_server_id: server.id,
      hetzner_server_ip: server.ip,
    })
    logger.info({ slug, serverId: server.id, ip: server.ip }, "ProvisioningSaga: VPS created")
  } else {
    logger.info({ slug, serverId: prov.hetzner_server_id }, "ProvisioningSaga: VPS already created, skipping")
  }

  // ── Step 4: Create Cloudflare DNS record (skip if already created) ───────────

  if (!prov.cloudflare_record_id) {
    logger.info({ slug }, "ProvisioningSaga: creating Cloudflare DNS record")

    try {
      const record = await cloudflare.createDnsRecord(
        config.CLOUDFLARE_ZONE_ID!,
        slug,
        prov.hetzner_server_ip!,
        baseDomain,
      )
      prov = await updateProvisioning(prov.id, { cloudflare_record_id: record.id })
      logger.info({ slug, recordId: record.id }, "ProvisioningSaga: DNS record created")
    } catch (err) {
      logger.error({ err, slug }, "ProvisioningSaga: Cloudflare DNS creation failed — compensating")

      // Compensation: delete the VPS (DNS failure with VPS running = orphaned resource)
      await hetzner.deleteServer(prov.hetzner_server_id!).catch((delErr) => {
        logger.error({ delErr, slug, serverId: prov!.hetzner_server_id }, "ProvisioningSaga: VPS compensation delete failed")
      })

      await updateProvisioning(prov.id, {
        status:        "failed",
        error_message: `Cloudflare DNS failed (VPS deleted): ${String(err)}`,
      })
      await sendOpsAlert(
        `[NestFleet] Provisioning failed: ${slug}`,
        `DNS record creation failed for ${slug} (intent: ${intentId}).\n\nError: ${String(err)}\n\nVPS (ID: ${prov.hetzner_server_id}) has been deleted as compensation.\nRetry from owner console — this will create a new VPS.`,
      )
      throw err
    }
  } else {
    logger.info({ slug, recordId: prov.cloudflare_record_id }, "ProvisioningSaga: DNS record already created, skipping")
  }

  // ── Step 5: Poll /health until ready (skip if already active) ───────────────

  if (prov.status !== "active") {
    logger.info({ slug }, "ProvisioningSaga: polling health endpoint")

    const pollResult = await pollUntilHealthy({
      provisioningId: prov.id,
      slug,
      baseDomain,
    })

    if (pollResult === "timeout") {
      await updateProvisioning(prov.id, {
        status:        "failed",
        error_message: "health_timeout: VPS did not become healthy within 7.5 minutes",
      })
      await sendOpsAlert(
        `[NestFleet] Provisioning health timeout: ${slug}`,
        `VPS for ${slug} (intent: ${intentId}) did not become healthy within 7.5 minutes.\n\nVPS IP: ${prov.hetzner_server_ip}\nHetzner server ID: ${prov.hetzner_server_id}\n\nThe VPS has NOT been deleted — SSH in to investigate.\nOnce fixed, use the owner console retry action to re-check health and send the welcome email.`,
      )
      // Do not throw — job completes without error so pg-boss doesn't retry.
      // Ops uses the owner console /retry action to resume.
      return
    }

    // ── Step 6: Mark active + send welcome email ─────────────────────────────

    prov = await updateProvisioning(prov.id, {
      status:         "active",
      provisioned_at: new Date(),
    })
    logger.info({ slug }, "ProvisioningSaga: marked active")

    await sendWelcomeEmail(slug, prov.customer_email, baseDomain)
  } else {
    logger.info({ slug }, "ProvisioningSaga: already active (post-crash resume), re-sending welcome email")
    await sendWelcomeEmail(slug, prov.customer_email, baseDomain)
  }

  logger.info({ intentId, slug }, "ProvisioningSaga: complete")
}

async function sendWelcomeEmail(slug: string, email: string, baseDomain: string): Promise<void> {
  const loginUrl = `https://${slug}.${baseDomain}`
  await sendEmail({
    to:      email,
    subject: "Your NestFleet instance is ready",
    text: [
      `Your NestFleet instance is live at ${loginUrl}`,
      "",
      "Next steps:",
      "  1. Open the link above",
      "  2. Create your admin account (click 'Register')",
      "  3. Complete the setup wizard to configure your first product",
      "",
      "Documentation: https://nestfleet.dev/docs",
      "Support: support@nestfleet.dev",
    ].join("\n"),
    html: `<p>Your NestFleet instance is live at <a href="${loginUrl}">${loginUrl}</a></p>
<p><strong>Next steps:</strong></p>
<ol>
  <li>Open the link above</li>
  <li>Create your admin account (click 'Register')</li>
  <li>Complete the setup wizard to configure your first product</li>
</ol>
<p>
  <a href="https://nestfleet.dev/docs">Documentation</a> ·
  <a href="mailto:support@nestfleet.dev">Support</a>
</p>`,
  }).catch((err) => {
    // Non-fatal: VPS is up, customer can still log in. Ops will notice missing welcome email.
    logger.error({ err, slug, email }, "ProvisioningSaga: welcome email send failed (non-fatal)")
  })
}
