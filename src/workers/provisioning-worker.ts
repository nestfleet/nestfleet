/**
 * ProvisioningWorker — FEAT-001.
 *
 * Listens on the 'provision_vps' pg-boss queue.
 * Does NOT extend AbstractAgentWorker (no LLM involved — pure infrastructure).
 * Registers directly with pg-boss.
 *
 * Job payload: { intentId: string }
 * singletonKey: intentId — guarantees one job per signup even if Stripe retries.
 *
 * pg-boss config:
 *   teamSize: 2        — max 2 concurrent VPS provisions (Hetzner API politeness)
 *   expireInSeconds: 1800 — 30 min hard timeout (3× worst-case boot time)
 *   retryLimit: 3      — retry on crash/timeout; saga guards skip completed steps
 *   retryDelay: 60     — 1 min before retry
 */

import type { Job } from "pg-boss"
import { getBoss } from "../infra/queue/boss.js"
import { logger } from "../shared/logger.js"
import { runProvisioningSaga } from "../provisioning/provision.js"

export const PROVISION_JOB = "provision_vps"

export interface ProvisionJobPayload {
  intentId: string
}

export async function registerProvisioningWorker(): Promise<void> {
  const boss = await getBoss()

  // Create queue with retry/expiry options (pg-boss v12: queue-level config)
  await boss.createQueue(PROVISION_JOB, {
    retryLimit:      3,
    retryDelay:      60,
    expireInSeconds: 1800,   // 30 min hard timeout (3× worst-case boot time)
  })

  // pg-boss v12: WorkHandler receives Job<T>[] (batch). localConcurrency = 2 max concurrent provisions.
  await boss.work<ProvisionJobPayload>(
    PROVISION_JOB,
    { localConcurrency: 2 },
    async (jobs: Job<ProvisionJobPayload>[]) => {
      await Promise.all(jobs.map(async (job) => {
        const { intentId } = job.data

        if (!intentId) {
          logger.error({ jobId: job.id }, "ProvisioningWorker: missing intentId in payload — discarding")
          return
        }

        logger.info({ jobId: job.id, intentId }, "ProvisioningWorker: starting")

        try {
          await runProvisioningSaga(intentId)
          logger.info({ jobId: job.id, intentId }, "ProvisioningWorker: success")
        } catch (err) {
          logger.error({ err, jobId: job.id, intentId }, "ProvisioningWorker: saga failed")
          throw err   // pg-boss marks job as failed and retries per queue retryLimit
        }
      }))
    },
  )

  logger.info("ProvisioningWorker: registered")
}
