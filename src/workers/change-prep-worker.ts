/**
 * ChangePrepWorker — SLICE-03.
 *
 * Listens on the 'change_prep' queue. For each job:
 *   1. Loads change request + originating case from DB
 *   2. Transitions CR: draft → analysis
 *   3. Creates GitHub issue (if GITHUB_TOKEN + github_repo configured)
 *   4. Runs runChangePrepAgent() — gathers implementation context from product memory
 *   5. Updates CR with impact summary, risk level, scope, implementation notes, GitHub linkage
 *   6. Transitions CR: analysis → approval-pending
 *   7. Emits audit events: cr.analysis_started, cr.approval_requested
 *   8. Notifies the recommended approver lead (best-effort)
 *
 * The Change persona owns the draft → analysis → approval-pending path.
 * Approval action (human) and implementation-prep are SLICE-05+.
 */

import { AbstractAgentWorker, type WorkerExecuteContext, type WorkerExecuteResult } from "../agents/worker.js"
import { runChangePrepAgent, CHANGE_PREP_SCHEMA_VERSION } from "../agents/impl/change-prep.js"
import {
  findChangeRequestById,
  findCaseById,
  findProductById,
  createAuditEvent,
} from "../infra/db/repositories/index.js"
import { updateCase } from "../infra/db/repositories/cases.js"
import { transitionChangeRequest } from "../domain/cr-state-machine.js"
import { createGitHubClient } from "../infra/github/client.js"
import { decryptSecret } from "../shared/crypto.js"
import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"
import { NotificationService } from "../notifications/index.js"

export class ChangePrepWorker extends AbstractAgentWorker {
  readonly actionType = "change_prep" as const

  protected async execute(ctx: WorkerExecuteContext): Promise<WorkerExecuteResult> {
    const { job } = ctx
    const payload = job.data.payload ?? {}

    const changeRequestId = payload["changeRequestId"] as string | undefined
    if (!changeRequestId) {
      throw new Error("ChangePrepWorker: job missing changeRequestId in payload")
    }

    // ── 1. Load change request ────────────────────────────────────────────────
    const cr = await findChangeRequestById(changeRequestId)
    if (!cr) {
      throw new Error(`ChangePrepWorker: change request not found: ${changeRequestId}`)
    }

    const productId = cr.product_id
    const caseId    = cr.case_id

    // ── 2. Load originating case for signal context ───────────────────────────
    const caseRow = await findCaseById(caseId)
    const triageOutput = caseRow?.triage_output as Record<string, unknown> | null

    const problemStatement =
      cr.problem_statement ??
      (triageOutput?.["reasoning"] as string | undefined) ??
      caseRow?.title ??
      ""

    const signalText =
      (payload["signalText"] as string | undefined) ??
      caseRow?.title ??
      ""

    // ── 3. Transition CR: draft → analysis (via state machine guard) ──────────
    await transitionChangeRequest(changeRequestId, "draft", "analysis")

    await createAuditEvent({
      product_id:   productId,
      entity_type:  "change_request",
      entity_ref:   changeRequestId,
      actor_type:   "agent",
      actor_ref:    "change/change_prep",
      action:       "cr.analysis_started",
      before_state: { status: "draft" },
      after_state:  { status: "analysis" },
      metadata:     { caseId },
    })

    // ── 4. Run change prep agent ──────────────────────────────────────────────
    const result = await runChangePrepAgent({
      productId,
      caseId,
      changeRequestId,
      jobId: job.data.jobId,
      problemStatement,
      ...(signalText ? { signalText } : {}),
      ...(caseRow?.type ? { caseType: caseRow.type } : {}),
    })

    const out = result.output

    // ── 5. Create GitHub issue (best-effort) ──────────────────────────────────
    let githubIssueNumber: number | undefined
    let githubIssueUrl:    string | undefined

    {
      const product    = await findProductById(productId)
      // Bug 1 fix: support_policy.github_repo canonical; fall back to agent_config.githubRepoUrl
      const githubRepo = (product?.support_policy?.["github_repo"] as string | undefined)
        ?? (product?.agent_config?.["githubRepoUrl"] as string | undefined)
      // Bug 2 fix: env var → support_policy encrypted → agent_config plaintext (setup wizard)
      const githubToken = config.GITHUB_TOKEN
        ?? decryptSecret(product?.support_policy?.["github_token_enc"] as string | undefined)
        ?? (product?.agent_config?.["githubPatToken"] as string | undefined)

      if (githubToken && !githubRepo) {
        logger.warn({ changeRequestId, productId }, "GITHUB_TOKEN configured but no github_repo set — skipping issue creation. Set github_repo in Settings → CI Integration.")
      } else if (githubRepo && !githubToken) {
        logger.warn({ changeRequestId, productId }, "github_repo configured but no GitHub token available — skipping issue creation. Set a GitHub PAT in Settings → CI Integration or GITHUB_TOKEN env var.")
      }

      if (githubToken && githubRepo) {
        try {
          const gh    = createGitHubClient(githubToken)
          const issue = await gh.createIssue(
            githubRepo,
            out.githubIssueTitle,
            out.githubIssueBody,
            ["nestfleet", "change-request"],
          )
          githubIssueNumber = issue.number
          githubIssueUrl    = issue.url
          logger.info({ changeRequestId, caseId, githubRepo, issueNumber: issue.number }, "GitHub issue created")

          // Link GitHub issue back to the case so operators can navigate from a resolved case
          await updateCase(caseId, { github_issue_ref: `${githubRepo}#${issue.number}` })
        } catch (ghErr) {
          logger.warn({ ghErr, changeRequestId }, "GitHub issue creation failed (non-fatal)")
        }
      }
    }

    // ── 6. Transition CR: analysis → approval-pending (via state machine guard)
    await transitionChangeRequest(changeRequestId, "analysis", "approval-pending", {
      impact_summary:       out.impactSummary,
      risk_level:           out.riskLevel,
      proposed_scope:       out.proposedScope,
      affected_surfaces:    out.affectedSurfaces,
      implementation_notes: out.implementationNotes,
      ...(githubIssueNumber !== undefined ? { github_issue_number: githubIssueNumber } : {}),
      ...(githubIssueUrl    !== undefined ? { github_issue_url:    githubIssueUrl    } : {}),
    })

    logger.info(
      {
        changeRequestId,
        caseId,
        productId,
        riskLevel:    out.riskLevel,
        approverRole: out.recommendedApproverRole,
        confidence:   out.confidenceScore,
        githubIssueNumber,
      },
      "Change request moved to approval-pending",
    )

    // ── 7. Audit event: approval requested ───────────────────────────────────
    await createAuditEvent({
      product_id:   productId,
      entity_type:  "change_request",
      entity_ref:   changeRequestId,
      actor_type:   "agent",
      actor_ref:    "change/change_prep",
      action:       "cr.approval_requested",
      before_state: { status: "analysis" },
      after_state:  { status: "approval-pending" },
      metadata: {
        caseId,
        riskLevel:            out.riskLevel,
        recommendedApprover:  out.recommendedApproverRole,
        confidence:           out.confidenceScore,
        githubIssueNumber,
        githubIssueUrl,
        affectedSurfaces:     out.affectedSurfaces,
      },
    })

    // ── 8. Approval-requested notification (best-effort) ─────────────────────
    try {
      const product      = await findProductById(productId)
      const changeLead   = product?.lead_assignments?.["change_lead"]
      if (typeof changeLead === "string" && changeLead.includes("@")) {
        const ns = new NotificationService()
        await ns.emit({
          productId,
          kind:         "approval_request",
          priority:     out.riskLevel === "critical" || out.riskLevel === "high" ? "high" : "normal",
          audienceType: "change_lead",
          recipientRef: changeLead,
          sourceType:   "change_request",
          sourceRef:    changeRequestId,
          subject:      `Approval required — ${cr.title ?? changeRequestId}`,
          body: [
            `Change request ${changeRequestId} is pending approval for ${product?.name ?? productId}.`,
            ``,
            `Risk level:   ${out.riskLevel}`,
            `Impact:       ${out.impactSummary}`,
            `Approver:     ${out.recommendedApproverRole}`,
            ...(githubIssueUrl ? [`GitHub issue: ${githubIssueUrl}`] : []),
          ].join("\n"),
          ackRequired: true,
        })
      }
    } catch (notifyErr) {
      logger.warn({ notifyErr, changeRequestId }, "ChangePrepWorker approval notification failed (non-fatal)")
    }

    return {
      outcome:             "success",
      modelId:             result.modelId,
      inputTokens:         result.usage.inputTokens,
      outputTokens:        result.usage.outputTokens,
      durationMs:          result.durationMs,
      outputSchemaVersion: CHANGE_PREP_SCHEMA_VERSION,
      outputValid:         true,
      outputSnapshot:      result.output as unknown as Record<string, unknown>,
      otelTraceId:         result.traceId,
    }
  }
}

/** Singleton instance — registered once at startup. */
export const changePrepWorker = new ChangePrepWorker()
