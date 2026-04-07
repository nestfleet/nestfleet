/**
 * PrDraftPrepWorker — SLICE-06.
 *
 * Listens on the 'pr_draft_prep' queue. For each approved change request:
 *   1. Gets changeRequestId from job payload — throws if missing
 *   2. Loads CR from DB — throws if not found
 *   3. Gets productId from CR (authoritative — never from job payload)
 *   4. Loads product to get github_repo from support_policy
 *   5. Runs runPrDraftPrepAgent() with all available context from the CR
 *   6. Creates GitHub PR draft (if GITHUB_TOKEN + githubRepo available) — non-fatal
 *   7. Updates CR: status → pr-drafted, github_pr_number/url if created,
 *      implementation_notes appended with implementationContext + diffSummary
 *   8. Updates originating case: status → resolved, resolved_at, summary = prTitle
 *   9. Emits audit events: cr.pr_drafted, case.pr_drafted
 *
 * The Change persona owns the implementation-prep → pr-drafted path.
 */

import {
  AbstractAgentWorker,
  type WorkerExecuteContext,
  type WorkerExecuteResult,
} from "../agents/worker.js"

/**
 * Generate a deterministic branch name from CR ID + title.
 * Format: fix/<slugified-title-max-50-chars>-<cr-id-suffix>
 * This avoids LLM non-determinism on retries.
 */
function deterministicBranchName(crId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)
    .replace(/-$/, "")
  const suffix = crId.slice(-8)
  return `fix/${slug}-${suffix}`
}
import { runPrDraftPrepAgent, PR_DRAFT_PREP_SCHEMA_VERSION } from "../agents/impl/pr-draft-prep.js"
import {
  findChangeRequestById,
  findCaseById,
  findProductById,
  createAuditEvent,
} from "../infra/db/repositories/index.js"
import { transitionChangeRequest } from "../domain/cr-state-machine.js"
import { transitionCase } from "../domain/case-state-machine.js"
import { createGitHubClient } from "../infra/github/client.js"
import { decryptSecret } from "../shared/crypto.js"
import { config } from "../shared/config.js"
import { logger } from "../shared/logger.js"

export class PrDraftPrepWorker extends AbstractAgentWorker {
  readonly actionType = "pr_draft_prep" as const

  protected async execute(ctx: WorkerExecuteContext): Promise<WorkerExecuteResult> {
    const { job } = ctx
    const payload = job.data.payload ?? {}

    // ── 1. Get changeRequestId from payload ───────────────────────────────────
    const changeRequestId = payload["changeRequestId"] as string | undefined
    if (!changeRequestId) {
      throw new Error("PrDraftPrepWorker: job missing changeRequestId in payload")
    }

    // ── 2. Load change request ────────────────────────────────────────────────
    const cr = await findChangeRequestById(changeRequestId)
    if (!cr) {
      throw new Error(`PrDraftPrepWorker: change request not found: ${changeRequestId}`)
    }

    // Idempotency guard: if already pr-drafted (e.g. job retried after partial success), skip
    if (cr.status === "pr-drafted") {
      logger.info({ changeRequestId }, "PrDraftPrepWorker: CR already pr-drafted, skipping")
      return { outcome: "abstain", modelId: "none", inputTokens: 0, outputTokens: 0, durationMs: 0, outputValid: true, outputSnapshot: { reason: "already_pr_drafted" } }
    }

    // ── 3. Get productId from CR (authoritative) ──────────────────────────────
    const productId = cr.product_id
    const caseId = cr.case_id

    // ── 4. Load product to get github_repo + token ───────────────────────────
    const product = await findProductById(productId)
    // Bug 1 fix: support_policy.github_repo is canonical; fall back to agent_config.githubRepoUrl
    //            (written by setup wizard before this storage split was fixed)
    const githubRepo = (product?.support_policy?.["github_repo"] as string | undefined)
      ?? (product?.agent_config?.["githubRepoUrl"] as string | undefined)
    // Bug 2 fix: resolve token from env → support_policy (encrypted) → agent_config (setup wizard plaintext)
    const githubToken = config.GITHUB_TOKEN
      ?? decryptSecret(product?.support_policy?.["github_token_enc"] as string | undefined)
      ?? (product?.agent_config?.["githubPatToken"] as string | undefined)

    // ── 5. Run pr_draft_prep agent ────────────────────────────────────────────
    const result = await runPrDraftPrepAgent({
      productId,
      caseId,
      changeRequestId,
      jobId: job.data.jobId,
      problemStatement: cr.problem_statement ?? cr.title ?? "",
      ...(cr.impact_summary !== null ? { impactSummary: cr.impact_summary } : {}),
      ...(cr.implementation_notes !== null ? { implementationNotes: cr.implementation_notes } : {}),
      ...(cr.github_issue_number !== null ? { githubIssueNumber: cr.github_issue_number } : {}),
      ...(githubRepo !== undefined ? { githubRepo } : {}),
    })

    const out = result.output

    // ── 6. Override LLM branch name with deterministic one ──────────────────
    const branchName = deterministicBranchName(changeRequestId, cr.title ?? out.prTitle)
    logger.info({ changeRequestId, branchName, llmBranch: out.branchName }, "Using deterministic branch name (LLM suggestion overridden)")

    // ── 7. Create GitHub PR draft (best-effort) ───────────────────────────────
    let githubPrNumber: number | undefined
    let githubPrUrl: string | undefined

    if (githubToken && !githubRepo) {
      logger.warn({ changeRequestId, productId }, "GITHUB_TOKEN configured but no github_repo set — skipping PR creation. Set github_repo in Settings → CI Integration.")
    } else if (githubRepo && !githubToken) {
      logger.warn({ changeRequestId, productId }, "github_repo configured but no GitHub token available — skipping PR creation. Set a GitHub PAT in Settings → CI Integration or GITHUB_TOKEN env var.")
    }

    if (githubToken && githubRepo) {
      try {
        const gh = createGitHubClient(githubToken)
        const repoInfo = await gh.getRepoInfo(githubRepo)

        // Spec file always included — provides context alongside code changes
        const specFileContent =
          `# ${out.prTitle}\n\n` +
          `## Change Summary\n${out.diffSummary}\n\n` +
          `## Implementation Context\n${out.implementationContext}\n\n` +
          `## Testing Notes\n${out.testingNotes}\n\n` +
          `## Risk Assessment\n${out.riskAssessment}`

        const specFile = { filePath: `docs/pr-spec-${changeRequestId}.md`, fileContent: specFileContent }

        if (out.fileChanges.length > 0) {
          // BEF-14: commit actual code files + spec in a single multi-file commit
          const codeFiles = out.fileChanges
            .filter((f) => f.operation !== "delete")
            .map((f) => ({ filePath: f.filePath, fileContent: f.content }))

          await gh.createBranchWithMultipleFiles(githubRepo, {
            branchName,
            baseBranch:    repoInfo.defaultBranch,
            files:         [...codeFiles, specFile],
            commitMessage: out.prTitle,
          })
        } else {
          // Fallback: no code changes generated — commit spec only
          await gh.createBranchWithCommit(githubRepo, {
            branchName,
            baseBranch:    repoInfo.defaultBranch,
            filePath:      specFile.filePath,
            fileContent:   specFile.fileContent,
            commitMessage: out.prTitle,
          })
        }

        const pr = await gh.createPullRequest(githubRepo, {
          title: out.prTitle,
          body: out.prBody,
          head: branchName,
          base: repoInfo.defaultBranch,
          draft: true,
        })
        githubPrNumber = pr.number
        githubPrUrl = pr.url
        logger.info(
          { changeRequestId, caseId, githubRepo, prNumber: pr.number },
          "GitHub PR draft created",
        )
      } catch (ghErr) {
        logger.warn({ ghErr, changeRequestId }, "GitHub PR creation failed (non-fatal)")
      }
    }

    // ── 7. Update CR ──────────────────────────────────────────────────────────
    const fileListSection = out.fileChanges.length > 0
      ? "\n\n## Files Changed\n" + out.fileChanges.map((f) => `- ${f.filePath} (${f.operation}): ${f.explanation}`).join("\n")
      : ""

    const updatedImplementationNotes = cr.implementation_notes
      ? `${cr.implementation_notes}\n\n---\n${out.implementationContext}\n\n${out.diffSummary}${fileListSection}`
      : `${out.implementationContext}\n\n${out.diffSummary}${fileListSection}`

    await transitionChangeRequest(changeRequestId, "implementation-prep", "pr-drafted", {
      implementation_notes: updatedImplementationNotes,
      ...(githubPrNumber !== undefined ? { github_pr_number: githubPrNumber } : {}),
      ...(githubPrUrl !== undefined ? { github_pr_url: githubPrUrl } : {}),
    })

    logger.info(
      {
        changeRequestId,
        caseId,
        productId,
        prTitle: out.prTitle,
        branchName,
        confidence: out.confidenceScore,
        githubPrNumber,
      },
      "Change request moved to pr-drafted",
    )

    // ── 8. Update originating case (guarded transition) ────────────────────────
    const originCase = await findCaseById(caseId)
    if (originCase && originCase.status !== "resolved") {
      await transitionCase(caseId, originCase.status, "resolved", {
        resolved_at: new Date(),
        summary: out.prTitle,
      })
    }

    // ── 9. Audit events ───────────────────────────────────────────────────────
    await createAuditEvent({
      product_id: productId,
      entity_type: "change_request",
      entity_ref: changeRequestId,
      actor_type: "agent",
      actor_ref: "change/pr_draft_prep",
      action: "cr.pr_drafted",
      before_state: { status: "implementation-prep" },
      after_state: { status: "pr-drafted" },
      metadata: {
        caseId,
        prTitle: out.prTitle,
        branchName,
        confidence: out.confidenceScore,
        githubPrNumber,
        githubPrUrl,
      },
    })

    await createAuditEvent({
      product_id: productId,
      entity_type: "case",
      entity_ref: caseId,
      actor_type: "agent",
      actor_ref: "change/pr_draft_prep",
      action: "case.pr_drafted",
      before_state: { status: "pr-drafting" },
      after_state: { status: "resolved" },
      metadata: {
        changeRequestId,
        prTitle: out.prTitle,
        githubPrNumber,
        githubPrUrl,
      },
    })

    return {
      outcome: "success",
      modelId: result.modelId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      durationMs: result.durationMs,
      outputSchemaVersion: PR_DRAFT_PREP_SCHEMA_VERSION,
      outputValid: true,
      outputSnapshot: {
        prTitle: out.prTitle,
        branchName: out.branchName,
        confidenceScore: out.confidenceScore,
        ...(githubPrUrl !== undefined ? { githubPrUrl } : {}),
      },
      otelTraceId: result.traceId,
    }
  }
}

/** Singleton instance — registered once at startup. */
export const prDraftPrepWorker = new PrDraftPrepWorker()
