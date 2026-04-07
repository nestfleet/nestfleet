/**
 * GitHub webhook route — SPIKE-04 / SLICE-13.
 *
 * POST /webhooks/github/events/:productId
 *
 * Handles issues, pull_request, check_suite, deployment_status, and ping events.
 * Validates X-Hub-Signature-256 when GITHUB_WEBHOOK_SECRET is configured.
 * Returns 200 for all accepted events (GitHub expects 200 for everything it delivers).
 *
 * State mirroring:
 *   - pull_request closed + merged=true       → set merged_at + ci_status='pending', audit cr.pr_merged
 *   - check_suite completed + success         → ci_status='passed', audit cr.ci_passed
 *                                               if auto_complete_on_ci_pass: complete CR + resolve case
 *   - check_suite completed + failure/neutral → ci_status='failed', audit cr.ci_failed, notify change_lead
 *   - deployment_status success               → deploy_status='success', audit cr.deployed
 *   - deployment_status failure               → deploy_status='failed', audit cr.deploy_failed, notify
 *   - pull_request closed + merged=false      → logged only (operator decides next step)
 *   - issues closed                           → logged only (informational)
 */

import { Hono } from "hono"
import type { Context } from "hono"
import { logger } from "../../shared/logger.js"
import { config } from "../../shared/config.js"
import { validateGitHubWebhook } from "../../infra/github/webhook-validator.js"
import {
  findChangeRequestByGithubPrNumber,
  findChangeRequestByGithubIssueNumber,
  findChangeRequestByHeadSha,
  updateChangeRequest,
  createAuditEvent,
} from "../../infra/db/repositories/index.js"
import { findCaseById, touchCase } from "../../infra/db/repositories/cases.js"
import { findProductById } from "../../infra/db/repositories/products.js"
import { createNotification } from "../../infra/db/repositories/notifications.js"
import { transitionCase } from "../../domain/case-state-machine.js"
import { incrementOu } from "../../billing/ou-tracker.js"
import { getLicenseTier } from "../../license/validator.js"
import { licenseToProductTier } from "../../rbac/permission-engine.js"
import { meetsMinTier } from "../../auth/middleware.js"

// ── Event payload shapes ───────────────────────────────────────────────────────

interface GitHubIssuePayload {
  action: string
  issue: {
    number: number
    title: string
    state: string
    html_url: string
  }
  repository: {
    full_name: string
  }
}

interface GitHubPullRequestPayload {
  action: string
  pull_request: {
    number: number
    title: string
    state: string
    merged: boolean
    html_url: string
    head: {
      sha: string
    }
  }
  repository: {
    full_name: string
  }
}

interface GitHubPingPayload {
  zen: string
  hook_id: number
  repository?: {
    full_name: string
  }
}

// SLICE-13: check_suite event
interface GitHubCheckSuitePayload {
  action: string
  check_suite: {
    id: number
    conclusion: string | null  // 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required'
    head_sha: string
    head_branch: string | null
    pull_requests: Array<{
      number: number
    }>
  }
  repository: {
    full_name: string
  }
}

// SLICE-13: deployment_status event
interface GitHubDeploymentStatusPayload {
  action: string
  deployment_status: {
    state: string  // 'pending' | 'success' | 'failure' | 'error' | 'inactive'
    description: string | null
    environment: string
    target_url: string | null
    log_url: string | null
  }
  deployment: {
    id: number
    sha: string
    ref: string
    environment: string
    payload: unknown
  }
  repository: {
    full_name: string
  }
}

// ── CI config helpers ─────────────────────────────────────────────────────────

interface CiConfig {
  enabled: boolean
  github_webhook_secret?: string
  auto_complete_on_ci_pass: boolean
  track_deployments: boolean
}

function parseCiConfig(raw: Record<string, unknown>): CiConfig {
  const cfg: CiConfig = {
    enabled:                   raw["enabled"] !== false,
    auto_complete_on_ci_pass:  raw["auto_complete_on_ci_pass"] === true,
    track_deployments:         raw["track_deployments"] === true,
  }
  if (typeof raw["github_webhook_secret"] === "string") {
    cfg.github_webhook_secret = raw["github_webhook_secret"]
  }
  return cfg
}

// ── Router ────────────────────────────────────────────────────────────────────

export const githubWebhookRouter = new Hono()

githubWebhookRouter.post("/events/:productId", async (c) => {
  const productId = c.req.param("productId")
  const eventType = c.req.header("X-GitHub-Event") ?? "unknown"

  // Raw body needed for HMAC — read once up front
  const rawBody = await c.req.text()

  // ── Signature validation ─────────────────────────────────────────────────
  // Prefer the per-product secret from ci_config, fall back to global env var.
  let webhookSecret = config.GITHUB_WEBHOOK_SECRET

  // Load product ci_config for per-product secret and automation flags
  let ciConfig: CiConfig | null = null
  try {
    const product = await findProductById(productId)
    if (product) {
      ciConfig = parseCiConfig(product.ci_config ?? {})
      if (ciConfig.github_webhook_secret) {
        webhookSecret = ciConfig.github_webhook_secret
      }
    }
  } catch (err) {
    logger.warn({ err, productId }, "GitHub webhook: failed to load product ci_config (non-fatal)")
  }

  // CG-07: Reject unsigned requests — webhook secret is required
  if (!webhookSecret) {
    logger.warn({ productId, eventType }, "GitHub webhook: no webhook secret configured — rejecting unsigned request")
    return c.json({ error: "Webhook secret not configured. Set GITHUB_WEBHOOK_SECRET or configure ci_config.github_webhook_secret for this product." }, 403)
  }

  const signature = c.req.header("X-Hub-Signature-256")
  if (!signature) {
    logger.warn({ productId, eventType }, "GitHub webhook: missing X-Hub-Signature-256 header")
    return c.json({ error: "Missing signature header" }, 400)
  }

  const valid = validateGitHubWebhook(rawBody, signature, webhookSecret)
  if (!valid) {
    logger.warn({ productId, eventType }, "GitHub webhook: invalid signature")
    return c.json({ error: "Invalid webhook signature" }, 400)
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  // ── Dispatch by event type ────────────────────────────────────────────────
  return dispatchEvent(c, productId, eventType, payload, ciConfig)
})

// ── Event dispatcher ──────────────────────────────────────────────────────────

function dispatchEvent(
  c: Context,
  productId: string,
  eventType: string,
  payload: unknown,
  ciConfig: CiConfig | null,
): Response | Promise<Response> {
  switch (eventType) {
    case "ping": {
      const ping = payload as GitHubPingPayload
      logger.info(
        { productId, hookId: ping.hook_id, repo: ping.repository?.full_name, zen: ping.zen },
        "GitHub webhook: ping received",
      )
      return c.json({ ok: true }, 200)
    }

    case "issues": {
      const ev = payload as GitHubIssuePayload
      return handleIssuesEvent(c, productId, ev)
    }

    case "pull_request": {
      const ev = payload as GitHubPullRequestPayload
      return handlePullRequestEvent(c, productId, ev)
    }

    case "check_suite": {
      const ev = payload as GitHubCheckSuitePayload
      return handleCheckSuiteEvent(c, productId, ev, ciConfig)
    }

    case "deployment_status": {
      const ev = payload as GitHubDeploymentStatusPayload
      return handleDeploymentStatusEvent(c, productId, ev, ciConfig)
    }

    default: {
      // Accept but ignore — GitHub expects 200 for all delivered events
      logger.debug({ productId, eventType }, "GitHub webhook: unhandled event type — ignored")
      return c.json({ ok: true }, 200)
    }
  }
}

// ── Issues handler ────────────────────────────────────────────────────────────

async function handleIssuesEvent(
  c: Context,
  productId: string,
  ev: GitHubIssuePayload,
): Promise<Response> {
  const { action, issue, repository } = ev

  logger.info(
    {
      productId,
      repo:        repository.full_name,
      action,
      issueNumber: issue.number,
      issueTitle:  issue.title,
      issueState:  issue.state,
      issueUrl:    issue.html_url,
    },
    "GitHub webhook: issues event received",
  )

  // When a linked issue is closed, find and log the associated CR.
  // State transition is operator-driven (via console Accept & Complete), not automatic.
  if (action === "closed") {
    try {
      const cr = await findChangeRequestByGithubIssueNumber(productId, issue.number)
      if (cr) {
        logger.info(
          {
            productId,
            changeRequestId: cr.change_request_id,
            crStatus:        cr.status,
            issueNumber:     issue.number,
            repo:            repository.full_name,
          },
          "GitHub webhook: linked issue closed — operator action required in NestFleet console to complete CR",
        )
      }
    } catch (err) {
      logger.warn({ err, productId, issueNumber: issue.number }, "GitHub webhook: issue lookup failed (non-fatal)")
    }
  }

  return c.json({ ok: true }, 200)
}

// ── Pull request handler ───────────────────────────────────────────────────────

async function handlePullRequestEvent(
  c: Context,
  productId: string,
  ev: GitHubPullRequestPayload,
): Promise<Response> {
  const { action, pull_request: pr, repository } = ev

  logger.info(
    {
      productId,
      repo:     repository.full_name,
      action,
      prNumber: pr.number,
      prTitle:  pr.title,
      prState:  pr.state,
      prMerged: pr.merged,
      prUrl:    pr.html_url,
    },
    "GitHub webhook: pull_request event received",
  )

  // PR merged → record merge + auto-complete CR
  if (action === "closed" && pr.merged === true) {
    await handlePrMerged(productId, pr.number, pr.title, pr.head.sha, repository.full_name)
  } else if (action === "closed" && pr.merged === false) {
    // PR was closed without merging — log only; operator decides next step
    try {
      const cr = await findChangeRequestByGithubPrNumber(productId, pr.number)
      if (cr) {
        logger.info(
          {
            productId,
            changeRequestId: cr.change_request_id,
            crStatus:        cr.status,
            prNumber:        pr.number,
            repo:            repository.full_name,
          },
          "GitHub webhook: linked PR closed without merge — operator action required in NestFleet console",
        )
      }
    } catch (err) {
      logger.warn({ err, productId, prNumber: pr.number }, "GitHub webhook: PR lookup failed (non-fatal)")
    }
  } else if (action === "synchronize") {
    // Human pushed new commits to the PR — flag it so the console shows "PR changed"
    await handlePrSynchronized(productId, pr.number, repository.full_name)
  }

  return c.json({ ok: true }, 200)
}

// ── PR merged → set merged_at + ci_status=pending ────────────────────────────

async function handlePrMerged(
  productId: string,
  prNumber: number,
  prTitle: string,
  headSha: string,
  repo: string,
): Promise<void> {
  let cr
  try {
    cr = await findChangeRequestByGithubPrNumber(productId, prNumber)
  } catch (err) {
    logger.warn({ err, productId, prNumber }, "GitHub webhook: PR lookup failed (non-fatal)")
    return
  }

  if (!cr) {
    logger.info(
      { productId, prNumber, repo },
      "GitHub webhook: no CR linked to merged PR — skipping state mirror",
    )
    return
  }

  const changeRequestId = cr.change_request_id
  const caseId          = cr.case_id

  // Idempotency: skip if already recorded merged
  if (cr.merged_at !== null) {
    logger.info(
      { productId, changeRequestId, prNumber },
      "GitHub webhook: PR merged event already processed — skipping",
    )
    return
  }

  logger.info(
    { productId, changeRequestId, caseId, prNumber, headSha, repo },
    "GitHub webhook: PR merged — recording merge + setting ci_status=pending",
  )

  const mergedAt = new Date()

  try {
    // Preserve any existing ci_details (e.g. pr_human_edited flag) while adding merge info
    const existing = (cr.ci_details ?? {}) as Record<string, unknown>
    await updateChangeRequest(changeRequestId, {
      merged_at:  mergedAt,
      ci_status:  "pending",
      ci_details: {
        ...existing,
        head_sha:  headSha,
        pr_number: prNumber,
        repo,
        merged_at: mergedAt.toISOString(),
      },
    })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "change_request",
      entity_ref:   changeRequestId,
      actor_type:   "system",
      actor_ref:    "github-webhook",
      action:       "cr.pr_merged",
      before_state: { status: cr.status },
      after_state:  { ci_status: "pending", merged_at: mergedAt.toISOString() },
      metadata:     { caseId, trigger: "github_pr_merged", prNumber, prTitle, headSha, repo },
    })

    logger.info(
      { productId, changeRequestId, caseId, prNumber },
      "GitHub webhook: PR merge recorded — auto-completing CR",
    )
  } catch (err) {
    logger.error({ err, productId, changeRequestId, prNumber }, "GitHub webhook: PR merge record failed")
    return
  }

  // Auto-complete the CR on merge — no manual "Accept & Complete" needed.
  // Guard: only when the CR is still in pr-drafted (not already completed/rejected).
  if (cr.status !== "pr-drafted") {
    logger.info(
      { productId, changeRequestId, crStatus: cr.status },
      "GitHub webhook: PR merged — CR not in pr-drafted, skipping auto-complete",
    )
    return
  }

  try {
    await updateChangeRequest(changeRequestId, {
      status:       "completed",
      completed_at: mergedAt,
    })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "change_request",
      entity_ref:   changeRequestId,
      actor_type:   "system",
      actor_ref:    "github-webhook",
      action:       "cr.completed",
      before_state: { status: "pr-drafted" },
      after_state:  { status: "completed" },
      metadata:     { caseId, trigger: "github_pr_merged", prNumber, repo },
    })

    // BIL-03: OU event (best-effort)
    incrementOu({ productId, eventType: "cr.completed", entityRef: changeRequestId }).catch(() => {})

    // Resolve originating case if not already terminal
    try {
      const caseRow = await findCaseById(caseId)
      if (caseRow && caseRow.status !== "resolved" && caseRow.status !== "closed") {
        await transitionCase(caseId, caseRow.status, "resolved", {
          resolved_at: mergedAt,
          summary:     `PR #${prNumber} merged — auto-completed`,
        })
      } else if (caseRow) {
        await touchCase(caseId)  // bump updated_at so it surfaces as recently active
      }
    } catch (caseErr) {
      logger.warn({ caseErr, caseId, changeRequestId }, "GitHub webhook: case resolve on merge failed (non-fatal)")
    }

    logger.info(
      { productId, changeRequestId, caseId, prNumber },
      "GitHub webhook: CR auto-completed on PR merge",
    )
  } catch (err) {
    logger.error({ err, productId, changeRequestId }, "GitHub webhook: CR auto-complete on merge failed")
  }
}

// ── PR synchronize → flag human edits ─────────────────────────────────────────

async function handlePrSynchronized(
  productId: string,
  prNumber: number,
  repo: string,
): Promise<void> {
  let cr
  try {
    cr = await findChangeRequestByGithubPrNumber(productId, prNumber)
  } catch (err) {
    logger.warn({ err, productId, prNumber }, "GitHub webhook: PR synchronize lookup failed (non-fatal)")
    return
  }

  if (!cr) return  // not a NestFleet-tracked PR — ignore

  // Merge into existing ci_details so we don't clobber CI data
  const existing = (cr.ci_details ?? {}) as Record<string, unknown>
  const pushCount = typeof existing["pr_push_count"] === "number" ? existing["pr_push_count"] + 1 : 1

  try {
    await updateChangeRequest(cr.change_request_id, {
      ci_details: {
        ...existing,
        pr_human_edited:   true,
        pr_push_count:     pushCount,
        pr_last_pushed_at: new Date().toISOString(),
      },
    })

    logger.info(
      { productId, changeRequestId: cr.change_request_id, prNumber, repo, pushCount },
      "GitHub webhook: PR synchronize — human edits flagged",
    )
  } catch (err) {
    logger.warn({ err, productId, changeRequestId: cr.change_request_id }, "GitHub webhook: PR synchronize update failed (non-fatal)")
  }
}

// ── check_suite handler ────────────────────────────────────────────────────────

async function handleCheckSuiteEvent(
  c: Context,
  productId: string,
  ev: GitHubCheckSuitePayload,
  ciConfig: CiConfig | null,
): Promise<Response> {
  const { action, check_suite: suite, repository } = ev

  // We only care about completed suites
  if (action !== "completed") {
    return c.json({ ok: true }, 200)
  }

  const conclusion = suite.conclusion
  const headSha    = suite.head_sha

  logger.info(
    { productId, repo: repository.full_name, action, conclusion, headSha },
    "GitHub webhook: check_suite completed",
  )

  // Find the CR linked to this commit — try PR numbers first, then head SHA
  let cr = null

  const firstPr = suite.pull_requests[0]
  if (firstPr) {
    try {
      cr = await findChangeRequestByGithubPrNumber(productId, firstPr.number)
    } catch (err) {
      logger.warn({ err, productId, prNumber: firstPr.number }, "GitHub webhook: CR lookup by PR failed (non-fatal)")
    }
  }

  if (!cr) {
    try {
      cr = await findChangeRequestByHeadSha(productId, headSha)
    } catch (err) {
      logger.warn({ err, productId, headSha }, "GitHub webhook: CR lookup by head SHA failed (non-fatal)")
    }
  }

  if (!cr) {
    logger.info(
      { productId, headSha, repo: repository.full_name },
      "GitHub webhook: check_suite — no CR found for this commit, skipping",
    )
    return c.json({ ok: true }, 200)
  }

  const changeRequestId = cr.change_request_id
  const caseId          = cr.case_id

  if (conclusion === "success") {
    await handleCiPassed(productId, changeRequestId, caseId, headSha, repository.full_name, ciConfig)
  } else if (
    conclusion === "failure" ||
    conclusion === "timed_out" ||
    conclusion === "action_required"
  ) {
    await handleCiFailed(productId, changeRequestId, caseId, headSha, conclusion, repository.full_name)
  } else {
    // neutral, cancelled, skipped — log and ignore
    logger.info(
      { productId, changeRequestId, conclusion },
      "GitHub webhook: check_suite conclusion — no action required",
    )
  }

  return c.json({ ok: true }, 200)
}

// ── CI passed ─────────────────────────────────────────────────────────────────

async function handleCiPassed(
  productId: string,
  changeRequestId: string,
  caseId: string,
  headSha: string,
  repo: string,
  ciConfig: CiConfig | null,
): Promise<void> {
  try {
    const cr = await updateChangeRequest(changeRequestId, {
      ci_status:  "passed",
      ci_details: { head_sha: headSha, repo, conclusion: "success", recorded_at: new Date().toISOString() },
    })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "change_request",
      entity_ref:   changeRequestId,
      actor_type:   "system",
      actor_ref:    "github-webhook",
      action:       "cr.ci_passed",
      before_state: { ci_status: "pending" },
      after_state:  { ci_status: "passed" },
      metadata:     { caseId, headSha, repo },
    })

    logger.info(
      { productId, changeRequestId, caseId, headSha },
      "GitHub webhook: CI passed",
    )

    // Auto-complete CR and resolve case if enabled.
    // Category C gate (6.3.4): CI auto-complete is a Growth+ capability.
    const ciAutoCompleteAllowed = meetsMinTier(licenseToProductTier(getLicenseTier()), "growth")
    if (ciConfig?.auto_complete_on_ci_pass && ciAutoCompleteAllowed && cr && cr.status !== "completed") {
      try {
        await updateChangeRequest(changeRequestId, {
          status:       "completed",
          completed_at: new Date(),
        })

        await createAuditEvent({
          product_id:   productId,
          entity_type:  "change_request",
          entity_ref:   changeRequestId,
          actor_type:   "system",
          actor_ref:    "github-webhook",
          action:       "cr.completed",
          before_state: { status: cr.status },
          after_state:  { status: "completed" },
          metadata:     { caseId, trigger: "auto_complete_on_ci_pass", headSha, repo },
        })

        // BIL-03: record OU event (best-effort, non-blocking)
        incrementOu({ productId, eventType: "cr.completed", entityRef: changeRequestId }).catch(() => {})

        try {
          await transitionCase(caseId, null, "resolved", {
            resolved_at: new Date(),
            summary:     `CI passed — auto-completed via SLICE-13`,
          })
        } catch (caseErr) {
          logger.warn({ caseErr, caseId, changeRequestId }, "GitHub webhook: case resolve failed (non-fatal)")
        }

        logger.info(
          { productId, changeRequestId, caseId },
          "GitHub webhook: CR auto-completed after CI pass",
        )
      } catch (err) {
        logger.error({ err, productId, changeRequestId }, "GitHub webhook: CR auto-complete failed")
      }
    }
  } catch (err) {
    logger.error({ err, productId, changeRequestId }, "GitHub webhook: CI passed update failed")
  }
}

// ── CI failed ─────────────────────────────────────────────────────────────────

async function handleCiFailed(
  productId: string,
  changeRequestId: string,
  caseId: string,
  headSha: string,
  conclusion: string,
  repo: string,
): Promise<void> {
  try {
    await updateChangeRequest(changeRequestId, {
      ci_status:  "failed",
      ci_details: { head_sha: headSha, repo, conclusion, recorded_at: new Date().toISOString() },
    })

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "change_request",
      entity_ref:   changeRequestId,
      actor_type:   "system",
      actor_ref:    "github-webhook",
      action:       "cr.ci_failed",
      before_state: { ci_status: "pending" },
      after_state:  { ci_status: "failed" },
      metadata:     { caseId, headSha, repo, conclusion },
    })

    logger.warn(
      { productId, changeRequestId, caseId, headSha, conclusion },
      "GitHub webhook: CI failed — notifying change_lead",
    )

    // Notify change_lead
    await createNotification({
      product_id:    productId,
      kind:          "status_update",
      priority:      "high",
      audience_type: "change_lead",
      recipient_ref: "change_lead",
      source_type:   "change_request",
      source_ref:    changeRequestId,
      correlation_id: `ci_failed:${changeRequestId}`,
      subject:       `CI failed for change request`,
      body:          `CI checks failed (${conclusion}) for change request ${changeRequestId}. Head SHA: ${headSha}. Repo: ${repo}`,
    }).catch((err) => {
      logger.warn({ err, productId, changeRequestId }, "GitHub webhook: notification emit failed (non-fatal)")
    })
  } catch (err) {
    logger.error({ err, productId, changeRequestId }, "GitHub webhook: CI failed update failed")
  }
}

// ── deployment_status handler ─────────────────────────────────────────────────

async function handleDeploymentStatusEvent(
  c: Context,
  productId: string,
  ev: GitHubDeploymentStatusPayload,
  ciConfig: CiConfig | null,
): Promise<Response> {
  const { deployment_status: ds, deployment, repository } = ev

  // Only act if track_deployments is enabled
  if (!ciConfig?.track_deployments) {
    logger.debug(
      { productId, repo: repository.full_name, state: ds.state },
      "GitHub webhook: deployment_status — track_deployments disabled, skipping",
    )
    return c.json({ ok: true }, 200)
  }

  const sha = deployment.sha

  logger.info(
    {
      productId,
      repo:        repository.full_name,
      state:       ds.state,
      environment: ds.environment,
      sha,
    },
    "GitHub webhook: deployment_status received",
  )

  // Find CR by head SHA stored in ci_details
  let cr = null
  try {
    cr = await findChangeRequestByHeadSha(productId, sha)
  } catch (err) {
    logger.warn({ err, productId, sha }, "GitHub webhook: CR lookup by SHA failed (non-fatal)")
  }

  if (!cr) {
    logger.info(
      { productId, sha, repo: repository.full_name },
      "GitHub webhook: deployment_status — no CR found for this SHA, skipping",
    )
    return c.json({ ok: true }, 200)
  }

  const changeRequestId = cr.change_request_id
  const caseId          = cr.case_id

  if (ds.state === "success") {
    try {
      await updateChangeRequest(changeRequestId, {
        deploy_status:  "success",
        deploy_details: {
          environment: ds.environment,
          description: ds.description,
          log_url:     ds.log_url,
          target_url:  ds.target_url,
          recorded_at: new Date().toISOString(),
        },
      })

      await createAuditEvent({
        product_id:   productId,
        entity_type:  "change_request",
        entity_ref:   changeRequestId,
        actor_type:   "system",
        actor_ref:    "github-webhook",
        action:       "cr.deployed",
        before_state: { deploy_status: cr.deploy_status },
        after_state:  { deploy_status: "success" },
        metadata:     { caseId, sha, environment: ds.environment, repo: repository.full_name },
      })

      logger.info(
        { productId, changeRequestId, caseId, environment: ds.environment },
        "GitHub webhook: deployment success",
      )
    } catch (err) {
      logger.error({ err, productId, changeRequestId }, "GitHub webhook: deploy success update failed")
    }
  } else if (ds.state === "failure" || ds.state === "error") {
    try {
      await updateChangeRequest(changeRequestId, {
        deploy_status:  "failed",
        deploy_details: {
          environment: ds.environment,
          description: ds.description,
          log_url:     ds.log_url,
          recorded_at: new Date().toISOString(),
        },
      })

      await createAuditEvent({
        product_id:   productId,
        entity_type:  "change_request",
        entity_ref:   changeRequestId,
        actor_type:   "system",
        actor_ref:    "github-webhook",
        action:       "cr.deploy_failed",
        before_state: { deploy_status: cr.deploy_status },
        after_state:  { deploy_status: "failed" },
        metadata:     { caseId, sha, environment: ds.environment, state: ds.state, repo: repository.full_name },
      })

      logger.warn(
        { productId, changeRequestId, caseId, environment: ds.environment, state: ds.state },
        "GitHub webhook: deployment failed — notifying change_lead",
      )

      await createNotification({
        product_id:    productId,
        kind:          "status_update",
        priority:      "high",
        audience_type: "change_lead",
        recipient_ref: "change_lead",
        source_type:   "change_request",
        source_ref:    changeRequestId,
        correlation_id: `deploy_failed:${changeRequestId}`,
        subject:       `Deployment failed for change request`,
        body:          `Deployment to ${ds.environment} failed (${ds.state}) for change request ${changeRequestId}. ${ds.description ?? ""}`.trim(),
      }).catch((err) => {
        logger.warn({ err, productId, changeRequestId }, "GitHub webhook: deploy failure notification emit failed (non-fatal)")
      })
    } catch (err) {
      logger.error({ err, productId, changeRequestId }, "GitHub webhook: deploy failure update failed")
    }
  }

  return c.json({ ok: true }, 200)
}
